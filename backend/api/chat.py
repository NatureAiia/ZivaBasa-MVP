"""
chat.py — LLM chat wired to the ZivaBasa predict/explain tools, with four pluggable
providers: Anthropic, NVIDIA NIM, Google Gemini, Groq.

HONESTY NOTE, read before assuming any of these are "free":
  - Anthropic's Claude API is metered/paid per token — no standing free tier.
  - NVIDIA NIM (build.nvidia.com) has historically offered free preview API credits with rate
    limits, terms/limits change; verify at https://build.nvidia.com.
  - Google Gemini has a genuine free tier via AI Studio (generativelanguage.googleapis.com)
    with daily rate limits that vary by model; verify current limits at
    https://ai.google.dev/pricing.
  - Groq offers a free developer tier with rate limits on open models (Llama, etc.) hosted on
    their custom inference hardware; verify at https://console.groq.com.
  None of these four were reachable from the sandbox this was written in (network allowlist
  doesn't include their API hosts) — every provider function below is written strictly to each
  vendor's documented API contract, not verified against a live call. Test each one against
  your own key before relying on it in front of anyone, same caveat as before, now across four
  providers instead of two.

Model picker: GET /chat/models returns the catalog below with key_present per provider so the
frontend can show what's actually usable vs. what still needs a key, without hardcoding that
logic on the frontend. POST /chat accepts an optional `provider` field to pick explicitly;
omitting it falls back to auto-detect (first configured key, in MODEL_CATALOG order).
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx
from anthropic import AsyncAnthropic

from api import image_router as image_router_module
from api.model_registry import registry
from src import evaluate

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
CHAT_PROVIDER = os.environ.get("CHAT_PROVIDER")  # explicit override if multiple keys are set

SYSTEM_PROMPT = """You are the ZivaBasa workforce intelligence assistant, embedded in ChiedzaAI.
You have two tools: predict_task and explain_task, covering four tasks:
  - employment: automation-risk classification. Features: avg_salary_usd, ai_tool_maturity_score,
    task_repetition_level, skill_complexity_score, training_hours_needed, job_demand_index,
    percent_tasks_automatable.
  - skills: attrition-risk classification. Features: Age, TrainingTimesLastYear, YearsAtCompany,
    MonthlyIncome, JobSatisfaction, PerformanceRating, training_intensity_index (=
    TrainingTimesLastYear/YearsAtCompany if not given), training_x_satisfaction (=
    training_intensity_index * JobSatisfaction if not given).
  - productivity: standardized regression score. Features: skill_gap_index.
  - skill_match: job/skill redeployment-fit classification. Features: seniority_years,
    recent_training_hours, performance_rating, avg_salary_usd, recent_ot_hours,
    skill_overlap_count, missing_skill_count, overlap_x_training (=
    skill_overlap_count * recent_training_hours if not given).

HOW TO HANDLE A QUESTION THAT NEEDS A PREDICTION:
1. If you have enough of the listed features (even rough estimates the person gives you in
   plain language — "high repetition," "$45k," "3 years tenure" — you can map those to numbers
   yourself), call the tool and answer from its real output.
2. If you're missing values you need, ask for exactly those values, by name, in one short
   question — not a general-knowledge essay about "what typically drives this." Example: "What's
   the role's approximate salary, and how would you rate task repetition — low, medium, or
   high?" Then stop and wait for the answer. Do not pad the question with paragraphs of
   background theory first.
3. Never substitute a lecture on general risk factors for actually attempting the prediction —
   if you can reasonably estimate the missing values from what's already been said, do that and
   run the tool rather than declining and explaining the theory instead.

HOW TO WRITE:
- Format like a normal Claude conversation: real markdown (## headers, **bold**, bullet/numbered
  lists, code blocks) when it genuinely makes a longer or structured answer easier to scan, plain
  flowing prose for quick conversational answers. Use your judgment the way you normally would —
  don't force headers onto a two-sentence answer, and don't force prose onto something that's
  naturally a list or step-by-step explanation.
- Keep answers as short as the question allows. A yes/no-shaped question gets a short answer,
  not a full structured writeup.
- If something is genuinely ambiguous or you're missing information, ask one specific
  clarifying question and stop — don't guess silently, and don't answer a different, easier
  question instead of asking.

OTHER RULES:
- Always explain results in plain business language, not raw z-scores or jargon, unless asked
  for technical detail.
- This is a prototype trained on Kaggle proxy / synthetic data, not real company data. Say so
  when giving a prediction, briefly, without being repetitive about it every single message.
- If a probability is below 0.1% or above 99.9%, flag it as possibly overconfident (uncalibrated
  model on limited training data), not as certainty.
"""

TOOLS_ANTHROPIC = [
    {
        "name": "predict_task",
        "description": "Run a ZivaBasa prediction for one task given named feature values.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "enum": ["employment", "skills", "productivity", "skill_match"]},
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
                "task": {"type": "string", "enum": ["employment", "skills", "productivity", "skill_match"]},
                "features": {"type": "object", "description": "Feature name -> numeric value."},
            },
            "required": ["task", "features"],
        },
    },
    {
        "name": "generate_image",
        "description": "Generate an image from a text description (e.g. an org-chart illustration, a "
                        "diagram, a role icon). Automatically routed to whichever configured provider "
                        "(Google Gemini or Azure OpenAI) best fits the request — you don't choose the "
                        "provider, just call this. Only available if at least one of GEMINI_API_KEY or "
                        "AZURE_OPENAI_API_KEY is configured on the backend. The image is shown to the "
                        "person directly — you don't need to describe it back to them, just confirm briefly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "A clear, detailed description of the image to generate."},
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "edit_image",
        "description": "Edit the image the person just attached or is currently referring to (e.g. "
                        "\"make the boxes blue\", \"add a CFO role under the CEO\", \"remove the "
                        "background\"). Only call this when the person has actually attached/shared an "
                        "image in this turn — if there's no attached image, tell them to attach or "
                        "generate one first instead of calling this tool. Routed to Azure OpenAI "
                        "(the only provider wired up here that can edit an existing image), only "
                        "available if AZURE_OPENAI_API_KEY is configured on the backend.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "A clear description of the edit to make to the attached image."},
            },
            "required": ["prompt"],
        },
    },
]

# Same two tools, OpenAI-style function-calling shape (NVIDIA NIM's and Groq's chat/completions
# endpoints are both OpenAI-compatible).
TOOLS_OPENAI = [
    {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
    for t in TOOLS_ANTHROPIC
]

# Gemini's function-calling shape: functionDeclarations with "parameters" instead of
# "input_schema", no "type": "function" wrapper.
TOOLS_GEMINI = [
    {"functionDeclarations": [
        {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}
        for t in TOOLS_ANTHROPIC
    ]}
]


def _run_prediction_tool(name: str, args: dict) -> dict:
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


async def _run_tool(name: str, args: dict, generated_images: list,
                     attachment: Optional[dict] = None) -> dict:
    """Dispatches to the sync prediction tools or the async image tools. Image bytes are
    appended to `generated_images` (returned to the frontend directly) rather than put in the
    result handed back to the model — a base64 PNG in the model's own context would bloat every
    subsequent turn of the conversation for no benefit, since the model never needs to see the
    pixels, only that generation/editing succeeded.

    `attachment`, when present, is the image (image_base64 + mime_type) the frontend says the
    person is currently referring to — either just uploaded or a previously generated image they
    clicked "Edit" on. It's the only image edit_image has access to; there's no server-side
    conversation image store."""
    if name == "generate_image":
        prompt = args.get("prompt", "")
        try:
            image = await image_router_module.generate_image(prompt)
        except RuntimeError as e:
            return {"error": str(e)}
        image_id = f"img_{len(generated_images) + 1}"
        generated_images.append({
            "id": image_id,
            "mime_type": image["mime_type"],
            "image_base64": image["image_base64"],
            # Which provider actually ran (image_router.py picks gemini vs azure per-request) —
            # the frontend needs this to attribute image-generation cost correctly even when
            # chatting via a different provider (Anthropic/NVIDIA/Groq).
            "provider": image["provider"],
            "model": "azure-openai" if image["provider"] == "azure" else "gemini-image",
        })
        return {"status": "success", "image_id": image_id, "message": "Image generated and shown to the user."}

    if name == "edit_image":
        if not attachment or not attachment.get("image_base64"):
            return {"error": "No image is attached to this conversation turn — ask the person to "
                              "attach or generate an image first."}
        prompt = args.get("prompt", "")
        try:
            image = await image_router_module.edit_image(
                prompt, attachment["image_base64"], attachment.get("mime_type", "image/png"),
            )
        except RuntimeError as e:
            return {"error": str(e)}
        image_id = f"img_{len(generated_images) + 1}"
        generated_images.append({
            "id": image_id,
            "mime_type": image["mime_type"],
            "image_base64": image["image_base64"],
            "provider": image["provider"],
            "model": "azure-openai",
        })
        return {"status": "success", "image_id": image_id, "message": "Image edited and shown to the user."}

    return _run_prediction_tool(name, args)


# Single source of truth for what shows up in the frontend's model picker. Order here is also
# the auto-detect fallback order. "description" is deliberately one plain sentence — this is
# what a non-technical person reads in a dropdown, not documentation.
MODEL_CATALOG = [
    {
        "provider": "anthropic",
        "model": ANTHROPIC_MODEL,
        "label": "Claude (Anthropic)",
        "description": "Best all-around choice — strong reasoning and reliably uses the prediction tools correctly.",
        "supports_tools": True,
        "key_env": "ANTHROPIC_API_KEY",
    },
    {
        "provider": "nvidia",
        "model": NVIDIA_MODEL,
        "label": "Nemotron (NVIDIA NIM)",
        "description": "Free-tier NVIDIA-hosted model, good at technical/analytical questions.",
        "supports_tools": True,
        "key_env": "NVIDIA_API_KEY",
    },
    {
        "provider": "groq",
        "model": GROQ_MODEL,
        "label": "Llama 3.3 70B (Groq)",
        "description": "Free-tier, the fastest of the four — best when you want quick back-and-forth answers.",
        "supports_tools": True,
        "key_env": "GROQ_API_KEY",
    },
    {
        "provider": "gemini",
        "model": GEMINI_MODEL,
        "label": "Gemini Flash (Google)",
        "description": "Free-tier from Google — best if you're pasting in or discussing long documents (Word/PDF text), it handles long context well.",
        "supports_tools": True,
        "key_env": "GEMINI_API_KEY",
    },
]

_KEY_LOOKUP = {
    "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
    "NVIDIA_API_KEY": NVIDIA_API_KEY,
    "GROQ_API_KEY": GROQ_API_KEY,
    "GEMINI_API_KEY": GEMINI_API_KEY,
}


def list_models() -> list[dict]:
    return [
        {**{k: v for k, v in m.items() if k != "key_env"}, "key_present": bool(_KEY_LOOKUP.get(m["key_env"]))}
        for m in MODEL_CATALOG
    ]


def active_provider(requested: Optional[str] = None) -> Optional[str]:
    configured = {m["provider"] for m in MODEL_CATALOG if _KEY_LOOKUP.get(m["key_env"])}
    if requested:
        return requested if requested in configured else None
    if CHAT_PROVIDER in configured:
        return CHAT_PROVIDER
    for m in MODEL_CATALOG:
        if m["provider"] in configured:
            return m["provider"]
    return None


async def chat_anthropic(messages: list[dict], attachment: Optional[dict] = None) -> tuple[str, dict, list, list]:
    api_messages = list(messages)
    usage = {"input_tokens": 0, "output_tokens": 0}
    tool_log = []
    generated_images = []
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
            call_usage = data.get("usage") or {}
            usage["input_tokens"] += call_usage.get("input_tokens", 0)
            usage["output_tokens"] += call_usage.get("output_tokens", 0)
            content = data.get("content", [])
            tool_uses = [b for b in content if b.get("type") == "tool_use"]

            if not tool_uses:
                text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
                return text, usage, tool_log, generated_images

            api_messages.append({"role": "assistant", "content": content})
            tool_results = []
            for tu in tool_uses:
                result = await _run_tool(tu["name"], tu.get("input", {}), generated_images, attachment)
                tool_log.append({"name": tu["name"], "args": tu.get("input", {}), "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": json.dumps(result),
                })
            api_messages.append({"role": "user", "content": tool_results})
        return ("I made several tool calls but couldn't reach a final answer in time — try a more specific question.",
                usage, tool_log, generated_images)


async def _chat_openai_compatible(messages: list[dict], base_url: str, api_key: str, model: str,
                                   provider_label: str,
                                   attachment: Optional[dict] = None) -> tuple[str, dict, list, list]:
    """Shared tool-calling loop for any OpenAI-compatible chat/completions endpoint — NVIDIA NIM
    and Groq both implement this contract, so one implementation serves both rather than
    duplicating the same loop with a different base_url."""
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + list(messages)
    usage = {"input_tokens": 0, "output_tokens": 0}
    tool_log = []
    generated_images = []
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(4):
            resp = await client.post(
                base_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": api_messages,
                    "tools": TOOLS_OPENAI,
                    "max_tokens": 1024,
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"{provider_label} API error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            call_usage = data.get("usage") or {}
            usage["input_tokens"] += call_usage.get("prompt_tokens", 0)
            usage["output_tokens"] += call_usage.get("completion_tokens", 0)
            choice = data["choices"][0]["message"]
            tool_calls = choice.get("tool_calls") or []

            if not tool_calls:
                return choice.get("content", ""), usage, tool_log, generated_images

            api_messages.append(choice)
            for tc in tool_calls:
                args = json.loads(tc["function"]["arguments"])
                result = await _run_tool(tc["function"]["name"], args, generated_images, attachment)
                tool_log.append({"name": tc["function"]["name"], "args": args, "result": result})
                api_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })
        return ("I made several tool calls but couldn't reach a final answer in time — try a more specific question.",
                usage, tool_log, generated_images)


async def chat_nvidia(messages: list[dict], attachment: Optional[dict] = None) -> tuple[str, dict, list, list]:
    return await _chat_openai_compatible(
        messages, "https://integrate.api.nvidia.com/v1/chat/completions",
        NVIDIA_API_KEY, NVIDIA_MODEL, "NVIDIA NIM", attachment,
    )


async def chat_groq(messages: list[dict], attachment: Optional[dict] = None) -> tuple[str, dict, list, list]:
    return await _chat_openai_compatible(
        messages, "https://api.groq.com/openai/v1/chat/completions",
        GROQ_API_KEY, GROQ_MODEL, "Groq", attachment,
    )


def _gemini_role(role: str) -> str:
    # Gemini uses "model" instead of "assistant"; everything else maps straight across.
    return "model" if role == "assistant" else "user"


async def chat_gemini(messages: list[dict], attachment: Optional[dict] = None) -> tuple[str, dict, list, list]:
    """Gemini's REST API has its own shapes for both messages (contents/parts) and function
    calling (functionCall/functionResponse parts, not a separate tool-role message) — different
    enough from both Anthropic's and the OpenAI-compatible shape that it needs its own loop
    rather than reusing either helper above."""
    contents = [{"role": _gemini_role(m["role"]), "parts": [{"text": m["content"]}]} for m in messages]
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
           f"?key={GEMINI_API_KEY}")
    usage = {"input_tokens": 0, "output_tokens": 0}
    tool_log = []
    generated_images = []

    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(4):
            resp = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                    "contents": contents,
                    "tools": TOOLS_GEMINI,
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini API error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            call_usage = data.get("usageMetadata") or {}
            usage["input_tokens"] += call_usage.get("promptTokenCount", 0)
            usage["output_tokens"] += call_usage.get("candidatesTokenCount", 0)
            candidates = data.get("candidates") or []
            if not candidates:
                return ("No response from Gemini (empty candidates — possibly blocked by safety filters).",
                        usage, tool_log, generated_images)
            parts = candidates[0].get("content", {}).get("parts", [])
            function_calls = [p["functionCall"] for p in parts if "functionCall" in p]

            if not function_calls:
                return "".join(p.get("text", "") for p in parts), usage, tool_log, generated_images

            contents.append({"role": "model", "parts": parts})
            response_parts = []
            for fc in function_calls:
                result = await _run_tool(fc["name"], fc.get("args", {}), generated_images, attachment)
                tool_log.append({"name": fc["name"], "args": fc.get("args", {}), "result": result})
                response_parts.append({"functionResponse": {"name": fc["name"], "response": result}})
            contents.append({"role": "user", "parts": response_parts})
        return ("I made several tool calls but couldn't reach a final answer in time — try a more specific question.",
                usage, tool_log, generated_images)


_DISPATCH = {
    "anthropic": chat_anthropic,
    "nvidia": chat_nvidia,
    "groq": chat_groq,
    "gemini": chat_gemini,
}


async def send_chat(messages: list[dict], provider: Optional[str] = None,
                     attachment: Optional[dict] = None) -> dict:
    resolved = active_provider(provider)
    if resolved is None:
        if provider:
            raise RuntimeError(
                f"'{provider}' isn't configured (no matching API key set on the backend). "
                f"Configured providers: {[p for p in _DISPATCH if active_provider(p)]}"
            )
        raise RuntimeError(
            "No chat provider configured. Set one of ANTHROPIC_API_KEY, NVIDIA_API_KEY, "
            "GROQ_API_KEY, GEMINI_API_KEY as an environment variable before starting the API."
        )
    reply, usage, tool_calls, generated_images = await _DISPATCH[resolved](messages, attachment)
    return {
        "reply": reply, "provider": resolved, "usage": usage, "tool_calls": tool_calls,
        "generated_images": generated_images,
    }
