"""
GitHub App authentication — JWT signing.

GitHub App API auth flow (per https://docs.github.com/apps):
  1. We sign a short-lived (max 10 min) JWT with our App's private key (RS256).
  2. We exchange that JWT for an installation-scoped access token via
     POST /app/installations/{installation_id}/access_tokens — token lives 1h.
  3. We use the installation token (Bearer) to call repo-scoped endpoints.

This module handles step 1. Step 2 lives in services/github_app_tokens.py.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Optional

import jwt  # PyJWT — needs pyjwt[crypto] for RS256

from config import settings

logger = logging.getLogger(__name__)

# Cache the normalized private key so we only re-format once per process.
_normalized_key_cache: Optional[str] = None


def is_configured() -> bool:
    """True iff the GitHub App is fully configured (App ID + private key present)."""
    return bool(settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY)


def _normalize_pem(raw: str) -> str:
    """Repair common ways an RSA private key gets mangled in .env / Coolify env vars.

    Cases handled:
      1. Already-clean multi-line PEM → returned unchanged.
      2. Literal \\n sequences (operator pasted via shell with escaped newlines)
         → converted to real newlines.
      3. Single-line glue (Coolify single-line env input ate the line breaks)
         → headers/footers split out and base64 body re-wrapped at 64 chars.
    """
    if not raw:
        return raw
    key = raw.strip()

    # Case 2: literal \n → real newlines
    if "\\n" in key and "\n" not in key:
        key = key.replace("\\n", "\n")

    # Case 3: still no real newlines but contains BEGIN/END headers → re-wrap
    if "\n" not in key and "BEGIN" in key and "END" in key:
        m = re.match(r"^(-----BEGIN [A-Z 0-9]+KEY-----)\s*(.*?)\s*(-----END [A-Z 0-9]+KEY-----)\s*$", key)
        if m:
            header, body, footer = m.groups()
            body = re.sub(r"\s+", "", body)
            body_lines = [body[i:i + 64] for i in range(0, len(body), 64)]
            key = header + "\n" + "\n".join(body_lines) + "\n" + footer + "\n"

    # Ensure trailing newline (some PEM parsers are picky)
    if not key.endswith("\n"):
        key = key + "\n"
    return key


def _get_normalized_key() -> Optional[str]:
    global _normalized_key_cache
    if _normalized_key_cache is not None:
        return _normalized_key_cache
    raw = settings.GITHUB_APP_PRIVATE_KEY
    if not raw:
        return None
    _normalized_key_cache = _normalize_pem(raw)
    return _normalized_key_cache


def generate_app_jwt() -> Optional[str]:
    """Mint a short-lived JWT signed with the App's RSA private key.

    Per GitHub's docs, this JWT is used ONLY against /app and /app/installations endpoints —
    it cannot read repo data directly. It must be exchanged for an installation token.
    """
    if not is_configured():
        logger.warning("GitHub App is not configured (GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY missing).")
        return None

    key = _get_normalized_key()
    if not key:
        return None

    # GitHub recommends issuing the JWT 60 seconds in the past to allow clock drift.
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (9 * 60),  # 9 min — under GitHub's 10 min hard cap
        "iss": str(settings.GITHUB_APP_ID),
    }

    try:
        return jwt.encode(payload, key, algorithm="RS256")
    except Exception as exc:
        logger.error(
            "Failed to sign GitHub App JWT: %s. Hint: ensure GITHUB_APP_PRIVATE_KEY in your env "
            "contains the FULL .pem including the BEGIN/END lines and real newlines.",
            exc,
        )
        return None
