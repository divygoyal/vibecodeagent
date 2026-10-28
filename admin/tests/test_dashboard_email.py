"""Scheduled dashboard email storage (admin/dashboard_email.py) on a throwaway SQLite database.

No migration: the schedule lives in custom_dashboards.share_settings. These tests check that it
survives share-setting changes, is not copied by duplicate, never bumps rev / updated_at, and that
the claim op is the idempotency step.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_dashboard_email
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="dashemail-")
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
DOC = json.dumps({"schemaVersion": 2, "name": "Weekly", "widgets": {}, "pages": []})
CONFIG = {"enabled": True, "recipients": ["owner@x.test"], "frequency": "daily", "time": "09:00", "timezone": "Europe/London"}


class DashboardEmailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        for sub, mail in (("8001", "owner@x.test"), ("8002", "other@x.test")):
            r = cls.c.post("/api/users", headers=KEY, json={"provider": "google", "provider_id": sub, "access_token": "t", "refresh_token": "r", "email": mail})
            assert r.status_code == 200, r.text
        cls.owner, cls.other = "8001", "8002"
        r = cls.c.post("/api/custom-dashboards", headers=KEY, json={"user_identifier": cls.owner, "name": "Weekly", "property_id": "multi", "doc": DOC})
        assert r.status_code == 200, r.text
        cls.dash = r.json()["id"]

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def url(self, suffix=""):
        return f"/api/dashboard-email/{self.dash}{suffix}"

    def test_01_roundtrip_without_touching_the_doc(self):
        before = self.c.get(f"/api/custom-dashboards/{self.dash}", headers=KEY, params={"user_identifier": self.owner}).json()
        r = self.c.put(self.url(), headers=KEY, params={"user_identifier": self.owner}, json={"config": CONFIG})
        self.assertEqual(r.status_code, 200, r.text)
        got = self.c.get(self.url(), headers=KEY, params={"user_identifier": self.owner}).json()
        self.assertEqual(got["schedule"]["config"], CONFIG)
        after = self.c.get(f"/api/custom-dashboards/{self.dash}", headers=KEY, params={"user_identifier": self.owner}).json()
        self.assertEqual(before["rev"], after["rev"])
        self.assertEqual(before["updatedAt"], after["updatedAt"])
        self.assertEqual(before["doc"], after["doc"])
        self.assertNotIn("emailSchedule", json.dumps(after))  # never leaks into dashboard JSON

    def test_02_other_user_cannot_read_or_write(self):
        self.assertEqual(self.c.get(self.url(), headers=KEY, params={"user_identifier": self.other}).status_code, 404)
        self.assertEqual(self.c.put(self.url(), headers=KEY, params={"user_identifier": self.other}, json={"config": CONFIG}).status_code, 404)

    def test_03_survives_share_changes_and_is_not_duplicated(self):
        self.c.put(f"/api/custom-dashboards/{self.dash}/share", headers=KEY, params={"user_identifier": self.owner}, json={"badge": False})
        got = self.c.get(self.url(), headers=KEY, params={"user_identifier": self.owner}).json()
        self.assertEqual(got["schedule"]["config"]["frequency"], "daily")
        dup = self.c.post(f"/api/custom-dashboards/{self.dash}/duplicate", headers=KEY, params={"user_identifier": self.owner}).json()
        r = self.c.get(f"/api/dashboard-email/{dup['id']}", headers=KEY, params={"user_identifier": self.owner}).json()
        self.assertIsNone(r["schedule"])

    def test_04_list_scheduled_has_owner_email(self):
        rows = self.c.get("/api/dashboard-email/scheduled", headers=KEY).json()["schedules"]
        mine = [x for x in rows if x["dashboardId"] == self.dash]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["ownerEmail"], "owner@x.test")
        self.assertEqual(self.c.get("/api/dashboard-email/scheduled", headers=KEY, params={"user_identifier": self.other}).json()["schedules"], [])

    def test_05_claim_is_idempotent_and_release_reopens(self):
        op = lambda body: self.c.post(self.url("/state"), headers=KEY, json=body).json()
        self.assertTrue(op({"op": "claim", "window": "2026-10-28T09:00"})["claimed"])
        self.assertFalse(op({"op": "claim", "window": "2026-10-28T09:00"})["claimed"])
        self.assertFalse(op({"op": "claim", "window": "2026-10-27T09:00"})["claimed"])  # older window
        self.assertTrue(op({"op": "claim", "window": "2026-10-29T09:00"})["claimed"])
        op({"op": "release", "window": "2026-10-29T09:00", "data": {"previous": "2026-10-28T09:00"}})
        self.assertTrue(op({"op": "claim", "window": "2026-10-29T09:00"})["claimed"])

    def test_06_recipient_and_count_ops(self):
        r = self.c.post(self.url("/state"), headers=KEY, json={"op": "recipient", "email": "Fan@Y.test", "status": "pending"}).json()
        self.assertEqual(r["state"]["recipients"]["fan@y.test"]["status"], "pending")
        r = self.c.post(self.url("/state"), headers=KEY, json={"op": "recipient", "email": "fan@y.test", "status": "bogus"})
        self.assertEqual(r.status_code, 422)
        self.c.post(self.url("/state"), headers=KEY, json={"op": "count", "day": "2026-10-28", "n": 3})
        r = self.c.post(self.url("/state"), headers=KEY, json={"op": "count", "day": "2026-10-28", "n": 2}).json()
        self.assertEqual(r["state"]["sent"]["2026-10-28"], 5)
        # the config save keeps the state
        self.c.put(self.url(), headers=KEY, params={"user_identifier": self.owner}, json={"config": {**CONFIG, "frequency": "weekly"}})
        got = self.c.get(self.url(), headers=KEY, params={"user_identifier": self.owner}).json()["schedule"]
        self.assertEqual(got["state"]["sent"]["2026-10-28"], 5)
        self.assertEqual(got["config"]["frequency"], "weekly")

    def test_07_delete_and_oversize(self):
        big = {"x": "y" * 9000}
        self.assertEqual(self.c.put(self.url(), headers=KEY, params={"user_identifier": self.owner}, json={"config": big}).status_code, 413)
        self.assertEqual(self.c.delete(self.url(), headers=KEY, params={"user_identifier": self.owner}).status_code, 200)
        self.assertIsNone(self.c.get(self.url(), headers=KEY, params={"user_identifier": self.owner}).json()["schedule"])
        self.assertEqual(self.c.post(self.url("/state"), headers=KEY, json={"op": "claim", "window": "2026-11-01T09:00"}).status_code, 404)

    def test_08_needs_admin_key(self):
        self.assertIn(self.c.get("/api/dashboard-email/scheduled").status_code, (401, 403, 422))


if __name__ == "__main__":
    unittest.main()
