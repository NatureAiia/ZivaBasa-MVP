"""
retrain_worker.py — runs entirely inside one isolated project root (set via
ZIVABASA_PROJECT_ROOT before this is invoked, always as a subprocess — see
retrain_and_promote.py). Rebuilds features from data/raw, trains the multi-task model,
evaluates it, and writes metrics.json + drift baselines into that root's models/ dir.

Never called directly against the live project root — always against a candidate copy, so a
bad run can't touch what's actually being served. See retrain_and_promote.py's docstring for
the full promotion flow and why this is a separate subprocess rather than a function call.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, evaluate, model as model_module, drift  # noqa: E402


def main():
    task_names = config.TASK_NAMES
    print(f"[retrain_worker] project root: {config.PROJECT_ROOT}")
    print(f"[retrain_worker] rebuilding features for: {task_names}")
    features.run_all_pipelines(save=True)

    data, input_dims, task_types = {}, {}, {}
    for name in task_names:
        df = features.load_processed(name)
        if df is None:
            raise RuntimeError(f"[{name}] feature pipeline produced no output — check raw data.")
        splits = evaluate.make_splits(df, name, val_split=True)
        if splits is None:
            raise RuntimeError(f"[{name}] could not build train/val/test splits.")
        data[name] = splits
        input_dims[name] = splits["input_dim"]
        task_types[name] = config.TASK_CONFIGS[name].task_type

    trainer = model_module.MultiTaskTrainer(input_dims=input_dims, task_types=task_types, cfg=config.MODEL_CONFIG)
    trainer.fit(data, mlflow_run=None, verbose=True)
    trainer.save(config.MULTITASK_MODEL_DIR)

    metrics = {}
    for name in task_names:
        splits = data[name]
        metrics[name] = evaluate.evaluate_task_model(lambda X, n=name: trainer.predict(n, X), splits, name)
        print(f"[retrain_worker] [{name}] metrics={metrics[name]}")

        # Drift baseline for THIS candidate's training data (already standardized — see
        # src/drift.py's "UNITS" note) — becomes the new reference every promoted run leaves
        # behind, so the next retrain's drift report is always "vs. what's actually live," not
        # a stale snapshot from months ago.
        baseline = drift.build_baseline(splits["X_train"], splits["feature_names"])
        baseline_path = os.path.join(config.MODELS_DIR, "drift_baselines", f"{name}_baseline.json")
        drift.save_baseline(baseline, baseline_path)

    metrics_path = os.path.join(config.MODELS_DIR, "metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[retrain_worker] wrote {metrics_path}")


if __name__ == "__main__":
    main()
