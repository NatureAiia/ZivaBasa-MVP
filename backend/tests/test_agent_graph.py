"""
No real Anthropic calls here, same policy as test_chat.py — these only check the "not
configured" failure paths, not a live agent run.
"""
from api import agent_graph


def test_chat_agent_without_langgraph_installed_returns_503(client, monkeypatch):
    monkeypatch.setattr(agent_graph, "_LANGGRAPH_AVAILABLE", False)

    r = client.post("/chat/agent", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503


def test_chat_agent_without_anthropic_key_returns_503(client, monkeypatch):
    monkeypatch.setattr(agent_graph, "_LANGGRAPH_AVAILABLE", True)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    r = client.post("/chat/agent", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503
