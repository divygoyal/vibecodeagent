"""API-level tests for /api/lb/* on a throwaway SQLite database.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_leaderboard_v3_api
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="lbv3-")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db")
os.environ.setdefault("ADMIN_API_KEY", "test-key")
os.environ.setdefault("DOCKER_HOST", f"unix://{_tmp}/no-docker.sock")
os.environ.setdefault("DATA_DIR", _tmp)
if not os.environ.get("OAUTH_TOKEN_ENC_KEY"):
    from cryptography.fernet import Fernet
    os.environ["OAUTH_TOKEN_ENC_KEY"] = Fernet.generate_key().decode()

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

KEY = {"X-API-Key": os.environ["ADMIN_API_KEY"]}


def day(n):
    return (datetime.utcnow().date() - timedelta(days=n)).isoformat()


class LeaderboardV3ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        cls.users = {}
        for name, sub in (("owner", "9001"), ("other", "9002")):
            r = cls.c.post("/api/users", headers=KEY, json={"provider": "google", "provider_id": sub, "access_token": "t", "refresh_token": "r", "email": f"{name}@x.test", "github_username": name})
            assert r.status_code == 200, r.text
            cls.users[name] = sub

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    # -- helpers --
    def join(self, name, host, user="owner", prop=None, status="pending"):
        r = self.c.post(f"/api/leaderboard/{self.users[user]}/join", headers=KEY, json={
            "startup_name": name, "website_url": f"https://{host}", "category": "SaaS",
            "ga_property_id": prop or f"properties/{abs(hash(host)) % 10**8}", "verification_status": status,
        })
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["id"]

    def verify(self, eid, level="owner", detail=None):
        r = self.c.put(f"/api/lb/entry/{eid}/verification", headers=KEY, json={"level": level, "detail": detail or {"ga4": {"ok": True}}, "host": "x.test"})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def metrics(self, eid, users=1000, clicks=200):
        daily = [{"date": day(i), "users": users // 28 + i % 3, "sessions": users // 20, "pageviews": users // 10, "clicks": clicks // 28 + i % 2 if i >= 2 else None, "impressions": (clicks * 10) // 28 if i >= 2 else None} for i in range(0, 120)]
        r = self.c.put(f"/api/lb/entry/{eid}/metrics", headers=KEY, json={
            "daily": daily,
            "ranges": {"7d": {"visitors": users // 4, "visitors_prev": users // 5}, "28d": {"visitors": users, "visitors_prev": users - 100, "engagement_rate": 61.5, "bounce_rate": 38.5, "avg_session_duration": 95}, "3m": {"visitors": users * 3, "visitors_prev": users * 2}},
            "primary_country": "US",
        })
        self.assertEqual(r.status_code, 200, r.text)

    def board(self, **params):
        r = self.c.get("/api/lb/board", headers=KEY, params=params)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def settings(self, eid, user="owner", **body):
        r = self.c.put(f"/api/lb/entry/{eid}/settings", headers=KEY, params={"user_identifier": self.users[user]}, json=body)
        self.assertEqual(r.status_code, 200, r.text)

    # -- tests --
    def test_01_requires_admin_key(self):
        self.assertEqual(self.c.get("/api/lb/board").status_code, 422)
        self.assertEqual(self.c.get("/api/lb/board", headers={"X-API-Key": "nope"}).status_code, 403)

    def test_02_unverified_never_ranks_and_profile_is_a_shell(self):
        eid = self.join("Pending Co", "pending.test")
        self.metrics(eid, users=900000)
        names = [r["name"] for r in self.board(tab="top")["rows"]]
        self.assertNotIn("Pending Co", names)
        for tab in ("new", "offers", "search", "rising", "categories"):
            self.assertNotIn("Pending Co", [r["name"] for r in self.board(tab=tab)["rows"]])
        slug = self.c.get(f"/api/lb/embed/{eid}", headers=KEY)
        self.assertEqual(slug.status_code, 404)
        # GA4-only does not rank either, but the direct profile shows the pending shell without numbers
        self.verify(eid, "ga4")
        names = [r["name"] for r in self.board(tab="top")["rows"]]
        self.assertNotIn("Pending Co", names)
        entry = self.c.get(f"/api/leaderboard/{eid}/detail", headers=KEY)
        self.assertEqual(entry.status_code, 404)

    def test_03_owner_ranks_with_conservative_defaults(self):
        eid = self.join("Ranked Co", "ranked.test", status="verified")
        self.verify(eid, "owner")
        self.metrics(eid, users=5000, clicks=700)
        top = self.board(tab="top")
        row = next(r for r in top["rows"] if r["name"] == "Ranked Co")
        self.assertEqual(row["verification"]["label"], "Verified owner (Search Console)")
        self.assertEqual(row["visitors"]["mode"], "exact")
        self.assertEqual(row["visitors"]["value"], 5000)
        self.assertEqual(row["rank"], top["rows"].index(row) + 1)
        prof = self.c.get(f"/api/lb/profile/{eid}", headers=KEY, params={"range": "28d"}).json()
        self.assertEqual(prof["status"], "ranked")
        # new listings: pageviews / impressions / engagement and every breakdown start hidden
        self.assertIsNone(prof["kpis"]["pageviews"])
        self.assertIsNone(prof["kpis"]["impressions"])
        self.assertIsNone(prof["kpis"]["engagement"])
        self.assertEqual(prof["breakdowns"], {})
        self.assertFalse(prof["live"]["enabled"])

    def test_04_range_hidden_and_pause(self):
        eid = self.join("Private Co", "private.test", status="verified")
        self.verify(eid, "owner")
        self.metrics(eid, users=20000, clicks=1234)
        self.settings(eid, privacy={"metrics": {"visitors": "range", "clicks": "hidden"}})
        row = next(r for r in self.board(tab="top")["rows"] if r["name"] == "Private Co")
        self.assertEqual(row["visitors"]["mode"], "range")
        self.assertNotIn("value", row["visitors"])
        self.assertEqual(row["visitors"]["label"], "10K–50K")
        self.assertIsNone(row["clicks"])
        # hidden clicks: not in Top search at all
        self.assertNotIn("Private Co", [r["name"] for r in self.board(tab="search")["rows"]])
        prof = self.c.get(f"/api/lb/profile/{eid}", headers=KEY).json()
        text = json.dumps(prof)
        self.assertNotIn("20000", text)
        self.assertNotIn("1234", text)
        shape = [p["v"] for p in prof["series"]["visitors"]["points"] if p["v"] is not None]
        self.assertTrue(all(0 <= v <= 100 for v in shape))
        self.assertIsNone(prof["series"]["clicks"])
        # pausing hides it everywhere
        self.settings(eid, is_paused=True)
        self.assertNotIn("Private Co", [r["name"] for r in self.board(tab="top")["rows"]])
        self.assertEqual(self.c.get(f"/api/lb/profile/{eid}", headers=KEY).status_code, 404)
        self.settings(eid, is_paused=False)
        self.assertEqual(self.c.get(f"/api/lb/profile/{eid}", headers=KEY).status_code, 200)

    def test_05_only_the_owner_edits(self):
        eid = self.join("Mine Co", "mine.test", status="verified")
        r = self.c.put(f"/api/lb/entry/{eid}/settings", headers=KEY, params={"user_identifier": self.users["other"]}, json={"is_paused": True})
        self.assertIn(r.status_code, (403, 404))
        r = self.c.delete(f"/api/lb/entry/{eid}", headers=KEY, params={"user_identifier": self.users["other"]})
        self.assertIn(r.status_code, (403, 404))
        mine = self.c.get(f"/api/lb/mine/{self.users['other']}", headers=KEY).json()
        self.assertNotIn(eid, [e["id"] for e in mine["entries"]])

    def test_06_offers_open_to_and_inbox(self):
        eid = self.join("Offers Co", "offers.test", status="verified")
        self.verify(eid, "owner")
        self.metrics(eid)
        self.settings(eid, open_to=["acquisition"])
        base = {"name": "Buyer", "email": "buyer@x.test", "message": "I would like to talk about buying the site."}
        r = self.c.post(f"/api/lb/entry/{eid}/inquiries", headers=KEY, json={**base, "kind": "sponsorship"})
        self.assertEqual(r.status_code, 400)  # not open to sponsorships, no slots
        r = self.c.post(f"/api/lb/entry/{eid}/inquiries", headers=KEY, json={**base, "kind": "acquisition", "budget": "$50k"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn("contact_email", json.dumps(self.c.get(f"/api/lb/profile/{eid}", headers=KEY).json()))
        # ad slot: a sponsorship ask is also an ad slot request
        r = self.c.put(f"/api/ad-slots/entry/{eid}", headers=KEY, params={"user_identifier": self.users["owner"]}, json={"slots": [{"name": "Banner", "price_cents": 5000, "billing_period": "month", "quantity_total": 1}]})
        self.assertEqual(r.status_code, 200, r.text)
        slot_id = r.json()["slots"][0]["id"]
        r = self.c.post(f"/api/lb/entry/{eid}/inquiries", headers=KEY, json={**base, "email": "sponsor@x.test", "kind": "sponsorship", "slot_id": slot_id})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNotNone(r.json()["ad_slot_request_id"])
        self.assertEqual(r.json()["slot"]["price_cents_at_request"], 5000)
        inbox = self.c.get(f"/api/lb/inquiries/{self.users['owner']}", headers=KEY).json()
        mine = [i for i in inbox["items"] if i["entry_id"] == eid]
        self.assertEqual({i["kind"] for i in mine}, {"acquisition", "sponsorship"})
        self.assertEqual(len([i for i in mine if i["slot_request"]]), 1)  # mirrored once, not twice
        item = next(i for i in mine if i["kind"] == "acquisition")
        r = self.c.patch(f"/api/lb/inquiries/{item['id']}", headers=KEY, params={"user_identifier": self.users["other"]}, json={"status": "read"})
        self.assertEqual(r.status_code, 404)
        r = self.c.patch(f"/api/lb/inquiries/{item['id']}", headers=KEY, params={"user_identifier": self.users["owner"]}, json={"status": "read"})
        self.assertEqual(r.status_code, 200)
        # per-sender cap
        for i in range(4):
            r = self.c.post(f"/api/lb/entry/{eid}/inquiries", headers=KEY, json={**base, "email": "spam@x.test", "kind": "acquisition"})
        self.assertEqual(r.status_code, 429)
        # "Open to offers" tab lists it, with sponsorships implied by the slot
        offers = next(r for r in self.board(tab="offers")["rows"] if r["name"] == "Offers Co")
        self.assertEqual(set(offers["open_to"]), {"acquisition", "sponsorships"})

    def test_07_preview_uses_the_draft_and_skips_the_gate(self):
        eid = self.join("Draft Co", "draft.test")  # unverified
        self.metrics(eid, users=3000)
        r = self.c.post(f"/api/lb/entry/{eid}/preview", headers=KEY, params={"user_identifier": self.users["owner"]}, json={"privacy": {"metrics": {"visitors": "range"}}, "startup_name": "Draft Renamed"})
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertEqual(data["profile"]["name"], "Draft Renamed")
        self.assertEqual(data["profile"]["kpis"]["visitors"]["mode"], "range")
        self.assertEqual(data["row"]["visitors"]["label"], "1K–5K")

    def test_08_manual_verification_survives_auto_checks_and_purge_removes_everything(self):
        eid = self.join("Manual Co", "manual.test")
        self.metrics(eid)
        r = self.c.post(f"/api/superadmin/leaderboard/{eid}", headers=KEY, json={"action": "verify"})
        self.assertEqual(r.status_code, 200, r.text)
        self.verify(eid, "none")  # an automatic check says no
        mine = self.c.get(f"/api/lb/mine/{self.users['owner']}", headers=KEY).json()
        e = next(x for x in mine["entries"] if x["id"] == eid)
        self.assertEqual(e["verification"]["level"], "owner")
        self.assertTrue(e["verification"]["manual"])
        r = self.c.delete(f"/api/lb/entry/{eid}", headers=KEY, params={"user_identifier": self.users["owner"]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.get(f"/api/lb/profile/{eid}", headers=KEY).status_code, 404)
        mine = self.c.get(f"/api/lb/mine/{self.users['owner']}", headers=KEY).json()
        self.assertNotIn(eid, [x["id"] for x in mine["entries"]])

    def test_09_transient_check_errors_keep_the_level(self):
        eid = self.join("Flaky Co", "flaky.test", status="verified")
        self.verify(eid, "owner")
        r = self.c.put(f"/api/lb/entry/{eid}/verification", headers=KEY, json={"transient_error": "Search Console did not answer"})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["changed"])
        mine = self.c.get(f"/api/lb/mine/{self.users['owner']}", headers=KEY).json()
        e = next(x for x in mine["entries"] if x["id"] == eid)
        self.assertEqual(e["verification"]["level"], "owner")
        self.assertIn("did not answer", e["verification"]["detail"]["error"])

    def test_10_legacy_endpoints_apply_privacy(self):
        eid = self.join("Legacy Co", "legacy.test", status="verified")
        self.verify(eid, "owner")
        self.metrics(eid, users=33333, clicks=100)
        self.settings(eid, privacy={"metrics": {"visitors": "hidden"}})
        d = self.c.get(f"/api/leaderboard/{eid}/detail", headers=KEY).json()
        self.assertIsNone(d["monthly_visitors"])
        self.assertNotIn("ga_property_id", d)
        self.assertNotIn("contact_email", d)
        lst = self.c.get("/api/leaderboard", headers=KEY, params={"page_size": 100}).json()
        row = next(e for e in lst["entries"] if e["id"] == eid)
        self.assertIsNone(row["monthly_visitors"])
        self.assertNotIn("33333", json.dumps(row))

    def test_11_entries_from_before_v3_keep_working(self):
        """No profile row (how every existing listing looks after the migration): still listed with what it showed."""
        import sqlite3
        eid = self.join("Old Timer", "oldtimer.test", status="verified")
        self.metrics(eid, users=8000, clicks=900)
        db = sqlite3.connect(os.environ["DATABASE_URL"].split("///", 1)[1])
        db.execute("DELETE FROM leaderboard_profiles WHERE entry_id = ?", (eid,))
        db.commit()
        db.close()
        row = next(r for r in self.board(tab="top")["rows"] if r["name"] == "Old Timer")
        self.assertEqual(row["visitors"]["value"], 8000)
        self.assertEqual(row["verification"]["label"], "GA4 connected")  # grace until the first v3 check
        mine = next(e for e in self.c.get(f"/api/lb/mine/{self.users['owner']}", headers=KEY).json()["entries"] if e["id"] == eid)
        self.assertTrue(mine["legacy_privacy"])
        self.assertTrue(mine["verification"]["grace"])
        prof = self.c.get(f"/api/lb/profile/{eid}", headers=KEY).json()
        self.assertEqual(prof["kpis"]["pageviews"]["mode"], "exact")  # today's visibility is preserved
        # the first check (cron) decides: GA4 only -> off the board; owner -> stays
        self.verify(eid, "ga4")
        self.assertNotIn("Old Timer", [r["name"] for r in self.board(tab="top")["rows"]])
        self.verify(eid, "owner")
        self.assertIn("Old Timer", [r["name"] for r in self.board(tab="top")["rows"]])
        # editing one setting freezes today's visibility for the rest instead of flipping them to the new defaults
        self.settings(eid, open_to=["partnerships"])
        mine = next(e for e in self.c.get(f"/api/lb/mine/{self.users['owner']}", headers=KEY).json()["entries"] if e["id"] == eid)
        self.assertEqual(mine["privacy"]["metrics"]["pageviews"], "exact")


if __name__ == "__main__":
    unittest.main()
