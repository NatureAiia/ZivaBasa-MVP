"""
model_registry.py — Loads everything the API needs once at startup, keyed by task name.

Reuses src/features.py and src/evaluate.py rather than re-implementing data loading — the API
is another consumer of the same pipeline the notebooks use, not a separate implementation.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

import joblib
import numpy as np

from src import config, features, evaluate, model as model_module, forecast as forecast_module

logger = logging.getLogger(__name__)


@dataclass
class TaskArtifacts:
    task_name: str
    task_type: str
    keras_model: object
    feature_names: List[str]
    input_dim: int
    shap_background: np.ndarray  # small cached sample for on-demand SHAP explanations
    scaler: object  # fitted StandardScaler (src/features.py scale_numeric) — must be applied
                     # to any raw feature vector before it reaches keras_model or SHAP, since
                     # the model was trained on standardized inputs, not raw ones.
    scaler_index: List[int]  # position of each self.feature_names[i] within scaler.feature_names_in_
                              # — the scaler was fit BEFORE leakage columns (e.g. employment's
                              # automation_exposure_index, exposure_x_skill_complexity) were
                              # dropped from the modeling matrix in evaluate.make_splits, so it
                              # has more columns than the model actually takes. We must select
                              # by name, not assume the scaler's column count matches input_dim.

    def transform(self, raw_features: List[float]) -> np.ndarray:
        """Applies the task's saved StandardScaler to a single raw feature vector, in
        schema order (matches GET /schema/{task}). Returns a (1, input_dim) float32 array
        ready for keras_model / SHAP. Skipping this step is the #1 cause of degenerate
        (near-constant, ~0) predictions and all-zero SHAP contributions."""
        mean_ = self.scaler.mean_
        scale_ = self.scaler.scale_
        scaled = [
            (raw_features[i] - mean_[self.scaler_index[i]]) / scale_[self.scaler_index[i]]
            for i in range(len(raw_features))
        ]
        return np.asarray([scaled], dtype="float32")

    def transform_batch(self, raw_matrix: np.ndarray) -> np.ndarray:
        """Same as transform() but for an (n_rows, input_dim) matrix at once — used by the
        batch-predict endpoint so a CSV upload of thousands of rows is one vectorized numpy
        operation, not a Python loop calling transform() per row."""
        mean_ = self.scaler.mean_[self.scaler_index]
        scale_ = self.scaler.scale_[self.scaler_index]
        return ((raw_matrix - mean_) / scale_).astype("float32")


class ModelRegistry:
    """Holds loaded artifacts for every task head. Populated once via `load_all()`."""

    def __init__(self):
        self._tasks: Dict[str, TaskArtifacts] = {}

    def load_all(self, shap_background_size: int = 30) -> "ModelRegistry":
        for task_name, cfg in config.TASK_CONFIGS.items():
            try:
                df = features.load_processed(task_name)
                if df is None:
                    logger.warning("[%s] no processed features found, skipping.", task_name)
                    continue

                splits = evaluate.make_splits(df, task_name, val_split=False)
                if splits is None:
                    logger.warning("[%s] could not build splits, skipping.", task_name)
                    continue

                keras_model = model_module.MultiTaskTrainer.load_task_model(task_name)

                scaler_path = os.path.join(config.SCALER_DIR, f"{task_name}_scaler.pkl")
                if not os.path.exists(scaler_path):
                    logger.error(
                        "[%s] no saved scaler at %s — skipping task. Predictions without the "
                        "scaler are meaningless (the model was trained on standardized inputs).",
                        task_name, scaler_path,
                    )
                    continue
                scaler = joblib.load(scaler_path)

                feature_names = splits["feature_names"]
                scaler_names = list(getattr(scaler, "feature_names_in_", []))
                if not scaler_names:
                    logger.error(
                        "[%s] saved scaler has no feature_names_in_ (fit on a bare ndarray, "
                        "not a named DataFrame) — cannot safely map modeling features to scaler "
                        "columns by name. Skipping task. Re-fit the scaler via "
                        "features.scale_numeric() on a DataFrame to fix this.",
                        task_name,
                    )
                    continue
                try:
                    scaler_index = [scaler_names.index(name) for name in feature_names]
                except ValueError as e:
                    logger.error(
                        "[%s] a modeling feature is missing from the fitted scaler's columns "
                        "(%s). feature_names=%s, scaler columns=%s. Skipping task — the scaler "
                        "is stale relative to the current feature set and must be re-fit.",
                        task_name, e, feature_names, scaler_names,
                    )
                    continue

                rng = np.random.RandomState(config.RANDOM_STATE)
                n_bg = min(shap_background_size, len(splits["X_train"]))
                bg_idx = rng.choice(len(splits["X_train"]), size=n_bg, replace=False)
                background = np.asarray(splits["X_train"])[bg_idx].astype("float32")

                self._tasks[task_name] = TaskArtifacts(
                    task_name=task_name,
                    task_type=cfg.task_type,
                    keras_model=keras_model,
                    feature_names=feature_names,
                    input_dim=splits["input_dim"],
                    shap_background=background,
                    scaler=scaler,
                    scaler_index=scaler_index,
                )
                logger.info("[%s] loaded: input_dim=%d, task_type=%s",
                            task_name, splits["input_dim"], cfg.task_type)
            except FileNotFoundError as e:
                logger.warning("[%s] model not found, skipping (%s)", task_name, e)
            except Exception as e:
                logger.error("[%s] failed to load: %s", task_name, e)
        return self

    def get(self, task_name: str) -> Optional[TaskArtifacts]:
        return self._tasks.get(task_name)

    def task_names(self) -> List[str]:
        return list(self._tasks.keys())

    def is_loaded(self, task_name: str) -> bool:
        return task_name in self._tasks


registry = ModelRegistry()


class ForecastRegistry:
    """
    Holds the loaded multi-year workforce forecasting bundle (src/forecast.py) — a single
    global model shared across industries (see forecast.build_forecast_model's industry
    embedding), not one-per-task like ModelRegistry above, so it gets its own tiny wrapper
    instead of forcing TaskArtifacts' per-row-prediction shape onto it.
    """

    def __init__(self):
        self._bundle: Optional[Dict] = None

    def load(self) -> "ForecastRegistry":
        try:
            self._bundle = forecast_module.load()
            logger.info(
                "[forecast] loaded: industries=%s, metrics=%s",
                self._bundle["industries"], self._bundle["metrics"],
            )
        except FileNotFoundError as e:
            logger.warning("[forecast] model not found, skipping (%s)", e)
        except Exception as e:
            logger.error("[forecast] failed to load: %s", e)
        return self

    def is_loaded(self) -> bool:
        return self._bundle is not None

    @property
    def bundle(self) -> Optional[Dict]:
        return self._bundle


forecast_registry = ForecastRegistry()
