"""
train_ple_multitask.py — Trains the PLE/VSN architecture spike (src/ple_model.py) across all
5 task heads, mirroring scripts/train_multitask_with_skill_match.py's structure exactly so the
two are directly comparable via scripts/benchmark_ple_vs_baseline.py.

Saves to models/ple_model/ (NOT models/multitask_model/) — this never overwrites or competes
with the currently-served baseline artifacts. Nothing in api/model_registry.py reads from this
directory; wiring it into serving is a separate, later decision gated on the benchmark result.

Run from backend/: `python scripts/train_ple_multitask.py`
"""
from __future__ import annotations

import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, evaluate, ple_model  # noqa: E402

PLE_MODEL_DIR = os.path.join(config.MODELS_DIR, "ple_model")


def _resolve_ple_config() -> config.PLEModelConfig:
    """Same fast-train escape hatch as train_multitask_with_skill_match.py's
    _resolve_model_config() — production default (config.PLE_MODEL_CONFIG) is untouched."""
    if os.environ.get("ZIVABASA_FAST_TRAIN") == "1":
        return replace(config.PLE_MODEL_CONFIG, epochs=25, patience=6, lr_patience=3, batch_size=64)
    return config.PLE_MODEL_CONFIG


def main():
    task_names = config.TASK_NAMES
    print(f"Training tasks (PLE/VSN architecture): {task_names}")

    data = {}
    input_dims = {}
    task_types = {}

    for name in task_names:
        df = features.load_processed(name)
        if df is None:
            raise RuntimeError(f"[{name}] no processed features found — run features.run_pipeline first.")
        splits = evaluate.make_splits(df, name, val_split=True)
        if splits is None:
            raise RuntimeError(f"[{name}] could not build train/val/test splits.")
        data[name] = splits
        input_dims[name] = splits["input_dim"]
        task_types[name] = config.TASK_CONFIGS[name].task_type
        print(f"  [{name}] input_dim={splits['input_dim']} task_type={task_types[name]} "
              f"train={len(splits['X_train'])} val={len(splits['X_val'])} test={len(splits['X_test'])}")

    ple_cfg = _resolve_ple_config()
    print(f"PLEModelConfig: epochs={ple_cfg.epochs} patience={ple_cfg.patience} "
          f"expert_dim={ple_cfg.expert_dim} num_shared_experts={ple_cfg.num_shared_experts} "
          f"num_task_experts={ple_cfg.num_task_experts}")

    mlflow_run = None
    try:
        import mlflow
        mlflow.set_tracking_uri(f"file:{config.MLRUNS_DIR}")
        mlflow_run = mlflow.start_run(run_name="ple_vsn_v1")
        mlflow.log_params({
            "architecture": "ple_vsn",
            "expert_dim": ple_cfg.expert_dim,
            "num_shared_experts": ple_cfg.num_shared_experts,
            "num_task_experts": ple_cfg.num_task_experts,
            "epochs": ple_cfg.epochs,
            "batch_size": ple_cfg.batch_size,
        })
    except ImportError:
        print("mlflow not installed — training without run logging.")

    trainer = ple_model.PLEMultiTaskTrainer(input_dims=input_dims, task_types=task_types, cfg=ple_cfg)
    trainer.fit(data, mlflow_run=mlflow_run, verbose=True)

    paths = trainer.save(PLE_MODEL_DIR)
    print("Saved PLE models:")
    for name, path in paths.items():
        print(f"  [{name}] -> {path}")

    print("\nPost-train test-set sanity check:")
    for name in task_names:
        splits = data[name]
        y_pred = trainer.predict(name, splits["X_test"])
        metrics = evaluate.evaluate_task_model(lambda X, n=name: trainer.predict(n, X), splits, name)
        pred_std = float(y_pred.std())
        print(f"  [{name}] pred_std={pred_std:.4f} {'(!! near-constant output)' if pred_std < 1e-3 else ''} "
              f"metrics={metrics}")

    if mlflow_run is not None:
        import mlflow
        mlflow.end_run()
        print(f"\nMLflow run ID: {mlflow_run.info.run_id}")


if __name__ == "__main__":
    main()
