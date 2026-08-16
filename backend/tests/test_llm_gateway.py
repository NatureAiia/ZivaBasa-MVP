"""
test_llm_gateway.py — unit + integration coverage for api/llm_gateway.py (Phase 5 LLM cost
governance: per-provider daily token budgets + tiered fallback across chat.py's providers).

No real LLM keys/network calls here (same rule as test_chat.py) — chat_module._DISPATCH entries
are monkeypatched with stub coroutines instead.
"""
from __future__ import annotations

import pytest

from api import chat as chat_module
from api import llm_gateway


@pytest.fixture(autouse=True)
def _reset_usage_state():
    """llm_gateway's usage tracker is module-level (in-memory) — reset it around every test so
    tests don't leak budget state into each other."""
    llm_gateway._usage_by_provider.clear()
    yield
    llm_gateway._usage_by_provider.clear()


def test_tokens_used_today_starts_at_zero():
    assert llm_gateway.tokens_used_today("anthropic") == 0


def test_record_usage_accumulates_within_same_day():
    llm_gateway.record_usage("anthropic", {"input_tokens": 100, "output_tokens": 50})
    llm_gateway.record_usage("anthropic", {"input_tokens": 10, "output_tokens": 5})
    assert llm_gateway.tokens_used_today("anthropic") == 165


def test_has_budget_true_when_no_env_var_set(monkeypatch):
    monkeypatch.delenv("ZIVABASA_BUDGET_ANTHROPIC_TOKENS", raising=False)
    llm_gateway.record_usage("anthropic", {"input_tokens": 10_000_000, "output_tokens": 0})
    assert llm_gateway.has_budget("anthropic") is True  # unlimited by default


def test_has_budget_false_once_cap_exceeded(monkeypatch):
    monkeypatch.setenv("ZIVABASA_BUDGET_ANTHROPIC_TOKENS", "100")
    llm_gateway.record_usage("anthropic", {"input_tokens": 80, "output_tokens": 30})
    assert llm_gateway.has_budget("anthropic") is False


def test_budget_status_reports_configured_and_remaining(monkeypatch):
    monkeypatch.setenv("ZIVABASA_BUDGET_ANTHROPIC_TOKENS", "1000")
    monkeypatch.delenv("ZIVABASA_BUDGET_GROQ_TOKENS", raising=False)
    llm_gateway.record_usage("anthropic", {"input_tokens": 200, "output_tokens": 100})

    status = llm_gateway.budget_status(chat_module.MODEL_CATALOG)
    assert status["anthropic"] == {"budget_tokens_per_day": 1000, "used_today": 300, "remaining_today": 700}
    assert status["groq"]["budget_tokens_per_day"] is None
    assert status["groq"]["remaining_today"] is None


@pytest.mark.anyio
async def test_send_chat_with_fallback_falls_through_on_error(monkeypatch):
    async def failing_anthropic(messages):
        raise RuntimeError("simulated 429 rate limit")

    async def working_groq(messages):
        return "groq reply", {"input_tokens": 5, "output_tokens": 5}, [], []

    monkeypatch.setattr(chat_module, "_KEY_LOOKUP", {
        "ANTHROPIC_API_KEY": "fake", "NVIDIA_API_KEY": None, "GROQ_API_KEY": "fake", "GEMINI_API_KEY": None,
    })
    monkeypatch.setitem(chat_module._DISPATCH, "anthropic", failing_anthropic)
    monkeypatch.setitem(chat_module._DISPATCH, "groq", working_groq)

    result = await llm_gateway.send_chat_with_fallback(
        [{"role": "user", "content": "hi"}], provider="anthropic"
    )
    assert result["provider"] == "groq"
    assert result["reply"] == "groq reply"
    outcomes = {a["provider"]: a["outcome"] for a in result["fallback_chain"]}
    assert outcomes["anthropic"].startswith("error:")
    assert outcomes["groq"] == "success"


@pytest.mark.anyio
async def test_send_chat_with_fallback_skips_over_budget_provider(monkeypatch):
    async def working_anthropic(messages):
        return "anthropic reply", {"input_tokens": 5, "output_tokens": 5}, [], []

    monkeypatch.setattr(chat_module, "_KEY_LOOKUP", {
        "ANTHROPIC_API_KEY": "fake", "NVIDIA_API_KEY": None, "GROQ_API_KEY": "fake", "GEMINI_API_KEY": None,
    })
    monkeypatch.setitem(chat_module._DISPATCH, "anthropic", working_anthropic)
    monkeypatch.setenv("ZIVABASA_BUDGET_GROQ_TOKENS", "10")
    llm_gateway.record_usage("groq", {"input_tokens": 100, "output_tokens": 0})  # already over budget

    result = await llm_gateway.send_chat_with_fallback([{"role": "user", "content": "hi"}], provider="groq")
    assert result["provider"] == "anthropic"
    outcomes = {a["provider"]: a["outcome"] for a in result["fallback_chain"]}
    assert outcomes["groq"] == "skipped_budget_exhausted"
    assert outcomes["anthropic"] == "success"


@pytest.mark.anyio
async def test_send_chat_with_fallback_raises_when_all_exhausted(monkeypatch):
    async def failing(messages):
        raise RuntimeError("down")

    monkeypatch.setattr(chat_module, "_KEY_LOOKUP", {
        "ANTHROPIC_API_KEY": "fake", "NVIDIA_API_KEY": None, "GROQ_API_KEY": None, "GEMINI_API_KEY": None,
    })
    monkeypatch.setitem(chat_module._DISPATCH, "anthropic", failing)

    with pytest.raises(RuntimeError, match="exhausted or failed"):
        await llm_gateway.send_chat_with_fallback([{"role": "user", "content": "hi"}])


def test_chat_budget_endpoint(client):
    r = client.get("/chat/budget")
    assert r.status_code == 200
    body = r.json()
    for provider in ("anthropic", "nvidia", "groq", "gemini"):
        assert provider in body
        assert set(body[provider]) == {"budget_tokens_per_day", "used_today", "remaining_today"}
