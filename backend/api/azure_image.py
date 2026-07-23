"""
azure_image.py — image generation AND editing via Azure OpenAI's image models
(gpt-image-1 or DALL-E 3, whichever your deployment uses).

Same honesty note as image_gen.py: written strictly to Azure OpenAI's documented REST
contract (images/generations and images/edits under a versioned deployment URL), not verified
against a live call in this sandbox — test against your own Azure credentials before relying
on it.

This is the ONLY provider wired up here that can edit an existing image (send pixels in,
get an edited image back) — image_gen.py's Gemini path is generation-only. image_router.py
picks between this and Gemini automatically; nothing in the frontend needs to know which one
ran.
"""
from __future__ import annotations

import base64
import os

import httpx

AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_ENDPOINT = (os.environ.get("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")
AZURE_OPENAI_IMAGE_DEPLOYMENT = os.environ.get("AZURE_OPENAI_IMAGE_DEPLOYMENT", "gpt-image-1")
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")


def available() -> bool:
    return bool(AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT)


def _require_configured() -> None:
    if not available():
        raise RuntimeError(
            "Azure OpenAI isn't configured on the backend — set AZURE_OPENAI_API_KEY, "
            "AZURE_OPENAI_ENDPOINT and (optionally) AZURE_OPENAI_IMAGE_DEPLOYMENT. Image editing "
            "and complex/detailed generation requests need this even when chatting with a "
            "different provider."
        )


def _headers() -> dict:
    return {"api-key": AZURE_OPENAI_API_KEY, "Content-Type": "application/json"}


async def generate_image(prompt: str, size: str = "1024x1024") -> dict:
    """Returns {"image_base64": str, "mime_type": str, "text": None}. Raises RuntimeError if
    Azure isn't configured or returns no image data."""
    _require_configured()
    url = (f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_IMAGE_DEPLOYMENT}/images/generations"
           f"?api-version={AZURE_OPENAI_API_VERSION}")
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, headers=_headers(), json={"prompt": prompt, "size": size, "n": 1})
    if resp.status_code != 200:
        raise RuntimeError(f"Azure OpenAI image API error {resp.status_code}: {resp.text[:500]}")

    data = resp.json()
    items = data.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise RuntimeError("Azure OpenAI didn't return image data for this prompt — try rephrasing it.")

    return {"image_base64": items[0]["b64_json"], "mime_type": "image/png", "text": None}


async def edit_image(prompt: str, image_base64: str, mime_type: str = "image/png",
                      size: str = "1024x1024") -> dict:
    """Edits an existing image given a base64-encoded source image and a text instruction.
    Uses Azure OpenAI's images/edits endpoint (multipart form, not JSON — the source image goes
    in as a file part). Returns the same shape as generate_image()."""
    _require_configured()
    url = (f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_IMAGE_DEPLOYMENT}/images/edits"
           f"?api-version={AZURE_OPENAI_API_VERSION}")
    image_bytes = base64.b64decode(image_base64)
    ext = "png" if "png" in mime_type else ("webp" if "webp" in mime_type else "jpg")
    files = {"image": (f"source.{ext}", image_bytes, mime_type)}
    data = {"prompt": prompt, "size": size, "n": "1"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url, headers={"api-key": AZURE_OPENAI_API_KEY}, data=data, files=files,
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Azure OpenAI image edit API error {resp.status_code}: {resp.text[:500]}")

    result = resp.json()
    items = result.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise RuntimeError("Azure OpenAI didn't return an edited image — try rephrasing the instruction.")

    return {"image_base64": items[0]["b64_json"], "mime_type": "image/png", "text": None}
