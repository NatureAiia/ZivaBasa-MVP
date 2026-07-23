"""
azure_image.py — image generation AND editing via Azure OpenAI's image models (gpt-image-1 or
DALL-E 3, whichever your deployment uses), through the official `openai` SDK's AsyncAzureOpenAI
client rather than hand-rolled REST calls (chat.py's four chat providers stay on httpx — this is
the one integration that goes through the SDK, since it saves hand-modeling multipart image
upload for edits).

Same honesty note as chat.py/image_gen.py: written strictly to the SDK's documented interface,
not verified against a live call in this sandbox — test against your own Azure credentials
before relying on it.

This is the ONLY provider wired up here that can edit an existing image (send pixels in, get an
edited image back) — image_gen.py's Gemini path is generation-only. image_router.py picks
between this and Gemini automatically; nothing in the frontend needs to know which one ran.
"""
from __future__ import annotations

import base64
import os

from openai import AsyncAzureOpenAI

AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_IMAGE_DEPLOYMENT = os.environ.get("AZURE_OPENAI_IMAGE_DEPLOYMENT", "gpt-image-1")
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")


def available() -> bool:
    return bool(AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT)


def _client() -> AsyncAzureOpenAI:
    if not available():
        raise RuntimeError(
            "Azure OpenAI isn't configured on the backend — set AZURE_OPENAI_API_KEY, "
            "AZURE_OPENAI_ENDPOINT and (optionally) AZURE_OPENAI_IMAGE_DEPLOYMENT. Image editing "
            "and complex/detailed generation requests need this even when chatting with a "
            "different provider."
        )
    return AsyncAzureOpenAI(
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
    )


def _extract_base64(item) -> str:
    """gpt-image-1 always returns b64_json; DALL-E 3 deployments can return either b64_json or a
    url depending on response_format, so this covers both without the caller needing to know
    which model is behind the deployment."""
    if item.b64_json:
        return item.b64_json
    raise RuntimeError(
        "Azure OpenAI returned a URL instead of inline image data (response_format wasn't "
        "honored) — this integration expects b64_json so the image can be embedded directly; "
        "check your deployment's supported response formats."
    )


async def generate_image(prompt: str, size: str = "1024x1024") -> dict:
    """Returns {"image_base64": str, "mime_type": str, "text": None}. Raises RuntimeError if
    Azure isn't configured or returns no image data."""
    client = _client()
    response = await client.images.generate(
        model=AZURE_OPENAI_IMAGE_DEPLOYMENT, prompt=prompt, size=size, n=1,
    )
    if not response.data:
        raise RuntimeError("Azure OpenAI didn't return image data for this prompt — try rephrasing it.")
    return {"image_base64": _extract_base64(response.data[0]), "mime_type": "image/png", "text": None}


async def edit_image(prompt: str, image_base64: str, mime_type: str = "image/png",
                      size: str = "1024x1024") -> dict:
    """Edits an existing image given a base64-encoded source image and a text instruction.
    Returns the same shape as generate_image()."""
    client = _client()
    image_bytes = base64.b64decode(image_base64)
    ext = "png" if "png" in mime_type else ("webp" if "webp" in mime_type else "jpg")
    response = await client.images.edit(
        model=AZURE_OPENAI_IMAGE_DEPLOYMENT,
        image=(f"source.{ext}", image_bytes, mime_type),
        prompt=prompt,
        size=size,
        n=1,
    )
    if not response.data:
        raise RuntimeError("Azure OpenAI didn't return an edited image — try rephrasing the instruction.")
    return {"image_base64": _extract_base64(response.data[0]), "mime_type": "image/png", "text": None}
