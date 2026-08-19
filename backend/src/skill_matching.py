"""
skill_matching.py — Cosine-similarity skill-matching engine for the ZivaBasa MVP's
fourth task head, `skill_match`.

GROUND TRUTH NOTE (checked against the real sister repo before writing this, not assumed):
FFIMS SWS's actual skill-matching logic is NOT a Python backend module — it lives entirely
in the FRONTEND as TypeScript, at ffims_frontend/src/lib/sws/skillMatch.ts. FFIMS's own
`ffims_backend/` is Node/Express + Sequelize/Postgres; there is no ffims_backend Python
matching code to port. This module is therefore a REWRITE of that ~20-line TS algorithm
into Python/numpy — not a port of existing Python — following the exact same core logic
(one-hot binary skill vectors, cosine similarity) but adapted from FFIMS's fleet-driver
skill tags (bus/van/hgv/night-duty/...) to a banking-sector skill taxonomy, and reshaped
from FFIMS's "one target vs many drivers, ranked" query shape into ZivaBasa's "one row per
staff-vs-target-role instance" modeling shape (consistent with how features.py treats every
other task: a flat feature vector per row, not a live ranking query).

Mirrors ffims_frontend/src/lib/sws/skillMatch.ts:
    buildVector()        -> build_vector()
    cosineSimilarity()   -> cosine_similarity()
    matchDriversToTask() -> match_score() (single-pair form) / add_skill_match_features() (batch)
    overtimeFairnessRanking() -> overtime_fairness_ranking()
"""
from __future__ import annotations

from typing import Iterable, List

import numpy as np
import pandas as pd

# Banking-sector skill taxonomy, adapted from FFIMS's fleet-driver tags. Kept as a flat,
# fixed-order tag list (mirrors FFIMS's ALL_SKILLS) so build_vector() below is deterministic
# and order-stable across the whole pipeline (features.py, model.py, /explain SHAP output).
ALL_SKILLS: List[str] = [
    "teller_ops",
    "loan_underwriting",
    "credit_risk",
    "aml_compliance",
    "digital_banking",
    "sales_advisory",
    "customer_service",
    "forex_ops",
    "treasury_ops",
    "it_support",
    "data_analytics",
    "branch_management",
    "leadership",
    "cybersecurity",
    "wealth_management",
]


def parse_skills(raw: str) -> List[str]:
    """Comma-separated skill-tag string -> list. Tolerant of NaN/None/empty (CSV upload
    reality), unlike the TS original which assumed a clean string[] from a typed API."""
    if not isinstance(raw, str) or not raw.strip():
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def build_vector(tags: Iterable[str]) -> np.ndarray:
    """Direct port of buildVector(): one-hot binary vector over ALL_SKILLS, in fixed order."""
    tag_set = set(tags)
    return np.array([1.0 if skill in tag_set else 0.0 for skill in ALL_SKILLS], dtype="float64")


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Direct port of cosineSimilarity(), including the same zero-magnitude guard."""
    mag_a = float(np.linalg.norm(a))
    mag_b = float(np.linalg.norm(b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (mag_a * mag_b))


# Prescriptive layer on top of match_score()'s missing_skill_count (Master Checklist §5,
# Day 10 item: "skill-matching model exists; recommendation layer on top is still open").
# One training resource per ALL_SKILLS entry — a static taxonomy, not sourced from any
# external LMS/catalog integration (none exists in this repo), so it's an illustrative
# placeholder mapping rather than a live course catalog.
SKILL_TRAINING_RESOURCES: dict = {
    "teller_ops": "Teller Operations & Cash Handling Certification",
    "loan_underwriting": "Credit & Loan Underwriting Fundamentals",
    "credit_risk": "Credit Risk Analysis Workshop",
    "aml_compliance": "AML/CFT Compliance Certification",
    "digital_banking": "Digital Banking Platforms & Channels Training",
    "sales_advisory": "Financial Sales & Advisory Skills Program",
    "customer_service": "Customer Experience in Banking",
    "forex_ops": "Foreign Exchange Operations Training",
    "treasury_ops": "Treasury & Liquidity Management Course",
    "it_support": "IT Service Desk & Systems Support Training",
    "data_analytics": "Data Analytics for Financial Services",
    "branch_management": "Branch Management & Operations Leadership",
    "leadership": "People Leadership & Team Management Program",
    "cybersecurity": "Cybersecurity Awareness & Fundamentals",
    "wealth_management": "Wealth & Investment Advisory Certification",
}


def recommend_training_path(current_skills: str, required_skills: str) -> dict:
    """Prescriptive recommendation for one staff-vs-target-role pair: reuses match_score()'s
    missing-skill set, then attaches the recommended training resource for each gap, ordered
    by ALL_SKILLS so the output is deterministic across calls."""
    current = set(parse_skills(current_skills))
    required = set(parse_skills(required_skills))
    missing = [skill for skill in ALL_SKILLS if skill in required and skill not in current]

    return {
        **match_score(current_skills, required_skills),
        "missing_skills": missing,
        "recommended_training": [
            {"skill": skill, "resource": SKILL_TRAINING_RESOURCES.get(skill, skill)}
            for skill in missing
        ],
    }


def match_score(current_skills: str, required_skills: str) -> dict:
    """Single staff-vs-target-role match. Same scoring as matchDriversToTask() computes per
    driver, but for one (staff, target role) pair — this is the row-level unit features.py
    needs, one instance = one training row."""
    current = set(parse_skills(current_skills))
    required = set(parse_skills(required_skills))
    score = cosine_similarity(build_vector(current), build_vector(required))
    matched = required & current
    missing = required - current
    return {
        "cosine_similarity_score": score,
        "skill_overlap_count": len(matched),
        "missing_skill_count": len(missing),
    }


def add_skill_match_features(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized application of match_score() across a raw skill-matching dataframe.

    Adds cosine_similarity_score / skill_overlap_count / missing_skill_count, then drops the
    free-text current_skills/required_skills columns — encode_categoricals() one-hot encodes
    low-cardinality categoricals, and a comma-joined skill-tag string is effectively
    unbounded-cardinality (near-unique per row), so it must be consumed into numeric features
    here rather than reaching that step.
    """
    df = df.copy()
    scored = df.apply(
        lambda row: match_score(row.get("current_skills", ""), row.get("required_skills", "")),
        axis=1,
        result_type="expand",
    )
    df = pd.concat([df, scored], axis=1)
    df = df.drop(columns=["current_skills", "required_skills"], errors="ignore")
    return df


def overtime_fairness_ranking(df: pd.DataFrame) -> pd.DataFrame:
    """Direct port of overtimeFairnessRanking(): lower recent_ot_hours + higher seniority =
    higher redeployment/assignment priority. This is NOT a modeling feature — it's the
    candidate-ordering rule the Roster page uses to rank redeployment candidates who tie (or
    are close) on cosine_similarity_score, matching FFIMS's fairness-under-labor-constraints
    intent rather than pure similarity ranking."""
    return df.sort_values(by=["recent_ot_hours", "seniority_years"], ascending=[True, False])
