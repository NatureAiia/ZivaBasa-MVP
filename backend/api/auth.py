"""
auth.py — Optional API-key bearer auth + role-based access control (Section 8 Security &
Compliance: "Secure authentication", "Role-based access control on API endpoints", "Secure API
access tokens").

OFF BY DEFAULT, same pattern as every other optional key in this project (chat providers,
Supabase, macro data): if `ZIVABASA_API_KEYS` isn't set, every endpoint behaves exactly as it did
before this file existed — open, no token required. This matters concretely here: the frontend
has no login screen today, so making auth mandatory by default would break every existing
request path the moment this shipped, for a `docker compose up` that sets no new env var at all.
Once an operator sets `ZIVABASA_API_KEYS` (format: `"key1:role1,key2:role2"`, roles are `admin`
or `viewer`), sensitive/costly endpoints start requiring a valid `Authorization: Bearer <key>`
header carrying a role that meets the endpoint's minimum.

SCOPE NOTE on "secure authentication + password hashing": this implements API-key bearer auth,
not a username/password login system — there is no user-account database or login UI anywhere
in this frontend to hash passwords for. If a real per-user login system is added later, password
hashing (e.g. via passlib/bcrypt) becomes relevant then, not retrofitted onto a machine-to-machine
API key scheme now.

SUPABASE FALLBACK (added alongside the 3rd role tier): the ZIVABASA_API_KEYS scheme above was,
until now, the *only* thing require_role() could ever resolve a role from — and the frontend
never sends an Authorization header, so in practice every endpoint stayed fully open regardless
of who was logged in. require_role() now also tries resolving a role from the caller's actual
Supabase session (see supabase_auth.py) when ZIVABASA_API_KEYS isn't configured. This activates
only once SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are BOTH set on the backend — unset, behavior
is byte-for-byte what it was before this change (fully open).
"""
from __future__ import annotations

import os
from typing import Dict, Optional

from fastapi import Header, HTTPException

from api import supabase_auth

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


def require_role(min_role: Role = "viewer"):
    """FastAPI dependency factory. Tries, in order: the ZIVABASA_API_KEYS bearer-token scheme
    (unchanged from before), then — only if that scheme isn't configured — a Supabase-session
    fallback (see supabase_auth.py). If NEITHER is configured, always passes with role=None
    (fully open, identical to this file's original behavior). Once either is configured, a
    missing/invalid/insufficient token is rejected (401/403) rather than silently allowed
    through — configuring either secret is the explicit opt-in to real enforcement."""

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

        if supabase_auth.configured():
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
            token = authorization.removeprefix("Bearer ").strip()
            role = await supabase_auth.resolve_role_from_token(token)
            if role is None:
                raise HTTPException(status_code=401, detail="Invalid or unrecognized session.")
            if _ROLE_RANK.get(role, -1) < _ROLE_RANK.get(min_role, 0):
                raise HTTPException(status_code=403, detail=f"Role '{role}' lacks required '{min_role}' access.")
            return role

        return None  # neither scheme configured — open, as before this file existed

    return _dependency
