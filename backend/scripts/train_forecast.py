"""
train_forecast.py — Trains the multi-year workforce forecasting LSTM/GRU (Day 11 of the
14-day plan). Standalone, not part of the multi-task shared trunk — see src/forecast.py's
docstring for why this task head has its own pipeline shape.

Run from backend/: `python scripts/train_forecast.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, forecast  # noqa: E402


def main():
    cfg = config.FORECAST_CONFIG
    print(f"Forecasting metrics: {cfg.metrics}")
    print(f"window_size={cfg.window_size} rnn_type={cfg.rnn_type} rnn_units={cfg.rnn_units}")

    panel = forecast.build_industry_year_panel()
    print(f"Panel: {panel[cfg.group_col].nunique()} industries x {panel[cfg.year_col].nunique()} years")

    bundle = forecast.train(panel, cfg=cfg)
    paths = forecast.save(bundle)
    print("Saved forecast artifacts:")
    for name, path in paths.items():
        print(f"  [{name}] -> {path}")

    print("\nSample recursive forecast (first industry, default horizon):")
    sample_industry = bundle["industries"][0]
    result = forecast.forecast_industry(bundle, sample_industry)
    for point in result["forecast"]:
        print(f"  {sample_industry} {point}")


if __name__ == "__main__":
    main()
