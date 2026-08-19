"""
test_uplift.py — coverage for src/uplift.py (demo-readiness Phase B causal/uplift layer).

Uses a small synthetic bundle (known linear causal effect, same convention as
test_causal_xai.py/test_federated.py) rather than the real trained skills_uplift.pkl artifact,
so this runs fast and doesn't depend on scripts/train_uplift_model.py having been run.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from econml.dml import CausalForestDML
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

from src import uplift

rng = np.random.RandomState(0)
N = 400


def _build_synthetic_bundle():
    age = rng.uniform(20, 60, N)
    training_hours = rng.uniform(0, 10, N)  # treatment
    income = rng.uniform(2000, 8000, N)  # confounder
    derived = training_hours / 4  # deliberately derived FROM the treatment — must be excluded

    # Known ground truth: -0.05 attrition-probability per training_hours unit.
    attrition_prob = 0.5 - 0.05 * training_hours + 0.00005 * income + rng.normal(0, 0.05, N)

    feature_names = ["age", "training_hours", "income", "derived"]
    raw_df = pd.DataFrame(
        np.column_stack([age, training_hours, income, derived]), columns=feature_names
    )

    scaler = StandardScaler().fit(raw_df)
    scaled = scaler.transform(raw_df)

    confounders = ["age", "income"]
    t_idx = feature_names.index("training_hours")
    conf_idx = [feature_names.index(f) for f in confounders]

    model_y = RandomForestRegressor(n_estimators=50, max_depth=4, random_state=0)
    model_t = RandomForestRegressor(n_estimators=50, max_depth=4, random_state=0)
    est = CausalForestDML(
        model_y=model_y, model_t=model_t, discrete_treatment=False, random_state=0, n_estimators=200,
    )
    est.fit(attrition_prob, scaled[:, t_idx], X=scaled[:, conf_idx])

    return {
        "model": est,
        "task_name": "synthetic",
        "treatment_feature": "training_hours",
        "confounder_features": confounders,
        "feature_names": feature_names,
        "scaler": scaler,
        "scaler_index": list(range(len(feature_names))),
    }


def test_confounder_features_excludes_treatment_and_derived_features():
    confounders = uplift._confounder_features(
        ["Age", "TrainingTimesLastYear", "YearsAtCompany", "training_intensity_index", "training_x_satisfaction"]
    )
    assert confounders == ["Age", "YearsAtCompany"]


def test_estimate_treatment_effect_recovers_approximately_correct_sign_and_magnitude():
    bundle = _build_synthetic_bundle()
    raw_row = [35, 5, 5000, 5 / 4]  # age=35, training_hours=5, income=5000, derived
    result = uplift.estimate_treatment_effect(bundle, raw_row)

    assert result["treatment_feature"] == "training_hours"
    # Ground truth is -0.05/unit — the forest estimate won't be exact, but should be negative
    # and in a plausible ballpark, not wildly off (which would indicate the scaling/rescaling
    # math is wrong, e.g. reporting per-scaled-unit instead of per-raw-unit).
    assert -0.15 < result["estimated_effect_per_unit"] < 0.0
    lower, upper = result["effect_interval_90pct"]
    assert lower <= result["estimated_effect_per_unit"] <= upper


def test_estimate_treatment_effect_interpretation_mentions_significance():
    bundle = _build_synthetic_bundle()
    result = uplift.estimate_treatment_effect(bundle, [35, 5, 5000, 5 / 4])
    if result["statistically_significant_90pct"]:
        assert "includes zero" not in result["interpretation"]
    else:
        assert "includes zero" in result["interpretation"]
