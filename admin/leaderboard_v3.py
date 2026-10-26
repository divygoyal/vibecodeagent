"""Leaderboard v3 API (tc/leaderboard): board, profile, embed, owner settings,
inquiries, verification and metrics storage.

All routes are under /api/lb and require the admin key (the web app is the only
caller). Every public payload is produced by leaderboard_core's privacy
functions; nothing here serialises a raw metric into a public response.

main.py wires this in with `app.include_router(build_router(...))` and calls
`ensure_schema(conn)` from init_db().
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, delete, func, select, text

import leaderboard_core as core
from models import (
    AdSlot,
    AdSlotRequest,
    LeaderboardAudience,
    LeaderboardDaily,
    LeaderboardEntry,
    LeaderboardInquiry,
    LeaderboardProfile,
    LeaderboardRangeStat,
    LeaderboardStatsHistory,
    OAuthConnection,
    User,
)

# ─── schema (idempotent; mirrors migrations/021_leaderboard_v3.sql) ──────────

SCHEMA_DDL = [
    """
    CREATE TABLE IF NOT EXISTS leaderboard_profiles (
        entry_id INTEGER PRIMARY KEY,
        verification_level VARCHAR(10) NOT NULL DEFAULT 'none',
        verification_checked_at DATETIME,
        verification_detail TEXT,
        verification_manual BOOLEAN NOT NULL DEFAULT 0,
        gsc_site_url VARCHAR(255),
        privacy_json TEXT,
        open_to_json TEXT,
        is_paused BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS leaderboard_daily (
        entry_id INTEGER NOT NULL,
        day DATE NOT NULL,
        users INTEGER,
        sessions INTEGER,
        pageviews INTEGER,
        clicks INTEGER,
        impressions INTEGER,
        PRIMARY KEY (entry_id, day)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS leaderboard_range_stats (
        entry_id INTEGER NOT NULL,
        range_key VARCHAR(4) NOT NULL,
        visitors INTEGER,
        visitors_prev INTEGER,
        pageviews INTEGER,
        pageviews_prev INTEGER,
        clicks INTEGER,
        clicks_prev INTEGER,
        impressions INTEGER,
        impressions_prev INTEGER,
        engagement_rate FLOAT,
        bounce_rate FLOAT,
        avg_session_duration FLOAT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entry_id, range_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS leaderboard_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        publisher_user_id INTEGER NOT NULL,
        kind VARCHAR(20) NOT NULL,
        name VARCHAR(120),
        email VARCHAR(255) NOT NULL,
        company VARCHAR(160),
        budget VARCHAR(80),
        message TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        ad_slot_request_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_leaderboard_inquiries_entry_id ON leaderboard_inquiries(entry_id)",
    "CREATE INDEX IF NOT EXISTS ix_leaderboard_inquiries_publisher ON leaderboard_inquiries(publisher_user_id, created_at)",
]


async def ensure_schema(conn) -> None:
    for ddl in SCHEMA_DDL:
        try:
            await conn.execute(text(ddl))
        except Exception as exc:  # pragma: no cover - startup log only
            print(f"[startup] leaderboard v3 DDL skipped: {type(exc).__name__}: {exc}")


# ─── row -> dict ────────────────────────────────────────────────────────────

ENTRY_FIELDS = (
    "id", "user_id", "slug", "startup_name", "description", "website_url", "logo_url", "category",
    "mrr_range", "looking_for", "twitter_handle", "founder_name", "contact_email", "ga_property_id",
    "monthly_visitors", "monthly_pageviews", "engagement_rate", "bounce_rate", "avg_session_duration",
    "visitor_trend", "verified_host", "verification_status", "primary_country", "is_verified",
    "is_active", "last_refreshed", "created_at",
)
PROFILE_FIELDS = (
    "entry_id", "verification_level", "verification_checked_at", "verification_detail",
    "verification_manual", "gsc_site_url", "privacy_json", "open_to_json", "is_paused",
)
STAT_FIELDS = (
    "visitors", "visitors_prev", "pageviews", "pageviews_prev", "clicks", "clicks_prev",
    "impressions", "impressions_prev", "engagement_rate", "bounce_rate", "avg_session_duration",
)


def entry_dict(e: LeaderboardEntry) -> Dict[str, Any]:
    return {f: getattr(e, f, None) for f in ENTRY_FIELDS}


def profile_dict(p: Optional[LeaderboardProfile]) -> Optional[Dict[str, Any]]:
    if p is None:
        return None
    return {f: getattr(p, f, None) for f in PROFILE_FIELDS}


def stat_dict(s: Optional[LeaderboardRangeStat]) -> Dict[str, Any]:
    if s is None:
        return {f: None for f in STAT_FIELDS}
    return {f: getattr(s, f, None) for f in STAT_FIELDS}


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


def legacy_stat_fallback(entry: Dict[str, Any], range_key: str, stat: Dict[str, Any]) -> Dict[str, Any]:
    """Entries refreshed before v3 only have the 28-day numbers on the entry row."""
    if stat.get("visitors") is not None or range_key != "28d":
        return stat
    visitors = entry.get("monthly_visitors")
    if not visitors:
        return stat
    trend = entry.get("visitor_trend")
    prev = None
    if trend is not None and trend > -100:
        prev = round(visitors / (1 + trend / 100)) if (1 + trend / 100) != 0 else None
    out = dict(stat)
    out.update({
        "visitors": visitors,
        "visitors_prev": prev,
        "pageviews": entry.get("monthly_pageviews") or None,
        "engagement_rate": entry.get("engagement_rate"),
        "bounce_rate": entry.get("bounce_rate"),
        "avg_session_duration": entry.get("avg_session_duration"),
    })
    return out


# ─── context loading ────────────────────────────────────────────────────────


class Candidate(Dict[str, Any]):
    """entry, profile, settings, level, stat, slots (all plain data)."""


async def _load_candidates(db, range_key: str, *, include_unlisted: bool = False) -> List[Candidate]:
    entries = (await db.execute(select(LeaderboardEntry))).scalars().all()
    profiles = {p.entry_id: p for p in (await db.execute(select(LeaderboardProfile))).scalars().all()}
    stats = {
        s.entry_id: s
        for s in (
            await db.execute(select(LeaderboardRangeStat).where(LeaderboardRangeStat.range_key == range_key))
        ).scalars().all()
    }
    slot_rows = (
        await db.execute(
            select(AdSlot.entry_id, func.count(AdSlot.id), func.min(AdSlot.price_cents))
            .where(AdSlot.is_active == True)  # noqa: E712
            .group_by(AdSlot.entry_id)
        )
    ).all()
    slots = {r[0]: (int(r[1] or 0), int(r[2]) if r[2] is not None else None) for r in slot_rows}
    out: List[Candidate] = []
    for e in entries:
        ed = entry_dict(e)
        pd_ = profile_dict(profiles.get(e.id))
        if not include_unlisted and not core.is_public_ranked(ed, pd_):
            continue
        settings = core.settings_for(pd_, ed)
        level = core.effective_level(ed, pd_)
        stat = legacy_stat_fallback(ed, range_key, stat_dict(stats.get(e.id)))
        slot_count, min_price = slots.get(e.id, (0, None))
        c = Candidate(
            entry=ed,
            profile=pd_,
            settings=settings,
            level=level,
            stat=stat,
            slot_count=slot_count,
            min_price=min_price,
            audience=None,  # attached only for the rows that are rendered (see attach_audience)
        )
        out.append(c)
    return out


async def attach_audience(db, cands: List[Candidate]) -> None:
    """Load the (large) audience JSON only for the candidates a response actually renders."""
    ids = [c["entry"]["id"] for c in cands]
    if not ids:
        return
    rows = {a.entry_id: a for a in (await db.execute(select(LeaderboardAudience).where(LeaderboardAudience.entry_id.in_(ids)))).scalars().all()}
    for c in cands:
        c["audience"] = rows.get(c["entry"]["id"])


def _open_to(c: Candidate) -> List[str]:
    flags = list(c["settings"]["open_to"])
    if c["slot_count"] > 0 and "sponsorships" not in flags:
        flags.append("sponsorships")
    return flags


def _vis(c: Candidate, metric: str) -> str:
    return c["settings"]["privacy"]["metrics"][metric]


def _metric_for(c: Candidate, metric: str) -> Optional[Dict[str, Any]]:
    s = c["stat"]
    cur, prev = s.get(metric), s.get(f"{metric}_prev")
    return core.public_metric(_vis(c, metric), cur, prev)


def _serialize_audience_row(row: Optional[LeaderboardAudience]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    out: Dict[str, Any] = {}
    for key, col in (
        ("countries", "countries_json"), ("channels", "channels_json"), ("devices", "devices_json"),
        ("top_pages", "top_pages_json"), ("top_queries", "top_queries_json"), ("topics", "topics_json"),
    ):
        out[key] = core._loads(getattr(row, col, None), None)
    out["refreshed_at"] = iso(row.refreshed_at)
    return out


async def _daily_for(db, ids: List[int], since: date) -> Dict[int, Dict[date, Dict[str, Optional[int]]]]:
    if not ids:
        return {}
    out: Dict[int, Dict[date, Dict[str, Optional[int]]]] = {i: {} for i in ids}
    rows = (
        await db.execute(
            select(LeaderboardDaily).where(LeaderboardDaily.entry_id.in_(ids), LeaderboardDaily.day >= since)
        )
    ).scalars().all()
    for r in rows:
        out[r.entry_id][r.day] = {
            "users": r.users, "sessions": r.sessions, "pageviews": r.pageviews,
            "clicks": r.clicks, "impressions": r.impressions,
        }
    return out


def _column(daily: Dict[date, Dict[str, Optional[int]]], key: str) -> Dict[date, Optional[int]]:
    return {d: v.get(key) for d, v in daily.items()}


def _today() -> date:
    return datetime.utcnow().date()


def _trim_trailing_none(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    end = len(points)
    while end > 0 and points[end - 1]["v"] is None:
        end -= 1
    return points[:end]


# ─── public row / profile builders ──────────────────────────────────────────


def _row_base(c: Candidate, rank: Optional[int]) -> Dict[str, Any]:
    e = c["entry"]
    created = e.get("created_at")
    return {
        "rank": rank,
        "id": e["id"],
        "slug": e.get("slug"),
        "name": e["startup_name"],
        "description": e.get("description"),
        "website_url": e.get("website_url"),
        "logo_url": e.get("logo_url"),
        "category": e.get("category"),
        "country": e.get("primary_country"),
        "verification": core.level_public(c["level"], (c["profile"] or {}).get("verification_detail")),
        "open_to": _open_to(c),
        "visitors": _metric_for(c, "visitors"),
        "clicks": _metric_for(c, "clicks"),
        "ad_slot_count": c["slot_count"],
        "min_slot_price_cents": c["min_price"],
        "topic_labels": core.public_topics(_serialize_audience_row(c["audience"]), c["settings"]["privacy"]),
        "created_at": iso(created) if isinstance(created, datetime) else created,
        "is_new": bool(isinstance(created, datetime) and (datetime.utcnow() - created).days <= 30),
        "last_refreshed": iso(e.get("last_refreshed")),
    }


def _spark(c: Candidate, metric: str, daily: Dict[date, Dict[str, Optional[int]]], days: int) -> Optional[Dict[str, Any]]:
    mode = _vis(c, metric)
    if mode == core.VIS_HIDDEN:
        return None
    key = "users" if metric == "visitors" else "clicks"
    col = _column(daily, key)
    end = _today()
    start = end - timedelta(days=days - 1)
    pts = _trim_trailing_none(core.daily_points(col, start, end))
    values = [p["v"] for p in pts]
    sp = core.public_sparkline(mode, values, 30)
    if sp is None:
        return None
    return {"metric": metric, "mode": mode, "values": sp}


def _sort_value(c: Candidate, metric: str) -> Optional[float]:
    if _vis(c, metric) == core.VIS_HIDDEN:
        return None
    v = c["stat"].get(metric)
    return float(v) if v is not None else None


async def build_board(
    db,
    *,
    tab: str,
    range_key: str,
    category: Optional[str],
    country: Optional[str],
    q: Optional[str],
    open_to: Optional[str],
    page: int,
    page_size: int,
) -> Dict[str, Any]:
    days = core.RANGES[range_key]
    cands = await _load_candidates(db, range_key)

    # Filters shared by every tab.
    def matches(c: Candidate) -> bool:
        e = c["entry"]
        if category and category != "all" and (e.get("category") or "") != category:
            return False
        if country and country != "all" and (e.get("primary_country") or "") != country.upper():
            return False
        if q:
            needle = q.strip().lower()
            hay = " ".join([e.get("startup_name") or "", e.get("description") or "", e.get("website_url") or ""]).lower()
            if needle not in hay:
                return False
        return True

    all_categories: Dict[str, int] = {}
    for c in cands:
        name = c["entry"].get("category") or "Other"
        all_categories[name] = all_categories.get(name, 0) + 1
    categories = [{"name": n, "count": k} for n, k in sorted(all_categories.items(), key=lambda kv: (-kv[1], kv[0]))]

    filtered = [c for c in cands if matches(c)]
    ranked = True
    focus = "visitors"

    if tab == "search":
        focus = "clicks"
        pool = [c for c in filtered if (_sort_value(c, "clicks") or 0) > 0]
        pool.sort(key=lambda c: -_sort_value(c, "clicks"))  # type: ignore[operator]
    elif tab == "rising":
        pool = []
        for c in filtered:
            cur = _sort_value(c, "visitors")
            prev = c["stat"].get("visitors_prev")
            if cur is None or cur < 50 or not prev or prev <= 0:
                continue
            pool.append(c)
        pool.sort(key=lambda c: -(core.delta_pct(c["stat"]["visitors"], c["stat"]["visitors_prev"]) or -1e9))
    elif tab == "new":
        ranked = False
        pool = sorted(filtered, key=lambda c: str(c["entry"].get("created_at") or ""), reverse=True)
    elif tab == "offers":
        ranked = False
        flag = open_to if open_to in core.OPEN_TO else None
        pool = [c for c in filtered if (flag in _open_to(c) if flag else bool(_open_to(c)))]
        pool.sort(key=lambda c: core.sort_key_none_last(_sort_value(c, "visitors")))
    elif tab == "categories":
        ranked = False
        pool = sorted(filtered, key=lambda c: core.sort_key_none_last(_sort_value(c, "visitors")))
    else:  # top
        tab = "top"
        pool = [c for c in filtered if (_sort_value(c, "visitors") or 0) > 0]
        pool.sort(key=lambda c: -_sort_value(c, "visitors"))  # type: ignore[operator]

    total = len(pool)
    start = (page - 1) * page_size
    page_items = pool[start:start + page_size]
    await attach_audience(db, page_items)
    daily = await _daily_for(db, [c["entry"]["id"] for c in page_items], _today() - timedelta(days=days))

    rows = []
    for i, c in enumerate(page_items):
        row = _row_base(c, start + i + 1 if ranked else None)
        spark = _spark(c, focus, daily.get(c["entry"]["id"], {}), days)
        if spark is None and focus == "visitors":
            spark = _spark(c, "clicks", daily.get(c["entry"]["id"], {}), days)
        row["spark"] = spark
        rows.append(row)

    payload: Dict[str, Any] = {
        "tab": tab,
        "range": range_key,
        "focus": focus,
        "rows": rows,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "categories": categories,
        "updated_at": iso(max((c["entry"]["last_refreshed"] for c in cands if c["entry"].get("last_refreshed")), default=None)),
    }

    if tab == "categories":
        cards = []
        for cat in categories:
            members = [c for c in cands if (c["entry"].get("category") or "Other") == cat["name"]]
            members.sort(key=lambda c: core.sort_key_none_last(_sort_value(c, "visitors")))
            cards.append({
                "name": cat["name"],
                "count": cat["count"],
                "top": [
                    {
                        "id": m["entry"]["id"], "slug": m["entry"].get("slug"), "name": m["entry"]["startup_name"],
                        "logo_url": m["entry"].get("logo_url"), "website_url": m["entry"].get("website_url"),
                        "visitors": _metric_for(m, "visitors"),
                    }
                    for m in members[:3]
                ],
            })
        payload["category_cards"] = cards

    # Sponsored strip: open ad slots from the existing inventory, never ranked.
    slot_rows = (
        await db.execute(select(AdSlot).where(AdSlot.is_active == True).order_by(AdSlot.id.asc()))  # noqa: E712
    ).scalars().all()
    by_id = {c["entry"]["id"]: c for c in cands}
    sponsored = []
    for s in slot_rows:
        c = by_id.get(s.entry_id)
        if not c or max(int(s.quantity_total or 0) - int(s.quantity_taken or 0), 0) <= 0:
            continue
        sponsored.append((s, c))
    sponsored.sort(key=lambda sc: core.sort_key_none_last(_sort_value(sc[1], "visitors")))
    payload["sponsored"] = [
        {
            "slot": {
                "id": s.id, "name": s.name, "price_cents": int(s.price_cents or 0),
                "billing_period": s.billing_period or "month",
                "quantity_open": max(int(s.quantity_total or 0) - int(s.quantity_taken or 0), 0),
            },
            "site": {
                "id": c["entry"]["id"], "slug": c["entry"].get("slug"), "name": c["entry"]["startup_name"],
                "logo_url": c["entry"].get("logo_url"), "category": c["entry"].get("category"),
                "visitors": _metric_for(c, "visitors"),
            },
        }
        for s, c in sponsored[:3]
    ]
    payload["open_slot_total"] = len(sponsored)
    return payload


def _rank_among(cands: List[Candidate], target_id: int, metric: str, category: Optional[str] = None) -> Dict[str, Optional[int]]:
    pool = [
        c for c in cands
        if (_sort_value(c, metric) or 0) > 0 and (category is None or (c["entry"].get("category") or "Other") == category)
    ]
    pool.sort(key=lambda c: -_sort_value(c, metric))  # type: ignore[operator]
    for i, c in enumerate(pool):
        if c["entry"]["id"] == target_id:
            return {"rank": i + 1, "total": len(pool)}
    return {"rank": None, "total": len(pool)}


def _find_entry(id_or_slug: str):
    if id_or_slug.isdigit():
        return select(LeaderboardEntry).where(LeaderboardEntry.id == int(id_or_slug))
    return select(LeaderboardEntry).where(LeaderboardEntry.slug == id_or_slug)


async def build_profile(
    db,
    entry: LeaderboardEntry,
    range_key: str,
    *,
    serialize_ad_slot: Callable[[AdSlot], Dict[str, Any]],
    preview: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """The public profile payload, or None when the entry must not be reachable.

    `preview` (owner only) overrides privacy/open_to/profile fields with a draft and
    skips the verification gate, so the in-app preview is produced by the same code
    path as the real page.
    """
    days = core.RANGES[range_key]
    ed = entry_dict(entry)
    prof_row = (await db.execute(select(LeaderboardProfile).where(LeaderboardProfile.entry_id == entry.id))).scalar_one_or_none()
    pd_ = profile_dict(prof_row)
    if preview:
        for k in ("startup_name", "description", "category", "logo_url", "website_url", "twitter_handle", "founder_name"):
            if k in preview and preview[k] is not None:
                ed[k] = preview[k]
    if not preview and not core.is_listed(ed, pd_):
        return None

    settings = core.settings_for(pd_, ed)
    privacy = settings["privacy"]
    open_to = settings["open_to"]
    if preview:
        if isinstance(preview.get("privacy"), dict):
            privacy = core.normalize_privacy(preview["privacy"], settings["privacy"])
        if isinstance(preview.get("open_to"), list):
            open_to = core.normalize_open_to(preview["open_to"])
    level = core.effective_level(ed, pd_)
    verification = core.level_public(level, (pd_ or {}).get("verification_detail"))

    slots = (
        await db.execute(select(AdSlot).where(AdSlot.entry_id == entry.id, AdSlot.is_active == True).order_by(AdSlot.id.asc()))  # noqa: E712
    ).scalars().all()
    ad_slots = [serialize_ad_slot(s) for s in slots]
    if ad_slots and "sponsorships" not in open_to:
        contact_kinds = open_to + ["sponsorships"]
    else:
        contact_kinds = list(open_to)

    base = {
        "id": entry.id,
        "slug": entry.slug,
        "name": ed["startup_name"],
        "description": ed.get("description"),
        "website_url": ed.get("website_url"),
        "logo_url": ed.get("logo_url"),
        "category": ed.get("category"),
        "country": ed.get("primary_country"),
        "twitter_handle": ed.get("twitter_handle"),
        "founder_name": ed.get("founder_name"),
        "verification": verification,
        "open_to": contact_kinds,
        "range": range_key,
        "created_at": iso(entry.created_at),
        "preview": bool(preview),
    }

    if not verification["ranked"] and not preview:
        # Direct link to an entry whose ownership is not proven: say so, show no numbers.
        return {**base, "status": "pending", "kpis": None, "series": None, "growth": None,
                "breakdowns": {}, "ad_slots": [], "contact_kinds": [], "live": {"enabled": False}, "similar": [],
                "updated_at": None}

    stat = legacy_stat_fallback(ed, range_key, stat_dict(
        (await db.execute(select(LeaderboardRangeStat).where(
            LeaderboardRangeStat.entry_id == entry.id, LeaderboardRangeStat.range_key == range_key
        ))).scalar_one_or_none()
    ))
    m = privacy["metrics"]
    kpis = {
        "visitors": core.public_metric(m["visitors"], stat["visitors"], stat["visitors_prev"]),
        "clicks": core.public_metric(m["clicks"], stat["clicks"], stat["clicks_prev"]),
        "pageviews": core.public_metric(m["pageviews"], stat["pageviews"], stat["pageviews_prev"]),
        "impressions": core.public_metric(m["impressions"], stat["impressions"], stat["impressions_prev"]),
        "engagement": core.public_engagement(m["engagement"], stat["engagement_rate"], stat["bounce_rate"], stat["avg_session_duration"]),
    }

    daily = (await _daily_for(db, [entry.id], _today() - timedelta(days=days))).get(entry.id, {})
    end = _today()
    start = end - timedelta(days=days - 1)
    series = {
        "visitors": core.public_series(m["visitors"], _trim_trailing_none(core.daily_points(_column(daily, "users"), start, end))),
        "clicks": core.public_series(m["clicks"], _trim_trailing_none(core.daily_points(_column(daily, "clicks"), start, end))),
    }

    cands = await _load_candidates(db, range_key)
    me_cat = ed.get("category") or "Other"
    overall = _rank_among(cands, entry.id, "visitors") if m["visitors"] != core.VIS_HIDDEN else {"rank": None, "total": None}
    in_cat = _rank_among(cands, entry.id, "visitors", me_cat) if m["visitors"] != core.VIS_HIDDEN else {"rank": None, "total": None}
    best_day = None
    if m["visitors"] != core.VIS_HIDDEN:
        users_col = {d: v for d, v in _column(daily, "users").items() if v is not None and start <= d <= end}
        if users_col:
            bd = max(users_col, key=lambda d: users_col[d])
            best_day = {"date": bd.isoformat()}
            if m["visitors"] == core.VIS_EXACT:
                best_day["value"] = users_col[bd]
    growth = {
        "visitors_delta_pct": kpis["visitors"]["delta_pct"] if kpis["visitors"] else None,
        "clicks_delta_pct": kpis["clicks"]["delta_pct"] if kpis["clicks"] else None,
        "rank_overall": overall["rank"],
        "rank_overall_total": overall["total"],
        "rank_category": in_cat["rank"],
        "rank_category_total": in_cat["total"],
        "best_day": best_day,
        "days_listed": max((datetime.utcnow() - entry.created_at).days, 0) if entry.created_at else None,
    }

    audience = _serialize_audience_row((await db.execute(select(LeaderboardAudience).where(LeaderboardAudience.entry_id == entry.id))).scalar_one_or_none())
    breakdowns = core.public_breakdowns(audience, privacy)

    similar_pool = [c for c in cands if c["entry"]["id"] != entry.id and (c["entry"].get("category") or "Other") == me_cat]
    similar_pool.sort(key=lambda c: core.sort_key_none_last(_sort_value(c, "visitors")))
    similar = [
        {
            "id": c["entry"]["id"], "slug": c["entry"].get("slug"), "name": c["entry"]["startup_name"],
            "logo_url": c["entry"].get("logo_url"), "category": c["entry"].get("category"),
            "visitors": _metric_for(c, "visitors"),
        }
        for c in similar_pool[:3]
    ]

    last = ed.get("last_refreshed")
    return {
        **base,
        "status": "ranked" if verification["ranked"] else "pending",
        "kpis": kpis,
        "series": series,
        "growth": growth,
        "breakdowns": breakdowns,
        "topic_labels": core.public_topics(audience, privacy),
        "ad_slots": ad_slots,
        "live": {"enabled": bool(privacy["live"] and verification["ranked"])},
        "similar": similar,
        "updated_at": iso(last),
    }


# ─── request models ─────────────────────────────────────────────────────────


class SettingsBody(BaseModel):
    privacy: Optional[Dict[str, Any]] = None
    open_to: Optional[List[str]] = None
    is_paused: Optional[bool] = None
    gsc_site_url: Optional[str] = None


class PreviewBody(BaseModel):
    privacy: Optional[Dict[str, Any]] = None
    open_to: Optional[List[str]] = None
    startup_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None
    website_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    founder_name: Optional[str] = None
    range: Optional[str] = None


class VerificationBody(BaseModel):
    level: Optional[str] = None            # owner | ga4 | none
    detail: Optional[Dict[str, Any]] = None
    host: Optional[str] = None
    gsc_site_url: Optional[str] = None
    transient_error: Optional[str] = None  # a failed check that must not change the level


class DailyRow(BaseModel):
    date: str
    users: Optional[float] = None
    sessions: Optional[float] = None
    pageviews: Optional[float] = None
    clicks: Optional[float] = None
    impressions: Optional[float] = None


class RangeIn(BaseModel):
    visitors: Optional[float] = None
    visitors_prev: Optional[float] = None
    engagement_rate: Optional[float] = None
    bounce_rate: Optional[float] = None
    avg_session_duration: Optional[float] = None


class MetricsBody(BaseModel):
    daily: List[DailyRow] = []
    ranges: Dict[str, RangeIn] = {}
    primary_country: Optional[str] = None


class InquiryBody(BaseModel):
    kind: str
    name: Optional[str] = None
    email: str
    company: Optional[str] = None
    budget: Optional[str] = None
    message: Optional[str] = None
    slot_id: Optional[int] = None


class InquiryStatusBody(BaseModel):
    status: str


INQUIRY_STATUSES = {"new", "read", "replied", "archived"}
INQUIRY_KIND_FROM_OPEN_TO = {"sponsorships": "sponsorship", "acquisition": "acquisition", "partnerships": "partnership"}


def _valid_range(value: Optional[str]) -> str:
    return value if value in core.RANGES else core.DEFAULT_RANGE


# ─── router ─────────────────────────────────────────────────────────────────


def build_router(
    *,
    get_db,
    verify_admin_key,
    get_user_by_identifier: Callable[..., Any],
    serialize_ad_slot: Callable[[AdSlot], Dict[str, Any]],
    serialize_ad_slot_request: Callable[[AdSlotRequest], Dict[str, Any]],
    load_owned_entry: Callable[..., Any],
) -> APIRouter:
    router = APIRouter(prefix="/api/lb", tags=["leaderboard-v3"], dependencies=[Depends(verify_admin_key)])

    async def get_or_create_profile(db, entry: LeaderboardEntry) -> LeaderboardProfile:
        prof = (await db.execute(select(LeaderboardProfile).where(LeaderboardProfile.entry_id == entry.id))).scalar_one_or_none()
        if prof is None:
            # First touch of a pre-v3 entry: freeze what it shows today so editing one
            # setting does not flip the others to the new conservative defaults.
            ed = entry_dict(entry)
            legacy = core.settings_for(None, ed)
            prof = LeaderboardProfile(
                entry_id=entry.id,
                verification_level=core.LEVEL_NONE,
                privacy_json=json.dumps(legacy["privacy"]),
                open_to_json=json.dumps(legacy["open_to"]),
                is_paused=False,
            )
            db.add(prof)
            await db.flush()
        return prof

    # ── public ──

    @router.get("/board")
    async def board(
        tab: str = "top",
        range: str = Query(core.DEFAULT_RANGE),
        category: Optional[str] = None,
        country: Optional[str] = None,
        q: Optional[str] = None,
        open_to: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        db=Depends(get_db),
    ):
        return await build_board(
            db,
            tab=tab,
            range_key=_valid_range(range),
            category=category,
            country=country,
            q=q,
            open_to=open_to,
            page=max(page, 1),
            page_size=max(min(page_size, 100), 1),
        )

    @router.get("/profile/{id_or_slug}")
    async def profile(id_or_slug: str, range: str = Query(core.DEFAULT_RANGE), db=Depends(get_db)):
        entry = (await db.execute(_find_entry(id_or_slug))).scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        payload = await build_profile(db, entry, _valid_range(range), serialize_ad_slot=serialize_ad_slot)
        if payload is None:
            raise HTTPException(status_code=404, detail="Entry not found")
        return payload

    @router.get("/embed/{id_or_slug}")
    async def embed(id_or_slug: str, range: str = Query(core.DEFAULT_RANGE), db=Depends(get_db)):
        """Compact payload for the badge and iframe widget."""
        rk = _valid_range(range)
        entry = (await db.execute(_find_entry(id_or_slug))).scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        cands = await _load_candidates(db, rk)
        me = next((c for c in cands if c["entry"]["id"] == entry.id), None)
        if me is None:
            raise HTTPException(status_code=404, detail="Entry not found")
        days = core.RANGES[rk]
        daily = (await _daily_for(db, [entry.id], _today() - timedelta(days=days))).get(entry.id, {})
        focus = "visitors" if _vis(me, "visitors") != core.VIS_HIDDEN else "clicks"
        overall = _rank_among(cands, entry.id, "visitors") if _vis(me, "visitors") != core.VIS_HIDDEN else {"rank": None, "total": None}
        cat = me["entry"].get("category") or "Other"
        in_cat = _rank_among(cands, entry.id, "visitors", cat) if _vis(me, "visitors") != core.VIS_HIDDEN else {"rank": None, "total": None}
        return {
            "id": entry.id,
            "slug": entry.slug,
            "name": entry.startup_name,
            "logo_url": entry.logo_url,
            "website_url": entry.website_url,
            "category": entry.category,
            "verification": core.level_public(me["level"], (me["profile"] or {}).get("verification_detail")),
            "range": rk,
            "visitors": _metric_for(me, "visitors"),
            "clicks": _metric_for(me, "clicks"),
            "spark": _spark(me, focus, daily, days),
            "rank_overall": overall["rank"],
            "rank_category": in_cat["rank"],
            "live_enabled": bool(me["settings"]["privacy"]["live"]),
            "updated_at": iso(me["entry"].get("last_refreshed")),
        }

    @router.get("/entry/{entry_id}/live-credentials")
    async def live_credentials(entry_id: int, db=Depends(get_db)):
        """Server-to-server: the owner's token + property for the 60 s 'live now' lookup.
        Only answers for a public, ranked entry whose owner opted in to live."""
        entry = (await db.execute(select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id))).scalar_one_or_none()
        if not entry or not entry.ga_property_id:
            raise HTTPException(status_code=404, detail="Entry not found")
        ed = entry_dict(entry)
        prof = profile_dict((await db.execute(select(LeaderboardProfile).where(LeaderboardProfile.entry_id == entry_id))).scalar_one_or_none())
        if not core.is_public_ranked(ed, prof):
            raise HTTPException(status_code=404, detail="Entry not found")
        if not core.settings_for(prof, ed)["privacy"]["live"]:
            return {"enabled": False}
        oauth = (await db.execute(
            select(OAuthConnection).where(OAuthConnection.user_id == entry.user_id, OAuthConnection.provider == "google")
        )).scalars().first()
        if not oauth or not oauth.access_token:
            return {"enabled": True, "available": False}
        return {
            "enabled": True,
            "available": True,
            "ga_property_id": entry.ga_property_id,
            "access_token": oauth.access_token,
            "refresh_token": oauth.refresh_token,
        }

    # ── inquiries ──

    @router.post("/entry/{entry_id}/inquiries")
    async def create_inquiry(entry_id: int, body: InquiryBody, db=Depends(get_db)):
        entry = (await db.execute(select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id))).scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        ed = entry_dict(entry)
        prof = profile_dict((await db.execute(select(LeaderboardProfile).where(LeaderboardProfile.entry_id == entry_id))).scalar_one_or_none())
        if not core.is_public_ranked(ed, prof):
            raise HTTPException(status_code=404, detail="Entry not found")

        settings = core.settings_for(prof, ed)
        slots = (await db.execute(select(AdSlot).where(AdSlot.entry_id == entry_id, AdSlot.is_active == True))).scalars().all()  # noqa: E712
        allowed_kinds = {INQUIRY_KIND_FROM_OPEN_TO[o] for o in settings["open_to"]}
        if slots:
            allowed_kinds.add("sponsorship")
        if body.kind not in allowed_kinds:
            raise HTTPException(status_code=400, detail="This site is not taking that kind of offer.")

        email = (body.email or "").strip()[:255]
        if "@" not in email or "." not in email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Enter a valid email so the owner can reply.")
        message = (body.message or "").strip()[: core.MAX_INQUIRY_MESSAGE]
        if len(message) < 10:
            raise HTTPException(status_code=400, detail="Add a short message (at least 10 characters).")

        since = datetime.utcnow() - timedelta(days=1)
        per_entry = (await db.execute(
            select(func.count(LeaderboardInquiry.id)).where(LeaderboardInquiry.entry_id == entry_id, LeaderboardInquiry.created_at >= since)
        )).scalar_one() or 0
        per_email = (await db.execute(
            select(func.count(LeaderboardInquiry.id)).where(
                LeaderboardInquiry.entry_id == entry_id, LeaderboardInquiry.created_at >= since,
                func.lower(LeaderboardInquiry.email) == email.lower(),
            )
        )).scalar_one() or 0
        if per_entry >= 20 or per_email >= 3:
            raise HTTPException(status_code=429, detail="Too many offers for this site today. Try again tomorrow.")

        slot_request_id: Optional[int] = None
        slot_snapshot = None
        if body.slot_id:
            slot = next((s for s in slots if s.id == body.slot_id), None)
            if slot is None:
                raise HTTPException(status_code=400, detail="That ad slot is not being sold right now.")
            req = AdSlotRequest(
                slot_id=slot.id,
                entry_id=entry_id,
                publisher_user_id=slot.user_id,
                buyer_name=(body.name or "").strip()[:120] or None,
                buyer_email=email,
                message=message or None,
                slot_name_at_request=slot.name,
                price_cents_at_request=int(slot.price_cents or 0),
                billing_period_at_request=slot.billing_period,
                status="new",
            )
            db.add(req)
            await db.flush()
            slot_request_id = req.id
            slot_snapshot = {
                "slot_name_at_request": slot.name,
                "price_cents_at_request": int(slot.price_cents or 0),
                "billing_period_at_request": slot.billing_period,
            }

        inquiry = LeaderboardInquiry(
            entry_id=entry_id,
            publisher_user_id=entry.user_id,
            kind=body.kind,
            name=(body.name or "").strip()[:120] or None,
            email=email,
            company=(body.company or "").strip()[:160] or None,
            budget=(body.budget or "").strip()[:80] or None,
            message=message,
            status="new",
            ad_slot_request_id=slot_request_id,
        )
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)

        owner = (await db.execute(select(User).where(User.id == entry.user_id))).scalar_one_or_none()
        return {
            "success": True,
            "id": inquiry.id,
            "ad_slot_request_id": slot_request_id,
            "slot": slot_snapshot,
            "publisher": {
                "startup_name": entry.startup_name,
                "slug": entry.slug,
                "contact_email": entry.contact_email or (owner.email if owner else None),
                "founder_name": entry.founder_name,
            },
        }

    @router.get("/inquiries/{identifier}")
    async def inbox(identifier: str, db=Depends(get_db)):
        """The owner's single inbox: offers + slot requests that were not mirrored as offers."""
        user = await get_user_by_identifier(db, identifier)
        if not user:
            return {"items": [], "unread": 0}
        entries = {e.id: e for e in (await db.execute(select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id))).scalars().all()}
        inquiries = (await db.execute(
            select(LeaderboardInquiry).where(LeaderboardInquiry.publisher_user_id == user.id).order_by(LeaderboardInquiry.created_at.desc())
        )).scalars().all()
        requests = (await db.execute(
            select(AdSlotRequest).where(AdSlotRequest.publisher_user_id == user.id).order_by(AdSlotRequest.created_at.desc())
        )).scalars().all()
        mirrored = {i.ad_slot_request_id for i in inquiries if i.ad_slot_request_id}
        requests_by_id = {r.id: r for r in requests}
        items: List[Dict[str, Any]] = []
        for i in inquiries:
            slot_req = requests_by_id.get(i.ad_slot_request_id) if i.ad_slot_request_id else None
            items.append({
                "source": "inquiry",
                "id": i.id,
                "entry_id": i.entry_id,
                "site_name": entries[i.entry_id].startup_name if i.entry_id in entries else None,
                "kind": i.kind,
                "name": i.name, "email": i.email, "company": i.company, "budget": i.budget, "message": i.message,
                "status": i.status,
                "created_at": iso(i.created_at),
                "slot_request": serialize_ad_slot_request(slot_req) if slot_req else None,
            })
        for r in requests:
            if r.id in mirrored:
                continue
            items.append({
                "source": "slot_request",
                "id": r.id,
                "entry_id": r.entry_id,
                "site_name": entries[r.entry_id].startup_name if r.entry_id in entries else None,
                "kind": "sponsorship",
                "name": r.buyer_name, "email": r.buyer_email, "company": None, "budget": None, "message": r.message,
                "status": r.status,
                "created_at": iso(r.created_at),
                "slot_request": serialize_ad_slot_request(r),
            })
        items.sort(key=lambda it: it["created_at"] or "", reverse=True)
        unread = sum(1 for it in items if it["status"] == "new")
        return {"items": items, "unread": unread}

    @router.patch("/inquiries/{inquiry_id}")
    async def update_inquiry(inquiry_id: int, body: InquiryStatusBody, user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if body.status not in INQUIRY_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        inquiry = (await db.execute(select(LeaderboardInquiry).where(LeaderboardInquiry.id == inquiry_id))).scalar_one_or_none()
        if not inquiry or int(inquiry.publisher_user_id) != int(user.id):
            raise HTTPException(status_code=404, detail="Offer not found")
        inquiry.status = body.status
        inquiry.updated_at = datetime.utcnow()
        await db.commit()
        return {"success": True}

    @router.get("/superadmin/inquiries")
    async def superadmin_inquiries(limit: int = 200, db=Depends(get_db)):
        rows = (await db.execute(select(LeaderboardInquiry).order_by(LeaderboardInquiry.created_at.desc()).limit(min(max(limit, 1), 500)))).scalars().all()
        names = {e.id: e.startup_name for e in (await db.execute(select(LeaderboardEntry))).scalars().all()}
        return {"items": [
            {"id": r.id, "entry_id": r.entry_id, "site_name": names.get(r.entry_id), "kind": r.kind, "name": r.name,
             "email": r.email, "company": r.company, "budget": r.budget, "message": r.message, "status": r.status,
             "ad_slot_request_id": r.ad_slot_request_id, "created_at": iso(r.created_at)}
            for r in rows
        ]}

    # ── owner ──

    @router.get("/mine/{identifier}")
    async def mine(identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, identifier)
        if not user:
            return {"entries": []}
        entries = (await db.execute(
            select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id).order_by(LeaderboardEntry.created_at.asc())
        )).scalars().all()
        if not entries:
            return {"entries": []}
        ids = [e.id for e in entries]
        profiles = {p.entry_id: p for p in (await db.execute(select(LeaderboardProfile).where(LeaderboardProfile.entry_id.in_(ids)))).scalars().all()}
        stats: Dict[int, Dict[str, Dict[str, Any]]] = {i: {} for i in ids}
        for s in (await db.execute(select(LeaderboardRangeStat).where(LeaderboardRangeStat.entry_id.in_(ids)))).scalars().all():
            stats[s.entry_id][s.range_key] = stat_dict(s)
        slots: Dict[int, List[Dict[str, Any]]] = {}
        for s in (await db.execute(select(AdSlot).where(AdSlot.entry_id.in_(ids)).order_by(AdSlot.id.asc()))).scalars().all():
            slots.setdefault(s.entry_id, []).append(serialize_ad_slot(s))
        inquiry_counts = {
            r[0]: (int(r[1] or 0), int(r[2] or 0))
            for r in (await db.execute(
                select(LeaderboardInquiry.entry_id, func.count(LeaderboardInquiry.id),
                       func.sum(case((LeaderboardInquiry.status == "new", 1), else_=0)))
                .where(LeaderboardInquiry.entry_id.in_(ids)).group_by(LeaderboardInquiry.entry_id)
            )).all()
        }
        cands = await _load_candidates(db, core.DEFAULT_RANGE)
        out = []
        for e in entries:
            ed = entry_dict(e)
            pd_ = profile_dict(profiles.get(e.id))
            settings = core.settings_for(pd_, ed)
            level = core.effective_level(ed, pd_)
            detail = core._loads((pd_ or {}).get("verification_detail"), {})
            per_range = {rk: legacy_stat_fallback(ed, rk, stats[e.id].get(rk) or stat_dict(None)) for rk in core.RANGES}
            rank = _rank_among(cands, e.id, "visitors")
            total_inq, new_inq = inquiry_counts.get(e.id, (0, 0))
            out.append({
                "id": e.id,
                "slug": e.slug,
                "startup_name": e.startup_name,
                "description": e.description,
                "website_url": e.website_url,
                "logo_url": e.logo_url,
                "category": e.category,
                "mrr_range": e.mrr_range,
                "twitter_handle": e.twitter_handle,
                "founder_name": e.founder_name,
                "contact_email": e.contact_email,
                "ga_property_id": e.ga_property_id,
                "gsc_site_url": (pd_ or {}).get("gsc_site_url"),
                "is_active": bool(e.is_active),
                "is_paused": bool(settings["is_paused"]),
                "created_at": iso(e.created_at),
                "last_refreshed": iso(e.last_refreshed),
                "primary_country": e.primary_country,
                "verification": {
                    **core.level_public(level, detail),
                    "grace": level.get("grace", False),
                    "manual": level.get("manual", False),
                    "detail": detail if isinstance(detail, dict) else {},
                },
                "legacy_privacy": bool(settings["legacy"]),
                "privacy": settings["privacy"],
                "open_to": settings["open_to"],
                "stats": per_range,
                "rank": rank,
                "ad_slots": slots.get(e.id, []),
                "inquiries": {"total": total_inq, "new": new_inq},
                "public_path": f"/leaderboard/{e.slug or e.id}",
            })
        return {"entries": out}

    @router.put("/entry/{entry_id}/settings")
    async def update_settings(entry_id: int, body: SettingsBody, user_identifier: str, db=Depends(get_db)):
        entry = await load_owned_entry(db, entry_id, user_identifier)
        prof = await get_or_create_profile(db, entry)
        if body.privacy is not None:
            current = core.normalize_privacy(prof.privacy_json, core.settings_for(profile_dict(prof), entry_dict(entry))["privacy"])
            prof.privacy_json = json.dumps(core.normalize_privacy(body.privacy, current))
        if body.open_to is not None:
            prof.open_to_json = json.dumps(core.normalize_open_to(body.open_to))
        if body.is_paused is not None:
            prof.is_paused = bool(body.is_paused)
        if body.gsc_site_url is not None:
            prof.gsc_site_url = body.gsc_site_url.strip()[:255] or None
        prof.updated_at = datetime.utcnow()
        await db.commit()
        return {"success": True}

    @router.post("/entry/{entry_id}/preview")
    async def preview(entry_id: int, body: PreviewBody, user_identifier: str, db=Depends(get_db)):
        entry = await load_owned_entry(db, entry_id, user_identifier)
        rk = _valid_range(body.range)
        draft = body.model_dump(exclude_none=True)
        payload = await build_profile(db, entry, rk, serialize_ad_slot=serialize_ad_slot, preview=draft or {"_": 1})
        # The same row the board would render, from the same privacy rules.
        cands = await _load_candidates(db, rk, include_unlisted=True)
        me = next((c for c in cands if c["entry"]["id"] == entry.id), None)
        row = None
        if me is not None:
            await attach_audience(db, [me])
            if isinstance(draft.get("privacy"), dict):
                me["settings"] = {**me["settings"], "privacy": core.normalize_privacy(draft["privacy"], me["settings"]["privacy"])}
            if isinstance(draft.get("open_to"), list):
                me["settings"] = {**me["settings"], "open_to": core.normalize_open_to(draft["open_to"])}
            for k in ("startup_name", "description", "category", "logo_url", "website_url"):
                if draft.get(k) is not None:
                    me["entry"][k] = draft[k]
            row = _row_base(me, None)
            daily = (await _daily_for(db, [entry.id], _today() - timedelta(days=core.RANGES[rk]))).get(entry.id, {})
            row["spark"] = _spark(me, "visitors", daily, core.RANGES[rk]) or _spark(me, "clicks", daily, core.RANGES[rk])
        return {"profile": payload, "row": row}

    @router.delete("/entry/{entry_id}")
    async def purge(entry_id: int, user_identifier: str, db=Depends(get_db)):
        """Delete the profile for good: the entry and everything stored about it."""
        entry = await load_owned_entry(db, entry_id, user_identifier)
        for model, col in (
            (LeaderboardProfile, LeaderboardProfile.entry_id),
            (LeaderboardDaily, LeaderboardDaily.entry_id),
            (LeaderboardRangeStat, LeaderboardRangeStat.entry_id),
            (LeaderboardInquiry, LeaderboardInquiry.entry_id),
            (LeaderboardAudience, LeaderboardAudience.entry_id),
            (LeaderboardStatsHistory, LeaderboardStatsHistory.entry_id),
            (AdSlotRequest, AdSlotRequest.entry_id),
            (AdSlot, AdSlot.entry_id),
        ):
            await db.execute(delete(model).where(col == entry.id))
        await db.delete(entry)
        await db.commit()
        return {"success": True, "deleted": entry_id}

    # ── system (cron / web refresh) ──

    @router.put("/entry/{entry_id}/verification")
    async def put_verification(entry_id: int, body: VerificationBody, db=Depends(get_db)):
        entry = (await db.execute(select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id))).scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        prof = await get_or_create_profile(db, entry)
        existing_detail = core._loads(prof.verification_detail, {})
        if not isinstance(existing_detail, dict):
            existing_detail = {}

        if body.transient_error:
            # The check itself failed (token, quota, network). Keep the level and say so.
            existing_detail["error"] = body.transient_error[:300]
            existing_detail["error_at"] = iso(datetime.utcnow())
            prof.verification_detail = json.dumps(existing_detail)
            await db.commit()
            return {"success": True, "level": prof.verification_level, "changed": False}

        level = body.level if body.level in (core.LEVEL_OWNER, core.LEVEL_GA4, core.LEVEL_NONE) else core.LEVEL_NONE
        if prof.verification_manual and level != core.LEVEL_OWNER:
            # A superadmin verified this site by hand; automatic checks never take it away.
            existing_detail["auto_check"] = {"level": level, "at": iso(datetime.utcnow())}
            prof.verification_detail = json.dumps(existing_detail)
            await db.commit()
            return {"success": True, "level": prof.verification_level, "changed": False}

        changed = prof.verification_level != level
        prof.verification_level = level
        prof.verification_checked_at = datetime.utcnow()
        prof.verification_detail = json.dumps(body.detail or {})
        if body.gsc_site_url is not None:
            prof.gsc_site_url = body.gsc_site_url.strip()[:255] or None

        # Keep the pre-v3 columns coherent for older readers (superadmin, sponsor index).
        if level == core.LEVEL_OWNER:
            entry.verification_status = "verified"
            entry.is_verified = True
            if body.host:
                entry.verified_host = body.host[:255]
        elif level == core.LEVEL_GA4:
            entry.verification_status = "ga4_only"
            entry.is_verified = False
        else:
            reason = ((body.detail or {}).get("ga4") or {}).get("reason")
            entry.verification_status = "host_mismatch" if reason in ("host_mismatch", "no_web_stream") else "pending"
            entry.is_verified = False
        prof.updated_at = datetime.utcnow()
        entry.updated_at = datetime.utcnow()
        await db.commit()
        return {"success": True, "level": level, "changed": changed}

    @router.put("/entry/{entry_id}/metrics")
    async def put_metrics(entry_id: int, body: MetricsBody, db=Depends(get_db)):
        entry = (await db.execute(select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id))).scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        today = _today()
        oldest = today - timedelta(days=core.DAILY_RETENTION_DAYS)

        # Daily rows: merge by (entry, day); only provided, non-null columns overwrite.
        incoming: Dict[date, Dict[str, Optional[int]]] = {}
        for row in body.daily:
            d = core.parse_day(row.date)
            if d is None or d < oldest or d > today:
                continue
            incoming[d] = {
                "users": core.clean_int(row.users), "sessions": core.clean_int(row.sessions),
                "pageviews": core.clean_int(row.pageviews), "clicks": core.clean_int(row.clicks),
                "impressions": core.clean_int(row.impressions),
            }
        existing = {
            r.day: r
            for r in (await db.execute(select(LeaderboardDaily).where(LeaderboardDaily.entry_id == entry_id))).scalars().all()
        }
        for d, vals in incoming.items():
            rec = existing.get(d)
            if rec is None:
                rec = LeaderboardDaily(entry_id=entry_id, day=d)
                db.add(rec)
                existing[d] = rec
            for key, val in vals.items():
                if val is not None:
                    setattr(rec, key, val)
        for d, rec in list(existing.items()):
            if d < oldest:
                await db.delete(rec)
                del existing[d]
        await db.flush()

        # Range totals. GA4 unique visitors + engagement come from the caller; additive
        # metrics (pageviews, clicks, impressions) are summed from the daily rows.
        pv_col = {d: r.pageviews for d, r in existing.items()}
        click_col = {d: r.clicks for d, r in existing.items()}
        impr_col = {d: r.impressions for d, r in existing.items()}
        click_days = [d for d, r in existing.items() if r.clicks is not None]
        gsc_end = max(click_days) if click_days else None
        for rk, days in core.RANGES.items():
            ga = body.ranges.get(rk)
            ga_w = core.window(days, today)
            row = (await db.execute(select(LeaderboardRangeStat).where(
                LeaderboardRangeStat.entry_id == entry_id, LeaderboardRangeStat.range_key == rk
            ))).scalar_one_or_none()
            if row is None:
                row = LeaderboardRangeStat(entry_id=entry_id, range_key=rk)
                db.add(row)
            if ga is not None:
                row.visitors = core.clean_int(ga.visitors)
                row.visitors_prev = core.clean_int(ga.visitors_prev)
                row.engagement_rate = core.clean_float(ga.engagement_rate)
                row.bounce_rate = core.clean_float(ga.bounce_rate)
                row.avg_session_duration = core.clean_float(ga.avg_session_duration)
            row.pageviews = core.sum_days(pv_col, ga_w["cur_start"], ga_w["cur_end"])
            row.pageviews_prev = core.sum_days(pv_col, ga_w["prev_start"], ga_w["prev_end"])
            if gsc_end is not None:
                gw = core.window(days, gsc_end)
                row.clicks = core.sum_days(click_col, gw["cur_start"], gw["cur_end"])
                row.clicks_prev = core.sum_days(click_col, gw["prev_start"], gw["prev_end"])
                row.impressions = core.sum_days(impr_col, gw["cur_start"], gw["cur_end"])
                row.impressions_prev = core.sum_days(impr_col, gw["prev_start"], gw["prev_end"])
            row.updated_at = datetime.utcnow()

        # Pre-v3 columns follow the 28-day numbers so older readers keep working.
        ga28 = body.ranges.get("28d")
        if ga28 is not None and ga28.visitors is not None:
            entry.monthly_visitors = core.clean_int(ga28.visitors) or 0
            entry.visitor_trend = core.delta_pct(ga28.visitors, ga28.visitors_prev) or 0.0
            w28 = core.window(28, today)
            pv28 = core.sum_days(pv_col, w28["cur_start"], w28["cur_end"])
            if pv28 is not None:
                entry.monthly_pageviews = pv28
            if ga28.engagement_rate is not None:
                entry.engagement_rate = ga28.engagement_rate
            if ga28.bounce_rate is not None:
                entry.bounce_rate = ga28.bounce_rate
            if ga28.avg_session_duration is not None:
                entry.avg_session_duration = ga28.avg_session_duration
        if body.primary_country and len(body.primary_country) == 2:
            entry.primary_country = body.primary_country.upper()
        entry.last_refreshed = datetime.utcnow()
        await db.commit()
        return {"success": True, "days": len(incoming)}

    return router
