"""
Nanobot LLM Fallback Wrapper

Strategy: Write a sitecustomize.py that patches litellm with retry +
model fallback, then exec nanobot so the patches load automatically
in nanobot's Python process via the site-packages mechanism.

Fallback chain (configurable via NANOBOT_FALLBACK_MODELS env var):
  primary model -> gemini-3.1-flash-lite -> gemini-3.1-pro -> gemini-2.5-flash
"""

import os
import sys
import tempfile

# The fallback patch code that will be written to sitecustomize.py
# and auto-loaded by Python before nanobot starts
PATCH_CODE = r'''
import asyncio
import logging
import os
import sys
import atexit

logger = logging.getLogger("nanobot.fallback")

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

RETRIABLE_PATTERNS = [
    "503", "429", "ServiceUnavailable", "RateLimitError",
    "UNAVAILABLE", "overloaded", "high demand",
]

_patched = False

def _apply_patch():
    global _patched
    if _patched:
        return
    try:
        import litellm
    except ImportError:
        return

    _original_acompletion = litellm.acompletion

    RETRIABLE_EXCEPTIONS = []
    try:
        from litellm.exceptions import (
            ServiceUnavailableError,
            RateLimitError,
            Timeout,
            APIConnectionError,
        )
        RETRIABLE_EXCEPTIONS.extend([ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError])
    except ImportError:
        pass

    def _is_retriable(exc):
        for exc_type in RETRIABLE_EXCEPTIONS:
            if isinstance(exc, exc_type):
                return True
        return any(p in str(exc) for p in RETRIABLE_PATTERNS)

    async def acompletion_with_fallback(*args, **kwargs):
        original_model = kwargs.get("model", args[0] if args else "unknown")
        last_error = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                return await _original_acompletion(*args, **kwargs)
            except Exception as e:
                last_error = e
                if not _is_retriable(e):
                    raise
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (2 ** attempt)
                    logger.warning(
                        f"[Fallback] {original_model} attempt {attempt + 1} failed: "
                        f"{type(e).__name__}. Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)

        for fallback_model in FALLBACK_MODELS:
            if fallback_model == original_model:
                continue
            try:
                logger.warning(
                    f"[Fallback] {original_model} exhausted retries. "
                    f"Trying fallback: {fallback_model}"
                )
                kwargs["model"] = fallback_model
                return await _original_acompletion(*args, **kwargs)
            except Exception as e:
                logger.warning(f"[Fallback] {fallback_model} also failed: {type(e).__name__}")
                last_error = e
                if not _is_retriable(e):
                    raise
                continue

        raise last_error

    litellm.acompletion = acompletion_with_fallback
    litellm.num_retries = MAX_RETRIES
    litellm.request_timeout = 30
    _patched = True

    # Re-patch after any future litellm imports bind the old reference
    _orig_import = __builtins__.__import__ if isinstance(__builtins__, dict) and '__import__' in __builtins__ else __import__
    def _safe_import(name, *a, **kw):
        mod = _orig_import(name, *a, **kw)
        if name == "litellm" and hasattr(mod, "acompletion") and mod.acompletion is not acompletion_with_fallback:
            mod.acompletion = acompletion_with_fallback
        return mod
    try:
        import builtins
        builtins.__import__ = _safe_import
    except Exception:
        pass

    logger.info(
        f"[Fallback] Patched litellm: primary -> {' -> '.join(FALLBACK_MODELS)} "
        f"(retries={MAX_RETRIES}, delay={RETRY_DELAY}s)"
    )

# Apply immediately (litellm may already be importable)
_apply_patch()

# Also hook into future imports in case litellm loads later
if not _patched:
    import importlib
    _orig_import_module = importlib.import_module
    def _hooked_import_module(name, *a, **kw):
        mod = _orig_import_module(name, *a, **kw)
        if name == "litellm":
            _apply_patch()
        return mod
    importlib.import_module = _hooked_import_module
'''

if __name__ == "__main__":
    # Write the patch to a sitecustomize.py in a temp directory
    patch_dir = tempfile.mkdtemp(prefix="nanobot_patch_")
    site_file = os.path.join(patch_dir, "sitecustomize.py")
    with open(site_file, "w") as f:
        f.write(PATCH_CODE)

    # Prepend to PYTHONPATH so Python loads our sitecustomize.py
    existing_path = os.environ.get("PYTHONPATH", "")
    os.environ["PYTHONPATH"] = patch_dir + (":" + existing_path if existing_path else "")

    # exec nanobot — replaces this process, patches load via sitecustomize
    os.execvp("nanobot", ["nanobot", "gateway"])
