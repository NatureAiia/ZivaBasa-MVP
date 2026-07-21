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
# Macro CPI / food-inflation context (human_capital_project.csv)
# --------------------------------------------------------------------------- #
# See config.py's "Macro CPI / food-inflation context" section for the naming-collision warning:
# despite the name, human_capital_project.csv is NOT the HR file — it's an FAO/IMF-style CPI and
# food-inflation panel with no employee dimension, joinable only by year.
_MACRO_HUMAN_CAPITAL_CACHE: Optional[pd.DataFrame] = None


def load_macro_human_capital() -> Optional[pd.DataFrame]:
    """Loads, filters (Zimbabwe + the two configured indicators), annualizes (monthly mean),
    and pivots human_capital_project.csv into one row per year. Cached at module level — the
    source is ~190k rows of static reference data, not something that changes per pipeline
    run, so re-reading/re-aggregating it on every call would be wasted work.
    """
    global _MACRO_HUMAN_CAPITAL_CACHE
    if _MACRO_HUMAN_CAPITAL_CACHE is not None:
        return _MACRO_HUMAN_CAPITAL_CACHE

    path = config.MACRO_HUMAN_CAPITAL_PATH
    if not os.path.exists(path):
        logger.warning("Macro CPI/food-inflation file not found at %s — macro context features unavailable.", path)
        return None

    raw = pd.read_csv(path)
    raw = raw[raw["REF_AREA_LABEL"] == config.MACRO_COUNTRY_LABEL]
    raw = raw[raw["INDICATOR_LABEL"].isin(config.MACRO_INDICATORS.keys())]
    if raw.empty:
        logger.warning(
            "No %s rows found for indicators %s in %s.",
            config.MACRO_COUNTRY_LABEL, list(config.MACRO_INDICATORS.keys()), path,
        )
        return None

    annual = raw.groupby(["Year", "INDICATOR_LABEL"])["Value"].mean().reset_index()
    wide = annual.pivot(index="Year", columns="INDICATOR_LABEL", values="Value")
    wide = wide.rename(columns=config.MACRO_INDICATORS)
    wide.index.name = "year"
    wide = wide.reset_index()

    _MACRO_HUMAN_CAPITAL_CACHE = wide
    logger.info(
        "Loaded macro CPI/food-inflation panel: %d years (%d-%d), columns=%s",
        len(wide), int(wide["year"].min()), int(wide["year"].max()), list(config.MACRO_INDICATORS.values()),
    )
    return wide


def add_macro_context_features(
    df: Optional[pd.DataFrame], task_name: str, year_col: str = "year"
) -> Optional[pd.DataFrame]:
    """Left-merges the Zimbabwe CPI/food-inflation panel onto `df` by year. Additive-only and
    safe to call unconditionally: no-ops (returns `df` unchanged) if `df` has no `year_col` or
    the macro table can't be loaded, so tasks without a year column are never affected.

    Also derives salary_change_real = salary_change_percent - food_inflation_rate when
    salary_change_percent is present — a nominal pay rise can still be a real pay cut in a
    high-inflation economy, so this closes a real gap rather than modeling nominal wage growth
    alone.
    """
    if df is None:
        return None
    if year_col not in df.columns:
        return df

    macro = load_macro_human_capital()
    if macro is None:
        return df

    macro_cols = list(config.MACRO_INDICATORS.values())
    n_before = len(df)

    # Extend the macro panel to cover every year present in df (e.g. productivity's data runs
    # through 2026, one year past the CPI panel's native 2025 max) before merging, so the join
    # can't silently produce NaNs for in-range-but-unlisted years — filled via ffill/bfill
    # instead, logged rather than silent.
    df_years = pd.to_numeric(df[year_col], errors="coerce").dropna().astype(int)
    all_years = range(
        int(min(macro["year"].min(), df_years.min())),
        int(max(macro["year"].max(), df_years.max())) + 1,
    )
    macro_full = macro.set_index("year").reindex(all_years)
    n_filled = int(macro_full[macro_cols[0]].isna().sum())
    macro_full[macro_cols] = macro_full[macro_cols].ffill().bfill()
    macro_full = macro_full.reset_index()
    if n_filled:
        logger.warning(
            "[%s] %d year(s) outside the native CPI panel range were forward/back-filled.",
            task_name, n_filled,
        )

    merged = df.merge(macro_full, left_on=year_col, right_on="year", how="left", suffixes=("", "_macro"))
    assert len(merged) == n_before, (
        f"[{task_name}] macro merge changed row count ({n_before} -> {len(merged)}) — "
        "the year join must be many-to-one, not one-to-many."
    )

    for col in macro_cols:
        _log_feature(
            col, "raw", task_name, [year_col],
            f"Zimbabwe {col.replace('_', ' ')}, joined by year from human_capital_project.csv "
            "(FAO CPI/food-inflation panel — NOT HR data despite the misleading filename).",
        )

    if "salary_change_percent" in merged.columns and "food_inflation_rate" in merged.columns:
        merged["salary_change_real"] = merged["salary_change_percent"] - merged["food_inflation_rate"]
        _log_feature(
            "salary_change_real", "ratio", task_name,
            ["salary_change_percent", "food_inflation_rate"],
            "Inflation-adjusted (real) salary change = nominal salary_change_percent - "
            "food_inflation_rate. A nominal pay rise can still be a real pay cut in a "
            "high-inflation economy — this is a legitimate, exogenous (non-leaky) addition, "
            "not a derivative of any task's own target.",
        )

    return merged


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

    if task_name == "employment" and "automation_risk_score" in df.columns:
        col = df["automation_risk_score"]
        df["automation_exposure_index"] = (col - col.min()) / (col.max() - col.min() + 1e-9)
        _log_feature(
            "automation_exposure_index", "index", "employment", ["automation_risk_score"],
            "Min-max normalized automation risk score, 0-1 scale.",
        )

    if task_name == "productivity" and "ai_adoption_level" in df.columns:
        col = df["ai_adoption_level"]
        df["ai_adoption_index"] = (col - col.min()) / (col.max() - col.min() + 1e-9)
        _log_feature(
            "ai_adoption_index", "index", "productivity", ["ai_adoption_level"],
            "Min-max normalized AI adoption level, 0-1 scale.",
        )

    if task_name == "human_capital" and "DateofHire" in df.columns:
        hire = pd.to_datetime(df["DateofHire"], dayfirst=True, errors="coerce")
        reference = pd.Timestamp(config.HUMAN_CAPITAL_REFERENCE_DATE)
        df["tenure_years"] = ((reference - hire).dt.days / 365.25).clip(lower=0)
        # Drop the raw date string here, same as skill_matching.add_skill_match_features drops
        # current_skills/required_skills after consuming them — never carried into the modeling
        # matrix as free text.
        df = df.drop(columns=["DateofHire"])
        _log_feature(
            "tenure_years", "ratio", "human_capital", ["DateofHire"],
            f"Years between DateofHire and the fixed {config.HUMAN_CAPITAL_REFERENCE_DATE} "
            "snapshot date (not DateofTermination or 'today' — see config.py comment).",
        )

        if "Department" in df.columns:
            df["headcount_by_department"] = df.groupby("Department")["Department"].transform("size")
            _log_feature(
                "headcount_by_department", "ratio", "human_capital", ["Department"],
                "Row count per department — staff-complement proxy (no branch-level field exists).",
            )

        if "Termd" in df.columns and "Department" in df.columns:
            # Out-of-fold (not per-row leave-one-out) department turnover rate.
            #
            # An earlier version excluded only the row's OWN Termd from its department's mean
            # (grp_sum - own) / (grp_count - 1). That still leaks: for a fixed department, that
            # arithmetic shifts by a fixed, label-dependent amount depending on whether the row's
            # own Termd was 0 or 1 -- a decision tree can threshold on that exact fingerprint.
            # Caught empirically (not by check_leakage(), which shuffles the target and so can't
            # see a leak that depends on row/group correspondence): the smoke test's baseline
            # decision tree/gradient boosting hit 100% accuracy on human_capital with
            # feature_importances_ putting 100% of the split weight on this single column.
            #
            # Fix: 5-fold out-of-fold encoding. Every row in the same (department, fold) gets the
            # IDENTICAL rate, computed only from departments' Termd values in the OTHER folds --
            # no row's own label can be arithmetically backed out of its own encoded value.
            n_folds = 5
            fold = pd.Series(np.arange(len(df)) % n_folds, index=df.index)
            dept_sum = df.groupby("Department")["Termd"].transform("sum")
            dept_count = df.groupby("Department")["Department"].transform("size")
            fold_sum = df.groupby(["Department", fold])["Termd"].transform("sum")
            fold_count = df.groupby(["Department", fold])["Department"].transform("size")
            oof_denom = (dept_count - fold_count).clip(lower=1)
            df["turnover_rate_oof"] = (dept_sum - fold_sum) / oof_denom
            _log_feature(
                "turnover_rate_oof", "ratio", "human_capital", ["Termd", "Department"],
                "5-fold out-of-fold department turnover rate — every row in the same "
                "(department, fold) shares an identical value computed only from the other "
                "folds, so no row's own label leaves a per-row fingerprint in its own feature "
                "(a plain leave-one-out encoding was tried first and found to leak exactly this "
                "way — see the comment above).",
            )

        if {"PerfScoreID", "EngagementSurvey", "EmpSatisfaction"}.issubset(df.columns):
            def _z(s: pd.Series) -> pd.Series:
                return (s - s.mean()) / (s.std() + 1e-9)

            df["performance_readiness_index"] = (
                0.4 * _z(df["PerfScoreID"]) + 0.3 * _z(df["EngagementSurvey"]) + 0.3 * _z(df["EmpSatisfaction"])
            )
            _log_feature(
                "performance_readiness_index", "index", "human_capital",
                ["PerfScoreID", "EngagementSurvey", "EmpSatisfaction"],
                "Closest available analogue to a 'skill_readiness_index' — training_hours_ytd "
                "and promotion_count are NOT AVAILABLE in this file (see data dictionary), so "
                "this substitutes z-scored performance/engagement/satisfaction instead. Honestly "
                "labeled substitute, not equivalent to the taxonomy's original definition.",
            )

    if task_name == "skill_match" and {"current_skills", "required_skills"}.issubset(df.columns):
        from . import skill_matching
        df = skill_matching.add_skill_match_features(df)
        _log_feature(
            "cosine_similarity_score", "index", "skill_match",
            ["current_skills", "required_skills"],
            "Cosine similarity between the staff member's current skill-tag vector and the "
            "target role's required skill-tag vector, ported from FFIMS SWS's "
            "matchDriversToTask()/cosineSimilarity() (originally TypeScript, frontend-only).",
        )
        _log_feature(
            "skill_overlap_count", "index", "skill_match",
            ["current_skills", "required_skills"],
            "Count of required skills the staff member already has.",
        )
        _log_feature(
            "missing_skill_count", "index", "skill_match",
            ["current_skills", "required_skills"],
            "Count of required skills the staff member does not yet have — the direct input "
            "to a 'what training closes this gap' recommendation.",
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

    if task_name == "employment" and {"automation_exposure_index", "skill_complexity_score"}.issubset(df.columns):
        df["exposure_x_skill_complexity"] = df["automation_exposure_index"] * df["skill_complexity_score"]
        _log_feature(
            "exposure_x_skill_complexity", "interaction", "employment",
            ["automation_exposure_index", "skill_complexity_score"],
            "Automation exposure weighted by skill complexity — higher skill complexity may "
            "offset raw automation exposure (harder to fully automate complex skill sets).",
        )

    if task_name == "skill_match" and {"skill_overlap_count", "recent_training_hours"}.issubset(df.columns):
        df["overlap_x_training"] = df["skill_overlap_count"] * df["recent_training_hours"]
        _log_feature(
            "overlap_x_training", "interaction", "skill_match",
            ["skill_overlap_count", "recent_training_hours"],
            "Existing skill overlap weighted by recent training investment — proxy for how "
            "quickly a partial match is likely to close the remaining gap.",
        )

    if task_name == "productivity" and {"ai_adoption_index", "salary_change_percent"}.issubset(df.columns):
        df["ai_adoption_x_labour_cost_trend"] = df["ai_adoption_index"] * df["salary_change_percent"]
        _log_feature(
            "ai_adoption_x_labour_cost_trend", "interaction", "productivity",
            ["ai_adoption_index", "salary_change_percent"],
            "AI4I catalogue §2.3 'AI Adoption x Labour Cost'. The real productivity CSV "
            "(ai_job_replacement_2020_2026_v2.csv) has no absolute labour-cost column, so "
            "salary_change_percent (% change in salary) is used as the labour-cost-trend proxy "
            "— same 'closest analogue, honestly labeled' pattern as employment's "
            "ai_tool_maturity_score/task_repetition_level standing in for a true digital-skill-"
            "level field. NOT a substitute for a real labour_cost_per_employee column once bank "
            "data replaces the Kaggle proxy. Dropped from productivity's modeling matrix "
            "(config.py) — it's a direct multiplicative derivative of ai_adoption_index, which "
            "IS target_ai_adoption, so it inherits the same leakage employment's "
            "exposure_x_skill_complexity had to be excluded for.",
        )

    if task_name == "human_capital" and {"SpecialProjectsCount", "performance_readiness_index"}.issubset(df.columns):
        df["special_projects_x_performance_readiness"] = (
            df["SpecialProjectsCount"] * df["performance_readiness_index"]
        )
        _log_feature(
            "special_projects_x_performance_readiness", "interaction", "human_capital",
            ["SpecialProjectsCount", "performance_readiness_index"],
            "Substitute for the taxonomy's 'training_investment_x_skill_readiness' — "
            "training_hours_ytd is NOT AVAILABLE in this file, so SpecialProjectsCount (count "
            "of special projects, the closest adjacent signal per the data dictionary) stands "
            "in for training investment. Honestly labeled substitute, not equivalent.",
        )

    if task_name == "skill_match" and {"recent_training_hours", "cosine_similarity_score"}.issubset(df.columns):
        df["training_x_skill_readiness"] = df["recent_training_hours"] * df["cosine_similarity_score"]
        _log_feature(
            "training_x_skill_readiness", "interaction", "skill_match",
            ["recent_training_hours", "cosine_similarity_score"],
            "AI4I catalogue §2.3 'Training Investment x Skill Readiness' — sharpens "
            "overlap_x_training by weighting training investment against cosine_similarity_score "
            "(a continuous fit-quality score) instead of skill_overlap_count (a raw match count), "
            "so two staff with the same overlap count but different overall fit are no longer "
            "treated identically. Dropped from skill_match's modeling matrix (config.py) — same "
            "leakage profile as cosine_similarity_score itself, which target_good_redeployment_"
            "match is a direct quantile threshold of.",
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

    if task_name == "employment" and "automation_risk_score" in df.columns:
        threshold = df["automation_risk_score"].quantile(0.75)
        df["target_high_automation_risk"] = (df["automation_risk_score"] > threshold).astype(int)
        _log_feature(
            "target_high_automation_risk", "target", "employment", ["automation_risk_score"],
            f"1 if automation_risk_score above 75th percentile ({threshold:.3f}).",
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

    if task_name == "skill_match" and "cosine_similarity_score" in df.columns:
        threshold = df["cosine_similarity_score"].quantile(0.75)
        df["target_good_redeployment_match"] = (df["cosine_similarity_score"] > threshold).astype(int)
        _log_feature(
            "target_good_redeployment_match", "target", "skill_match",
            ["cosine_similarity_score"],
            f"1 if cosine_similarity_score above 75th percentile ({threshold:.3f}) — same "
            "quantile-threshold pattern as employment's target_high_automation_risk.",
        )

    if task_name == "human_capital" and "Termd" in df.columns:
        df["target_turnover"] = df["Termd"].astype(int)
        _log_feature(
            "target_turnover", "target", "human_capital", ["Termd"],
            "1 if the employee has left (Termd==1), 0 if still active.",
        )

    return df


# --------------------------------------------------------------------------- #
# Leakage screen (bug 9.2 fix, made a standing check)
# --------------------------------------------------------------------------- #
def check_leakage(df: pd.DataFrame, target_col: str, task_name: str, threshold: float = 0.3) -> List[str]:
    """
    Shuffle the target and re-check correlation against every numeric feature. A feature that
    still correlates above `threshold` with a *shuffled* target is almost certainly a direct or
    near-direct derivative of the real target (the failure mode that produced
    exposure_x_skill_complexity / cosine_similarity_score / training_x_skill_readiness — see
    config.py's drop_cols comments), not real predictive signal. Logs a warning per offending
    column and returns the list of flagged column names; does not raise or drop anything itself
    — callers decide whether to add the column to drop_cols.
    """
    if target_col not in df.columns:
        return []
    shuffled_target = df[target_col].sample(frac=1, random_state=config.RANDOM_STATE).reset_index(drop=True)
    flagged = []
    for col in df.select_dtypes(include=[np.number]).columns:
        if col == target_col:
            continue
        corr = abs(pd.Series(df[col]).reset_index(drop=True).corr(shuffled_target))
        if pd.notna(corr) and corr > threshold:
            flagged.append(col)
            logger.warning(
                "[%s] '%s' correlates %.2f with a SHUFFLED target — inspect for leakage.",
                task_name, col, corr,
            )
    if not flagged:
        logger.info("[%s] leakage screen: no numeric feature exceeded threshold=%.2f.", task_name, threshold)
    return flagged


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
    # Scoped to productivity only — it's the only task with a real `year` column. See
    # add_macro_context_features()'s docstring: it no-ops safely on any task without one, but
    # the call is still deliberately gated here rather than left unconditional, so it's an
    # explicit decision on record, not an accident of which tasks happen to have a year column.
    if task_name == "productivity":
        feat = add_macro_context_features(feat, task_name)
    feat = add_ratio_index_features(feat, task_name)
    feat = add_interaction_features(feat, task_name)
    feat = encode_categoricals(feat, task_name)
    feat = scale_numeric(feat, task_name, exclude_cols=[cfg.target], fit=True)
    feat = define_target(feat, task_name)
    check_leakage(feat, cfg.target, task_name)

    if save:
        save_processed(feat, task_name)
        save_feature_dictionary()

    return feat


def run_all_pipelines(save: bool = True) -> dict:
    """Run the feature engineering pipeline for every configured task head."""
    return {name: run_pipeline(name, save=save) for name in config.TASK_NAMES}
