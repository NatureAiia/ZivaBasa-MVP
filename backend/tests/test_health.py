TASKS = ["employment", "skills", "productivity", "skill_match", "human_capital"]


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["tasks_loaded"], list)


def test_health_all_tasks_loaded(client):
    """All five task models ship checked into the repo (backend/models/, backend/data/processed/),
    so a correctly configured environment should load every one of them at startup — a
    partial load here means an artifact went missing or the registry silently skipped a task."""
    r = client.get("/health")
    assert set(r.json()["tasks_loaded"]) == set(TASKS)
