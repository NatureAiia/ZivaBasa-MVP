"""
generate_skill_match_fixture.py — One-off generator for the skill_match task's synthetic
banking roster/skills fixture (Step 3.4 of the SWS integration).

Why synthetic and not ported from FFIMS: confirmed by inspecting the sister repo directly —
FFIMS's users.csv is auth records only (name/email/role/password, no skills), and its actual
skill-tag data (bus/van/hgv/night-duty/...) lives only in TS mock/type files, not a CSV, and
is fleet-trucking-specific rather than banking-specific. Only the *shape* is carried over
(staff -> skill-tag set, cosine-matched against a target role's required-skill set, plus
seniority/recent-OT fields for fairness ranking) — no FFIMS file is read here.

Produces two outputs, mirroring how the other three tasks' raw data is checkpointed after
notebook 01's data-acquisition/EDA step:
  1. data/raw/bank_skill_matching.csv          — human-readable raw fixture (Step 3.4 deliverable)
  2. data/raw/skill_match_checked.parquet       — the "validated checkpoint" features.load_checkpoint()
                                                   expects, named <task_name>_checked.parquet like
                                                   employment_checked.parquet / skills_checked.parquet /
                                                   productivity_checked.parquet.

Run once: `python scripts/generate_skill_match_fixture.py` from backend/.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src import config  # noqa: E402
from src.skill_matching import ALL_SKILLS  # noqa: E402

RNG = np.random.RandomState(config.RANDOM_STATE)
N_ROWS = 1400

# Bank departments, each with a realistic home-turf subset of the skill taxonomy — this is
# what gives cosine_similarity_score real learnable signal instead of pure noise: a teller
# moving toward a digital-banking target role usually already carries some overlap, a branch
# ops veteran moving toward treasury usually doesn't.
DEPARTMENTS = {
    "Retail Banking": ["teller_ops", "customer_service", "sales_advisory", "branch_management"],
    "Credit & Lending": ["loan_underwriting", "credit_risk", "aml_compliance", "data_analytics"],
    "Digital & IT": ["digital_banking", "it_support", "cybersecurity", "data_analytics"],
    "Treasury & Markets": ["treasury_ops", "forex_ops", "credit_risk", "data_analytics"],
    "Private & Wealth": ["wealth_management", "sales_advisory", "customer_service", "leadership"],
    "Compliance & Risk": ["aml_compliance", "credit_risk", "cybersecurity", "leadership"],
}
ROLE_TITLES = {
    "Retail Banking": ["Teller", "Branch Officer", "Customer Service Rep", "Branch Supervisor"],
    "Credit & Lending": ["Loan Officer", "Credit Analyst", "Underwriter", "Lending Manager"],
    "Digital & IT": ["Digital Banking Officer", "IT Support Analyst", "Systems Administrator"],
    "Treasury & Markets": ["Treasury Analyst", "FX Dealer", "Markets Associate"],
    "Private & Wealth": ["Relationship Manager", "Wealth Advisor", "Private Banker"],
    "Compliance & Risk": ["Compliance Officer", "Risk Analyst", "AML Investigator"],
}


def sample_skills(home_skills, n_extra_pool, size_range=(2, 5)):
    """A staff member's actual skill set: mostly drawn from their department's home turf,
    with a couple of skills from outside it (career variety, cross-training) — never a clean
    deterministic set, so the matching problem is genuinely non-trivial to learn."""
    k = RNG.randint(*size_range)
    k = min(k, len(home_skills))
    picked = list(RNG.choice(home_skills, size=k, replace=False))
    if RNG.rand() < 0.4:
        outside = [s for s in n_extra_pool if s not in picked]
        if outside:
            picked.append(RNG.choice(outside))
    return picked


def generate() -> pd.DataFrame:
    rows = []
    dept_names = list(DEPARTMENTS.keys())

    for i in range(N_ROWS):
        current_dept = RNG.choice(dept_names)
        current_home = DEPARTMENTS[current_dept]
        current_role = RNG.choice(ROLE_TITLES[current_dept])
        current_skills = sample_skills(current_home, ALL_SKILLS)

        # Target role: ~55% redeployment within the same department (natural progression,
        # higher expected match), ~45% a genuine cross-department move (the harder,
        # lower-match case that makes this task worth modeling at all).
        if RNG.rand() < 0.55:
            target_dept = current_dept
        else:
            target_dept = RNG.choice([d for d in dept_names if d != current_dept])
        target_home = DEPARTMENTS[target_dept]
        target_role = RNG.choice(ROLE_TITLES[target_dept])
        required_skills = sample_skills(target_home, ALL_SKILLS, size_range=(2, 4))

        seniority_years = round(float(RNG.gamma(shape=2.0, scale=2.5)), 1)
        recent_training_hours = float(RNG.poisson(lam=18))
        performance_rating = int(np.clip(RNG.normal(loc=3.4, scale=0.8), 1, 5))
        avg_salary_usd = round(float(RNG.normal(loc=650 + seniority_years * 25, scale=120)), 2)
        recent_ot_hours = float(max(0, RNG.normal(loc=6, scale=4)))

        rows.append({
            "staff_id": f"STF-{i+1:05d}",
            "department": current_dept,
            "current_role": current_role,
            "current_skills": ",".join(current_skills),
            "target_department": target_dept,
            "target_role": target_role,
            "required_skills": ",".join(required_skills),
            "seniority_years": seniority_years,
            "recent_training_hours": recent_training_hours,
            "performance_rating": performance_rating,
            "avg_salary_usd": max(200.0, avg_salary_usd),
            "recent_ot_hours": round(recent_ot_hours, 1),
        })

    return pd.DataFrame(rows)


def main():
    df = generate()

    csv_path = os.path.join(config.RAW_DIR, "bank_skill_matching.csv")
    df.to_csv(csv_path, index=False)
    print(f"Wrote raw fixture -> {csv_path} ({len(df)} rows)")

    checked_path = os.path.join(config.RAW_DIR, "skill_match_checked.parquet")
    df.to_parquet(checked_path, index=False)
    print(f"Wrote checked checkpoint -> {checked_path}")


if __name__ == "__main__":
    main()
