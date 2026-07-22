"""
test_federated.py — coverage for src/federated/ (Phase 4 federated-learning SIMULATION).

Uses small synthetic data (same convention as test_ple_model_smoke.py/test_causal_xai.py) so
this runs fast and doesn't depend on the real processed datasets being present.
"""
from __future__ import annotations

import numpy as np
import pytest
from flwr.server.strategy.aggregate import aggregate as fedavg_aggregate

from src.federated import model as federated_model
from src.federated import partition as partition_module
from src.federated.client import InstitutionClient

rng = np.random.RandomState(0)


def test_partition_indices_are_disjoint_and_cover_all_rows():
    partitions = partition_module.partition_indices(n_rows=100, num_institutions=3, seed=1)
    assert len(partitions) == 3
    all_idx = np.concatenate(partitions)
    assert len(all_idx) == 100
    assert len(set(all_idx.tolist())) == 100  # no overlap, full coverage


def test_partition_splits_shares_val_but_splits_train():
    splits = {
        "X_train": rng.normal(size=(90, 4)).astype("float32"),
        "y_train": rng.randint(0, 2, size=90).astype("float32"),
        "X_val": rng.normal(size=(20, 4)).astype("float32"),
        "y_val": rng.randint(0, 2, size=20).astype("float32"),
    }
    partitions = partition_module.partition_splits(splits, num_institutions=3, seed=1)
    assert len(partitions) == 3
    total_train_rows = sum(len(p["X_train"]) for p in partitions)
    assert total_train_rows == 90
    for p in partitions:
        assert len(p["X_val"]) == 20  # shared global val split, not partitioned


def test_institution_client_fit_returns_weights_and_example_count():
    X = rng.normal(size=(60, 5)).astype("float32")
    y = rng.randint(0, 2, size=60).astype("float32")
    partition = {"X_train": X[:40], "y_train": y[:40], "X_val": X[40:], "y_val": y[40:]}

    client = InstitutionClient("inst_1", partition, input_dim=5, task_type="classification", local_epochs=1)
    initial_weights = client.get_parameters()

    updated_weights, num_examples, metrics = client.fit(initial_weights)
    assert num_examples == 40
    assert metrics["institution_id"] == "inst_1"
    assert len(updated_weights) == len(initial_weights)


def test_fedavg_aggregate_is_weighted_by_example_count():
    """Two clients with identical single-layer 'weights' but very different example counts —
    the aggregate should be pulled toward the larger client's value, not a plain 50/50 average."""
    small_client = ([np.array([0.0])], 10)
    large_client = ([np.array([10.0])], 90)
    result = fedavg_aggregate([small_client, large_client])
    assert result[0][0] == pytest.approx(9.0)  # (0*10 + 10*90) / 100 = 9.0, not 5.0


def test_run_federated_simulation_end_to_end_on_synthetic_task(monkeypatch):
    """Exercises the full orchestration (partition -> per-institution fit -> FedAvg aggregate
    -> centralized baseline) without touching real processed data, by monkeypatching
    features.load_processed and evaluate.make_splits to return small synthetic splits."""
    from src.federated import simulation as sim_module

    X = rng.normal(size=(200, 4)).astype("float32")
    y = rng.randint(0, 2, size=200).astype("float32")
    fake_splits = {
        "X_train": X[:160], "y_train": y[:160],
        "X_val": X[160:], "y_val": y[160:],
        "input_dim": 4,
    }

    monkeypatch.setattr(sim_module.features, "load_processed", lambda task_name: object())
    monkeypatch.setattr(sim_module.evaluate, "make_splits", lambda df, task_name, val_split, seed: fake_splits)
    monkeypatch.setitem(sim_module.config.TASK_CONFIGS, "skills", sim_module.config.TASK_CONFIGS["skills"])

    result = sim_module.run_federated_simulation("skills", num_institutions=2, num_rounds=2, local_epochs=1)

    assert result["SIMULATED"] is True
    assert result["num_institutions"] == 2
    assert len(result["round_history"]) == 2
    assert "final_federated_val_loss" in result
    assert "centralized_val_loss" in result
    assert "simulation_note" in result and "NOT real institutions" in result["simulation_note"]
