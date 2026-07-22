"""
field_extract.py — document upload -> auto-fill a prediction form's fields, mirroring
org_extract.py's exact pattern (vision-capable LLM reads a PDF/image directly, no separate OCR
library needed — see that file's docstring for why NVIDIA/Groq aren't wired up here either).

HUMAN-IN-THE-LOOP, not autofill-and-submit: this returns a review payload the frontend shows the
person before anything is applied to the form, and the form is never auto-submitted from this —
matches the project's standing "no automatic decisions, mandatory human review" constraint. The
model is explicitly instructed to say what it couldn't confidently read rather than invent a
number, mirroring org_extract.py's "don't guess roles that aren't visible" rule.

Not verified against a live call — same sandbox network restriction as chat.py/org_extract.py.
"""
from __future__ import annotations

import base64
import json
import os
import re
from typing import Optional

import httpx

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

VISION_PROVIDERS = ["anthropic", "gemini"]


def _system_prompt(feature_names: list[str]) -> str:
    fields = ", ".join(feature_names)
    return f"""You read an image or PDF of an HR/workforce document (e.g. a payslip, contract,
performance review, HR system export) and extract numeric values for a specific set of fields.

The fields you're looking for, exactly as named (case-sensitive):
{fields}

Output ONLY a JSON object, nothing else — no markdown fences, no commentary:
{{
  "features": {{"<field name>": <number>, ...}},
  "unmatched": ["<field name>", ...],
  "notes": "<one short sentence on anything you're unsure about, or empty string if none>"
}}

Rules:
- Only include a field in "features" if you can actually read a value for it in the document —
  do not estimate, guess, or default a field you can't find.
- Any field you couldn't find goes in "unmatched", not into "features" with a made-up number.
- If a field name suggests a derived/composite value (e.g. contains "_x_" or "interaction"),
  skip it — those are computed from other fields, not read directly from a document.
- If the document isn't readable at all (blurry, wrong document type), return empty "features"
  and "unmatched" containing every field name, with "notes" explaining why.
"""


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    return text


def _parse_result(text: str, feature_names: list[str]) -> dict:
    raw = json.loads(_strip_json_fences(text))
    if not isinstance(raw, dict):
        raise ValueError("Model did not return a JSON object.")
    features = {}
    for name, val in (raw.get("features") or {}).items():
        if name in feature_names and isinstance(val, (int, float)):
            features[name] = float(val)
    unmatched = [n for n in feature_names if n not in features]
    return {
        "features": features,
        "unmatched": unmatched,
        "notes": str(raw.get("notes") or ""),
    }


async def _extract_anthropic(file_bytes: bytes, media_type: str, feature_names: list[str]) -> dict:
    b64 = base64.b64encode(file_bytes).decode()
    block_type = "document" if media_type == "application/pdf" else "image"
    async with httpx.AsyncClient(timeout=90) as client:
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
                "system": _system_prompt(feature_names),
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": block_type, "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": "Extract the fields described in your instructions from this document."},
                    ],
                }],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Anthropic vision API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return _parse_result(text, feature_names)


async def _extract_gemini(file_bytes: bytes, media_type: str, feature_names: list[str]) -> dict:
    b64 = base64.b64encode(file_bytes).decode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
           f"?key={GEMINI_API_KEY}")
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": _system_prompt(feature_names)}]},
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"inline_data": {"mime_type": media_type, "data": b64}},
                        {"text": "Extract the fields described in your instructions from this document."},
                    ],
                }],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini vision API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return {"features": {}, "unmatched": feature_names, "notes": "No response from Gemini (possibly blocked by safety filters)."}
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    return _parse_result(text, feature_names)


_DISPATCH = {"anthropic": _extract_anthropic, "gemini": _extract_gemini}
_KEY_PRESENT = {"anthropic": lambda: bool(ANTHROPIC_API_KEY), "gemini": lambda: bool(GEMINI_API_KEY)}


def available_vision_providers() -> list[str]:
    return [p for p in VISION_PROVIDERS if _KEY_PRESENT[p]()]


async def extract_task_fields(
    file_bytes: bytes, media_type: str, feature_names: list[str], provider: Optional[str] = None
) -> dict:
    configured = available_vision_providers()
    if not configured:
        raise RuntimeError(
            "No vision-capable provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY "
            "on the backend to enable document auto-fill."
        )
    resolved = provider if provider in configured else configured[0]
    result = await _DISPATCH[resolved](file_bytes, media_type, feature_names)
    return {"provider": resolved, **result}
