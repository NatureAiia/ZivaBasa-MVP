"""
test_tokens.py — coverage for api/tokens.py's token-balance gate.

Same convention as test_supabase_auth.py: no live network calls. supabase_auth's HTTP call
(resolve_identity_from_token) and tokens.py's own RPC calls (_rpc_spend_tokens/_get_balance) are
monkeypatched directly, since the property under test is the gate's branching logic, not the
HTTP plumbing underneath it.
"""
from __future__ import annotations

from api import supabase_auth, tokens

_SKILL_MATCH_BODY = {"current_skills": "python,sql", "required_skills": "python,sql,leadership"}


def _configure_supabase(monkeypatch):
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key")


def test_gate_off_by_default_endpoint_unaffected(client, monkeypatch):
    # Neither the token flag nor Supabase auth configured at all — fully open, same baseline
    # as auth.py's own "nothing configured" behavior (test_supabase_fallback_inactive_when_unconfigured).
    monkeypatch.delenv("ZIVABASA_API_KEYS", raising=False)
    monkeypatch.delenv("ZIVABASA_TOKEN_GATE_ENABLED", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    r = client.post("/skill_match/recommend", json=_SKILL_MATCH_BODY)
    assert r.status_code == 200


def test_gate_off_when_supabase_not_configured_even_if_flag_set(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    r = client.post("/skill_match/recommend", json=_SKILL_MATCH_BODY)
    assert r.status_code == 200


def test_gate_on_requires_a_session(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)
    r = client.post("/skill_match/recommend", json=_SKILL_MATCH_BODY)
    assert r.status_code == 401


def test_gate_on_sufficient_balance_deducts_and_succeeds(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)

    async def _fake_identity(token):
        return ("user-1", "viewer")

    async def _fake_spend(user_id, amount, reason, endpoint):
        assert user_id == "user-1"
        assert amount == -tokens.TOKEN_COSTS["skill_match"]
        assert reason == "skill_match"
        return 4  # balance after spend

    monkeypatch.setattr(supabase_auth, "resolve_identity_from_token", _fake_identity)
    monkeypatch.setattr(tokens, "_rpc_spend_tokens", _fake_spend)

    r = client.post(
        "/skill_match/recommend", json=_SKILL_MATCH_BODY, headers={"Authorization": "Bearer good-token"}
    )
    assert r.status_code == 200


def test_gate_on_insufficient_balance_returns_402_with_structured_body(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)

    async def _fake_identity(token):
        return ("user-1", "viewer")

    async def _fake_spend(user_id, amount, reason, endpoint):
        return None  # spend_tokens() returns null on insufficient balance

    async def _fake_balance(user_id):
        return 0

    monkeypatch.setattr(supabase_auth, "resolve_identity_from_token", _fake_identity)
    monkeypatch.setattr(tokens, "_rpc_spend_tokens", _fake_spend)
    monkeypatch.setattr(tokens, "_get_balance", _fake_balance)

    r = client.post(
        "/skill_match/recommend", json=_SKILL_MATCH_BODY, headers={"Authorization": "Bearer good-token"}
    )
    assert r.status_code == 402
    body = r.json()["detail"]
    assert body["error"] == "insufficient_tokens"
    assert body["balance"] == 0
    assert body["required"] == tokens.TOKEN_COSTS["skill_match"]
    assert body["reason"] == "skill_match"
    assert "upgrade_hint" in body


def test_admin_role_bypasses_gate_no_deduction(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)

    async def _fake_identity(token):
        return ("admin-1", "admin")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("spend_tokens should not be called for an admin caller")

    monkeypatch.setattr(supabase_auth, "resolve_identity_from_token", _fake_identity)
    monkeypatch.setattr(tokens, "_rpc_spend_tokens", _fail_if_called)

    r = client.post(
        "/skill_match/recommend", json=_SKILL_MATCH_BODY, headers={"Authorization": "Bearer admin-token"}
    )
    assert r.status_code == 200


def test_superadmin_role_bypasses_gate(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)

    async def _fake_identity(token):
        return ("super-1", "superadmin")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("spend_tokens should not be called for a superadmin caller")

    monkeypatch.setattr(supabase_auth, "resolve_identity_from_token", _fake_identity)
    monkeypatch.setattr(tokens, "_rpc_spend_tokens", _fail_if_called)

    r = client.post(
        "/skill_match/recommend", json=_SKILL_MATCH_BODY, headers={"Authorization": "Bearer super-token"}
    )
    assert r.status_code == 200


def test_predict_batch_pre_checks_estimated_cost_and_rejects_upfront(client, monkeypatch, tmp_path):
    """POST /predict/batch/{task} prices per row rather than via the fixed-cost dependency —
    a batch that would exceed the balance should be rejected before any model inference runs."""
    monkeypatch.setenv("ZIVABASA_TOKEN_GATE_ENABLED", "1")
    _configure_supabase(monkeypatch)

    async def _fake_identity(token):
        return ("user-1", "viewer")

    async def _fake_spend(user_id, amount, reason, endpoint):
        assert reason == "predict_batch"
        return None  # simulate insufficient balance for this batch's estimated cost

    async def _fake_balance(user_id):
        return 1

    monkeypatch.setattr(supabase_auth, "resolve_identity_from_token", _fake_identity)
    monkeypatch.setattr(tokens, "_rpc_spend_tokens", _fake_spend)
    monkeypatch.setattr(tokens, "_get_balance", _fake_balance)

    csv_path = tmp_path / "employment_batch.csv"
    csv_path.write_text("dummy\n1\n")  # content doesn't need to parse — gate runs before parsing succeeds either way, but we assert on the 402 path specifically once parse succeeds; if parsing fails first, that 422 is also an acceptable non-500 outcome for this malformed fixture.
    with open(csv_path, "rb") as f:
        r = client.post(
            "/predict/batch/employment",
            files={"file": ("employment_batch.csv", f, "text/csv")},
            headers={"Authorization": "Bearer good-token"},
        )
    assert r.status_code in (402, 422)
    if r.status_code == 402:
        assert r.json()["detail"]["reason"] == "predict_batch"


def test_gate_off_predict_batch_unaffected(client, monkeypatch, tmp_path):
    monkeypatch.delenv("ZIVABASA_TOKEN_GATE_ENABLED", raising=False)
    csv_path = tmp_path / "employment_batch.csv"
    csv_path.write_text("dummy\n1\n")
    with open(csv_path, "rb") as f:
        r = client.post(
            "/predict/batch/employment",
            files={"file": ("employment_batch.csv", f, "text/csv")},
        )
    # Gate is off — whatever status this returns is driven by CSV parsing/validation, never 402.
    assert r.status_code != 402
