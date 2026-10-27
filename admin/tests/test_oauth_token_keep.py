"""A stored Google refresh token is never replaced by an empty one.

A Google sign-in with prompt=select_account returns no refresh token, so the web app
sends none (or, from older code, an empty string). POST /api/users, POST
/api/users/{id}/sync and PATCH /api/users/{id} must all keep the stored token then,
and still take a real new one.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_oauth_token_keep
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="tokkeep-")
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
SUB = "200000000000000000001"


class KeepStoredRefreshTokenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        r = cls.c.post("/api/users", headers=KEY, json={
            "github_id": SUB, "provider": "google", "provider_id": SUB,
            "access_token": "ya29.first", "refresh_token": "1//stored", "email": "keep@example.com",
        })
        assert r.status_code == 200, r.text

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def stored(self):
        r = self.c.get(f"/api/users/{SUB}/oauth/google", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_1_create_user_upsert_keeps_token(self):
        for extra in ({}, {"refresh_token": None}, {"refresh_token": ""}, {"refresh_token": "   "}):
            r = self.c.post("/api/users", headers=KEY, json={
                "github_id": SUB, "provider": "google", "provider_id": SUB,
                "access_token": "ya29.second", "email": "keep@example.com", **extra,
            })
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(self.stored()["refresh_token"], "1//stored", extra)
        self.assertEqual(self.stored()["access_token"], "ya29.second")

    def test_2_sync_keeps_token(self):
        for extra in ({}, {"refresh_token": ""}, {"refresh_token": "  "}):
            r = self.c.post(f"/api/users/{SUB}/sync", headers=KEY, json={
                "provider": "google", "provider_id": SUB, "access_token": "", **extra,
            })
            self.assertLess(r.status_code, 500, r.text)
            got = self.stored()
            self.assertEqual(got["refresh_token"], "1//stored", extra)
            self.assertTrue(got["access_token"], "empty access token must not replace the stored one")

    def test_3_patch_keeps_token(self):
        for extra in ({}, {"refresh_token": ""}, {"refresh_token": "  "}):
            r = self.c.patch(f"/api/users/{SUB}", headers=KEY, json={"provider": "google", "access_token": " ", **extra})
            self.assertLess(r.status_code, 500, r.text)
            self.assertEqual(self.stored()["refresh_token"], "1//stored", extra)

    def test_4_new_token_still_replaces(self):
        r = self.c.post("/api/users", headers=KEY, json={
            "github_id": SUB, "provider": "google", "provider_id": SUB,
            "access_token": "ya29.third", "refresh_token": "1//new-after-consent", "email": "keep@example.com",
        })
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.stored()["refresh_token"], "1//new-after-consent")


if __name__ == "__main__":
    unittest.main()
