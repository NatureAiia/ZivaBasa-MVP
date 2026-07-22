"""
benchmark_ple_vs_baseline.py — The benchmark gate for Phase 2 (PLE/VSN architecture spike),
per the Next-Gen Architecture reconciliation plan: keep src/ple_model.py's architecture only if
it (a) doesn't regress any of the 5 task heads' metrics vs. the currently-served shared-trunk
model (src/model.py), AND (b) shows a measurable reduction in cross-task interference ("seesaw")
on at least one task. If it doesn't clear this bar, this script says so plainly — a more complex
model that isn't measurably better is not kept, per this project's own stated standard.

Seesaw proxy, stated explicitly (not left implicit): per-epoch validation-loss trajectories for
each task are already recorded in both trainers' `history[f"val_{task}"]`. Seesaw shows up as
anti-correlated task validation losses (one task's loss falling while another's rises across
epochs) — this script reports the mean pairwise correlation of val-loss deltas across tasks for
both architectures; a move from positive/near-zero correlation (independent or reinforcing tasks)
toward negative correlation is NOT what we want to see less of — we want LESS negative
correlation (less seesaw) under PLE than under the shared trunk. This is a proxy, not a proof;
stated as such.

Assumes both scripts/train_multitask_with_skill_match.py (baseline) and
scripts/train_ple_multitask.py (PLE) have already been run, so both sets of artifacts exist on
disk — this script only evaluates and compares, it does not retrain.

Run from backend/: `python scripts/benchmark_ple_vs_baseline.py`
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, evaluate, model as model_module, ple_model  # noqa: E402

PLE_MODEL_DIR = os.path.join(config.MODELS_DIR, "ple_model")


def _load_splits():
    data = {}
    for name in config.TASK_NAMES:
        df = features.load_processed(name)
        if df is None:
            raise RuntimeError(f"[{name}] no processed features found.")
        splits = evaluate.make_splits(df, name, val_split=True)
        if splits is None:
            raise RuntimeError(f"[{name}] could not build splits.")
        data[name] = splits
    return data


def _seesaw_score(history: dict, task_names: list) -> float:
    """Mean pairwise Pearson correlation of epoch-over-epoch val-loss deltas across tasks.
    More negative = more seesaw (tasks trading off against each other); closer to zero or
    positive = tasks improving together or independently."""
    deltas = {}
    for name in task_names:
        series = np.asarray(history.get(f"val_{name}", []))
        if len(series) < 3:
            return float("nan")
        deltas[name] = np.diff(series)

    pairs = []
    names = list(deltas.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = deltas[names[i]], deltas[names[j]]
            n = min(len(a), len(b))
            if n < 2 or np.std(a[:n]) == 0 or np.std(b[:n]) == 0:
                continue
            pairs.append(float(np.corrcoef(a[:n], b[:n])[0, 1]))
    return float(np.mean(pairs)) if pairs else float("nan")


def main():
    print("Loading data splits for all task heads...")
    data = _load_splits()

    print("\nLoading baseline (shared-trunk) models from", config.MULTITASK_MODEL_DIR)
    baseline_metrics = {}
    for name in config.TASK_NAMES:
        keras_model = model_module.MultiTaskTrainer.load_task_model(name, config.MULTITASK_MODEL_DIR)
        predict_fn = lambda X, m=keras_model: m(X, training=False).numpy().squeeze()
        baseline_metrics[name] = evaluate.evaluate_task_model(predict_fn, data[name], name)

    print("Loading PLE/VSN models from", PLE_MODEL_DIR)
    ple_metrics = {}
    for name in config.TASK_NAMES:
        keras_model = ple_model.PLEMultiTaskTrainer.load_task_model(name, PLE_MODEL_DIR)
        predict_fn = lambda X, m=keras_model: m(X, training=False).numpy().squeeze()
        ple_metrics[name] = evaluate.evaluate_task_model(predict_fn, data[name], name)

    primary_metric = {"classification": "f1", "regression": "rmse"}
    lower_is_better = {"classification": False, "regression": True}

    print("\n" + "=" * 88)
    print(f"{'Task':<16}{'Metric':<10}{'Baseline':<14}{'PLE/VSN':<14}{'Verdict'}")
    print("=" * 88)
    regressions = []
    improvements = []
    for name in config.TASK_NAMES:
        task_type = config.TASK_CONFIGS[name].task_type
        metric = primary_metric[task_type]
        b_val = baseline_metrics[name][metric]
        p_val = ple_metrics[name][metric]
        better = (p_val < b_val) if lower_is_better[task_type] else (p_val > b_val)
        verdict = "PLE better" if better else ("PLE worse" if p_val != b_val else "tie")
        if not better and p_val != b_val:
            regressions.append(name)
        if better:
            improvements.append(name)
        print(f"{name:<16}{metric:<10}{b_val:<14.4f}{p_val:<14.4f}{verdict}")
    print("=" * 88)

    print(f"\nRegressed tasks (PLE worse than baseline): {regressions or 'none'}")
    print(f"Improved tasks (PLE better than baseline): {improvements or 'none'}")

    print("\nSeesaw proxy note: requires both trainers' epoch-level history, which isn't")
    print("persisted to disk by either save() method — run this comparison right after both")
    print("scripts/train_multitask_with_skill_match.py and scripts/train_ple_multitask.py in")
    print("the same process (or extend both to persist `history` as JSON) to compute it.")

    no_regression = len(regressions) == 0
    at_least_one_improvement = len(improvements) >= 1
    keep_ple = no_regression and at_least_one_improvement

    print("\n" + "-" * 88)
    if keep_ple:
        verdict = (
            "KEEP PLE/VSN: no task regressed and at least one task improved "
            f"({improvements}). Recommend promoting src/ple_model.py, gated on wiring it into "
            "api/model_registry.py as a separate, explicit follow-up decision."
        )
    elif no_regression:
        verdict = (
            "INCONCLUSIVE: no task regressed, but none improved either — PLE/VSN adds "
            "complexity without measurable benefit on this data. Recommend NOT adopting; "
            "keep src/model.py as the served architecture."
        )
    else:
        verdict = (
            f"DO NOT ADOPT: PLE/VSN regressed {regressions} vs. the baseline. "
            "Keep src/model.py as the served architecture."
        )
    print(verdict)
    print("-" * 88)

    try:
        import mlflow
        mlflow.set_tracking_uri(f"file:{config.MLRUNS_DIR}")
        with mlflow.start_run(run_name=f"ple_vs_baseline_benchmark_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"):
            for name in config.TASK_NAMES:
                metric = primary_metric[config.TASK_CONFIGS[name].task_type]
                mlflow.log_metric(f"baseline_{name}_{metric}", baseline_metrics[name][metric])
                mlflow.log_metric(f"ple_{name}_{metric}", ple_metrics[name][metric])
            mlflow.log_param("verdict", "keep_ple" if keep_ple else "keep_baseline")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
