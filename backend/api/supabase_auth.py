"""
supabase_auth.py — resolves a real per-user role from the frontend's actual logged-in Supabase
session, so api/auth.py's require_role() reflects who is really calling instead of only the
optional ZIVABASA_API_KEYS scheme (which the frontend never sends today).

OFF BY DEFAULT, same pattern as every other optional secret in this project: unless BOTH
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set on the *backend*, this module resolves
nothing and auth.py's existing behavior is completely unchanged.

SUPABASE_SERVICE_ROLE_KEY is deliberately a separate secret from the frontend's
VITE_SUPABASE_ANON_KEY (see frontend/src/lib/supabaseClient.js) — the service role key bypasses
Row Level Security by design, which is required here to look up an arbitrary caller's
profiles.role, but must never be shipped to the browser. Get it from Supabase's dashboard
(Project Settings -> API -> service_role key), not the anon/publishable key already in the
frontend's .env.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx

# Read fresh on every call, same convention as auth.py's _load_keys() — required for
# monkeypatch.setenv to work in tests, and so a running process picks up a change without a
# restart-triggered re-import in the same way every other optional key in this project does.
def _supabase_url() -> Optional[str]:
    return os.environ.get("SUPABASE_URL")


def _service_role_key() -> Optional[str]:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def configured() -> bool:
    return bool(_supabase_url() and _service_role_key())


async def resolve_identity_from_token(token: str) -> Optional[tuple[str, str]]:
    """Validates a Supabase access token against Supabase Auth, then looks up that user's
    profiles.role via the service role key (bypassing RLS, which is the point — RLS scopes a
    normal user to their own row, but the backend needs to resolve *the caller's* identity to
    enforce access control and per-user token billing in the first place). Returns
    (user_id, role), or None if the token is invalid, the profile doesn't exist, or this
    backend isn't configured for Supabase auth at all.

    Both user_id and role come out of this one call (not two) because the /auth/v1/user lookup
    that resolves user_id is required either way to then look up profiles.role — api/tokens.py
    needs user_id (to spend/check that user's token balance) alongside the role api/auth.py's
    resolve_role_from_token() below already needed, so this is the shared, single source of
    truth for both rather than two independent round-trips to Supabase.
    """
    url, service_key = _supabase_url(), _service_role_key()
    if not (url and service_key):
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        user_resp = await client.get(
            f"{url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": service_key},
        )
        if user_resp.status_code != 200:
            return None
        user_id = user_resp.json().get("id")
        if not user_id:
            return None

        profile_resp = await client.get(
            f"{url}/rest/v1/profiles",
            params={"user_id": f"eq.{user_id}", "select": "role"},
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
        )
        if profile_resp.status_code != 200:
            return None
        rows = profile_resp.json()
        if not rows:
            return None
        role = rows[0].get("role")
        if not role:
            return None
        return user_id, role


async def resolve_role_from_token(token: str) -> Optional[str]:
    """Thin wrapper over resolve_identity_from_token() for callers (api/auth.py) that only
    need the role, not the user_id."""
    identity = await resolve_identity_from_token(token)
    return identity[1] if identity else None
