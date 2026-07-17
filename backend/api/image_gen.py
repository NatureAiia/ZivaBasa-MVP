"""
image_gen.py — text-to-image generation via Google Gemini's image-capable model.

Same honesty note as chat.py/org_extract.py: written strictly to Gemini's documented
generateContent contract (image-capable models return inline_data image parts the same way
vision input goes in), not verified against a live call in this sandbox — test against your
own GEMINI_API_KEY before relying on it.

Only Gemini is wired up here — Anthropic/NVIDIA/Groq don't offer an image-generation endpoint,
so this is intentionally single-provider rather than following chat.py's multi-provider dispatch
pattern.
"""
from __future__ import annotations

import os

import httpx

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")


def available() -> bool:
    return bool(GEMINI_API_KEY)


async def generate_image(prompt: str) -> dict:
    """Returns {"image_base64": str, "mime_type": str, "text": str|None}. Raises RuntimeError
    if no key is configured or Gemini returns no image part (e.g. blocked by safety filters)."""
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY isn't set on the backend — image generation needs a Gemini key "
            "even when chatting with a different provider, since Gemini is the only one of "
            "the four wired-up chat providers that offers image generation."
        )

    url = (f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_IMAGE_MODEL}:generateContent"
           f"?key={GEMINI_API_KEY}")
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json={"contents": [{"role": "user", "parts": [{"text": prompt}]}]},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini image API error {resp.status_code}: {resp.text[:500]}")

    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("No response from Gemini (empty candidates — possibly blocked by safety filters).")

    parts = candidates[0].get("content", {}).get("parts", [])
    image_part = next((p for p in parts if "inlineData" in p or "inline_data" in p), None)
    if image_part is None:
        raise RuntimeError("Gemini didn't return an image for this prompt — try rephrasing it.")

    inline = image_part.get("inlineData") or image_part.get("inline_data")
    text = "".join(p.get("text", "") for p in parts if "text" in p) or None

    return {
        "image_base64": inline["data"],
        "mime_type": inline.get("mimeType") or inline.get("mime_type") or "image/png",
        "text": text,
    }
