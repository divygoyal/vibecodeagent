"""
Custom dashboards (the dashboard builder), v1 + v2 storage.

Replaces the old "Custom Dashboards" section of main.py with the same routes plus the
builder v2 additions (BUILDER.md 6.5 and 6.6):

    doc / schema_version / rev    DashboardDocV2 JSON with optimistic concurrency
                                  (expected_rev -> 409 when someone else saved first)
    share settings                allowCopy, badge, viewerControls, embed, expiresAt (JSON)
    share password                scrypt with a per-row salt; the hash never leaves the admin
    versions                      last 20 saved docs per dashboard

v1 rows are never rewritten in place: the web app migrates them in memory on read and only a
v2 save writes `doc` (the v1 columns stay as they were, so a code rollback still shows them).

Every route sits behind the admin X-API-Key. The user is identified by `user_identifier`,
read from the query string or, for older clients, from the JSON body (this fixes the 422 that
POST /share and POST /duplicate returned when the web sent it in the body).

Wiring (main.py):
    from dashboards_v2 import build_dashboards_router, ensure_dashboards_v2_schema
    app.include_router(build_dashboards_router(get_db, verify_admin_key, get_user_by_identifier, User))
    await ensure_dashboards_v2_schema(conn)   # inside init_db
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text

from models import CustomDashboard, CustomDashboardVersion

MAX_DOC_BYTES = 512 * 1024
KEEP_VERSIONS = 20
DEFAULT_LAYOUTS = '{"lg":[],"md":[],"sm":[]}'

DEFAULT_SHARE_SETTINGS: Dict[str, Any] = {
    "allowCopy": False,
    "badge": True,
    "viewerControls": {"date": True, "compare": True, "filters": True},
    "embed": {"allowedOrigins": []},
    "expiresAt": None,
}

# ── schema ──────────────────────────────────────────────────────────────

_ALTERS = [
    ("schema_version", "INTEGER NOT NULL DEFAULT 1"),
    ("doc", "TEXT"),
    ("rev", "INTEGER NOT NULL DEFAULT 1"),
    ("share_settings", "TEXT"),
    ("share_password_hash", "TEXT"),
    ("thumbnail", "TEXT"),
]


async def ensure_dashboards_v2_schema(conn) -> None:
    """Idempotent version of migrations/022_dashboards_v2.sql for existing databases."""
    for col, col_def in _ALTERS:
        try:
            await conn.execute(text(f"ALTER TABLE custom_dashboards ADD COLUMN {col} {col_def}"))
        except Exception:
            pass  # column exists
    await conn.execute(text(
        "CREATE TABLE IF NOT EXISTS custom_dashboard_versions ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT, dashboard_id TEXT NOT NULL, rev INTEGER NOT NULL,"
        " doc TEXT NOT NULL, label TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    ))
    await conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_cdv_dashboard ON custom_dashboard_versions(dashboard_id, rev)"
    ))


# ── helpers ─────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _check_password(password: str, stored: Optional[str]) -> bool:
    if not stored or not password:
        return False
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def _loads(raw: Optional[str], fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def _share_settings(d: CustomDashboard) -> Dict[str, Any]:
    stored = _loads(d.share_settings, {})
    merged = {**DEFAULT_SHARE_SETTINGS, **(stored if isinstance(stored, dict) else {})}
    vc = merged.get("viewerControls")
    merged["viewerControls"] = {**DEFAULT_SHARE_SETTINGS["viewerControls"], **(vc if isinstance(vc, dict) else {})}
    emb = merged.get("embed")
    merged["embed"] = {**DEFAULT_SHARE_SETTINGS["embed"], **(emb if isinstance(emb, dict) else {})}
    return merged


def _share_expired(settings: Dict[str, Any]) -> bool:
    exp = settings.get("expiresAt")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(str(exp).replace("Z", "+00:00")).timestamp() < time.time()
    except Exception:
        return False


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def dashboard_to_dict(d: CustomDashboard, user_identifier: Optional[str] = None) -> Dict[str, Any]:
    """CustomDashboard -> camelCase dict. Never includes the password hash."""
    settings = _share_settings(d)
    return {
        "id": d.id,
        "userId": user_identifier or str(d.user_id),
        "name": d.name,
        "description": d.description,
        "propertyId": d.property_id,
        "siteUrl": d.site_url,
        # v1 columns (kept verbatim; the web migrates them when doc is empty)
        "widgets": _loads(d.widgets, []),
        "gridLayouts": _loads(d.grid_layouts, {"lg": [], "md": [], "sm": []}),
        "theme": _loads(d.theme, {}),
        # v2
        "schemaVersion": int(d.schema_version or 1),
        "rev": int(d.rev or 1),
        "doc": _loads(d.doc, None),
        "share": {
            "enabled": bool(d.is_public),
            "token": d.share_token,
            "hasPassword": bool(d.share_password_hash),
            "allowCopy": bool(settings.get("allowCopy")),
            "badge": bool(settings.get("badge", True)),
            "viewerControls": settings["viewerControls"],
            "embed": {"enabled": bool(d.embed_enabled), "allowedOrigins": settings["embed"].get("allowedOrigins") or []},
            "expiresAt": settings.get("expiresAt"),
        },
        # v1 flat share fields (old clients)
        "isPublic": bool(d.is_public),
        "shareToken": d.share_token,
        "embedEnabled": bool(d.embed_enabled),
        "isTemplate": bool(d.is_template),
        "views": d.views or 0,
        "createdAt": _iso(d.created_at),
        "updatedAt": _iso(d.updated_at),
    }


def _validate_doc(raw: Optional[str]) -> None:
    if raw is None:
        return
    if len(raw.encode("utf-8")) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Dashboard is too large")
    try:
        parsed = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail="doc is not valid JSON")
    if not isinstance(parsed, dict) or parsed.get("schemaVersion") != 2:
        raise HTTPException(status_code=422, detail="doc must be a schemaVersion 2 object")


async def _body(request: Request) -> Dict[str, Any]:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


# ── request models ──────────────────────────────────────────────────────

class CustomDashboardCreate(BaseModel):
    user_identifier: str
    name: str
    description: Optional[str] = None
    property_id: str
    site_url: Optional[str] = None
    widgets: Optional[str] = "[]"         # v1 JSON string
    grid_layouts: Optional[str] = DEFAULT_LAYOUTS
    theme: Optional[str] = "{}"
    doc: Optional[str] = None             # v2 JSON string
    is_template: Optional[bool] = False


class CustomDashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    property_id: Optional[str] = None
    site_url: Optional[str] = None
    widgets: Optional[str] = None
    grid_layouts: Optional[str] = None
    theme: Optional[str] = None
    doc: Optional[str] = None
    expected_rev: Optional[int] = None
    version_label: Optional[str] = None
    is_public: Optional[bool] = None
    embed_enabled: Optional[bool] = None
    is_template: Optional[bool] = None


class ShareSettingsUpdate(BaseModel):
    user_identifier: Optional[str] = None
    enabled: Optional[bool] = None
    password: Optional[str] = None        # None = unchanged, "" = remove
    allow_copy: Optional[bool] = None
    badge: Optional[bool] = None
    viewer_controls: Optional[Dict[str, bool]] = None
    embed_enabled: Optional[bool] = None
    allowed_origins: Optional[List[str]] = None
    expires_at: Optional[str] = None      # ISO; "" = never


class PasswordVerify(BaseModel):
    password: str
    client_key: Optional[str] = None      # caller-side rate-limit key (token + ip hash)


# ── rate limit for password checks (5 per minute per token + client) ─────

_verify_hits: Dict[str, List[float]] = {}


def _verify_limited(key: str) -> bool:
    now = time.time()
    hits = [t for t in _verify_hits.get(key, []) if now - t < 60]
    if len(hits) >= 5:
        _verify_hits[key] = hits
        return True
    hits.append(now)
    _verify_hits[key] = hits
    if len(_verify_hits) > 10000:
        for k in list(_verify_hits.keys())[:5000]:
            _verify_hits.pop(k, None)
    return False


# ── router ──────────────────────────────────────────────────────────────

def build_dashboards_router(get_db: Callable, verify_admin_key: Callable, get_user_by_identifier: Callable, user_model: Any) -> APIRouter:
    router = APIRouter(prefix="/api/custom-dashboards", tags=["custom-dashboards"], dependencies=[Depends(verify_admin_key)])

    async def resolve_user(db, request: Request, user_identifier: Optional[str]):
        ident = user_identifier or (await _body(request)).get("user_identifier")
        if not ident or not isinstance(ident, str):
            raise HTTPException(status_code=422, detail="user_identifier is required")
        user = await get_user_by_identifier(db, ident)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user, ident

    async def owned(db, dashboard_id: str, user_id: int, active_only: bool = True) -> CustomDashboard:
        q = select(CustomDashboard).where(CustomDashboard.id == dashboard_id, CustomDashboard.user_id == user_id)
        if active_only:
            q = q.where(CustomDashboard.is_active == True)  # noqa: E712
        d = (await db.execute(q)).scalar_one_or_none()
        if not d:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        return d

    async def save_version(db, d: CustomDashboard, label: Optional[str]) -> None:
        if not d.doc:
            return
        db.add(CustomDashboardVersion(dashboard_id=d.id, rev=int(d.rev or 1), doc=d.doc, label=label))
        await db.flush()
        keep = (await db.execute(
            select(CustomDashboardVersion.id)
            .where(CustomDashboardVersion.dashboard_id == d.id)
            .order_by(CustomDashboardVersion.rev.desc(), CustomDashboardVersion.id.desc())
            .limit(KEEP_VERSIONS)
        )).scalars().all()
        if keep:
            await db.execute(
                delete(CustomDashboardVersion).where(
                    CustomDashboardVersion.dashboard_id == d.id,
                    CustomDashboardVersion.id.not_in(keep),
                )
            )

    # ── CRUD ──
    @router.post("")
    async def create_custom_dashboard(data: CustomDashboardCreate, db=Depends(get_db)):
        user = await get_user_by_identifier(db, data.user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        _validate_doc(data.doc)
        d = CustomDashboard(
            id=str(uuid.uuid4()),
            user_id=user.id,
            name=data.name[:255],
            description=data.description,
            property_id=data.property_id or "multi",
            site_url=data.site_url or "",
            widgets=data.widgets or "[]",
            grid_layouts=data.grid_layouts or DEFAULT_LAYOUTS,
            theme=data.theme or "{}",
            doc=data.doc,
            schema_version=2 if data.doc else 1,
            rev=1,
            is_template=bool(data.is_template),
        )
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return dashboard_to_dict(d, data.user_identifier)

    @router.get("")
    async def list_custom_dashboards(user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            return {"dashboards": []}
        rows = (await db.execute(
            select(CustomDashboard)
            .where(CustomDashboard.user_id == user.id, CustomDashboard.is_active == True)  # noqa: E712
            .order_by(CustomDashboard.updated_at.desc())
        )).scalars().all()
        out = []
        for d in rows:
            item = dashboard_to_dict(d, user_identifier)
            item["widgetCount"] = (
                len((item["doc"] or {}).get("widgets") or {}) if item["doc"] else len(item["widgets"] or [])
            )
            out.append(item)
        return {"dashboards": out}

    @router.get("/public/{token}")
    async def get_public_custom_dashboard(token: str, track_view: bool = True, db=Depends(get_db)):
        """Shared dashboard by share token (web strips owner fields before anything leaves the server)."""
        if not token or len(token) < 16 or len(token) > 64:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        d = (await db.execute(
            select(CustomDashboard).where(
                CustomDashboard.share_token == token,
                CustomDashboard.is_public == True,  # noqa: E712
                CustomDashboard.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if not d or _share_expired(_share_settings(d)):
            raise HTTPException(status_code=404, detail="Dashboard not found")
        if track_view:
            d.views = (d.views or 0) + 1
            await db.commit()
            await db.refresh(d)
        owner = (await db.execute(select(user_model).where(user_model.id == d.user_id))).scalar_one_or_none()
        owner_identifier = (owner.github_id or owner.email) if owner else None
        return {**dashboard_to_dict(d, owner_identifier), "ownerIdentifier": owner_identifier}

    @router.post("/public/{token}/verify")
    async def verify_public_password(token: str, body: PasswordVerify, db=Depends(get_db)):
        key = f"{token}|{body.client_key or ''}"
        if _verify_limited(key):
            raise HTTPException(status_code=429, detail="Too many attempts. Wait a minute and try again.")
        d = (await db.execute(
            select(CustomDashboard).where(
                CustomDashboard.share_token == token,
                CustomDashboard.is_public == True,  # noqa: E712
                CustomDashboard.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if not d or _share_expired(_share_settings(d)):
            raise HTTPException(status_code=404, detail="Dashboard not found")
        if not d.share_password_hash:
            return {"ok": True, "rev": int(d.rev or 1)}
        return {"ok": _check_password(body.password, d.share_password_hash), "rev": int(d.rev or 1)}

    @router.get("/{dashboard_id}")
    async def get_custom_dashboard(dashboard_id: str, user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dashboard_to_dict(await owned(db, dashboard_id, user.id), user_identifier)

    @router.put("/{dashboard_id}")
    async def update_custom_dashboard(dashboard_id: str, data: CustomDashboardUpdate, user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        d = await owned(db, dashboard_id, user.id)
        current_rev = int(d.rev or 1)
        if data.expected_rev is not None and data.expected_rev != current_rev:
            raise HTTPException(status_code=409, detail={"error": "rev_conflict", "rev": current_rev})
        _validate_doc(data.doc)

        content_changed = False
        for field in ("name", "description", "property_id", "site_url", "widgets", "grid_layouts", "theme"):
            value = getattr(data, field)
            if value is not None:
                setattr(d, field, value[:255] if field == "name" else value)
                content_changed = True
        if data.doc is not None:
            d.doc = data.doc
            d.schema_version = 2
            content_changed = True
        if data.is_public is not None:
            d.is_public = data.is_public
            if data.is_public and not d.share_token:
                d.share_token = secrets.token_hex(16)
        if data.embed_enabled is not None:
            d.embed_enabled = data.embed_enabled
        if data.is_template is not None:
            d.is_template = data.is_template
        if content_changed:
            d.rev = current_rev + 1
            if data.doc is not None:
                await save_version(db, d, data.version_label)
        d.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(d)
        return dashboard_to_dict(d, user_identifier)

    @router.delete("/{dashboard_id}")
    async def delete_custom_dashboard(dashboard_id: str, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        user, _ = await resolve_user(db, request, user_identifier)
        d = await owned(db, dashboard_id, user.id, active_only=False)
        d.is_active = False
        await db.commit()
        return {"deleted": True, "id": dashboard_id}

    # ── sharing ──
    @router.post("/{dashboard_id}/share")
    async def share_custom_dashboard(dashboard_id: str, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        """Turn the public link on (creates the token once)."""
        user, _ = await resolve_user(db, request, user_identifier)
        d = await owned(db, dashboard_id, user.id)
        if not d.share_token:
            d.share_token = secrets.token_hex(16)
        d.is_public = True
        await db.commit()
        await db.refresh(d)
        return {"shareToken": d.share_token, "id": d.id, "share": dashboard_to_dict(d)["share"]}

    @router.put("/{dashboard_id}/share")
    async def update_share_settings(dashboard_id: str, body: ShareSettingsUpdate, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        user, _ = await resolve_user(db, request, user_identifier or body.user_identifier)
        d = await owned(db, dashboard_id, user.id)
        settings = _share_settings(d)
        if body.enabled is not None:
            d.is_public = body.enabled
            if body.enabled and not d.share_token:
                d.share_token = secrets.token_hex(16)
        if body.password is not None:
            if body.password == "":
                d.share_password_hash = None
            else:
                if len(body.password) < 6 or len(body.password) > 200:
                    raise HTTPException(status_code=422, detail="Password must be 6 to 200 characters")
                d.share_password_hash = _hash_password(body.password)
        if body.allow_copy is not None:
            settings["allowCopy"] = body.allow_copy
        if body.badge is not None:
            settings["badge"] = body.badge
        if body.viewer_controls is not None:
            for k in ("date", "compare", "filters"):
                if k in body.viewer_controls:
                    settings["viewerControls"][k] = bool(body.viewer_controls[k])
        if body.embed_enabled is not None:
            d.embed_enabled = body.embed_enabled
        if body.allowed_origins is not None:
            settings["embed"]["allowedOrigins"] = [o for o in body.allowed_origins if isinstance(o, str)][:20]
        if body.expires_at is not None:
            settings["expiresAt"] = body.expires_at or None
        d.share_settings = json.dumps(settings)
        await db.commit()
        await db.refresh(d)
        return {"id": d.id, "share": dashboard_to_dict(d)["share"]}

    @router.post("/{dashboard_id}/rotate-share")
    async def rotate_share(dashboard_id: str, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        """Reset link: a new token, the old link stops working."""
        user, _ = await resolve_user(db, request, user_identifier)
        d = await owned(db, dashboard_id, user.id)
        d.share_token = secrets.token_hex(16)
        await db.commit()
        await db.refresh(d)
        return {"shareToken": d.share_token, "id": d.id, "share": dashboard_to_dict(d)["share"]}

    @router.delete("/{dashboard_id}/share")
    async def unshare_custom_dashboard(dashboard_id: str, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        user, _ = await resolve_user(db, request, user_identifier)
        d = await owned(db, dashboard_id, user.id, active_only=False)
        d.share_token = None
        d.is_public = False
        await db.commit()
        return {"unshared": True, "id": dashboard_id}

    @router.post("/{dashboard_id}/duplicate")
    async def duplicate_custom_dashboard(dashboard_id: str, request: Request, user_identifier: Optional[str] = None, db=Depends(get_db)):
        """Copy layout, widgets and theme. Sharing, views and history are not copied."""
        user, ident = await resolve_user(db, request, user_identifier)
        original = await owned(db, dashboard_id, user.id)
        name = f"{original.name} (copy)"[:255]
        doc = original.doc
        if doc:
            parsed = _loads(doc, None)
            if isinstance(parsed, dict):
                parsed["name"] = name
                doc = json.dumps(parsed)
        clone = CustomDashboard(
            id=str(uuid.uuid4()),
            user_id=user.id,
            name=name,
            description=original.description,
            property_id=original.property_id,
            site_url=original.site_url,
            widgets=original.widgets,
            grid_layouts=original.grid_layouts,
            theme=original.theme,
            doc=doc,
            schema_version=original.schema_version or 1,
            rev=1,
        )
        db.add(clone)
        await db.commit()
        await db.refresh(clone)
        return dashboard_to_dict(clone, ident)

    # ── versions (P1: list + read; restore = PUT the old doc) ──
    @router.get("/{dashboard_id}/versions")
    async def list_versions(dashboard_id: str, user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await owned(db, dashboard_id, user.id)
        rows = (await db.execute(
            select(CustomDashboardVersion.rev, CustomDashboardVersion.label, CustomDashboardVersion.created_at)
            .where(CustomDashboardVersion.dashboard_id == dashboard_id)
            .order_by(CustomDashboardVersion.rev.desc())
            .limit(KEEP_VERSIONS)
        )).all()
        return {"versions": [{"rev": r[0], "label": r[1], "createdAt": _iso(r[2])} for r in rows]}

    @router.get("/{dashboard_id}/versions/{rev}")
    async def get_version(dashboard_id: str, rev: int, user_identifier: str, db=Depends(get_db)):
        user = await get_user_by_identifier(db, user_identifier)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await owned(db, dashboard_id, user.id)
        row = (await db.execute(
            select(CustomDashboardVersion)
            .where(CustomDashboardVersion.dashboard_id == dashboard_id, CustomDashboardVersion.rev == rev)
            .order_by(CustomDashboardVersion.id.desc())
            .limit(1)
        )).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Version not found")
        return {"rev": row.rev, "label": row.label, "createdAt": _iso(row.created_at), "doc": _loads(row.doc, None)}

    return router
