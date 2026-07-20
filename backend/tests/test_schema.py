import pytest

TASKS = ["employment", "skills", "productivity", "skill_match"]


@pytest.mark.parametrize("task", TASKS)
def test_schema_returns_feature_names(client, task):
    r = client.get(f"/schema/{task}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == task
    assert body["task_type"] in {"classification", "regression"}
    assert body["input_dim"] == len(body["feature_names"]) > 0


def test_schema_unknown_task_404(client):
    r = client.get("/schema/not_a_real_task")
    assert r.status_code == 404


def test_forecast_schema_registered_before_task_schema(client):
    """/schema/forecast must resolve to the dedicated forecast handler, not fall through to
    /schema/{task} with task='forecast' (a route-ordering regression main.py calls out
    explicitly) — asserting on the forecast-shaped fields catches that regression."""
    r = client.get("/schema/forecast")
    assert r.status_code == 200
    body = r.json()
    assert "industries" in body and "metrics" in body
