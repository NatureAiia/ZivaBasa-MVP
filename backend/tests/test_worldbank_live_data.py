"""
test_worldbank_live_data.py — covers src/worldbank.py (live Zimbabwe macro indicators) and its
additive, config-gated integration into features.add_macro_context_features().

Deliberately network-free by default: fetch_indicator()/fetch_world_bank_panel() are exercised
against mocked httpx responses or monkeypatched functions, not the real World Bank API — this
session hit a genuinely unreliable connection, so a required test must not depend on it. One
real-network smoke test is included, skipped unless explicitly opted into.

tests/test_macro_features.py is left untouched — it never sets USE_LIVE_MACRO_DATA, so it keeps
exercising the existing static-CPI-only default path.
"""
from __future__ import annotations

import os

import httpx
import pandas as pd
import pytest

from src import config, features, worldbank

# Shape of a real World Bank v2 API response: [metadata, [ {date, value, ...}, ... ]].
_FAKE_WORLD_BANK_RESPONSE = [
    {"page": 1, "pages": 1, "per_page": 1000, "total": 4},
    [
        {"indicator": {"id": "SL.UEM.TOTL.ZS", "value": "Unemployment"}, "date": "2023", "value": 8.5},
        {"indicator": {"id": "SL.UEM.TOTL.ZS", "value": "Unemployment"}, "date": "2022", "value": 8.9},
        {"indicator": {"id": "SL.UEM.TOTL.ZS", "value": "Unemployment"}, "date": "2021", "value": None},
        {"indicator": {"id": "SL.UEM.TOTL.ZS", "value": "Unemployment"}, "date": "2020", "value": 9.1},
    ],
]


def test_fetch_indicator_parses_response_and_drops_nulls(monkeypatch):
    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return _FAKE_WORLD_BANK_RESPONSE

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _FakeResponse())

    result = worldbank.fetch_indicator("SL.UEM.TOTL.ZS", country_iso3="ZWE", timeout=5)

    assert result is not None
    assert list(result["year"]) == [2020, 2022, 2023]  # 2021's null dropped, sorted ascending
    assert result.loc[result["year"] == 2023, "SL.UEM.TOTL.ZS"].iloc[0] == 8.5


def test_fetch_indicator_returns_none_on_http_error(monkeypatch):
    def _raise(*args, **kwargs):
        raise httpx.ConnectError("simulated network failure")

    monkeypatch.setattr(httpx, "get", _raise)

    assert worldbank.fetch_indicator("SL.UEM.TOTL.ZS", timeout=5) is None


def test_fetch_indicator_returns_none_on_empty_payload(monkeypatch):
    class _EmptyResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"page": 1, "pages": 0, "total": 0}, []]

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _EmptyResponse())

    assert worldbank.fetch_indicator("SL.UEM.TOTL.ZS", timeout=5) is None


def test_fetch_world_bank_panel_uses_cache_without_network(monkeypatch, tmp_path):
    cache_path = os.path.join(tmp_path, "worldbank_cache.parquet")
    cached_df = pd.DataFrame({
        "year": [2020, 2021, 2022],
        "unemployment_rate_pct": [9.1, 8.9, 8.5],
        "labor_force_participation_pct": [83.0, 83.2, 83.5],
    })
    cached_df.to_parquet(cache_path, index=False)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("fetch_indicator should not be called when a fresh cache exists")

    monkeypatch.setattr(worldbank, "fetch_indicator", _fail_if_called)

    cfg = config.WorldBankConfig(cache_path=cache_path, cache_max_age_days=30)
    result = worldbank.fetch_world_bank_panel(cfg)

    pd.testing.assert_frame_equal(result, cached_df)


def test_add_macro_context_features_adds_world_bank_columns_when_flag_enabled(monkeypatch):
    wb_panel = pd.DataFrame({
        "year": [2019, 2020, 2021, 2022],
        "unemployment_rate_pct": [8.7, 9.1, 8.9, 8.5],
        "labor_force_participation_pct": [82.5, 83.0, 83.2, 83.5],
    })
    monkeypatch.setattr(features, "load_world_bank_panel", lambda: wb_panel)
    monkeypatch.setattr(config, "USE_LIVE_MACRO_DATA", True)

    df = pd.DataFrame({
        "year": [2020, 2021, 2026, 2021],  # 2026 outside the panel's native range
        "salary_change_percent": [1.0, 2.0, 3.0, 4.0],
    })
    result = features.add_macro_context_features(df, "productivity")

    for col in config.WORLD_BANK_CONFIG.indicators.values():
        assert col in result.columns
        assert result[col].notna().all()
    # 2026 (outside native range) forward-filled from 2022, not left NaN.
    assert result.loc[result["year"] == 2026, "unemployment_rate_pct"].notna().all()


def test_add_macro_context_features_default_flag_off_has_no_world_bank_columns():
    df = pd.DataFrame({"year": [2020, 2021], "salary_change_percent": [1.0, 2.0]})
    result = features.add_macro_context_features(df, "productivity")
    for col in config.WORLD_BANK_CONFIG.indicators.values():
        assert col not in result.columns


@pytest.mark.skipif(
    os.environ.get("ZIVABASA_RUN_NETWORK_TESTS") != "1",
    reason="Real network call to the World Bank API — opt in with ZIVABASA_RUN_NETWORK_TESTS=1",
)
def test_live_fetch_world_bank_indicator_real_network():
    result = worldbank.fetch_indicator("SL.UEM.TOTL.ZS", country_iso3="ZWE", timeout=10)
    assert result is not None
    assert not result.empty
    assert "year" in result.columns
