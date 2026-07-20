import pytest

TASKS = ["employment", "skills", "productivity", "skill_match"]


@pytest.mark.parametrize("task", TASKS)
def test_batch_predict_valid_csv(client, task):
    feature_names = client.get(f"/schema/{task}").json()["feature_names"]
    header = ",".join(feature_names)
    row = ",".join("1.0" for _ in feature_names)
    csv_bytes = f"{header}\n{row}\n{row}\n".encode()

    r = client.post(
        f"/predict/batch/{task}",
        files={"file": ("upload.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == task
    assert body["n_rows"] == 2
    assert body["n_dropped"] == 0
    assert "aggregate" in body and body["aggregate"] is not None
    assert len(body["rows"]) == 2
    assert len(body["top_rows"]) > 0


def test_batch_predict_missing_columns_422(client):
    r = client.post(
        "/predict/batch/employment",
        files={"file": ("upload.csv", b"some_other_column\n1.0\n", "text/csv")},
    )
    assert r.status_code == 422
    assert "Missing required column" in r.json()["detail"]


def test_batch_predict_non_csv_rejected(client):
    r = client.post(
        "/predict/batch/employment",
        files={"file": ("upload.txt", b"not a csv", "text/plain")},
    )
    assert r.status_code == 422


def test_batch_predict_empty_csv_422(client):
    feature_names = client.get("/schema/employment").json()["feature_names"]
    header = ",".join(feature_names)
    r = client.post(
        "/predict/batch/employment",
        files={"file": ("upload.csv", f"{header}\n".encode(), "text/csv")},
    )
    assert r.status_code == 422


def test_batch_predict_unknown_task_404(client):
    r = client.post(
        "/predict/batch/not_a_real_task",
        files={"file": ("upload.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert r.status_code == 404
