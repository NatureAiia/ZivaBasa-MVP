"""
uplift.py — Causal/uplift layer for the flagship attrition-risk use case (demo-readiness Phase B,
pulled forward from the compass doc's causal-consistent XAI Stage 2, scoped down per the demo
prompt's explicit instruction: "don't attempt full causal-consistent architecture ... an uplift
model/causal forest ... answering 'does training hours actually move attrition risk, or just
correlate with it' for the attrition use case specifically").

Answers exactly that question for the `skills` task (IBM HR attrition proxy data): does
TrainingTimesLastYear (the recommended retention lever) causally move target_attrition, or does
ordinary SHAP's correlation-based attribution just make it look that way?

Tool: EconML's CausalForestDML (a generalized random forest for heterogeneous treatment-effect
estimation — Athey/Wager/Tibshirani/Chernozhukov et al.'s double machine learning), chosen over
CausalML for a checked, concrete reason: EconML installs cleanly against this project's pinned
numpy (verified via `pip install econml --dry-run` before installing, same check applied to
every dependency addition this project has made this session); CausalML has historically had a
heavier, more fragile native-extension build chain.

LEAKAGE NOTE, read before touching the confounder list: of the 8 modeling features
`evaluate.make_splits("skills")` returns, `training_intensity_index` and
`training_x_satisfaction` are BOTH derived from TrainingTimesLastYear (see config.py's
TASK_CONFIGS["skills"] comment and features.py's ratio/interaction feature builders). If either
were included as a confounder/covariate here, the treatment would leak into its own covariates
and contaminate the causal estimate — the model would partly be "explaining" TrainingTimesLastYear
using a near-deterministic function of itself. Both are deliberately EXCLUDED from the
confounder set below: treatment (T) is TrainingTimesLastYear; confounders (X) are the 5
remaining, treatment-independent features (Age, YearsAtCompany, MonthlyIncome, JobSatisfaction,
PerformanceRating).

SCALING NOTE, the second thing to get right here (found and fixed before this shipped, not
after): `features.load_processed()` returns data that's ALREADY standardized —
`features.run_pipeline()` calls `scale_numeric()` before saving to `data/processed/`, same as
every other task. So this module trains on scaled T/X/Y, same as model.py's Keras heads. But
`api/model_registry.py`'s public convention is that callers pass RAW feature values (see
`TaskArtifacts.transform()`) — so `estimate_treatment_effect()` below accepts RAW values and
applies the task's saved StandardScaler internally, exactly like TaskArtifacts does, using the
same scaler_index name-mapping (the scaler was fit on more columns than survive into the
modeling matrix, so features must be matched by name, not position). The treatment effect
itself is also rescaled back from "per scaled-unit" to "per raw-unit" (dividing by the
treatment feature's scaler.scale_) so the reported number means "per one additional real
training session," not "per one standard deviation of a z-score" — the latter is correct but
useless to say out loud in a demo.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, List

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor

from . import config, evaluate, features

logger = logging.getLogger(__name__)

UPLIFT_DIR = os.path.join(config.MODELS_DIR, "uplift")

TREATMENT_FEATURE = "TrainingTimesLastYear"
DERIVED_FROM_TREATMENT = {"training_intensity_index", "training_x_satisfaction"}


def _confounder_features(all_features: List[str]) -> List[str]:
    return [
        f
        for f in all_features
        if f != TREATMENT_FEATURE and f not in DERIVED_FROM_TREATMENT
    ]


def train_uplift_model(
    task_name: str = "skills", seed: int = config.RANDOM_STATE
) -> Dict:
    try:
        from econml.dml import CausalForestDML
    except ImportError as e:
        raise RuntimeError(
            "Uplift model training requires the econml Python package. "
            "Install it with `pip install econml`."
        ) from e

    df = features.load_processed(task_name)
    if df is None:
        raise RuntimeError(
            f"[{task_name}] no processed features found — run features.run_pipeline first."
        )
    splits = evaluate.make_splits(df, task_name, val_split=False, seed=seed)
    feature_names = splits["feature_names"]
    if TREATMENT_FEATURE not in feature_names:
        raise ValueError(
            f"[{task_name}] treatment feature '{TREATMENT_FEATURE}' not in modeling features: {feature_names}"
        )

    scaler_path = os.path.join(config.SCALER_DIR, f"{task_name}_scaler.pkl")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(
            f"No saved scaler at {scaler_path} — run features.run_pipeline('{task_name}') first."
        )
    scaler = joblib.load(scaler_path)
    scaler_names = list(getattr(scaler, "feature_names_in_", []))
    scaler_index = [scaler_names.index(name) for name in feature_names]

    confounders = _confounder_features(feature_names)
    X_full = np.asarray(splits["X_train"])
    t_idx = feature_names.index(TREATMENT_FEATURE)
    conf_idx = [feature_names.index(f) for f in confounders]

    T = X_full[:, t_idx]
    X = X_full[:, conf_idx]
    Y = np.asarray(splits["y_train"])

    # Nuisance models (double ML's "first stage"): predict Y from X, predict T from X, then
    # CausalForestDML estimates the treatment effect from what's left over (the residuals) —
    # this is what lets it separate "training hours causes lower attrition" from "people who
    # get more training also happen to have other attrition-lowering traits." model_y is a
    # regressor, not a classifier, even though Y (target_attrition) is 0/1 — EconML's DML
    # framework requires continuous-valued nuisance predictions (regressing onto 0/1 estimates
    # P(Y=1|X) directly, a standard and valid choice; a classifier's discrete predict() output
    # would break the residual-on-residual regression CausalForestDML relies on).
    model_y = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=seed)
    model_t = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=seed)

    est = CausalForestDML(
        model_y=model_y,
        model_t=model_t,
        discrete_treatment=False,
        random_state=seed,
        n_estimators=200,
    )
    est.fit(Y, T, X=X)

    logger.info(
        "[%s] uplift model trained. treatment=%s confounders=%s",
        task_name,
        TREATMENT_FEATURE,
        confounders,
    )

    return {
        "model": est,
        "task_name": task_name,
        "treatment_feature": TREATMENT_FEATURE,
        "confounder_features": confounders,
        "feature_names": feature_names,
        "scaler": scaler,
        "scaler_index": scaler_index,
    }


def save_uplift_model(bundle: Dict, directory: str = UPLIFT_DIR) -> str:
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f"{bundle['task_name']}_uplift.pkl")
    joblib.dump(bundle, path)
    logger.info("Uplift model saved -> %s", path)
    return path


def load_uplift_model(task_name: str = "skills", directory: str = UPLIFT_DIR) -> Dict:
    path = os.path.join(directory, f"{task_name}_uplift.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No saved uplift model for '{task_name}' at {path}. Run scripts/train_uplift_model.py first."
        )
    return joblib.load(path)


def _scale_row(bundle: Dict, raw_features_ordered: List[float]) -> np.ndarray:
    """Applies the task's saved StandardScaler to a raw feature vector, matching
    api/model_registry.py's TaskArtifacts.transform() exactly (same name-indexed mapping,
    since the scaler was fit on more columns than survive into the modeling matrix)."""
    scaler, scaler_index = bundle["scaler"], bundle["scaler_index"]
    mean_, scale_ = scaler.mean_, scaler.scale_
    return np.asarray(
        [
            (raw_features_ordered[i] - mean_[scaler_index[i]]) / scale_[scaler_index[i]]
            for i in range(len(raw_features_ordered))
        ]
    )


def estimate_treatment_effect(bundle: Dict, raw_features_ordered: List[float]) -> Dict:
    """raw_features_ordered: a full feature vector in bundle['feature_names'] order, RAW/
    unscaled — same convention as /predict and /explain's request bodies (GET /schema/{task}
    gives the order). Scaled internally before reaching the causal forest; see module
    docstring's SCALING NOTE for why, and why the reported effect is rescaled back to
    per-raw-unit terms."""
    feature_names = bundle["feature_names"]
    confounders = bundle["confounder_features"]
    conf_idx = [feature_names.index(f) for f in confounders]
    t_idx = feature_names.index(bundle["treatment_feature"])

    scaled_row = _scale_row(bundle, raw_features_ordered)
    X_row = scaled_row[conf_idx][np.newaxis, :]

    treatment_scale = bundle["scaler"].scale_[bundle["scaler_index"][t_idx]]

    effect_scaled = float(bundle["model"].effect(X_row)[0])
    lower_scaled, upper_scaled = bundle["model"].effect_interval(X_row, alpha=0.10)
    effect = effect_scaled / treatment_scale
    lower, upper = (
        float(lower_scaled[0]) / treatment_scale,
        float(upper_scaled[0]) / treatment_scale,
    )
    lower, upper = (
        min(lower, upper),
        max(lower, upper),
    )  # dividing by a positive scale keeps order, but be safe

    direction = "reduces" if effect < 0 else "increases"
    significant = not (lower <= 0 <= upper)  # 90% interval excludes zero

    return {
        "treatment_feature": bundle["treatment_feature"],
        "estimated_effect_per_unit": effect,
        "effect_interval_90pct": [lower, upper],
        "statistically_significant_90pct": significant,
        "interpretation": (
            f"Estimated causal effect: each additional unit of {bundle['treatment_feature']} "
            f"{direction} attrition probability by {abs(effect):.4f} on average for an employee "
            f"with these characteristics (90% interval: [{lower:.4f}, {upper:.4f}])."
            + (
                ""
                if significant
                else " This interval includes zero — not distinguishable from "
                "no effect at this confidence level for this employee."
            )
        ),
    }
