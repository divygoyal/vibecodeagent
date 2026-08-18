"""
Migration 011 — Encrypt existing plaintext OAuth tokens in oauth_connections.

After the EncryptedToken TypeDecorator is wired into models.OAuthConnection,
new writes are encrypted automatically. This script handles the one-time
backfill of pre-existing plaintext rows.

Idempotent: rows whose tokens already look like Fernet ciphertext (start with
'gAAAA') are skipped. Re-running the script is safe.

Bypasses the ORM (uses raw SQL) so the TypeDecorator does not double-encrypt
or accidentally decrypt-then-overwrite a row whose ciphertext we cannot decode.

Pre-requisite: OAUTH_TOKEN_ENC_KEY must be set.
Run from admin/ directory:
    python -m migrations.encrypt_oauth_tokens
"""
from __future__ import annotations

import asyncio
import os
import sys

# Make admin/ importable when this file is run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from config import settings  # noqa: E402
from security.token_crypto import is_encrypted, load_fernet  # noqa: E402


async def run(engine=None) -> dict:
    """Run the migration. Returns a summary dict.

    Pass an existing AsyncEngine to reuse the admin's pool; if None, opens its
    own engine from settings.DATABASE_URL and disposes it before returning.
    """
    fernet = load_fernet()
    if fernet is None:
        return {"status": "skipped", "reason": "no encryption key available"}

    own_engine = engine is None
    if own_engine:
        engine = create_async_engine(settings.DATABASE_URL, echo=False)

    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT id, access_token, refresh_token, id_token "
                    "FROM oauth_connections"
                )
            )
            rows = result.all()

            encrypted_fields = 0
            updated_rows = 0

            for row_id, at, rt, it in rows:
                new_at = _encrypt_if_plaintext(fernet, at)
                new_rt = _encrypt_if_plaintext(fernet, rt)
                new_it = _encrypt_if_plaintext(fernet, it)

                if (new_at, new_rt, new_it) == (at, rt, it):
                    continue

                await conn.execute(
                    text(
                        "UPDATE oauth_connections "
                        "SET access_token = :at, "
                        "    refresh_token = :rt, "
                        "    id_token = :it "
                        "WHERE id = :id"
                    ),
                    {"at": new_at, "rt": new_rt, "it": new_it, "id": row_id},
                )
                updated_rows += 1
                for old, new in ((at, new_at), (rt, new_rt), (it, new_it)):
                    if old != new:
                        encrypted_fields += 1

            return {
                "status": "ok",
                "encrypted_fields": encrypted_fields,
                "updated_rows": updated_rows,
                "skipped_rows": len(rows) - updated_rows,
            }
    finally:
        if own_engine:
            await engine.dispose()


async def main() -> int:
    result = await run()
    if result.get("status") == "skipped":
        print(f"Migration skipped: {result.get('reason')}")
        return 1
    print(
        f"Encrypted {result['encrypted_fields']} field(s) across {result['updated_rows']} row(s); "
        f"{result['skipped_rows']} row(s) already encrypted or empty."
    )
    return 0


def _encrypt_if_plaintext(fernet, value):
    if not value:
        return value
    if is_encrypted(value):
        return value
    return fernet.encrypt(value.encode("utf-8")).decode("ascii")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
