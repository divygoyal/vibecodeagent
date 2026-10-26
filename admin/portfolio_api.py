"""
Portfolio snapshot store (the app home: every GA4 property and Search
Console site of a user on one screen).

The web app does the Google work (inventory, pairing, daily reports) and
stores the results here; the portfolio API then reads aggregates from these
tables, so opening the portfolio never waits on Google.

Tables (migrations/020_add_portfolio.sql):
    portfolio_assets    one row per (user, kind, asset): flags, pairing, sync status
    site_daily_metrics  one row per (user, kind, asset, date): the day's metrics

All endpoints sit behind the admin X-API-Key (internal network only). Asset
ids contain "/" and ":" ("properties/123", "https://www.x.com/",
"sc-domain:x.com"), so they always travel in JSON bodies, never in paths.

Wiring (main.py):
    from portfolio_api import build_portfolio_router, ensure_portfolio_schema, delete_user_portfolio_rows
    app.include_router(build_portfolio_router(get_db, verify_admin_key, get_user_by_identifier))
    await ensure_portfolio_schema(engine)   # at startup
"""
from __future__ import annotations

import math
import os
import time
from datetime import date as _date
from typing import Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

MIGRATION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations", "020_add_portfolio.sql")

KINDS = ("ga4", "gsc")
STATUSES = ("pending", "syncing", "synced", "error", "no_access")
NO_PAIR = "__none__"
MAX_ASSETS = 5000
MAX_ROWS_PER_CALL = 20000
MAX_BUCKET_DAYS = 31

ASSET_COLUMNS = (
    "asset_kind, asset_id, display_name, host, account_name, permission_level, paired_with, "
    "pairing_override, starred, hidden, missing, status, last_error, last_synced_at, "
    "sync_started_at, data_start, data_end, backfill_done, created_at, updated_at"
)


def _now() -> int:
    return int(time.time())


def _schema_statements() -> List[str]:
    with open(MIGRATION_FILE, "r", encoding="utf-8") as fh:
        raw = fh.read()
    lines = [ln for ln in raw.splitlines() if not ln.strip().startswith("--")]
    return [s.strip() for s in "\n".join(lines).split(";") if s.strip()]


async def ensure_portfolio_schema(engine) -> None:
    """Create the portfolio tables if missing (idempotent, additive)."""
    async with engine.begin() as conn:
        for ddl in _schema_statements():
            try:
                await conn.execute(text(ddl))
            except Exception as exc:  # pragma: no cover - logged, never fatal
                print(f"[startup] portfolio DDL skipped: {type(exc).__name__}: {exc}")


async def delete_user_portfolio_rows(db, user_id: int) -> None:
    """Remove every portfolio row of a user (called from DELETE /api/users/{id})."""
    for table in ("site_daily_metrics", "portfolio_assets"):
        await db.execute(text(f"DELETE FROM {table} WHERE user_id = :u"), {"u": user_id})


def _asset_dict(r) -> dict:
    m = dict(r._mapping)
    for k in ("starred", "hidden", "missing", "backfill_done"):
        m[k] = bool(m.get(k))
    return m


def _valid_date(value: str) -> str:
    try:
        _date.fromisoformat(value)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Bad date: {value!r}")
    return value


def _check_kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail=f"Bad asset kind: {kind!r}")
    return kind


# ───────────────────────── request bodies ─────────────────────────

class AssetIn(BaseModel):
    kind: str
    asset_id: str = Field(..., max_length=500)
    display_name: Optional[str] = Field(None, max_length=300)
    host: Optional[str] = Field(None, max_length=255)
    account_name: Optional[str] = Field(None, max_length=300)
    permission_level: Optional[str] = Field(None, max_length=40)
    paired_with: Optional[str] = Field(None, max_length=500)


class AssetsPut(BaseModel):
    assets: List[AssetIn]
    # Kinds whose inventory listing succeeded. Assets of these kinds that are
    # not in `assets` get missing=1; other kinds are left untouched.
    complete_kinds: List[str] = []


class AssetPatch(BaseModel):
    kind: str
    asset_id: str = Field(..., max_length=500)
    starred: Optional[bool] = None
    hidden: Optional[bool] = None
    # GA4 rows only: a GSC site URL, "__none__" (force unpaired), or null with
    # clear_override=true to go back to automatic pairing.
    pairing_override: Optional[str] = Field(None, max_length=500)
    clear_override: bool = False


class StatusUpdate(BaseModel):
    kind: str
    asset_id: str = Field(..., max_length=500)
    status: str
    last_error: Optional[str] = Field(None, max_length=1000)
    last_synced_at: Optional[int] = None
    sync_started_at: Optional[int] = None
    data_start: Optional[str] = None
    data_end: Optional[str] = None
    backfill_done: Optional[bool] = None


class StatusBatch(BaseModel):
    updates: List[StatusUpdate]


class MetricRow(BaseModel):
    kind: str
    asset_id: str = Field(..., max_length=500)
    date: str
    users: Optional[int] = None
    sessions: Optional[int] = None
    pageviews: Optional[int] = None
    key_events: Optional[float] = None
    engagement_rate: Optional[float] = None
    clicks: Optional[int] = None
    impressions: Optional[int] = None
    ctr: Optional[float] = None
    position: Optional[float] = None


class MetricsBatch(BaseModel):
    rows: List[MetricRow]


class Window(BaseModel):
    cur_start: str
    cur_end: str
    prev_start: str
    prev_end: str


class SnapshotQuery(BaseModel):
    windows: Dict[str, Window]
    bucket_days: int = 1
    recent_days: int = 7


# ───────────────────────── router ─────────────────────────

def build_portfolio_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/portfolio", tags=["portfolio"], dependencies=[Depends(verify_admin_key)])

    async def resolve_user_id(db, identifier: str) -> int:
        user = await get_user_by_identifier(db, identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return int(user.id)

    async def list_assets(db, user_id: int) -> List[dict]:
        rows = (await db.execute(
            text(f"SELECT {ASSET_COLUMNS} FROM portfolio_assets WHERE user_id = :u ORDER BY asset_kind, asset_id"),
            {"u": user_id},
        )).fetchall()
        return [_asset_dict(r) for r in rows]

    # ── assets ──
    @router.get("/users/{identifier}/assets")
    async def get_assets(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        return {"assets": await list_assets(db, user_id)}

    @router.put("/users/{identifier}/assets")
    async def put_assets(identifier: str, body: AssetsPut, db=Depends(get_db)):
        """Upsert the inventory. Flags (starred, hidden, override) and sync state are kept."""
        user_id = await resolve_user_id(db, identifier)
        if len(body.assets) > MAX_ASSETS:
            raise HTTPException(status_code=413, detail=f"At most {MAX_ASSETS} assets")
        now = _now()
        params = []
        for a in body.assets:
            _check_kind(a.kind)
            params.append({
                "u": user_id, "k": a.kind, "a": a.asset_id, "dn": a.display_name, "h": a.host,
                "acc": a.account_name, "perm": a.permission_level, "pw": a.paired_with, "now": now,
            })
        if params:
            await db.execute(text(
                """
                INSERT INTO portfolio_assets (user_id, asset_kind, asset_id, display_name, host, account_name,
                    permission_level, paired_with, missing, status, created_at, updated_at)
                VALUES (:u, :k, :a, :dn, :h, :acc, :perm, :pw, 0, 'pending', :now, :now)
                ON CONFLICT(user_id, asset_kind, asset_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    host = excluded.host,
                    account_name = excluded.account_name,
                    permission_level = excluded.permission_level,
                    paired_with = excluded.paired_with,
                    missing = 0,
                    updated_at = excluded.updated_at
                """
            ), params)
        for kind in body.complete_kinds:
            _check_kind(kind)
            keep = [a.asset_id for a in body.assets if a.kind == kind]
            # Mark the rest missing. Done in Python to avoid a huge NOT IN list.
            rows = (await db.execute(
                text("SELECT asset_id FROM portfolio_assets WHERE user_id = :u AND asset_kind = :k AND missing = 0"),
                {"u": user_id, "k": kind},
            )).fetchall()
            keep_set = set(keep)
            gone = [r[0] for r in rows if r[0] not in keep_set]
            if gone:
                await db.execute(
                    text("UPDATE portfolio_assets SET missing = 1, paired_with = NULL, updated_at = :now "
                         "WHERE user_id = :u AND asset_kind = :k AND asset_id = :a"),
                    [{"u": user_id, "k": kind, "a": g, "now": now} for g in gone],
                )
        await db.commit()
        return {"assets": await list_assets(db, user_id)}

    @router.patch("/users/{identifier}/assets")
    async def patch_asset(identifier: str, body: AssetPatch, db=Depends(get_db)):
        """Star, hide, or set the pairing override of one asset."""
        user_id = await resolve_user_id(db, identifier)
        _check_kind(body.kind)
        sets, params = [], {"u": user_id, "k": body.kind, "a": body.asset_id, "now": _now()}
        if body.starred is not None:
            sets.append("starred = :starred")
            params["starred"] = 1 if body.starred else 0
        if body.hidden is not None:
            sets.append("hidden = :hidden")
            params["hidden"] = 1 if body.hidden else 0
        if body.clear_override or body.pairing_override is not None:
            if body.kind != "ga4":
                raise HTTPException(status_code=422, detail="Pairing overrides live on GA4 assets")
            sets.append("pairing_override = :po")
            params["po"] = None if body.clear_override else body.pairing_override
        if not sets:
            raise HTTPException(status_code=422, detail="Nothing to change")
        res = await db.execute(
            text(f"UPDATE portfolio_assets SET {', '.join(sets)}, updated_at = :now "
                 "WHERE user_id = :u AND asset_kind = :k AND asset_id = :a"),
            params,
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Asset not found")
        await db.commit()
        row = (await db.execute(
            text(f"SELECT {ASSET_COLUMNS} FROM portfolio_assets WHERE user_id = :u AND asset_kind = :k AND asset_id = :a"),
            {"u": user_id, "k": body.kind, "a": body.asset_id},
        )).first()
        return {"asset": _asset_dict(row)}

    @router.post("/users/{identifier}/assets/status")
    async def update_status(identifier: str, body: StatusBatch, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        now = _now()
        changed = 0
        for upd in body.updates[:MAX_ASSETS]:
            _check_kind(upd.kind)
            if upd.status not in STATUSES:
                raise HTTPException(status_code=422, detail=f"Bad status: {upd.status!r}")
            sets = ["status = :s", "last_error = :e", "updated_at = :now"]
            params = {"u": user_id, "k": upd.kind, "a": upd.asset_id, "s": upd.status, "e": upd.last_error, "now": now}
            for field in ("last_synced_at", "sync_started_at"):
                value = getattr(upd, field)
                if value is not None:
                    sets.append(f"{field} = :{field}")
                    params[field] = value
            for field in ("data_start", "data_end"):
                value = getattr(upd, field)
                if value is not None:
                    sets.append(f"{field} = :{field}")
                    params[field] = _valid_date(value)
            if upd.backfill_done is not None:
                sets.append("backfill_done = :bf")
                params["bf"] = 1 if upd.backfill_done else 0
            res = await db.execute(
                text(f"UPDATE portfolio_assets SET {', '.join(sets)} WHERE user_id = :u AND asset_kind = :k AND asset_id = :a"),
                params,
            )
            changed += res.rowcount or 0
        await db.commit()
        return {"ok": True, "changed": changed}

    # ── daily metrics ──
    @router.post("/users/{identifier}/metrics")
    async def upsert_metrics(identifier: str, body: MetricsBatch, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        if len(body.rows) > MAX_ROWS_PER_CALL:
            raise HTTPException(status_code=413, detail=f"At most {MAX_ROWS_PER_CALL} rows per call")
        now = _now()
        params = []
        for r in body.rows:
            _check_kind(r.kind)
            params.append({
                "u": user_id, "k": r.kind, "a": r.asset_id, "d": _valid_date(r.date),
                "users": r.users, "sessions": r.sessions, "pageviews": r.pageviews, "key_events": r.key_events,
                "er": r.engagement_rate, "clicks": r.clicks, "impressions": r.impressions, "ctr": r.ctr,
                "position": r.position, "now": now,
            })
        if params:
            await db.execute(text(
                """
                INSERT INTO site_daily_metrics (user_id, asset_kind, asset_id, date, users, sessions, pageviews,
                    key_events, engagement_rate, clicks, impressions, ctr, position, updated_at)
                VALUES (:u, :k, :a, :d, :users, :sessions, :pageviews, :key_events, :er, :clicks, :impressions,
                    :ctr, :position, :now)
                ON CONFLICT(user_id, asset_kind, asset_id, date) DO UPDATE SET
                    users = excluded.users, sessions = excluded.sessions, pageviews = excluded.pageviews,
                    key_events = excluded.key_events, engagement_rate = excluded.engagement_rate,
                    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr,
                    position = excluded.position, updated_at = excluded.updated_at
                """
            ), params)
        await db.commit()
        return {"ok": True, "rows": len(params)}

    @router.post("/users/{identifier}/snapshot")
    async def snapshot(identifier: str, body: SnapshotQuery, db=Depends(get_db)):
        """Assets plus, per asset: current and previous window sums, a bucketed
        current-window series and the last `recent_days` daily values.

        Windows are per kind because Search Console lags GA4 by 2-3 days.
        Buckets count back from cur_end (bucket 0 = the newest), so only the
        oldest bucket can be partial.
        """
        user_id = await resolve_user_id(db, identifier)
        b = max(1, min(int(body.bucket_days), MAX_BUCKET_DAYS))
        recent_days = max(1, min(int(body.recent_days), 31))
        out = {"assets": await list_assets(db, user_id), "totals": [], "series": {}, "recent": {}, "bucket_days": b}

        for kind, w in body.windows.items():
            _check_kind(kind)
            for d in (w.cur_start, w.cur_end, w.prev_start, w.prev_end):
                _valid_date(d)
            p = {"u": user_id, "k": kind, "cs": w.cur_start, "ce": w.cur_end, "ps": w.prev_start, "pe": w.prev_end}

            totals = (await db.execute(text(
                """
                SELECT asset_id,
                       CASE WHEN date >= :cs THEN 'cur' ELSE 'prev' END AS w,
                       COUNT(*) AS days,
                       SUM(users) AS users, SUM(sessions) AS sessions, SUM(pageviews) AS pageviews,
                       SUM(key_events) AS key_events, SUM(engagement_rate * sessions) AS engaged_weighted,
                       SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                       SUM(position * impressions) AS position_weighted
                FROM site_daily_metrics
                WHERE user_id = :u AND asset_kind = :k
                  AND ((date BETWEEN :cs AND :ce) OR (date BETWEEN :ps AND :pe))
                GROUP BY asset_id, w
                """
            ), p)).fetchall()
            for r in totals:
                m = dict(r._mapping)
                m["kind"] = kind
                out["totals"].append(m)

            span = (_date.fromisoformat(w.cur_end) - _date.fromisoformat(w.cur_start)).days + 1
            n_buckets = max(1, math.ceil(span / b))
            series_rows = (await db.execute(text(
                """
                SELECT asset_id,
                       CAST((julianday(:ce) - julianday(date)) / :b AS INTEGER) AS bi,
                       SUM(users) AS users, SUM(sessions) AS sessions,
                       SUM(clicks) AS clicks, SUM(impressions) AS impressions
                FROM site_daily_metrics
                WHERE user_id = :u AND asset_kind = :k AND date BETWEEN :cs AND :ce
                GROUP BY asset_id, bi
                """
            ), {**p, "b": b})).fetchall()
            metrics = ("users", "sessions") if kind == "ga4" else ("clicks", "impressions")
            series: Dict[str, Dict[str, list]] = {}
            for r in series_rows:
                m = r._mapping
                s = series.setdefault(m["asset_id"], {k: [0] * n_buckets for k in metrics})
                idx = n_buckets - 1 - int(m["bi"])
                if 0 <= idx < n_buckets:
                    for k in metrics:
                        s[k][idx] = m[k] or 0
            out["series"][kind] = {"n": n_buckets, "span_days": span, "by_asset": series}

            recent_rows = (await db.execute(text(
                """
                SELECT asset_id, date, users, sessions, clicks, impressions
                FROM site_daily_metrics
                WHERE user_id = :u AND asset_kind = :k AND date BETWEEN date(:ce, :back) AND :ce
                ORDER BY asset_id, date
                """
            ), {**p, "back": f"-{recent_days - 1} days"})).fetchall()
            recent: Dict[str, list] = {}
            for r in recent_rows:
                m = r._mapping
                v = (m["users"] if kind == "ga4" else m["clicks"]) or 0
                recent.setdefault(m["asset_id"], []).append([m["date"], v])
            out["recent"][kind] = recent

        return out

    # ── cron support ──
    @router.get("/stale-users")
    async def stale_users(older_than_s: int = Query(21600, ge=60), limit: int = Query(50, ge=1, le=500), db=Depends(get_db)):
        """Users whose oldest visible asset was synced before now - older_than_s."""
        cutoff = _now() - older_than_s
        rows = (await db.execute(text(
            """
            SELECT pa.user_id AS user_id, MIN(COALESCE(pa.last_synced_at, 0)) AS oldest,
                   u.github_id AS github_id, u.email AS email,
                   (SELECT oc.provider_account_id FROM oauth_connections oc
                     WHERE oc.user_id = pa.user_id AND oc.provider = 'google' LIMIT 1) AS google_id
            FROM portfolio_assets pa JOIN users u ON u.id = pa.user_id
            WHERE pa.hidden = 0 AND pa.missing = 0
            GROUP BY pa.user_id
            HAVING oldest < :cutoff
            ORDER BY oldest
            LIMIT :limit
            """
        ), {"cutoff": cutoff, "limit": limit})).fetchall()
        users = []
        for r in rows:
            m = r._mapping
            ident = m["github_id"] or m["google_id"] or m["email"] or str(m["user_id"])
            users.append({"identifier": ident, "user_id": m["user_id"], "oldest_synced_at": m["oldest"] or None})
        return {"users": users}

    @router.delete("/users/{identifier}")
    async def delete_rows(identifier: str, db=Depends(get_db)):
        user_id = await resolve_user_id(db, identifier)
        await delete_user_portfolio_rows(db, user_id)
        await db.commit()
        return {"ok": True}

    return router
