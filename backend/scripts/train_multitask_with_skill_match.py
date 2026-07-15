"""
train_multitask_with_skill_match.py — Retrains the shared-trunk multi-task network with
skill_match as a true 4th head, per the chosen integration approach (tighter integration,
accepted cost: this reshapes the shared trunk's gradient signal, so employment/skills/
productivity are retrained too, not just skill_match added standalone).

Mirrors 04_multitask_neural_network.ipynb's pattern exactly (see src/model.py's own
docstring example) — this script is the non-notebook equivalent for CI/reproducibility, and
should be reflected back into that notebook by hand afterward so the two don't drift.

Run from backend/: `python scripts/train_multitask_with_skill_match.py`
"""
from __future__ import annotations

import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, evaluate, model as model_module  # noqa: E402


def _resolve_model_config() -> config.ModelConfig:
    """Production default is config.MODEL_CONFIG (epochs=100, patience=10) — left untouched.
    Set ZIVABASA_FAST_TRAIN=1 for a quick demo/CI run with fewer epochs and larger batches;
    this does not change what ships in config.py."""
    if os.environ.get("ZIVABASA_FAST_TRAIN") == "1":
        return replace(config.MODEL_CONFIG, epochs=25, patience=6, lr_patience=3, batch_size=64)
    return config.MODEL_CONFIG


def main():
    task_names = config.TASK_NAMES  # now ["employment", "skills", "productivity", "skill_match"]
    print(f"Training tasks: {task_names}")

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

    model_cfg = _resolve_model_config()
    print(f"ModelConfig: epochs={model_cfg.epochs} patience={model_cfg.patience} "
          f"batch_size={model_cfg.batch_size}")
    trainer = model_module.MultiTaskTrainer(input_dims=input_dims, task_types=task_types, cfg=model_cfg)
    trainer.fit(data, mlflow_run=None, verbose=True)

    paths = trainer.save(config.MULTITASK_MODEL_DIR)
    print("Saved models:")
    for name, path in paths.items():
        print(f"  [{name}] -> {path}")

    # Quick post-train sanity check per task (mirrors 06_sanity_check.ipynb's intent) —
    # cheap enough to run inline, catches a degenerate/near-constant head immediately rather
    # than only discovering it later via the API.
    print("\nPost-train test-set sanity check:")
    for name in task_names:
        splits = data[name]
        y_pred = trainer.predict(name, splits["X_test"])
        metrics = evaluate.evaluate_task_model(lambda X: trainer.predict(name, X), splits, name)
        pred_std = float(y_pred.std())
        print(f"  [{name}] pred_std={pred_std:.4f} {'(!! near-constant output)' if pred_std < 1e-3 else ''} "
              f"metrics={metrics}")


if __name__ == "__main__":
    main()
