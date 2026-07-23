"""
No real Anthropic calls here, same policy as test_chat.py — these only check the "not
configured" failure paths plus the _build_graph/tool logic directly, not a live agent run.
"""
import pytest

from api import agent_graph

langgraph = pytest.importorskip("langgraph")
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool


def test_chat_agent_without_langgraph_installed_returns_503(client, monkeypatch):
    monkeypatch.setattr(agent_graph, "_LANGGRAPH_AVAILABLE", False)

    r = client.post("/chat/agent", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503


def test_chat_agent_without_anthropic_key_returns_503(client, monkeypatch):
    monkeypatch.setattr(agent_graph, "_LANGGRAPH_AVAILABLE", True)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    r = client.post("/chat/agent", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503


@tool
def _dummy_tool(x: int) -> dict:
    """A dummy tool used only to exercise _build_graph's routing logic."""
    return {"result": x * 2}


class _StuckModel:
    """Always requests a tool call, never stops — used to verify the graph's iteration cap
    actually terminates the loop instead of running forever, unlike the create_react_agent
    prebuilt this replaced."""

    def __init__(self):
        self.calls = 0

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        self.calls += 1
        return AIMessage(content="", tool_calls=[
            {"name": "_dummy_tool", "args": {"x": self.calls}, "id": f"call{self.calls}"}
        ])


class _EventuallyDoneModel:
    """Requests a tool call twice, then returns a final answer with no tool calls."""

    def __init__(self):
        self.calls = 0

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        self.calls += 1
        if self.calls < 3:
            return AIMessage(content="", tool_calls=[
                {"name": "_dummy_tool", "args": {"x": self.calls}, "id": f"call{self.calls}"}
            ])
        return AIMessage(content="final answer")


async def _invoke(model, tools):
    graph = agent_graph._build_graph(model, tools)
    return await graph.ainvoke({
        "messages": [SystemMessage(content="sys"), HumanMessage(content="hi")],
        "tool_turns": 0,
    })


@pytest.mark.anyio
async def test_build_graph_stops_after_model_gives_final_answer():
    model = _EventuallyDoneModel()
    result = await _invoke(model, [_dummy_tool])
    assert result["messages"][-1].content == "final answer"
    assert model.calls == 3  # 2 tool-call turns + 1 final turn


@pytest.mark.anyio
async def test_build_graph_enforces_iteration_cap():
    model = _StuckModel()
    result = await _invoke(model, [_dummy_tool])
    assert model.calls == agent_graph._MAX_TOOL_TURNS
    assert result["messages"][-1].content == agent_graph._GIVE_UP_MESSAGE


class _FakeResp:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Chainable stand-in for supabase-py's query builder — every method just returns self so
    any .select().eq().order().limit() chain works, and .execute() returns the fixed data."""

    def __init__(self, data):
        self._data = data

    def select(self, *a, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def insert(self, payload):
        self._data = [payload]
        return self

    def execute(self):
        return _FakeResp(self._data)


class _FakeClient:
    def __init__(self, table_data: dict):
        self._table_data = table_data
        self.inserted = []

    def table(self, name):
        return _FakeQuery(self._table_data.get(name, []))


def test_get_skill_gap_summary_computes_set_difference(monkeypatch):
    org_nodes = [
        {"title": "Analyst", "seniority_years": 2,
         "current_skills": ["sql", "excel"], "target_skills": ["sql", "python"]},
        {"title": "Manager", "seniority_years": 5,
         "current_skills": ["leadership"], "target_skills": ["leadership"]},
    ]
    monkeypatch.setattr(agent_graph, "_supabase_client",
                         lambda: _FakeClient({"org_nodes": org_nodes}))

    tools = {t.name: t for t in agent_graph._build_tools("user-1", "viewer")}
    result = tools["get_skill_gap_summary"].invoke({})

    gaps = {g["title"]: g for g in result["skill_gaps"]}
    assert gaps["Analyst"]["overlap_count"] == 1
    assert gaps["Analyst"]["missing_skill_count"] == 1
    assert gaps["Analyst"]["missing_skills"] == ["python"]
    assert gaps["Manager"]["missing_skill_count"] == 0


def test_get_skill_gap_summary_requires_signed_in_user():
    tools = {t.name: t for t in agent_graph._build_tools(None, "viewer")}
    result = tools["get_skill_gap_summary"].invoke({})
    assert "error" in result


def test_remember_note_and_recall_notes_round_trip(monkeypatch):
    fake_client = _FakeClient({"agent_memories": [{"note": "manages Sales", "created_at": "t"}]})
    monkeypatch.setattr(agent_graph, "_supabase_client", lambda: fake_client)

    tools = {t.name: t for t in agent_graph._build_tools("user-1", "viewer")}
    save_result = tools["remember_note"].invoke({"note": "manages Sales"})
    assert save_result == {"status": "saved"}

    recall_result = tools["recall_notes"].invoke({})
    assert recall_result["notes"][0]["note"] == "manages Sales"
