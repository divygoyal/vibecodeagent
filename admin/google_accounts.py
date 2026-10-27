"""
Extra Google accounts ("Connect another Google account", Settings -> Google).

A user's sign-in identity stays their primary login. Extra Google accounts are
read-only DATA connections: rows in oauth_connections with provider 'google' and
account_role 'linked', keyed by the Google `sub`. They never resolve a user
(main.get_user_by_identifier and the POST /api/users upsert skip them), never go
to bot containers, and are never returned by GET /api/users/{id}/oauth/google
(that is the primary connection only). Migration: migrations/024_add_linked_google_accounts.sql.

Endpoints (admin X-API-Key, internal network only; the web app's server code
calls them, never the browser):

    GET    /api/users/{id}/google/connections      every Google connection, no tokens
                                                   (Settings list: email, status, counts, last sync)
    GET    /api/users/{id}/google/linked           linked connections WITH tokens (server-only
                                                   token routing, lib/googleAccounts.ts)
    PUT    /api/users/{id}/google/linked/{sub}     add or update one (link callback)
    PATCH  /api/users/{id}/google/linked/{sub}     status: connected | needs_reconnect
    DELETE /api/users/{id}/google/linked/{sub}     disconnect: delete the row (tokens gone) and hide
                                                   the portfolio rows listed from it (kept, not deleted)

Account deletion (user_delete.py) removes every oauth_connections row of the
user, linked ones included.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, text

from models import OAuthConnection

LINKED = "linked"
PRIMARY_ID = "primary"
MAX_LINKED = 10
STATUSES = ("connected", "needs_reconnect")

SCHEMA_STATEMENTS = (
    "ALTER TABLE oauth_connections ADD COLUMN account_role VARCHAR(20)",
    "ALTER TABLE oauth_connections ADD COLUMN account_email VARCHAR(255)",
    "ALTER TABLE oauth_connections ADD COLUMN account_name VARCHAR(255)",
    "ALTER TABLE oauth_connections ADD COLUMN status VARCHAR(30)",
    "CREATE INDEX IF NOT EXISTS ix_oauth_connections_user_provider ON oauth_connections(user_id, provider)",
)


def primary_only():
    """WHERE clause: the primary connection rows (everything that is not a linked extra account)."""
    return or_(OAuthConnection.account_role.is_(None), OAuthConnection.account_role != LINKED)


def has_token(value: Optional[str]) -> bool:
    return isinstance(value, str) and bool(value.strip())


async def ensure_google_accounts_schema(conn) -> None:
    """Add the linked-account columns to oauth_connections (idempotent, additive)."""
    for ddl in SCHEMA_STATEMENTS:
        try:
            await conn.execute(text(ddl))
        except Exception:
            pass  # column already there


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() + "Z" if isinstance(value, datetime) else str(value)


class LinkedUpsert(BaseModel):
    email: Optional[str] = Field(None, max_length=255)
    name: Optional[str] = Field(None, max_length=255)
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[int] = None
    scope: Optional[str] = Field(None, max_length=2000)


class LinkedPatch(BaseModel):
    status: str


def build_google_accounts_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/users", tags=["google-accounts"], dependencies=[Depends(verify_admin_key)])

    async def resolve_user(db, identifier: str):
        user = await get_user_by_identifier(db, identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    async def google_rows(db, user_id: int) -> List[OAuthConnection]:
        res = await db.execute(
            select(OAuthConnection)
            .where(OAuthConnection.user_id == user_id, OAuthConnection.provider == "google")
            .order_by(OAuthConnection.created_at, OAuthConnection.id)
        )
        return list(res.scalars().all())

    async def linked_row(db, user_id: int, sub: str) -> Optional[OAuthConnection]:
        res = await db.execute(select(OAuthConnection).where(
            OAuthConnection.user_id == user_id,
            OAuthConnection.provider == "google",
            OAuthConnection.account_role == LINKED,
            OAuthConnection.provider_account_id == sub,
        ))
        return res.scalars().first()

    async def asset_stats(db, user_id: int) -> Dict[str, Dict[str, Any]]:
        """Per connection id: GA4 / GSC rows listed from it and the newest sync, from the portfolio store."""
        out: Dict[str, Dict[str, Any]] = {}
        try:
            rows = (await db.execute(text(
                "SELECT COALESCE(connection_id, '') AS cid, asset_kind, COUNT(*), MAX(last_synced_at) "
                "FROM portfolio_assets WHERE user_id = :u AND missing = 0 AND COALESCE(disconnected, 0) = 0 "
                "GROUP BY COALESCE(connection_id, ''), asset_kind"
            ), {"u": user_id})).fetchall()
        except Exception:
            return out  # older database without the portfolio tables
        for cid, kind, count, last in rows:
            s = out.setdefault(cid or PRIMARY_ID, {"ga4": 0, "gsc": 0, "last_synced_at": None})
            s[kind] = int(count or 0)
            if last and (s["last_synced_at"] is None or last > s["last_synced_at"]):
                s["last_synced_at"] = int(last)
        return out

    def describe(row: OAuthConnection, primary: bool, stats: Dict[str, Dict[str, Any]], user=None) -> Dict[str, Any]:
        cid = PRIMARY_ID if primary else row.provider_account_id
        s = stats.get(cid, {"ga4": 0, "gsc": 0, "last_synced_at": None})
        connected = has_token(row.refresh_token) or has_token(row.access_token)
        status = row.status if row.status in STATUSES else "connected"
        if not connected:
            status = "needs_reconnect"
        return {
            "connection_id": cid,
            "sub": row.provider_account_id,
            "primary": primary,
            "email": row.account_email or (user.email if primary and user is not None else None),
            "name": row.account_name,
            "status": status,
            "has_refresh_token": has_token(row.refresh_token),
            "ga4_count": s["ga4"],
            "gsc_count": s["gsc"],
            "last_synced_at": s["last_synced_at"],
            "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at),
        }

    @router.get("/{identifier}/google/connections")
    async def list_connections(identifier: str, db=Depends(get_db)):
        user = await resolve_user(db, identifier)
        rows = await google_rows(db, user.id)
        stats = await asset_stats(db, user.id)
        primary = next((r for r in rows if r.account_role != LINKED), None)
        out = []
        if primary is not None:
            out.append(describe(primary, True, stats, user))
        out.extend(describe(r, False, stats) for r in rows if r.account_role == LINKED)
        return {"connections": out, "max_linked": MAX_LINKED}

    @router.get("/{identifier}/google/linked")
    async def list_linked(identifier: str, db=Depends(get_db)):
        """Linked connections with their tokens. Server-to-server only (same trust as /oauth/google)."""
        user = await resolve_user(db, identifier)
        rows = [r for r in await google_rows(db, user.id) if r.account_role == LINKED]
        return {"linked": [{
            "sub": r.provider_account_id,
            "email": r.account_email,
            "name": r.account_name,
            "status": r.status if r.status in STATUSES else "connected",
            "access_token": r.access_token,
            "refresh_token": r.refresh_token,
            "scope": r.scope,
            "created_at": _iso(r.created_at),
        } for r in rows]}

    @router.put("/{identifier}/google/linked/{sub}")
    async def upsert_linked(identifier: str, sub: str, body: LinkedUpsert, db=Depends(get_db)):
        sub = (sub or "").strip()
        if not sub or len(sub) > 255:
            raise HTTPException(status_code=422, detail="Bad Google account id")
        user = await resolve_user(db, identifier)
        rows = await google_rows(db, user.id)
        primary = next((r for r in rows if r.account_role != LINKED), None)
        if primary is not None and primary.provider_account_id == sub:
            raise HTTPException(status_code=409, detail="same_as_primary")
        # A GitHub-signed-in user's own primary identity can be the same Google id too.
        if user.github_id == sub:
            raise HTTPException(status_code=409, detail="same_as_primary")
        existing = await linked_row(db, user.id, sub)
        now = datetime.utcnow()
        if existing is None:
            if sum(1 for r in rows if r.account_role == LINKED) >= MAX_LINKED:
                raise HTTPException(status_code=409, detail="limit")
            if not has_token(body.refresh_token):
                raise HTTPException(status_code=422, detail="refresh_token required for a new connection")
            row = OAuthConnection(
                user_id=user.id, provider="google", provider_account_id=sub, account_role=LINKED,
                account_email=body.email, account_name=body.name, status="connected",
                access_token=body.access_token or "", refresh_token=body.refresh_token,
                expires_at=body.expires_at, scope=body.scope, token_type="bearer",
                created_at=now, updated_at=now,
            )
            db.add(row)
            created = True
        else:
            row = existing
            # Never replace a stored token with an empty one.
            if has_token(body.access_token):
                row.access_token = body.access_token
            if has_token(body.refresh_token):
                row.refresh_token = body.refresh_token
            if body.expires_at:
                row.expires_at = body.expires_at
            if body.scope:
                row.scope = body.scope
            if body.email:
                row.account_email = body.email
            if body.name:
                row.account_name = body.name
            row.status = "connected"
            row.updated_at = now
            created = False
        await db.commit()
        await db.refresh(row)
        return {"created": created, "connection": describe(row, False, await asset_stats(db, user.id))}

    @router.patch("/{identifier}/google/linked/{sub}")
    async def patch_linked(identifier: str, sub: str, body: LinkedPatch, db=Depends(get_db)):
        if body.status not in STATUSES:
            raise HTTPException(status_code=422, detail="Bad status")
        user = await resolve_user(db, identifier)
        row = await linked_row(db, user.id, sub)
        if row is None:
            raise HTTPException(status_code=404, detail="No such linked account")
        if row.status != body.status:
            row.status = body.status
            row.updated_at = datetime.utcnow()
            await db.commit()
        return {"ok": True, "status": body.status}

    @router.delete("/{identifier}/google/linked/{sub}")
    async def delete_linked(identifier: str, sub: str, db=Depends(get_db)):
        user = await resolve_user(db, identifier)
        row = await linked_row(db, user.id, sub)
        if row is None:
            raise HTTPException(status_code=404, detail="No such linked account")
        await db.delete(row)
        hidden = 0
        try:
            res = await db.execute(text(
                "UPDATE portfolio_assets SET disconnected = 1, updated_at = :now "
                "WHERE user_id = :u AND connection_id = :c AND COALESCE(disconnected, 0) = 0"
            ), {"u": user.id, "c": sub, "now": int(time.time())})
            hidden = int(res.rowcount or 0)
        except Exception:
            pass  # no portfolio tables yet
        await db.commit()
        return {"deleted": True, "hidden_assets": hidden}

    return router
