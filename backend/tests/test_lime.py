"""
test_lime.py — coverage for src/evaluate.py::compute_lime_values()/shap_lime_agreement() and
their wiring into POST /explain/{task}?include_lime=true.
"""
from __future__ import annotations

import pytest


def test_explain_default_omits_lime(client):
    """Existing behavior unchanged when include_lime isn't passed — additive field stays None."""
    feature_names = client.get("/schema/employment").json()["feature_names"]
    features = [1.0] * len(feature_names)
    r = client.post("/explain/employment", json={"features": features})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lime_top_contributions"] is None
    assert body["agreement_score"] is None


@pytest.mark.parametrize("task", ["employment", "skills", "productivity", "skill_match"])
def test_explain_include_lime_true(client, task):
    feature_names = client.get(f"/schema/{task}").json()["feature_names"]
    features = [1.0] * len(feature_names)
    r = client.post(f"/explain/{task}?include_lime=true", json={"features": features})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lime_top_contributions"] is not None
    assert len(body["lime_top_contributions"]) > 0
    assert 0.0 <= body["agreement_score"] <= 1.0
    # Every LIME feature name must be a real feature of this task, not a fabricated label.
    lime_features = {c["feature"] for c in body["lime_top_contributions"]}
    assert lime_features.issubset(set(feature_names))


def test_shap_lime_agreement_full_overlap():
    from src import evaluate
    assert evaluate.shap_lime_agreement(["a", "b", "c"], ["a", "b", "c"]) == 1.0


def test_shap_lime_agreement_no_overlap():
    from src import evaluate
    assert evaluate.shap_lime_agreement(["a", "b"], ["c", "d"]) == 0.0


def test_shap_lime_agreement_partial_overlap():
    from src import evaluate
    assert evaluate.shap_lime_agreement(["a", "b", "c", "d"], ["a", "b", "x", "y"]) == 0.5


def test_shap_lime_agreement_empty_shap_side():
    from src import evaluate
    assert evaluate.shap_lime_agreement([], ["a"]) == 0.0
