"""
Scheduled email delivery for dashboards: storage and atomic state (round 9).

NO DATABASE MIGRATION. A schedule lives in the existing `custom_dashboards.share_settings` JSON
column under the key "emailSchedule" (the share routes in dashboards_v2.py keep unknown keys when
they rewrite that column, and `duplicate` does not copy it, so a copied dashboard never mails
anybody). The doc itself is not touched: saving a schedule never bumps `rev`, never writes a
version and never conflicts with an open editor.

    emailSchedule = {
      "config": { ...what the owner set: recipients, frequency, time, timezone, pages, range... },
      "state":  { "claimed": "<window key>", "recipients": {email: {...}}, "sent": {"YYYY-MM-DD": n}, ... }
    }

`config` is validated by the web app (lib/builder/email/schedule.ts); here it is only size-checked.
`state` is changed only through the ops below so the idempotency check (claim) is one atomic step
under a lock: two cron runs cannot both claim the same window.

Routes (admin X-API-Key; the web app is the only caller):
    GET    /api/dashboard-email/scheduled[?user_identifier=]   every active dashboard with a schedule (+ owner)
    GET    /api/dashboard-email/{id}?user_identifier=          one schedule (owner checked)
    PUT    /api/dashboard-email/{id}?user_identifier=          set the config (state kept)
    DELETE /api/dashboard-email/{id}?user_identifier=          remove the schedule
    POST   /api/dashboard-email/{id}/state                     claim | release | recipient | count (by id: signed links)

Wiring (main.py): app.include_router(build_dashboard_email_router(get_db, verify_admin_key, get_user_by_identifier, User))
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update

from models import CustomDashboard

KEY = "emailSchedule"
MAX_CONFIG_BYTES = 8 * 1024
MAX_RECIPIENT_STATES = 60
KEEP_DAYS = 4
RECIPIENT_STATUSES = {"pending", "confirmed", "declined", "unsubscribed"}

# One lock for every read-modify-write of share_settings made by this module. The share routes
# of dashboards_v2.py do not take it; a collision is possible only in the same few milliseconds.
_LOCK = asyncio.Lock()


def _loads(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _read(d: CustomDashboard) -> Optional[Dict[str, Any]]:
    block = _loads(d.share_settings).get(KEY)
    if not isinstance(block, dict):
        return None
    return {
        "config": block.get("config") if isinstance(block.get("config"), dict) else {},
        "state": block.get("state") if isinstance(block.get("state"), dict) else {},
    }


async def _save(db, d: CustomDashboard, block: Optional[Dict[str, Any]]) -> None:
    """Write the block back. An explicit `updated_at = updated_at` stops the model's onupdate from
    treating a schedule (or a send) as an edit of the dashboard: its "last edited" time stays."""
    settings = _loads(d.share_settings)
    if block is None:
        settings.pop(KEY, None)
    else:
        settings[KEY] = block
    await db.execute(
        update(CustomDashboard)
        .where(CustomDashboard.id == d.id)
        .values(share_settings=json.dumps(settings), updated_at=CustomDashboard.updated_at)
    )
    await db.commit()


def _prune_state(state: Dict[str, Any]) -> None:
    recips = state.get("recipients")
    if isinstance(recips, dict) and len(recips) > MAX_RECIPIENT_STATES:
        # keep the newest entries (by "at"); drop the oldest
        ordered = sorted(recips.items(), key=lambda kv: str((kv[1] or {}).get("at") or ""), reverse=True)
        state["recipients"] = dict(ordered[:MAX_RECIPIENT_STATES])
    sent = state.get("sent")
    if isinstance(sent, dict) and len(sent) > KEEP_DAYS:
        state["sent"] = {k: sent[k] for k in sorted(sent.keys())[-KEEP_DAYS:]}


class ConfigBody(BaseModel):
    config: Dict[str, Any]


class StateOp(BaseModel):
    op: str                      # claim | release | recipient | count | result
    window: Optional[str] = None  # claim / release: the due-window key
    email: Optional[str] = None   # recipient
    status: Optional[str] = None  # recipient
    day: Optional[str] = None     # count: 'YYYY-MM-DD' (UTC)
    n: Optional[int] = None       # count
    at: Optional[str] = None
    data: Optional[Dict[str, Any]] = None  # result / recipient extras (small)


def build_dashboard_email_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable, user_model: Any) -> APIRouter:
    router = APIRouter(prefix="/api/dashboard-email", tags=["dashboard-email"], dependencies=[Depends(verify_admin_key)])

    async def owned(db, dashboard_id: str, user_identifier: str) -> CustomDashboard:
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        d = (await db.execute(
            select(CustomDashboard).where(
                CustomDashboard.id == dashboard_id,
                CustomDashboard.user_id == user.id,
                CustomDashboard.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        return d

    async def by_id(db, dashboard_id: str) -> CustomDashboard:
        d = (await db.execute(
            select(CustomDashboard).where(CustomDashboard.id == dashboard_id, CustomDashboard.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        return d

    async def owner_of(db, d: CustomDashboard):
        return (await db.execute(select(user_model).where(user_model.id == d.user_id))).scalar_one_or_none()

    def item(d: CustomDashboard, owner: Any, block: Dict[str, Any]) -> Dict[str, Any]:
        ident = None
        email = None
        if owner is not None:
            email = getattr(owner, "email", None)
            ident = getattr(owner, "github_id", None) or email or str(owner.id)
        return {
            "dashboardId": d.id,
            "name": d.name,
            "ownerUserId": d.user_id,
            "ownerIdentifier": ident,
            "ownerEmail": email,
            "shareToken": d.share_token if d.is_public else None,
            "rev": int(d.rev or 1),
            "schedule": block,
        }

    # ── list (cron + per-user cap) ──
    @router.get("/scheduled")
    async def list_scheduled(user_identifier: Optional[str] = None, db=Depends(get_db)):
        q = select(CustomDashboard).where(
            CustomDashboard.is_active == True,  # noqa: E712
            CustomDashboard.share_settings.like(f'%"{KEY}"%'),
        )
        if user_identifier:
            user = await get_user_by_identifier(db, user_identifier)
            if not user:
                return {"schedules": []}
            q = q.where(CustomDashboard.user_id == user.id)
        rows = (await db.execute(q)).scalars().all()
        owners: Dict[int, Any] = {}
        out: List[Dict[str, Any]] = []
        for d in rows:
            block = _read(d)
            if not block:
                continue
            if d.user_id not in owners:
                owners[d.user_id] = await owner_of(db, d)
            out.append(item(d, owners[d.user_id], block))
        return {"schedules": out}

    # ── one ──
    @router.get("/{dashboard_id}")
    async def get_schedule(dashboard_id: str, user_identifier: str, db=Depends(get_db)):
        d = await owned(db, dashboard_id, user_identifier)
        owner = await owner_of(db, d)
        return {
            "schedule": _read(d),
            "name": d.name,
            "shareToken": d.share_token if d.is_public else None,
            "ownerEmail": getattr(owner, "email", None),
            "ownerUserId": d.user_id,
            "ownerIdentifier": user_identifier,
        }

    @router.put("/{dashboard_id}")
    async def put_schedule(dashboard_id: str, body: ConfigBody, user_identifier: str, db=Depends(get_db)):
        if len(json.dumps(body.config).encode("utf-8")) > MAX_CONFIG_BYTES:
            raise HTTPException(status_code=413, detail="Schedule is too large")
        async with _LOCK:
            d = await owned(db, dashboard_id, user_identifier)
            block = _read(d) or {"config": {}, "state": {}}
            block["config"] = body.config
            _prune_state(block["state"])
            await _save(db, d, block)
        return {"schedule": block}

    @router.delete("/{dashboard_id}")
    async def delete_schedule(dashboard_id: str, user_identifier: str, db=Depends(get_db)):
        async with _LOCK:
            d = await owned(db, dashboard_id, user_identifier)
            await _save(db, d, None)
        return {"deleted": True}

    # ── state ops (cron + signed links; no owner check, the web verified the token) ──
    @router.post("/{dashboard_id}/state")
    async def state_op(dashboard_id: str, body: StateOp, db=Depends(get_db)):
        async with _LOCK:
            d = await by_id(db, dashboard_id)
            block = _read(d)
            if not block:
                raise HTTPException(status_code=404, detail="No schedule")
            state = block["state"]
            result: Dict[str, Any] = {"ok": True}

            if body.op == "claim":
                if not body.window or len(body.window) > 64:
                    raise HTTPException(status_code=422, detail="window is required")
                claimed = str(state.get("claimed") or "")
                # Windows are ISO timestamps: they sort. A window at or before the claimed one is a repeat.
                if claimed and body.window <= claimed:
                    return {"ok": True, "claimed": False, "current": claimed}
                state["claimed"] = body.window
                state["claimedAt"] = body.at or datetime.utcnow().isoformat()
                result["claimed"] = True
            elif body.op == "release":
                # The send failed for everybody: allow this window to be tried again.
                if state.get("claimed") == body.window:
                    state["claimed"] = str((body.data or {}).get("previous") or "")
                result["released"] = True
            elif body.op == "recipient":
                email = (body.email or "").strip().lower()
                if not email or len(email) > 254 or "@" not in email:
                    raise HTTPException(status_code=422, detail="email is required")
                if body.status not in RECIPIENT_STATUSES:
                    raise HTTPException(status_code=422, detail="bad status")
                recips = state.setdefault("recipients", {})
                prev = recips.get(email) if isinstance(recips.get(email), dict) else {}
                entry = {**prev, "status": body.status, "at": body.at or datetime.utcnow().isoformat()}
                for k in ("confirmSentAt", "confirmedAt"):
                    if body.data and isinstance(body.data.get(k), str):
                        entry[k] = body.data[k][:40]
                recips[email] = entry
                result["recipient"] = entry
            elif body.op == "count":
                day = (body.day or "")[:10]
                if len(day) != 10:
                    raise HTTPException(status_code=422, detail="day is required")
                sent = state.setdefault("sent", {})
                sent[day] = int(sent.get(day) or 0) + max(0, min(int(body.n or 0), 1000))
                result["sent"] = sent[day]
            elif body.op == "result":
                state["last"] = {k: v for k, v in (body.data or {}).items() if isinstance(k, str)}
                state["last"]["at"] = body.at or datetime.utcnow().isoformat()
            else:
                raise HTTPException(status_code=422, detail="unknown op")

            _prune_state(state)
            await _save(db, d, block)
            result["state"] = state
            return result

    return router
