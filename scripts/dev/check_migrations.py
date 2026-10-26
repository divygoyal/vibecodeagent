#!/usr/bin/env python3
"""
Upgrade check for admin migrations 019-023 (MCP, portfolio, leaderboard v3,
builder v2, site action states) on a COPY of an old-schema database.

  /root/.trafficclaw-dev/venv/bin/python scripts/dev/check_migrations.py [--old-ref 1b62be9] [--port 8130] [--keep]

1. Exports admin/ at --old-ref (the live commit before the redesign) into a
   temp dir and starts it on its own port against a fresh SQLite file. Seeds
   an existing user, two v1 dashboards (one shared publicly), a verified and a
   pending leaderboard entry, through the old admin's own API. Stops it.
2. Copies that DB and starts THIS worktree's admin against the copy (all
   startup migrations run in place). Checks: every old table and column is
   still there (additive), the new tables/columns exist, the user, dashboards,
   public share link and leaderboard entries survive and still read correctly.
3. Restarts the new admin on the same copy (idempotency): no traceback, schema
   and row counts unchanged.
4. Delete cascade: a second user with portfolio, site action, MCP and
   leaderboard rows is deleted; their rows in the new tables are gone.

Everything runs on 127.0.0.1 with throwaway keys, in Docker stub mode, in a
temp dir that is removed at the end (unless --keep). It never touches the dev
instances or production. Exit code 0 = all checks passed.
"""
import argparse
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VENV_PY = Path(os.environ.get("TC_VENV", "/root/.trafficclaw-dev/venv")) / "bin" / "python"
KEY = "check-migrations-key"

NEW_TABLES = {
    "019": ["mcp_oauth_clients", "mcp_auth_codes", "mcp_tokens", "mcp_grants", "mcp_audit"],
    "020": ["portfolio_assets", "site_daily_metrics", "portfolio_range_totals"],
    "021": ["leaderboard_profiles", "leaderboard_daily", "leaderboard_range_stats", "leaderboard_inquiries"],
    "022": ["custom_dashboard_versions"],
    "023": ["site_action_states"],
}
NEW_COLUMNS = {"custom_dashboards": ["doc", "rev", "schema_version", "share_settings", "share_password_hash", "thumbnail"]}

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}", flush=True)
    return ok


def http(port, method, path, body=None, params=None):
    url = f"http://127.0.0.1:{port}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def start_admin(admin_dir: Path, db: Path, port: int, workdir: Path, log: Path, fernet: str):
    workdir.mkdir(parents=True, exist_ok=True)
    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": os.environ.get("HOME", "/root"), "LANG": "C.UTF-8", "TZ": "UTC",
        "PYTHONUNBUFFERED": "1",
        "DATABASE_URL": f"sqlite+aiosqlite:///{db}",
        "ADMIN_API_KEY": KEY,
        "OAUTH_TOKEN_ENC_KEY": fernet,
        "DOCKER_HOST": f"unix://{workdir}/no-docker.sock",
        "DATA_DIR": str(workdir / "data"),
        "PLUGINS_DIR": str(REPO / "plugins"),
    }
    fh = open(log, "a")
    proc = subprocess.Popen(
        [str(VENV_PY), "-m", "uvicorn", "main:app", "--app-dir", str(admin_dir), "--host", "127.0.0.1", "--port", str(port)],
        cwd=workdir, env=env, stdout=fh, stderr=subprocess.STDOUT, start_new_session=True,
    )
    deadline = time.time() + 60
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"admin exited early (code {proc.returncode}); see {log}")
        try:
            status, _ = http(port, "GET", "/health")
            if status == 200:
                return proc
        except Exception:
            pass
        time.sleep(0.5)
    stop_admin(proc)
    raise RuntimeError(f"admin did not become healthy on {port}; see {log}")


def stop_admin(proc):
    if proc and proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)


def schema(db: Path):
    con = sqlite3.connect(db)
    try:
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        return {t: [r[1] for r in con.execute(f'PRAGMA table_info("{t}")')] for t in tables}
    finally:
        con.close()


def counts(db: Path, tables):
    con = sqlite3.connect(db)
    try:
        return {t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}
    finally:
        con.close()


def query(db: Path, sql, args=()):
    con = sqlite3.connect(db)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old-ref", default="1b62be9")
    ap.add_argument("--port", type=int, default=8130)
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    from cryptography.fernet import Fernet
    fernet = Fernet.generate_key().decode()
    tmp = Path(tempfile.mkdtemp(prefix="tc-migcheck-"))
    old_admin = tmp / "old"
    old_admin.mkdir()
    log = tmp / "admin.log"
    print(f"workdir {tmp}", flush=True)
    procs = []
    try:
        # ── 1. old schema + data ──
        archive = subprocess.run(["git", "-C", str(REPO), "archive", args.old_ref, "admin"], check=True, capture_output=True).stdout
        subprocess.run(["tar", "-x", "-C", str(old_admin)], input=archive, check=True)
        old_db = tmp / "old.db"
        p = start_admin(old_admin / "admin", old_db, args.port, tmp / "old-run", log, fernet)
        procs.append(p)
        uid = "migcheck-google-1"
        s, user = http(args.port, "POST", "/api/users", {"provider": "google", "provider_id": uid, "access_token": "a", "refresh_token": "r", "email": "existing@example.test", "github_username": "existing"})
        check("old admin: create user", s == 200, str(s))
        dash_ids = []
        for name in ("Weekly review", "SEO board"):
            s, d = http(args.port, "POST", "/api/custom-dashboards", {
                "user_identifier": uid, "name": name, "property_id": "properties/123", "site_url": "https://example.test/",
                "widgets": json.dumps([{"id": "w1", "type": "kpi", "metric": "activeUsers"}]),
            })
            check(f"old admin: create dashboard {name!r}", s == 200, str(s))
            dash_ids.append(d["id"])
        s, share = http(args.port, "POST", f"/api/custom-dashboards/{dash_ids[0]}/share", params={"user_identifier": uid})
        share_token = (share or {}).get("shareToken") or (share or {}).get("share_token")
        check("old admin: share dashboard", s == 200 and share_token, str(s))
        entry_ids = []
        for name, host, status in (("Existing Verified", "verified.example.test", "verified"), ("Existing Pending", "pending.example.test", "pending")):
            s, e = http(args.port, "POST", f"/api/leaderboard/{uid}/join", {
                "startup_name": name, "website_url": f"https://{host}", "category": "SaaS",
                "ga_property_id": f"properties/{abs(hash(host)) % 10**8}", "verification_status": status, "verified_host": host,
            })
            check(f"old admin: leaderboard join {status}", s == 200, str(s))
            entry_ids.append((e or {}).get("id"))
        stop_admin(p)
        old_schema = schema(old_db)
        old_counts = counts(old_db, [t for t in ("users", "custom_dashboards", "leaderboard_entries", "oauth_connections") if t in old_schema])
        check("old schema has none of the new tables", not any(t in old_schema for ts in NEW_TABLES.values() for t in ts))

        # ── 2. upgrade a COPY in place ──
        new_db = tmp / "upgraded.db"
        shutil.copy(old_db, new_db)
        p = start_admin(REPO / "admin", new_db, args.port + 1, tmp / "new-run", log, fernet)
        procs.append(p)
        new_schema = schema(new_db)
        missing_cols = [f"{t}.{c}" for t, cols in old_schema.items() for c in cols if c not in new_schema.get(t, [])]
        check("additive: every old table and column kept", not missing_cols, ", ".join(missing_cols[:10]))
        for mig, tables in NEW_TABLES.items():
            absent = [t for t in tables if t not in new_schema]
            check(f"migration {mig} tables exist", not absent, ", ".join(absent))
        for t, cols in NEW_COLUMNS.items():
            absent = [c for c in cols if c not in new_schema.get(t, [])]
            check(f"022 new columns on {t}", not absent, ", ".join(absent))
        check("mcp_site_links not created", "mcp_site_links" not in new_schema)
        check("row counts unchanged by the upgrade", counts(new_db, old_counts.keys()) == old_counts, json.dumps(old_counts))

        port = args.port + 1
        s, u = http(port, "GET", f"/api/users/{uid}")
        check("existing user readable", s == 200 and u and u.get("email") == "existing@example.test", str(s))
        s, c = http(port, "GET", f"/api/users/{uid}/connections")
        check("new /connections endpoint lists the user's Google connection", s == 200 and any(x.get("provider") == "google" for x in (c or {}).get("connected_providers", [])), json.dumps(c)[:200])
        check("container status in stub mode is 'disabled' or not provisioned, no error",
              s == 200 and (u or {}).get("container", {}).get("status") in ("disabled", "not_provisioned"), str((u or {}).get("container", {}).get("status")))
        s, lst = http(port, "GET", "/api/custom-dashboards", params={"user_identifier": uid})
        got = sorted(d["id"] for d in (lst or {}).get("dashboards", []))
        check("existing dashboards listed", s == 200 and got == sorted(dash_ids), f"{s} {got}")
        for did in dash_ids:
            s, d = http(port, "GET", f"/api/custom-dashboards/{did}", params={"user_identifier": uid})
            check(f"dashboard {did[:8]} opens after upgrade", s == 200 and d and d.get("name"), str(s))
        s, pub = http(port, "GET", f"/api/custom-dashboards/public/{share_token}")
        check("old public share link still works", s == 200, str(s))
        s, board = http(port, "GET", "/api/leaderboard")
        names = [e.get("startup_name") or e.get("name") for e in ((board or {}).get("entries") or (board or {}).get("rows") or [])] if isinstance(board, dict) else []
        check("legacy leaderboard list still answers", s == 200, f"{s} {names}")
        s, prof = http(port, "GET", f"/api/lb/profile/{entry_ids[0]}", params={"range": "28d"})
        check("verified legacy entry has a v3 profile (grace ranking)", s == 200 and (prof or {}).get("status") in ("ranked", "listed", "verified", "unranked"), f"{s} {(prof or {}).get('status')}")
        s, prof2 = http(port, "GET", f"/api/lb/profile/{entry_ids[1]}", params={"range": "28d"})
        check("pending legacy entry is a shell without numbers", s == 200 and (prof2 or {}).get("status") == "pending", f"{s} {(prof2 or {}).get('status')}")
        s, mine = http(port, "GET", f"/api/lb/mine/{uid}")
        mine_ids = sorted(e.get("id") for e in ((mine or {}).get("entries") or (mine or {}).get("items") or []) if isinstance(e, dict))
        check("owner still sees both leaderboard entries", s == 200 and mine_ids == sorted(entry_ids), f"{s} {mine_ids}")
        stop_admin(p)
        schema_1 = schema(new_db)
        counts_1 = counts(new_db, schema_1.keys())

        # ── 3. idempotency: start again on the upgraded copy ──
        log_mark = log.stat().st_size
        p = start_admin(REPO / "admin", new_db, port, tmp / "new-run", log, fernet)
        procs.append(p)
        second_log = log.read_text(errors="replace")[log_mark:]
        check("second start: no traceback", "Traceback" not in second_log, second_log[-300:] if "Traceback" in second_log else "")
        check("second start: schema unchanged", schema(new_db) == schema_1)
        check("second start: row counts unchanged", counts(new_db, schema_1.keys()) == counts_1)

        # ── 4. delete cascade on the new tables ──
        uid2 = "migcheck-google-2"
        s, _ = http(port, "POST", "/api/users", {"provider": "google", "provider_id": uid2, "access_token": "a", "refresh_token": "r", "email": "gone@example.test"})
        check("cascade: create second user", s == 200, str(s))
        s, _ = http(port, "PUT", f"/api/portfolio/users/{uid2}/assets", {"assets": [{"kind": "ga4", "asset_id": "properties/9", "host": "gone.test"}], "complete_kinds": []})
        check("cascade: portfolio asset stored", s == 200, str(s))
        s, _ = http(port, "PUT", "/api/site-actions/states", {"user_identifier": uid2, "site_key": "gone.test", "action_id": "a1", "status": "done", "title": "x"})
        check("cascade: site action state stored", s == 200, str(s))
        s, _ = http(port, "POST", f"/api/mcp/users/{uid2}/keys", {"token_hash": "h" * 64, "prefix": "tc_live_x", "name": "k", "audience": "http://x/mcp"})
        check("cascade: MCP API key stored", s == 200, str(s))
        user2_id = query(new_db, "SELECT id FROM users WHERE email = ?", ("gone@example.test",))[0][0]
        before = {t: query(new_db, f"SELECT COUNT(*) FROM {t} WHERE user_id = ?", (user2_id,))[0][0] for t in ("portfolio_assets", "site_action_states", "mcp_tokens")}
        s, _ = http(port, "DELETE", f"/api/users/{uid2}")
        check("cascade: delete user", s == 200, str(s))
        after = {t: query(new_db, f"SELECT COUNT(*) FROM {t} WHERE user_id = ?", (user2_id,))[0][0] for t in before}
        check("cascade: portfolio, site action and MCP rows removed", all(v > 0 for v in before.values()) and not any(after.values()), f"before {before} after {after}")
        check("cascade: the first user is untouched", http(port, "GET", f"/api/users/{uid}")[0] == 200)
        stop_admin(p)
    except Exception as exc:  # pragma: no cover - reported as a failure
        check("run", False, f"{type(exc).__name__}: {exc}")
    finally:
        for proc in procs:
            stop_admin(proc)
        failed = [r for r in results if not r[1]]
        print(f"\nmigration upgrade check: {len(results) - len(failed)}/{len(results)} passed", flush=True)
        if failed:
            print(f"admin log: {log}", flush=True)
        if not args.keep and not failed:
            shutil.rmtree(tmp, ignore_errors=True)
        else:
            print(f"kept {tmp}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (used by http())
    main()
