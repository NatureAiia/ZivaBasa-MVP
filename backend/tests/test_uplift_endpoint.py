"""
test_uplift_endpoint.py — integration coverage for POST /uplift/{task}, using the real trained
skills_uplift.pkl artifact (scripts/train_uplift_model.py must have been run — same assumption
test_predict_explain.py etc. already make about the committed model artifacts).
"""


def test_uplift_skills_returns_effect_estimate(client):
    schema = client.get("/schema/skills").json()
    features = [30, 1, 4, 4500, 2, 3, 1 / 4, (1 / 4) * 2]
    assert len(features) == len(schema["feature_names"])

    r = client.post("/uplift/skills", json={"features": features})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == "skills"
    assert body["treatment_feature"] == "TrainingTimesLastYear"
    assert len(body["effect_interval_90pct"]) == 2
    assert body["effect_interval_90pct"][0] <= body["estimated_effect_per_unit"] <= body["effect_interval_90pct"][1]
    assert isinstance(body["statistically_significant_90pct"], bool)
    assert "TrainingTimesLastYear" in body["interpretation"]


def test_uplift_wrong_feature_count_422(client):
    r = client.post("/uplift/skills", json={"features": [1, 2, 3]})
    assert r.status_code == 422


def test_uplift_unknown_task_503(client):
    r = client.post("/uplift/not_a_real_task", json={"features": [1, 2, 3]})
    assert r.status_code == 503
