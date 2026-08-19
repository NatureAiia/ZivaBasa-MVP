"""
simulation.py — Orchestrates the federated-learning SIMULATION: partitions one task's data
across N simulated institutions (partition.py), runs FedAvg rounds using each institution's
real fl.client.NumPyClient (client.py) and Flower's own weighted-average aggregation function,
then trains a centralized baseline (same architecture, same pooled data) for comparison.

SCOPE-DOWN DECISION (checked before writing code, same discipline as every other "compass doc
wants X, X has a real risk here" call this project has made): Flower's actual multi-process
simulation runtime (`fl.simulation.start_simulation` / `run_simulation`) requires Ray, which
is (a) not installed, (b) historically fragile on Windows, and (c) a heavy new dependency for
a demo spike. Ray was NOT installed to avoid gambling the whole simulation on it working on
this machine. Instead, this drives the FedAvg round loop directly in one process, but uses
Flower's REAL client interface (`fl.client.NumPyClient`, via `InstitutionClient`) and Flower's
REAL aggregation math (`flwr.server.strategy.aggregate.aggregate` — the exact weighted-average
function `FedAvg` itself calls internally) — so this is genuinely Flower-based, just without
Ray's process-isolation layer. Scoped down from "multi-process" to "multi-client-object,
single-process" simulation; labeled as such everywhere this output surfaces, not just here.

STILL A SIMULATION, regardless of the above: there are no real institutions, no real network
boundary, no real privacy guarantee enforced by anything outside this code. See the federated/
package docstring.
"""
from __future__ import annotations

import logging
from typing import Dict, List

import numpy as np
from flwr.server.strategy.aggregate import aggregate as fedavg_aggregate

from .. import config, evaluate, features
from . import model as federated_model
from . import partition as partition_module
from .client import InstitutionClient

logger = logging.getLogger(__name__)


def run_federated_simulation(
    task_name: str,
    num_institutions: int = 3,
    num_rounds: int = 5,
    local_epochs: int = 1,
    seed: int = config.RANDOM_STATE,
) -> Dict:
    """Returns a dict with per-round federated validation metrics (evaluated on the shared,
    global val split — never on any one institution's local data, matching how a real
    coordinator would evaluate a global model) alongside a centralized-baseline comparison."""
    df = features.load_processed(task_name)
    if df is None:
        raise RuntimeError(f"[{task_name}] no processed features found — run features.run_pipeline first.")
    splits = evaluate.make_splits(df, task_name, val_split=True, seed=seed)
    input_dim = splits["input_dim"]
    task_type = config.TASK_CONFIGS[task_name].task_type

    partitions = partition_module.partition_splits(splits, num_institutions, seed=seed)
    institution_ids = [f"simulated_institution_{i + 1}" for i in range(num_institutions)]
    clients = [
        InstitutionClient(institution_ids[i], partitions[i], input_dim, task_type, local_epochs)
        for i in range(num_institutions)
    ]

    global_model = federated_model.build_federated_task_model(input_dim, task_type)
    global_weights = global_model.get_weights()

    round_history: List[Dict] = []
    for round_num in range(1, num_rounds + 1):
        fit_results = []
        for client in clients:
            weights, num_examples, metrics = client.fit(global_weights)
            fit_results.append((weights, num_examples))
            logger.info(
                "[round %d] [%s] trained on %d local rows (never shared).",
                round_num, metrics["institution_id"], num_examples,
            )

        global_weights = fedavg_aggregate(fit_results)  # Flower's real FedAvg weighted average
        global_model.set_weights(global_weights)
        val_loss, val_metric = global_model.evaluate(splits["X_val"], splits["y_val"], verbose=0)
        round_history.append({"round": round_num, "val_loss": float(val_loss), "val_metric": float(val_metric)})
        logger.info("[round %d] global model val_loss=%.4f val_metric=%.4f", round_num, val_loss, val_metric)

    # Centralized baseline: same architecture, trained on ALL institutions' data pooled together
    # in one place — the thing federated learning exists to let you approach WITHOUT any
    # institution's raw data ever leaving its own boundary.
    centralized_model = federated_model.build_federated_task_model(input_dim, task_type)
    centralized_model.fit(
        splits["X_train"], splits["y_train"],
        epochs=num_rounds * local_epochs, batch_size=32, verbose=0,
    )
    centralized_loss, centralized_metric = centralized_model.evaluate(splits["X_val"], splits["y_val"], verbose=0)

    return {
        "task": task_name,
        "num_institutions": num_institutions,
        "num_rounds": num_rounds,
        "institution_ids": institution_ids,
        "round_history": round_history,
        "final_federated_val_loss": round_history[-1]["val_loss"],
        "final_federated_val_metric": round_history[-1]["val_metric"],
        "centralized_val_loss": float(centralized_loss),
        "centralized_val_metric": float(centralized_metric),
        "SIMULATED": True,
        "simulation_note": (
            "Multi-client-object simulation in ONE process on ONE machine — NOT real "
            "institutions, NOT a network-isolated deployment, NOT production federated "
            "learning. Uses Flower's real NumPyClient interface and real FedAvg aggregation "
            "math; does not use Flower's Ray-based multi-process simulation runtime (Ray is "
            "not installed — see this module's docstring for why). See src/federated/ "
            "package docstring."
        ),
    }
