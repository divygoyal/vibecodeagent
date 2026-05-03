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
import time
from typing import Optional

import jwt  # PyJWT — needs pyjwt[crypto] for RS256

from config import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """True iff the GitHub App is fully configured (App ID + private key present)."""
    return bool(settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY)


def generate_app_jwt() -> Optional[str]:
    """Mint a short-lived JWT signed with the App's RSA private key.

    Per GitHub's docs, this JWT is used ONLY against /app and /app/installations endpoints —
    it cannot read repo data directly. It must be exchanged for an installation token.
    """
    if not is_configured():
        logger.warning("GitHub App is not configured (GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY missing).")
        return None

    # GitHub recommends issuing the JWT 60 seconds in the past to allow clock drift.
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (9 * 60),  # 9 min — under GitHub's 10 min hard cap
        "iss": str(settings.GITHUB_APP_ID),
    }

    try:
        return jwt.encode(payload, settings.GITHUB_APP_PRIVATE_KEY, algorithm="RS256")
    except Exception as exc:
        logger.error("Failed to sign GitHub App JWT: %s", exc)
        return None
