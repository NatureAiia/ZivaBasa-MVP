"""
chronos_forecast.py — zero-shot multi-year forecasting via Amazon's Chronos-2, used as a
cold-start fallback for time series that don't yet have enough observed points to train
forecast.py's LSTM/GRU head or tsmixer_forecast.py's TSMixer head.

Why zero-shot at all: this project's real time-series data (config.ForecastConfig's 7-year x
8-industry panel) already clears the training bar, but the premise of this milestone is that
real Zimbabwean banking time-series data doesn't exist yet — any new series that shows up
(a new industry, a real bank feed) before it has config.CHRONOS_FORECAST_CONFIG.
min_years_for_trained_model years of history has no other forecasting option in this project.
Chronos-2 is pretrained on a broad time-series corpus and needs zero task-specific training
data to produce a forecast, at the cost of being a black-box pretrained model rather than a
SHAP-attributable one — this is a deliberate, documented trade of explainability for coverage
in the specific cold-start case where there's nothing to train an attributable model ON.

Optional dependency: torch + chronos-forecasting + transformers (see requirements.txt),
installed into this project's `deep_learning` conda env. Guarded import — importing this
module without them installed does not fail; calling forecast_industry_zeroshot() without
them installed raises a clear RuntimeError, same pattern api/agent_graph.py uses for its
optional LangGraph dependency.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

import pandas as pd

from . import config
from . import forecast

logger = logging.getLogger(__name__)

CCFG = config.CHRONOS_FORECAST_CONFIG

try:
    from chronos import Chronos2Pipeline
    _CHRONOS_AVAILABLE = True
except ImportError:
    _CHRONOS_AVAILABLE = False

_pipeline_cache: Dict[str, "Chronos2Pipeline"] = {}


def _require_chronos() -> None:
    if not _CHRONOS_AVAILABLE:
        raise RuntimeError(
            "Zero-shot forecasting isn't installed on this backend. Install torch, "
            "chronos-forecasting and transformers (see requirements.txt, `deep_learning` "
            "conda env) to enable forecast_industry_zeroshot()."
        )


def _get_pipeline(cfg: config.ChronosForecastConfig = CCFG) -> "Chronos2Pipeline":
    _require_chronos()
    if cfg.checkpoint not in _pipeline_cache:
        _pipeline_cache[cfg.checkpoint] = Chronos2Pipeline.from_pretrained(
            cfg.checkpoint, device_map=cfg.device,
        )
    return _pipeline_cache[cfg.checkpoint]


def _panel_to_long_format(panel: pd.DataFrame, industry: str) -> pd.DataFrame:
    """
    Reshape the wide (industry, year, metric...) panel forecast.py already builds into the
    long (id, timestamp, target) format Chronos2Pipeline.predict_df expects, one call per
    metric since Chronos-2's target column is univariate per series here (the panel's metrics
    aren't causally related time series of each other — they're independent yearly averages).
    """
    sub = panel[panel[forecast.FCFG.group_col] == industry].sort_values(forecast.FCFG.year_col)
    return sub


def forecast_industry_zeroshot(
    industry: str,
    horizon: Optional[int] = None,
    panel: Optional[pd.DataFrame] = None,
    cfg: config.ChronosForecastConfig = CCFG,
) -> Dict:
    """
    Zero-shot equivalent of forecast.forecast_industry() — same return shape
    ({industry, metrics, history, forecast, ...}) so callers can swap between the trained
    LSTM/GRU forecaster and this cold-start fallback without changing how the result is
    consumed. No model is trained here; every call runs inference against the pretrained
    Chronos-2 checkpoint.
    """
    _require_chronos()
    horizon = horizon or forecast.FCFG.default_horizon
    horizon = min(horizon, forecast.FCFG.max_horizon)

    if panel is None:
        panel = forecast.build_industry_year_panel()

    industries = sorted(panel[forecast.FCFG.group_col].unique().tolist())
    if industry not in industries:
        raise ValueError(f"Unknown industry '{industry}'. Available: {industries}")

    metrics = forecast.FCFG.metrics
    industry_panel = _panel_to_long_format(panel, industry)
    history = [
        {"year": int(row[forecast.FCFG.year_col]), **{m: float(row[m]) for m in metrics}}
        for _, row in industry_panel.iterrows()
    ]

    pipeline = _get_pipeline(cfg)
    forecast_points = []
    for m in metrics:
        context_df = pd.DataFrame({
            "branch_id": industry,
            "date": pd.to_datetime(industry_panel[forecast.FCFG.year_col], format="%Y"),
            m: industry_panel[m].values,
        })
        pred_df = pipeline.predict_df(
            context_df,
            prediction_length=horizon,
            quantile_levels=cfg.quantile_levels,
            id_column="branch_id",
            timestamp_column="date",
            target=m,
        )
        last_year = int(industry_panel[forecast.FCFG.year_col].max())
        lower_q, upper_q = min(cfg.quantile_levels), max(cfg.quantile_levels)
        for step, (_, row) in enumerate(pred_df.iterrows()):
            year = last_year + step + 1
            if len(forecast_points) <= step:
                forecast_points.append({"year": year})
            forecast_points[step][m] = float(row["0.5"] if "0.5" in row else row["predictions"])
            forecast_points[step][f"{m}_lower"] = float(row[str(lower_q)])
            forecast_points[step][f"{m}_upper"] = float(row[str(upper_q)])

    return {
        "industry": industry,
        "metrics": metrics,
        "history": history,
        "forecast": forecast_points,
        "confidence_level": max(cfg.quantile_levels) - min(cfg.quantile_levels),
        "uncertainty_method": (
            f"Chronos-2 zero-shot quantile forecast ({cfg.checkpoint}, "
            f"quantile_levels={cfg.quantile_levels}) — a pretrained model's output "
            f"distribution, not fit to this project's data at all; use only when a series "
            f"has fewer than {cfg.min_years_for_trained_model} observed years "
            f"(config.CHRONOS_FORECAST_CONFIG.min_years_for_trained_model)."
        ),
    }
