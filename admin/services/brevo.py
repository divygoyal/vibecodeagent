"""Thin Brevo (transactional email) client.

Single entry point — `send_transactional()` — that talks to
https://api.brevo.com/v3/smtp/email. Used for the automated welcome
email today; the same wrapper handles any future template-driven send.

Failure mode: log + return False. Callers MUST treat email delivery as
best-effort and never let a Brevo outage break signup, user creation,
or any other primary flow.

Env vars required:
    BREVO_API_KEY          — the xkeysib-... transactional API key
    BREVO_SENDER_EMAIL     — verified sender address (e.g. hello@trafficclaw.com)
    BREVO_SENDER_NAME      — display name for the sender (default: "TrafficClaw")

Optional template IDs:
    BREVO_WELCOME_TEMPLATE_ID  — numeric ID of the welcome template in Brevo

Reference: https://developers.brevo.com/reference/sendtransacemail
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    return value if value else default


def is_configured() -> bool:
    """True iff BREVO_API_KEY + BREVO_SENDER_EMAIL are both set.

    Callers can guard themselves to avoid a noisy log line when Brevo
    is intentionally unconfigured (e.g. local dev, CI)."""
    return bool(_env("BREVO_API_KEY")) and bool(_env("BREVO_SENDER_EMAIL"))


def send_transactional(
    to_email: str,
    *,
    to_name: Optional[str] = None,
    template_id: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None,
    subject: Optional[str] = None,
    html_content: Optional[str] = None,
    timeout: float = 10.0,
) -> bool:
    """Send one transactional email via Brevo.

    Either `template_id` (preferred — template lives in Brevo dashboard)
    OR `subject` + `html_content` (inline HTML send) must be provided.

    Returns True on a 2xx Brevo response. False on any failure (missing
    config, network error, non-2xx). Always logs the failure context
    so it's visible in admin API logs."""

    api_key = _env("BREVO_API_KEY")
    sender_email = _env("BREVO_SENDER_EMAIL")
    sender_name = _env("BREVO_SENDER_NAME", "TrafficClaw")

    if not api_key or not sender_email:
        logger.warning("[brevo] skipped send to %s — BREVO_API_KEY or BREVO_SENDER_EMAIL not configured", to_email)
        return False

    if not template_id and not (subject and html_content):
        logger.error("[brevo] send_transactional called without template_id or (subject + html_content)")
        return False

    payload: Dict[str, Any] = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": to_email, "name": to_name} if to_name else {"email": to_email}],
    }
    if template_id is not None:
        payload["templateId"] = int(template_id)
        if params:
            payload["params"] = params
    else:
        payload["subject"] = subject
        payload["htmlContent"] = html_content

    try:
        res = requests.post(
            BREVO_API_URL,
            json=payload,
            headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        logger.error("[brevo] network error sending to %s: %s", to_email, exc)
        return False

    if 200 <= res.status_code < 300:
        message_id = ""
        try:
            message_id = (res.json() or {}).get("messageId", "")
        except ValueError:
            pass
        logger.info("[brevo] sent to %s (template_id=%s, messageId=%s)", to_email, template_id, message_id)
        return True

    body_preview = ""
    try:
        body_preview = res.text[:500] if res.text else ""
    except Exception:
        pass
    logger.error(
        "[brevo] non-2xx sending to %s — status=%s body=%s",
        to_email,
        res.status_code,
        body_preview,
    )
    return False
