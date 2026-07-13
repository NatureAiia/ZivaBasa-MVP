"""
chat.py — LLM chat wired to the ZivaBasa predict/explain tools, with two pluggable providers.

HONESTY NOTE, read before assuming either provider is "free":
  - Anthropic's Claude API is metered/paid per token — there is no standing free tier as of
    this writing. If ANTHROPIC_API_KEY is unset or out of credits, calls fail with a clear
    error (surfaced to the frontend, not swallowed).
  - NVIDIA NIM (build.nvidia.com) has historically offered free preview API credits with rate
    limits for hosted models including the Nemotron family, but terms/limits change and this
    was not verified live against NVIDIA's current catalog while writing this (that domain
    isn't reachable from the sandbox this was built in). Verify your model slug and current
    quota at https://build.nvidia.com before relying on this in front of anyone.

Provider selection: whichever of ANTHROPIC_API_KEY / NVIDIA_API_KEY is set. If both are set,
CHAT_PROVIDER=anthropic|nvidia picks explicitly. If neither is set, /chat returns a 503 with a
clear "no provider configured" message rather than pretending to work.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx

from api.model_registry import registry
from src import evaluate

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")
CHAT_PROVIDER = os.environ.get("CHAT_PROVIDER")  # explicit override if both keys are set

SYSTEM_PROMPT = """You are the ZivaBasa workforce intelligence assistant, embedded in ChiedzaAI.
You have two tools: predict_task and explain_task, covering three tasks:
  - employment: automation-risk classification. Features: avg_salary_usd, ai_tool_maturity_score,
    task_repetition_level, skill_complexity_score, training_hours_needed, job_demand_index,
    percent_tasks_automatable.
  - skills: attrition-risk classification. Features: Age, TrainingTimesLastYear, YearsAtCompany,
    MonthlyIncome, JobSatisfaction, PerformanceRating, training_intensity_index (=
    TrainingTimesLastYear/YearsAtCompany if not given), training_x_satisfaction (=
    training_intensity_index * JobSatisfaction if not given).
  - productivity: standardized regression score. Features: skill_gap_index.

Rules:
- Always explain results in plain business language, not raw z-scores or jargon, unless asked
  for technical detail.
- This is a prototype trained on Kaggle proxy data, not real company data. Say so when giving
  a prediction, briefly, without being repetitive about it every single message.
- If a probability is below 0.1% or above 99.9%, flag it as possibly overconfident (uncalibrated
  model on limited training data), not as certainty.
- If you don't have enough information to fill a tool's required features, ask the person for
  the missing values rather than guessing plausible-sounding numbers.
"""

TOOLS_ANTHROPIC = [
    {
        "name": "predict_task",
        "description": "Run a ZivaBasa prediction for one task given named feature values.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "enum": ["employment", "skills", "productivity"]},
                "features": {
                    "type": "object",
                    "description": "Feature name -> numeric value. Use GET /schema/{task} names.",
                },
            },
            "required": ["task", "features"],
        },
    },
    {
        "name": "explain_task",
        "description": "Get a SHAP explanation for why a ZivaBasa prediction came out the way it did.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "enum": ["employment", "skills", "productivity"]},
                "features": {"type": "object", "description": "Feature name -> numeric value."},
            },
            "required": ["task", "features"],
        },
    },
]

# Same two tools, OpenAI-style function-calling shape (NVIDIA NIM's chat/completions endpoint
# is OpenAI-compatible).
TOOLS_OPENAI = [
    {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
    for t in TOOLS_ANTHROPIC
]


def _run_tool(name: str, args: dict) -> dict:
    """Executes predict_task / explain_task directly against the in-process model registry —
    no HTTP round-trip to our own API needed, we're already in the same process."""
    task = args.get("task")
    features_by_name = args.get("features", {})
    artifacts = registry.get(task)
    if artifacts is None:
        return {"error": f"Task '{task}' not loaded. Available: {registry.task_names()}"}

    missing = [f for f in artifacts.feature_names if f not in features_by_name]
    if missing:
        return {"error": f"Missing required features for '{task}': {missing}. "
                          f"Required (any order): {artifacts.feature_names}"}

    ordered = [float(features_by_name[f]) for f in artifacts.feature_names]

    if name == "predict_task":
        X = artifacts.transform(ordered)
        raw = float(artifacts.keras_model(X, training=False).numpy().squeeze())
        result = {"task": task, "task_type": artifacts.task_type, "raw_output": raw}
        if artifacts.task_type == "classification":
            result["probability"] = raw
            result["label"] = int(raw > 0.5)
        return result

    if name == "explain_task":
        X = artifacts.transform(ordered)
        try:
            shap_values, explainer_name = evaluate.compute_shap_values(
                artifacts.keras_model, artifacts.shap_background, X
            )
        except Exception as e:
            return {"error": f"SHAP explanation failed: {e}"}
        import numpy as np
        shap_values = np.atleast_1d(np.squeeze(shap_values))
        contributions = sorted(
            [{"feature": f, "value": v, "shap_value": float(sv)}
             for f, v, sv in zip(artifacts.feature_names, ordered, shap_values)],
            key=lambda c: abs(c["shap_value"]), reverse=True,
        )
        return {"task": task, "top_contributions": contributions[:8], "explainer_used": explainer_name}

    return {"error": f"Unknown tool '{name}'"}


def active_provider() -> Optional[str]:
    if CHAT_PROVIDER in ("anthropic", "nvidia"):
        return CHAT_PROVIDER
    if ANTHROPIC_API_KEY:
        return "anthropic"
    if NVIDIA_API_KEY:
        return "nvidia"
    return None


async def chat_anthropic(messages: list[dict]) -> str:
    api_messages = list(messages)
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(4):  # bounded tool-use loop
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": ANTHROPIC_MODEL,
                    "max_tokens": 1024,
                    "system": SYSTEM_PROMPT,
                    "messages": api_messages,
                    "tools": TOOLS_ANTHROPIC,
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Anthropic API error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            content = data.get("content", [])
            tool_uses = [b for b in content if b.get("type") == "tool_use"]

            if not tool_uses:
                return "".join(b.get("text", "") for b in content if b.get("type") == "text")

            api_messages.append({"role": "assistant", "content": content})
            tool_results = []
            for tu in tool_uses:
                result = _run_tool(tu["name"], tu.get("input", {}))
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": json.dumps(result),
                })
            api_messages.append({"role": "user", "content": tool_results})
        return "I made several tool calls but couldn't reach a final answer in time — try a more specific question."


async def chat_nvidia(messages: list[dict]) -> str:
    """OpenAI-compatible tool-calling loop against NVIDIA NIM. UNVERIFIED against a live key —
    integrate.api.nvidia.com isn't reachable from the sandbox this was written in. Written to
    the documented OpenAI-compatible contract; test against your own NVIDIA_API_KEY."""
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + list(messages)
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(4):
            resp = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": NVIDIA_MODEL,
                    "messages": api_messages,
                    "tools": TOOLS_OPENAI,
                    "max_tokens": 1024,
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"NVIDIA NIM API error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            choice = data["choices"][0]["message"]
            tool_calls = choice.get("tool_calls") or []

            if not tool_calls:
                return choice.get("content", "")

            api_messages.append(choice)
            for tc in tool_calls:
                args = json.loads(tc["function"]["arguments"])
                result = _run_tool(tc["function"]["name"], args)
                api_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })
        return "I made several tool calls but couldn't reach a final answer in time — try a more specific question."


async def send_chat(messages: list[dict]) -> dict:
    provider = active_provider()
    if provider is None:
        raise RuntimeError(
            "No chat provider configured. Set ANTHROPIC_API_KEY or NVIDIA_API_KEY as an "
            "environment variable before starting the API."
        )
    reply = await (chat_anthropic(messages) if provider == "anthropic" else chat_nvidia(messages))
    return {"reply": reply, "provider": provider}
