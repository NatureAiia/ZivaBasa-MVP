"""
test_auth.py — coverage for api/auth.py's optional API-key + RBAC layer.

Critical property under test: auth is OFF by default (ZIVABASA_API_KEYS unset) — every other
test in this suite runs with no such env var set and must keep passing unmodified, since the
frontend has no login flow today. These tests explicitly set/unset that env var per case rather
than relying on whatever the test process happens to have.
"""
from __future__ import annotations

import pytest


def test_open_by_default_no_token_needed(client, monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    r = client.get("/schema/employment")
    assert r.status_code == 200


def test_health_always_open_even_with_auth_configured(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "secret123:admin")
    r = client.get("/health")
    assert r.status_code == 200


def test_missing_token_returns_401_when_auth_configured(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "secret123:admin")
    r = client.get("/schema/employment")
    assert r.status_code == 401


def test_malformed_header_returns_401(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "secret123:admin")
    r = client.get("/schema/employment", headers={"Authorization": "secret123"})
    assert r.status_code == 401


def test_invalid_token_returns_401(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "secret123:admin")
    r = client.get("/schema/employment", headers={"Authorization": "Bearer wrong-key"})
    assert r.status_code == 401


def test_valid_viewer_token_allows_viewer_endpoint(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer")
    r = client.get("/schema/employment", headers={"Authorization": "Bearer viewkey"})
    assert r.status_code == 200


def test_valid_admin_token_satisfies_viewer_requirement(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "adminkey:admin")
    r = client.get("/schema/employment", headers={"Authorization": "Bearer adminkey"})
    assert r.status_code == 200


def test_viewer_token_forbidden_on_admin_endpoint(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer")
    r = client.post("/images/generate", json={"prompt": "a bank branch icon"},
                     headers={"Authorization": "Bearer viewkey"})
    assert r.status_code == 403


def test_admin_token_passes_auth_on_admin_endpoint(client, monkeypatch):
    """Admin role should get past the auth layer — whatever happens next (e.g. 503 because no
    image-gen provider key is configured in this test env) is a downstream concern, not auth's."""
    monkeypatch.setenv("ZIVABASA_API_KEYS", "adminkey:admin")
    r = client.post("/images/generate", json={"prompt": "a bank branch icon"},
                     headers={"Authorization": "Bearer adminkey"})
    assert r.status_code not in (401, 403)


def test_multiple_keys_parsed_correctly(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer,adminkey:admin")
    r1 = client.get("/schema/employment", headers={"Authorization": "Bearer viewkey"})
    r2 = client.get("/schema/employment", headers={"Authorization": "Bearer adminkey"})
    assert r1.status_code == 200
    assert r2.status_code == 200
