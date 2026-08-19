"""
test_federated_endpoint.py — integration coverage for POST /federated/simulate (demo-readiness
Phase C: the head-of-state track's live federated-simulation demo).
"""


def test_federated_simulate_runs_and_returns_rounds(client):
    r = client.post("/federated/simulate", json={"task": "skills", "num_institutions": 2, "num_rounds": 2})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["SIMULATED"] is True
    assert "NOT real institutions" in body["simulation_note"]
    assert len(body["institution_ids"]) == 2
    assert len(body["round_history"]) == 2
    assert "centralized_val_loss" in body


def test_federated_simulate_rejects_too_few_institutions(client):
    r = client.post("/federated/simulate", json={"task": "skills", "num_institutions": 1, "num_rounds": 1})
    assert r.status_code == 422


def test_federated_simulate_unknown_task_422(client):
    r = client.post("/federated/simulate", json={"task": "not_a_real_task", "num_institutions": 2, "num_rounds": 1})
    assert r.status_code == 422
