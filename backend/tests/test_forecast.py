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


def test_predict_forecast_includes_confidence_interval(client):
    """Demo-readiness Phase A: a 3-year trajectory needs a confidence interval, not just a
    point estimate, per the CEO/Head-of-State demo prompt's own acceptance criterion."""
    schema = client.get("/schema/forecast").json()
    industry = schema["industries"][0]
    metrics = schema["metrics"]
    r = client.get(f"/predict/forecast/{industry}", params={"years": 3})
    assert r.status_code == 200, r.text
    body = r.json()

    assert 0 < body["confidence_level"] < 1
    assert "MC-dropout" in body["uncertainty_method"]
    assert len(body["forecast"]) == 3

    for point in body["forecast"]:
        for m in metrics:
            lower, value, upper = point["values"][f"{m}_lower"], point["values"][m], point["values"][f"{m}_upper"]
            assert lower <= value <= upper
            # Non-degenerate: the MC-dropout ensemble actually produced variance, this isn't a
            # placeholder interval collapsed onto the point estimate.
            assert upper > lower
