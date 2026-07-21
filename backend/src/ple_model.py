"""
ple_model.py — PLE (Progressive Layered Extraction) / CGC task towers with VSN+GRN feature
selection, built ALONGSIDE model.py (not replacing it) as a Phase 2 architecture spike, per the
Next-Gen Architecture research prompt's compass doc (Section 1) and its own benchmark-gate rule:
keep this only if scripts/benchmark_ple_vs_baseline.py shows no per-task regression vs. the
existing shared-trunk model AND a measurable seesaw reduction on at least one task.

Scope note (stated up front, not discovered mid-implementation): this repo's features are flat
per-row scalar vectors, not grouped multi-source tabular+temporal data — there's no time
dimension yet (checklist Section 2, "Learned features" ⬜). So VariableSelectionNetwork here is
a per-scalar-feature selection network (one GRN per input feature, softmax gate over all
features), not the richer per-*group* selection TFT uses over multi-source temporal inputs.
That's a deliberate simplification matched to what this repo's data actually looks like, not the
full TFT VSN.

Simplification #2: this implements a single CGC (Customized Gate Control) layer — shared +
per-task private experts, one gate per task — not multi-layer *progressive* extraction (stacked
CGC layers). A single layer is the minimal step that actually tests the "does separating
task-specific from shared capacity reduce the seesaw" hypothesis; stacking is pure added
complexity until that hypothesis is confirmed useful (minimalism over abstraction).

Duplication note: PLEMultiTaskTrainer's train/validation loop mirrors model.MultiTaskTrainer's
almost line for line (custom tf.GradientTape loop, manual early stopping + ReduceLROnPlateau —
Keras callbacks don't attach to custom loops). This is deliberate duplication, not an oversight:
extracting a shared base trainer would mean touching model.py's tested, currently-served code for
a spike that might not survive the benchmark. Revisit (extract a shared base) only if PLE wins.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

import keras
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model

from . import config
from . import model as model_module  # reuse collect_unique_trainable_vars, not duplicated here

logger = logging.getLogger(__name__)

TaskType = config.TaskType


# --------------------------------------------------------------------------- #
# Gated Residual Network (GRN)
# --------------------------------------------------------------------------- #
@keras.saving.register_keras_serializable(package="ple_model")
class GatedResidualNetwork(layers.Layer):
    """Dense->ELU->Dense->Dropout->GLU gate->residual add->LayerNorm, per the TFT paper /
    official Keras GRN+VSN example. The GLU gate lets the network learn to skip nonlinear
    processing entirely (gate -> 0) when a feature/expert isn't useful for a given input."""

    def __init__(self, units: int, dropout_rate: float = 0.2, **kwargs):
        super().__init__(**kwargs)
        self.units = units
        self.dropout_rate = dropout_rate
        self.elu_dense = layers.Dense(units, activation="elu")
        self.linear_dense = layers.Dense(units)
        self.dropout = layers.Dropout(dropout_rate)
        self.gate_dense = layers.Dense(units * 2)  # split into (value, gate) for GLU
        self.layer_norm = layers.LayerNormalization()
        self.project: Optional[layers.Dense] = None

    def build(self, input_shape):
        if input_shape[-1] != self.units:
            self.project = layers.Dense(self.units)
        super().build(input_shape)

    def call(self, x, training: bool = False):
        residual = self.project(x) if self.project is not None else x
        h = self.elu_dense(x)
        h = self.linear_dense(h)
        h = self.dropout(h, training=training)
        value, gate = tf.split(self.gate_dense(h), num_or_size_splits=2, axis=-1)
        h = value * tf.sigmoid(gate)
        return self.layer_norm(h + residual)

    def get_config(self):
        config = super().get_config()
        config.update({"units": self.units, "dropout_rate": self.dropout_rate})
        return config


# --------------------------------------------------------------------------- #
# Variable Selection Network (VSN) — per-scalar-feature version (see module docstring)
# --------------------------------------------------------------------------- #
@keras.saving.register_keras_serializable(package="ple_model")
class VariableSelectionNetwork(layers.Layer):
    """Projects each of num_features scalar inputs into `units` dims (a shared linear
    embedding, applied per-feature since Dense broadcasts over all but the last axis), runs
    an independent GRN per feature, then combines them via softmax selection weights learned
    from the raw input — instance-wise feature importance, usable directly for interpretability
    (the softmax weights ARE the per-prediction feature-selection signal)."""

    def __init__(self, num_features: int, units: int, dropout_rate: float = 0.2, **kwargs):
        super().__init__(**kwargs)
        self.num_features = num_features
        self.units = units
        self.dropout_rate = dropout_rate
        self.feature_embedding = layers.Dense(units)
        self.feature_grns = [
            GatedResidualNetwork(units, dropout_rate, name=f"{self.name}_feature_grn_{i}")
            for i in range(num_features)
        ]
        self.weight_grn = GatedResidualNetwork(num_features, dropout_rate, name=f"{self.name}_weight_grn")
        self.softmax_dense = layers.Dense(num_features, activation="softmax")

    def call(self, inputs, training: bool = False):
        # inputs: (batch, num_features)
        expanded = tf.expand_dims(inputs, axis=-1)             # (batch, num_features, 1)
        embedded = self.feature_embedding(expanded)            # (batch, num_features, units)
        processed = tf.stack(
            [self.feature_grns[i](embedded[:, i, :], training=training) for i in range(self.num_features)],
            axis=1,
        )  # (batch, num_features, units)

        weight_logits = self.weight_grn(inputs, training=training)  # (batch, num_features)
        weights = self.softmax_dense(weight_logits)                 # (batch, num_features)
        weights = tf.expand_dims(weights, axis=-1)                  # (batch, num_features, 1)
        return tf.reduce_sum(processed * weights, axis=1)           # (batch, units)

    def get_config(self):
        config = super().get_config()
        config.update({
            "num_features": self.num_features,
            "units": self.units,
            "dropout_rate": self.dropout_rate,
        })
        return config


# --------------------------------------------------------------------------- #
# PLE / CGC layer
# --------------------------------------------------------------------------- #
@keras.saving.register_keras_serializable(package="ple_model")
class _WeightedExpertSum(layers.Layer):
    """Stacks expert outputs and combines them via gate weights. A raw tf.stack/tf.reduce_sum
    can't be applied directly to KerasTensors while building a Functional model — it has to
    happen inside an actual Layer's call() for Keras to trace it correctly."""

    def call(self, expert_outputs: list, gate_weights):
        stacked = tf.stack(expert_outputs, axis=1)            # (batch, num_experts, expert_dim)
        weights = tf.expand_dims(gate_weights, axis=-1)        # (batch, num_experts, 1)
        return tf.reduce_sum(stacked * weights, axis=1)        # (batch, expert_dim)


class PLELayer:
    """Holds one pool of shared GRN experts plus one private GRN-expert pool per task, and one
    softmax gate per task over [shared experts; that task's private experts]. Unlike
    SharedTrunk (model.py), calling a task's gate never routes gradient into another task's
    private experts — only the shared pool receives gradient signal from every task, which is
    the mechanism PLE/CGC uses to control negative transfer ("seesaw")."""

    def __init__(self, task_names: List[str], cfg: config.PLEModelConfig):
        self.task_names = task_names
        self.shared_experts = [
            GatedResidualNetwork(cfg.expert_dim, cfg.dropout_rate, name=f"shared_expert_{i}")
            for i in range(cfg.num_shared_experts)
        ]
        self.task_experts = {
            name: [
                GatedResidualNetwork(cfg.expert_dim, cfg.dropout_rate, name=f"{name}_expert_{i}")
                for i in range(cfg.num_task_experts)
            ]
            for name in task_names
        }
        self.task_gates = {
            name: layers.Dense(
                cfg.num_shared_experts + cfg.num_task_experts, activation="softmax", name=f"{name}_gate"
            )
            for name in task_names
        }
        self.combiners = {name: _WeightedExpertSum(name=f"{name}_expert_combiner") for name in task_names}

    def __call__(self, task_name: str, x, training: bool = False):
        experts = [e(x, training=training) for e in self.shared_experts]
        experts += [e(x, training=training) for e in self.task_experts[task_name]]
        gate_weights = self.task_gates[task_name](x)              # (batch, num_experts)
        return self.combiners[task_name](experts, gate_weights)   # (batch, expert_dim)


def build_ple_task_model(
    task_name: str,
    input_dim: int,
    task_type: TaskType,
    vsn: VariableSelectionNetwork,
    ple: PLELayer,
    cfg: config.PLEModelConfig,
) -> Model:
    """One task's full path: VSN (per-task, since input_dim varies per task) -> PLE (shared
    across tasks) -> head -> output. Head shape matches model.py's build_task_model() (64->32)
    so the two architectures differ only in adapter+trunk, not head capacity."""
    inputs = layers.Input(shape=(input_dim,), name=f"{task_name}_input")
    vsn_out = vsn(inputs, training=True)
    ple_out = ple(task_name, vsn_out, training=True)

    head = layers.Dense(64, activation="relu", name=f"{task_name}_head_dense64")(ple_out)
    head = layers.Dense(32, activation="relu", name=f"{task_name}_head_dense32")(head)

    activation = "sigmoid" if task_type == "classification" else "linear"
    outputs = layers.Dense(1, activation=activation, name=f"{task_name}_output")(head)

    return Model(inputs=inputs, outputs=outputs, name=f"{task_name}_ple_model")


# --------------------------------------------------------------------------- #
# Trainer — same public interface as model.MultiTaskTrainer (fit/predict/save/load_task_model)
# so scripts/benchmark_ple_vs_baseline.py can drive both identically.
# --------------------------------------------------------------------------- #
class PLEMultiTaskTrainer:
    def __init__(
        self,
        input_dims: Dict[str, int],
        task_types: Optional[Dict[str, TaskType]] = None,
        loss_weights: Optional[Dict[str, float]] = None,
        cfg: config.PLEModelConfig = config.PLE_MODEL_CONFIG,
        seed: int = config.RANDOM_STATE,
    ):
        tf.random.set_seed(seed)
        np.random.seed(seed)

        self.cfg = cfg
        self.task_names = list(input_dims.keys())
        self.task_types = task_types or {
            name: config.TASK_CONFIGS[name].task_type for name in self.task_names
        }
        self.loss_weights = loss_weights or {
            name: config.TASK_CONFIGS[name].loss_weight for name in self.task_names
        }

        self.vsns = {
            name: VariableSelectionNetwork(input_dims[name], cfg.expert_dim, cfg.vsn_dropout, name=f"{name}_vsn")
            for name in self.task_names
        }
        self.ple = PLELayer(self.task_names, cfg)
        self.task_models: Dict[str, Model] = {
            name: build_ple_task_model(name, input_dims[name], self.task_types[name], self.vsns[name], self.ple, cfg)
            for name in self.task_names
        }
        self.all_trainable_vars = model_module.collect_unique_trainable_vars(self.task_models)

        self.loss_fns = {
            name: (
                tf.keras.losses.BinaryCrossentropy()
                if self.task_types[name] == "classification"
                else tf.keras.losses.MeanSquaredError()
            )
            for name in self.task_names
        }

        self.optimizer = tf.keras.optimizers.Adam(learning_rate=cfg.initial_lr)
        self.lr_var = self.optimizer.learning_rate
        self.history: Dict[str, list] = {"train_total": [], "val_total": []}
        for name in self.task_names:
            self.history[f"val_{name}"] = []

    def _train_step(self, batches: Dict[str, tuple]):
        with tf.GradientTape() as tape:
            total_loss = 0.0
            for name, (X_batch, y_batch) in batches.items():
                y_pred = self.task_models[name](X_batch, training=True)
                y_pred = tf.squeeze(y_pred, axis=-1)
                loss = self.loss_fns[name](y_batch, y_pred)
                total_loss += self.loss_weights[name] * loss

        grads = tape.gradient(total_loss, self.all_trainable_vars)
        self.optimizer.apply_gradients(zip(grads, self.all_trainable_vars))
        return total_loss

    def _validation_pass(self, data: Dict[str, dict]):
        val_losses = {}
        for name in self.task_names:
            X_val, y_val = data[name]["X_val"], data[name]["y_val"]
            y_pred = self.task_models[name](X_val, training=False)
            y_pred = tf.squeeze(y_pred, axis=-1)
            val_losses[name] = float(self.loss_fns[name](y_val, y_pred))
        return val_losses

    def fit(self, data: Dict[str, dict], mlflow_run=None, verbose: bool = True) -> Dict[str, list]:
        cfg = self.cfg

        def make_batched_iter(X, y):
            ds = tf.data.Dataset.from_tensor_slices((X, y))
            ds = ds.shuffle(buffer_size=len(X), seed=config.RANDOM_STATE)
            return iter(ds.repeat().batch(cfg.batch_size))

        train_iters = {
            name: make_batched_iter(data[name]["X_train"], data[name]["y_train"])
            for name in self.task_names
        }
        steps_per_epoch = max(
            int(np.ceil(len(data[name]["X_train"]) / cfg.batch_size)) for name in self.task_names
        )

        best_val_total = np.inf
        best_weights = None
        epochs_no_improve = 0
        lr_epochs_no_improve = 0

        for epoch in range(cfg.epochs):
            epoch_train_loss = 0.0
            for _ in range(steps_per_epoch):
                batches = {name: next(train_iters[name]) for name in self.task_names}
                total_loss = self._train_step(batches)
                epoch_train_loss += float(total_loss)
            epoch_train_loss /= steps_per_epoch

            val_losses = self._validation_pass(data)
            val_total = sum(self.loss_weights[name] * v for name, v in val_losses.items())

            self.history["train_total"].append(epoch_train_loss)
            self.history["val_total"].append(val_total)
            for name, v in val_losses.items():
                self.history[f"val_{name}"].append(v)

            if mlflow_run is not None:
                import mlflow
                mlflow.log_metric("train_total_loss", epoch_train_loss, step=epoch)
                mlflow.log_metric("val_total_loss", val_total, step=epoch)
                for name, v in val_losses.items():
                    mlflow.log_metric(f"val_{name}_loss", v, step=epoch)
                mlflow.log_metric("learning_rate", float(self.lr_var.numpy()), step=epoch)

            improved = val_total < best_val_total - 1e-5
            if improved:
                best_val_total = val_total
                best_weights = {name: m.get_weights() for name, m in self.task_models.items()}
                epochs_no_improve = 0
                lr_epochs_no_improve = 0
            else:
                epochs_no_improve += 1
                lr_epochs_no_improve += 1

            if lr_epochs_no_improve >= cfg.lr_patience and self.lr_var.numpy() > cfg.min_lr:
                new_lr = max(self.lr_var.numpy() * cfg.lr_factor, cfg.min_lr)
                self.lr_var.assign(new_lr)
                lr_epochs_no_improve = 0
                if verbose:
                    logger.info("  -> LR reduced to %.2e", new_lr)

            if verbose and (epoch % 5 == 0 or improved):
                logger.info(
                    "Epoch %3d | train_loss=%.4f | val_loss=%.4f%s",
                    epoch, epoch_train_loss, val_total, " *" if improved else "",
                )

            if epochs_no_improve >= cfg.patience:
                if verbose:
                    logger.info("Early stopping at epoch %d (no improvement for %d epochs).", epoch, cfg.patience)
                break

        if best_weights is not None:
            for name, m in self.task_models.items():
                m.set_weights(best_weights[name])
            if verbose:
                logger.info("Best val_total_loss: %.4f — best weights restored.", best_val_total)

        return self.history

    def predict(self, task_name: str, X: np.ndarray) -> np.ndarray:
        return self.task_models[task_name](X, training=False).numpy().squeeze()

    def save(self, directory: str) -> Dict[str, str]:
        import os
        os.makedirs(directory, exist_ok=True)
        paths = {}
        for name, m in self.task_models.items():
            path = os.path.join(directory, f"{name}_model.keras")
            m.save(path)
            paths[name] = path
            logger.info("[%s] saved -> %s", name, path)
        return paths

    @classmethod
    def load_task_model(cls, task_name: str, directory: str) -> Model:
        import os
        path = os.path.join(directory, f"{task_name}_model.keras")
        if not os.path.exists(path):
            raise FileNotFoundError(f"No saved PLE model for '{task_name}' at {path}. Train and save first.")
        # custom_objects not needed — GatedResidualNetwork/VariableSelectionNetwork/
        # _WeightedExpertSum are all @register_keras_serializable'd above, and this module is
        # necessarily already imported (we're a classmethod on a class defined in it).
        return tf.keras.models.load_model(path)
