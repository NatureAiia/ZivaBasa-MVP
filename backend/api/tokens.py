"""
tokens.py — real, server-enforced token-balance gate for the subscription+token pricing model
(growth/engagement mechanic 3: "visible token economy").

OFF BY DEFAULT, same convention as api/auth.py: this gate only activates once JWT_SECRET is set
(needed to decode a caller's session — see auth.py/auth_service.py) AND the operator has
explicitly opted in via ZIVABASA_TOKEN_GATE_ENABLED=1. Unset either, and every dependency below
is a no-op — endpoints behave exactly as they did before this file existed.

Design: the actual check-and-deduct is a single atomic SQL UPDATE (api/token_service.py) against
our own Postgres, replacing the old spend_tokens() Postgres RPC called over Supabase's PostgREST.
Doing the check and the deduction in one statement avoids a race where two concurrent requests
both pass a pre-check and overdraw the balance.

Trade-off, stated plainly: deduction happens at the gate (before the handler runs), not after
confirmed success. This keeps the implementation simple (no rollback/refund path for a handler
that fails after the gate passes) at the cost of a user being charged for a request that later
errors. Acceptable for a first version; revisit with a refund-on-failure path if that turns out
to matter in practice.

Admin/superadmin roles bypass the gate entirely (product decision — the admin managing the
account isn't the one metered; trial/seat usage is).
"""
from __future__ import annotations

import os
from typing import Optional, Tuple

from fastapi import Header, HTTPException

from api import auth, token_service
from api.db.session import get_sessionmaker

TOKEN_COSTS = {
    "predict": 1,
    "skill_match": 1,
    "chat_agent": 3,
    "report": 2,
    "upskilling_premium": 2,
}
PREDICT_BATCH_COST_PER_ROW = 1

UPGRADE_HINTS = {
    "predict": "Upgrade your plan or buy more tokens to keep running predictions.",
    "predict_batch": "Upgrade to unlock more monthly tokens for larger batch uploads.",
    "skill_match": "Upgrade your plan or buy more tokens to keep matching skills.",
    "chat_agent": "Upgrade your plan or buy more tokens to keep chatting with Chiedza.",
    "report": "Upgrade your plan or buy more tokens to export more reports.",
    "upskilling_premium": "Upgrade your plan or buy more tokens to unlock premium courses and your AI micro-lesson.",
}

_BYPASS_ROLES = {"admin", "superadmin"}


def gate_enabled() -> bool:
    return bool(os.environ.get("ZIVABASA_TOKEN_GATE_ENABLED")) and bool(os.environ.get("JWT_SECRET"))


async def resolve_gate_identity(authorization: Optional[str] = Header(default=None)) -> Optional[Tuple[str, str]]:
    """FastAPI dependency: returns (user_id, role) if the gate is enabled and the caller's
    session resolves, else None (gate off — fully open). Raises 401 if the gate is on but no
    valid session is presented, same enforcement posture as auth.require_role()."""
    if not gate_enabled():
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    identity = await auth.resolve_identity_from_access_token(token)
    if identity is None:
        raise HTTPException(status_code=401, detail="Invalid or unrecognized session.")
    return identity


async def spend_or_402(user_id: str, cost: int, reason: str, endpoint: Optional[str] = None) -> int:
    """Atomically debits `cost` tokens for (user_id, reason). Raises HTTPException(402) with a
    structured, frontend-renderable body if the balance is insufficient; otherwise returns the
    new balance."""
    session_factory = get_sessionmaker()
    async with session_factory() as db:
        new_balance = await token_service.spend_tokens(db, user_id, -cost, reason, endpoint)
        if new_balance is None:
            balance = await token_service.get_balance(db, user_id)
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "insufficient_tokens",
                    "balance": balance,
                    "required": cost,
                    "reason": reason,
                    "upgrade_hint": UPGRADE_HINTS.get(reason, "Upgrade your plan or buy more tokens to continue."),
                },
            )
        await db.commit()
        return new_balance


def require_tokens(cost_key: str):
    """FastAPI dependency factory for fixed-cost endpoints (predict, skill_match, chat_agent,
    report) — added alongside Depends(auth.require_role(...)), not in place of it. For
    variable-cost endpoints (predict_batch), use resolve_gate_identity directly and call
    spend_or_402() inline once the real cost (row count) is known."""

    async def _dependency(authorization: Optional[str] = Header(default=None)):
        identity = await resolve_gate_identity(authorization)
        if identity is None:
            return None  # gate off
        user_id, role = identity
        if role in _BYPASS_ROLES:
            return None  # admin/superadmin bypass
        cost = TOKEN_COSTS.get(cost_key, 0)
        if cost <= 0:
            return None
        return await spend_or_402(user_id, cost, cost_key)

    return _dependency
