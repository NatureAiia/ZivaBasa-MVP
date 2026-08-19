"""
test_chronos_forecast.py — smoke test for src/chronos_forecast.py (Chronos-2 zero-shot
cold-start forecaster). `chronos-forecasting`/torch are optional dependencies (see
requirements.txt, installed into the `deep_learning` conda env) — this file always verifies
the module imports cleanly and fails loudly-but-cleanly when the dependency is absent, then
skips the actual zero-shot inference check wherever the dependency isn't installed, same
pattern this repo already uses for LangGraph (tests/test_agent_graph.py).
"""
from __future__ import annotations

import pandas as pd
import pytest

from src import chronos_forecast, config


def test_module_imports_cleanly():
    assert hasattr(chronos_forecast, "forecast_industry_zeroshot")


def test_raises_clear_error_without_dependency(monkeypatch):
    monkeypatch.setattr(chronos_forecast, "_CHRONOS_AVAILABLE", False)
    with pytest.raises(RuntimeError, match="isn't installed"):
        chronos_forecast.forecast_industry_zeroshot("Banking")


@pytest.mark.skipif(not chronos_forecast._CHRONOS_AVAILABLE, reason="chronos-forecasting not installed")
def test_zeroshot_forecast_matches_forecast_industry_shape():
    from src import forecast

    panel = forecast.build_industry_year_panel()
    industry = sorted(panel[forecast.FCFG.group_col].unique())[0]
    result = chronos_forecast.forecast_industry_zeroshot(industry, horizon=2, panel=panel)

    assert result["industry"] == industry
    assert result["metrics"] == config.FORECAST_CONFIG.metrics
    assert len(result["forecast"]) == 2
    for point in result["forecast"]:
        for m in result["metrics"]:
            assert point[f"{m}_lower"] <= point[m] <= point[f"{m}_upper"]
