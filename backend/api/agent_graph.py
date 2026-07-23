"""
agent_graph.py — a LangGraph-powered "Chiedza" agent, added as a parallel capability
alongside api/chat.py's hand-rolled multi-provider chat loop, NOT a replacement for it.
POST /chat keeps working exactly as it did; this backs the new POST /chat/agent.

What this adds that plain chat.py's tool loop doesn't: chat.py's `predict_task`/`explain_task`
tools only ever compute fresh outputs from features the person types in. Chiedza's whole point
per the product brief is to "take info from the app and give users [answers]" — so this module
adds tools that read the signed-in user's OWN previously-saved data (org chart, prediction
history, batch results, a derived skill-gap summary, and durable notes saved via remember_note/
recall_notes) out of Supabase, and reuses chat.py's existing prediction tools rather than
duplicating that logic.

OPTIONAL, OFF BY DEFAULT — same convention as every other optional feature in this project
(see auth.py's and chat.py's own module docstrings): if `langgraph`/`langchain-anthropic`
aren't installed, or ANTHROPIC_API_KEY isn't set, `run_agent()` raises a plain RuntimeError
with a clear message (caught by main.py and turned into a 503) rather than the import itself
breaking API startup for everyone else.

GRAPH, NOT THE PREBUILT: this used to call LangGraph's `create_react_agent` prebuilt directly.
That prebuilt's agent<->tools loop has no iteration cap — a confused model could keep issuing
tool calls indefinitely, unlike every hand-rolled provider loop in chat.py, which all bound
themselves to 4 turns (`for _ in range(4)`). `_build_graph()` below reimplements the same
agent<->tools loop explicitly as a two-node StateGraph so it can enforce that same 4-turn cap
(see `_route` / `_MAX_TOOL_TURNS`) and give later work (memory nodes, etc.) an actual graph to
extend instead of an opaque prebuilt.

VERSION CAVEAT, same honesty note as chat.py's provider functions: this was written strictly
against LangGraph 0.2.60's documented `StateGraph`/`ToolNode`/`bind_tools` contracts (see
requirements.txt), not exercised against a live Anthropic call or a real Supabase project from
the sandbox this was authored in. Test it against your own keys before relying on it.

SUPABASE ACCESS: reads use the SERVICE ROLE key (server-side env var only, never shipped to
the frontend, distinct from the anon key `supabaseClient.js` uses). The service role key
bypasses Row Level Security, so every query below manually filters `.eq("user_id", user_id)`
itself — this must never be relaxed to a "fetch everything" query, since RLS isn't there to
catch that mistake for a service-role connection the way it is for the frontend's anon-key one.
"""
from __future__ import annotations

import json
import os
from typing import Annotated, Optional, TypedDict

from api.chat import _run_prediction_tool

try:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_core.tools import tool
    from langchain_anthropic import ChatAnthropic
    from langgraph.graph import END, StateGraph
    from langgraph.graph.message import add_messages
    from langgraph.prebuilt import ToolNode
    _LANGGRAPH_AVAILABLE = True
except ImportError:
    _LANGGRAPH_AVAILABLE = False

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
AGENT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

# Same cap chat.py's hand-rolled provider loops use (`for _ in range(4)`) — see module
# docstring's "GRAPH, NOT THE PREBUILT" note.
_MAX_TOOL_TURNS = 4
_GIVE_UP_MESSAGE = ("I made several tool calls but couldn't reach a final answer in time — "
                    "try a more specific question.")

AGENT_SYSTEM_PROMPT = """You are Chiedza, ZivaBasa's AI assistant embedded in ChiedzaAI.

Unlike ZivaBasa's regular chat, you have tools that read the signed-in user's own previously
saved app data — their org chart, prediction history, and batch upload results — in addition
to the predict_task/explain_task tools that run a fresh prediction. Prefer grounding an answer
in the user's own data when a get_* tool is relevant to the question, instead of only running
a fresh prediction from scratch. If a get_* tool comes back empty or with an error (e.g. no
org chart saved yet, or no user is signed in), say so plainly and offer to run a fresh
prediction instead.

You also have get_skill_gap_summary, which compares current_skills against target_skills for
every role in the user's own org chart — a plain comparison of their own saved data, not a
prediction. Reach for this on skill-gap/training-needs questions instead of guessing at
feature values to run a skill_match prediction. If the user then wants a full skill_match
prediction for a specific role, ask for the remaining features it needs (recent_training_hours,
performance_rating, avg_salary_usd, recent_ot_hours) rather than inventing them — org data alone
never has enough to run a prediction responsibly.

You also have scan_org_risk, which runs a real skill_match prediction for every role that has
a target_role AND its business fields (avg_salary_usd, performance_rating,
recent_training_hours, recent_ot_hours) filled in — roles missing either are listed under
"skipped" with why, never guessed at. This only ever covers skill_match (redeployment fit) —
there is no honest org-wide scan for employment/skills/productivity, since those need per-role
synthetic-dataset features (job demand index, AI tool maturity, etc.) nothing in the org chart
captures; if asked for those org-wide, say so and offer a single role's prediction instead if
the person can supply the numbers.

You also have remember_note and recall_notes: use remember_note when the user states a durable
fact or preference about themselves or their org (e.g. "I manage the Sales dept", "always give
me short answers") so it's available in a later session, not just this conversation. Use
recall_notes when a question seems to depend on something said in an earlier session. Don't use
these for one-off prediction inputs — those belong in predict_task's features.

Same four tasks and feature lists as regular ZivaBasa chat: employment (automation risk),
skills (attrition risk), productivity (standardized score), skill_match (redeployment fit).
This is a prototype trained on Kaggle proxy / synthetic data, not real company data — say so
briefly when giving a prediction, without repeating it every message. Keep answers as short as
the question allows; ask one specific clarifying question when something is ambiguous, rather
than guessing silently."""

# Appended to AGENT_SYSTEM_PROMPT only when the signed-in user's Supabase profile.role is
# "admin" — see _lookup_role(). Never shown to a "viewer" or anonymous caller.
ADMIN_ADDENDUM = """

You are talking to an admin. You additionally have get_org_wide_chart, get_org_wide_predict_
history and get_org_wide_batch_results — these read the SAME tables as the get_org_chart /
get_predict_history / get_batch_results tools above, but across every user on the platform,
not just this admin's own rows. When you use one of the org-wide tools, say plainly that the
answer spans multiple users' data (e.g. "across N users' org charts") rather than presenting
it as if it were the admin's own."""

# Used instead of AGENT_SYSTEM_PROMPT for anonymous (not signed in) callers, with no tools
# bound at all — see run_agent(). Kept separate rather than reusing AGENT_SYSTEM_PROMPT with
# tools stripped out, since the wording itself needs to change (no "your data" framing at all).
ANON_SYSTEM_PROMPT = """You are Chiedza, the AI assistant for ZivaBasa, ChiedzaAI's workforce
intelligence product. You're talking to a visitor who hasn't signed in yet, so you have no
tools and no access to any saved data or prediction models — you can only describe the
product from general knowledge.

Explain what ZivaBasa does when asked: it predicts four things about a workforce — employment
(automation risk), skills (attrition risk), productivity (a standardized score), and
skill_match (redeployment fit for a target role) — as a prototype trained on Kaggle proxy /
synthetic data, not real company data. If someone asks you to actually run a prediction, or
asks about their own org chart, history, or results, tell them plainly you can't do that
signed out, and suggest they sign in for a personalized answer. Politely decline anything
unrelated to ZivaBasa/Chiedza rather than answering as a general-purpose assistant. Keep
answers short and conversational."""


def _supabase_client():
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        return None
    from supabase import create_client  # imported lazily so an unconfigured backend never pays for it
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _lookup_role(user_id: str) -> str:
    """Looks up profiles.role server-side via the service-role client, rather than trusting a
    client-supplied role — a client asserting user_id already has to be trusted (see module
    docstring), but role is what gates the org-wide tools below, so it must come from the
    database, not the request body. Falls back to "viewer" (the least-privileged signed-in
    tier) whenever the lookup can't produce a definite answer — an unconfigured backend, a
    missing profile row, or a query error must never fail open to "admin"."""
    client = _supabase_client()
    if client is None:
        return "viewer"
    try:
        resp = client.table("profiles").select("role").eq("user_id", user_id).maybe_single().execute()
        return (resp.data or {}).get("role") or "viewer"
    except Exception:
        return "viewer"


def _build_tools(user_id: Optional[str], role: str):
    """Tools are built fresh per request, closing over this request's user_id — they're never
    module-level singletons, since the whole point is per-user data scoping."""

    @tool
    def predict_task(task: str, features: dict) -> dict:
        """Run a ZivaBasa prediction for one task given named feature values. task is one of
        employment, skills, productivity, skill_match. features is a name -> numeric value map."""
        return _run_prediction_tool("predict_task", {"task": task, "features": features})

    @tool
    def explain_task(task: str, features: dict) -> dict:
        """Get a SHAP explanation for why a ZivaBasa prediction came out the way it did."""
        return _run_prediction_tool("explain_task", {"task": task, "features": features})

    @tool
    def get_org_chart() -> dict:
        """Read the signed-in user's own org chart (role titles, departments, current/target
        skills, seniority, headcount) as saved in ZivaBasa's My Organization tab."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = client.table("org_nodes").select("*").eq("user_id", user_id).execute()
        return {"org_nodes": resp.data}

    @tool
    def get_predict_history(limit: int = 10) -> dict:
        """Read the signed-in user's most recent ZivaBasa prediction runs, newest first."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = (
            client.table("predict_history")
            .select("results, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"predict_history": resp.data}

    @tool
    def get_batch_results() -> dict:
        """Read the signed-in user's latest batch CSV upload result, one per task."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = client.table("batch_results").select("task, result, saved_at").eq("user_id", user_id).execute()
        return {"batch_results": resp.data}

    @tool
    def get_skill_gap_summary() -> dict:
        """For every role in the signed-in user's own org chart, compute the skill gap between
        current_skills and target_skills — a plain set comparison of their own saved data, no
        prediction model involved."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = (
            client.table("org_nodes")
            .select("title, current_skills, target_skills, seniority_years")
            .eq("user_id", user_id)
            .execute()
        )
        summary = []
        for node in resp.data or []:
            current = set(node.get("current_skills") or [])
            target = set(node.get("target_skills") or [])
            summary.append({
                "title": node.get("title"),
                "seniority_years": node.get("seniority_years"),
                "overlap_count": len(current & target),
                "missing_skill_count": len(target - current),
                "missing_skills": sorted(target - current),
            })
        return {"skill_gaps": summary}

    @tool
    def scan_org_risk() -> dict:
        """Run a skill_match (redeployment-fit) prediction for every role in the signed-in
        user's org chart that has a target_role set AND the four business fields (avg_salary_usd,
        performance_rating, recent_training_hours, recent_ot_hours) filled in on My
        Organization's role editor. Roles missing a target or those fields are listed under
        "skipped" with why, never defaulted to a fabricated value. This only ever runs
        skill_match, never employment/skills/productivity — those need abstract synthetic-dataset
        features (ai_tool_maturity_score, job_demand_index, etc.) no real org tracks per role, so
        there's no honest way to auto-run them from saved org data."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = (
            client.table("org_nodes")
            .select("title, current_skills, target_skills, target_role, seniority_years, "
                    "avg_salary_usd, performance_rating, recent_training_hours, recent_ot_hours")
            .eq("user_id", user_id)
            .execute()
        )
        scanned, skipped = [], []
        for node in resp.data or []:
            title = node.get("title")
            if not node.get("target_role"):
                skipped.append({"title": title, "reason": "no target_role set"})
                continue
            required = {
                "seniority_years": node.get("seniority_years"),
                "recent_training_hours": node.get("recent_training_hours"),
                "performance_rating": node.get("performance_rating"),
                "avg_salary_usd": node.get("avg_salary_usd"),
                "recent_ot_hours": node.get("recent_ot_hours"),
            }
            missing = [k for k, v in required.items() if v is None]
            if missing:
                skipped.append({"title": title, "reason": f"missing fields: {missing}"})
                continue
            current = set(node.get("current_skills") or [])
            target = set(node.get("target_skills") or [])
            overlap_count = len(current & target)
            features = {
                **required,
                "skill_overlap_count": overlap_count,
                "missing_skill_count": len(target - current),
                "overlap_x_training": overlap_count * required["recent_training_hours"],
            }
            result = _run_prediction_tool("predict_task", {"task": "skill_match", "features": features})
            scanned.append({"title": title, "target_role": node.get("target_role"), **result})

        return {"scanned": scanned, "skipped": skipped}

    @tool
    def remember_note(note: str) -> dict:
        """Save a durable fact or preference about the signed-in user or their org, so it's
        available in a later conversation/session, not just this one — e.g. "manages the Sales
        dept", "prefers short answers". Not for one-off prediction inputs."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        client.table("agent_memories").insert({"user_id": user_id, "note": note}).execute()
        return {"status": "saved"}

    @tool
    def recall_notes(limit: int = 20) -> dict:
        """Read the signed-in user's most recently saved notes (see remember_note), newest first."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = (
            client.table("agent_memories")
            .select("note, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"notes": resp.data}

    tools = [
        predict_task, explain_task, get_org_chart, get_predict_history, get_batch_results,
        get_skill_gap_summary, scan_org_risk, remember_note, recall_notes,
    ]
    if role != "admin":
        return tools

    # Admin-only, deliberately NOT filtered by user_id — the module docstring's "always filter
    # by user_id" rule is intentionally relaxed here, gated on the server-verified role from
    # _lookup_role(), not on anything the client sent.
    @tool
    def get_org_wide_chart() -> dict:
        """Admin only: read EVERY user's org chart on the platform (role titles, departments,
        current/target skills, seniority, headcount), not just the signed-in admin's own."""
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = client.table("org_nodes").select("*").execute()
        return {"org_nodes": resp.data}

    @tool
    def get_org_wide_predict_history(limit: int = 50) -> dict:
        """Admin only: read the most recent ZivaBasa prediction runs across ALL users on the
        platform, newest first, not just the signed-in admin's own."""
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = (
            client.table("predict_history")
            .select("user_id, results, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"predict_history": resp.data}

    @tool
    def get_org_wide_batch_results() -> dict:
        """Admin only: read the latest batch CSV upload result, one per task, across ALL users
        on the platform, not just the signed-in admin's own."""
        client = _supabase_client()
        if client is None:
            return {"error": "Supabase isn't configured on this backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."}
        resp = client.table("batch_results").select("user_id, task, result, saved_at").execute()
        return {"batch_results": resp.data}

    return tools + [get_org_wide_chart, get_org_wide_predict_history, get_org_wide_batch_results]


class _AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    tool_turns: int


def _build_graph(model, tools: list):
    """Explicit two-node agent<->tools StateGraph, replacing the create_react_agent prebuilt —
    see the module docstring's "GRAPH, NOT THE PREBUILT" note for why. Built fresh per request,
    same as _build_tools(), since it closes over this request's bound-tools model."""
    model_with_tools = model.bind_tools(tools) if tools else model

    async def call_model(state: _AgentState) -> dict:
        # Streamed (not .invoke()) so stream_agent()'s astream_events() actually gets
        # "on_chat_model_stream" token events — a plain .invoke() call makes one blocking
        # request and would only ever produce a single on_chat_model_end event, no per-token
        # frames, regardless of how the graph itself is driven.
        full = None
        async for chunk in model_with_tools.astream(state["messages"]):
            full = chunk if full is None else full + chunk
        return {"messages": [full], "tool_turns": state.get("tool_turns", 0) + 1}

    def give_up(state: _AgentState) -> dict:
        return {"messages": [AIMessage(content=_GIVE_UP_MESSAGE)]}

    def route(state: _AgentState) -> str:
        last = state["messages"][-1]
        if not getattr(last, "tool_calls", None):
            return END
        if state.get("tool_turns", 0) >= _MAX_TOOL_TURNS:
            return "give_up"
        return "tools" if tools else "give_up"  # no tools bound but model hallucinated a call

    graph = StateGraph(_AgentState)
    graph.add_node("agent", call_model)
    graph.add_node("give_up", give_up)
    graph.set_entry_point("agent")
    routes = {END: END, "give_up": "give_up"}
    if tools:
        graph.add_node("tools", ToolNode(tools))
        graph.add_edge("tools", "agent")
        routes["tools"] = "tools"
    graph.add_conditional_edges("agent", route, routes)
    graph.add_edge("give_up", END)
    return graph.compile()


def _prepare_run(user_id: Optional[str]) -> tuple[list, str]:
    """Shared by run_agent() and stream_agent(): resolves role server-side, builds this
    request's tools, and picks the right system prompt. Raises RuntimeError for the same two
    "not configured" cases both callers need to surface identically."""
    if not _LANGGRAPH_AVAILABLE:
        raise RuntimeError(
            "Chiedza's agent mode isn't installed on this backend. Install langgraph, "
            "langchain-core and langchain-anthropic (see requirements.txt) to enable it."
        )
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY isn't set — Chiedza's agent mode reuses the same key as regular chat."
        )

    # None = anonymous (no user_id at all). Otherwise the role is looked up server-side —
    # never trusted from the request — and defaults to "viewer" if it can't be determined.
    role = _lookup_role(user_id) if user_id else None
    if role is None:
        return [], ANON_SYSTEM_PROMPT
    tools = _build_tools(user_id, role)
    prompt = AGENT_SYSTEM_PROMPT + (ADMIN_ADDENDUM if role == "admin" else "")
    return tools, prompt


def _to_lc_messages(messages: list[dict], prompt: str) -> list:
    return [SystemMessage(content=prompt)] + [
        HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"])
        for m in messages
    ]


async def run_agent(messages: list[dict], user_id: Optional[str] = None) -> dict:
    tools, prompt = _prepare_run(user_id)  # raises RuntimeError -> main.py turns into a 503

    model = ChatAnthropic(model=AGENT_MODEL, api_key=os.environ["ANTHROPIC_API_KEY"], max_tokens=1024)
    agent = _build_graph(model, tools)
    result = await agent.ainvoke({"messages": _to_lc_messages(messages, prompt), "tool_turns": 0})

    tool_log = [
        {"name": tc["name"], "args": tc["args"]}
        for m in result["messages"]
        if isinstance(m, AIMessage) and m.tool_calls
        for tc in m.tool_calls
    ]
    final = result["messages"][-1]
    return {
        "reply": final.content,
        "provider": "anthropic-langgraph",
        "usage": None,
        "tool_calls": tool_log,
        "generated_images": [],
    }


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _chunk_text(content) -> str:
    """AIMessageChunk.content is a plain str for simple text streaming, but Anthropic's own
    content-block format can hand back a list of {"type": ..., "text": ...} blocks instead —
    handle both rather than assuming the simpler shape."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


async def stream_agent(messages: list[dict], user_id: Optional[str] = None):
    """Server-Sent-Events variant of run_agent(): same auth/role/tool setup, but yields frames
    as the model actually produces them instead of waiting for the whole run to finish. Each
    yielded string is one complete "data: {...}\\n\\n" SSE frame; POST /chat/agent/stream
    (main.py) streams these straight through as text/event-stream.

    Frame shapes: {"type":"token","text":...} (an incremental text delta), {"type":"tool_start",
    "name":...,"args":...}, {"type":"tool_end","name":...,"result":...}, {"type":"done",
    "provider":...,"tool_calls":[...],"generated_images":[...]} (always the last frame on
    success), {"type":"error","message":...} (in place of "done" — since the HTTP response has
    already started as 200 by the time an error can happen here, this is the only way an error
    reaches the frontend; it must be handled as a distinct SSE event, not an HTTP status code).

    VERSION CAVEAT: written against LangGraph 0.2.60's documented `astream_events(version="v2")`
    contract (see module docstring), not exercised against a live Anthropic call.
    """
    try:
        tools, prompt = _prepare_run(user_id)
    except RuntimeError as e:
        yield _sse({"type": "error", "message": str(e)})
        return

    model = ChatAnthropic(model=AGENT_MODEL, api_key=os.environ["ANTHROPIC_API_KEY"], max_tokens=1024)
    graph = _build_graph(model, tools)
    lc_messages = _to_lc_messages(messages, prompt)

    tool_log = []
    try:
        async for event in graph.astream_events({"messages": lc_messages, "tool_turns": 0}, version="v2"):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                text = _chunk_text(event["data"]["chunk"].content)
                if text:
                    yield _sse({"type": "token", "text": text})
            elif kind == "on_tool_start":
                yield _sse({"type": "tool_start", "name": event["name"], "args": event["data"].get("input")})
            elif kind == "on_tool_end":
                args = event["data"].get("input") or {}
                output = event["data"].get("output")
                result = getattr(output, "content", output)
                tool_log.append({"name": event["name"], "args": args})
                yield _sse({"type": "tool_end", "name": event["name"], "result": result})
    except Exception as e:
        yield _sse({"type": "error", "message": f"Chiedza agent call failed: {e}"})
        return

    yield _sse({
        "type": "done",
        "provider": "anthropic-langgraph",
        "tool_calls": tool_log,
        "generated_images": [],
    })
