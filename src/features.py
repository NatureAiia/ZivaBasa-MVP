"""
features.py — Feature engineering pipeline for the ZivaBasa MVP (Kaggle-Data Phase).

Implements the raw -> ratio/index -> interaction -> (learned, built by the model) -> fusion
taxonomy from the ChiedzaAI proposal. Mirrors 02_feature_engineering.ipynb exactly, so the
notebook and this module never drift apart — the notebook should eventually just call these
functions instead of duplicating the logic inline.

Typical usage
-------------
    from src import features

    raw = features.load_checkpoint("employment")
    raw = features.handle_missing(raw, "employment")
    raw = features.clip_outliers(raw, ["automation_risk", "salary"], "employment")
    feat = features.select_raw(raw, "employment")
    feat = features.add_ratio_index_features(feat, "employment")
    feat = features.add_interaction_features(feat, "employment")
    feat = features.encode_categoricals(feat, "employment")
    feat = features.scale_numeric(feat, "employment", exclude_cols=["automation_risk"])
    feat = features.define_target(feat, "employment")
    features.save_processed(feat, "employment")

Or, to run the whole thing in one call:

    feat_employment = features.run_pipeline("employment")
"""

from __future__ import annotations

import os
import logging
from typing import List, Optional

import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler

from . import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

# A living record of every engineered feature, populated as functions below are called.
# Call `feature_dictionary_to_frame()` / `save_feature_dictionary()` to persist it.
_FEATURE_LOG: List[dict] = []


def _log_feature(name: str, category: str, task_head: str, source_cols: List[str], description: str) -> None:
    _FEATURE_LOG.append({
        "feature_name": name,
        "category": category,   # raw | ratio | index | interaction | target
        "task_head": task_head,
        "source_columns": source_cols,
        "description": description,
    })


def feature_dictionary_to_frame() -> pd.DataFrame:
    return pd.DataFrame(_FEATURE_LOG)


def save_feature_dictionary(path: Optional[str] = None) -> str:
    path = path or os.path.join(config.PROCESSED_DIR, "feature_dictionary.csv")
    feature_dictionary_to_frame().to_csv(path, index=False)
    logger.info("Feature dictionary saved -> %s (%d entries)", path, len(_FEATURE_LOG))
    return path


# --------------------------------------------------------------------------- #
# I/O
# --------------------------------------------------------------------------- #
def load_checkpoint(task_name: str) -> Optional[pd.DataFrame]:
    """Load the validated raw checkpoint produced by 01_data_acquisition_eda.ipynb."""
    path = os.path.join(config.RAW_DIR, f"{task_name}_checked.parquet")
    if not os.path.exists(path):
        logger.warning("Missing %s — run data acquisition / EDA first.", path)
        return None
    df = pd.read_parquet(path)
    logger.info("[%s] loaded %d rows x %d cols", task_name, *df.shape)
    return df


def save_processed(df: Optional[pd.DataFrame], task_name: str) -> Optional[str]:
    if df is None:
        logger.warning("[%s] nothing to save.", task_name)
        return None
    path = os.path.join(config.PROCESSED_DIR, f"{task_name}_features.parquet")
    df.to_parquet(path, index=False)
    logger.info("[%s] saved -> %s (%d rows x %d cols)", task_name, path, *df.shape)
    return path


def load_processed(task_name: str) -> Optional[pd.DataFrame]:
    path = os.path.join(config.PROCESSED_DIR, f"{task_name}_features.parquet")
    if not os.path.exists(path):
        logger.warning("Missing %s — run the feature engineering pipeline first.", path)
        return None
    return pd.read_parquet(path)


# --------------------------------------------------------------------------- #
# Cleaning
# --------------------------------------------------------------------------- #
def handle_missing(
    df: Optional[pd.DataFrame],
    task_name: str,
    numeric_strategy: str = "median",
    categorical_strategy: str = "mode",
) -> Optional[pd.DataFrame]:
    """Numeric -> median/mean impute with a `_was_missing` flag. Categorical -> mode/'Unknown'."""
    if df is None:
        return None
    df = df.copy()
    num_cols = df.select_dtypes(include=[np.number]).columns
    cat_cols = df.select_dtypes(include=["object", "category"]).columns

    for col in num_cols:
        if df[col].isna().any():
            df[f"{col}_was_missing"] = df[col].isna().astype(int)
            fill_val = df[col].median() if numeric_strategy == "median" else df[col].mean()
            df[col] = df[col].fillna(fill_val)

    for col in cat_cols:
        if df[col].isna().any():
            fill_val = df[col].mode().iloc[0] if categorical_strategy == "mode" else "Unknown"
            df[col] = df[col].fillna(fill_val)

    logger.info("[%s] missing values handled. Remaining NaNs: %d", task_name, df.isna().sum().sum())
    return df


def clip_outliers(
    df: Optional[pd.DataFrame],
    cols: List[str],
    task_name: str,
    lower: float = config.OUTLIER_LOWER_QUANTILE,
    upper: float = config.OUTLIER_UPPER_QUANTILE,
) -> Optional[pd.DataFrame]:
    """Clip numeric columns at [lower, upper] quantiles rather than dropping rows."""
    if df is None:
        return None
    df = df.copy()
    cols = [c for c in cols if c in df.columns]
    for col in cols:
        lo, hi = df[col].quantile(lower), df[col].quantile(upper)
        n_clipped = int(((df[col] < lo) | (df[col] > hi)).sum())
        df[col] = df[col].clip(lo, hi)
        if n_clipped:
            logger.info("[%s] clipped %d outliers in '%s'", task_name, n_clipped, col)
    return df


# --------------------------------------------------------------------------- #
# Raw feature selection
# --------------------------------------------------------------------------- #
def select_raw(df: Optional[pd.DataFrame], task_name: str) -> Optional[pd.DataFrame]:
    """Explicitly select the raw columns that carry forward into modeling for this task head."""
    if df is None:
        return None
    cfg = config.TASK_CONFIGS[task_name]
    cols = [c for c in cfg.raw_cols if c in df.columns]
    missing = set(cfg.raw_cols) - set(cols)
    if missing:
        logger.warning("[%s] requested columns not found, skipping: %s", task_name, missing)
    for c in cols:
        _log_feature(c, "raw", task_name, [c], "Direct source column, no transformation.")
    return df[cols].copy()


# --------------------------------------------------------------------------- #
# Ratio / Index features
# --------------------------------------------------------------------------- #
def add_ratio_index_features(df: Optional[pd.DataFrame], task_name: str) -> Optional[pd.DataFrame]:
    """Derived single-family metrics — the 'Ratio/Index' tier of the ChiedzaAI taxonomy."""
    if df is None:
        return None
    df = df.copy()

    if task_name == "skills" and {"TrainingTimesLastYear", "YearsAtCompany"}.issubset(df.columns):
        df["training_intensity_index"] = (
            df["TrainingTimesLastYear"] / df["YearsAtCompany"].replace(0, 1)
        )
        _log_feature(
            "training_intensity_index", "index", "skills",
            ["TrainingTimesLastYear", "YearsAtCompany"],
            "Training events per year of tenure — proxy for ongoing skill investment.",
        )

    if task_name == "employment" and "automation_risk" in df.columns:
        col = df["automation_risk"]
        df["automation_exposure_index"] = (col - col.min()) / (col.max() - col.min() + 1e-9)
        _log_feature(
            "automation_exposure_index", "index", "employment", ["automation_risk"],
            "Min-max normalized automation risk score, 0-1 scale.",
        )

    if task_name == "productivity" and "ai_adoption_level" in df.columns:
        col = df["ai_adoption_level"]
        df["ai_adoption_index"] = (col - col.min()) / (col.max() - col.min() + 1e-9)
        _log_feature(
            "ai_adoption_index", "index", "productivity", ["ai_adoption_level"],
            "Min-max normalized AI adoption level, 0-1 scale.",
        )

    return df


# --------------------------------------------------------------------------- #
# Interaction features
# --------------------------------------------------------------------------- #
def add_interaction_features(df: Optional[pd.DataFrame], task_name: str) -> Optional[pd.DataFrame]:
    """Cross-products the ChiedzaAI proposal specifically calls out."""
    if df is None:
        return None
    df = df.copy()

    if task_name == "skills" and {"training_intensity_index", "JobSatisfaction"}.issubset(df.columns):
        df["training_x_satisfaction"] = df["training_intensity_index"] * df["JobSatisfaction"]
        _log_feature(
            "training_x_satisfaction", "interaction", "skills",
            ["training_intensity_index", "JobSatisfaction"],
            "Training investment weighted by job satisfaction — proxy for skill-readiness "
            "likely to convert to retention.",
        )

    if task_name == "employment" and {"automation_exposure_index", "digital_skill_level"}.issubset(df.columns):
        df["exposure_x_digital_skill"] = df["automation_exposure_index"] * df["digital_skill_level"]
        _log_feature(
            "exposure_x_digital_skill", "interaction", "employment",
            ["automation_exposure_index", "digital_skill_level"],
            "Automation exposure weighted by digital skill level — higher digital skill may "
            "offset raw exposure.",
        )

    return df


# --------------------------------------------------------------------------- #
# Encoding
# --------------------------------------------------------------------------- #
def encode_categoricals(
    df: Optional[pd.DataFrame],
    task_name: str,
    max_cardinality: int = config.MAX_ONEHOT_CARDINALITY,
) -> Optional[pd.DataFrame]:
    """One-hot encode low-cardinality categoricals; warn (don't silently explode) on high-cardinality ones."""
    if df is None:
        return None
    df = df.copy()
    cat_cols = df.select_dtypes(include=["object", "category"]).columns
    for col in cat_cols:
        n_unique = df[col].nunique()
        if n_unique > max_cardinality:
            logger.warning(
                "[%s] '%s' has %d categories, one-hot encoding adds %d columns. "
                "Consider target/frequency encoding instead.",
                task_name, col, n_unique, n_unique,
            )
    df = pd.get_dummies(df, columns=list(cat_cols), drop_first=True)
    logger.info("[%s] encoded %d categorical columns -> %d total columns", task_name, len(cat_cols), df.shape[1])
    return df


# --------------------------------------------------------------------------- #
# Scaling
# --------------------------------------------------------------------------- #
def scale_numeric(
    df: Optional[pd.DataFrame],
    task_name: str,
    exclude_cols: Optional[List[str]] = None,
    fit: bool = True,
) -> Optional[pd.DataFrame]:
    """
    Standardize numeric features. Fits and saves a scaler when fit=True (training time);
    loads and reuses the saved scaler when fit=False (inference time), so train/serve stay
    consistent.
    """
    if df is None:
        return None
    exclude_cols = exclude_cols or []
    df = df.copy()
    num_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c not in exclude_cols]
    scaler_path = os.path.join(config.SCALER_DIR, f"{task_name}_scaler.pkl")

    if fit:
        scaler = StandardScaler()
        df[num_cols] = scaler.fit_transform(df[num_cols])
        joblib.dump(scaler, scaler_path)
        logger.info("[%s] scaled %d numeric columns, scaler saved -> %s", task_name, len(num_cols), scaler_path)
    else:
        if not os.path.exists(scaler_path):
            raise FileNotFoundError(f"No saved scaler for '{task_name}' at {scaler_path}. Run with fit=True first.")
        scaler = joblib.load(scaler_path)
        df[num_cols] = scaler.transform(df[num_cols])
        logger.info("[%s] applied saved scaler to %d numeric columns", task_name, len(num_cols))

    return df


# --------------------------------------------------------------------------- #
# Target definition
# --------------------------------------------------------------------------- #
def define_target(df: Optional[pd.DataFrame], task_name: str) -> Optional[pd.DataFrame]:
    """Task-specific target construction. The single most important step to get right."""
    if df is None:
        return None
    df = df.copy()

    if task_name == "employment" and "automation_risk" in df.columns:
        threshold = df["automation_risk"].quantile(0.75)
        df["target_high_automation_risk"] = (df["automation_risk"] > threshold).astype(int)
        _log_feature(
            "target_high_automation_risk", "target", "employment", ["automation_risk"],
            f"1 if automation_risk above 75th percentile ({threshold:.3f}).",
        )

    if task_name == "skills":
        attrition_cols = [c for c in df.columns if c.startswith("Attrition_")]
        if attrition_cols:
            df["target_attrition"] = df[attrition_cols[0]]
            _log_feature(
                "target_attrition", "target", "skills", ["Attrition"],
                "1 if employee left (attrition), from one-hot encoded Attrition column.",
            )

    if task_name == "productivity" and "ai_adoption_index" in df.columns:
        df["target_ai_adoption"] = df["ai_adoption_index"]
        _log_feature(
            "target_ai_adoption", "target", "productivity", ["ai_adoption_index"],
            "Regression target — normalized AI adoption level.",
        )

    return df


# --------------------------------------------------------------------------- #
# End-to-end pipeline
# --------------------------------------------------------------------------- #
def run_pipeline(task_name: str, save: bool = True) -> Optional[pd.DataFrame]:
    """Run the full raw -> processed feature pipeline for one task head."""
    cfg = config.TASK_CONFIGS[task_name]

    raw = load_checkpoint(task_name)
    if raw is None:
        return None

    raw = handle_missing(raw, task_name)
    numeric_cols = raw.select_dtypes(include=[np.number]).columns.tolist()
    raw = clip_outliers(raw, numeric_cols, task_name)

    feat = select_raw(raw, task_name)
    feat = add_ratio_index_features(feat, task_name)
    feat = add_interaction_features(feat, task_name)
    feat = encode_categoricals(feat, task_name)
    feat = scale_numeric(feat, task_name, exclude_cols=[cfg.target], fit=True)
    feat = define_target(feat, task_name)

    if save:
        save_processed(feat, task_name)
        save_feature_dictionary()

    return feat


def run_all_pipelines(save: bool = True) -> dict:
    """Run the feature engineering pipeline for every configured task head."""
    return {name: run_pipeline(name, save=save) for name in config.TASK_NAMES}
