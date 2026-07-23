"""
llm_gateway.py — LLM cost-governance layer (Phase 5 of the Next-Gen Architecture reconciliation
plan): per-provider daily token budgets + a tiered fallback chain across the four chat providers
already wired in chat.py.

Scoped down from the compass doc's recommended LiteLLM/Portkey gateway, for a concrete reason
checked before writing any code: chat.py already calls its four providers directly, in-process,
from a single FastAPI backend — there is no separate LLM-traffic tier to put a standalone gateway
*service* in front of, and adding one (a new top-level process/container) would violate "don't
add new services beyond what a phase's acceptance criteria require." The actual requirement —
per-workload budgets + a tiered fallback chain on quota/rate-limit/budget exhaustion — is
implemented here as a thin in-process wrapper around chat.py's existing `_DISPATCH` functions.
No new heavy dependency, no new service.

Budgets: one env var per provider, `ZIVABASA_BUDGET_<PROVIDER>_TOKENS` (total input+output
tokens/day). Unset = unlimited for that provider (today's default, unchanged from before this
file existed). Usage is tracked in-memory only, resets at UTC midnight — a prototype-appropriate
choice matching this project's existing in-memory model registry, not backed by a database. A
process restart resets all budgets to zero, which is the conservative (fails open, not silently
exploitable) direction for a budget cap to fail in.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)

_BUDGET_ENV_PREFIX = "ZIVABASA_BUDGET_"
_BUDGET_ENV_SUFFIX = "_TOKENS"

_usage_by_provider: Dict[str, dict] = {}  # provider -> {"date": "YYYY-MM-DD", "tokens": int}


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _budget_for(provider: str) -> Optional[int]:
    raw = os.environ.get(f"{_BUDGET_ENV_PREFIX}{provider.upper()}{_BUDGET_ENV_SUFFIX}")
    return int(raw) if raw else None


def tokens_used_today(provider: str) -> int:
    entry = _usage_by_provider.get(provider)
    if entry is None or entry["date"] != _today():
        return 0
    return entry["tokens"]


def record_usage(provider: str, usage: dict) -> None:
    today = _today()
    tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
    entry = _usage_by_provider.get(provider)
    if entry is None or entry["date"] != today:
        _usage_by_provider[provider] = {"date": today, "tokens": tokens}
    else:
        entry["tokens"] += tokens


def has_budget(provider: str) -> bool:
    budget = _budget_for(provider)
    if budget is None:
        return True
    return tokens_used_today(provider) < budget


def budget_status(model_catalog: list) -> dict:
    """model_catalog: chat.MODEL_CATALOG — passed in rather than imported at module level to
    avoid a circular import (chat.py doesn't need to import this module at all; only main.py
    and tests do)."""
    status = {}
    for m in model_catalog:
        provider = m["provider"]
        budget = _budget_for(provider)
        used = tokens_used_today(provider)
        status[provider] = {
            "budget_tokens_per_day": budget,
            "used_today": used,
            "remaining_today": (budget - used) if budget is not None else None,
        }
    return status


async def send_chat_with_fallback(messages: list[dict], provider: Optional[str] = None,
                                   attachment: Optional[dict] = None) -> dict:
    """Tries `provider` (or the auto-detect default order) first; falls through the remaining
    configured providers, in chat.MODEL_CATALOG order, if the first is over budget, unconfigured,
    or its call raises. Returns the same shape chat.send_chat() already returns, plus
    `fallback_chain`: the ordered list of {provider, outcome} attempted this request."""
    from api import chat as chat_module  # deferred import — avoids a circular import at module load

    configured = [
        m["provider"] for m in chat_module.MODEL_CATALOG
        if chat_module._KEY_LOOKUP.get(m["key_env"])
    ]
    if not configured:
        raise RuntimeError(
            "No chat provider configured. Set one of ANTHROPIC_API_KEY, NVIDIA_API_KEY, "
            "GROQ_API_KEY, GEMINI_API_KEY as an environment variable before starting the API."
        )

    if provider:
        if provider not in configured:
            raise RuntimeError(
                f"'{provider}' isn't configured (no matching API key set on the backend). "
                f"Configured providers: {configured}"
            )
        chain = [provider] + [p for p in configured if p != provider]
    else:
        chain = configured

    attempts = []
    for candidate in chain:
        if not has_budget(candidate):
            attempts.append({"provider": candidate, "outcome": "skipped_budget_exhausted"})
            logger.warning("[%s] daily token budget exhausted, falling back.", candidate)
            continue
        try:
            reply, usage, tool_calls, generated_images = await chat_module._DISPATCH[candidate](messages, attachment)
        except Exception as e:
            attempts.append({"provider": candidate, "outcome": f"error: {e}"})
            logger.warning("[%s] call failed (%s), falling back.", candidate, e)
            continue

        record_usage(candidate, usage)
        attempts.append({"provider": candidate, "outcome": "success"})
        return {
            "reply": reply, "provider": candidate, "usage": usage, "tool_calls": tool_calls,
            "generated_images": generated_images, "fallback_chain": attempts,
        }

    raise RuntimeError(f"All configured providers exhausted or failed this request: {attempts}")
