"""
Storage endpoints for the hosted MCP server (Connect AI).

The web app is the OAuth authorization server and the MCP resource server.
This module only stores what it decides: clients, grants, single-use codes,
access/refresh tokens, personal API keys, an audit log and pairing overrides.

Every secret arrives here already hashed (SHA-256 hex, computed in Next.js),
so neither this service nor its logs ever see a raw token. All endpoints sit
behind the admin X-API-Key and are meant for the internal network only.

Wiring (main.py):
    from mcp_api import build_mcp_router, ensure_mcp_schema, delete_user_mcp_rows
    app.include_router(build_mcp_router(get_db, verify_admin_key, get_user_by_identifier))
    await ensure_mcp_schema(conn)  # inside init_db()
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Callable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

MIGRATION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations", "019_add_mcp_oauth.sql")

# Limits mirrored from MCP.md section 4.4 / 4.6.
MAX_ACTIVE_API_KEYS = 5
REFRESH_REUSE_GRACE_S = 10
LAST_USED_THROTTLE_S = 60
AUDIT_RETENTION_S = 30 * 86400
PURGE_INTERVAL_S = 3600

_last_purge = 0.0


def _now() -> int:
    return int(time.time())


def _schema_statements() -> List[str]:
    with open(MIGRATION_FILE, "r", encoding="utf-8") as fh:
        raw = fh.read()
    lines = [ln for ln in raw.splitlines() if not ln.strip().startswith("--")]
    return [s.strip() for s in "\n".join(lines).split(";") if s.strip()]


async def ensure_mcp_schema(conn) -> None:
    """Create the mcp_* tables if missing (idempotent, additive)."""
    for ddl in _schema_statements():
        try:
            await conn.execute(text(ddl))
        except Exception as exc:  # pragma: no cover - logged, never fatal
            print(f"[startup] mcp DDL skipped: {type(exc).__name__}: {exc}")


async def delete_user_mcp_rows(db, user_id: int) -> None:
    """Remove every mcp_* row of a user (called from DELETE /api/users/{id})."""
    for table in ("mcp_tokens", "mcp_auth_codes", "mcp_grants", "mcp_audit", "mcp_site_links"):
        await db.execute(text(f"DELETE FROM {table} WHERE user_id = :u"), {"u": user_id})


def _row(r) -> dict:
    return dict(r._mapping) if r is not None else None


def _json_list(value: Optional[str]) -> Optional[list]:
    if value is None or value == "":
        return None
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else None
    except Exception:
        return None


def _dump_list(value: Optional[list]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps([str(v) for v in value][:200])


# ───────────────────────── request bodies ─────────────────────────

class ClientUpsert(BaseModel):
    client_id: str = Field(..., max_length=600)
    kind: str
    client_name: Optional[str] = Field(None, max_length=120)
    client_uri: Optional[str] = Field(None, max_length=600)
    redirect_uris: List[str]
    token_endpoint_auth_method: str = "none"
    secret_hash: Optional[str] = None
    grant_types: List[str] = ["authorization_code", "refresh_token"]
    scope: Optional[str] = None
    application_type: Optional[str] = None
    software_id: Optional[str] = None
    doc_etag: Optional[str] = None
    doc_fetched_at: Optional[int] = None
    doc_expires_at: Optional[int] = None
    created_ip_hash: Optional[str] = None


class GrantUpsert(BaseModel):
    user: Optional[str] = None  # session identifier; None = anonymous demo grant
    client_id: str
    client_name: Optional[str] = None
    client_host: Optional[str] = None
    redirect_host: Optional[str] = None
    verified: bool = False
    scope: str
    site_filter: Optional[List[str]] = None
    exclude_queries: bool = False
    demo: bool = False


class GrantPatch(BaseModel):
    user: str
    exclude_queries: Optional[bool] = None
    site_filter: Optional[List[str]] = None
    clear_site_filter: bool = False


class CodeCreate(BaseModel):
    code_hash: str
    client_id: str
    user_id: int
    grant_id: int
    redirect_uri: str
    code_challenge: str
    scope: str
    resource: str
    ttl_s: int = 60


class CodeConsume(BaseModel):
    code_hash: str
    client_id: str


class TokenIssue(BaseModel):
    grant_id: int
    client_id: str
    scope: str
    audience: str
    access_hash: str
    access_ttl_s: int = 3600
    refresh_hash: Optional[str] = None
    refresh_ttl_s: int = 30 * 86400
    family_ttl_s: int = 180 * 86400
    source_code_hash: Optional[str] = None


class TokenRefresh(BaseModel):
    refresh_hash: str
    client_id: str
    new_access_hash: str
    new_refresh_hash: str
    access_ttl_s: int = 3600
    refresh_ttl_s: int = 30 * 86400


class TokenRevoke(BaseModel):
    hash: str
    client_id: Optional[str] = None


class ApiKeyCreate(BaseModel):
    token_hash: str
    prefix: str = Field(..., max_length=16)
    name: str = Field("API key", max_length=60)
    expires_in_days: int = 90
    site_filter: Optional[List[str]] = None
    exclude_queries: bool = False
    audience: str


class AuditRow(BaseModel):
    ts: int
    user_id: int
    grant_id: Optional[int] = None
    token_id: Optional[int] = None
    client_id: Optional[str] = None
    tool: str = Field(..., max_length=64)
    site_host: Optional[str] = Field(None, max_length=255)
    status: str = Field(..., max_length=64)
    duration_ms: Optional[int] = None
    rows: Optional[int] = None
    cache_hit: Optional[bool] = None
    google_calls: Optional[int] = None
    ip_prefix: Optional[str] = Field(None, max_length=64)


class AuditBatch(BaseModel):
    rows: List[AuditRow]


class SiteLink(BaseModel):
    site_id: str
    ga4_property: Optional[str] = None
    gsc_property: Optional[str] = None


class SiteLinksPut(BaseModel):
    links: List[SiteLink]


# ───────────────────────── router ─────────────────────────

def build_mcp_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/mcp", tags=["mcp"], dependencies=[Depends(verify_admin_key)])

    async def resolve_user_id(db, identifier: str) -> int:
        user = await get_user_by_identifier(db, identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return int(user.id)

    async def revoke_where(db, where: str, params: dict) -> List[str]:
        now = _now()
        res = await db.execute(
            text(f"UPDATE mcp_tokens SET revoked_at = :now WHERE revoked_at IS NULL AND ({where}) RETURNING token_hash"),
            {"now": now, **params},
        )
        return [r[0] for r in res.fetchall()]

    async def revoke_grant(db, grant_id: int) -> List[str]:
        await db.execute(
            text("UPDATE mcp_grants SET revoked_at = :now WHERE id = :g AND revoked_at IS NULL"),
            {"now": _now(), "g": grant_id},
        )
        hashes = await revoke_where(db, "grant_id = :g", {"g": grant_id})
        await db.execute(text("UPDATE mcp_auth_codes SET consumed_at = COALESCE(consumed_at, :now) WHERE grant_id = :g"), {"now": _now(), "g": grant_id})
        return hashes

    async def maybe_purge(db) -> None:
        global _last_purge
        if time.time() - _last_purge < PURGE_INTERVAL_S:
            return
        _last_purge = time.time()
        await purge(db)

    async def purge(db) -> dict:
        now = _now()
        week = 7 * 86400
        out = {}
        out["tokens"] = (await db.execute(text("DELETE FROM mcp_tokens WHERE (expires_at < :t) OR (revoked_at IS NOT NULL AND revoked_at < :t)"), {"t": now - week})).rowcount
        out["codes"] = (await db.execute(text("DELETE FROM mcp_auth_codes WHERE expires_at < :t"), {"t": now - 3600})).rowcount
        out["audit"] = (await db.execute(text("DELETE FROM mcp_audit WHERE ts < :t"), {"t": now - AUDIT_RETENTION_S})).rowcount
        out["clients"] = (await db.execute(text(
            "DELETE FROM mcp_oauth_clients WHERE kind = 'dcr' AND created_at < :t "
            "AND client_id NOT IN (SELECT client_id FROM mcp_grants WHERE revoked_at IS NULL)"
        ), {"t": now - week})).rowcount
        out["demo_grants"] = (await db.execute(text(
            "DELETE FROM mcp_grants WHERE user_id = 0 AND (revoked_at IS NOT NULL OR id NOT IN "
            "(SELECT grant_id FROM mcp_tokens WHERE grant_id IS NOT NULL AND revoked_at IS NULL AND expires_at > :now)) "
            "AND created_at < :t"
        ), {"t": now - week, "now": now})).rowcount
        await db.commit()
        return out

    # ── clients ──
    @router.post("/clients")
    async def upsert_client(body: ClientUpsert, db=Depends(get_db)):
        if body.kind not in ("dcr", "cimd"):
            raise HTTPException(status_code=400, detail="kind must be dcr or cimd")
        now = _now()
        await db.execute(text(
            """
            INSERT INTO mcp_oauth_clients (client_id, kind, client_name, client_uri, redirect_uris,
                token_endpoint_auth_method, secret_hash, grant_types, scope, application_type, software_id,
                doc_etag, doc_fetched_at, doc_expires_at, created_ip_hash, created_at)
            VALUES (:client_id, :kind, :client_name, :client_uri, :redirect_uris, :method, :secret_hash,
                :grant_types, :scope, :application_type, :software_id, :doc_etag, :doc_fetched_at,
                :doc_expires_at, :created_ip_hash, :now)
            ON CONFLICT(client_id) DO UPDATE SET
                client_name = excluded.client_name, client_uri = excluded.client_uri,
                redirect_uris = excluded.redirect_uris, token_endpoint_auth_method = excluded.token_endpoint_auth_method,
                grant_types = excluded.grant_types, scope = excluded.scope,
                application_type = excluded.application_type, software_id = excluded.software_id,
                doc_etag = excluded.doc_etag, doc_fetched_at = excluded.doc_fetched_at,
                doc_expires_at = excluded.doc_expires_at
            """
        ), {
            "client_id": body.client_id, "kind": body.kind, "client_name": body.client_name,
            "client_uri": body.client_uri, "redirect_uris": json.dumps(body.redirect_uris[:10]),
            "method": body.token_endpoint_auth_method, "secret_hash": body.secret_hash,
            "grant_types": json.dumps(body.grant_types[:5]), "scope": body.scope,
            "application_type": body.application_type, "software_id": body.software_id,
            "doc_etag": body.doc_etag, "doc_fetched_at": body.doc_fetched_at,
            "doc_expires_at": body.doc_expires_at, "created_ip_hash": body.created_ip_hash, "now": now,
        })
        await db.commit()
        return {"client_id": body.client_id, "created_at": now}

    @router.get("/clients")
    async def get_client(client_id: str = Query(..., max_length=600), db=Depends(get_db)):
        r = (await db.execute(text("SELECT * FROM mcp_oauth_clients WHERE client_id = :c"), {"c": client_id})).first()
        if not r or r._mapping["revoked_at"]:
            raise HTTPException(status_code=404, detail="Client not found")
        row = _row(r)
        row["redirect_uris"] = _json_list(row["redirect_uris"]) or []
        row["grant_types"] = _json_list(row["grant_types"]) or []
        return row

    @router.get("/clients/count-recent")
    async def count_recent_clients(since: int, db=Depends(get_db)):
        n = (await db.execute(text("SELECT COUNT(*) FROM mcp_oauth_clients WHERE kind = 'dcr' AND created_at >= :s"), {"s": since})).scalar()
        return {"count": int(n or 0)}

    # ── grants ──
    @router.post("/grants")
    async def upsert_grant(body: GrantUpsert, db=Depends(get_db)):
        now = _now()
        params = {
            "client_id": body.client_id, "client_name": body.client_name, "client_host": body.client_host,
            "redirect_host": body.redirect_host, "verified": 1 if body.verified else 0, "scope": body.scope,
            "site_filter": _dump_list(body.site_filter), "eq": 1 if body.exclude_queries else 0,
            "demo": 1 if body.demo else 0, "now": now,
        }
        if body.user is None:
            if not body.demo:
                raise HTTPException(status_code=400, detail="Anonymous grants must be demo grants")
            res = await db.execute(text(
                """
                INSERT INTO mcp_grants (user_id, client_id, client_name, client_host, redirect_host, verified,
                    scope, site_filter, exclude_queries, demo, created_at)
                VALUES (0, :client_id, :client_name, :client_host, :redirect_host, :verified, :scope,
                    NULL, 0, 1, :now) RETURNING id
                """
            ), params)
            grant_id = res.scalar()
            await db.commit()
            return {"id": grant_id, "user_id": 0}

        user_id = await resolve_user_id(db, body.user)
        params["u"] = user_id
        existing = (await db.execute(text("SELECT id, revoked_at FROM mcp_grants WHERE user_id = :u AND client_id = :client_id"), params)).first()
        if existing:
            gid = existing._mapping["id"]
            if existing._mapping["revoked_at"] is not None:
                # A fresh approval after a revoke starts clean: old tokens stay revoked.
                await db.execute(text("UPDATE mcp_grants SET created_at = :now, last_used_at = NULL WHERE id = :g"), {"now": now, "g": gid})
            await db.execute(text(
                """
                UPDATE mcp_grants SET client_name = :client_name, client_host = :client_host,
                    redirect_host = :redirect_host, verified = :verified, scope = :scope,
                    site_filter = :site_filter, exclude_queries = :eq, demo = :demo, revoked_at = NULL
                WHERE id = :g
                """
            ), {**params, "g": gid})
            await db.commit()
            return {"id": gid, "user_id": user_id}
        res = await db.execute(text(
            """
            INSERT INTO mcp_grants (user_id, client_id, client_name, client_host, redirect_host, verified,
                scope, site_filter, exclude_queries, demo, created_at)
            VALUES (:u, :client_id, :client_name, :client_host, :redirect_host, :verified, :scope,
                :site_filter, :eq, :demo, :now) RETURNING id
            """
        ), params)
        gid = res.scalar()
        await db.commit()
        return {"id": gid, "user_id": user_id}

    @router.get("/grants/active")
    async def find_active_grant(user: str, client_id: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, user)
        r = (await db.execute(text(
            "SELECT * FROM mcp_grants WHERE user_id = :u AND client_id = :c AND revoked_at IS NULL"
        ), {"u": user_id, "c": client_id})).first()
        if not r:
            raise HTTPException(status_code=404, detail="No active grant")
        row = _row(r)
        row["site_filter"] = _json_list(row["site_filter"])
        return row

    @router.get("/users/{identifier}/grants")
    async def list_grants(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        since = _now() - 30 * 86400
        rows = (await db.execute(text(
            """
            SELECT g.*, (SELECT COUNT(*) FROM mcp_audit a WHERE a.grant_id = g.id AND a.ts >= :since) AS calls_30d
            FROM mcp_grants g WHERE g.user_id = :u AND g.revoked_at IS NULL ORDER BY COALESCE(g.last_used_at, g.created_at) DESC
            """
        ), {"u": user_id, "since": since})).fetchall()
        out = []
        for r in rows:
            row = _row(r)
            row["site_filter"] = _json_list(row["site_filter"])
            out.append(row)
        return {"grants": out}

    @router.patch("/grants/{grant_id}")
    async def patch_grant(grant_id: int, body: GrantPatch, db=Depends(get_db)):
        user_id = await resolve_user_id(db, body.user)
        r = (await db.execute(text("SELECT id FROM mcp_grants WHERE id = :g AND user_id = :u AND revoked_at IS NULL"), {"g": grant_id, "u": user_id})).first()
        if not r:
            raise HTTPException(status_code=404, detail="Grant not found")
        if body.exclude_queries is not None:
            await db.execute(text("UPDATE mcp_grants SET exclude_queries = :v WHERE id = :g"), {"v": 1 if body.exclude_queries else 0, "g": grant_id})
        if body.clear_site_filter:
            await db.execute(text("UPDATE mcp_grants SET site_filter = NULL WHERE id = :g"), {"g": grant_id})
        elif body.site_filter is not None:
            await db.execute(text("UPDATE mcp_grants SET site_filter = :v WHERE id = :g"), {"v": _dump_list(body.site_filter), "g": grant_id})
        await db.commit()
        return {"ok": True}

    @router.delete("/grants/{grant_id}")
    async def delete_grant(grant_id: int, user: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, user)
        r = (await db.execute(text("SELECT id FROM mcp_grants WHERE id = :g AND user_id = :u"), {"g": grant_id, "u": user_id})).first()
        if not r:
            raise HTTPException(status_code=404, detail="Grant not found")
        hashes = await revoke_grant(db, grant_id)
        await db.commit()
        return {"revoked": True, "revoked_hashes": hashes}

    @router.post("/users/{identifier}/revoke-all")
    async def revoke_all(identifier: str, include_keys: bool = False, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        grants = (await db.execute(text("SELECT id FROM mcp_grants WHERE user_id = :u AND revoked_at IS NULL"), {"u": user_id})).fetchall()
        hashes: List[str] = []
        for g in grants:
            hashes += await revoke_grant(db, g[0])
        if include_keys:
            hashes += await revoke_where(db, "user_id = :u AND kind = 'api_key'", {"u": user_id})
        await db.commit()
        return {"revoked_grants": len(grants), "revoked_hashes": hashes}

    # ── authorization codes ──
    @router.post("/codes")
    async def create_code(body: CodeCreate, db=Depends(get_db)):
        await db.execute(text(
            """
            INSERT INTO mcp_auth_codes (code_hash, client_id, user_id, grant_id, redirect_uri, code_challenge,
                scope, resource, expires_at)
            VALUES (:h, :c, :u, :g, :r, :ch, :s, :res, :exp)
            """
        ), {"h": body.code_hash, "c": body.client_id, "u": body.user_id, "g": body.grant_id,
            "r": body.redirect_uri, "ch": body.code_challenge, "s": body.scope, "res": body.resource,
            "exp": _now() + max(10, min(body.ttl_s, 600))})
        await db.commit()
        return {"ok": True}

    @router.post("/codes/consume")
    async def consume_code(body: CodeConsume, db=Depends(get_db)):
        now = _now()
        r = (await db.execute(text(
            """
            UPDATE mcp_auth_codes SET consumed_at = :now
            WHERE code_hash = :h AND client_id = :c AND consumed_at IS NULL AND expires_at > :now
            RETURNING *
            """
        ), {"now": now, "h": body.code_hash, "c": body.client_id})).first()
        if r:
            row = _row(r)
            grant = (await db.execute(text("SELECT revoked_at FROM mcp_grants WHERE id = :g"), {"g": row["grant_id"]})).first()
            await db.commit()
            if not grant or grant[0] is not None:
                return {"ok": False, "error": "invalid_grant", "reason": "grant_revoked"}
            return {"ok": True, "code": row}
        # Not consumable: a second use of a real code revokes what the first use minted.
        prior = (await db.execute(text("SELECT consumed_at FROM mcp_auth_codes WHERE code_hash = :h"), {"h": body.code_hash})).first()
        hashes: List[str] = []
        reused = bool(prior and prior[0] is not None)
        if reused:
            hashes = await revoke_where(db, "source_code_hash = :h OR family_id IN (SELECT family_id FROM mcp_tokens WHERE source_code_hash = :h)", {"h": body.code_hash})
        await db.commit()
        return {"ok": False, "error": "invalid_grant", "reason": "reused" if reused else "unknown_or_expired", "revoked_hashes": hashes}

    # ── tokens ──
    async def insert_token(db, *, token_hash: str, kind: str, family_id: Optional[str], grant_id: Optional[int],
                           user_id: int, client_id: Optional[str], scope: str, audience: str, expires_at: int,
                           family_expires_at: Optional[int] = None, source_code_hash: Optional[str] = None,
                           name: Optional[str] = None, prefix: Optional[str] = None, site_filter: Optional[str] = None,
                           exclude_queries: int = 0) -> int:
        res = await db.execute(text(
            """
            INSERT INTO mcp_tokens (token_hash, kind, family_id, grant_id, user_id, client_id, scope, audience,
                name, prefix, site_filter, exclude_queries, source_code_hash, created_at, expires_at, family_expires_at)
            VALUES (:h, :k, :f, :g, :u, :c, :s, :a, :n, :p, :sf, :eq, :sch, :now, :exp, :fexp) RETURNING id
            """
        ), {"h": token_hash, "k": kind, "f": family_id, "g": grant_id, "u": user_id, "c": client_id, "s": scope,
            "a": audience, "n": name, "p": prefix, "sf": site_filter, "eq": exclude_queries, "sch": source_code_hash,
            "now": _now(), "exp": expires_at, "fexp": family_expires_at})
        return int(res.scalar())

    @router.post("/tokens/issue")
    async def issue_tokens(body: TokenIssue, db=Depends(get_db)):
        g = (await db.execute(text("SELECT * FROM mcp_grants WHERE id = :g AND revoked_at IS NULL"), {"g": body.grant_id})).first()
        if not g:
            raise HTTPException(status_code=409, detail="Grant revoked")
        grant = _row(g)
        if grant["client_id"] != body.client_id:
            raise HTTPException(status_code=409, detail="Client mismatch")
        now = _now()
        family = uuid.uuid4().hex
        family_exp = now + body.family_ttl_s
        await insert_token(db, token_hash=body.access_hash, kind="access", family_id=family, grant_id=body.grant_id,
                           user_id=grant["user_id"], client_id=body.client_id, scope=body.scope, audience=body.audience,
                           expires_at=now + body.access_ttl_s, source_code_hash=body.source_code_hash)
        refresh_exp = None
        if body.refresh_hash:
            refresh_exp = min(now + body.refresh_ttl_s, family_exp)
            await insert_token(db, token_hash=body.refresh_hash, kind="refresh", family_id=family, grant_id=body.grant_id,
                               user_id=grant["user_id"], client_id=body.client_id, scope=body.scope, audience=body.audience,
                               expires_at=refresh_exp, family_expires_at=family_exp, source_code_hash=body.source_code_hash)
        await db.execute(text("UPDATE mcp_oauth_clients SET last_used_at = :now WHERE client_id = :c"), {"now": now, "c": body.client_id})
        await db.commit()
        return {"ok": True, "family_id": family, "access_expires_at": now + body.access_ttl_s, "refresh_expires_at": refresh_exp}

    @router.post("/tokens/refresh")
    async def refresh_tokens(body: TokenRefresh, db=Depends(get_db)):
        now = _now()
        r = (await db.execute(text("SELECT * FROM mcp_tokens WHERE token_hash = :h AND kind = 'refresh'"), {"h": body.refresh_hash})).first()
        if not r:
            return {"ok": False, "error": "invalid_grant", "reason": "unknown"}
        tok = _row(r)
        if tok["client_id"] != body.client_id:
            return {"ok": False, "error": "invalid_grant", "reason": "client_mismatch"}
        if tok["revoked_at"] is not None:
            return {"ok": False, "error": "invalid_grant", "reason": "revoked"}
        if tok["used_at"] is not None:
            if now - int(tok["used_at"]) > REFRESH_REUSE_GRACE_S:
                hashes = await revoke_where(db, "family_id = :f", {"f": tok["family_id"]})
                if tok["grant_id"]:
                    hashes += await revoke_grant(db, int(tok["grant_id"]))
                await db.commit()
                return {"ok": False, "error": "invalid_grant", "reason": "reuse_detected", "revoked_hashes": hashes}
            return {"ok": False, "error": "invalid_grant", "reason": "already_used"}
        if tok["expires_at"] <= now or (tok["family_expires_at"] and tok["family_expires_at"] <= now):
            return {"ok": False, "error": "invalid_grant", "reason": "expired"}
        g = (await db.execute(text("SELECT * FROM mcp_grants WHERE id = :g AND revoked_at IS NULL"), {"g": tok["grant_id"]})).first()
        if not g:
            return {"ok": False, "error": "invalid_grant", "reason": "grant_revoked"}
        won = (await db.execute(text(
            "UPDATE mcp_tokens SET used_at = :now WHERE id = :id AND used_at IS NULL AND revoked_at IS NULL RETURNING id"
        ), {"now": now, "id": tok["id"]})).first()
        if not won:
            await db.commit()
            return {"ok": False, "error": "invalid_grant", "reason": "already_used"}
        family_exp = int(tok["family_expires_at"] or (now + body.refresh_ttl_s))
        refresh_exp = min(now + body.refresh_ttl_s, family_exp)
        await insert_token(db, token_hash=body.new_access_hash, kind="access", family_id=tok["family_id"], grant_id=tok["grant_id"],
                           user_id=tok["user_id"], client_id=tok["client_id"], scope=tok["scope"], audience=tok["audience"],
                           expires_at=now + body.access_ttl_s)
        await insert_token(db, token_hash=body.new_refresh_hash, kind="refresh", family_id=tok["family_id"], grant_id=tok["grant_id"],
                           user_id=tok["user_id"], client_id=tok["client_id"], scope=tok["scope"], audience=tok["audience"],
                           expires_at=refresh_exp, family_expires_at=family_exp)
        await db.commit()
        return {"ok": True, "scope": tok["scope"], "audience": tok["audience"], "refresh_expires_at": refresh_exp}

    @router.get("/tokens/lookup")
    async def lookup_token(hash: str = Query(..., min_length=32, max_length=128), db=Depends(get_db)):
        now = _now()
        r = (await db.execute(text(
            """
            SELECT t.id, t.kind, t.grant_id, t.user_id, t.client_id, t.scope, t.audience, t.expires_at, t.revoked_at,
                   t.last_used_at, t.site_filter AS key_site_filter, t.exclude_queries AS key_exclude_queries, t.name,
                   g.revoked_at AS grant_revoked_at, g.site_filter AS grant_site_filter,
                   g.exclude_queries AS grant_exclude_queries, g.demo, g.client_name, g.client_host,
                   u.github_id AS user_identifier
            FROM mcp_tokens t
            LEFT JOIN mcp_grants g ON g.id = t.grant_id
            LEFT JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = :h AND t.kind IN ('access', 'api_key')
            """
        ), {"h": hash})).first()
        if not r:
            return {"active": False, "reason": "unknown"}
        row = _row(r)
        reason = None
        if row["revoked_at"] is not None:
            reason = "revoked"
        elif row["expires_at"] <= now:
            reason = "expired"
        elif row["kind"] == "access" and (row["grant_id"] is None or row["grant_revoked_at"] is not None):
            reason = "grant_revoked"
        if reason:
            return {"active": False, "reason": reason}
        if row["last_used_at"] is None or now - int(row["last_used_at"]) >= LAST_USED_THROTTLE_S:
            await db.execute(text("UPDATE mcp_tokens SET last_used_at = :now WHERE id = :id"), {"now": now, "id": row["id"]})
            if row["grant_id"]:
                await db.execute(text("UPDATE mcp_grants SET last_used_at = :now WHERE id = :g"), {"now": now, "g": row["grant_id"]})
            await db.commit()
        is_key = row["kind"] == "api_key"
        user_identifier = row["user_identifier"] or (str(row["user_id"]) if row["user_id"] else None)
        return {
            "active": True,
            "token_id": row["id"],
            "kind": row["kind"],
            "user_id": row["user_id"],
            "user_identifier": user_identifier,
            "grant_id": row["grant_id"],
            "client_id": row["client_id"],
            "client_name": row["name"] if is_key else row["client_name"],
            "scope": row["scope"],
            "audience": row["audience"],
            "expires_at": row["expires_at"],
            "site_filter": _json_list(row["key_site_filter"] if is_key else row["grant_site_filter"]),
            "exclude_queries": bool(row["key_exclude_queries"] if is_key else row["grant_exclude_queries"]),
            "demo": bool(row["demo"]) if not is_key else False,
        }

    @router.post("/tokens/revoke")
    async def revoke_token(body: TokenRevoke, db=Depends(get_db)):
        r = (await db.execute(text("SELECT id, kind, family_id, client_id FROM mcp_tokens WHERE token_hash = :h"), {"h": body.hash})).first()
        if not r:
            return {"revoked": False, "revoked_hashes": []}
        tok = _row(r)
        if body.client_id is not None and tok["client_id"] != body.client_id:
            # RFC 7009: a client may only revoke its own tokens. Answer 200 with no effect.
            return {"revoked": False, "revoked_hashes": []}
        if tok["kind"] == "refresh" and tok["family_id"]:
            hashes = await revoke_where(db, "family_id = :f", {"f": tok["family_id"]})
        else:
            hashes = await revoke_where(db, "id = :id", {"id": tok["id"]})
        await db.commit()
        return {"revoked": True, "revoked_hashes": hashes}

    # ── API keys ──
    @router.get("/users/{identifier}/keys")
    async def list_keys(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        rows = (await db.execute(text(
            """
            SELECT id, name, prefix, scope, site_filter, exclude_queries, created_at, expires_at, last_used_at
            FROM mcp_tokens WHERE user_id = :u AND kind = 'api_key' AND revoked_at IS NULL AND expires_at > :now
            ORDER BY created_at DESC
            """
        ), {"u": user_id, "now": _now()})).fetchall()
        out = []
        for r in rows:
            row = _row(r)
            row["site_filter"] = _json_list(row["site_filter"])
            row["exclude_queries"] = bool(row["exclude_queries"])
            out.append(row)
        return {"keys": out}

    @router.post("/users/{identifier}/keys")
    async def create_key(identifier: str, body: ApiKeyCreate, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        active = (await db.execute(text(
            "SELECT COUNT(*) FROM mcp_tokens WHERE user_id = :u AND kind = 'api_key' AND revoked_at IS NULL AND expires_at > :now"
        ), {"u": user_id, "now": _now()})).scalar()
        if int(active or 0) >= MAX_ACTIVE_API_KEYS:
            raise HTTPException(status_code=409, detail=f"At most {MAX_ACTIVE_API_KEYS} active API keys")
        days = max(1, min(int(body.expires_in_days), 365))
        key_id = await insert_token(db, token_hash=body.token_hash, kind="api_key", family_id=None, grant_id=None,
                                    user_id=user_id, client_id=None, scope="mcp:read", audience=body.audience,
                                    expires_at=_now() + days * 86400, name=body.name.strip() or "API key",
                                    prefix=body.prefix, site_filter=_dump_list(body.site_filter),
                                    exclude_queries=1 if body.exclude_queries else 0)
        await db.commit()
        return {"id": key_id, "expires_at": _now() + days * 86400}

    @router.delete("/users/{identifier}/keys/{key_id}")
    async def delete_key(identifier: str, key_id: int, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        hashes = await revoke_where(db, "id = :id AND user_id = :u AND kind = 'api_key'", {"id": key_id, "u": user_id})
        await db.commit()
        if not hashes:
            raise HTTPException(status_code=404, detail="Key not found")
        return {"revoked": True, "revoked_hashes": hashes}

    # ── audit and usage ──
    @router.post("/audit/batch")
    async def audit_batch(body: AuditBatch, db=Depends(get_db)):
        rows = body.rows[:500]
        for row in rows:
            await db.execute(text(
                """
                INSERT INTO mcp_audit (ts, user_id, grant_id, token_id, client_id, tool, site_host, status,
                    duration_ms, rows, cache_hit, google_calls, ip_prefix)
                VALUES (:ts, :user_id, :grant_id, :token_id, :client_id, :tool, :site_host, :status,
                    :duration_ms, :rows, :cache_hit, :google_calls, :ip_prefix)
                """
            ), {**row.model_dump(), "cache_hit": None if row.cache_hit is None else (1 if row.cache_hit else 0)})
        await db.commit()
        await maybe_purge(db)
        return {"inserted": len(rows)}

    @router.get("/users/{identifier}/audit")
    async def list_audit(identifier: str, limit: int = 50, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        rows = (await db.execute(text(
            """
            SELECT a.ts, a.tool, a.site_host, a.status, a.duration_ms, a.rows, a.cache_hit, a.grant_id,
                   COALESCE(g.client_name, t.name, 'API key') AS client_name
            FROM mcp_audit a
            LEFT JOIN mcp_grants g ON g.id = a.grant_id
            LEFT JOIN mcp_tokens t ON t.id = a.token_id
            WHERE a.user_id = :u ORDER BY a.ts DESC, a.id DESC LIMIT :lim
            """
        ), {"u": user_id, "lim": max(1, min(limit, 200))})).fetchall()
        return {"rows": [_row(r) for r in rows]}

    @router.get("/users/{identifier}/usage")
    async def usage(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        now = _now()
        since30 = now - 30 * 86400
        totals = _row((await db.execute(text(
            """
            SELECT COUNT(*) AS calls_30d,
                   SUM(CASE WHEN ts >= :d1 THEN 1 ELSE 0 END) AS calls_24h,
                   SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors_30d,
                   SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS cached_30d
            FROM mcp_audit WHERE user_id = :u AND ts >= :s
            """
        ), {"u": user_id, "s": since30, "d1": now - 86400})).first())
        by_tool = [_row(r) for r in (await db.execute(text(
            "SELECT tool, COUNT(*) AS calls FROM mcp_audit WHERE user_id = :u AND ts >= :s GROUP BY tool ORDER BY calls DESC"
        ), {"u": user_id, "s": since30})).fetchall()]
        by_day = [_row(r) for r in (await db.execute(text(
            "SELECT date(ts, 'unixepoch') AS day, COUNT(*) AS calls FROM mcp_audit WHERE user_id = :u AND ts >= :s GROUP BY day ORDER BY day"
        ), {"u": user_id, "s": since30})).fetchall()]
        return {
            "calls_30d": int(totals["calls_30d"] or 0), "calls_24h": int(totals["calls_24h"] or 0),
            "errors_30d": int(totals["errors_30d"] or 0), "cached_30d": int(totals["cached_30d"] or 0),
            "by_tool": by_tool, "by_day": by_day,
        }

    # ── pairing overrides ──
    @router.get("/users/{identifier}/site-links")
    async def get_site_links(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        rows = (await db.execute(text("SELECT site_id, ga4_property, gsc_property, source, updated_at FROM mcp_site_links WHERE user_id = :u AND source = 'manual'"), {"u": user_id})).fetchall()
        return {"links": [_row(r) for r in rows]}

    @router.put("/users/{identifier}/site-links")
    async def put_site_links(identifier: str, body: SiteLinksPut, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        await db.execute(text("DELETE FROM mcp_site_links WHERE user_id = :u AND source = 'manual'"), {"u": user_id})
        for link in body.links[:500]:
            await db.execute(text(
                """
                INSERT OR REPLACE INTO mcp_site_links (user_id, site_id, ga4_property, gsc_property, source, updated_at)
                VALUES (:u, :s, :g, :c, 'manual', :now)
                """
            ), {"u": user_id, "s": link.site_id[:255], "g": link.ga4_property, "c": link.gsc_property, "now": _now()})
        await db.commit()
        return {"ok": True, "count": len(body.links[:500])}

    @router.post("/maintenance/purge")
    async def purge_endpoint(db=Depends(get_db)):
        return await purge(db)

    return router
