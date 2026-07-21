"""
load_human_capital.py — Raw-data handler for the Human Capital CSV (pending real file).

Mirrors the load -> validate -> checkpoint pattern used elsewhere in this pipeline
(notebooks/01_data_acquisition_eda.ipynb for employment/skills/productivity;
scripts/generate_skill_match_fixture.py for skill_match): read the raw CSV, validate its
columns against the documented schema, and write a `human_capital_checked.parquet`
checkpoint that features.load_checkpoint() picks up by name.

Deliberately NOT wired into config.TASK_CONFIGS yet. The file previously found at
data/raw/human_capital_project.csv turned out to be an unrelated FAO food-price-inflation
panel, not employee-level HR data (zero column overlap with HUMAN_CAPITAL_EXPECTED_COLUMNS).
This script exists so that once the real CSV lands at data/raw/human_capital.csv, running it
produces an explicit present/missing/extra column report and a hard failure on a missing join
key -- not a silent partial selection like bug 9.1 (productivity's dropped "salary_trend"
column, which produced only a WARNING log every run before being caught).

Run from backend/: `python scripts/load_human_capital.py`
"""
from __future__ import annotations

import os
import sys
import logging

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src import config  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("load_human_capital")


def load_raw() -> pd.DataFrame:
    path = os.path.join(config.RAW_DIR, config.HUMAN_CAPITAL_RAW_FILENAME)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No Human Capital CSV at {path}. Drop the real employee-level export there "
            f"(expected columns: {config.HUMAN_CAPITAL_EXPECTED_COLUMNS}) before running this script."
        )
    df = pd.read_csv(path)
    logger.info("Loaded %s -> %d rows x %d cols", path, *df.shape)
    return df


def validate_schema(df: pd.DataFrame) -> None:
    """Loud, explicit column report -- the fix for bug 9.1 (silent missing-column selection).

    Raises on a missing join-key column; only warns on missing optional columns, but always
    prints the full present/missing/extra breakdown so nothing is dropped quietly.
    """
    present = set(df.columns)
    expected = set(config.HUMAN_CAPITAL_EXPECTED_COLUMNS)
    required = set(config.HUMAN_CAPITAL_REQUIRED_COLUMNS)

    missing = expected - present
    extra = present - expected
    missing_required = required - present

    logger.info("Expected columns present: %d/%d", len(expected & present), len(expected))
    if missing:
        logger.warning("Expected columns NOT found in raw CSV: %s", sorted(missing))
    if extra:
        logger.info("Columns in raw CSV not in the expected schema (kept, unused for now): %s", sorted(extra))

    if missing_required:
        raise ValueError(
            f"Human Capital CSV is missing required join-key column(s): {sorted(missing_required)}. "
            "Refusing to checkpoint -- update data/schema/human_capital_dictionary.md and "
            "config.HUMAN_CAPITAL_EXPECTED_COLUMNS to match the real file, or fix the export."
        )


def save_checkpoint(df: pd.DataFrame) -> str:
    path = os.path.join(config.RAW_DIR, "human_capital_checked.parquet")
    df.to_parquet(path, index=False)
    logger.info("Saved checkpoint -> %s (%d rows x %d cols)", path, *df.shape)
    return path


def main() -> None:
    df = load_raw()
    validate_schema(df)
    save_checkpoint(df)


if __name__ == "__main__":
    main()
