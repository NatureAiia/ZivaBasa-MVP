"""
batch.py — CSV upload -> batch prediction -> corporate KPI aggregation.

This is what "upload your workforce data and get a dashboard" actually runs on. It's
deliberately per-task (one CSV per task: employment, skills, or productivity) rather than
one combined roster upload, because the three tasks are trained on three separate, non
row-aligned proxy datasets with different schemas (see README "Known issues" #2/#4) — a CEO
uploading "our HR export" would need three exports mapped to three different feature sets,
not one file that magically fits all three models. The corporate dashboard combines results
from whichever batch runs have been done.

Column matching is by NAME, exact then case/whitespace-insensitive fallback, never by
position — a wrong column position silently corrupts an entire company's predictions, so a
missing required column is a hard 422 error listing exactly what's missing, not a silent
zero-fill (that was the root cause of the original all-zero-prediction bug, at CSV-scale that
would be much worse).
"""
from __future__ import annotations

import io
from typing import Optional

import numpy as np
import pandas as pd

from src import features as features_module

# Task-specific columns to look for in an uploaded CSV, best-effort, for human-readable
# labels and department/segment breakdowns. None of these are required — if absent, the
# batch endpoint falls back to row index labels and skips segment breakdown.
LABEL_CANDIDATES = {
    "employment": ["job_role", "role", "title"],
    "skills": ["JobRole", "jobrole", "job_role", "EmployeeNumber"],
    "productivity": ["job_role", "job_id", "role"],
}
SEGMENT_CANDIDATES = {
    "employment": ["industry", "department", "Department"],
    "skills": ["Department", "department"],
    "productivity": ["industry", "country"],
}


def _find_column(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    cols_by_norm = {c.strip().lower(): c for c in df.columns}
    for cand in candidates:
        if cand in df.columns:
            return cand
        norm = cand.strip().lower()
        if norm in cols_by_norm:
            return cols_by_norm[norm]
    return None


def _match_feature_columns(df: pd.DataFrame, feature_names: list[str]) -> tuple[dict, list[str]]:
    """Maps each required feature name to an actual CSV column name. Exact match first, then
    case/whitespace-insensitive. Returns (mapping, missing) — missing is never silently
    defaulted."""
    cols_by_norm = {c.strip().lower(): c for c in df.columns}
    mapping, missing = {}, []
    for name in feature_names:
        if name in df.columns:
            mapping[name] = name
        elif name.strip().lower() in cols_by_norm:
            mapping[name] = cols_by_norm[name.strip().lower()]
        else:
            missing.append(name)
    return mapping, missing


def parse_and_validate(file_bytes: bytes, task: str, feature_names: list[str]) -> dict:
    """Parses an uploaded CSV and validates it has every required feature column. Raises
    ValueError (caller maps this to HTTP 422) with an actionable message if not."""
    try:
        df = pd.read_csv(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Could not parse file as CSV: {e}")

    if df.empty:
        raise ValueError("Uploaded CSV has no rows.")

    # Reuse the actual training-time feature engineering (not a re-implementation of the
    # formulas here) so a raw HR export — which won't have our internal engineered columns
    # like training_intensity_index — gets them computed the same way the model was trained
    # on. This is a no-op for columns/tasks that don't need it (e.g. employment, productivity
    # currently need no derived columns beyond what's already in a raw export).
    df = features_module.add_ratio_index_features(df, task)
    df = features_module.add_interaction_features(df, task)

    mapping, missing = _match_feature_columns(df, feature_names)
    if missing:
        raise ValueError(
            f"Missing required column(s) for task '{task}': {missing}. "
            f"Columns found in your file: {list(df.columns)}. "
            f"Required (in any order, matched by name): {feature_names}."
        )

    # Drop rows with any missing/non-numeric value in a required column rather than silently
    # coercing to 0 — a 0 for avg_salary_usd is a real (wrong) value, not "no data".
    feature_df = df[[mapping[n] for n in feature_names]].apply(pd.to_numeric, errors="coerce")
    valid_mask = feature_df.notna().all(axis=1)
    n_dropped = int((~valid_mask).sum())
    df_valid = df[valid_mask].reset_index(drop=True)
    feature_matrix = feature_df[valid_mask].to_numpy(dtype="float64")

    label_col = _find_column(df, LABEL_CANDIDATES.get(task, []))
    segment_col = _find_column(df, SEGMENT_CANDIDATES.get(task, []))

    return {
        "df": df_valid,
        "feature_matrix": feature_matrix,
        "label_col": label_col,
        "segment_col": segment_col,
        "n_rows": len(df_valid),
        "n_dropped": n_dropped,
    }


def aggregate_classification(df: pd.DataFrame, probabilities: np.ndarray, label_col, segment_col, value_col: Optional[str] = None):
    labels = (probabilities > 0.5).astype(int)
    positive_count = int(labels.sum())
    negative_count = int(len(labels) - positive_count)

    value_at_risk = None
    if value_col and value_col in df.columns:
        value_at_risk = float(pd.to_numeric(df[value_col], errors="coerce").fillna(0)[labels == 1].sum())

    aggregate = {
        "positive_count": positive_count,
        "negative_count": negative_count,
        "positive_rate": positive_count / len(labels) if len(labels) else 0.0,
        "mean_probability": float(np.mean(probabilities)),
        "value_at_risk": value_at_risk,
        "value_column_used": value_col if value_at_risk is not None else None,
    }

    by_segment = None
    if segment_col and segment_col in df.columns:
        seg = df[segment_col].astype(str)
        by_segment = []
        for name, idx in seg.groupby(seg).groups.items():
            mask = df.index.isin(idx)
            seg_labels = labels[mask]
            by_segment.append({
                "segment": name,
                "count": int(mask.sum()),
                "positive_count": int(seg_labels.sum()),
                "positive_rate": float(seg_labels.mean()) if len(seg_labels) else 0.0,
            })
        by_segment.sort(key=lambda s: s["positive_rate"], reverse=True)

    top_risk = _top_rows(df, probabilities, label_col, n=10, descending=True)

    return aggregate, by_segment, top_risk


def aggregate_regression(df: pd.DataFrame, values: np.ndarray, label_col, segment_col):
    aggregate = {
        "mean": float(np.mean(values)),
        "std": float(np.std(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "above_average_count": int((values >= 0).sum()),
        "below_average_count": int((values < 0).sum()),
    }

    by_segment = None
    if segment_col and segment_col in df.columns:
        seg = df[segment_col].astype(str)
        by_segment = []
        for name, idx in seg.groupby(seg).groups.items():
            mask = df.index.isin(idx)
            seg_values = values[mask]
            by_segment.append({
                "segment": name,
                "count": int(mask.sum()),
                "mean": float(np.mean(seg_values)) if len(seg_values) else 0.0,
            })
        by_segment.sort(key=lambda s: s["mean"])

    top_risk = _top_rows(df, values, label_col, n=10, descending=False)  # most below-average first

    return aggregate, by_segment, top_risk


def _top_rows(df: pd.DataFrame, values: np.ndarray, label_col, n=10, descending=True):
    order = np.argsort(-values if descending else values)[:n]
    rows = []
    for i in order:
        label = str(df.iloc[i][label_col]) if label_col and label_col in df.columns else f"Row {i + 1}"
        rows.append({"label": label, "value": float(values[i])})
    return rows


# Capped at 500 rows — plenty for a scatter/interaction plot to read as a real distribution,
# without sending an unbounded payload back for a 50,000-row upload.
ROW_RECORDS_CAP = 500


def build_row_records(df: pd.DataFrame, feature_matrix: np.ndarray, feature_names: list[str],
                       raw_outputs: np.ndarray, task_type: str, label_col) -> list[dict]:
    """Per-row feature values + prediction, capped — feeds Studio's Interaction Explorer and
    the client-side composite index cards. Not included for very large uploads' full row set,
    by design (payload size), only the aggregate/top-risk/by-segment stats scale unbounded."""
    n = min(len(df), ROW_RECORDS_CAP)
    records = []
    for i in range(n):
        rec = {feature_names[j]: float(feature_matrix[i, j]) for j in range(len(feature_names))}
        rec["_value"] = float(raw_outputs[i])
        if task_type == "classification":
            rec["_label"] = int(raw_outputs[i] > 0.5)
        if label_col and label_col in df.columns:
            rec["_name"] = str(df.iloc[i][label_col])
        records.append(rec)
    return records
