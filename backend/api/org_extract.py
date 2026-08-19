"""
org_extract.py — vision-based org-chart extraction for My Organization's reference-file
upload (image or PDF of an existing org chart -> structured role list).

HONESTY NOTE (same spirit as chat.py's provider caveats): of the four chat providers wired up
in chat.py, only two are actually usable here out of the box. Anthropic's Claude and Google's
Gemini both accept images/PDFs natively in their chat-completions APIs. NVIDIA NIM and Groq's
*currently configured default models* (Nemotron-70B-instruct, Llama-3.3-70B-versatile) are
text-only chat models, not vision models — sending them an image would either error or be
silently ignored depending on the provider. Supporting them here would mean pointing
NVIDIA_MODEL/GROQ_MODEL at one of their vision-capable model IDs specifically for this
feature, which is a real config decision, not a code gap — flagged here rather than silently
claiming four-provider vision support that doesn't exist yet.

Not verified against a live call — same sandbox network restriction as chat.py.
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

EXTRACT_SYSTEM_PROMPT = """You read an image or PDF of an organization chart and convert it to
structured data. Output ONLY a JSON array, nothing else — no markdown fences, no commentary,
no explanation before or after.

Each element is one role/box you can see in the chart:
{
  "title": "the job title/role name as written",
  "department": "department/team label if shown near the box, else null",
  "reports_to": "the exact title string of the box this one reports to (its parent, one level
                 up), or null if this is the top of the chart",
  "headcount": integer if a headcount/number-of-people is shown on the box, else null
}

Rules:
- "reports_to" must exactly match another "title" string you also output, so the hierarchy can
  be reconstructed by string match — don't invent a parent title that isn't also in your output.
- If the image shows people's names instead of role titles, use the role/title text if present
  near the name; if only a name is visible with no role, use the name as the title.
- If you cannot confidently read the chart at all (blurry, not actually an org chart, etc.),
  output an empty array [].
- Do not guess roles that aren't visible in the image just to make the hierarchy look complete.
"""


def _strip_json_fences(text: str) -> str:
    # Vision models sometimes wrap JSON in ```json ... ``` despite instructions not to —
    # strip that defensively rather than failing the whole extraction over formatting.
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(\[.*\])\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    return text


def _parse_roles(text: str) -> list[dict]:
    raw = json.loads(_strip_json_fences(text))
    if not isinstance(raw, list):
        raise ValueError("Model did not return a JSON array.")
    roles = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        roles.append({
            "title": str(item["title"]).strip(),
            "department": (str(item["department"]).strip() if item.get("department") else None),
            "reports_to": (str(item["reports_to"]).strip() if item.get("reports_to") else None),
            "headcount": item.get("headcount") if isinstance(item.get("headcount"), int) else None,
        })
    return roles


async def _extract_anthropic(file_bytes: bytes, media_type: str) -> list[dict]:
    b64 = base64.b64encode(file_bytes).decode()
    # Claude's vision API takes images as "image" blocks and PDFs as "document" blocks — same
    # base64 payload, different block "type" depending on media_type.
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
                "max_tokens": 2048,
                "system": EXTRACT_SYSTEM_PROMPT,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": block_type, "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": "Extract the org chart from this file as the JSON array described in your instructions."},
                    ],
                }],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Anthropic vision API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return _parse_roles(text)


async def _extract_gemini(file_bytes: bytes, media_type: str) -> list[dict]:
    b64 = base64.b64encode(file_bytes).decode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
           f"?key={GEMINI_API_KEY}")
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": EXTRACT_SYSTEM_PROMPT}]},
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"inline_data": {"mime_type": media_type, "data": b64}},
                        {"text": "Extract the org chart from this file as the JSON array described in your instructions."},
                    ],
                }],
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini vision API error {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return []
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    return _parse_roles(text)


_DISPATCH = {"anthropic": _extract_anthropic, "gemini": _extract_gemini}
_KEY_PRESENT = {"anthropic": lambda: bool(ANTHROPIC_API_KEY), "gemini": lambda: bool(GEMINI_API_KEY)}


def available_vision_providers() -> list[str]:
    return [p for p in VISION_PROVIDERS if _KEY_PRESENT[p]()]


async def extract_org_chart(file_bytes: bytes, media_type: str, provider: Optional[str] = None) -> dict:
    configured = available_vision_providers()
    if not configured:
        raise RuntimeError(
            "No vision-capable provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY "
            "on the backend to enable org-chart auto-extraction."
        )
    resolved = provider if provider in configured else configured[0]
    roles = await _DISPATCH[resolved](file_bytes, media_type)

    # Flag (not silently drop) any reports_to that doesn't match a title in the same batch —
    # the frontend needs to know which rows it can auto-parent vs. which need a manual pick.
    titles = {r["title"] for r in roles}
    warnings = []
    for r in roles:
        if r["reports_to"] and r["reports_to"] not in titles:
            warnings.append(f'"{r["title"]}" reports to "{r["reports_to"]}", which wasn\'t extracted as its own role.')

    return {"provider": resolved, "roles": roles, "warnings": warnings}
