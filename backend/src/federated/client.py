"""
client.py — Flower NumPyClient wrapping one simulated institution's local model + data
partition. Only get_parameters()/fit()'s return value (updated weights + example count) ever
leaves this client — raw X_train/y_train never do, which is the entire point of federated
learning. In this simulation that boundary is a Python object boundary, not a network/firewall
boundary — see the federated/ package docstring.
"""
from __future__ import annotations

from typing import Dict

import flwr as fl

from . import model as federated_model


class InstitutionClient(fl.client.NumPyClient):
    def __init__(self, institution_id: str, partition: Dict, input_dim: int, task_type: str, local_epochs: int = 1):
        self.institution_id = institution_id
        self.model = federated_model.build_federated_task_model(input_dim, task_type)
        self.partition = partition
        self.local_epochs = local_epochs

    def get_parameters(self, config=None):
        return self.model.get_weights()

    def fit(self, parameters, config=None):
        self.model.set_weights(parameters)
        self.model.fit(
            self.partition["X_train"], self.partition["y_train"],
            epochs=self.local_epochs, batch_size=32, verbose=0,
        )
        return self.model.get_weights(), len(self.partition["X_train"]), {"institution_id": self.institution_id}

    def evaluate(self, parameters, config=None):
        self.model.set_weights(parameters)
        loss, metric = self.model.evaluate(self.partition["X_val"], self.partition["y_val"], verbose=0)
        return float(loss), len(self.partition["X_val"]), {"metric": float(metric)}
