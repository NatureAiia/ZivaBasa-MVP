"""
model.py (federated) — a standalone single-task Keras model for the federated simulation.

Deliberately NOT src/model.py's 5-task shared-trunk architecture — federating makes sense
per-institution, per-task (each simulated institution runs the same one-task model, not a
multi-task trunk shared across employment/skills/productivity/skill_match/human_capital, since
there's no cross-task benefit to federating a trunk that isn't shared across institutions in
the first place). This mirrors src/model.py's build_task_model() head shape (Dense(64)->
Dense(32)->output) so a federated-vs-centralized comparison isn't confounded by a different
architecture, but skips the adapter/shared-trunk machinery that only makes sense for combining
multiple *tasks*, not multiple *institutions* doing the same task.
"""
from __future__ import annotations

import tensorflow as tf
from tensorflow.keras import layers, Model


def build_federated_task_model(input_dim: int, task_type: str) -> Model:
    inputs = layers.Input(shape=(input_dim,), name="input")
    x = layers.Dense(64, activation="relu", name="dense64")(inputs)
    x = layers.Dense(32, activation="relu", name="dense32")(x)
    activation = "sigmoid" if task_type == "classification" else "linear"
    outputs = layers.Dense(1, activation=activation, name="output")(x)

    model = Model(inputs=inputs, outputs=outputs)
    loss = "binary_crossentropy" if task_type == "classification" else "mse"
    metrics = ["accuracy"] if task_type == "classification" else ["mae"]
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss=loss, metrics=metrics)
    return model
