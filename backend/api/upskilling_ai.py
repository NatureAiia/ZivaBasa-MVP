"""
upskilling_ai.py — AI-generated micro-lesson + single-call content-verification ("AI board of
directors") for the upskilling feature, plus a durable topic-keyed disk cache so the same
top-driver profile isn't regenerated+re-verified for every user.

AI BOARD SCOPE NOTE: "AI board of directors" is ONE constrained LLM call whose system prompt asks
it to check safety, accuracy, and tone in a single structured response — not several separate
model calls voting independently. Chosen for cost/latency; the UI may still brand it "reviewed by
ZivaBasa's AI board" without literally running a multi-agent panel.

PROVIDER NOTE: reuses field_extract.py's constrained-call pattern (direct provider HTTP call,
strict JSON-only system prompt, fence-stripping parse), not llm_gateway.py's
send_chat_with_fallback — checked before writing this: that function always dispatches through
chat.py's _DISPATCH, which hardcodes chat.py's own Chiedza-persona SYSTEM_PROMPT with no override
parameter, so it can't carry a different task-specific system prompt without editing chat.py's
existing (working) chat feature. llm_gateway's budget tracker (has_budget/record_usage) IS reused
here for cost-governance consistency with the rest of the app.

Providers: nvidia (NIM's OpenAI-compatible chat/completions endpoint, same one chat.py's
chat_nvidia() calls), anthropic, gemini — nvidia listed first since it's this deployment's only
currently-working key (verified live: gemini's configured key has a 0-quota free tier, no
ANTHROPIC_API_KEY is set here). Order is a fallback chain, not a hard requirement; whichever
keys are actually present get tried.

LAYERING NOTE: lives in api/ (not src/) because it needs llm_gateway + provider HTTP calls —
src/upskilling.py stays pure data/lookup logic with no api/ dependency (this project's convention
is api/ imports from src/, never the reverse).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Dict, List, Optional

import httpx

from api import llm_gateway
from src import config, upskilling as upskilling_module

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

TEXT_PROVIDERS = ["nvidia", "anthropic", "gemini"]

CACHE_DIR = os.path.join(config.MODELS_DIR, "upskilling")
CACHE_PATH = os.path.join(CACHE_DIR, "lessons_cache.json")


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    return text


def _lesson_system_prompt(topics: List[str]) -> str:
    topic_list = ", ".join(topics) or "general workplace upskilling"
    return f"""You write a short, practical upskilling micro-lesson for a workforce-analytics app.
Topic area(s): {topic_list}.

Output ONLY a JSON object, nothing else — no markdown fences, no commentary:
{{
  "title": "<short lesson title>",
  "body_markdown": "<200-400 words of practical, encouraging, accurate advice in markdown>",
  "topics": ["<topic tag>", ...]
}}

Rules:
- Be concrete and actionable, not generic motivational filler.
- Do not make unverifiable factual claims about specific employers, salaries, or statistics.
- Keep a supportive, non-alarmist tone — this may be shown to someone who just saw a risk score.
"""


def _board_system_prompt() -> str:
    return """You are a content-review gate for a workforce-analytics app ("ZivaBasa's AI board").
You will be given a JSON micro-lesson. Check it along three dimensions in one pass:
1. Safety: no harmful, discriminatory, or legally risky advice.
2. Accuracy: no unverifiable factual claims presented as fact.
3. Tone: supportive and non-alarmist, appropriate for someone who just saw a workplace risk score.

Output ONLY a JSON object, nothing else — no markdown fences, no commentary:
{
  "approved": <true|false>,
  "reasons": ["<short reason>", ...],
  "revised_body_markdown": "<a corrected version of body_markdown if approved is false and a
    fix is straightforward, otherwise null>"
}
"""


async def _call_nvidia_text(system_prompt: str, user_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": NVIDIA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": 1024,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"NVIDIA NIM API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    text = data["choices"][0]["message"].get("content", "")
    usage = data.get("usage") or {}
    llm_gateway.record_usage("nvidia", {
        "input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0),
    })
    return text


async def _call_anthropic_text(system_prompt: str, user_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
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
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Anthropic API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    usage = data.get("usage", {})
    llm_gateway.record_usage("anthropic", {
        "input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0),
    })
    return text


async def _call_gemini_text(system_prompt: str, user_prompt: str) -> str:
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
           f"?key={GEMINI_API_KEY}")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("No response from Gemini (possibly blocked by safety filters).")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    usage_meta = data.get("usageMetadata", {})
    llm_gateway.record_usage("gemini", {
        "input_tokens": usage_meta.get("promptTokenCount", 0),
        "output_tokens": usage_meta.get("candidatesTokenCount", 0),
    })
    return text


_TEXT_DISPATCH = {"nvidia": _call_nvidia_text, "anthropic": _call_anthropic_text, "gemini": _call_gemini_text}
_KEY_PRESENT = {
    "nvidia": lambda: bool(NVIDIA_API_KEY),
    "anthropic": lambda: bool(ANTHROPIC_API_KEY),
    "gemini": lambda: bool(GEMINI_API_KEY),
}


async def _call_text_with_fallback(system_prompt: str, user_prompt: str) -> str:
    configured = [p for p in TEXT_PROVIDERS if _KEY_PRESENT[p]()]
    if not configured:
        raise RuntimeError(
            "No chat provider configured for upskilling content generation. Set NVIDIA_API_KEY, "
            "ANTHROPIC_API_KEY, or GEMINI_API_KEY as an environment variable before starting the API."
        )
    errors = []
    for candidate in configured:
        if not llm_gateway.has_budget(candidate):
            errors.append(f"{candidate}: daily token budget exhausted")
            continue
        try:
            return await _TEXT_DISPATCH[candidate](system_prompt, user_prompt)
        except Exception as e:
            errors.append(f"{candidate}: {e}")
    raise RuntimeError(f"All configured providers exhausted or failed: {errors}")


async def generate_micro_lesson(task: str, topics: List[str]) -> dict:
    text = await _call_text_with_fallback(
        _lesson_system_prompt(topics),
        f"Write the micro-lesson for the '{task}' prediction context described in your instructions.",
    )
    raw = json.loads(_strip_json_fences(text))
    if not isinstance(raw, dict) or "body_markdown" not in raw:
        raise ValueError("Model did not return a valid micro-lesson JSON object.")
    return {
        "title": str(raw.get("title") or "Upskilling micro-lesson"),
        "body_markdown": str(raw["body_markdown"]),
        "topics": [str(t) for t in (raw.get("topics") or topics)],
    }


async def verify_with_board(lesson: dict) -> dict:
    text = await _call_text_with_fallback(
        _board_system_prompt(),
        json.dumps({"title": lesson["title"], "body_markdown": lesson["body_markdown"]}),
    )
    raw = json.loads(_strip_json_fences(text))
    if not isinstance(raw, dict) or "approved" not in raw:
        raise ValueError("Model did not return a valid board-verification JSON object.")
    return {
        "approved": bool(raw.get("approved")),
        "reasons": [str(r) for r in (raw.get("reasons") or [])],
        "revised_body_markdown": raw.get("revised_body_markdown") or None,
    }


# --------------------------------------------------------------------------- #
# Durable, topic-keyed disk cache — mirrors src/causal_xai.py's / src/uplift.py's build/save/
# load bundle convention (models/<subdir>/*) rather than a new Supabase table: every existing
# Supabase table uses per-user-owner RLS, which doesn't fit a cross-user, no-owner, topic-keyed
# cache. Kept as one flat JSON file, not one file per entry, since entries are small text blobs,
# not model artifacts.
# --------------------------------------------------------------------------- #
_cache: Optional[Dict[str, dict]] = None


def _load_cache() -> Dict[str, dict]:
    global _cache
    if _cache is not None:
        return _cache
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r") as f:
            _cache = json.load(f)
    else:
        _cache = {}
    return _cache


def _save_cache() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp_path = CACHE_PATH + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(_cache, f, indent=2)
    os.replace(tmp_path, CACHE_PATH)


def _lesson_cache_key(task: str, feature_names: List[str]) -> str:
    topics = sorted(upskilling_module.topics_for_features(task, feature_names))
    digest = hashlib.sha256(f"{task}:{','.join(topics)}".encode()).hexdigest()[:16]
    return digest


async def get_or_build_verified_micro_lesson(task: str, feature_names: List[str]) -> dict:
    """Cache check -> generate -> board-verify -> persist -> return
    {title, body_markdown, topics, reviewed_by, cached}. Single entry point the API calls;
    owns all cache I/O so callers never touch the cache file directly."""
    cache = _load_cache()
    key = _lesson_cache_key(task, feature_names)
    if key in cache:
        return {**cache[key], "cached": True}

    topics = upskilling_module.topics_for_features(task, feature_names)
    lesson = await generate_micro_lesson(task, topics)
    review = await verify_with_board(lesson)
    if not review["approved"] and review["revised_body_markdown"]:
        lesson = {**lesson, "body_markdown": review["revised_body_markdown"]}

    entry = {
        "title": lesson["title"],
        "body_markdown": lesson["body_markdown"],
        "topics": lesson["topics"],
        "reviewed_by": "ZivaBasa's AI board",
    }
    cache[key] = entry
    _save_cache()
    return {**entry, "cached": False}
