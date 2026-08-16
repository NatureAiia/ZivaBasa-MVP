"""
tsmixer_forecast.py — TSMixer / PatchTSMixer forecasting spike (Ekambaram et al. 2023),
built ALONGSIDE forecast.py's LSTM/GRU head, not replacing it — same "spike next to the
shipped baseline" pattern ple_model.py already uses next to model.py, gated by its own
benchmark script (scripts/benchmark_tsmixer_vs_lstm.py) before ever being considered for the
live API path.

Why this instead of the LSTM/GRU already in forecast.py: the only real time-series data in
this project is a 7-year x 8-industry panel (config.ForecastConfig) — genuinely small-N, and
this project's stated competitive differentiator is explainability. TSMixer replaces the
RNN's opaque hidden state with plain MLPs mixed across the time axis and the channel
(metric) axis in turn — every mixing weight is a Dense-layer weight, directly readable and
already attributable via the same gradient/SHAP methods (evaluate.py) used elsewhere in this
project, unlike an LSTM's recurrent state or an attention map. The TSMixer paper also reports
competitive accuracy at small-N against both RNNs and attention-based forecasters, which is
the regime this project's panel is actually in.

Data plumbing (build_industry_year_panel/make_windows) is NOT duplicated here — it's
imported from forecast.py, since patch/model choice doesn't change how the panel is built or
windowed. Only the model architecture and its own persistence directory
(config.TSMIXER_MODEL_DIR, separate from FORECAST_MODEL_DIR) differ from forecast.py.

Mamba / state-space long-range models are explicitly out of scope for this milestone —
research-track only, not implemented here.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Dict, Optional

import joblib
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from tensorflow.keras import layers, Model

from . import config
from . import forecast

logger = logging.getLogger(__name__)

TCFG = config.TSMIXER_CONFIG


# --------------------------------------------------------------------------- #
# Mixer layers
# --------------------------------------------------------------------------- #
@tf.keras.utils.register_keras_serializable(package="tsmixer_forecast")
class TimeMixingMLP(layers.Layer):
    """
    Mixes information ACROSS the time-step axis, independently per channel: transpose
    (batch, time, channels) -> (batch, channels, time), Dense(time)->activation->Dense(time)
    over the time axis, transpose back, residual add, LayerNorm. This is the mixer's
    replacement for an RNN's recurrence — a fixed-size linear/MLP mix instead of a stateful
    sequential scan, so there's no hidden state to inspect: the Dense kernel here IS the
    complete, static description of how time steps combine.
    """

    def __init__(self, dropout_rate: float = 0.2, **kwargs):
        super().__init__(**kwargs)
        self.dropout_rate = dropout_rate
        self.dense1: Optional[layers.Dense] = None
        self.dense2: Optional[layers.Dense] = None
        self.dropout = layers.Dropout(dropout_rate)
        self.layer_norm = layers.LayerNormalization()

    def build(self, input_shape):
        time_steps = input_shape[1]
        self.dense1 = layers.Dense(time_steps, activation="relu")
        self.dense2 = layers.Dense(time_steps)
        super().build(input_shape)

    def call(self, x, training: bool = False):
        # x: (batch, time, channels)
        residual = x
        h = tf.transpose(x, perm=[0, 2, 1])         # (batch, channels, time)
        h = self.dense1(h)
        h = self.dense2(h)
        h = self.dropout(h, training=training)
        h = tf.transpose(h, perm=[0, 2, 1])         # (batch, time, channels)
        return self.layer_norm(h + residual)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"dropout_rate": self.dropout_rate})
        return cfg


@tf.keras.utils.register_keras_serializable(package="tsmixer_forecast")
class ChannelMixingMLP(layers.Layer):
    """
    Mixes information ACROSS the channel (metric) axis, independently per time step:
    Dense(hidden)->activation->Dense(channels) applied on the last axis, residual add,
    LayerNorm. Paired with TimeMixingMLP, this is the "time-mixing then channel-mixing"
    factorization the TSMixer paper uses in place of attention.
    """

    def __init__(self, hidden_dim: int, dropout_rate: float = 0.2, **kwargs):
        super().__init__(**kwargs)
        self.hidden_dim = hidden_dim
        self.dropout_rate = dropout_rate
        self.dense1 = layers.Dense(hidden_dim, activation="relu")
        self.dense2: Optional[layers.Dense] = None
        self.dropout = layers.Dropout(dropout_rate)
        self.layer_norm = layers.LayerNormalization()

    def build(self, input_shape):
        n_channels = input_shape[-1]
        self.dense2 = layers.Dense(n_channels)
        super().build(input_shape)

    def call(self, x, training: bool = False):
        # x: (batch, time, channels)
        residual = x
        h = self.dense1(x)
        h = self.dense2(h)
        h = self.dropout(h, training=training)
        return self.layer_norm(h + residual)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"hidden_dim": self.hidden_dim, "dropout_rate": self.dropout_rate})
        return cfg


@tf.keras.utils.register_keras_serializable(package="tsmixer_forecast")
class PatchTSMixerBlock(layers.Layer):
    """
    One TSMixer block: TimeMixingMLP followed by ChannelMixingMLP, both residual. Stacking
    `num_blocks` of these is the entire "deep" part of the model — there is no attention and
    no recurrence anywhere in this stack.

    Patch note: with config.TSMixerConfig.patch_len == window_size (the default, since this
    project's forecast window is only 3 years), each "patch" is the whole window and the time
    axis this block mixes over has length 1 per patch — the true PatchTSMixer patching only
    starts doing meaningful work once patch_len < window_size, i.e. once more years of real
    data lengthen ForecastConfig.window_size. The block is still exercised end-to-end (channel
    mixing over the 3 metrics is active regardless), it just isn't doing sub-window patching yet.
    """

    def __init__(self, hidden_dim: int, dropout_rate: float = 0.2, **kwargs):
        super().__init__(**kwargs)
        self.hidden_dim = hidden_dim
        self.dropout_rate = dropout_rate
        self.time_mixer = TimeMixingMLP(dropout_rate, name=f"{self.name}_time")
        self.channel_mixer = ChannelMixingMLP(hidden_dim, dropout_rate, name=f"{self.name}_channel")

    def call(self, x, training: bool = False):
        x = self.time_mixer(x, training=training)
        x = self.channel_mixer(x, training=training)
        return x

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"hidden_dim": self.hidden_dim, "dropout_rate": self.dropout_rate})
        return cfg


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #
def build_tsmixer_forecast_model(
    n_industries: int, window_size: int, n_metrics: int, cfg: config.TSMixerConfig = TCFG
) -> Model:
    """
    Same [seq_input, industry_input] -> n_metrics signature as
    forecast.build_forecast_model, so scripts/benchmark_tsmixer_vs_lstm.py can train and
    evaluate both architectures identically on the same windows.
    """
    seq_input = layers.Input(shape=(window_size, n_metrics), name="seq_input")
    industry_input = layers.Input(shape=(1,), dtype="int32", name="industry_id")

    h = layers.Dense(cfg.hidden_dim, name="patch_embedding")(seq_input)  # (batch, window, hidden_dim)
    for i in range(cfg.num_blocks):
        h = PatchTSMixerBlock(cfg.hidden_dim, cfg.dropout_rate, name=f"tsmixer_block_{i}")(h, training=True)
    h = layers.Flatten()(h)

    industry_embed = layers.Embedding(n_industries, cfg.embedding_dim, name="industry_embedding")(industry_input)
    industry_embed = layers.Flatten()(industry_embed)

    combined = layers.Concatenate()([h, industry_embed])
    combined = layers.Dense(32, activation="relu", name="forecast_dense32")(combined)
    combined = layers.Dropout(cfg.dropout_rate)(combined)
    outputs = layers.Dense(n_metrics, activation="linear", name="forecast_output")(combined)

    return Model(inputs=[seq_input, industry_input], outputs=outputs, name="tsmixer_forecast_model")


# --------------------------------------------------------------------------- #
# Training — mirrors forecast.train()'s structure/split/callback choices exactly, so the
# benchmark script compares architectures, not training procedure.
# --------------------------------------------------------------------------- #
def train(
    panel=None,
    cfg: config.TSMixerConfig = TCFG,
    seed: int = config.RANDOM_STATE,
) -> Dict:
    tf.random.set_seed(seed)
    np.random.seed(seed)

    if panel is None:
        panel = forecast.build_industry_year_panel()

    data = forecast.make_windows(panel, window_size=cfg.window_size)
    X, y, industry_ids = data["X"], data["y"], data["industry_ids"]
    industries, scaler = data["industries"], data["scaler"]
    n_industries, n_metrics = len(industries), len(data["metrics"])

    X_train, X_val, id_train, id_val, y_train, y_val = train_test_split(
        X, industry_ids, y, test_size=0.2, random_state=seed,
    )

    model = build_tsmixer_forecast_model(n_industries, cfg.window_size, n_metrics, cfg)
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
        "TSMixer forecast model trained: %d epochs, val_loss(scaled mse)=%.4f, per-metric val MAE (raw units)=%s",
        len(fit_history.history["loss"]), fit_history.history["val_loss"][-1],
        dict(zip(data["metrics"], val_mae_raw.round(3))),
    )

    return {
        "model": model,
        "scaler": scaler,
        "industries": industries,
        "metrics": data["metrics"],
        "window_size": cfg.window_size,
        "panel": panel,
        "fit_history": fit_history.history,
        "val_mae_raw": dict(zip(data["metrics"], val_mae_raw.tolist())),
    }


# --------------------------------------------------------------------------- #
# Persistence — identical shape to forecast.py's save()/load(), separate directory.
# --------------------------------------------------------------------------- #
def save(bundle: Dict, directory: str = config.TSMIXER_MODEL_DIR) -> Dict[str, str]:
    os.makedirs(directory, exist_ok=True)

    model_path = os.path.join(directory, "tsmixer_forecast_model.keras")
    bundle["model"].save(model_path)

    scaler_path = os.path.join(directory, "tsmixer_forecast_scaler.pkl")
    joblib.dump(bundle["scaler"], scaler_path)

    panel_path = os.path.join(directory, "tsmixer_forecast_panel.parquet")
    bundle["panel"].to_parquet(panel_path, index=False)

    meta_path = os.path.join(directory, "tsmixer_forecast_meta.json")
    with open(meta_path, "w") as f:
        json.dump({
            "industries": bundle["industries"],
            "metrics": bundle["metrics"],
            "window_size": bundle["window_size"],
        }, f, indent=2)

    logger.info("TSMixer forecast model saved -> %s", directory)
    return {"model": model_path, "scaler": scaler_path, "panel": panel_path, "meta": meta_path}


def load(directory: str = config.TSMIXER_MODEL_DIR) -> Dict:
    model_path = os.path.join(directory, "tsmixer_forecast_model.keras")
    scaler_path = os.path.join(directory, "tsmixer_forecast_scaler.pkl")
    panel_path = os.path.join(directory, "tsmixer_forecast_panel.parquet")
    meta_path = os.path.join(directory, "tsmixer_forecast_meta.json")
    for p in (model_path, scaler_path, panel_path, meta_path):
        if not os.path.exists(p):
            raise FileNotFoundError(f"TSMixer forecast artifact missing: {p}. Run train()+save() first.")

    import pandas as pd
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


# TODO (research track, out of scope for this milestone): Mamba / state-space long-range
# dependency modeling. Not implemented here — see the architecture-decision discussion this
# module's docstring references for why it's deferred rather than attempted now.
