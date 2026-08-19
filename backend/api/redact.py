"""
redact.py — masks sensitive per-row feature values (salary/compensation-shaped fields) for
viewer-role callers of /predict/batch/{task}, once real per-user auth actually resolves a role
(see auth.py's Supabase fallback). role=None (auth not configured, or resolved to nothing) means
unrestricted — matching this project's "off by default, unset = today's behavior" convention:
redaction only activates once an operator has actually turned on real per-caller auth.
"""
from __future__ import annotations

from typing import Optional

from api.auth import _ROLE_RANK

REDACTED = "REDACTED"

# Salary/compensation-shaped raw feature names across the task heads that carry one — see
# src/config.py's TASK_CONFIGS raw_cols for where each of these originates.
SENSITIVE_FEATURES = {
    "avg_salary_usd",       # employment, skill_match
    "MonthlyIncome",        # skills
    "PayRate",              # human_capital
}


def redact_rows(rows: list[dict], role: Optional[str]) -> list[dict]:
    """Returns rows unchanged for admin+/unresolved(None) callers; for a resolved viewer-role
    caller, replaces any SENSITIVE_FEATURES value with the REDACTED sentinel."""
    if role is None or _ROLE_RANK.get(role, 0) >= _ROLE_RANK.get("admin", 1):
        return rows
    redacted = []
    for row in rows:
        r = dict(row)
        for name in SENSITIVE_FEATURES:
            if name in r:
                r[name] = REDACTED
        redacted.append(r)
    return redacted
