"""
forecast.py — Multi-year workforce forecasting (Day 11 of the 14-day plan).

Unlike the four per-row task heads (employment/skills/productivity/skill_match), this
doesn't score individual rows — it forecasts *industry-level trends forward in time*, so it
gets its own pipeline shape rather than reusing features.py/model.py/evaluate.py.

Only one raw dataset in this project has an actual time dimension:
ai_job_replacement_2020_2026_v2.csv (the same file the productivity task is built from) has a
real `year` column, 2020-2026. It's cross-sectional per row — no job_id repeats across years —
so a per-entity sequence isn't available, but an industry-level yearly average is: grouping by
(industry, year) gives 8 industries x 7 years, a real (if short) panel to forecast forward from,
not a synthetic one. See config.ForecastConfig for the full rationale and hyperparameters.

Pipeline: build_industry_year_panel() -> make_windows() -> build_forecast_model() -> train()
-> save()/load() -> forecast_industry() (recursive multi-step rollout).

Typical usage
-------------
    from src import forecast

    bundle = forecast.train()
    forecast.save(bundle)

    loaded = forecast.load()
    result = forecast.forecast_industry(loaded, "Technology", horizon=3)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from tensorflow.keras import layers, Model

from . import config

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

FCFG = config.FORECAST_CONFIG


# --------------------------------------------------------------------------- #
# Data: raw rows -> (industry, year) panel
# --------------------------------------------------------------------------- #
def load_raw() -> pd.DataFrame:
    path = os.path.join(config.RAW_DIR, FCFG.raw_filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Forecast raw file not found: {path}")
    return pd.read_csv(path)


def build_industry_year_panel(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Aggregate row-level observations into one row per (industry, year): the mean of each
    forecast metric. This panel is what the windowing step slices into training sequences —
    each industry contributes one 7-year (2020-2026) trajectory per metric.
    """
    if df is None:
        df = load_raw()
    missing = [c for c in [FCFG.group_col, FCFG.year_col, *FCFG.metrics] if c not in df.columns]
    if missing:
        raise ValueError(f"Forecast source is missing expected columns: {missing}")

    panel = (
        df.groupby([FCFG.group_col, FCFG.year_col])[FCFG.metrics]
        .mean()
        .reset_index()
        .sort_values([FCFG.group_col, FCFG.year_col])
        .reset_index(drop=True)
    )
    logger.info(
        "Built industry-year panel: %d industries x %d years, metrics=%s",
        panel[FCFG.group_col].nunique(), panel[FCFG.year_col].nunique(), FCFG.metrics,
    )
    return panel


# --------------------------------------------------------------------------- #
# Windowing
# --------------------------------------------------------------------------- #
def make_windows(panel: pd.DataFrame, window_size: Optional[int] = None) -> Dict:
    """
    Slice each industry's yearly trajectory into (window_size -> next-year) training examples.
    A single StandardScaler is fit across all industries/years/metrics (not per-industry — too
    few points per industry to fit one each) and applied to both inputs and targets, since
    they're the same metrics; forecast_industry() inverse-transforms predictions back to raw
    units for the API/frontend.
    """
    window_size = window_size or FCFG.window_size
    metrics = FCFG.metrics
    industries = sorted(panel[FCFG.group_col].unique().tolist())

    scaler = StandardScaler()
    scaler.fit(panel[metrics].values)

    X, y, industry_ids = [], [], []
    for idx, industry in enumerate(industries):
        sub = panel[panel[FCFG.group_col] == industry].sort_values(FCFG.year_col)
        values = scaler.transform(sub[metrics].values)  # (n_years, n_metrics)
        n_years = len(values)
        for t in range(n_years - window_size):
            X.append(values[t:t + window_size])
            y.append(values[t + window_size])
            industry_ids.append(idx)

    if not X:
        raise ValueError(
            f"No training windows produced — window_size={window_size} is >= the shortest "
            f"industry trajectory. Reduce ForecastConfig.window_size."
        )

    logger.info(
        "Windowed panel: %d training examples from %d industries (window_size=%d)",
        len(X), len(industries), window_size,
    )
    return {
        "X": np.asarray(X, dtype="float32"),
        "y": np.asarray(y, dtype="float32"),
        "industry_ids": np.asarray(industry_ids, dtype="int32"),
        "industries": industries,
        "scaler": scaler,
        "window_size": window_size,
        "metrics": metrics,
    }


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #
def build_forecast_model(
    n_industries: int, window_size: int, n_metrics: int, cfg: config.ForecastConfig = FCFG
) -> Model:
    """
    Sequence input (window_size years x n_metrics) -> LSTM/GRU -> concat with a learned
    industry-identity embedding -> Dense -> next-year values for all n_metrics at once.

    The industry embedding is what lets one small global model share statistical strength
    across all 8 industries' short trajectories (a separate model per industry would have
    only ~4 training examples each) while still letting it distinguish, e.g., Technology's
    trend from Retail's.
    """
    seq_input = layers.Input(shape=(window_size, n_metrics), name="seq_input")
    industry_input = layers.Input(shape=(1,), dtype="int32", name="industry_id")

    rnn_layer = (
        layers.LSTM(cfg.rnn_units, name="rnn")
        if cfg.rnn_type == "lstm"
        else layers.GRU(cfg.rnn_units, name="rnn")
    )
    rnn_out = rnn_layer(seq_input)
    rnn_out = layers.Dropout(cfg.dropout_rate)(rnn_out)

    industry_embed = layers.Embedding(n_industries, cfg.embedding_dim, name="industry_embedding")(industry_input)
    industry_embed = layers.Flatten()(industry_embed)

    combined = layers.Concatenate()([rnn_out, industry_embed])
    combined = layers.Dense(32, activation="relu", name="forecast_dense32")(combined)
    combined = layers.Dropout(cfg.dropout_rate)(combined)
    outputs = layers.Dense(n_metrics, activation="linear", name="forecast_output")(combined)

    return Model(inputs=[seq_input, industry_input], outputs=outputs, name="workforce_forecast_model")


# --------------------------------------------------------------------------- #
# Training
# --------------------------------------------------------------------------- #
def train(
    panel: Optional[pd.DataFrame] = None,
    cfg: config.ForecastConfig = FCFG,
    seed: int = config.RANDOM_STATE,
) -> Dict:
    tf.random.set_seed(seed)
    np.random.seed(seed)

    if panel is None:
        panel = build_industry_year_panel()

    data = make_windows(panel, window_size=cfg.window_size)
    X, y, industry_ids = data["X"], data["y"], data["industry_ids"]
    industries, scaler = data["industries"], data["scaler"]
    n_industries, n_metrics = len(industries), len(cfg.metrics)

    # Shuffled split, not Keras's trailing validation_split — samples are grouped by industry
    # in build order, so a trailing split would validate on only the last industry or two.
    X_train, X_val, id_train, id_val, y_train, y_val = train_test_split(
        X, industry_ids, y, test_size=0.2, random_state=seed,
    )

    model = build_forecast_model(n_industries, cfg.window_size, n_metrics, cfg)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=cfg.initial_lr),
        loss="mse",
        metrics=["mae"],
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=cfg.patience, restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=max(3, cfg.patience // 3), min_lr=1e-6,
        ),
    ]

    fit_history = model.fit(
        [X_train, id_train.reshape(-1, 1)], y_train,
        validation_data=([X_val, id_val.reshape(-1, 1)], y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        shuffle=True,
        verbose=0,
        callbacks=callbacks,
    )

    val_pred_scaled = model([X_val, id_val.reshape(-1, 1)], training=False).numpy()
    val_mae_raw = np.abs(
        scaler.inverse_transform(val_pred_scaled) - scaler.inverse_transform(y_val)
    ).mean(axis=0)
    logger.info(
        "Forecast model trained: %d epochs, val_loss(scaled mse)=%.4f, per-metric val MAE (raw units)=%s",
        len(fit_history.history["loss"]), fit_history.history["val_loss"][-1],
        dict(zip(cfg.metrics, val_mae_raw.round(3))),
    )

    return {
        "model": model,
        "scaler": scaler,
        "industries": industries,
        "metrics": cfg.metrics,
        "window_size": cfg.window_size,
        "panel": panel,
        "fit_history": fit_history.history,
    }


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #
def save(bundle: Dict, directory: str = config.FORECAST_MODEL_DIR) -> Dict[str, str]:
    os.makedirs(directory, exist_ok=True)

    model_path = os.path.join(directory, "forecast_model.keras")
    bundle["model"].save(model_path)

    scaler_path = os.path.join(directory, "forecast_scaler.pkl")
    joblib.dump(bundle["scaler"], scaler_path)

    panel_path = os.path.join(directory, "forecast_panel.parquet")
    bundle["panel"].to_parquet(panel_path, index=False)

    meta_path = os.path.join(directory, "forecast_meta.json")
    with open(meta_path, "w") as f:
        json.dump({
            "industries": bundle["industries"],
            "metrics": bundle["metrics"],
            "window_size": bundle["window_size"],
        }, f, indent=2)

    logger.info("Forecast model saved -> %s", directory)
    return {"model": model_path, "scaler": scaler_path, "panel": panel_path, "meta": meta_path}


def load(directory: str = config.FORECAST_MODEL_DIR) -> Dict:
    model_path = os.path.join(directory, "forecast_model.keras")
    scaler_path = os.path.join(directory, "forecast_scaler.pkl")
    panel_path = os.path.join(directory, "forecast_panel.parquet")
    meta_path = os.path.join(directory, "forecast_meta.json")
    for p in (model_path, scaler_path, panel_path, meta_path):
        if not os.path.exists(p):
            raise FileNotFoundError(f"Forecast artifact missing: {p}. Run scripts/train_forecast.py first.")

    model = tf.keras.models.load_model(model_path)
    scaler = joblib.load(scaler_path)
    panel = pd.read_parquet(panel_path)
    with open(meta_path) as f:
        meta = json.load(f)

    return {
        "model": model,
        "scaler": scaler,
        "panel": panel,
        "industries": meta["industries"],
        "metrics": meta["metrics"],
        "window_size": meta["window_size"],
    }


# --------------------------------------------------------------------------- #
# Inference: recursive multi-year rollout
# --------------------------------------------------------------------------- #
def forecast_industry(bundle: Dict, industry: str, horizon: Optional[int] = None) -> Dict:
    """
    Recursive (autoregressive) multi-step forecast: predict year N+1 from the last
    window_size actual years, slide the window forward to include that prediction, predict
    N+2, and so on. This is standard practice for short panels like this one (one global
    step-ahead model rolled forward) rather than training a separate model per horizon length.
    Error compounds with each step, which is why ForecastConfig.max_horizon caps it at 5.
    """
    horizon = horizon or FCFG.default_horizon
    horizon = min(horizon, FCFG.max_horizon)

    industries = bundle["industries"]
    if industry not in industries:
        raise ValueError(f"Unknown industry '{industry}'. Available: {industries}")
    industry_id = industries.index(industry)

    metrics = bundle["metrics"]
    window_size = bundle["window_size"]
    scaler = bundle["scaler"]
    model = bundle["model"]
    panel = bundle["panel"]

    industry_panel = panel[panel[FCFG.group_col] == industry].sort_values(FCFG.year_col)
    history = [
        {"year": int(row[FCFG.year_col]), **{m: float(row[m]) for m in metrics}}
        for _, row in industry_panel.iterrows()
    ]

    window_raw = industry_panel[metrics].values[-window_size:]
    current_window = scaler.transform(window_raw)
    last_year = int(industry_panel[FCFG.year_col].max())
    id_input = np.array([[industry_id]], dtype="int32")

    forecast_points = []
    for step in range(horizon):
        X_seq = current_window[np.newaxis, :, :].astype("float32")
        pred_scaled = model([X_seq, id_input], training=False).numpy()[0]
        pred_raw = scaler.inverse_transform(pred_scaled[np.newaxis, :])[0]

        year = last_year + step + 1
        forecast_points.append({"year": year, **{m: float(v) for m, v in zip(metrics, pred_raw)}})

        current_window = np.vstack([current_window[1:], pred_scaled])

    return {"industry": industry, "metrics": metrics, "history": history, "forecast": forecast_points}
