#!/bin/bash
# Nanobot entrypoint with LLM fallback injection
#
# Writes a sitecustomize.py that patches litellm with retry + model
# fallback, then starts nanobot with PYTHONPATH set so the patch
# loads automatically in the same Python process.

PATCH_DIR="/tmp/nanobot_patch"
mkdir -p "$PATCH_DIR"

cat > "$PATCH_DIR/sitecustomize.py" << 'PYEOF'
import asyncio, logging, os, sys

logger = logging.getLogger("nanobot.fallback")

FALLBACK_MODELS = [
    m.strip()
    for m in os.environ.get(
        "NANOBOT_FALLBACK_MODELS",
        "gemini/gemini-2.5-flash,gemini/gemini-2.0-flash",
    ).split(",")
    if m.strip()
]
MAX_RETRIES = int(os.environ.get("NANOBOT_RETRY_COUNT", "1"))
RETRY_DELAY = float(os.environ.get("NANOBOT_RETRY_DELAY", "1.0"))
REQUEST_TIMEOUT = int(os.environ.get("NANOBOT_REQUEST_TIMEOUT", "30"))
RETRIABLE_PATTERNS = ["503", "429", "ServiceUnavailable", "RateLimitError", "UNAVAILABLE", "overloaded", "high demand"]

_patched = False

def _apply_patch():
    global _patched
    if _patched:
        return
    try:
        import litellm
    except ImportError:
        return

    _original = litellm.acompletion

    RETRIABLE = []
    try:
        from litellm.exceptions import ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError
        RETRIABLE.extend([ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError])
    except ImportError:
        pass

    def _is_retriable(exc):
        for t in RETRIABLE:
            if isinstance(exc, t):
                return True
        return any(p in str(exc) for p in RETRIABLE_PATTERNS)

    async def _fallback(*args, **kwargs):
        # Force timeout on every call to prevent 10-minute hangs
        if "timeout" not in kwargs:
            kwargs["timeout"] = REQUEST_TIMEOUT
        model = kwargs.get("model", args[0] if args else "unknown")
        last_err = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                return await _original(*args, **kwargs)
            except Exception as e:
                last_err = e
                if not _is_retriable(e):
                    raise
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (2 ** attempt)
                    logger.warning(f"[Fallback] {model} attempt {attempt+1} failed: {type(e).__name__}. Retrying in {delay:.1f}s...")
                    await asyncio.sleep(delay)

        for fb in FALLBACK_MODELS:
            if fb == model:
                continue
            try:
                logger.warning(f"[Fallback] {model} exhausted. Trying: {fb}")
                kwargs["model"] = fb
                return await _original(*args, **kwargs)
            except Exception as e:
                logger.warning(f"[Fallback] {fb} failed: {type(e).__name__}")
                last_err = e
                if not _is_retriable(e):
                    raise
        raise last_err

    litellm.acompletion = _fallback
    litellm.num_retries = MAX_RETRIES
    litellm.request_timeout = REQUEST_TIMEOUT
    _patched = True
    logger.info(f"[Fallback] Patched litellm: primary -> {' -> '.join(FALLBACK_MODELS)} (retries={MAX_RETRIES})")

_apply_patch()

if not _patched:
    import importlib
    _orig = importlib.import_module
    def _hook(name, *a, **kw):
        mod = _orig(name, *a, **kw)
        if name == "litellm":
            _apply_patch()
        return mod
    importlib.import_module = _hook
PYEOF

# Prepend our patch dir to PYTHONPATH so sitecustomize.py loads automatically
export PYTHONPATH="$PATCH_DIR${PYTHONPATH:+:$PYTHONPATH}"

echo "[entrypoint] Fallback patch written to $PATCH_DIR/sitecustomize.py"
echo "[entrypoint] PYTHONPATH=$PYTHONPATH"
echo "[entrypoint] Starting nanobot gateway..."

exec nanobot gateway
