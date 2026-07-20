def test_forecast_schema(client):
    r = client.get("/schema/forecast")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["industries"], list) and body["industries"]
    assert isinstance(body["metrics"], list) and body["metrics"]
    assert body["max_horizon"] >= body["default_horizon"] > 0


def test_predict_forecast_default_horizon(client):
    schema = client.get("/schema/forecast").json()
    industry = schema["industries"][0]
    r = client.get(f"/predict/forecast/{industry}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["industry"] == industry
    assert body["metrics"] == schema["metrics"]
    assert len(body["history"]) > 0
    assert len(body["forecast"]) == schema["default_horizon"]


def test_predict_forecast_explicit_horizon(client):
    schema = client.get("/schema/forecast").json()
    industry = schema["industries"][0]
    r = client.get(f"/predict/forecast/{industry}", params={"years": 2})
    assert r.status_code == 200, r.text
    assert len(r.json()["forecast"]) == 2


def test_predict_forecast_unknown_industry_404(client):
    r = client.get("/predict/forecast/NotARealIndustry")
    assert r.status_code == 404
