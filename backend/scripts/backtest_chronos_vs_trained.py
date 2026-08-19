"""
backtest_chronos_vs_trained.py — Three-way forecast comparison: Chronos-2 zero-shot vs the
trained LSTM/GRU (src/forecast.py) vs the trained TSMixer (src/tsmixer_forecast.py), on a
held-out final year of the real industry-year panel.

Different eval protocol from scripts/benchmark_tsmixer_vs_lstm.py's leave-one-out CV
deliberately, not by oversight: Chronos-2 is zero-shot and forecasts strictly FORWARD from a
contiguous context — it has no way to fill in an arbitrary held-out *middle* window the way
LOOCV holds out any of the 32 windows for the trained models. The one backtest protocol all
three architectures can be compared under fairly is: hold out the panel's actual final year
(2026) for every industry, forecast it from everything before, compare to the real value.

For the trained models this means one train pass (not 32 LOOCV folds) on windows built only
from years before the final one, then a single manual forward pass per industry using that
industry's true last window_size years as input — deliberately NOT reusing forecast.py's
forecast_industry()/MC-dropout machinery, since that's built for uncertainty-quantified
*future* forecasting (years with no ground truth yet), not backtesting against a known value.

Chronos-2 requires torch + chronos-forecasting + transformers (see requirements.txt) and
downloads the amazon/chronos-2 checkpoint from Hugging Face on first use — both can be slow or
unavailable depending on network conditions; this script fails loudly with a clear message
rather than hanging if that's the case.

Run from backend/: `python scripts/backtest_chronos_vs_trained.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import tensorflow as tf

from src import chronos_forecast, config, forecast, tsmixer_forecast  # noqa: E402


def _train_and_predict_final_year(build_fn, cfg, backtest_panel, full_panel) -> dict:
    """Trains fresh on windows built only from years before the held-out final year, then
    manually forward-passes each industry's true last window_size years to predict that final
    year. Returns {industry: {metric: predicted_value}}."""
    data = forecast.make_windows(backtest_panel, window_size=cfg.window_size)
    X, y, industry_ids = data["X"], data["y"], data["industry_ids"]
    industries, scaler, metrics = data["industries"], data["scaler"], data["metrics"]

    tf.random.set_seed(config.RANDOM_STATE)
    np.random.seed(config.RANDOM_STATE)
    model = build_fn(len(industries), cfg.window_size, len(metrics), cfg)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=cfg.initial_lr), loss="mse")
    model.fit(
        [X, industry_ids.reshape(-1, 1)], y,
        epochs=cfg.epochs, batch_size=cfg.batch_size, verbose=0,
        callbacks=[tf.keras.callbacks.EarlyStopping(monitor="loss", patience=cfg.patience, restore_best_weights=True)],
    )

    predictions = {}
    for idx, industry in enumerate(industries):
        industry_rows = backtest_panel[backtest_panel[forecast.FCFG.group_col] == industry].sort_values(
            forecast.FCFG.year_col
        )
        last_window_raw = industry_rows[metrics].values[-cfg.window_size:]
        last_window_scaled = scaler.transform(last_window_raw).astype("float32")
        pred_scaled = model(
            [last_window_scaled[np.newaxis, :, :], np.array([[idx]], dtype="int32")], training=False
        ).numpy()
        pred_raw = scaler.inverse_transform(pred_scaled)[0]
        predictions[industry] = dict(zip(metrics, pred_raw.tolist()))
    return predictions


def main():
    print("Building full industry-year panel...")
    full_panel = forecast.build_industry_year_panel()
    year_col, group_col, metrics = forecast.FCFG.year_col, forecast.FCFG.group_col, forecast.FCFG.metrics

    final_year = int(full_panel[year_col].max())
    backtest_panel = full_panel[full_panel[year_col] < final_year].reset_index(drop=True)
    actual_final = full_panel[full_panel[year_col] == final_year].set_index(group_col)
    industries = sorted(full_panel[group_col].unique().tolist())
    print(f"Held-out year: {final_year} — training/context uses {backtest_panel[year_col].nunique()} "
          f"earlier years, backtesting against the real {final_year} values for {len(industries)} industries.\n")

    print("Training LSTM/GRU on pre-final-year windows...")
    lstm_preds = _train_and_predict_final_year(
        forecast.build_forecast_model, config.FORECAST_CONFIG, backtest_panel, full_panel
    )

    print("Training TSMixer on pre-final-year windows...")
    tsmixer_preds = _train_and_predict_final_year(
        tsmixer_forecast.build_tsmixer_forecast_model, config.TSMIXER_CONFIG, backtest_panel, full_panel
    )

    print("Running Chronos-2 zero-shot per industry (downloads the checkpoint on first use)...")
    try:
        chronos_preds = {}
        for industry in industries:
            result = chronos_forecast.forecast_industry_zeroshot(industry, horizon=1, panel=backtest_panel)
            chronos_preds[industry] = {m: result["forecast"][0][m] for m in metrics}
        chronos_available = True
    except RuntimeError as exc:
        print(f"Chronos-2 unavailable, skipping: {exc}")
        chronos_available = False
    except Exception as exc:  # network/timeout/model-download failures — report, don't crash
        print(f"Chronos-2 forecast failed ({type(exc).__name__}: {exc}), skipping.")
        chronos_available = False

    def _mae(preds: dict) -> dict:
        errors = {m: [] for m in metrics}
        for industry in industries:
            for m in metrics:
                errors[m].append(abs(preds[industry][m] - actual_final.loc[industry, m]))
        return {m: float(np.mean(v)) for m, v in errors.items()}

    lstm_mae = _mae(lstm_preds)
    tsmixer_mae = _mae(tsmixer_preds)
    chronos_mae = _mae(chronos_preds) if chronos_available else None

    header = f"{'Metric':<32}{'LSTM/GRU MAE':<16}{'TSMixer MAE':<16}"
    if chronos_available:
        header += f"{'Chronos-2 MAE':<16}"
    print("\n" + "=" * len(header))
    print(header)
    print("=" * len(header))
    for m in metrics:
        row = f"{m:<32}{lstm_mae[m]:<16.3f}{tsmixer_mae[m]:<16.3f}"
        if chronos_available:
            row += f"{chronos_mae[m]:<16.3f}"
        print(row)
    print("=" * len(header))

    if not chronos_available:
        print(
            "\nChronos-2 comparison incomplete this run (see message above) — LSTM/TSMixer "
            f"backtest against real {final_year} values is still valid and printed above."
        )


if __name__ == "__main__":
    main()
