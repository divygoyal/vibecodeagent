"""Leaderboard v3: pure logic (no database, no FastAPI).

Everything that decides what a stranger may see lives here so it can be unit
tested and so there is exactly one place to audit:

    privacy        normalise / default the owner's settings
    visibility     which entries are public, which rank
    metrics        exact | range | hidden values, range bands, deltas
    series         daily points, normalised "shape only" series for range mode
    breakdowns     countries / channels / devices / pages / queries, section toggles

The DB layer (leaderboard_v3.py) loads rows into plain dicts and calls these
functions; nothing public is serialised without passing through them.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence

# ─── constants ───────────────────────────────────────────────────────────────

RANGES: Dict[str, int] = {"7d": 7, "28d": 28, "3m": 90}
DEFAULT_RANGE = "28d"
# Days of daily history kept per entry: 3m now + 3m before it for the delta.
DAILY_RETENTION_DAYS = 190

METRICS = ("visitors", "clicks", "pageviews", "impressions", "engagement")
VIS_EXACT, VIS_RANGE, VIS_HIDDEN = "exact", "range", "hidden"
VIS_MODES = (VIS_EXACT, VIS_RANGE, VIS_HIDDEN)
SECTIONS = ("countries", "channels", "devices", "pages", "queries")
OPEN_TO = ("sponsorships", "acquisition", "partnerships")

LEVEL_OWNER, LEVEL_GA4, LEVEL_NONE = "owner", "ga4", "none"
LEVEL_LABELS = {
    LEVEL_OWNER: "Verified owner (Search Console)",
    LEVEL_GA4: "GA4 connected",
    LEVEL_NONE: "Pending verification",
}

# Conservative defaults for new listings: visitors and clicks exact, everything
# else hidden until the owner turns it on. "live" (realtime active users) is opt-in.
DEFAULT_PRIVACY: Dict[str, Any] = {
    "v": 1,
    "metrics": {
        "visitors": VIS_EXACT,
        "clicks": VIS_EXACT,
        "pageviews": VIS_HIDDEN,
        "impressions": VIS_HIDDEN,
        "engagement": VIS_HIDDEN,
    },
    "sections": {s: False for s in SECTIONS},
    "live": False,
}

# What a listing that existed before v3 already shows publicly today (numbers and
# the audience panel). Applied only to entries with no leaderboard_profiles row, so
# shipping v3 does not silently hide anyone's page; the owner is asked to review.
LEGACY_PRIVACY: Dict[str, Any] = {
    "v": 1,
    "metrics": {
        "visitors": VIS_EXACT,
        "clicks": VIS_EXACT,
        "pageviews": VIS_EXACT,
        "impressions": VIS_HIDDEN,
        "engagement": VIS_EXACT,
    },
    "sections": {s: True for s in SECTIONS},
    "live": False,
}

# Legacy `looking_for` values -> new open_to flags.
LEGACY_LOOKING_FOR_MAP = {"partner": "partnerships", "buyer": "acquisition"}

# ─── privacy settings ───────────────────────────────────────────────────────


def _loads(raw: Any, fallback: Any) -> Any:
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def normalize_privacy(raw: Any, base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Merge user input over `base` (default: conservative defaults). Unknown keys
    and invalid values are dropped, so a stored blob can never widen what is shown."""
    base = base or DEFAULT_PRIVACY
    data = _loads(raw, {})
    if not isinstance(data, dict):
        data = {}
    out: Dict[str, Any] = {
        "v": 1,
        "metrics": dict(base["metrics"]),
        "sections": dict(base["sections"]),
        "live": bool(base.get("live", False)),
    }
    metrics = data.get("metrics")
    if isinstance(metrics, dict):
        for key in METRICS:
            if metrics.get(key) in VIS_MODES:
                out["metrics"][key] = metrics[key]
    sections = data.get("sections")
    if isinstance(sections, dict):
        for key in SECTIONS:
            if isinstance(sections.get(key), bool):
                out["sections"][key] = sections[key]
    if isinstance(data.get("live"), bool):
        out["live"] = data["live"]
    return out


def normalize_open_to(raw: Any) -> List[str]:
    data = _loads(raw, [])
    if not isinstance(data, list):
        return []
    seen: List[str] = []
    for item in data:
        if item in OPEN_TO and item not in seen:
            seen.append(item)
    return seen


def legacy_open_to(looking_for_raw: Any) -> List[str]:
    values = _loads(looking_for_raw, [])
    out: List[str] = []
    if isinstance(values, list):
        for v in values:
            mapped = LEGACY_LOOKING_FOR_MAP.get(str(v).lower())
            if mapped and mapped not in out:
                out.append(mapped)
    return out


def settings_for(profile: Optional[Dict[str, Any]], entry: Dict[str, Any]) -> Dict[str, Any]:
    """The effective privacy + open_to for an entry, with or without a profile row."""
    if profile is None:
        return {
            "privacy": json.loads(json.dumps(LEGACY_PRIVACY)),
            "open_to": legacy_open_to(entry.get("looking_for")),
            "is_paused": False,
            "legacy": True,
        }
    privacy_raw = profile.get("privacy_json")
    if privacy_raw:
        privacy = normalize_privacy(privacy_raw)
    else:
        privacy = normalize_privacy({})
    open_to_raw = profile.get("open_to_json")
    open_to = normalize_open_to(open_to_raw) if open_to_raw is not None else legacy_open_to(entry.get("looking_for"))
    return {
        "privacy": privacy,
        "open_to": open_to,
        "is_paused": bool(profile.get("is_paused")),
        "legacy": False,
    }


# ─── verification / visibility ──────────────────────────────────────────────


def effective_level(entry: Dict[str, Any], profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """{level, checked_at, grace, manual}.

    With a profile row that has been checked, the stored level wins. A legacy entry
    that was GA4-verified under the old rules and has not been re-checked by v3 yet
    stays ranked ("grace") so deploying v3 does not empty the board; its first
    Search Console check decides.
    """
    if profile is not None and profile.get("verification_checked_at") is not None:
        return {
            "level": profile.get("verification_level") or LEVEL_NONE,
            "checked_at": profile.get("verification_checked_at"),
            "grace": False,
            "manual": bool(profile.get("verification_manual")),
        }
    legacy_verified = entry.get("verification_status") == "verified" or bool(entry.get("is_verified"))
    if legacy_verified:
        return {"level": LEVEL_GA4, "checked_at": None, "grace": True, "manual": False}
    return {"level": LEVEL_NONE, "checked_at": None, "grace": False, "manual": False}


def is_ranked(level_info: Dict[str, Any]) -> bool:
    return level_info["level"] == LEVEL_OWNER or bool(level_info.get("grace"))


def is_listed(entry: Dict[str, Any], profile: Optional[Dict[str, Any]]) -> bool:
    """Public at all: active, not paused. (Ranking is a separate question.)"""
    if not entry.get("is_active"):
        return False
    if profile is not None and profile.get("is_paused"):
        return False
    return True


def is_public_ranked(entry: Dict[str, Any], profile: Optional[Dict[str, Any]]) -> bool:
    return is_listed(entry, profile) and is_ranked(effective_level(entry, profile))


def level_public(level_info: Dict[str, Any], detail: Any = None) -> Dict[str, Any]:
    detail = _loads(detail, {})
    ga4_ok = False
    if isinstance(detail, dict):
        ga4 = detail.get("ga4")
        ga4_ok = bool(isinstance(ga4, dict) and ga4.get("ok"))
    level = level_info["level"]
    checked = level_info.get("checked_at")
    return {
        "level": level,
        "label": LEVEL_LABELS.get(level, LEVEL_LABELS[LEVEL_NONE]),
        "ga4_connected": ga4_ok or level == LEVEL_GA4,
        "ranked": is_ranked(level_info),
        "checked_at": checked.isoformat() + ("Z" if checked.tzinfo is None else "") if isinstance(checked, datetime) else None,
    }


# ─── metrics ────────────────────────────────────────────────────────────────

_BANDS = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000]


def _compact(n: int) -> str:
    if n >= 1_000_000:
        v = n / 1_000_000
        return f"{v:g}M"
    if n >= 1_000:
        v = n / 1_000
        return f"{v:g}K"
    return str(n)


def range_label(value: Optional[float]) -> Optional[str]:
    """'10K–50K' style band for a value. Never reveals more than the band."""
    if value is None:
        return None
    v = max(int(round(value)), 0)
    if v <= 0:
        return "0"
    if v < _BANDS[0]:
        return f"Under {_compact(_BANDS[0])}"
    if v >= _BANDS[-1]:
        return f"{_compact(_BANDS[-1])}+"
    for lo, hi in zip(_BANDS, _BANDS[1:]):
        if lo <= v < hi:
            return f"{_compact(lo)}–{_compact(hi)}"
    return f"{_compact(_BANDS[-1])}+"


def delta_pct(current: Optional[float], previous: Optional[float]) -> Optional[float]:
    """Percent change; None when there is nothing to compare against."""
    if current is None or previous is None or previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


def public_metric(mode: str, current: Optional[float], previous: Optional[float]) -> Optional[Dict[str, Any]]:
    """The only shape a count metric takes in a public response (or None = hidden)."""
    if mode == VIS_HIDDEN or current is None:
        return None
    d = delta_pct(current, previous)
    if mode == VIS_RANGE:
        return {"mode": VIS_RANGE, "label": range_label(current), "delta_pct": d}
    return {"mode": VIS_EXACT, "value": int(round(current)), "delta_pct": d}


def public_engagement(mode: str, rate: Optional[float], bounce: Optional[float], avg_secs: Optional[float]) -> Optional[Dict[str, Any]]:
    """Ratios are not counts, so 'range' shows them rounded to a 10-point band."""
    if mode == VIS_HIDDEN or rate is None:
        return None
    if mode == VIS_RANGE:
        lo = int(rate // 10) * 10
        return {"mode": VIS_RANGE, "label": f"{lo}–{min(lo + 10, 100)}%"}
    return {
        "mode": VIS_EXACT,
        "rate": round(rate, 1),
        "bounce_rate": round(bounce, 1) if bounce is not None else None,
        "avg_session_seconds": int(round(avg_secs)) if avg_secs is not None else None,
    }


def window(days: int, end: date) -> Dict[str, date]:
    """Current and previous windows of `days` days ending on `end` (inclusive)."""
    cur_start = end - timedelta(days=days - 1)
    prev_end = cur_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return {"cur_start": cur_start, "cur_end": end, "prev_start": prev_start, "prev_end": prev_end}


def sum_days(rows: Dict[date, Optional[int]], start: date, end: date) -> Optional[int]:
    """Sum of daily values in [start, end]; None when the source has no data at all in it."""
    total = 0
    seen = False
    d = start
    while d <= end:
        v = rows.get(d)
        if v is not None:
            total += v
            seen = True
        d += timedelta(days=1)
    return total if seen else None


# ─── series ─────────────────────────────────────────────────────────────────


def daily_points(rows: Dict[date, Optional[int]], start: date, end: date) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    d = start
    while d <= end:
        v = rows.get(d)
        out.append({"d": d.isoformat(), "v": v})
        d += timedelta(days=1)
    return out


def downsample(values: Sequence[Optional[float]], max_points: int) -> List[Optional[float]]:
    """Average into at most `max_points` buckets (None buckets stay None)."""
    n = len(values)
    if n <= max_points or max_points <= 0:
        return list(values)
    out: List[Optional[float]] = []
    for i in range(max_points):
        a = int(i * n / max_points)
        b = int((i + 1) * n / max_points)
        chunk = [v for v in values[a:b] if v is not None]
        out.append(sum(chunk) / len(chunk) if chunk else None)
    return out


def shape_only(values: Sequence[Optional[float]]) -> List[Optional[float]]:
    """0-100 index of a series (min -> 0, max -> 100): the shape, not the scale."""
    nums = [v for v in values if v is not None]
    if not nums:
        return list(values)
    lo, hi = min(nums), max(nums)
    span = hi - lo
    out: List[Optional[float]] = []
    for v in values:
        if v is None:
            out.append(None)
        elif span <= 0:
            out.append(50.0)
        else:
            out.append(round((v - lo) / span * 100, 1))
    return out


def public_series(mode: str, points: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Chart series for one metric. exact -> values; range -> shape only; hidden -> None."""
    if mode == VIS_HIDDEN:
        return None
    values = [p["v"] for p in points]
    if all(v is None for v in values):
        return None
    if mode == VIS_RANGE:
        shaped = shape_only(values)
        return {"mode": VIS_RANGE, "points": [{"d": p["d"], "v": s} for p, s in zip(points, shaped)]}
    return {"mode": VIS_EXACT, "points": [{"d": p["d"], "v": v} for p, v in zip(points, values)]}


def public_sparkline(mode: str, values: Sequence[Optional[float]], max_points: int = 30) -> Optional[List[Optional[float]]]:
    if mode == VIS_HIDDEN or all(v is None for v in values):
        return None
    sampled = downsample(values, max_points)
    if mode == VIS_RANGE:
        return shape_only(sampled)
    return [None if v is None else round(v, 1) for v in sampled]


# ─── breakdowns (audience) ──────────────────────────────────────────────────


def public_breakdowns(audience: Optional[Dict[str, Any]], privacy: Dict[str, Any]) -> Dict[str, Any]:
    """Audience sections the owner allows. Sections that are off are absent (not empty).

    Absolute counts inside a section follow the metric they count: page `views`
    needs pageviews exact, query `clicks` needs clicks exact, `impressions` needs
    impressions exact; otherwise only shares/order are returned.
    """
    out: Dict[str, Any] = {}
    if not audience:
        return out
    sections = privacy["sections"]
    metrics = privacy["metrics"]

    def share_list(key: str) -> Optional[List[Dict[str, Any]]]:
        items = audience.get(key)
        if not isinstance(items, list):
            return None
        cleaned = []
        for it in items:
            if isinstance(it, dict) and it.get("name") is not None and isinstance(it.get("share"), (int, float)):
                row = {"name": str(it["name"])[:80], "share": float(it["share"])}
                if it.get("iso2"):
                    row["iso2"] = str(it["iso2"])[:2]
                cleaned.append(row)
        return cleaned or None

    if sections["countries"]:
        v = share_list("countries")
        if v:
            out["countries"] = v
    if sections["channels"]:
        v = share_list("channels")
        if v:
            out["channels"] = v
    if sections["devices"]:
        v = share_list("devices")
        if v:
            out["devices"] = v
    if sections["pages"]:
        pages = audience.get("top_pages")
        if isinstance(pages, list) and pages:
            rows = []
            for p in pages:
                if not isinstance(p, dict) or not p.get("path"):
                    continue
                row: Dict[str, Any] = {"path": str(p["path"])[:200], "share": float(p.get("share") or 0)}
                if metrics["pageviews"] == VIS_EXACT and isinstance(p.get("views"), (int, float)):
                    row["views"] = int(p["views"])
                rows.append(row)
            if rows:
                out["pages"] = rows
    if sections["queries"]:
        queries = audience.get("top_queries")
        if isinstance(queries, list) and queries:
            rows = []
            for q in queries:
                if not isinstance(q, dict) or not q.get("query"):
                    continue
                row = {"query": str(q["query"])[:160]}
                if metrics["clicks"] == VIS_EXACT and isinstance(q.get("clicks"), (int, float)):
                    row["clicks"] = int(q["clicks"])
                if metrics["impressions"] == VIS_EXACT and isinstance(q.get("impressions"), (int, float)):
                    row["impressions"] = int(q["impressions"])
                rows.append(row)
            if rows:
                out["queries"] = rows
    return out


def public_topics(audience: Optional[Dict[str, Any]], privacy: Dict[str, Any], limit: int = 4) -> List[str]:
    """Topic labels are derived from queries and pages, so they follow those toggles."""
    if not audience or not (privacy["sections"]["queries"] or privacy["sections"]["pages"]):
        return []
    topics = audience.get("topics")
    if not isinstance(topics, list):
        return []
    ranked = sorted(
        (t for t in topics if isinstance(t, dict) and t.get("label")),
        key=lambda t: -(t.get("share") or 0),
    )
    return [str(t["label"])[:60] for t in ranked[:limit]]


# ─── legacy response shapes ─────────────────────────────────────────────────


def legacy_public_fields(entry: Dict[str, Any], privacy: Dict[str, Any]) -> Dict[str, Any]:
    """Privacy-applied replacement for the numeric fields the pre-v3 endpoints return.

    `monthly_visitors` is the exact number or None; `*_label` carries the band when
    the owner chose range. Hidden -> None / no label.
    """
    m = privacy["metrics"]
    out: Dict[str, Any] = {}
    visitors = entry.get("monthly_visitors") or 0
    out["monthly_visitors"] = visitors if m["visitors"] == VIS_EXACT else None
    out["monthly_visitors_label"] = range_label(visitors) if m["visitors"] == VIS_RANGE else None
    pv = entry.get("monthly_pageviews") or 0
    out["monthly_pageviews"] = pv if m["pageviews"] == VIS_EXACT else None
    out["monthly_pageviews_label"] = range_label(pv) if m["pageviews"] == VIS_RANGE else None
    show_eng = m["engagement"] == VIS_EXACT
    out["engagement_rate"] = (entry.get("engagement_rate") or 0) if show_eng else None
    out["bounce_rate"] = (entry.get("bounce_rate") or 0) if show_eng else None
    out["avg_session_duration"] = (entry.get("avg_session_duration") or 0) if show_eng else None
    out["visitor_trend"] = entry.get("visitor_trend") if m["visitors"] != VIS_HIDDEN else None
    return out


# ─── inputs ─────────────────────────────────────────────────────────────────

MAX_INQUIRY_MESSAGE = 2000


def parse_day(value: Any) -> Optional[date]:
    """'YYYYMMDD' (GA4) or 'YYYY-MM-DD'."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not value:
        return None
    s = str(value).replace("-", "")
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except (ValueError, IndexError):
        return None


def clean_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(n, 0)


def clean_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def sort_key_none_last(value: Optional[float], descending: bool = True) -> tuple:
    if value is None:
        return (1, 0)
    return (0, -value if descending else value)


def chunks(items: Iterable[Any], size: int) -> Iterable[List[Any]]:
    batch: List[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch
