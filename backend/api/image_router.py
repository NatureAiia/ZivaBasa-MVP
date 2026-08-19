"""
image_router.py — picks a provider for image generation/editing automatically so nothing
above this layer (chat tool dispatch, /images/* endpoints, the frontend) has to choose.

Routing rule (as specified, not a general-purpose ML classifier — a plain heuristic):
  - Editing an existing image always goes to Azure OpenAI (image_gen.py's Gemini path is
    generation-only, it never accepts an input image).
  - Generation goes to Gemini (free tier) for "simple" prompts, Azure OpenAI for "complex"
    ones, falling back to whichever single provider is actually configured if only one is.
  "Complex" here means long/detailed prompts or prompts asking for things Gemini's image model
  is known to struggle with — precise text/typography, logos, exact multi-element layouts,
  photorealism. This is a coarse proxy for output-quality needs, not a claim about either
  model's real capabilities.
"""
from __future__ import annotations

from api import azure_image as azure_module
from api import image_gen as gemini_module

_COMPLEXITY_KEYWORDS = (
    "photorealistic", "photo-realistic", "realistic photo", "exact text", "precise text",
    "readable text", "typography", "logo", "infographic", "chart with", "diagram with",
    "multiple panels", "consistent character", "consistent style", "high fidelity",
    "high-fidelity", "label each", "labeled with", "org chart", "organizational chart",
    "organisation chart", "flowchart",
)
_LENGTH_THRESHOLD = 260  # characters — a long, detailed prompt tends to need more control
                          # over layout/text than Gemini's image model reliably delivers.


def _looks_complex(prompt: str) -> bool:
    lowered = prompt.lower()
    return len(prompt) > _LENGTH_THRESHOLD or any(kw in lowered for kw in _COMPLEXITY_KEYWORDS)


def providers() -> list[str]:
    available = []
    if gemini_module.available():
        available.append("gemini")
    if azure_module.available():
        available.append("azure")
    return available


def _pick_generation_provider(prompt: str) -> str:
    gemini_ok, azure_ok = gemini_module.available(), azure_module.available()
    if not gemini_ok and not azure_ok:
        raise RuntimeError(
            "No image-generation provider is configured — set GEMINI_API_KEY and/or "
            "AZURE_OPENAI_API_KEY/AZURE_OPENAI_ENDPOINT on the backend."
        )
    if gemini_ok and not azure_ok:
        return "gemini"
    if azure_ok and not gemini_ok:
        return "azure"
    return "azure" if _looks_complex(prompt) else "gemini"


async def generate_image(prompt: str) -> dict:
    """Auto-routes to Gemini or Azure OpenAI based on prompt complexity. Returns
    {"provider": str, "image_base64": str, "mime_type": str, "text": str|None}."""
    provider = _pick_generation_provider(prompt)
    result = await (azure_module.generate_image(prompt) if provider == "azure"
                     else gemini_module.generate_image(prompt))
    return {"provider": provider, **result}


async def edit_image(prompt: str, image_base64: str, mime_type: str = "image/png") -> dict:
    """Always routed to Azure OpenAI — the only configured provider that can edit an existing
    image. Returns the same shape as generate_image()."""
    if not azure_module.available():
        raise RuntimeError(
            "Image editing needs Azure OpenAI configured on the backend (AZURE_OPENAI_API_KEY, "
            "AZURE_OPENAI_ENDPOINT) — Gemini image generation is generation-only here."
        )
    result = await azure_module.edit_image(prompt, image_base64, mime_type)
    return {"provider": "azure", **result}
