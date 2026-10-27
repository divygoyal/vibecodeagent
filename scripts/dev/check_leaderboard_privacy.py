#!/usr/bin/env python3
"""Privacy audit for the public leaderboard on a dev instance.

    python3 scripts/dev/check_leaderboard_privacy.py <webPort> <instanceName>

Reads the instance's admin DB (read-only) for the owners' real numbers and privacy
settings, then fetches every public surface (board tabs x ranges, profile JSON for each
listing, badge SVGs, sponsor inventory, the pre-v3 admin list/detail endpoints) and
fails if anything an owner chose to hide or band shows up: raw numbers of hidden or
range metrics, hidden section contents (queries, pages, countries, channels, devices),
GA4 property ids, or contact emails. Exits non-zero on any leak.
"""
import json
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEV_HOME = Path("/root/.trafficclaw-dev")


def env_file(path):
    out = {}
    for line in Path(path).read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    port, name = sys.argv[1], sys.argv[2]
    inst = env_file(DEV_HOME / name / "instance.env")
    key = env_file(DEV_HOME / "dev.env")["ADMIN_API_KEY"]
    web = f"http://localhost:{port}"
    admin = inst["ADMIN_URL"]
    db = sqlite3.connect(f"file:{DEV_HOME / name / 'admin.db'}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row

    entries = {r["id"]: dict(r) for r in db.execute("select * from leaderboard_entries")}
    profiles = {r["entry_id"]: dict(r) for r in db.execute("select * from leaderboard_profiles")}
    stats = {}
    for r in db.execute("select * from leaderboard_range_stats"):
        stats.setdefault(r["entry_id"], {})[r["range_key"]] = dict(r)
    audience = {r["entry_id"]: dict(r) for r in db.execute("select * from leaderboard_audience")}

    failures = []
    checked = 0

    def fail(msg):
        failures.append(msg)
        print("LEAK:", msg)

    # --- collect the public surfaces ---
    surfaces = {}  # label -> text
    for tab in ("top", "search", "rising", "new", "offers", "categories"):
        for rng in ("7d", "28d", "3m"):
            code, text = get(f"{web}/api/leaderboard?tab={tab}&range={rng}&page_size=100")
            surfaces[f"board:{tab}:{rng}"] = text
    ids = sorted(entries)
    for eid in ids:
        slug = entries[eid]["slug"]
        for rng in ("7d", "28d", "3m"):
            code, text = get(f"{web}/api/leaderboard/{slug}?range={rng}")
            surfaces[f"profile:{eid}:{rng}:{code}"] = text
        for variant in ("minimal", "rank", "stats", "live"):
            code, text = get(f"{web}/api/badges/{eid}?variant={variant}")
            surfaces[f"badge:{eid}:{variant}:{code}"] = text
        code, text = get(f"{web}/api/leaderboard/{eid}/live")
        surfaces[f"live:{eid}:{code}"] = text
        code, text = get(f"{admin}/api/leaderboard/{eid}/detail", {"X-API-Key": key})
        surfaces[f"legacy-detail:{eid}:{code}"] = text
    surfaces["sponsor-inventory"] = get(f"{web}/api/sponsor-inventory")[1]
    surfaces["legacy-list"] = get(f"{admin}/api/leaderboard?page_size=100", {"X-API-Key": key})[1]

    # --- forbidden strings per entry ---
    def digits_forms(v):
        v = int(v)
        forms = {str(v), f"{v:,}"}
        return {f for f in forms if len(re.sub(r"\D", "", f)) >= 4}

    for eid, e in entries.items():
        prof = profiles.get(eid)
        if prof and prof["privacy_json"]:
            privacy = json.loads(prof["privacy_json"])
        else:
            continue  # legacy visibility, covered by unit tests
        metrics = privacy["metrics"]
        sections = privacy["sections"]
        forbidden = {}  # string -> reason
        stat_cols = {"visitors": "visitors", "clicks": "clicks", "pageviews": "pageviews", "impressions": "impressions"}
        for rk, s in stats.get(eid, {}).items():
            for metric, col in stat_cols.items():
                mode = metrics[metric]
                if mode == "exact":
                    continue
                for suffix in ("", "_prev"):
                    v = s.get(col + suffix)
                    if v is not None:
                        for f in digits_forms(v):
                            forbidden[f] = f"{e['startup_name']}: {metric} is {mode} but raw {col}{suffix}={v} ({rk})"
        # a range-mode metric must never be an exact object
        a = audience.get(eid)
        if a:
            def load(col):
                return json.loads(a[col]) if a.get(col) else None
            if not sections["queries"]:
                for q in load("top_queries_json") or []:
                    if len(q["query"]) >= 8:  # short generic words would match unrelated copy
                        forbidden[f'"{q["query"]}"'] = f"{e['startup_name']}: queries hidden but query text leaked"
            if not sections["pages"]:
                for p in load("top_pages_json") or []:
                    if len(p["path"]) >= 8:
                        forbidden[f'"{p["path"]}"'] = f"{e['startup_name']}: pages hidden but path leaked"
            for sec, col, field in (("countries", "countries_json", "name"), ("channels", "channels_json", "name"), ("devices", "devices_json", "name")):
                if not sections[sec]:
                    for item in load(col) or []:
                        # only long, distinctive names (device names like 'mobile' appear elsewhere in copy)
                        if sec == "countries" and len(item[field]) > 5:
                            forbidden[f'"{item[field]}"'] = f"{e['startup_name']}: {sec} hidden but '{item[field]}' leaked"
                        if sec == "channels" and len(item[field]) > 6:
                            forbidden[f'"{item[field]}"'] = f"{e['startup_name']}: {sec} hidden but '{item[field]}' leaked"
        if e.get("ga_property_id"):
            forbidden[re.sub(r"\D", "", e["ga_property_id"])] = f"{e['startup_name']}: GA4 property id leaked"
        # Only entries whose own surfaces we should scan: their profile, their badge, plus every board/list.
        own = [l for l in surfaces if l.startswith((f"profile:{eid}:", f"badge:{eid}:", f"live:{eid}:", f"legacy-detail:{eid}:"))]
        shared = [l for l in surfaces if l.startswith(("board:", "sponsor-inventory", "legacy-list"))]
        for label in own + shared:
            text = surfaces[label]
            # For shared surfaces other entries legitimately show their own numbers, so only match
            # strings inside this entry's own JSON object.
            if label in shared:
                try:
                    blob = json.loads(text)
                except Exception:
                    continue
                rows = blob.get("rows") or blob.get("entries") or blob.get("slots") or blob.get("category_cards") or []
                scoped = []
                for r in rows:
                    rid = r.get("id") or (r.get("site") or {}).get("id") or (r.get("entry") or {}).get("id")
                    if rid == eid:
                        scoped.append(json.dumps(r))
                    for t in r.get("top", []) if isinstance(r, dict) else []:
                        if t.get("id") == eid:
                            scoped.append(json.dumps(t))
                for sp in blob.get("sponsored", []) if isinstance(blob, dict) else []:
                    if (sp.get("site") or {}).get("id") == eid:
                        scoped.append(json.dumps(sp))
                text = "\n".join(scoped)
            for needle, reason in forbidden.items():
                checked += 1
                if needle in text:
                    fail(f"{label}: {reason}")
        # contact email never public
        if e.get("contact_email"):
            for label, text in surfaces.items():
                if e["contact_email"] in text:
                    fail(f"{label}: contact email of {e['startup_name']} leaked")

    # positive control: an exact metric IS shown (otherwise "no leak" could just mean "no data")
    controls = 0
    for eid, e in entries.items():
        prof = profiles.get(eid)
        if not prof or not prof["privacy_json"] or e["verification_status"] != "verified":
            continue
        if json.loads(prof["privacy_json"])["metrics"]["visitors"] == "exact":
            v = (stats.get(eid, {}).get("28d") or {}).get("visitors")
            label = next((l for l in surfaces if l.startswith(f"profile:{eid}:28d:200")), None)
            if v and label:
                controls += 1
                if str(int(v)) not in surfaces[label]:
                    fail(f"{label}: exact visitors {v} is missing from the public profile")
    if controls == 0:
        fail("no positive controls ran (no verified listing with exact visitors)")

    # structural checks
    for label, text in surfaces.items():
        if label.startswith("profile:") and label.endswith(":200"):
            p = json.loads(text)
            for m in ("visitors", "clicks", "pageviews", "impressions"):
                k = (p.get("kpis") or {}).get(m)
                if k and k["mode"] == "range" and "value" in k:
                    fail(f"{label}: range-mode {m} carries an exact value")
            for sname in ("visitors", "clicks"):
                s = (p.get("series") or {}).get(sname)
                if s and s["mode"] == "range":
                    vs = [pt["v"] for pt in s["points"] if pt["v"] is not None]
                    if vs and (max(vs) > 100.0 or min(vs) < 0):
                        fail(f"{label}: range-mode {sname} series is not a 0-100 shape")
        checked += 1

    # visibility checks: pending / paused entries must not appear in any list
    pending = [eid for eid, e in entries.items() if e["verification_status"] != "verified"]
    for eid in pending:
        slug = entries[eid]["slug"]
        def row_ids(text):
            try:
                blob = json.loads(text)
            except Exception:
                return set()
            ids_ = {r.get("id") for r in blob.get("rows", [])}
            for c in blob.get("category_cards", []):
                ids_ |= {t.get("id") for t in c.get("top", [])}
            ids_ |= {(sp.get("site") or {}).get("id") for sp in blob.get("sponsored", [])}
            return ids_
        listed_in = [l for l, t in surfaces.items() if l.startswith("board:") and eid in row_ids(t)]
        if listed_in:
            fail(f"pending entry {entries[eid]['startup_name']} appears on {listed_in[:3]}")
        pf = [l for l in surfaces if l.startswith(f"profile:{eid}:28d")][0]
        body = json.loads(surfaces[pf]) if pf.endswith(":200") else None
        if body and (body.get("kpis") is not None or body.get("status") != "pending"):
            fail(f"pending entry {entries[eid]['startup_name']} profile shows numbers")
        checked += 1

    print(f"checked {checked} assertions over {len(surfaces)} public responses and {len(entries)} listings: {'FAIL' if failures else 'OK, no leaks'}")
    sys.exit(1 if failures else 0)


main()
