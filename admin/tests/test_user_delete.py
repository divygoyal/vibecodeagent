"""DELETE /api/users/{id} removes every row of that user and nothing of anyone else.

Fills every table that points at a user (user_id, publisher_user_id) or at one of
the user's leaderboard entries, chat threads or dashboards (entry_id, thread_id,
dashboard_id) with one row for the deleted user and one for a bystander, deletes
the user through the API, then checks each table.

Run from the repo root with the kit venv:
    /root/.trafficclaw-dev/venv/bin/python -m unittest admin.tests.test_user_delete
"""
import itertools
import os
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN_DIR))

_tmp = tempfile.mkdtemp(prefix="userdel-")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db")
os.environ.setdefault("ADMIN_API_KEY", "test-key")
os.environ.setdefault("DOCKER_HOST", f"unix://{_tmp}/no-docker.sock")
os.environ.setdefault("DATA_DIR", _tmp)
if not os.environ.get("OAUTH_TOKEN_ENC_KEY"):
    from cryptography.fernet import Fernet
    os.environ["OAUTH_TOKEN_ENC_KEY"] = Fernet.generate_key().decode()

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import user_delete  # noqa: E402

KEY = {"X-API-Key": os.environ["ADMIN_API_KEY"]}
LINK_COLUMNS = ("user_id", "publisher_user_id", "entry_id", "thread_id", "dashboard_id")
_counter = itertools.count(1)


def db_path() -> str:
    url = os.environ["DATABASE_URL"]
    return url.split("///", 1)[1]


def columns(con, table):
    # cid, name, type, notnull, default, pk
    return con.execute(f"PRAGMA table_info({table})").fetchall()


def filler(col_type: str):
    n = next(_counter)
    t = (col_type or "").upper()
    if "INT" in t or "BOOL" in t:
        return n
    if "DATETIME" in t or "TIMESTAMP" in t:
        return f"2026-01-01 00:00:{n % 60:02d}"
    if "DATE" in t:
        return f"2026-01-{1 + n % 28:02d}"
    if "FLOAT" in t or "REAL" in t or "NUMERIC" in t or "DOUBLE" in t:
        return float(n)
    return f"v{n}"


class UserDeleteCascadeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(main.app)
        cls.c = cls.ctx.__enter__()
        for sub in ("7001", "7002"):
            r = cls.c.post("/api/users", headers=KEY, json={"provider": "google", "provider_id": sub, "access_token": "t", "refresh_token": "r", "email": f"u{sub}@x.test"})
            assert r.status_code == 200, r.text

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def test_delete_user_removes_every_row(self):
        con = sqlite3.connect(db_path())
        try:
            ids = {sub: con.execute("SELECT id FROM users WHERE github_id = ? OR email = ?", (sub, f"u{sub}@x.test")).fetchone()[0] for sub in ("7001", "7002")}
            victim, bystander = ids["7001"], ids["7002"]
            tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
            linked = {t: [c for c in columns(con, t) if c[1] in LINK_COLUMNS] for t in tables if t != "users"}
            linked = {t: cols for t, cols in linked.items() if cols}

            # Every table with a user column must be in the cascade.
            missing = sorted(t for t, cols in linked.items() if any(c[1] == "user_id" for c in cols) and t not in user_delete.USER_TABLES)
            self.assertEqual(missing, [], "tables with user_id that DELETE /api/users does not clear")

            # Parents first (fixed ids), then everything else.
            owner = {victim: {"entry_id": 990001, "thread_id": "thread-victim", "dashboard_id": "dash-victim"},
                     bystander: {"entry_id": 990002, "thread_id": "thread-bystander", "dashboard_id": "dash-bystander"}}
            parent_id = {"leaderboard_entries": "entry_id", "chat_threads": "thread_id", "custom_dashboards": "dashboard_id"}
            order = [t for t in parent_id if t in tables] + sorted(t for t in linked if t not in parent_id)
            for table in order:
                # CHECK (col IN ('a', 'b')) constraints: use the first allowed value.
                ddl = con.execute("SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()[0] or ""
                choices = {m.group(1): re.findall(r"'([^']*)'", m.group(2))[0] for m in re.finditer(r"(\w+)\s+IN\s*\(([^)]*)\)", ddl) if "'" in m.group(2)}
                for uid in (victim, bystander):
                    row = {}
                    for cid, name, ctype, notnull, default, pk in columns(con, table):
                        if name in ("user_id", "publisher_user_id"):
                            row[name] = uid
                        elif name in owner[uid]:
                            row[name] = owner[uid][name]
                        elif table in parent_id and name == "id":
                            row[name] = owner[uid][parent_id[table]]
                        elif pk == 1 and name == "id" and "INT" in (ctype or "").upper():
                            continue  # autoincrement
                        elif name in choices:
                            row[name] = choices[name]
                        elif notnull or pk:
                            row[name] = filler(ctype) if default is None else None
                            if row[name] is None:
                                del row[name]
                    cols = ", ".join(row)
                    marks = ", ".join("?" for _ in row)
                    con.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(row.values()))
            con.commit()
            self.assertGreaterEqual(len(order), 30, f"expected 30+ user-linked tables, filled {len(order)}: {order}")
        finally:
            con.close()

        r = self.c.delete("/api/users/7001", headers=KEY)
        self.assertEqual(r.status_code, 200, r.text)

        con = sqlite3.connect(db_path())
        try:
            self.assertIsNone(con.execute("SELECT id FROM users WHERE id = ?", (victim,)).fetchone())
            left, lost = [], []
            for table in order:
                for uid, bucket in ((victim, left), (bystander, lost)):
                    conds, params = [], []
                    for c in columns(con, table):
                        if c[1] in ("user_id", "publisher_user_id"):
                            conds.append(f"{c[1]} = ?"); params.append(uid)
                        elif c[1] in owner[uid]:
                            conds.append(f"{c[1]} = ?"); params.append(owner[uid][c[1]])
                    if table in parent_id:
                        conds.append("id = ?"); params.append(owner[uid][parent_id[table]])
                    n = con.execute(f"SELECT COUNT(*) FROM {table} WHERE {' OR '.join(conds)}", params).fetchone()[0]
                    if uid == victim and n:
                        bucket.append(f"{table}: {n}")
                    if uid == bystander and n == 0:
                        bucket.append(table)
            self.assertEqual(left, [], "rows of the deleted user left behind")
            self.assertEqual(lost, [], "rows of another user were deleted")
        finally:
            con.close()


if __name__ == "__main__":
    unittest.main()
