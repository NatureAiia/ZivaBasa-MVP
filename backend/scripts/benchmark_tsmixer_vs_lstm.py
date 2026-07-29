"""
benchmark_tsmixer_vs_lstm.py — The benchmark gate for the TSMixer forecasting spike
(src/tsmixer_forecast.py), same role scripts/benchmark_ple_vs_baseline.py plays for the
PLE/VSN spike: keep TSMixer only if it doesn't regress the shipped LSTM/GRU forecaster
(src/forecast.py) on the same panel/windows. A more complex model that isn't measurably
better than what's already served is not adopted, per this project's own standard.

Unlike benchmark_ple_vs_baseline.py (which loads two already-trained sets of artifacts),
this trains both architectures fresh, in-process, on an identical train/val split — the
panel is small enough (7 years x 8 industries) that this is fast and avoids any risk of
comparing against stale saved artifacts.

Run from backend/: `python scripts/benchmark_tsmixer_vs_lstm.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from sklearn.model_selection import train_test_split

from src import config, forecast, tsmixer_forecast  # noqa: E402


def _val_mae_raw(model, scaler, X_val, id_val, y_val, metrics) -> dict:
    pred_scaled = model([X_val, id_val.reshape(-1, 1)], training=False).numpy()
    mae = np.abs(scaler.inverse_transform(pred_scaled) - scaler.inverse_transform(y_val)).mean(axis=0)
    return dict(zip(metrics, mae.tolist()))


def main():
    print("Building industry-year panel...")
    panel = forecast.build_industry_year_panel()
    print(f"Panel: {panel[forecast.FCFG.group_col].nunique()} industries x "
          f"{panel[forecast.FCFG.year_col].nunique()} years, metrics={forecast.FCFG.metrics}")

    print("\nTraining LSTM/GRU baseline (src/forecast.py)...")
    lstm_bundle = forecast.train(panel, cfg=config.FORECAST_CONFIG)

    print("\nTraining TSMixer (src/tsmixer_forecast.py)...")
    tsmixer_bundle = tsmixer_forecast.train(panel, cfg=config.TSMIXER_CONFIG)

    # Both trainers windowed the same panel with the same window_size and the same
    # RANDOM_STATE-seeded train_test_split, so re-deriving the identical held-out val set
    # here (rather than trusting each bundle's own internal split bookkeeping) is what makes
    # this an apples-to-apples comparison.
    metrics = config.FORECAST_CONFIG.metrics
    data = forecast.make_windows(panel, window_size=config.FORECAST_CONFIG.window_size)
    _, X_val, _, id_val, _, y_val = train_test_split(
        data["X"], data["industry_ids"], data["y"], test_size=0.2, random_state=config.RANDOM_STATE,
    )
    lstm_mae = _val_mae_raw(lstm_bundle["model"], lstm_bundle["scaler"], X_val, id_val, y_val, metrics)

    print("\n" + "=" * 72)
    print(f"{'Metric':<32}{'LSTM/GRU val MAE':<20}{'TSMixer val MAE':<20}")
    print("=" * 72)
    regressions = []
    improvements = []
    for m in metrics:
        b_val = lstm_mae[m]
        t_val = tsmixer_bundle["val_mae_raw"][m]
        verdict = "TSMixer better" if t_val < b_val else ("TSMixer worse" if t_val > b_val else "tie")
        if t_val > b_val:
            regressions.append(m)
        elif t_val < b_val:
            improvements.append(m)
        print(f"{m:<32}{b_val:<20.4f}{t_val:<20.4f}{verdict}")
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
