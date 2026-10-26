"""
Portfolio snapshot store (the app home: every GA4 property and Search
Console site of a user on one screen).

The web app does the Google work (inventory, pairing, daily reports) and
stores the results here; the portfolio API then reads aggregates from these
tables, so opening the portfolio never waits on Google.

Tables (migrations/020_add_portfolio.sql):
    portfolio_assets        one row per (user, kind, asset): flags, pairing, sync status
    site_daily_metrics      one row per (user, kind, date, asset): the day's metrics
    portfolio_range_totals  exact GA4 users per (asset, range key), current + previous window

All endpoints sit behind the admin X-API-Key (internal network only). Asset
ids contain "/" and ":" ("properties/123", "https://www.x.com/",
"sc-domain:x.com"), so they always travel in JSON bodies, never in paths.

Wiring (main.py):
    from portfolio_api import build_portfolio_router, ensure_portfolio_schema, delete_user_portfolio_rows
    app.include_router(build_portfolio_router(get_db, verify_admin_key, get_user_by_identifier))
    await ensure_portfolio_schema(engine)   # at startup
"""
from __future__ import annotations

import json
import math
import os
import time
from datetime import date as _date, timedelta
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import text

MIGRATION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations", "020_add_portfolio.sql")

KINDS = ("ga4", "gsc")
STATUSES = ("pending", "syncing", "synced", "error", "no_access")
NO_PAIR = "__none__"
MAX_ASSETS = 5000
MAX_ROWS_PER_CALL = 20000
MAX_BUCKET_DAYS = 31

# Daily columns per kind, the sums the snapshot returns and the per-bucket series.
RAW_COLUMNS = {
    "ga4": ("users", "sessions", "pageviews", "key_events", "engagement_rate"),
    "gsc": ("clicks", "impressions", "position"),
}
SUM_COLUMNS = {
    "ga4": ("users", "sessions", "pageviews", "key_events", "engaged_weighted"),
    "gsc": ("clicks", "impressions", "position_weighted"),
}
SUM_SQL = {
    "ga4": ("SUM(users) AS users", "SUM(sessions) AS sessions", "SUM(pageviews) AS pageviews",
            "SUM(key_events) AS key_events", "SUM(engagement_rate * sessions) AS engaged_weighted"),
    "gsc": ("SUM(clicks) AS clicks", "SUM(impressions) AS impressions", "SUM(position * impressions) AS position_weighted"),
}
SERIES_COLUMNS = {"ga4": ("users", "sessions"), "gsc": ("clicks", "impressions", "position_weighted")}


def _derived(kind: str, raw: Dict[str, Any]) -> Dict[str, Any]:
    """One daily row as the summable values (weighted rate and position)."""
    if kind == "ga4":
        er, s = raw.get("engagement_rate"), raw.get("sessions")
        raw["engaged_weighted"] = er * s if er is not None and s is not None else None
    else:
        p, i = raw.get("position"), raw.get("impressions")
        raw["position_weighted"] = p * i if p is not None and i is not None else None
    return raw


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
    for table in ("site_daily_metrics", "portfolio_range_totals", "portfolio_assets"):
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
    # Window length in days; the previous window is the same length, right before.
    days: int = Field(..., ge=1, le=800)
    # Last day of the current window. When omitted it is the newest stored date
    # of that kind (Search Console lags 2-3 days), clamped to [end_min, end_max].
    end: Optional[str] = None
    end_min: Optional[str] = None
    end_max: Optional[str] = None


class SnapshotQuery(BaseModel):
    windows: Dict[str, Window]
    bucket_days: int = 1
    recent_days: int = 7
    # Also return the stored exact-users rows of this range key ("7d", "28d", "3m", "12m").
    range_key: Optional[str] = Field(None, max_length=8)


class RangeTotal(BaseModel):
    kind: str = "ga4"
    asset_id: str = Field(..., max_length=500)
    range_key: str = Field(..., max_length=8)
    cur_start: str
    cur_end: str
    prev_start: str
    prev_end: str
    active_users_cur: Optional[int] = None
    active_users_prev: Optional[int] = None
    total_users_cur: Optional[int] = None
    total_users_prev: Optional[int] = None


class RangeTotalsBatch(BaseModel):
    rows: List[RangeTotal]


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
                ON CONFLICT(user_id, asset_kind, date, asset_id) DO UPDATE SET
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
        """Assets plus, per asset: current and previous window sums, bucketed
        series for both windows and the last `recent_days` daily values.

        Windows are per kind because Search Console lags GA4 by 2-3 days.
        Buckets count back from each window's end (index n-1 is the newest), so
        only the oldest bucket can be partial. One range scan per kind: the
        table is clustered by (user, kind, date), so 500 sites x 3 months is a
        few hundred milliseconds.
        """
        user_id = await resolve_user_id(db, identifier)
        b = max(1, min(int(body.bucket_days), MAX_BUCKET_DAYS))
        recent_days = max(1, min(int(body.recent_days), 31))
        out: Dict[str, Any] = {
            "assets": await list_assets(db, user_id), "windows": {}, "totals": [], "series": {}, "recent": {}, "bucket_days": b,
        }

        for kind, w in body.windows.items():
            _check_kind(kind)
            end = w.end
            if end is None:
                newest = (await db.execute(
                    text("SELECT MAX(date) FROM site_daily_metrics WHERE user_id = :u AND asset_kind = :k"),
                    {"u": user_id, "k": kind},
                )).scalar()
                end = newest or w.end_max
                if end and w.end_max and end > w.end_max:
                    end = w.end_max
                if end and w.end_min and end < w.end_min:
                    end = w.end_min
            if not end:
                raise HTTPException(status_code=422, detail=f"No end date for {kind}")
            ce = _date.fromisoformat(_valid_date(end))
            cs = ce - timedelta(days=w.days - 1)
            pe = cs - timedelta(days=1)
            ps = pe - timedelta(days=w.days - 1)
            out["windows"][kind] = {"cur_start": cs.isoformat(), "cur_end": ce.isoformat(), "prev_start": ps.isoformat(), "prev_end": pe.isoformat()}

            n = max(1, math.ceil(w.days / b))
            sum_cols = SUM_COLUMNS[kind]
            series_cols = SERIES_COLUMNS[kind]
            totals: Dict[tuple, Dict[str, float]] = {}
            cur_series: Dict[str, Dict[str, list]] = {}
            prev_series: Dict[str, Dict[str, list]] = {}
            recent: Dict[str, list] = {}
            ce_o, pe_o, cs_iso = ce.toordinal(), pe.toordinal(), cs.isoformat()
            recent_from = (ce - timedelta(days=recent_days - 1)).isoformat()

            def add(asset: str, window: str, idx: int, vals: Dict[str, float], days: int) -> None:
                t = totals.get((asset, window))
                if t is None:
                    t = totals[(asset, window)] = {"days": 0, **{c: None for c in sum_cols}}
                t["days"] += days
                for c in sum_cols:
                    v = vals.get(c)
                    if v is not None:
                        t[c] = (t[c] or 0) + v
                if 0 <= idx < n:
                    target = cur_series if window == "cur" else prev_series
                    arrs = target.get(asset)
                    if arrs is None:
                        arrs = target[asset] = {c: [0] * n for c in series_cols}
                    for c in series_cols:
                        arrs[c][idx] += vals.get(c) or 0

            params = {"u": user_id, "k": kind, "ps": ps.isoformat(), "ce": ce.isoformat()}
            if b == 1:
                rows = (await db.execute(text(
                    f"SELECT asset_id, date, {', '.join(RAW_COLUMNS[kind])} FROM site_daily_metrics "
                    "WHERE user_id = :u AND asset_kind = :k AND date BETWEEN :ps AND :ce"
                ), params)).fetchall()
                ordinals: Dict[str, int] = {}
                for r in rows:
                    asset, d = r[0], r[1]
                    o = ordinals.get(d)
                    if o is None:
                        o = ordinals[d] = _date.fromisoformat(d).toordinal()
                    vals = _derived(kind, dict(zip(RAW_COLUMNS[kind], r[2:])))
                    if d >= cs_iso:
                        add(asset, "cur", n - 1 - (ce_o - o), vals, 1)
                        if d >= recent_from:
                            recent.setdefault(asset, []).append([d, (vals.get("users") if kind == "ga4" else vals.get("clicks")) or 0])
                    else:
                        add(asset, "prev", n - 1 - (pe_o - o), vals, 1)
            else:
                rows = (await db.execute(text(
                    f"""
                    SELECT asset_id,
                           CASE WHEN date >= :cs THEN CAST((julianday(:ce) - julianday(date)) / :b AS INTEGER)
                                ELSE 100000 + CAST((julianday(:pe) - julianday(date)) / :b AS INTEGER) END AS bi,
                           COUNT(*) AS days, {', '.join(SUM_SQL[kind])}
                    FROM site_daily_metrics
                    WHERE user_id = :u AND asset_kind = :k AND date BETWEEN :ps AND :ce
                    GROUP BY asset_id, bi
                    """
                ), {**params, "cs": cs_iso, "pe": pe.isoformat(), "b": b})).fetchall()
                for r in rows:
                    m = r._mapping
                    bi = int(m["bi"])
                    window = "prev" if bi >= 100000 else "cur"
                    add(m["asset_id"], window, n - 1 - (bi - 100000 if window == "prev" else bi), {c: m[c] for c in sum_cols}, int(m["days"]))
                recent_rows = (await db.execute(text(
                    "SELECT asset_id, date, users, clicks FROM site_daily_metrics "
                    "WHERE user_id = :u AND asset_kind = :k AND date BETWEEN :rf AND :ce ORDER BY date"
                ), {"u": user_id, "k": kind, "rf": recent_from, "ce": ce.isoformat()})).fetchall()
                for r in recent_rows:
                    recent.setdefault(r[0], []).append([r[1], (r[2] if kind == "ga4" else r[3]) or 0])

            for (asset, window), t in totals.items():
                out["totals"].append({"kind": kind, "asset_id": asset, "w": window, **t})
            for lst in recent.values():
                lst.sort(key=lambda x: x[0])
            out["series"][kind] = {"n": n, "span_days": w.days, "by_asset": cur_series, "prev_by_asset": prev_series}
            out["recent"][kind] = recent

        if body.range_key:
            rows = (await db.execute(text(
                "SELECT asset_kind, asset_id, range_key, cur_start, cur_end, prev_start, prev_end, active_users_cur, "
                "active_users_prev, total_users_cur, total_users_prev, fetched_at FROM portfolio_range_totals "
                "WHERE user_id = :u AND range_key = :r"
            ), {"u": user_id, "r": body.range_key})).fetchall()
            out["range_totals"] = [dict(r._mapping) for r in rows]

        # Large portfolios produce MBs of numbers: skip FastAPI's per-item encoder.
        return Response(content=json.dumps(out, separators=(",", ":")), media_type="application/json")

    @router.post("/users/{identifier}/range-totals")
    async def upsert_range_totals(identifier: str, body: RangeTotalsBatch, db=Depends(get_db)):
        """Store exact users per (property, range key) for the current and previous window."""
        user_id = await resolve_user_id(db, identifier)
        now = _now()
        params = []
        for r in body.rows[:MAX_ASSETS]:
            _check_kind(r.kind)
            for d in (r.cur_start, r.cur_end, r.prev_start, r.prev_end):
                _valid_date(d)
            params.append({"u": user_id, "now": now, **r.model_dump()})
        if params:
            await db.execute(text(
                """
                INSERT INTO portfolio_range_totals (user_id, asset_kind, asset_id, range_key, cur_start, cur_end,
                    prev_start, prev_end, active_users_cur, active_users_prev, total_users_cur, total_users_prev, fetched_at)
                VALUES (:u, :kind, :asset_id, :range_key, :cur_start, :cur_end, :prev_start, :prev_end,
                    :active_users_cur, :active_users_prev, :total_users_cur, :total_users_prev, :now)
                ON CONFLICT(user_id, asset_kind, asset_id, range_key) DO UPDATE SET
                    cur_start = excluded.cur_start, cur_end = excluded.cur_end, prev_start = excluded.prev_start,
                    prev_end = excluded.prev_end, active_users_cur = excluded.active_users_cur,
                    active_users_prev = excluded.active_users_prev, total_users_cur = excluded.total_users_cur,
                    total_users_prev = excluded.total_users_prev, fetched_at = excluded.fetched_at
                """
            ), params)
        await db.commit()
        return {"ok": True, "rows": len(params)}

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
