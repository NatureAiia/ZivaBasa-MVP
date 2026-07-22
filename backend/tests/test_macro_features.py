"""
test_macro_features.py — covers features.py's macro CPI/food-inflation context integration
(human_capital_project.csv joined onto the productivity task by year).

Not API-level (no TestClient/model artifacts involved) — these exercise
load_macro_human_capital() / add_macro_context_features() / run_pipeline("productivity")
directly, since the macro join is a features.py-level concern, not an endpoint concern.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src import config, features


def test_load_macro_human_capital_returns_zimbabwe_data():
    macro = features.load_macro_human_capital()
    assert macro is not None
    assert not macro.empty
    assert set(config.MACRO_INDICATORS.values()).issubset(macro.columns)
    assert "year" in macro.columns
    # The real file covers 2000-2025 for Zimbabwe — assert a reasonably wide range rather than
    # the exact bounds, so a future data refresh with a slightly different range doesn't break
    # this test for no real reason.
    assert macro["year"].min() <= 2005
    assert macro["year"].max() >= 2020
    # food_inflation_rate is year-over-year, so the series' very first year structurally has no
    # prior-year baseline to compute a rate from (a real characteristic of the source data, not
    # a bug) — allow that one expected leading NaN, but nothing else.
    non_leading = macro.sort_values("year").iloc[1:]
    assert non_leading[list(config.MACRO_INDICATORS.values())].notna().all().all()


def test_add_macro_context_features_noop_without_year_column():
    df = pd.DataFrame({"industry": ["Banking", "Tech"], "ai_adoption_level": [0.5, 0.7]})
    result = features.add_macro_context_features(df.copy(), "employment")
    pd.testing.assert_frame_equal(result, df)


def test_add_macro_context_features_noop_on_none():
    assert features.add_macro_context_features(None, "productivity") is None


def test_add_macro_context_features_preserves_row_count_and_adds_columns():
    df = pd.DataFrame({
        "year": [2020, 2021, 2026, 2021],  # 2026 is outside the CPI panel's native 2000-2025 range
        "salary_change_percent": [1.0, 2.0, 3.0, 4.0],
    })
    n_before = len(df)
    result = features.add_macro_context_features(df, "productivity")

    assert len(result) == n_before
    for col in config.MACRO_INDICATORS.values():
        assert col in result.columns
    assert "salary_change_real" in result.columns
    assert result[list(config.MACRO_INDICATORS.values()) + ["salary_change_real"]].notna().all().all()
    # 2026 (outside the native panel) must have been forward-filled from 2025, not left NaN.
    assert result.loc[result["year"] == 2026, "cpi_general_index"].notna().all()


def test_productivity_pipeline_has_macro_features_no_nans():
    df = features.run_pipeline("productivity", save=False)
    assert df is not None
    for col in ["cpi_general_index", "food_inflation_rate", "salary_change_real"]:
        assert col in df.columns, f"'{col}' missing from productivity's processed feature matrix"
        assert df[col].notna().all(), f"'{col}' contains NaNs after the full pipeline run"


def test_productivity_leakage_screen_clean_with_macro_features():
    """Exogenous macro data should trivially clear the leakage screen — verify rather than
    assume (same pattern documented for the two bugs this project has already hit)."""
    df = features.run_pipeline("productivity", save=False)
    cfg = config.TASK_CONFIGS["productivity"]
    flagged = features.check_leakage(df, cfg.target, "productivity_macro_test")
    macro_and_derived = set(config.MACRO_INDICATORS.values()) | {"salary_change_real"}
    assert not (set(flagged) & macro_and_derived), (
        f"Macro-derived columns unexpectedly flagged as leaky: {set(flagged) & macro_and_derived}"
    )
