import pytest

TASKS = ["employment", "skills", "productivity", "skill_match"]


def _dummy_features(client, task):
    schema = client.get(f"/schema/{task}").json()
    return [0.0] * schema["input_dim"]


@pytest.mark.parametrize("task", TASKS)
def test_predict_valid_input(client, task):
    features = _dummy_features(client, task)
    r = client.post(f"/predict/{task}", json={"features": features})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == task
    assert isinstance(body["raw_output"], float)
    if body["task_type"] == "classification":
        assert body["label"] in (0, 1)
        assert 0.0 <= body["probability"] <= 1.0
    else:
        assert body["label"] is None
        assert body["probability"] is None


@pytest.mark.parametrize("task", TASKS)
def test_predict_wrong_feature_count_422(client, task):
    features = _dummy_features(client, task)
    r = client.post(f"/predict/{task}", json={"features": features[:-1]})
    assert r.status_code == 422


def test_predict_unknown_task_404(client):
    r = client.post("/predict/not_a_real_task", json={"features": [0.0]})
    assert r.status_code == 404


@pytest.mark.parametrize("task", TASKS)
def test_explain_valid_input(client, task):
    features = _dummy_features(client, task)
    r = client.post(f"/explain/{task}", json={"features": features}, params={"top_k": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == task
    assert 0 < len(body["top_contributions"]) <= min(5, len(features))
    for c in body["top_contributions"]:
        assert set(c) == {"feature", "value", "shap_value"}
    # Sorted by |shap_value| descending, per main.py's explain() handler.
    magnitudes = [abs(c["shap_value"]) for c in body["top_contributions"]]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_explain_wrong_feature_count_422(client):
    r = client.post("/explain/employment", json={"features": [0.0]})
    assert r.status_code == 422


def test_explain_unknown_task_404(client):
    r = client.post("/explain/not_a_real_task", json={"features": [0.0]})
    assert r.status_code == 404
