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
"""
from __future__ import annotations

import os
from typing import Dict, Optional

from fastapi import Header, HTTPException

Role = str  # "admin" | "viewer"
_ROLE_RANK = {"viewer": 0, "admin": 1}


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
    """FastAPI dependency factory. When ZIVABASA_API_KEYS is unset, always passes (auth
    disabled — see module docstring). When set, requires a valid bearer token whose configured
    role meets or exceeds min_role ("admin" satisfies a "viewer" requirement; "viewer" does not
    satisfy an "admin" requirement)."""

    async def _dependency(authorization: Optional[str] = Header(default=None)) -> Optional[Role]:
        keys = _load_keys()
        if not keys:
            return None  # auth disabled — open, as before this file existed

        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
        token = authorization.removeprefix("Bearer ").strip()
        role = keys.get(token)
        if role is None:
            raise HTTPException(status_code=401, detail="Invalid API key.")
        if _ROLE_RANK.get(role, -1) < _ROLE_RANK.get(min_role, 0):
            raise HTTPException(status_code=403, detail=f"Role '{role}' lacks required '{min_role}' access.")
        return role

    return _dependency
