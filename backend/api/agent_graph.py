"""
agent_graph.py — a LangGraph-powered "Chiedza" agent, added as a parallel capability
alongside api/chat.py's hand-rolled multi-provider chat loop, NOT a replacement for it.
POST /chat keeps working exactly as it did; this backs the new POST /chat/agent.

What this adds that plain chat.py's tool loop doesn't: chat.py's `predict_task`/`explain_task`
tools only ever compute fresh outputs from features the person types in. Chiedza's whole point
per the product brief is to "take info from the app and give users [answers]" — so this module
adds three more tools that read the signed-in user's OWN previously-saved data (org chart,
prediction history, batch results) out of Supabase, and reuses chat.py's existing prediction
tools rather than duplicating that logic.

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

SUPABASE ACCESS: reads use the SERVICE ROLE key (server-side env var only, never shipped to
the frontend, distinct from the anon key `supabaseClient.js` uses). The service role key
bypasses Row Level Security, so every query below manually filters `.eq("user_id", user_id)`
itself — this must never be relaxed to a "fetch everything" query, since RLS isn't there to
catch that mistake for a service-role connection the way it is for the frontend's anon-key one.
"""
from __future__ import annotations

import os
from typing import Optional

from api.chat import _run_prediction_tool

try:
    from langchain_core.messages import AIMessage, HumanMessage
    from langchain_core.tools import tool
    from langchain_anthropic import ChatAnthropic
    from langgraph.prebuilt import create_react_agent
    _LANGGRAPH_AVAILABLE = True
except ImportError:
    _LANGGRAPH_AVAILABLE = False

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
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


def _supabase_client():
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        return None
    from supabase import create_client  # imported lazily so an unconfigured backend never pays for it
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _build_tools(user_id: Optional[str]):
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

    return [predict_task, explain_task, get_org_chart, get_predict_history, get_batch_results]


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

    model = ChatAnthropic(model=AGENT_MODEL, api_key=api_key, max_tokens=1024)
    agent = create_react_agent(model, _build_tools(user_id), prompt=AGENT_SYSTEM_PROMPT)

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
