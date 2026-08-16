"""
entity_resolution.py — cross-dataset row-level identity matching ("golden record" linking).

Batch predictions run per-task against independently uploaded CSVs (see api/batch.py's
docstring: the tasks are trained on separate, non row-aligned datasets/proxy schemas). Today the
only cross-task join is department-level (`by_segment`) — there's no way to say "this
employment-risk row and this turnover-risk row are the same person." That's the "cross-dataset
row-level alignment on shared employee/role identifiers" gap this closes.

Stateless by design, same division of responsibility as the rest of this API (schema.sql's own
design note: FastAPI owns no user data). This module only proposes candidate matches from
identifier strings the frontend already has (batch result rows' `_name` field, sourced from
each task's label_col — see batch.py's LABEL_CANDIDATES); persisting *confirmed* links is the
frontend's job (entity_links table via Supabase).
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_NORM_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_THRESHOLD = 0.82


def normalize_label(label: str) -> str:
    """'J. Smith' and 'j  smith' normalize equal; 'Senior Engineer' and 'senior-engineer' too."""
    return _NORM_RE.sub(" ", label.strip().lower()).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_label(a), normalize_label(b)).ratio()


def match_entities(sets: dict[str, list[dict]], threshold: float = DEFAULT_THRESHOLD) -> dict:
    """
    sets: {task_name: [{"row_index": int, "label": str}, ...]} — one entry per task's uploaded
    batch result rows.

    Greedy single-link clustering: two rows from DIFFERENT tasks are clustered together if their
    normalized labels match exactly, or their fuzzy similarity is >= threshold. Rows within the
    same task are never merged into each other (already distinct records by construction, since
    they come from one CSV upload).

    Returns {"clusters": [{"members": [{task, row_index, label, match_score}, ...]}, ...],
             "unmatched": [{task, row_index, label}, ...]}.
    """
    members = [
        {"task": task, "row_index": row["row_index"], "label": row["label"], "norm": normalize_label(row["label"])}
        for task, rows in sets.items()
        for row in rows
    ]

    clusters: list[list[dict]] = []
    used: set[int] = set()

    for i, m in enumerate(members):
        if i in used:
            continue
        cluster = [{**m, "match_score": 1.0}]
        used.add(i)
        for j in range(i + 1, len(members)):
            if j in used or members[j]["task"] == m["task"]:
                continue
            other = members[j]
            score = 1.0 if m["norm"] and other["norm"] == m["norm"] else similarity(m["label"], other["label"])
            if score >= threshold:
                cluster.append({**other, "match_score": round(score, 3)})
                used.add(j)
        if len(cluster) > 1:
            clusters.append(cluster)
        else:
            used.discard(i)  # solo "cluster" of one — leave it for the unmatched pass below

    matched_keys = {(m["task"], m["row_index"]) for c in clusters for m in c}
    unmatched = [
        {"task": m["task"], "row_index": m["row_index"], "label": m["label"]}
        for m in members
        if (m["task"], m["row_index"]) not in matched_keys
    ]

    return {
        "clusters": [
            {"members": [{k: m[k] for k in ("task", "row_index", "label", "match_score")} for m in c]}
            for c in clusters
        ],
        "unmatched": unmatched,
    }
