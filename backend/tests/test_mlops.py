def test_mlops_status(client):
    r = client.get("/mlops/status")
    assert r.status_code == 200
    body = r.json()
    assert "latest_retrain_report" in body
    assert "drift_baselines_available_for" in body
    assert isinstance(body["drift_baselines_available_for"], list)
