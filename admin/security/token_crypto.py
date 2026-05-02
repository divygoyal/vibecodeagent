"""
Encryption-at-rest for OAuth tokens stored in the admin SQLite database.

Tokens (access_token, refresh_token, id_token on OAuthConnection) are wrapped in a
SQLAlchemy TypeDecorator so every read transparently decrypts and every write
transparently encrypts. Existing call sites continue to read and write plaintext —
no application code changes required.

Key: OAUTH_TOKEN_ENC_KEY env var, a Fernet key (32 url-safe base64-encoded bytes).
Generate with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Dev fallback: if the env var is unset, encryption is a no-op and a warning is
logged once at startup. This preserves backward compatibility with existing
dev environments that have no key configured. Production deployments MUST set
the key.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import Text, TypeDecorator

logger = logging.getLogger(__name__)

_FERNET: Optional[Fernet] = None
_KEY_SOURCE_LOGGED = False


def _derive_key_from_admin_secret() -> Optional[bytes]:
    """Deterministically derive a Fernet key from ADMIN_API_KEY.

    Lets the encryption-at-rest layer work without operators having to add
    a second secret — as long as ADMIN_API_KEY is stable, the derived key
    is stable too. Anyone rotating ADMIN_API_KEY must re-encrypt by setting
    OAUTH_TOKEN_ENC_KEY to the previous derived value first.
    """
    secret = os.environ.get("ADMIN_API_KEY", "").strip()
    if not secret or secret == "change-this-in-production":
        return None
    digest = hashlib.sha256(("oauth-token-enc:" + secret).encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def load_fernet() -> Optional[Fernet]:
    """Return a cached Fernet instance, or None if no key can be obtained."""
    global _FERNET, _KEY_SOURCE_LOGGED
    if _FERNET is not None:
        return _FERNET

    explicit = os.environ.get("OAUTH_TOKEN_ENC_KEY", "").strip()
    key_bytes: Optional[bytes] = None
    source = ""

    if explicit:
        key_bytes = explicit.encode() if isinstance(explicit, str) else explicit
        source = "OAUTH_TOKEN_ENC_KEY"
    else:
        derived = _derive_key_from_admin_secret()
        if derived:
            key_bytes = derived
            source = "derived-from-ADMIN_API_KEY"

    if key_bytes is None:
        if not _KEY_SOURCE_LOGGED:
            logger.warning(
                "No OAUTH_TOKEN_ENC_KEY and no usable ADMIN_API_KEY — OAuth tokens "
                "will be stored as plaintext. Set ADMIN_API_KEY (or OAUTH_TOKEN_ENC_KEY) to enable encryption."
            )
            _KEY_SOURCE_LOGGED = True
        return None

    try:
        _FERNET = Fernet(key_bytes)
        if not _KEY_SOURCE_LOGGED:
            logger.info("OAuth token encryption active (key source: %s).", source)
            _KEY_SOURCE_LOGGED = True
        return _FERNET
    except Exception as exc:
        logger.error(
            "Failed to load Fernet key from %s (%s). Falling back to plaintext storage.",
            source, exc,
        )
        return None


def is_encrypted(value: object) -> bool:
    """Heuristic: Fernet ciphertext begins with 'gAAAA' (version byte 0x80 in base64)."""
    return isinstance(value, str) and value.startswith("gAAAA")


class EncryptedToken(TypeDecorator):
    """SQLAlchemy column type that encrypts on bind and decrypts on result.

    Idempotent on writes: if the value is already a Fernet ciphertext it is left as-is,
    so re-saving an unchanged row does not re-encrypt and produce a new ciphertext.

    Tolerant on reads: legacy plaintext rows pass through unchanged, so a deployment
    can enable encryption before the data migration has run.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None or value == "":
            return value
        f = load_fernet()
        if f is None:
            return value
        if is_encrypted(value):
            return value
        return f.encrypt(value.encode("utf-8")).decode("ascii")

    def process_result_value(self, value, dialect):
        if value is None or value == "":
            return value
        f = load_fernet()
        if f is None:
            return value
        if not is_encrypted(value):
            return value
        try:
            return f.decrypt(value.encode("ascii")).decode("utf-8")
        except InvalidToken:
            logger.warning(
                "Failed to decrypt an OAuth token (key mismatch or corrupted ciphertext). "
                "Returning empty string so the user is forced to reconnect."
            )
            return ""
