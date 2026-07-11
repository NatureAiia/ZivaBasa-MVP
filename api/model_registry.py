"""
model_registry.py — Loads everything the API needs once at startup, keyed by task name.

Reuses src/features.py and src/evaluate.py rather than re-implementing data loading — the API
is another consumer of the same pipeline the notebooks use, not a separate implementation.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

from src import config, features, evaluate, model as model_module

logger = logging.getLogger(__name__)


@dataclass
class TaskArtifacts:
    task_name: str
    task_type: str
    keras_model: object
    feature_names: List[str]
    input_dim: int
    shap_background: np.ndarray  # small cached sample for on-demand SHAP explanations


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

                rng = np.random.RandomState(config.RANDOM_STATE)
                n_bg = min(shap_background_size, len(splits["X_train"]))
                bg_idx = rng.choice(len(splits["X_train"]), size=n_bg, replace=False)
                background = np.asarray(splits["X_train"])[bg_idx].astype("float32")

                self._tasks[task_name] = TaskArtifacts(
                    task_name=task_name,
                    task_type=cfg.task_type,
                    keras_model=keras_model,
                    feature_names=splits["feature_names"],
                    input_dim=splits["input_dim"],
                    shap_background=background,
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
