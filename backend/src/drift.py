"""
drift.py — Population Stability Index (PSI) feature-drift detection.

Context: this MVP has no live production traffic yet (Kaggle proxy data, no continuous
ingestion pipeline), so "drift" here means one concrete, honest thing: how different is a
CSV someone uploads through Predict -> Upload & Analyze from the distribution the model was
actually trained on? That's the one place external data enters the running system today. This
module computes a baseline distribution at training time and compares any later feature matrix
against it — used by both api/main.py's batch-predict endpoint (drift badge on every batch
upload) and scripts/retrain_and_promote.py (drift is also checked between old vs. new training
data, as an early warning that the underlying Kaggle files themselves changed).

UNITS: both the baseline and anything compared against it must be in the same standardized
(z-scored) feature space the model was actually trained on — features.run_pipeline() scales
and persists training data before saving it, so the processed data (and therefore
splits["X_train"], what build_baseline() is called on) is already scaled, not raw. api/main.py
compares against X_scaled (post artifacts.transform_batch()) for exactly this reason — comparing
raw upload units against a scaled baseline would report enormous spurious drift on every single
upload regardless of any real distribution shift, since the two sides would just be on
different numeric scales to begin with, not because anything actually changed.

PSI, not KS/chi-square: PSI is the industry-standard choice for exactly this ("has a model's
input population shifted since training") because it gives one comparable number per feature
and an established, widely-cited threshold scale (below), rather than a p-value that doesn't
tell you how MUCH something shifted.

Standard thresholds (Population Stability Index, common industry convention):
    PSI < 0.10              -> no meaningful shift
    0.10 <= PSI < 0.25       -> moderate shift, worth watching
    PSI >= 0.25              -> significant shift, treat predictions with real caution
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional

import numpy as np

PSI_MODERATE_THRESHOLD = 0.10
PSI_HIGH_THRESHOLD = 0.25
N_BINS = 10
EPS = 1e-4  # avoids div-by-zero / log(0) when a bin is empty in one distribution


@dataclass
class FeatureBaseline:
    feature: str
    bin_edges: List[float]      # N_BINS + 1 edges, from the training distribution's quantiles
    bin_proportions: List[float]  # reference (training) proportion of rows in each bin


def _quantile_bin_edges(values: np.ndarray, n_bins: int = N_BINS) -> np.ndarray:
    values = values[np.isfinite(values)]
    if len(values) == 0:
        return np.array([0.0, 1.0])
    quantiles = np.linspace(0, 1, n_bins + 1)
    edges = np.unique(np.quantile(values, quantiles))
    if len(edges) < 2:  # constant feature — one bin covering everything
        edges = np.array([edges[0] - 1.0, edges[0] + 1.0]) if len(edges) == 1 else np.array([0.0, 1.0])
    return edges


def _bin_proportions(values: np.ndarray, edges: np.ndarray) -> np.ndarray:
    values = values[np.isfinite(values)]
    if len(values) == 0:
        return np.ones(len(edges) - 1) / (len(edges) - 1)
    counts, _ = np.histogram(values, bins=edges)
    return counts / max(counts.sum(), 1)


def build_baseline(X: np.ndarray, feature_names: List[str]) -> Dict[str, FeatureBaseline]:
    """Called once at training time (see scripts/retrain_worker.py) on splits["X_train"] — the
    processed, already-standardized (z-scored) training feature matrix, same units the model
    itself trains on and SHAP's background sample uses. Whatever is compared against this
    baseline later must be scaled the same way first (api/main.py does this via
    artifacts.transform_batch() before calling compute_drift_report)."""
    baselines = {}
    for i, name in enumerate(feature_names):
        edges = _quantile_bin_edges(X[:, i])
        props = _bin_proportions(X[:, i], edges)
        baselines[name] = FeatureBaseline(feature=name, bin_edges=edges.tolist(), bin_proportions=props.tolist())
    return baselines


def save_baseline(baselines: Dict[str, FeatureBaseline], path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({name: asdict(b) for name, b in baselines.items()}, f, indent=2)


def load_baseline(path: str) -> Optional[Dict[str, FeatureBaseline]]:
    if not os.path.exists(path):
        return None
    with open(path) as f:
        raw = json.load(f)
    return {name: FeatureBaseline(**b) for name, b in raw.items()}


def _psi_for_feature(baseline: FeatureBaseline, new_values: np.ndarray) -> float:
    edges = np.asarray(baseline.bin_edges)
    ref_props = np.asarray(baseline.bin_proportions)
    new_props = _bin_proportions(new_values, edges)
    ref_props = np.clip(ref_props, EPS, None)
    new_props = np.clip(new_props, EPS, None)
    return float(np.sum((new_props - ref_props) * np.log(new_props / ref_props)))


def _verdict(psi: float) -> str:
    if psi >= PSI_HIGH_THRESHOLD:
        return "high"
    if psi >= PSI_MODERATE_THRESHOLD:
        return "moderate"
    return "none"


def compute_drift_report(baselines: Dict[str, FeatureBaseline], X_new: np.ndarray,
                          feature_names: List[str], top_k: int = 5) -> dict:
    """X_new must be in the same standardized (scaled) feature space as the baseline — same
    units/order as feature_names, already run through the task's saved StandardScaler (see
    api/main.py's use of artifacts.transform_batch() before calling this). Returns per-feature
    PSI, an overall (mean) score, a verdict, and the top_k most-shifted features so the UI can
    say *why*, not just *that*."""
    per_feature = []
    for i, name in enumerate(feature_names):
        baseline = baselines.get(name)
        if baseline is None:
            continue  # feature wasn't in the training baseline (e.g. schema changed) — skip, don't crash
        psi = _psi_for_feature(baseline, X_new[:, i])
        per_feature.append({"feature": name, "psi": round(psi, 4), "verdict": _verdict(psi)})

    per_feature.sort(key=lambda f: f["psi"], reverse=True)
    overall_psi = float(np.mean([f["psi"] for f in per_feature])) if per_feature else 0.0

    return {
        "overall_psi": round(overall_psi, 4),
        "overall_verdict": _verdict(overall_psi),
        "top_shifted_features": per_feature[:top_k],
        "n_features_checked": len(per_feature),
    }
