"""Security helpers for invoking Node plugins without exposing credentials."""

import json
import re
from typing import Any, Dict, Iterable, List, Optional


GOOGLE_PLUGINS = frozenset({"google-analytics", "google-search-console"})
_GOOGLE_CREDENTIAL_OPTION_NAMES = frozenset({"accesstoken", "refreshtoken"})
_SENSITIVE_RESPONSE_FIELDS = frozenset(
    {"accesstoken", "refreshtoken", "authorization"}
)
_REDACTED = "[REDACTED]"


def _normalize_option_name(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def build_plugin_command(
    plugin: str,
    command: str,
    args: Iterable[object],
    options: Dict[str, Any],
) -> List[str]:
    """Build a plugin command while forbidding Google credentials in argv."""
    if plugin in GOOGLE_PLUGINS:
        forbidden = sorted(
            str(key)
            for key in options
            if _normalize_option_name(key) in _GOOGLE_CREDENTIAL_OPTION_NAMES
        )
        if forbidden:
            raise ValueError(
                "Google OAuth credentials must come from the stored connection, "
                "not plugin command options"
            )

    cmd = ["node", f"/app/plugins/{plugin}/index.js", command]
    cmd.extend(str(arg) for arg in args)
    for key, value in options.items():
        cmd.append(f"--{key}")
        if value is not None and value != "":
            cmd.append(str(value))
    return cmd


def build_google_credentials_stdin(
    access_token: Optional[str],
    refresh_token: Optional[str],
) -> Optional[str]:
    """Serialize stored Google credentials for the child process stdin pipe."""
    payload: Dict[str, str] = {}
    if access_token:
        payload["access_token"] = access_token
    if refresh_token:
        payload["refresh_token"] = refresh_token
    if not payload:
        return None
    return json.dumps(payload, separators=(",", ":"))


def redact_sensitive_text(
    value: object,
    secrets: Iterable[Optional[str]] = (),
) -> str:
    """Redact known credentials and common authorization formats from text."""
    text = str(value)
    for secret in secrets:
        if secret:
            text = text.replace(secret, _REDACTED)

    text = re.sub(
        r"(?i)(bearer\s+)[a-z0-9._~+/=-]+",
        rf"\1{_REDACTED}",
        text,
    )
    text = re.sub(
        r"(?i)(--(?:access[-_]?token|refresh[-_]?token)\s+)(\S+)",
        rf"\1{_REDACTED}",
        text,
    )
    return text


def redact_sensitive_data(
    value: Any,
    secrets: Iterable[Optional[str]] = (),
) -> Any:
    """Recursively sanitize plugin output before returning it to a caller."""
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if _normalize_option_name(key) in _SENSITIVE_RESPONSE_FIELDS:
                sanitized[key] = _REDACTED
            else:
                sanitized[key] = redact_sensitive_data(item, secrets)
        return sanitized
    if isinstance(value, list):
        return [redact_sensitive_data(item, secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive_data(item, secrets) for item in value)
    if isinstance(value, str):
        return redact_sensitive_text(value, secrets)
    return value
