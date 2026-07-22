"""
test_supabase_auth.py — coverage for api/auth.py's Supabase-session fallback (api/supabase_auth.py).

Same convention as test_chat.py/test_llm_gateway.py: no live network calls. Supabase's own HTTP
calls (resolve_role_from_token) are monkeypatched directly rather than mocking httpx, since the
property under test is auth.py's require_role() branching, not supabase_auth.py's HTTP plumbing.
"""
from __future__ import annotations

from api import supabase_auth


def test_supabase_fallback_inactive_when_unconfigured(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    # No token, no configured scheme at all — still fully open, exactly as before this feature.
    r = client.get("/schema/employment")
    assert r.status_code == 200


def test_supabase_fallback_requires_token_once_configured(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")
    r = client.get("/schema/employment")
    assert r.status_code == 401


def test_supabase_fallback_rejects_unresolvable_token(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")

    async def _fake_resolve(token):
        return None  # invalid/unrecognized token

    monkeypatch.setattr(supabase_auth, "resolve_role_from_token", _fake_resolve)
    r = client.get("/schema/employment", headers={"Authorization": "Bearer bad-token"})
    assert r.status_code == 401


def test_supabase_fallback_resolves_viewer_role(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")

    async def _fake_resolve(token):
        return "viewer"

    monkeypatch.setattr(supabase_auth, "resolve_role_from_token", _fake_resolve)
    r = client.get("/schema/employment", headers={"Authorization": "Bearer good-token"})
    assert r.status_code == 200


def test_supabase_fallback_viewer_forbidden_on_admin_endpoint(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")

    async def _fake_resolve(token):
        return "viewer"

    monkeypatch.setattr(supabase_auth, "resolve_role_from_token", _fake_resolve)
    r = client.post(
        "/images/generate",
        json={"prompt": "a bank branch icon"},
        headers={"Authorization": "Bearer good-token"},
    )
    assert r.status_code == 403


def test_supabase_fallback_superadmin_satisfies_admin_requirement(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")

    async def _fake_resolve(token):
        return "superadmin"

    monkeypatch.setattr(supabase_auth, "resolve_role_from_token", _fake_resolve)
    r = client.post(
        "/images/generate",
        json={"prompt": "a bank branch icon"},
        headers={"Authorization": "Bearer good-token"},
    )
    assert r.status_code not in (401, 403)


def test_api_keys_scheme_takes_priority_over_supabase(client, monkeypatch):
    """When ZIVABASA_API_KEYS IS configured, that scheme is used exclusively — the Supabase
    fallback should never even be consulted (a viewer key must still be rejected on an admin
    endpoint even if a stubbed Supabase resolver would return 'superadmin')."""
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")

    async def _fake_resolve(token):
        return "superadmin"

    monkeypatch.setattr(supabase_auth, "resolve_role_from_token", _fake_resolve)
    r = client.post(
        "/images/generate",
        json={"prompt": "a bank branch icon"},
        headers={"Authorization": "Bearer viewkey"},
    )
    assert r.status_code == 403
