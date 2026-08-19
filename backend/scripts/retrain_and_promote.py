"""
retrain_and_promote.py — scheduled retraining with a quality gate, for the ZivaBasa 4-task
pipeline (employment/skills/productivity/skill_match).

WHAT THIS ACTUALLY DOES, HONESTLY: this MVP has no live production data feed — the "raw" data
is a fixed set of Kaggle/synthetic CSVs checked into data/raw/. So "scheduled retraining" here
means: re-run the full feature + training pipeline against whatever is currently in data/raw/
(so if you *do* refresh those files — a new Kaggle export, real bank data later — this is the
mechanism that picks it up), on a schedule (see .github/workflows/scheduled-retrain.yml),
gated so a worse model never silently replaces a better one already live. This is NOT
continuous learning from live traffic; nothing here claims that.

SAFETY DESIGN — why a subprocess and a candidate directory, not just "retrain in place":
Training writes directly into config.MODELS_DIR / config.PROCESSED_DIR as a side effect
(scale_numeric() saves the scaler as it fits it, trainer.save() writes model weights) — there
is no in-memory-only training mode in this codebase. Retraining in place would mean the live,
currently-serving models are being overwritten *while still serving requests*, before anyone
has checked whether the new model is actually better. Instead:
  1. Copy data/raw/ into an isolated candidate project root.
  2. Run retrain_worker.py as a SEPARATE PROCESS with ZIVABASA_PROJECT_ROOT pointed at that
     candidate root (config.py resolves every path from that env var at import time) — so the
     candidate run cannot touch the live models/scalers no matter what it does.
  3. Compare the candidate's metrics.json against the live models/metrics.json.
  4. Only if every task clears its regression-tolerance gate: back up the live models/ dir,
     then move (not copy) the candidate's models/ and data/processed/ into place. Atomic-ish —
     a filesystem move, not a slow per-file overwrite the API could read mid-write.
  5. Otherwise: leave the live model exactly as it was, exit non-zero (fails a CI job loudly
     instead of silently shipping a regression).

Run from backend/: `python scripts/retrain_and_promote.py`
Env: ZIVABASA_FAST_TRAIN=1 for a quick CI/demo run (fewer epochs) — see the worker's use of
config.MODEL_CONFIG; for a real scheduled run, leave unset to use the full production config.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from src import config  # noqa: E402  (live project root — default, no env var override here)

PRIMARY_METRIC = {"classification": "roc_auc", "regression": "r2"}
# Absolute drop tolerated before a task blocks promotion — deliberately conservative (0.02) so
# small run-to-run variance from a different random split doesn't block a real improvement,
# but a genuinely worse model still gets caught.
REGRESSION_TOLERANCE = 0.02


def _run_worker(candidate_root: str) -> None:
    env = os.environ.copy()
    env["ZIVABASA_PROJECT_ROOT"] = candidate_root
    worker = os.path.join(BACKEND_DIR, "scripts", "retrain_worker.py")
    result = subprocess.run([sys.executable, worker], env=env, cwd=BACKEND_DIR)
    if result.returncode != 0:
        raise RuntimeError(f"retrain_worker.py failed (exit {result.returncode}) — see output above.")


def _load_metrics(models_dir: str) -> dict:
    path = os.path.join(models_dir, "metrics.json")
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def _gate(old_metrics: dict, new_metrics: dict) -> tuple[bool, list[str]]:
    """Returns (should_promote, reasons). No old_metrics at all (first-ever run) -> promote
    automatically, there's nothing to regress against."""
    if not old_metrics:
        return True, ["no existing production metrics — first run, promoting unconditionally"]

    reasons = []
    ok = True
    for task_name, cfg in config.TASK_CONFIGS.items():
        metric_key = PRIMARY_METRIC[cfg.task_type]
        old_val = old_metrics.get(task_name, {}).get(metric_key)
        new_val = new_metrics.get(task_name, {}).get(metric_key)
        if old_val is None or new_val is None:
            reasons.append(f"[{task_name}] missing '{metric_key}' in old or new metrics — treating as a gate failure, not skipping silently.")
            ok = False
            continue
        delta = new_val - old_val
        verdict = "OK" if delta >= -REGRESSION_TOLERANCE else "REGRESSION"
        reasons.append(f"[{task_name}] {metric_key}: {old_val:.4f} -> {new_val:.4f} ({delta:+.4f}) [{verdict}]")
        if verdict == "REGRESSION":
            ok = False
    return ok, reasons


def main():
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    candidate_root = os.path.join(config.PROJECT_ROOT, ".retrain_candidate")
    if os.path.exists(candidate_root):
        shutil.rmtree(candidate_root)
    os.makedirs(candidate_root)

    print(f"[retrain_and_promote] candidate root: {candidate_root}")
    shutil.copytree(config.RAW_DIR, os.path.join(candidate_root, "data", "raw"))

    print("[retrain_and_promote] running candidate training in an isolated subprocess...")
    _run_worker(candidate_root)

    candidate_models_dir = os.path.join(candidate_root, "models")
    new_metrics = _load_metrics(candidate_models_dir)
    old_metrics = _load_metrics(config.MODELS_DIR)

    should_promote, reasons = _gate(old_metrics, new_metrics)
    print("[retrain_and_promote] gate results:")
    for r in reasons:
        print(f"  {r}")

    report = {
        "timestamp": timestamp,
        "promoted": should_promote,
        "gate_reasons": reasons,
        "old_metrics": old_metrics,
        "new_metrics": new_metrics,
    }

    if should_promote:
        backup_dir = os.path.join(config.PROJECT_ROOT, f"models_backup_{timestamp}")
        if os.path.exists(config.MODELS_DIR):
            print(f"[retrain_and_promote] backing up live models/ -> {os.path.basename(backup_dir)}")
            shutil.move(config.MODELS_DIR, backup_dir)
        if os.path.exists(config.PROCESSED_DIR):
            shutil.rmtree(config.PROCESSED_DIR)

        shutil.move(os.path.join(candidate_root, "models"), config.MODELS_DIR)
        shutil.move(os.path.join(candidate_root, "data", "processed"), config.PROCESSED_DIR)
        print("[retrain_and_promote] PROMOTED — new models are now live. Restart the API to load them.")

        # Keep only the most recent backup — this is a rollback safety net, not a full model
        # registry; unbounded backups would just fill the disk on every scheduled run.
        for entry in os.listdir(config.PROJECT_ROOT):
            full = os.path.join(config.PROJECT_ROOT, entry)
            if entry.startswith("models_backup_") and full != backup_dir and os.path.isdir(full):
                shutil.rmtree(full)
    else:
        print("[retrain_and_promote] NOT PROMOTED — live models are unchanged. See gate_reasons above.")

    shutil.rmtree(candidate_root, ignore_errors=True)

    reports_dir = os.path.join(config.MODELS_DIR, "retrain_reports")
    os.makedirs(reports_dir, exist_ok=True)
    report_path = os.path.join(reports_dir, f"{timestamp}.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[retrain_and_promote] report written -> {report_path}")

    if not should_promote:
        sys.exit(1)  # non-zero so a CI cron job actually shows red, not a quiet no-op


if __name__ == "__main__":
    main()
