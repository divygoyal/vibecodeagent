"""Extra Google accounts (google_accounts.py): data connections that never change identity.

Covers: add / update / same-as-primary / limit, the primary-only lookups (an extra account
never resolves the user, /oauth/google and bot payloads stay on the primary row), status
changes, disconnect (token row gone, its portfolio rows hidden but kept, back after a sync
that lists them again) and account deletion removing every connection.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_google_accounts
"""
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="gaccts-")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db")
os.environ.setdefault("ADMIN_API_KEY", "test-key")
os.environ.setdefault("DOCKER_HOST", f"unix://{_tmp}/no-docker.sock")
os.environ.setdefault("DATA_DIR", _tmp)
if not os.environ.get("OAUTH_TOKEN_ENC_KEY"):
    from cryptography.fernet import Fernet
    os.environ["OAUTH_TOKEN_ENC_KEY"] = Fernet.generate_key().decode()

from fastapi.testclient import TestClient  # noqa: E402

import google_accounts  # noqa: E402
import main  # noqa: E402

KEY = {"X-API-Key": os.environ["ADMIN_API_KEY"]}
OWNER = "300000000000000000001"     # primary Google sub of the owner
EXTRA = "300000000000000000002"     # a second Google account of the owner
OTHER = "300000000000000000003"     # a third one


def db_path() -> str:
    return os.environ["DATABASE_URL"].split("///", 1)[1]


class GoogleAccountsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        r = cls.c.post("/api/users", headers=KEY, json={
            "github_id": OWNER, "provider": "google", "provider_id": OWNER,
            "access_token": "ya29.owner", "refresh_token": "1//owner", "email": "owner@example.com",
        })
        assert r.status_code == 200, r.text

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def link(self, sub, **body):
        payload = {"email": f"{sub[-3:]}@example.com", "name": f"Account {sub[-3:]}", "access_token": f"ya29.{sub}", "refresh_token": f"1//{sub}"}
        payload.update(body)
        return self.c.put(f"/api/users/{OWNER}/google/linked/{sub}", headers=KEY, json=payload)

    def connections(self):
        r = self.c.get(f"/api/users/{OWNER}/google/connections", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["connections"]

    def test_1_add_lists_and_keeps_identity(self):
        r = self.link(EXTRA)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["created"])
        conns = self.connections()
        self.assertEqual([c["connection_id"] for c in conns], ["primary", EXTRA])
        self.assertTrue(conns[0]["primary"])
        self.assertEqual(conns[1]["email"], "002@example.com")
        self.assertEqual(conns[1]["status"], "connected")
        self.assertNotIn("refresh_token", conns[1], "the listing carries no tokens")

        # Tokens only through the linked endpoint (server-to-server).
        linked = self.c.get(f"/api/users/{OWNER}/google/linked", headers=KEY).json()["linked"]
        self.assertEqual([(x["sub"], x["refresh_token"]) for x in linked], [(EXTRA, f"1//{EXTRA}")])

        # The primary token endpoint still answers with the primary row.
        own = self.c.get(f"/api/users/{OWNER}/oauth/google", headers=KEY).json()
        self.assertEqual(own["refresh_token"], "1//owner")

        # The extra account never resolves the owner: its sub is unknown as an identity...
        self.assertEqual(self.c.get(f"/api/users/{EXTRA}/oauth/google", headers=KEY).status_code, 404)
        self.assertFalse(self.c.get(f"/api/users/{EXTRA}/workspace", headers=KEY).json()["exists"])
        # ...and signing in with it creates its own, separate user.
        r = self.c.post("/api/users", headers=KEY, json={
            "provider": "google", "provider_id": EXTRA, "access_token": "ya29.self", "refresh_token": "1//self",
            "email": "extra-self@example.com",
        })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.c.get(f"/api/users/{EXTRA}/oauth/google", headers=KEY).json()["refresh_token"], "1//self")
        self.assertEqual(self.c.get(f"/api/users/{OWNER}/oauth/google", headers=KEY).json()["refresh_token"], "1//owner")
        # The owner's linked row is untouched by that sign-in.
        linked = self.c.get(f"/api/users/{OWNER}/google/linked", headers=KEY).json()["linked"]
        self.assertEqual(linked[0]["refresh_token"], f"1//{EXTRA}")

        # Bot containers and provider lists see one Google connection (the primary).
        provs = self.c.get(f"/api/users/{OWNER}/connections", headers=KEY).json()["connected_providers"]
        self.assertEqual([p["provider"] for p in provs].count("google"), 1)

    def test_2_same_as_primary_is_refused(self):
        r = self.link(OWNER)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "same_as_primary")

    def test_3_update_keeps_stored_token_and_status(self):
        r = self.c.patch(f"/api/users/{OWNER}/google/linked/{EXTRA}", headers=KEY, json={"status": "needs_reconnect"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.connections()[1]["status"], "needs_reconnect")
        # Reconnect without a new refresh token: the stored one stays, status back to connected.
        r = self.link(EXTRA, refresh_token="", access_token="ya29.fresh", name="Renamed")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["created"])
        linked = self.c.get(f"/api/users/{OWNER}/google/linked", headers=KEY).json()["linked"]
        self.assertEqual(linked[0]["refresh_token"], f"1//{EXTRA}")
        self.assertEqual(linked[0]["access_token"], "ya29.fresh")
        conn = self.connections()[1]
        self.assertEqual((conn["status"], conn["name"]), ("connected", "Renamed"))
        self.assertEqual(self.c.patch(f"/api/users/{OWNER}/google/linked/{EXTRA}", headers=KEY, json={"status": "bogus"}).status_code, 422)
        # A brand-new connection needs a refresh token.
        self.assertEqual(self.link(OTHER, refresh_token="").status_code, 422)

    def test_4_disconnect_hides_assets_and_keeps_rows(self):
        self.assertEqual(self.link(OTHER).status_code, 200)
        r = self.c.put(f"/api/portfolio/users/{OWNER}/assets", headers=KEY, json={"assets": [
            {"kind": "ga4", "asset_id": "properties/1", "display_name": "Own"},
            {"kind": "ga4", "asset_id": "properties/2", "display_name": "Other", "connection_id": OTHER},
            {"kind": "gsc", "asset_id": "sc-domain:other.example", "connection_id": OTHER},
        ], "complete_kinds": ["ga4", "gsc"]})
        self.assertEqual(r.status_code, 200, r.text)
        by_id = {a["asset_id"]: a for a in r.json()["assets"]}
        self.assertEqual(by_id["properties/2"]["connection_id"], OTHER)
        self.assertIsNone(by_id["properties/1"]["connection_id"])
        counts = {c["connection_id"]: (c["ga4_count"], c["gsc_count"]) for c in self.connections()}
        self.assertEqual(counts["primary"], (1, 0))
        self.assertEqual(counts[OTHER], (1, 1))

        r = self.c.delete(f"/api/users/{OWNER}/google/linked/{OTHER}", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["hidden_assets"], 2)
        self.assertEqual([c["connection_id"] for c in self.connections()], ["primary", EXTRA])
        assets = self.c.get(f"/api/portfolio/users/{OWNER}/assets", headers=KEY).json()["assets"]
        self.assertEqual([a["asset_id"] for a in assets], ["properties/1"])
        # Kept in the database (hidden), token row gone.
        con = sqlite3.connect(db_path())
        try:
            kept = con.execute("SELECT COUNT(*) FROM portfolio_assets WHERE connection_id = ? AND disconnected = 1", (OTHER,)).fetchone()[0]
            tokens = con.execute("SELECT COUNT(*) FROM oauth_connections WHERE provider_account_id = ?", (OTHER,)).fetchone()[0]
        finally:
            con.close()
        self.assertEqual((kept, tokens), (2, 0))
        self.assertEqual(self.c.delete(f"/api/users/{OWNER}/google/linked/{OTHER}", headers=KEY).status_code, 404)

        # Reachable again later (another account lists it): a sync brings it back.
        r = self.c.put(f"/api/portfolio/users/{OWNER}/assets", headers=KEY, json={"assets": [
            {"kind": "ga4", "asset_id": "properties/1"}, {"kind": "ga4", "asset_id": "properties/2"},
        ], "complete_kinds": ["ga4"]})
        self.assertEqual(sorted(a["asset_id"] for a in r.json()["assets"]), ["properties/1", "properties/2"])

    def test_5_limit(self):
        have = len([c for c in self.connections() if not c["primary"]])
        for i in range(google_accounts.MAX_LINKED - have):
            self.assertEqual(self.link(f"31000000000000000{i:04d}").status_code, 200)
        r = self.link("319999999999999999999")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "limit")

    def test_6_account_deletion_removes_every_connection(self):
        r = self.c.delete(f"/api/users/{OWNER}", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)
        con = sqlite3.connect(db_path())
        try:
            left = con.execute("SELECT COUNT(*) FROM oauth_connections WHERE provider_account_id LIKE '3100%' OR provider_account_id = ?", (OWNER,)).fetchone()[0]
            extra_self = con.execute("SELECT COUNT(*) FROM oauth_connections WHERE provider_account_id = ?", (EXTRA,)).fetchone()[0]
        finally:
            con.close()
        self.assertEqual(left, 0)
        # The extra account's own (separate) user keeps its own sign-in row.
        self.assertEqual(extra_self, 1)


if __name__ == "__main__":
    unittest.main()
