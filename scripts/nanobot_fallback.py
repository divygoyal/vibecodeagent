"""
Nanobot LLM Fallback Wrapper

Monkey-patches litellm's acompletion with retry + model fallback BEFORE
nanobot imports it. This ensures that 503/429 errors automatically cascade
to fallback models instead of surfacing as errors to the user.

Fallback chain (configurable via NANOBOT_FALLBACK_MODELS env var):
  gemini-3-flash-preview → gemini-2.5-flash → gemini-2.0-flash
"""

import asyncio
import logging
import os
import sys

logger = logging.getLogger("nanobot.fallback")

# --- Configuration from environment ---
FALLBACK_MODELS = [
    m.strip()
    for m in os.environ.get(
        "NANOBOT_FALLBACK_MODELS",
        "gemini/gemini-3.1-flash-lite-preview,gemini/gemini-3.1-pro-preview,gemini/gemini-2.5-flash",
    ).split(",")
    if m.strip()
]

MAX_RETRIES = int(os.environ.get("NANOBOT_RETRY_COUNT", "2"))
RETRY_DELAY = float(os.environ.get("NANOBOT_RETRY_DELAY", "1.5"))

# --- Patch litellm BEFORE nanobot imports it ---
import litellm  # noqa: E402

_original_acompletion = litellm.acompletion

# Exceptions that should trigger fallback (503, 429, timeout)
RETRIABLE_EXCEPTIONS = []
try:
    from litellm.exceptions import (
        ServiceUnavailableError,
        RateLimitError,
        Timeout,
        APIConnectionError,
    )
    RETRIABLE_EXCEPTIONS = [ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError]
except ImportError:
    pass

# Fallback: also catch by exception message patterns if imports fail
RETRIABLE_PATTERNS = ["503", "429", "ServiceUnavailable", "RateLimitError", "UNAVAILABLE", "overloaded", "high demand"]


def _is_retriable(exc: Exception) -> bool:
    """Check if an exception should trigger retry/fallback."""
    for exc_type in RETRIABLE_EXCEPTIONS:
        if isinstance(exc, exc_type):
            return True
    exc_str = str(exc)
    return any(p in exc_str for p in RETRIABLE_PATTERNS)


async def acompletion_with_fallback(*args, **kwargs):
    """
    Wraps litellm.acompletion with:
    1. Retry the primary model up to MAX_RETRIES times with exponential backoff
    2. If still failing, try each fallback model in order
    """
    original_model = kwargs.get("model", args[0] if args else "unknown")
    last_error = None

    # --- Phase 1: Retry primary model ---
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await _original_acompletion(*args, **kwargs)
        except Exception as e:
            last_error = e
            if not _is_retriable(e):
                raise  # Non-retriable error (auth, bad request, etc.) — fail fast
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAY * (2 ** attempt)  # Exponential backoff
                logger.warning(
                    f"[Fallback] {original_model} attempt {attempt + 1} failed: {type(e).__name__}. "
                    f"Retrying in {delay:.1f}s..."
                )
                await asyncio.sleep(delay)

    # --- Phase 2: Try fallback models ---
    for fallback_model in FALLBACK_MODELS:
        # Skip if fallback is same as primary
        if fallback_model == original_model:
            continue
        try:
            logger.warning(
                f"[Fallback] {original_model} exhausted retries. Trying fallback: {fallback_model}"
            )
            kwargs["model"] = fallback_model
            return await _original_acompletion(*args, **kwargs)
        except Exception as e:
            logger.warning(f"[Fallback] {fallback_model} also failed: {type(e).__name__}")
            last_error = e
            if not _is_retriable(e):
                raise
            continue

    # All models exhausted — raise the last error
    raise last_error


# --- Apply the patch ---
litellm.acompletion = acompletion_with_fallback

# Also patch the module-level import that nanobot uses:
# `from litellm import acompletion` binds to the old reference,
# so we need to patch nanobot's provider module after it's imported.
_original_nanobot_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__


def _patched_import(name, *args, **kwargs):
    module = _original_nanobot_import(name, *args, **kwargs)
    # After nanobot.providers.litellm_provider is imported, patch its acompletion reference
    if name == "litellm" or (hasattr(module, "acompletion") and name.startswith("litellm")):
        if hasattr(module, "acompletion") and module.acompletion is not acompletion_with_fallback:
            module.acompletion = acompletion_with_fallback
    return module


import builtins
builtins.__import__ = _patched_import

# Set litellm module-level retry settings as belt-and-suspenders
litellm.num_retries = MAX_RETRIES
litellm.request_timeout = 30

logger.info(
    f"[Fallback] Patched litellm with fallback chain: primary → {' → '.join(FALLBACK_MODELS)} "
    f"(retries={MAX_RETRIES}, delay={RETRY_DELAY}s)"
)

# --- Start nanobot ---
if __name__ == "__main__":
    from nanobot.cli.main import app
    sys.argv = ["nanobot", "gateway"]
    app()
