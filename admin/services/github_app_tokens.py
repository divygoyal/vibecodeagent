"""
GitHub App installation tokens — fetch + cache.

Each token is scoped to one installation (one user/org's selected repos),
lives ~1h, and can be used as a Bearer token against /repos/{owner}/{repo}/...
endpoints for any repo the user selected when installing the App.

We cache tokens in-memory keyed by installation_id with a 2-minute safety
margin before expiry. The cache is per-process — not a problem for the
admin API since installation tokens are cheap to mint and we have only
one process per container.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple

import httpx

from security.github_app_jwt import generate_app_jwt, is_configured

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
TOKEN_TTL_SAFETY_SECONDS = 120  # refresh 2 min before GitHub-stated expiry

# installation_id -> (token, expires_at_unix)
_token_cache: dict[int, Tuple[str, float]] = {}
_cache_lock = asyncio.Lock()


def _now() -> float:
    return datetime.now(timezone.utc).timestamp()


async def get_installation_token(installation_id: int) -> Optional[str]:
    """Return a cached or freshly-minted installation token. None if the App is
    not configured or the installation has been suspended/uninstalled."""
    if not is_configured():
        return None

    cached = _token_cache.get(installation_id)
    if cached and cached[1] > _now() + TOKEN_TTL_SAFETY_SECONDS:
        return cached[0]

    async with _cache_lock:
        # Re-check inside the lock — another task may have just refreshed.
        cached = _token_cache.get(installation_id)
        if cached and cached[1] > _now() + TOKEN_TTL_SAFETY_SECONDS:
            return cached[0]

        app_jwt = generate_app_jwt()
        if not app_jwt:
            return None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
                    headers={
                        "Authorization": f"Bearer {app_jwt}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except Exception as exc:
            logger.error("Failed to fetch installation token (%s): %s", installation_id, exc)
            return None

        if resp.status_code == 404:
            logger.warning("Installation %s not found — likely uninstalled.", installation_id)
            _token_cache.pop(installation_id, None)
            return None
        if resp.status_code >= 400:
            logger.warning(
                "Installation token fetch returned %s for %s: %s",
                resp.status_code, installation_id, resp.text[:200],
            )
            return None

        body = resp.json()
        token = body.get("token")
        expires_at_iso = body.get("expires_at")
        if not token or not expires_at_iso:
            return None

        try:
            expires_at = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00")).timestamp()
        except Exception:
            expires_at = _now() + 3300  # fallback: assume 55 min

        _token_cache[installation_id] = (token, expires_at)
        return token


async def fetch_installation_metadata(installation_id: int) -> Optional[dict]:
    """Fetch installation metadata (account, repository_selection, etc.) using a
    short-lived App JWT. Used at install time to populate the DB row."""
    if not is_configured():
        return None
    app_jwt = generate_app_jwt()
    if not app_jwt:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{GITHUB_API}/app/installations/{installation_id}",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception as exc:
        logger.error("Failed to fetch installation metadata (%s): %s", installation_id, exc)
        return None


async def list_installation_repositories(installation_id: int) -> list[dict]:
    """List repositories accessible to this installation."""
    token = await get_installation_token(installation_id)
    if not token:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{GITHUB_API}/installation/repositories",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                params={"per_page": 100},
            )
        if resp.status_code != 200:
            return []
        return resp.json().get("repositories", [])
    except Exception as exc:
        logger.error("Failed to list installation repos (%s): %s", installation_id, exc)
        return []


def invalidate(installation_id: int) -> None:
    _token_cache.pop(installation_id, None)
