"""
model.py — Multi-task, shared-trunk neural network for the ZivaBasa MVP (Kaggle-Data Phase).

Architecture (per the ChiedzaAI proposal):

    Employment Input   Skills Input   Productivity Input
       (F_e dims)        (F_s dims)      (F_p dims)
          |                  |                |
    Task Adapter        Task Adapter     Task Adapter      <- projects each dataset's own
    Dense(latent_dim)   Dense(latent_dim) Dense(latent_dim)   feature space into a shared
          |                  |                |               common latent space
          +------------------+----------------+
                             |
          Shared Trunk: Dense(256) -> BatchNorm -> Dropout
                        -> Dense(128) -> Dropout
                             |
            +----------------+----------------+
            |                |                |
      Employment Head   Skills Head    Productivity Head
      Dense(64->32)     Dense(64->32)  Dense(64->32)
            |                |                |
        Output(1)        Output(1)        Output(1)

Because the three source datasets are different, non-row-aligned populations (see the project
README's Known Limitations), this uses a custom training loop rather than `model.fit()`: each
step draws an independent batch per task, forward-passes each through its own adapter -> shared
trunk -> head, and combines the (weighted) losses before a single backward pass — so the shared
trunk gets gradient signal from all three tasks every step.

Typical usage
-------------
    from src import model as m

    trainer = m.MultiTaskTrainer(input_dims={"employment": 42, "skills": 38, "productivity": 12},
                                  task_types={"employment": "classification",
                                              "skills": "classification",
                                              "productivity": "regression"})
    history = trainer.fit(data)   # data: dict of task_name -> {"X_train": ..., "y_train": ..., ...}
    trainer.save(config.MULTITASK_MODEL_DIR)
"""

from __future__ import annotations

import os
import logging
from typing import Dict, Optional

import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model

from . import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

TaskType = config.TaskType


# --------------------------------------------------------------------------- #
# Model construction
# --------------------------------------------------------------------------- #
class SharedTrunk:
    """
    Holds the shared trunk layers as single, reusable layer objects. In Keras, calling the
    same layer object on different inputs shares its weights — this is what makes the trunk
    genuinely shared across the three task paths without requiring row-aligned data.
    """

    def __init__(self, cfg: config.ModelConfig = config.MODEL_CONFIG):
        self.dense1 = layers.Dense(cfg.trunk_dim_1, activation="relu", name="shared_dense1")
        self.bn1 = layers.BatchNormalization(name="shared_bn1")
        self.dropout1 = layers.Dropout(cfg.dropout_rate, name="shared_dropout1")
        self.dense2 = layers.Dense(cfg.trunk_dim_2, activation="relu", name="shared_dense2")
        self.dropout2 = layers.Dropout(cfg.dropout_rate, name="shared_dropout2")

    def __call__(self, x, training: bool = False):
        x = self.dense1(x)
        x = self.bn1(x, training=training)
        x = self.dropout1(x, training=training)
        x = self.dense2(x)
        x = self.dropout2(x, training=training)
        return x


def build_task_model(
    task_name: str,
    input_dim: int,
    task_type: TaskType,
    trunk: SharedTrunk,
    cfg: config.ModelConfig = config.MODEL_CONFIG,
) -> Model:
    """Build one task's full path: adapter -> shared trunk -> head -> output."""
    inputs = layers.Input(shape=(input_dim,), name=f"{task_name}_input")

    adapter = layers.Dense(cfg.latent_dim, activation="relu", name=f"{task_name}_adapter")(inputs)
    trunk_out = trunk(adapter, training=True)

    head = layers.Dense(64, activation="relu", name=f"{task_name}_head_dense64")(trunk_out)
    head = layers.Dense(32, activation="relu", name=f"{task_name}_head_dense32")(head)

    activation = "sigmoid" if task_type == "classification" else "linear"
    outputs = layers.Dense(1, activation=activation, name=f"{task_name}_output")(head)

    return Model(inputs=inputs, outputs=outputs, name=f"{task_name}_model")


def collect_unique_trainable_vars(models: Dict[str, Model]) -> list:
    """
    Dedupe trainable variables across task models. Shared-trunk layers appear in every task
    model's .trainable_variables — without deduping, gradients would be applied to the trunk
    multiple times per step.
    """
    seen = {}
    for m in models.values():
        for v in m.trainable_variables:
            seen[id(v)] = v
    return list(seen.values())


# --------------------------------------------------------------------------- #
# Trainer
# --------------------------------------------------------------------------- #
class MultiTaskTrainer:
    """
    Owns the shared trunk, the per-task models, the optimizer, and the custom training loop
    (manual early stopping + manual ReduceLROnPlateau, since Keras callbacks don't attach to
    custom loops).
    """

    def __init__(
        self,
        input_dims: Dict[str, int],
        task_types: Optional[Dict[str, TaskType]] = None,
        loss_weights: Optional[Dict[str, float]] = None,
        cfg: config.ModelConfig = config.MODEL_CONFIG,
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

        self.trunk = SharedTrunk(cfg)
        self.task_models: Dict[str, Model] = {
            name: build_task_model(name, input_dims[name], self.task_types[name], self.trunk, cfg)
            for name in self.task_names
        }
        self.all_trainable_vars = collect_unique_trainable_vars(self.task_models)

        self.loss_fns = {
            name: (
                tf.keras.losses.BinaryCrossentropy()
                if self.task_types[name] == "classification"
                else tf.keras.losses.MeanSquaredError()
            )
            for name in self.task_names
        }

        # NOTE: newer Keras (3.x, bundled with TF >= 2.16) no longer accepts a raw tf.Variable
        # for `learning_rate` — the optimizer creates its own internal LR variable instead.
        # We drive our manual ReduceLROnPlateau by assigning to that internal variable directly.
        self.optimizer = tf.keras.optimizers.Adam(learning_rate=cfg.initial_lr)
        self.lr_var = self.optimizer.learning_rate
        self.history: Dict[str, list] = {"train_total": [], "val_total": []}
        for name in self.task_names:
            self.history[f"val_{name}"] = []

    # --- single gradient step, combining all tasks --- #
    def _train_step(self, batches: Dict[str, tuple]):
        with tf.GradientTape() as tape:
            total_loss = 0.0
            task_losses = {}
            for name, (X_batch, y_batch) in batches.items():
                y_pred = self.task_models[name](X_batch, training=True)
                y_pred = tf.squeeze(y_pred, axis=-1)
                loss = self.loss_fns[name](y_batch, y_pred)
                task_losses[name] = loss
                total_loss += self.loss_weights[name] * loss

        grads = tape.gradient(total_loss, self.all_trainable_vars)
        self.optimizer.apply_gradients(zip(grads, self.all_trainable_vars))
        return total_loss, task_losses

    def _validation_pass(self, data: Dict[str, dict]):
        val_losses = {}
        for name in self.task_names:
            X_val, y_val = data[name]["X_val"], data[name]["y_val"]
            y_pred = self.task_models[name](X_val, training=False)
            y_pred = tf.squeeze(y_pred, axis=-1)
            val_losses[name] = float(self.loss_fns[name](y_val, y_pred))
        return val_losses

    def fit(self, data: Dict[str, dict], mlflow_run=None, verbose: bool = True) -> Dict[str, list]:
        """
        data: {task_name: {"X_train": np.ndarray, "y_train": np.ndarray,
                            "X_val": np.ndarray, "y_val": np.ndarray}}

        If an active `mlflow` run is passed via `mlflow_run` (i.e. you're inside
        `with mlflow.start_run():`), per-epoch metrics are logged there. Pass None to skip
        MLflow logging (e.g. in tests or quick experimentation).
        """
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
                total_loss, _ = self._train_step(batches)
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

    # --- inference --- #
    def predict(self, task_name: str, X: np.ndarray) -> np.ndarray:
        return self.task_models[task_name](X, training=False).numpy().squeeze()

    # --- persistence --- #
    def save(self, directory: str = config.MULTITASK_MODEL_DIR) -> Dict[str, str]:
        os.makedirs(directory, exist_ok=True)
        paths = {}
        for name, m in self.task_models.items():
            path = os.path.join(directory, f"{name}_model.keras")
            m.save(path)
            paths[name] = path
            logger.info("[%s] saved -> %s", name, path)
        return paths

    @classmethod
    def load_task_model(cls, task_name: str, directory: str = config.MULTITASK_MODEL_DIR) -> Model:
        """Load a single task's saved model (adapter + shared trunk + head) for inference/SHAP."""
        path = os.path.join(directory, f"{task_name}_model.keras")
        if not os.path.exists(path):
            raise FileNotFoundError(f"No saved model for '{task_name}' at {path}. Train and save first.")
        return tf.keras.models.load_model(path)
