"""
auth.py — Optional API-key bearer auth + role-based access control (Section 8 Security &
Compliance: "Secure authentication", "Role-based access control on API endpoints", "Secure API
access tokens").

OFF BY DEFAULT, same pattern as every other optional key in this project (chat providers, macro
data): if `ZIVABASA_API_KEYS` isn't set, every endpoint behaves exactly as it did before this
file existed — open, no token required. This matters concretely here: the frontend has no login
screen today, so making auth mandatory by default would break every existing request path the
moment this shipped, for a `docker compose up` that sets no new env var at all. Once an operator
sets `ZIVABASA_API_KEYS` (format: `"key1:role1,key2:role2"`, roles are `admin` or `viewer`),
sensitive/costly endpoints start requiring a valid `Authorization: Bearer <key>` header carrying
a role that meets the endpoint's minimum.

LOCAL JWT FALLBACK (replaces the old Supabase-session fallback): the ZIVABASA_API_KEYS scheme
above was, until now, the *only* thing require_role() could ever resolve a role from — and the
frontend never sent an Authorization header before real login existed, so in practice every
endpoint stayed fully open regardless of who was logged in. require_role() now also tries
decoding the caller's access token issued by POST /auth/login (see auth_service.py) when
ZIVABASA_API_KEYS isn't configured — this activates automatically once a frontend session
exists, no separate opt-in env var needed (JWT_SECRET is required either way for /auth/* to
function at all).
"""
from __future__ import annotations

import os
from typing import Dict, Optional

from fastapi import Header, HTTPException

from api import auth_service

Role = str  # "viewer" | "admin" | "superadmin"
_ROLE_RANK = {"viewer": 0, "admin": 1, "superadmin": 2}


def _load_keys() -> Dict[str, Role]:
    raw = os.environ.get("ZIVABASA_API_KEYS", "")
    keys: Dict[str, Role] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry or ":" not in entry:
            continue
        key, role = entry.split(":", 1)
        keys[key.strip()] = role.strip()
    return keys


def auth_enabled() -> bool:
    return bool(_load_keys())


def _jwt_configured() -> bool:
    return bool(os.environ.get("JWT_SECRET"))


async def resolve_identity_from_access_token(token: str) -> Optional[tuple[str, str]]:
    """Decodes a POST /auth/login-issued access token locally (no DB round trip needed for the
    role, since it's embedded in the JWT claims) — returns (user_id, role), or None if the token
    is missing/expired/invalid."""
    payload = auth_service.decode_access_token(token)
    if payload is None:
        return None
    user_id, role = payload.get("sub"), payload.get("role")
    if not user_id or not role:
        return None
    return user_id, role


def require_role(min_role: Role = "viewer"):
    """FastAPI dependency factory. Tries, in order: the ZIVABASA_API_KEYS bearer-token scheme
    (unchanged from before), then — only if that scheme isn't configured — decoding a local JWT
    issued by POST /auth/login (see auth_service.py). If NEITHER is configured (no
    ZIVABASA_API_KEYS and no JWT_SECRET), always passes with role=None (fully open, identical to
    this file's original behavior). Once either is configured, a missing/invalid/insufficient
    token is rejected (401/403) rather than silently allowed through."""

    async def _dependency(authorization: Optional[str] = Header(default=None)) -> Optional[Role]:
        keys = _load_keys()
        if keys:
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
            token = authorization.removeprefix("Bearer ").strip()
            role = keys.get(token)
            if role is None:
                raise HTTPException(status_code=401, detail="Invalid API key.")
            if _ROLE_RANK.get(role, -1) < _ROLE_RANK.get(min_role, 0):
                raise HTTPException(status_code=403, detail=f"Role '{role}' lacks required '{min_role}' access.")
            return role

        if _jwt_configured():
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
            token = authorization.removeprefix("Bearer ").strip()
            identity = await resolve_identity_from_access_token(token)
            if identity is None:
                raise HTTPException(status_code=401, detail="Invalid or expired session.")
            _user_id, role = identity
            if _ROLE_RANK.get(role, -1) < _ROLE_RANK.get(min_role, 0):
                raise HTTPException(status_code=403, detail=f"Role '{role}' lacks required '{min_role}' access.")
            return role

        return None  # neither scheme configured — open, as before this file existed

    return _dependency


def require_user():
    """FastAPI dependency factory for the CRUD routes (api/routes/*.py) that need the caller's
    own user_id to scope queries — the explicit backend-enforced replacement for what Postgres
    RLS's `user_id = auth.uid()` used to do automatically. Unlike require_role(), this has no
    "open" fallback: every CRUD endpoint that touches per-user data requires a real session,
    since there's no meaningful way to scope a query to "no particular user"."""

    async def _dependency(authorization: Optional[str] = Header(default=None)) -> tuple[str, Role]:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
        token = authorization.removeprefix("Bearer ").strip()
        identity = await resolve_identity_from_access_token(token)
        if identity is None:
            raise HTTPException(status_code=401, detail="Invalid or expired session.")
        return identity

    return _dependency
