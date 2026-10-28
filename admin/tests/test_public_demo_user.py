"""The public live demo's shared user (web/src/lib/publicDemo) is not a real user: it is left out of the
user list and the admin status counts, and it can never join the public leaderboard.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_public_demo_user
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="demo-user-")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db")
os.environ.setdefault("ADMIN_API_KEY", "test-key")
os.environ.setdefault("DOCKER_HOST", f"unix://{_tmp}/no-docker.sock")
os.environ.setdefault("DATA_DIR", _tmp)
if not os.environ.get("OAUTH_TOKEN_ENC_KEY"):
    from cryptography.fernet import Fernet
    os.environ["OAUTH_TOKEN_ENC_KEY"] = Fernet.generate_key().decode()

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from config import settings  # noqa: E402

KEY = {"X-API-Key": os.environ["ADMIN_API_KEY"]}
DEMO = settings.PUBLIC_DEMO_USER_ID


class PublicDemoUserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        for body in (
            {"provider": "google", "provider_id": "7001", "access_token": "t", "refresh_token": "r", "email": "real@x.test", "github_username": "real"},
            # As web/src/lib/publicDemo/seed.ts creates it: no email.
            {"provider": "google", "provider_id": DEMO, "access_token": "demo-access:main", "refresh_token": "demo-refresh:main", "github_username": "Demo", "plan": "pro"},
        ):
            r = cls.c.post("/api/users", headers=KEY, json=body)
            assert r.status_code == 200, r.text

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def test_demo_user_resolves(self):
        r = self.c.get(f"/api/users/{DEMO}/workspace", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)

    def test_left_out_of_user_list_and_status(self):
        ids = [u["github_id"] for u in self.c.get("/api/users", headers=KEY).json()]
        self.assertIn("7001", ids)
        self.assertNotIn(DEMO, ids)
        status = self.c.get("/api/admin/status", headers=KEY).json()
        self.assertEqual(status["total_users"], len(ids))

    def test_takes_no_container_port(self):
        import sqlite3
        db = sqlite3.connect(os.environ["DATABASE_URL"].split(":///", 1)[1])
        ports = dict(db.execute("SELECT github_id, container_port FROM users").fetchall())
        db.close()
        self.assertIsNone(ports[DEMO], "the demo user must not hold one of the MAX_USERS container ports")
        self.assertIsNotNone(ports["7001"])

    def test_demo_port_sentinel_for_a_not_null_schema(self):
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker

        async def run(ddl):
            eng = create_async_engine(f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/s.db")
            async with eng.begin() as conn:
                await conn.exec_driver_sql(ddl)
            async with sessionmaker(eng, class_=AsyncSession)() as db:
                out = await main.demo_user_port(db)
            await eng.dispose()
            return out

        self.assertIsNone(asyncio.run(run("CREATE TABLE users (id INTEGER PRIMARY KEY, container_port INTEGER)")))
        self.assertEqual(asyncio.run(run("CREATE TABLE users (id INTEGER PRIMARY KEY, container_port INTEGER NOT NULL)")), 0)
        self.assertLess(main.DEMO_PORT_SENTINEL, main.settings.BASE_PORT)

    def test_cannot_join_leaderboard(self):
        body = {"startup_name": "Acme", "website_url": "https://acmeanalytics.example", "category": "SaaS", "ga_property_id": "properties/412300101"}
        r = self.c.post(f"/api/leaderboard/{DEMO}/join", headers=KEY, json=body)
        self.assertEqual(r.status_code, 403, r.text)
        r = self.c.post("/api/leaderboard/7001/join", headers=KEY, json=body)
        self.assertEqual(r.status_code, 200, r.text)


if __name__ == "__main__":
    unittest.main()
