"""
test_ple_model_smoke.py — integration smoke test for src/ple_model.py (Phase 2 PLE/VSN
architecture spike), independent of backend/tests/smoke_test.py (which exercises model.py and
is left untouched, per the alongside-not-replace decision in the Next-Gen Architecture
reconciliation plan).

Uses small synthetic per-task data (same N=300-ish scale as smoke_test.py's own fixtures, not
the full production processed datasets) — this is an architecture/shape/save-reload smoke test,
not a training-quality benchmark (that's scripts/benchmark_ple_vs_baseline.py's job, run
separately against real data since full-epoch eager-mode training takes real time regardless
of architecture).
"""
from __future__ import annotations

import shutil
import tempfile
from dataclasses import replace

import numpy as np
import pytest

from src import config, ple_model

rng = np.random.RandomState(0)
N = 200

# input_dim per task mirrors the real, current processed feature counts (config.py's
# TASK_CONFIGS via evaluate.make_splits, checked 21 Jul): employment=7, skills=8,
# productivity=5, skill_match=8, human_capital=11.
_TASK_SHAPES = {
    "employment": (7, "classification"),
    "skills": (8, "classification"),
    "productivity": (5, "regression"),
    "skill_match": (8, "classification"),
    "human_capital": (11, "classification"),
}


def _make_synthetic_splits(input_dim: int, task_type: str) -> dict:
    X = rng.normal(size=(N, input_dim)).astype("float32")
    if task_type == "classification":
        y = rng.randint(0, 2, size=N).astype("float32")
    else:
        y = rng.normal(size=N).astype("float32")
    n_val = 40
    n_test = 40
    return {
        "X_train": X[: N - n_val - n_test],
        "y_train": y[: N - n_val - n_test],
        "X_val": X[N - n_val - n_test: N - n_test],
        "y_val": y[N - n_val - n_test: N - n_test],
        "X_test": X[N - n_test:],
        "y_test": y[N - n_test:],
    }


@pytest.fixture(scope="module")
def fitted_trainer():
    input_dims = {name: dims[0] for name, dims in _TASK_SHAPES.items()}
    task_types = {name: dims[1] for name, dims in _TASK_SHAPES.items()}
    data = {name: _make_synthetic_splits(*dims) for name, dims in _TASK_SHAPES.items()}

    fast_cfg = replace(config.PLE_MODEL_CONFIG, epochs=2, patience=2, lr_patience=1, batch_size=32)
    trainer = ple_model.PLEMultiTaskTrainer(input_dims=input_dims, task_types=task_types, cfg=fast_cfg)
    trainer.fit(data, mlflow_run=None, verbose=False)
    return trainer, data


def test_all_task_heads_trained(fitted_trainer):
    trainer, _ = fitted_trainer
    assert set(trainer.task_models.keys()) == set(_TASK_SHAPES.keys())


@pytest.mark.parametrize("task_name", list(_TASK_SHAPES.keys()))
def test_predict_produces_correct_shape(fitted_trainer, task_name):
    trainer, data = fitted_trainer
    y_pred = trainer.predict(task_name, data[task_name]["X_test"])
    assert y_pred.shape[0] == len(data[task_name]["X_test"])


def test_save_and_reload_roundtrip_matches_predictions(fitted_trainer):
    trainer, data = fitted_trainer
    tmp_dir = tempfile.mkdtemp(prefix="ple_model_test_")
    try:
        trainer.save(tmp_dir)
        for name in _TASK_SHAPES:
            reloaded = ple_model.PLEMultiTaskTrainer.load_task_model(name, tmp_dir)
            X_test = data[name]["X_test"]
            original_pred = trainer.predict(name, X_test)
            reloaded_pred = reloaded(X_test, training=False).numpy().squeeze()
            np.testing.assert_allclose(original_pred, reloaded_pred, rtol=1e-5, atol=1e-5)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
