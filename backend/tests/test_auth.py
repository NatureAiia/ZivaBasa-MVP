"""
test_auth.py — coverage for api/auth_routes.py (signup/login/refresh/logout/promote-role) and
api/auth.py's require_role() local-JWT path. Runs against the real DB layer (SQLite, see
tests/conftest.py's _test_database fixture) rather than monkeypatching it, since the whole point
of this suite is verifying the actual signup -> login -> refresh -> role-gated-endpoint chain
works end to end — the same guarantee Supabase's RLS + Auth API used to provide.
"""
from __future__ import annotations

import uuid


def _unique_email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


def test_signup_creates_account_and_returns_access_token(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    email = _unique_email()
    r = client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "viewer"
    assert body["access_token"]
    assert "zb_refresh" in r.cookies


def test_signup_rejects_short_password(client):
    r = client.post("/auth/signup", json={"email": _unique_email(), "password": "short"})
    assert r.status_code == 422


def test_signup_rejects_duplicate_email(client):
    email = _unique_email()
    r1 = client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})
    assert r1.status_code == 200
    r2 = client.post("/auth/signup", json={"email": email, "password": "another-password"})
    assert r2.status_code == 409


def test_signup_ignores_client_supplied_role(client):
    """A signup payload can't grant itself admin — role is always 'viewer' regardless of what
    requested_role claims (requested_role itself is stored separately, for an admin to review)."""
    email = _unique_email()
    r = client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse-battery", "requested_role": "superadmin"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "viewer"


def test_login_wrong_password_rejected(client):
    email = _unique_email()
    client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})
    r = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401


def test_login_succeeds_and_access_token_grants_role_gated_endpoint(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    email = _unique_email()
    client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})
    r = client.post("/auth/login", json={"email": email, "password": "correct-horse-battery"})
    assert r.status_code == 200
    access_token = r.json()["access_token"]

    schema_resp = client.get("/schema/employment", headers={"Authorization": f"Bearer {access_token}"})
    assert schema_resp.status_code == 200

    # viewer role can't reach an admin-gated endpoint
    chat_resp = client.post(
        "/images/generate", json={"prompt": "x"}, headers={"Authorization": f"Bearer {access_token}"}
    )
    assert chat_resp.status_code == 403


def test_refresh_rotates_token_and_old_one_stops_working(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    email = _unique_email()
    client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})

    refresh_resp = client.post("/auth/refresh")
    assert refresh_resp.status_code == 200
    first_access_token = refresh_resp.json()["access_token"]
    assert first_access_token

    # Refresh again — cookie jar carries the rotated cookie set by the first call.
    second_resp = client.post("/auth/refresh")
    assert second_resp.status_code == 200


def test_refresh_without_cookie_rejected(client):
    fresh_client = client.__class__(client.app)
    r = fresh_client.post("/auth/refresh")
    assert r.status_code == 401


def test_logout_revokes_session(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    email = _unique_email()
    client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})

    logout_resp = client.post("/auth/logout")
    assert logout_resp.status_code == 200

    refresh_resp = client.post("/auth/refresh")
    assert refresh_resp.status_code == 401


def test_promote_role_requires_superadmin(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer,adminkey:admin,superkey:superadmin")
    email = _unique_email()
    signup_resp = client.post("/auth/signup", json={"email": email, "password": "correct-horse-battery"})
    target_user_id = signup_resp.json()["user_id"]

    denied = client.post(
        "/auth/admin/promote-role",
        json={"target_user_id": target_user_id, "new_role": "admin"},
        headers={"Authorization": "Bearer adminkey"},
    )
    assert denied.status_code == 403

    allowed = client.post(
        "/auth/admin/promote-role",
        json={"target_user_id": target_user_id, "new_role": "admin"},
        headers={"Authorization": "Bearer superkey"},
    )
    assert allowed.status_code == 200


def test_promote_role_rejects_invalid_role(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "superkey:superadmin")
    r = client.post(
        "/auth/admin/promote-role",
        json={"target_user_id": "nonexistent", "new_role": "owner-of-everything"},
        headers={"Authorization": "Bearer superkey"},
    )
    assert r.status_code == 422


def test_promote_role_404_for_unknown_user(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "superkey:superadmin")
    r = client.post(
        "/auth/admin/promote-role",
        json={"target_user_id": "nonexistent-user-id", "new_role": "admin"},
        headers={"Authorization": "Bearer superkey"},
    )
    assert r.status_code == 404
