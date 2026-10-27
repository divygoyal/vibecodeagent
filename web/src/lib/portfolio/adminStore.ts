/**
 * Server-only client for the admin portfolio store (admin/portfolio_api.py).
 * `identifier` is the session user id string; the admin resolves it.
 */
import type { DailyRow, RangeTotalRow, SnapshotData, SnapshotRequest, StoreAsset } from './snapshot';
import type { AssetKind, AssetStatus } from './types';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ROW_BATCH = 5000;

export class AdminStoreError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Waits (ms) before each retry of a store call that failed transiently. Mutable for tests. */
export const adminRetry = { delays: [300, 900] };

async function callOnce<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
    const res = await fetch(`${ADMIN_API_URL}/api/portfolio${path}`, {
        method,
        headers: { 'X-API-Key': ADMIN_API_KEY, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new AdminStoreError(res.status, `admin ${method} ${path.split('?')[0]} -> ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
}

/**
 * One call to the store. A 5xx ("database is locked" while a first sync is writing, a restart) or a dropped
 * connection is retried silently, twice. Writes are upserts, so repeating one is safe; a timeout is only
 * retried for reads (`readOnly`), where a second try costs nothing.
 */
async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000, readOnly = false): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await callOnce<T>(method, path, body, timeoutMs);
        } catch (err) {
            const transient = err instanceof AdminStoreError ? err.status >= 500
                : err instanceof Error && (err instanceof TypeError || (readOnly && (err.name === 'TimeoutError' || err.name === 'AbortError')));
            if (!transient || attempt >= adminRetry.delays.length) throw err;
            await new Promise((resolve) => setTimeout(resolve, adminRetry.delays[attempt]));
        }
    }
}

const u = (identifier: string) => `/users/${encodeURIComponent(identifier)}`;

export interface AssetUpsert {
    kind: AssetKind;
    asset_id: string;
    display_name?: string | null;
    host?: string | null;
    account_name?: string | null;
    permission_level?: string | null;
    paired_with?: string | null;
}

export interface StatusUpdate {
    kind: AssetKind;
    asset_id: string;
    status: AssetStatus;
    last_error?: string | null;
    last_synced_at?: number;
    sync_started_at?: number;
    data_start?: string;
    data_end?: string;
    backfill_done?: boolean;
}

export const adminStore = {
    async getAssets(identifier: string): Promise<StoreAsset[]> {
        return (await call<{ assets: StoreAsset[] }>('GET', `${u(identifier)}/assets`, undefined, 15_000, true)).assets;
    },

    async putAssets(identifier: string, assets: AssetUpsert[], completeKinds: AssetKind[]): Promise<StoreAsset[]> {
        return (await call<{ assets: StoreAsset[] }>('PUT', `${u(identifier)}/assets`, { assets, complete_kinds: completeKinds }, 30_000)).assets;
    },

    async patchAsset(identifier: string, patch: {
        kind: AssetKind; asset_id: string; starred?: boolean; hidden?: boolean; pairing_override?: string; clear_override?: boolean;
    }): Promise<StoreAsset> {
        return (await call<{ asset: StoreAsset }>('PATCH', `${u(identifier)}/assets`, patch)).asset;
    },

    async updateStatus(identifier: string, updates: StatusUpdate[]): Promise<void> {
        if (updates.length === 0) return;
        await call('POST', `${u(identifier)}/assets/status`, { updates });
    },

    async upsertMetrics(identifier: string, rows: DailyRow[]): Promise<void> {
        for (let i = 0; i < rows.length; i += ROW_BATCH) {
            await call('POST', `${u(identifier)}/metrics`, { rows: rows.slice(i, i + ROW_BATCH) }, 30_000);
        }
    },

    async snapshot(identifier: string, req: SnapshotRequest): Promise<SnapshotData> {
        return call<SnapshotData>('POST', `${u(identifier)}/snapshot`, req, 20_000, true);
    },

    async upsertRangeTotals(identifier: string, rows: (Omit<RangeTotalRow, 'asset_kind' | 'fetched_at'> & { kind: 'ga4' })[]): Promise<void> {
        if (rows.length === 0) return;
        await call('POST', `${u(identifier)}/range-totals`, { rows }, 30_000);
    },

    async staleUsers(olderThanS: number, limit: number): Promise<{ identifier: string; user_id: number; oldest_synced_at: number | null }[]> {
        return (await call<{ users: { identifier: string; user_id: number; oldest_synced_at: number | null }[] }>(
            'GET', `/stale-users?older_than_s=${olderThanS}&limit=${limit}`, undefined, 15_000, true,
        )).users;
    },
};
