"""
No real LLM keys are assumed present in CI (or wanted here — this suite shouldn't make paid
network calls to Anthropic/NVIDIA/Groq/Gemini). Every test below monkeypatches chat.py's
key-lookup state directly rather than the OS environment, since ANTHROPIC_API_KEY etc. are
read into module-level constants at import time (see chat.py) — patching os.environ after
import wouldn't be seen by code that already captured the value.
"""
from api import chat as chat_module


def test_chat_models_lists_catalog(client):
    r = client.get("/chat/models")
    assert r.status_code == 200
    models = r.json()["models"]
    assert len(models) > 0
    for m in models:
        assert {"provider", "model", "label", "supports_tools", "key_present"} <= set(m)


def test_chat_without_any_provider_configured_returns_503(client, monkeypatch):
    monkeypatch.setattr(chat_module, "_KEY_LOOKUP", {k: None for k in chat_module._KEY_LOOKUP})
    monkeypatch.setattr(chat_module, "CHAT_PROVIDER", None)

    r = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503


def test_chat_with_unconfigured_explicit_provider_returns_503(client, monkeypatch):
    monkeypatch.setattr(chat_module, "_KEY_LOOKUP", {k: None for k in chat_module._KEY_LOOKUP})
    monkeypatch.setattr(chat_module, "CHAT_PROVIDER", None)

    r = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "provider": "anthropic"},
    )
    assert r.status_code == 503
