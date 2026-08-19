"""
worldbank.py — live Zimbabwe macro indicators from the World Bank's open API (no auth key
required), used as an additive supplement to the static CPI/food-inflation panel
(config.MACRO_INDICATORS, features.load_macro_human_capital()) that this pipeline already has.

This isn't a live-refresh of what's already there — it adds indicators that don't exist
anywhere in this pipeline today: unemployment rate and labor force participation rate
(config.WORLD_BANK_CONFIG.indicators). Those are genuinely new signal for the `productivity`
task's macro context, not a duplicate data source.

Gated behind config.USE_LIVE_MACRO_DATA (default False) — see features.py's
add_macro_context_features(). Every function here degrades to returning None on any failure
(network down, timeout, malformed response) rather than raising, mirroring
load_macro_human_capital()'s existing contract, so a flaky connection can never break a
pipeline run — it just silently loses the World Bank columns for that run.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx
import pandas as pd

from . import config

logger = logging.getLogger(__name__)

WORLD_BANK_API_BASE = "https://api.worldbank.org/v2"


def fetch_indicator(
    indicator_code: str,
    country_iso3: str = config.WORLD_BANK_CONFIG.country_iso3,
    timeout: float = config.WORLD_BANK_CONFIG.request_timeout_s,
) -> Optional[pd.DataFrame]:
    """One indicator -> DataFrame(year, <indicator_code>), or None on any failure. World Bank's
    response shape is [metadata, [ {date, value, ...}, ... ]] — value is null for years without
    data, which are dropped here rather than surfaced as 0 or NaN-filled (the caller's merge
    already handles missing years via forward/back-fill against the target DataFrame's range)."""
    url = f"{WORLD_BANK_API_BASE}/country/{country_iso3}/indicator/{indicator_code}"
    params = {"format": "json", "per_page": 1000}
    try:
        response = httpx.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("World Bank fetch failed for %s/%s: %s", country_iso3, indicator_code, exc)
        return None

    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        logger.warning("World Bank returned no data for %s/%s.", country_iso3, indicator_code)
        return None

    rows = [
        {"year": int(entry["date"]), indicator_code: float(entry["value"])}
        for entry in payload[1]
        if entry.get("value") is not None
    ]
    if not rows:
        logger.warning("World Bank returned only null values for %s/%s.", country_iso3, indicator_code)
        return None

    return pd.DataFrame(rows).sort_values("year").reset_index(drop=True)


def _load_cache(cache_path: str, max_age_days: int) -> Optional[pd.DataFrame]:
    if not os.path.exists(cache_path):
        return None
    age_days = (time.time() - os.path.getmtime(cache_path)) / 86400
    if age_days > max_age_days:
        return None
    try:
        return pd.read_parquet(cache_path)
    except Exception as exc:  # corrupted/partial cache file — refetch rather than fail
        logger.warning("World Bank cache at %s unreadable (%s) — refetching.", cache_path, exc)
        return None


def fetch_world_bank_panel(cfg: config.WorldBankConfig = config.WORLD_BANK_CONFIG) -> Optional[pd.DataFrame]:
    """All configured indicators merged into one wide DataFrame (year + one column per
    indicator, renamed to their friendly names). Cache-first: a cache younger than
    cfg.cache_max_age_days is used without touching the network at all — this is slow-moving
    annual data, so there's no reason to refetch on every pipeline run. Returns None if neither
    a usable cache nor a live fetch is available (e.g. first run with no network)."""
    cached = _load_cache(cfg.cache_path, cfg.cache_max_age_days)
    if cached is not None:
        return cached

    panel: Optional[pd.DataFrame] = None
    fetched_codes = set()
    for indicator_code in cfg.indicators:
        indicator_df = fetch_indicator(indicator_code, cfg.country_iso3, cfg.request_timeout_s)
        if indicator_df is None:
            continue
        fetched_codes.add(indicator_code)
        panel = indicator_df if panel is None else panel.merge(indicator_df, on="year", how="outer")

    if panel is None:
        logger.warning("No World Bank indicators could be fetched for %s.", cfg.country_iso3)
        return None

    panel = panel.rename(columns=cfg.indicators).sort_values("year").reset_index(drop=True)

    # Only cache a COMPLETE panel (every configured indicator fetched successfully). Caching a
    # partial one (e.g. one indicator timed out) would make the missing column look "fetched
    # and confirmed absent" for cache_max_age_days, instead of "temporarily unavailable, retry
    # next run" — this run still returns the partial panel below, it just isn't persisted as
    # if it were the definitive snapshot.
    if fetched_codes == set(cfg.indicators):
        os.makedirs(os.path.dirname(cfg.cache_path), exist_ok=True)
        panel.to_parquet(cfg.cache_path, index=False)
    else:
        missing = set(cfg.indicators) - fetched_codes
        logger.warning(
            "World Bank panel for %s is missing indicator(s) %s this run — not caching a "
            "partial result; will retry all indicators next call.",
            cfg.country_iso3, missing,
        )
    logger.info(
        "Fetched World Bank panel for %s: %d years, columns=%s",
        cfg.country_iso3, len(panel), list(cfg.indicators.values()),
    )
    return panel
