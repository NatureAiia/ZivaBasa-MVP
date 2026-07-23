"""
No real Anthropic calls here, same policy as test_chat.py — these only check the "not
configured" failure paths plus the _build_graph/tool logic directly, not a live agent run.
"""
import pytest

from api import agent_graph

langgraph = pytest.importorskip("langgraph")
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel


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

    async def astream(self, messages):
        self.calls += 1
        yield AIMessage(content="", tool_calls=[
            {"name": "_dummy_tool", "args": {"x": self.calls}, "id": f"call{self.calls}"}
        ])


class _EventuallyDoneModel:
    """Requests a tool call twice, then returns a final answer with no tool calls."""

    def __init__(self):
        self.calls = 0

    def bind_tools(self, tools):
        return self

    async def astream(self, messages):
        self.calls += 1
        if self.calls < 3:
            yield AIMessage(content="", tool_calls=[
                {"name": "_dummy_tool", "args": {"x": self.calls}, "id": f"call{self.calls}"}
            ])
        else:
            yield AIMessage(content="final answer")


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


def test_scan_org_risk_skips_roles_missing_target_or_fields(monkeypatch):
    org_nodes = [
        {"title": "No target", "current_skills": [], "target_skills": [], "target_role": None,
         "seniority_years": 3, "avg_salary_usd": 50000, "performance_rating": 4,
         "recent_training_hours": 10, "recent_ot_hours": 2},
        {"title": "Missing fields", "current_skills": ["sql"], "target_skills": ["sql", "python"],
         "target_role": "Data Analyst", "seniority_years": 2, "avg_salary_usd": None,
         "performance_rating": 4, "recent_training_hours": 10, "recent_ot_hours": 2},
    ]
    monkeypatch.setattr(agent_graph, "_supabase_client", lambda: _FakeClient({"org_nodes": org_nodes}))

    tools = {t.name: t for t in agent_graph._build_tools("user-1", "viewer")}
    result = tools["scan_org_risk"].invoke({})

    assert result["scanned"] == []
    reasons = {s["title"]: s["reason"] for s in result["skipped"]}
    assert reasons["No target"] == "no target_role set"
    assert "avg_salary_usd" in reasons["Missing fields"]


def test_scan_org_risk_runs_prediction_for_complete_roles(monkeypatch):
    org_nodes = [
        {"title": "Analyst", "current_skills": ["sql", "excel"], "target_skills": ["sql", "python"],
         "target_role": "Data Analyst", "seniority_years": 3, "avg_salary_usd": 50000,
         "performance_rating": 4, "recent_training_hours": 10, "recent_ot_hours": 2},
    ]
    monkeypatch.setattr(agent_graph, "_supabase_client", lambda: _FakeClient({"org_nodes": org_nodes}))

    captured = {}

    def fake_run_prediction_tool(name, args):
        captured["name"] = name
        captured["args"] = args
        return {"task": "skill_match", "probability": 0.8, "label": 1}

    monkeypatch.setattr(agent_graph, "_run_prediction_tool", fake_run_prediction_tool)

    tools = {t.name: t for t in agent_graph._build_tools("user-1", "viewer")}
    result = tools["scan_org_risk"].invoke({})

    assert result["skipped"] == []
    assert len(result["scanned"]) == 1
    assert result["scanned"][0]["title"] == "Analyst"
    assert result["scanned"][0]["probability"] == 0.8
    assert captured["name"] == "predict_task"
    features = captured["args"]["features"]
    assert features["skill_overlap_count"] == 1  # "sql" is the only shared skill
    assert features["missing_skill_count"] == 1  # "python" is missing
    assert features["overlap_x_training"] == 1 * 10


def test_remember_note_and_recall_notes_round_trip(monkeypatch):
    fake_client = _FakeClient({"agent_memories": [{"note": "manages Sales", "created_at": "t"}]})
    monkeypatch.setattr(agent_graph, "_supabase_client", lambda: fake_client)

    tools = {t.name: t for t in agent_graph._build_tools("user-1", "viewer")}
    save_result = tools["remember_note"].invoke({"note": "manages Sales"})
    assert save_result == {"status": "saved"}

    recall_result = tools["recall_notes"].invoke({})
    assert recall_result["notes"][0]["note"] == "manages Sales"


@pytest.mark.anyio
async def test_build_graph_emits_token_stream_events_for_a_real_chat_model():
    """_build_graph's call_model node must actually stream (not .invoke()) so that
    stream_agent()'s astream_events() gets "on_chat_model_stream" frames — GenericFakeChatModel
    is a real langchain_core BaseChatModel (unlike the plain-object fakes above), so it exercises
    the real callback/tracing path a hand-rolled double can't."""
    model = GenericFakeChatModel(messages=iter([AIMessage(content="Hello world")]))
    graph = agent_graph._build_graph(model, [])

    tokens = []
    async for event in graph.astream_events(
        {"messages": [SystemMessage(content="sys"), HumanMessage(content="hi")], "tool_turns": 0},
        version="v2",
    ):
        if event["event"] == "on_chat_model_stream":
            tokens.append(agent_graph._chunk_text(event["data"]["chunk"].content))

    assert "".join(tokens) == "Hello world"
    assert len(tokens) > 1  # actually streamed in multiple chunks, not one blocking call


@pytest.mark.anyio
async def test_stream_agent_yields_error_frame_when_not_configured(monkeypatch):
    monkeypatch.setattr(agent_graph, "_LANGGRAPH_AVAILABLE", False)

    frames = [f async for f in agent_graph.stream_agent([{"role": "user", "content": "hi"}])]

    assert len(frames) == 1
    assert frames[0].startswith("data: ")
    import json
    payload = json.loads(frames[0][len("data: "):])
    assert payload["type"] == "error"
