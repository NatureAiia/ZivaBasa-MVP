"""
agent_graph.py — a LangGraph-powered "Chiedza" agent, added as a parallel capability
alongside api/chat.py's hand-rolled multi-provider chat loop, NOT a replacement for it.
POST /chat keeps working exactly as it did; this backs the new POST /chat/agent.

What this adds that plain chat.py's tool loop doesn't: chat.py's `predict_task`/`explain_task`
tools only ever compute fresh outputs from features the person types in. Chiedza's whole point
per the product brief is to "take info from the app and give users [answers]" — so this module
adds three more tools that read the signed-in user's OWN previously-saved data (org chart,
prediction history, batch results) out of the app's own Postgres database (api/db/), and reuses
chat.py's existing prediction tools rather than duplicating that logic.

OPTIONAL, OFF BY DEFAULT — same convention as every other optional feature in this project
(see auth.py's and chat.py's own module docstrings): if `langgraph`/`langchain-anthropic`
aren't installed, or ANTHROPIC_API_KEY isn't set, `run_agent()` raises a plain RuntimeError
with a clear message (caught by main.py and turned into a 503) rather than the import itself
breaking API startup for everyone else.

VERSION CAVEAT, same honesty note as chat.py's provider functions: this was written strictly
against LangGraph's documented `create_react_agent` prebuilt contract, not exercised against a
live Anthropic call or a real Supabase project from the sandbox this was authored in. Test it
against your own keys before relying on it — in particular, `create_react_agent`'s exact
keyword for the system prompt has changed across LangGraph versions (`prompt` in newer
releases, `state_modifier`/`messages_modifier` in older ones); pin a version and confirm which
one it expects.

DATABASE ACCESS: queries run directly against this same process's DB session (api/db/session.py)
rather than over HTTP, since there's no PostgREST-style service any more — just this backend and
Postgres. There is no Row-Level-Security safety net any more either, so every query below
manually filters by user_id itself (except the explicitly admin-only, org-wide tools) — this
must never be relaxed to a "fetch everything" query for a non-admin caller.
"""
from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import select

from api.chat import _run_prediction_tool
from api.db.models import BatchResult, OrgNode, PredictHistory, Profile
from api.db.session import get_sessionmaker

try:
    from langchain_core.messages import AIMessage, HumanMessage
    from langchain_core.tools import tool
    from langchain_anthropic import ChatAnthropic
    from langgraph.prebuilt import create_react_agent
    _LANGGRAPH_AVAILABLE = True
except ImportError:
    _LANGGRAPH_AVAILABLE = False

AGENT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

AGENT_SYSTEM_PROMPT = """You are Chiedza, ZivaBasa's AI assistant embedded in ChiedzaAI.

Unlike ZivaBasa's regular chat, you have tools that read the signed-in user's own previously
saved app data — their org chart, prediction history, and batch upload results — in addition
to the predict_task/explain_task tools that run a fresh prediction. Prefer grounding an answer
in the user's own data when a get_* tool is relevant to the question, instead of only running
a fresh prediction from scratch. If a get_* tool comes back empty or with an error (e.g. no
org chart saved yet, or no user is signed in), say so plainly and offer to run a fresh
prediction instead.

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


async def _lookup_role(user_id: str) -> str:
    """Looks up profiles.role server-side, rather than trusting a client-supplied role — a
    client asserting user_id already has to be trusted (see module docstring), but role is what
    gates the org-wide tools below, so it must come from the database, not the request body.
    Falls back to "viewer" (the least-privileged signed-in tier) whenever the lookup can't
    produce a definite answer — a missing profile row or a query error must never fail open to
    "admin"."""
    try:
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(select(Profile.role).where(Profile.user_id == user_id))
            return result.scalar_one_or_none() or "viewer"
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
    async def get_org_chart() -> dict:
        """Read the signed-in user's own org chart (role titles, departments, current/target
        skills, seniority, headcount) as saved in ZivaBasa's My Organization tab."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(select(OrgNode).where(OrgNode.user_id == user_id))
            nodes = result.scalars().all()
            return {"org_nodes": [
                {
                    "id": n.id, "title": n.title, "department": n.department,
                    "parent_id": n.parent_id, "current_skills": n.current_skills,
                    "target_role": n.target_role, "target_skills": n.target_skills,
                    "seniority_years": n.seniority_years, "headcount": n.headcount,
                }
                for n in nodes
            ]}

    @tool
    async def get_predict_history(limit: int = 10) -> dict:
        """Read the signed-in user's most recent ZivaBasa prediction runs, newest first."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(
                select(PredictHistory)
                .where(PredictHistory.user_id == user_id)
                .order_by(PredictHistory.created_at.desc())
                .limit(limit)
            )
            rows = result.scalars().all()
            return {"predict_history": [{"results": r.results, "created_at": str(r.created_at)} for r in rows]}

    @tool
    async def get_batch_results() -> dict:
        """Read the signed-in user's latest batch CSV upload result, one per task."""
        if not user_id:
            return {"error": "No signed-in user — this request wasn't made with a user_id."}
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(select(BatchResult).where(BatchResult.user_id == user_id))
            rows = result.scalars().all()
            return {"batch_results": [{"task": r.task, "result": r.result, "saved_at": str(r.saved_at)} for r in rows]}

    tools = [predict_task, explain_task, get_org_chart, get_predict_history, get_batch_results]
    if role != "admin":
        return tools

    # Admin-only, deliberately NOT filtered by user_id — the module docstring's "always filter
    # by user_id" rule is intentionally relaxed here, gated on the server-verified role from
    # _lookup_role(), not on anything the client sent.
    @tool
    async def get_org_wide_chart() -> dict:
        """Admin only: read EVERY user's org chart on the platform (role titles, departments,
        current/target skills, seniority, headcount), not just the signed-in admin's own."""
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(select(OrgNode))
            nodes = result.scalars().all()
            return {"org_nodes": [
                {"user_id": n.user_id, "title": n.title, "department": n.department, "headcount": n.headcount}
                for n in nodes
            ]}

    @tool
    async def get_org_wide_predict_history(limit: int = 50) -> dict:
        """Admin only: read the most recent ZivaBasa prediction runs across ALL users on the
        platform, newest first, not just the signed-in admin's own."""
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(
                select(PredictHistory).order_by(PredictHistory.created_at.desc()).limit(limit)
            )
            rows = result.scalars().all()
            return {"predict_history": [
                {"user_id": r.user_id, "results": r.results, "created_at": str(r.created_at)} for r in rows
            ]}

    @tool
    async def get_org_wide_batch_results() -> dict:
        """Admin only: read the latest batch CSV upload result, one per task, across ALL users
        on the platform, not just the signed-in admin's own."""
        session_factory = get_sessionmaker()
        async with session_factory() as db:
            result = await db.execute(select(BatchResult))
            rows = result.scalars().all()
            return {"batch_results": [
                {"user_id": r.user_id, "task": r.task, "result": r.result, "saved_at": str(r.saved_at)}
                for r in rows
            ]}

    return tools + [get_org_wide_chart, get_org_wide_predict_history, get_org_wide_batch_results]


async def run_agent(messages: list[dict], user_id: Optional[str] = None) -> dict:
    if not _LANGGRAPH_AVAILABLE:
        raise RuntimeError(
            "Chiedza's agent mode isn't installed on this backend. Install langgraph, "
            "langchain-core and langchain-anthropic (see requirements.txt) to enable it."
        )
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY isn't set — Chiedza's agent mode reuses the same key as regular chat."
        )

    # None = anonymous (no user_id at all). Otherwise the role is looked up server-side —
    # never trusted from the request — and defaults to "viewer" if it can't be determined.
    role = await _lookup_role(user_id) if user_id else None
    if role is None:
        tools, prompt = [], ANON_SYSTEM_PROMPT
    else:
        tools = _build_tools(user_id, role)
        prompt = AGENT_SYSTEM_PROMPT + (ADMIN_ADDENDUM if role == "admin" else "")

    model = ChatAnthropic(model=AGENT_MODEL, api_key=api_key, max_tokens=1024)
    agent = create_react_agent(model, tools, prompt=prompt)

    lc_messages = [
        HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"])
        for m in messages
    ]
    result = await agent.ainvoke({"messages": lc_messages})

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
