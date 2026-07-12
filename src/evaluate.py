"""
evaluate.py — Baseline models, metrics, and SHAP explainability for the ZivaBasa MVP
(Kaggle-Data Phase).

Three responsibilities, kept together because they all consume the same TASK_CONFIGS from
config.py and the same train/test splits produced by `make_splits()`:

1. Classical ML baselines (LogReg/LinearReg, Decision Tree, Random Forest, Gradient Boosting)
   — the empirical bar the multi-task neural network (model.py) has to clear.
2. Shared metric functions (classification + regression) used identically for baselines and
   the neural network, so results are always apples-to-apples.
3. SHAP explainability against the trained multi-task model, with a GradientExplainer-first,
   KernelExplainer-fallback strategy (DeepExplainer is flaky on TF2 eager Keras models).

Typical usage
-------------
    from src import features, model, evaluate

    splits = evaluate.make_splits(features.load_processed("employment"), "employment")
    baseline_results = evaluate.run_baselines(splits, "employment")

    nn_results = evaluate.evaluate_task_model(trained_model, splits, "employment")

    shap_values, explainer_name = evaluate.compute_shap_values(trained_model, background, explain_set)
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    mean_squared_error, mean_absolute_error, r2_score,
)

from . import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")


# --------------------------------------------------------------------------- #
# Splits
# --------------------------------------------------------------------------- #
def make_splits(
    df: Optional[pd.DataFrame],
    task_name: str,
    val_split: bool = False,
    test_size: float = 0.2,
    val_size: float = 0.15,
    seed: int = config.RANDOM_STATE,
) -> Optional[Dict[str, np.ndarray]]:
    """
    Build train/(val)/test splits for one task head, using the target/drop_cols from
    config.TASK_CONFIGS so every consumer (baselines, neural net, SHAP) sees the same
    feature matrix definition.

    Set val_split=True to also carve out a validation set from train (needed for the
    neural network's early stopping in model.py).
    """
    if df is None:
        return None
    cfg = config.TASK_CONFIGS[task_name]
    if cfg.target not in df.columns:
        logger.warning("[%s] target '%s' not found in dataframe.", task_name, cfg.target)
        return None

    drop_cols = [c for c in cfg.drop_cols if c in df.columns]
    X = df.drop(columns=drop_cols).select_dtypes(include=[np.number]).astype("float32")
    y = df[cfg.target].astype("float32")

    stratify = y if cfg.task_type == "classification" else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=stratify
    )

    result = {
        "X_train": X_train, "y_train": y_train.values,
        "X_test": X_test.values, "y_test": y_test.values,
        "feature_names": list(X.columns),
        "input_dim": X.shape[1],
    }

    if val_split:
        strat = y_train if cfg.task_type == "classification" else None
        X_train, X_val, y_train, y_val = train_test_split(
            X_train, y_train, test_size=val_size, random_state=seed, stratify=strat
        )
        result["X_train"] = X_train.values
        result["y_train"] = y_train.values
        result["X_val"] = X_val.values
        result["y_val"] = y_val.values
    else:
        result["X_train"] = result["X_train"].values

    logger.info(
        "[%s] train=%d%s test=%d features=%d",
        task_name, len(result["X_train"]),
        f" val={len(result['X_val'])}" if val_split else "",
        len(result["X_test"]), result["input_dim"],
    )
    return result


def make_all_splits(
    processed: Dict[str, pd.DataFrame], val_split: bool = False
) -> Dict[str, Optional[Dict[str, np.ndarray]]]:
    return {name: make_splits(df, name, val_split=val_split) for name, df in processed.items()}


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def evaluate_classification(y_true, y_pred, y_proba=None) -> Dict[str, float]:
    metrics = {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
    }
    if y_proba is not None:
        try:
            metrics["roc_auc"] = roc_auc_score(y_true, y_proba)
        except ValueError:
            metrics["roc_auc"] = np.nan
    return metrics


def evaluate_regression(y_true, y_pred) -> Dict[str, float]:
    return {
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
    }


# --------------------------------------------------------------------------- #
# Baseline models
# --------------------------------------------------------------------------- #
def get_baseline_models(task_type: config.TaskType, seed: int = config.RANDOM_STATE) -> dict:
    if task_type == "classification":
        return {
            "logistic_regression": LogisticRegression(max_iter=1000, random_state=seed),
            "decision_tree": DecisionTreeClassifier(max_depth=8, random_state=seed),
            "random_forest": RandomForestClassifier(n_estimators=200, max_depth=10, random_state=seed),
            "gradient_boosting": GradientBoostingClassifier(n_estimators=200, max_depth=3, random_state=seed),
        }
    return {
        "linear_regression": LinearRegression(),
        "decision_tree": DecisionTreeRegressor(max_depth=8, random_state=seed),
        "random_forest": RandomForestRegressor(n_estimators=200, max_depth=10, random_state=seed),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=seed),
    }


def run_baselines(
    splits: Dict[str, np.ndarray], task_name: str, mlflow_log: bool = False
) -> pd.DataFrame:
    """Train + evaluate every baseline model for one task head. Optionally logs each to MLflow."""
    cfg = config.TASK_CONFIGS[task_name]
    X_train, X_test = splits["X_train"], splits["X_test"]
    y_train, y_test = splits["y_train"], splits["y_test"]
    models = get_baseline_models(cfg.task_type)

    results = []
    for model_name, mdl in models.items():
        run_ctx = _mlflow_run_ctx(mlflow_log, f"{task_name}_{model_name}")
        with run_ctx:
            mdl.fit(X_train, y_train)
            y_pred = mdl.predict(X_test)

            if cfg.task_type == "classification":
                y_proba = mdl.predict_proba(X_test)[:, 1] if hasattr(mdl, "predict_proba") else None
                metrics = evaluate_classification(y_test, y_pred, y_proba)
            else:
                metrics = evaluate_regression(y_test, y_pred)

            if mlflow_log:
                import mlflow
                mlflow.log_param("task_head", task_name)
                mlflow.log_param("model_type", model_name)
                mlflow.log_metrics({k: v for k, v in metrics.items() if not (isinstance(v, float) and np.isnan(v))})
                mlflow.sklearn.log_model(mdl, artifact_path="model")

            results.append({"task_head": task_name, "model": model_name, **metrics})
            logger.info("[%s_%s] %s", task_name, model_name, metrics)

    return pd.DataFrame(results)


def run_all_baselines(
    all_splits: Dict[str, Optional[Dict[str, np.ndarray]]], mlflow_log: bool = False
) -> pd.DataFrame:
    frames = [
        run_baselines(splits, name, mlflow_log=mlflow_log)
        for name, splits in all_splits.items() if splits is not None
    ]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def _mlflow_run_ctx(enabled: bool, run_name: str):
    if not enabled:
        import contextlib
        return contextlib.nullcontext()
    import mlflow
    return mlflow.start_run(run_name=run_name)


# --------------------------------------------------------------------------- #
# Neural network evaluation (same metric functions, different model interface)
# --------------------------------------------------------------------------- #
def evaluate_task_model(predict_fn, splits: Dict[str, np.ndarray], task_name: str) -> Dict[str, float]:
    """
    predict_fn: a callable taking X (np.ndarray) and returning raw predictions
    (probabilities for classification, values for regression) — e.g. `trainer.predict("employment", X)`.
    """
    cfg = config.TASK_CONFIGS[task_name]
    y_pred_raw = np.asarray(predict_fn(splits["X_test"])).squeeze()
    y_test = splits["y_test"]

    if cfg.task_type == "classification":
        y_pred = (y_pred_raw > 0.5).astype(int)
        metrics = evaluate_classification(y_test, y_pred, y_pred_raw)
    else:
        metrics = evaluate_regression(y_test, y_pred_raw)

    return {"task_head": task_name, "model": "multitask_nn", **metrics}


# --------------------------------------------------------------------------- #
# SHAP
# --------------------------------------------------------------------------- #
def compute_shap_values(
    keras_model,
    background: np.ndarray,
    explain_set: np.ndarray,
) -> Tuple[np.ndarray, str]:
    """
    GradientExplainer first (works with TF2 eager Keras models); falls back to KernelExplainer
    (model-agnostic, slower) if that fails for any reason. Returns (shap_values, explainer_name).
    """
    import shap

    try:
        explainer = shap.GradientExplainer(keras_model, background)
        sv = explainer.shap_values(explain_set)
        if isinstance(sv, list):
            sv = sv[0]
        sv = np.squeeze(sv)
        return sv, "GradientExplainer"
    except Exception as e:
        logger.warning("GradientExplainer failed (%s); falling back to KernelExplainer.", e)
        # NOTE: use reshape(-1), not squeeze() -- squeeze() collapses a (1, 1) batch (which
        # KernelExplainer does pass at points during its internal sampling) all the way down to
        # a 0-d scalar, and shap then crashes trying to index it (`model_out[0]`). reshape(-1)
        # always keeps at least one dimension.
        predict_fn = lambda x: keras_model.predict(x, verbose=0).reshape(-1)
        bg_summary = shap.kmeans(background, min(20, background.shape[0]))
        explainer = shap.KernelExplainer(predict_fn, bg_summary)
        sv = explainer.shap_values(explain_set, nsamples=100)
        sv = np.squeeze(np.array(sv))
        return sv, "KernelExplainer"


def feature_importance_table(shap_values: np.ndarray, feature_names: List[str]) -> pd.DataFrame:
    """Mean |SHAP value| per feature, ranked — the report-friendly global importance summary."""
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    return (
        pd.DataFrame({"feature": feature_names, "mean_abs_shap": mean_abs_shap})
        .sort_values("mean_abs_shap", ascending=False)
        .reset_index(drop=True)
    )


def sample_background_and_explain_set(
    splits: Dict[str, np.ndarray],
    n_background: int = config.SHAP_N_BACKGROUND,
    n_explain: int = config.SHAP_N_EXPLAIN,
    seed: int = config.RANDOM_STATE,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (background, explain_set, explain_indices) sampled from train/test respectively."""
    rng = np.random.RandomState(seed)
    X_train, X_test = splits["X_train"], splits["X_test"]

    bg_idx = rng.choice(len(X_train), size=min(n_background, len(X_train)), replace=False)
    ex_idx = rng.choice(len(X_test), size=min(n_explain, len(X_test)), replace=False)

    background = np.asarray(X_train)[bg_idx].astype("float32")
    explain_set = np.asarray(X_test)[ex_idx].astype("float32")
    return background, explain_set, ex_idx
