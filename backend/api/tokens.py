"""
tokens.py — real, server-enforced token-balance gate for the subscription+token pricing model
(growth/engagement mechanic 3: "visible token economy").

OFF BY DEFAULT, same convention as api/auth.py and api/supabase_auth.py: this gate only
activates once SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are both set (needed to do a
service-role balance check/deduct) AND the operator has explicitly opted in via
ZIVABASA_TOKEN_GATE_ENABLED=1. Unset either, and every dependency below is a no-op — endpoints
behave exactly as they did before this file existed.

Design: the actual check-and-deduct is a single atomic Postgres RPC (spend_tokens(), defined in
supabase/migration_add_engagement.sql) called via the service-role key over PostgREST's RPC
endpoint — the same httpx.AsyncClient-against-Supabase-REST pattern api/supabase_auth.py already
uses. Doing the check and the deduction in one DB round trip avoids a race where two concurrent
requests both pass a pre-check and overdraw the balance.

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

import httpx
from fastapi import Header, HTTPException

from api import supabase_auth

# Tunable, not architectural — a small dict is the whole cost model. Batch prediction is priced
# per row (see PREDICT_BATCH_COST_PER_ROW below) rather than a flat cost here, since a 5-row and
# a 5,000-row upload shouldn't cost the same.
TOKEN_COSTS = {
    "predict": 1,
    "skill_match": 1,
    "chat_agent": 3,
    "report": 2,
}
PREDICT_BATCH_COST_PER_ROW = 1

UPGRADE_HINTS = {
    "predict": "Upgrade your plan or buy more tokens to keep running predictions.",
    "predict_batch": "Upgrade to unlock more monthly tokens for larger batch uploads.",
    "skill_match": "Upgrade your plan or buy more tokens to keep matching skills.",
    "chat_agent": "Upgrade your plan or buy more tokens to keep chatting with Chiedza.",
    "report": "Upgrade your plan or buy more tokens to export more reports.",
}

_BYPASS_ROLES = {"admin", "superadmin"}


def gate_enabled() -> bool:
    return bool(os.environ.get("ZIVABASA_TOKEN_GATE_ENABLED")) and supabase_auth.configured()


async def resolve_gate_identity(authorization: Optional[str] = Header(default=None)) -> Optional[Tuple[str, str]]:
    """FastAPI dependency: returns (user_id, role) if the gate is enabled and the caller's
    session resolves, else None (gate off — fully open). Raises 401 if the gate is on but no
    valid session is presented, same enforcement posture as auth.require_role()."""
    if not gate_enabled():
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    identity = await supabase_auth.resolve_identity_from_token(token)
    if identity is None:
        raise HTTPException(status_code=401, detail="Invalid or unrecognized session.")
    return identity


async def _rpc_spend_tokens(user_id: str, amount: int, reason: str, endpoint: Optional[str]) -> Optional[int]:
    url = supabase_auth._supabase_url()
    service_key = supabase_auth._service_role_key()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{url}/rest/v1/rpc/spend_tokens",
            json={
                "p_user_id": user_id,
                "p_amount": amount,
                "p_reason": reason,
                "p_endpoint": endpoint,
            },
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "application/json",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Token balance service unavailable.")
        return resp.json()  # spend_tokens() returns integer (new balance) or null


async def _get_balance(user_id: str) -> int:
    url = supabase_auth._supabase_url()
    service_key = supabase_auth._service_role_key()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{url}/rest/v1/token_balances",
            params={"user_id": f"eq.{user_id}", "select": "balance"},
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
        )
        rows = resp.json() if resp.status_code == 200 else []
        return rows[0]["balance"] if rows else 0


async def spend_or_402(user_id: str, cost: int, reason: str, endpoint: Optional[str] = None) -> int:
    """Atomically debits `cost` tokens for (user_id, reason). Raises HTTPException(402) with a
    structured, frontend-renderable body if the balance is insufficient; otherwise returns the
    new balance."""
    new_balance = await _rpc_spend_tokens(user_id, -cost, reason, endpoint)
    if new_balance is None:
        balance = await _get_balance(user_id)
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
