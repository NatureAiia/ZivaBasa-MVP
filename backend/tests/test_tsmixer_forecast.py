"""
test_tsmixer_forecast.py — integration smoke test for src/tsmixer_forecast.py (TSMixer
forecasting spike), independent of backend/tests/test_forecast.py (which exercises the shipped
LSTM/GRU forecaster via the live API and is left untouched, per the alongside-not-replace
decision documented in tsmixer_forecast.py's module docstring).

Uses a small synthetic (industry, year) panel, not the real 7-year x 8-industry one — this is
an architecture/shape/save-reload smoke test, not a training-quality benchmark (that's
scripts/benchmark_tsmixer_vs_lstm.py's job, run separately against the real panel).
"""
from __future__ import annotations

import shutil
import tempfile
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from src import config, forecast, tsmixer_forecast

rng = np.random.RandomState(0)

# 4 industries x 6 years (2 more than window_size=3, so at least a few windows per industry) —
# same shape family as the real ai_job_replacement_2020_2026_v2.csv-derived panel, just smaller.
_INDUSTRIES = ["Banking", "Retail", "Technology", "Manufacturing"]
_YEARS = list(range(2020, 2026))
_METRICS = config.FORECAST_CONFIG.metrics


def _make_synthetic_panel() -> pd.DataFrame:
    rows = []
    for industry in _INDUSTRIES:
        base = rng.uniform(0.2, 0.8, size=len(_METRICS))
        for i, year in enumerate(_YEARS):
            rows.append({
                "industry": industry,
                "year": year,
                **{m: float(base[j] + 0.02 * i + rng.normal(0, 0.01)) for j, m in enumerate(_METRICS)},
            })
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def synthetic_panel():
    return _make_synthetic_panel()


@pytest.fixture(scope="module")
def fast_cfg():
    return replace(config.TSMIXER_CONFIG, epochs=2, patience=2, batch_size=8)


def test_build_model_output_shape():
    cfg = replace(config.TSMIXER_CONFIG)
    model = tsmixer_forecast.build_tsmixer_forecast_model(
        n_industries=len(_INDUSTRIES), window_size=cfg.window_size, n_metrics=len(_METRICS), cfg=cfg,
    )
    batch = 5
    seq_input = rng.normal(size=(batch, cfg.window_size, len(_METRICS))).astype("float32")
    industry_input = rng.randint(0, len(_INDUSTRIES), size=(batch, 1)).astype("int32")
    out = model([seq_input, industry_input], training=False).numpy()
    assert out.shape == (batch, len(_METRICS))


def test_train_produces_history_and_val_mae(synthetic_panel, fast_cfg):
    bundle = tsmixer_forecast.train(synthetic_panel, cfg=fast_cfg)
    assert len(bundle["fit_history"]["loss"]) > 0
    assert set(bundle["val_mae_raw"].keys()) == set(_METRICS)
    assert all(np.isfinite(v) for v in bundle["val_mae_raw"].values())


def test_save_and_reload_roundtrip_matches_predictions(synthetic_panel, fast_cfg):
    bundle = tsmixer_forecast.train(synthetic_panel, cfg=fast_cfg)
    tmp_dir = tempfile.mkdtemp(prefix="tsmixer_forecast_test_")
    try:
        tsmixer_forecast.save(bundle, directory=tmp_dir)
        reloaded = tsmixer_forecast.load(directory=tmp_dir)

        data = forecast.make_windows(synthetic_panel, window_size=fast_cfg.window_size)
        X_sample = data["X"][:5]
        id_sample = data["industry_ids"][:5].reshape(-1, 1)

        original_pred = bundle["model"]([X_sample, id_sample], training=False).numpy()
        reloaded_pred = reloaded["model"]([X_sample, id_sample], training=False).numpy()
        np.testing.assert_allclose(original_pred, reloaded_pred, rtol=1e-5, atol=1e-5)
        assert reloaded["industries"] == bundle["industries"]
        assert reloaded["metrics"] == bundle["metrics"]
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
