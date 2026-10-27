"""
Per-user state of the site "Actions" tasks (the "what to fix next" list on
/dashboard/s/<host>/actions): which tasks a user marked done or dismissed.

The web app builds the tasks from Google data on the fly; only the user's
decisions are stored here, keyed by a stable action id.

Table: migrations/023_add_site_action_states.sql (created idempotently on
startup and, as a fallback, on first use).

Wiring (main.py):
    from site_actions_api import build_site_actions_router, ensure_site_actions_schema, delete_user_site_action_rows
    app.include_router(build_site_actions_router(get_db, verify_admin_key, get_user_by_identifier))
"""
from __future__ import annotations

import os
from typing import Callable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

MIGRATION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations", "023_add_site_action_states.sql")
STATUSES = ("open", "done", "dismissed")
MAX_ROWS_PER_SITE = 2000

_schema_ready = False


def _schema_statements() -> List[str]:
    with open(MIGRATION_FILE, "r", encoding="utf-8") as fh:
        raw = fh.read()
    lines = [ln for ln in raw.splitlines() if not ln.strip().startswith("--")]
    return [s.strip() for s in "\n".join(lines).split(";") if s.strip()]


async def ensure_site_actions_schema(engine) -> None:
    """Create the table if missing (idempotent, additive)."""
    global _schema_ready
    async with engine.begin() as conn:
        for ddl in _schema_statements():
            try:
                await conn.execute(text(ddl))
            except Exception as exc:  # pragma: no cover - logged, never fatal
                print(f"[startup] site action DDL skipped: {type(exc).__name__}: {exc}")
    _schema_ready = True


async def _ensure_on_session(db) -> None:
    global _schema_ready
    if _schema_ready:
        return
    for ddl in _schema_statements():
        try:
            await db.execute(text(ddl))
        except Exception as exc:  # pragma: no cover
            print(f"[site-actions] DDL skipped: {type(exc).__name__}: {exc}")
    await db.commit()
    _schema_ready = True


async def delete_user_site_action_rows(db, user_id: int) -> None:
    """Remove every action state of a user (call from DELETE /api/users/{id})."""
    await db.execute(text("DELETE FROM site_action_states WHERE user_id = :u"), {"u": user_id})


class ActionStateIn(BaseModel):
    user_identifier: str = Field(..., min_length=1, max_length=200)
    site_key: str = Field(..., min_length=1, max_length=300)
    action_id: str = Field(..., min_length=1, max_length=120)
    status: str = Field(..., min_length=1, max_length=20)
    title: Optional[str] = Field(None, max_length=300)


def build_site_actions_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/site-actions", tags=["site-actions"])

    @router.get("/states")
    async def list_states(
        user_identifier: str = Query(..., min_length=1, max_length=200),
        site_key: str = Query(..., min_length=1, max_length=300),
        db=Depends(get_db),
        _: bool = Depends(verify_admin_key),
    ):
        await _ensure_on_session(db)
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            return {"states": []}
        rows = (await db.execute(
            text(
                "SELECT action_id, status, title, updated_at FROM site_action_states "
                "WHERE user_id = :u AND site_key = :s ORDER BY updated_at DESC LIMIT :n"
            ),
            {"u": user.id, "s": site_key, "n": MAX_ROWS_PER_SITE},
        )).fetchall()
        return {
            "states": [
                {
                    "actionId": r.action_id,
                    "status": r.status,
                    "title": r.title,
                    "updatedAt": str(r.updated_at) if r.updated_at is not None else None,
                }
                for r in rows
            ]
        }

    @router.put("/states")
    async def put_state(body: ActionStateIn, db=Depends(get_db), _: bool = Depends(verify_admin_key)):
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="status must be open, done or dismissed")
        await _ensure_on_session(db)
        user = await get_user_by_identifier(db, body.user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        params = {"u": user.id, "s": body.site_key, "a": body.action_id}
        if body.status == "open":
            await db.execute(text("DELETE FROM site_action_states WHERE user_id = :u AND site_key = :s AND action_id = :a"), params)
        else:
            count = (await db.execute(
                text("SELECT COUNT(*) AS n FROM site_action_states WHERE user_id = :u AND site_key = :s"),
                {"u": user.id, "s": body.site_key},
            )).scalar() or 0
            exists = (await db.execute(
                text("SELECT 1 FROM site_action_states WHERE user_id = :u AND site_key = :s AND action_id = :a"), params,
            )).first()
            if not exists and count >= MAX_ROWS_PER_SITE:
                # Keep the table bounded: forget the oldest decision.
                await db.execute(text(
                    "DELETE FROM site_action_states WHERE id = (SELECT id FROM site_action_states "
                    "WHERE user_id = :u AND site_key = :s ORDER BY updated_at ASC LIMIT 1)"
                ), {"u": user.id, "s": body.site_key})
            await db.execute(
                text(
                    "INSERT INTO site_action_states (user_id, site_key, action_id, status, title, created_at, updated_at) "
                    "VALUES (:u, :s, :a, :st, :t, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
                    "ON CONFLICT(user_id, site_key, action_id) DO UPDATE SET status = excluded.status, "
                    "title = excluded.title, updated_at = CURRENT_TIMESTAMP"
                ),
                {**params, "st": body.status, "t": body.title},
            )
        await db.commit()
        return {"ok": True, "actionId": body.action_id, "status": body.status}

    return router
