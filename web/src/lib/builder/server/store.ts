/**
 * Admin API client for dashboards (admin/dashboards_v2.py) plus record normalisation: v1 rows
 * are migrated in memory on every read (never rewritten until the user saves).
 * Server only.
 */
import { migrateV1toV2 } from '../migrate';
import { validateDoc } from '../schema';
import type { DashboardDocV2, DashboardRecord, ShareState } from '../types';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/** Row as admin returns it (camelCase). */
export interface AdminDashboardRow {
    id: string;
    userId?: string;
    name: string;
    description?: string | null;
    propertyId?: string | null;
    siteUrl?: string | null;
    widgets?: unknown;
    gridLayouts?: unknown;
    theme?: unknown;
    schemaVersion?: number;
    rev?: number;
    doc?: unknown;
    share?: Partial<ShareState>;
    isPublic?: boolean;
    shareToken?: string | null;
    embedEnabled?: boolean;
    isTemplate?: boolean;
    views?: number;
    widgetCount?: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    ownerIdentifier?: string | null;
}

export class StoreError extends Error {
    constructor(readonly status: number, message: string, readonly detail?: unknown) {
        super(message);
    }
}

async function admin(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { 'X-API-Key': ADMIN_API_KEY };
    if (init.json !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${ADMIN_API_URL}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
        cache: 'no-store',
        signal: init.signal ?? AbortSignal.timeout(15_000),
    });
}

async function ok<T>(res: Response, what: string): Promise<T> {
    if (res.ok) return (await res.json()) as T;
    let detail: unknown = null;
    try {
        detail = await res.json();
    } catch {
        /* no body */
    }
    throw new StoreError(res.status, `${what} failed (${res.status})`, detail);
}

const q = (userId: string) => `user_identifier=${encodeURIComponent(userId)}`;

// ── normalisation ────────────────────────────────────────────────────────

export function shareOf(row: AdminDashboardRow): ShareState {
    const s = row.share ?? {};
    return {
        enabled: Boolean(s.enabled ?? row.isPublic),
        token: s.token ?? row.shareToken ?? null,
        hasPassword: Boolean(s.hasPassword),
        allowCopy: Boolean(s.allowCopy),
        badge: s.badge !== false,
        viewerControls: { date: true, compare: true, filters: true, ...(s.viewerControls ?? {}) },
        embed: { enabled: Boolean(s.embed?.enabled ?? row.embedEnabled), allowedOrigins: s.embed?.allowedOrigins ?? [] },
        expiresAt: s.expiresAt ?? null,
    };
}

/** The v2 document of a row: stored doc when valid, else migrated from v1 columns. */
export function docOf(row: AdminDashboardRow): DashboardDocV2 {
    if (row.schemaVersion === 2 && row.doc) {
        const v = validateDoc(row.doc);
        if (v.ok) return v.value;
        // A stored doc that no longer validates is still returned rather than lost.
        return row.doc as DashboardDocV2;
    }
    return migrateV1toV2({ ...row, description: row.description ?? undefined });
}

export function toRecord(row: AdminDashboardRow): DashboardRecord {
    const doc = docOf(row);
    if (row.name && doc.name !== row.name && row.schemaVersion !== 2) doc.name = row.name;
    const share = shareOf(row);
    if (row.schemaVersion !== 2) {
        // Migrated shares keep their old behaviour (BUILDER.md 6.7).
        share.viewerControls = { date: true, compare: true, filters: false };
    }
    return {
        id: row.id,
        rev: row.rev ?? 1,
        schemaVersion: row.schemaVersion === 2 ? 2 : 1,
        doc,
        share,
        isTemplate: Boolean(row.isTemplate),
        views: row.views ?? 0,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
    };
}

/** property_id column value for a doc (NOT NULL in admin): default site's GA4 id, its GSC site, or 'multi'. */
export function propertyIdFor(doc: DashboardDocV2, resolved?: { ga4?: string; gsc?: string }): { propertyId: string; siteUrl: string } {
    const src = doc.defaultSource;
    if (src.type === 'site') {
        const ga4 = src.ga4 ?? resolved?.ga4;
        const gsc = src.gsc ?? resolved?.gsc ?? '';
        return { propertyId: ga4 ?? (gsc || src.siteId), siteUrl: gsc };
    }
    return { propertyId: 'multi', siteUrl: '' };
}

// ── CRUD ─────────────────────────────────────────────────────────────────

export async function listDashboards(userId: string): Promise<AdminDashboardRow[]> {
    const data = await ok<{ dashboards?: AdminDashboardRow[] } | AdminDashboardRow[]>(await admin(`/api/custom-dashboards?${q(userId)}`), 'list');
    return Array.isArray(data) ? data : data.dashboards ?? [];
}

export async function getDashboard(userId: string, id: string): Promise<AdminDashboardRow | null> {
    const res = await admin(`/api/custom-dashboards/${encodeURIComponent(id)}?${q(userId)}`);
    if (res.status === 404) return null;
    return ok<AdminDashboardRow>(res, 'get');
}

export async function createDashboard(userId: string, doc: DashboardDocV2, opts: { propertyId: string; siteUrl: string; isTemplate?: boolean }): Promise<AdminDashboardRow> {
    return ok<AdminDashboardRow>(await admin('/api/custom-dashboards', {
        method: 'POST',
        json: {
            user_identifier: userId, name: doc.name.slice(0, 255), description: doc.description ?? '',
            property_id: opts.propertyId || 'multi', site_url: opts.siteUrl || '', doc: JSON.stringify(doc), is_template: Boolean(opts.isTemplate),
        },
    }), 'create');
}

/** Old (v1) clients: store the row as v1 exactly as before; it is migrated in memory on read. */
export async function createDashboardV1(userId: string, body: { name: string; description?: string; propertyId: string; siteUrl?: string; widgets: unknown; gridLayouts?: unknown; theme?: unknown }): Promise<AdminDashboardRow> {
    return ok<AdminDashboardRow>(await admin('/api/custom-dashboards', {
        method: 'POST',
        json: {
            user_identifier: userId, name: body.name.slice(0, 255), description: body.description ?? '', property_id: body.propertyId, site_url: body.siteUrl ?? '',
            widgets: JSON.stringify(body.widgets ?? []), grid_layouts: JSON.stringify(body.gridLayouts ?? { lg: [], md: [], sm: [] }), theme: JSON.stringify(body.theme ?? {}),
        },
    }), 'create v1');
}

export type UpdateResult = { ok: true; row: AdminDashboardRow } | { ok: false; conflict: true; rev: number };

export async function updateDashboard(
    userId: string,
    id: string,
    patch: { doc?: DashboardDocV2; name?: string; propertyId?: string; siteUrl?: string; isTemplate?: boolean; versionLabel?: string },
    expectedRev?: number,
): Promise<UpdateResult> {
    const body: Record<string, unknown> = {};
    if (patch.doc) {
        body.doc = JSON.stringify(patch.doc);
        body.name = patch.doc.name.slice(0, 255);
        body.description = patch.doc.description ?? '';
    }
    if (patch.name !== undefined) body.name = patch.name.slice(0, 255);
    if (patch.propertyId !== undefined) body.property_id = patch.propertyId;
    if (patch.siteUrl !== undefined) body.site_url = patch.siteUrl;
    if (patch.isTemplate !== undefined) body.is_template = patch.isTemplate;
    if (patch.versionLabel) body.version_label = patch.versionLabel;
    if (expectedRev !== undefined) body.expected_rev = expectedRev;
    const res = await admin(`/api/custom-dashboards/${encodeURIComponent(id)}?${q(userId)}`, { method: 'PUT', json: body });
    if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { detail?: { rev?: number } };
        return { ok: false, conflict: true, rev: Number(data.detail?.rev ?? 0) };
    }
    return { ok: true, row: await ok<AdminDashboardRow>(res, 'update') };
}

export async function deleteDashboard(userId: string, id: string): Promise<void> {
    await ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}?${q(userId)}`, { method: 'DELETE' }), 'delete');
}

export async function duplicateDashboard(userId: string, id: string): Promise<AdminDashboardRow> {
    return ok<AdminDashboardRow>(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/duplicate?${q(userId)}`, { method: 'POST' }), 'duplicate');
}

// ── sharing ──────────────────────────────────────────────────────────────

export async function enableShare(userId: string, id: string): Promise<{ shareToken: string; share: ShareState }> {
    return ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/share?${q(userId)}`, { method: 'POST' }), 'share');
}

export interface ShareSettingsPatch {
    enabled?: boolean;
    password?: string;
    allowCopy?: boolean;
    badge?: boolean;
    viewerControls?: Partial<ShareState['viewerControls']>;
    embedEnabled?: boolean;
    allowedOrigins?: string[];
    expiresAt?: string;
}

export async function updateShare(userId: string, id: string, patch: ShareSettingsPatch): Promise<{ share: ShareState }> {
    return ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/share?${q(userId)}`, {
        method: 'PUT',
        json: {
            enabled: patch.enabled, password: patch.password, allow_copy: patch.allowCopy, badge: patch.badge,
            viewer_controls: patch.viewerControls, embed_enabled: patch.embedEnabled, allowed_origins: patch.allowedOrigins, expires_at: patch.expiresAt,
        },
    }), 'share settings');
}

export async function rotateShare(userId: string, id: string): Promise<{ shareToken: string; share: ShareState }> {
    return ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/rotate-share?${q(userId)}`, { method: 'POST' }), 'rotate');
}

export async function disableShare(userId: string, id: string): Promise<void> {
    await ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/share?${q(userId)}`, { method: 'DELETE' }), 'unshare');
}

export async function listVersions(userId: string, id: string): Promise<{ versions: Array<{ rev: number; label: string | null; createdAt: string | null }> }> {
    return ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/versions?${q(userId)}`), 'versions');
}

export async function getVersion(userId: string, id: string, rev: number): Promise<{ rev: number; doc: unknown }> {
    return ok(await admin(`/api/custom-dashboards/${encodeURIComponent(id)}/versions/${rev}?${q(userId)}`), 'version');
}

// ── public ───────────────────────────────────────────────────────────────

/** Shared dashboard by token, with the owner identifier (never sent to the browser). */
export async function getPublicRow(token: string, trackView: boolean): Promise<AdminDashboardRow | null> {
    if (!isShareToken(token)) return null;
    const res = await admin(`/api/custom-dashboards/public/${encodeURIComponent(token)}?track_view=${trackView ? 'true' : 'false'}`);
    if (res.status === 404 || res.status === 422) return null;
    return ok<AdminDashboardRow>(res, 'public');
}

export async function verifySharePassword(token: string, password: string, clientKey: string): Promise<{ ok: boolean; status: number }> {
    const res = await admin(`/api/custom-dashboards/public/${encodeURIComponent(token)}/verify`, { method: 'POST', json: { password, client_key: clientKey } });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as { ok?: boolean };
    return { ok: Boolean(data.ok), status: 200 };
}

/** Share tokens are 32 hex chars (secrets.token_hex(16)); one rule for every public route. */
export function isShareToken(token: unknown): token is string {
    return typeof token === 'string' && /^[a-f0-9]{32}$/.test(token);
}
