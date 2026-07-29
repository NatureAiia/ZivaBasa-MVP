"""
benchmark_tsmixer_vs_lstm.py — The benchmark gate for the TSMixer forecasting spike
(src/tsmixer_forecast.py), same role scripts/benchmark_ple_vs_baseline.py plays for the
PLE/VSN spike: keep TSMixer only if it doesn't regress the shipped LSTM/GRU forecaster
(src/forecast.py) on the same panel/windows. A more complex model that isn't measurably
better than what's already served is not adopted, per this project's own standard.

Methodology note (this is the second version of this script, not the first): the original
version compared both architectures on a single random 80/20 train/val split of the panel's
32 total training windows — a ~6-point validation set. That's too small to trust: re-running
the *same* LSTM architecture with different random seeds swung its val MAE by 2-4x on
identical code, pure seed noise. At N=32, leave-one-out cross-validation (hold out one window,
train on the other 31, predict it, repeat for all 32) is the only methodology that gives a
trustworthy per-metric comparison, and it's cheap enough here to just do — this is what
justified shrinking config.TSMIXER_CONFIG's default hidden_dim/num_blocks (see that class's
docstring for the full before/after numbers).

Run from backend/: `python scripts/benchmark_tsmixer_vs_lstm.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import tensorflow as tf

from src import config, forecast, tsmixer_forecast  # noqa: E402


def _loocv_mae(build_fn, cfg, X, y, industry_ids, n_industries, n_metrics, scaler, seed=None) -> np.ndarray:
    """Trains a fresh model per held-out example (no early-stopping val split within a fold —
    at N=31 training examples per fold there's nothing to spare for one — early-stopping
    instead monitors training loss, same tradeoff forecast.py's own docstring already accepts
    for this panel's small-N regime). Returns per-metric MAE averaged over all N folds."""
    seed = seed if seed is not None else config.RANDOM_STATE
    n = len(X)
    errors = np.zeros((n, n_metrics))

    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False

        tf.random.set_seed(seed)
        np.random.seed(seed)
        model = build_fn(n_industries, cfg.window_size, n_metrics, cfg)
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=cfg.initial_lr), loss="mse")
        model.fit(
            [X[mask], industry_ids[mask].reshape(-1, 1)], y[mask],
            epochs=cfg.epochs, batch_size=cfg.batch_size, verbose=0,
            callbacks=[tf.keras.callbacks.EarlyStopping(monitor="loss", patience=cfg.patience, restore_best_weights=True)],
        )

        pred_scaled = model([X[i:i + 1], industry_ids[i:i + 1].reshape(-1, 1)], training=False).numpy()
        errors[i] = np.abs(
            scaler.inverse_transform(pred_scaled) - scaler.inverse_transform(y[i:i + 1])
        )[0]

    return errors.mean(axis=0)


def main():
    print("Building industry-year panel...")
    panel = forecast.build_industry_year_panel()
    print(f"Panel: {panel[forecast.FCFG.group_col].nunique()} industries x "
          f"{panel[forecast.FCFG.year_col].nunique()} years, metrics={forecast.FCFG.metrics}")

    data = forecast.make_windows(panel, window_size=config.FORECAST_CONFIG.window_size)
    X, y, industry_ids = data["X"], data["y"], data["industry_ids"]
    scaler, metrics = data["scaler"], data["metrics"]
    n_industries = len(data["industries"])
    print(f"Windowed into {len(X)} training examples — leave-one-out CV means {len(X)} folds per architecture.\n")

    print(f"Running LOOCV for LSTM/GRU baseline (src/forecast.py, {len(X)} folds)...")
    lstm_mae = _loocv_mae(
        forecast.build_forecast_model, config.FORECAST_CONFIG,
        X, y, industry_ids, n_industries, len(metrics), scaler,
    )

    print(f"Running LOOCV for TSMixer (src/tsmixer_forecast.py, {len(X)} folds)...")
    tsmixer_mae = _loocv_mae(
        tsmixer_forecast.build_tsmixer_forecast_model, config.TSMIXER_CONFIG,
        X, y, industry_ids, n_industries, len(metrics), scaler,
    )

    print("\n" + "=" * 72)
    print(f"{'Metric':<32}{'LSTM/GRU LOOCV MAE':<22}{'TSMixer LOOCV MAE':<20}")
    print("=" * 72)
    regressions = []
    improvements = []
    for i, m in enumerate(metrics):
        b_val, t_val = float(lstm_mae[i]), float(tsmixer_mae[i])
        verdict = "TSMixer better" if t_val < b_val else ("TSMixer worse" if t_val > b_val else "tie")
        if t_val > b_val:
            regressions.append(m)
        elif t_val < b_val:
            improvements.append(m)
        print(f"{m:<32}{b_val:<22.4f}{t_val:<20.4f}{verdict}")
    print("=" * 72)

    print(f"\nRegressed metrics (TSMixer worse): {regressions or 'none'}")
    print(f"Improved metrics (TSMixer better): {improvements or 'none'}")

    no_regression = len(regressions) == 0
    print("\n" + "-" * 72)
    if no_regression and improvements:
        print(
            "KEEP TSMIXER: no metric regressed and at least one improved "
            f"({improvements}). Recommend considering it for the live forecast path as a "
            "separate, explicit follow-up decision — this script does not wire it in."
        )
    elif no_regression:
        print(
            "INCONCLUSIVE: no metric regressed, but none improved either on this small panel. "
            "Recommend keeping src/forecast.py (LSTM/GRU) as the served forecaster for now."
        )
    else:
        print(
            f"DO NOT ADOPT (yet): TSMixer regressed {regressions} vs. the LSTM/GRU baseline. "
            "Keep src/forecast.py as the served forecaster."
        )
    print("-" * 72)


if __name__ == "__main__":
    main()
