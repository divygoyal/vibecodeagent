/**
 * Where the schedules live (round 9). `ScheduleStore` is what the runner needs; AdminScheduleStore
 * talks to admin/dashboard_email.py (share_settings JSON, no migration); InMemoryStore has the same
 * rules in memory for the tests and for dry runs (which must not change anything).
 */
import type { RecipientStatus, ScheduleRow, ScheduleState, StoredSchedule } from './types';

export interface ScheduleStore {
    listScheduled(userIdentifier?: string): Promise<ScheduleRow[]>;
    /** One atomic step: true only for the first caller of a window newer than the claimed one. */
    claim(dashboardId: string, window: string): Promise<boolean>;
    /** The send failed for everybody: give the window back. */
    release(dashboardId: string, window: string, previous: string): Promise<void>;
    setRecipient(dashboardId: string, email: string, status: RecipientStatus, data?: { confirmSentAt?: string; confirmedAt?: string }): Promise<ScheduleState | null>;
    count(dashboardId: string, day: string, n: number): Promise<void>;
    result(dashboardId: string, data: Record<string, unknown>): Promise<void>;
}

// ── admin ────────────────────────────────────────────────────────────────

const base = () => process.env.ADMIN_API_URL || 'http://localhost:8000';
const key = () => process.env.ADMIN_API_KEY || '';

async function admin(path: string, init: { method?: string; json?: unknown } = {}): Promise<Response> {
    return fetch(`${base()}${path}`, {
        method: init.method ?? 'GET',
        headers: { 'X-API-Key': key(), ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
    });
}

/** The owner's view of one dashboard's schedule (admin GET /api/dashboard-email/{id}). */
export interface OwnerView {
    schedule: StoredSchedule | null;
    name: string;
    shareToken: string | null;
    ownerEmail: string | null;
    ownerUserId: number;
    ownerIdentifier: string;
}

export class AdminScheduleStore implements ScheduleStore {
    async listScheduled(userIdentifier?: string): Promise<ScheduleRow[]> {
        const res = await admin(`/api/dashboard-email/scheduled${userIdentifier ? `?user_identifier=${encodeURIComponent(userIdentifier)}` : ''}`);
        if (!res.ok) throw new Error(`schedules list failed (${res.status})`);
        const data = (await res.json()) as { schedules?: ScheduleRow[] };
        return data.schedules ?? [];
    }

    private async op(dashboardId: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
        const res = await admin(`/api/dashboard-email/${encodeURIComponent(dashboardId)}/state`, { method: 'POST', json: body });
        let data: Record<string, unknown> = {};
        try { data = (await res.json()) as Record<string, unknown>; } catch { /* no body */ }
        return { ok: res.ok, status: res.status, data };
    }

    async claim(dashboardId: string, window: string): Promise<boolean> {
        const r = await this.op(dashboardId, { op: 'claim', window });
        return r.ok && r.data.claimed === true;
    }
    async release(dashboardId: string, window: string, previous: string): Promise<void> {
        await this.op(dashboardId, { op: 'release', window, data: { previous } });
    }
    async setRecipient(dashboardId: string, email: string, status: RecipientStatus, data?: { confirmSentAt?: string; confirmedAt?: string }): Promise<ScheduleState | null> {
        const r = await this.op(dashboardId, { op: 'recipient', email, status, data });
        return r.ok ? ((r.data.state as ScheduleState) ?? null) : null;
    }
    async count(dashboardId: string, day: string, n: number): Promise<void> {
        await this.op(dashboardId, { op: 'count', day, n });
    }
    async result(dashboardId: string, data: Record<string, unknown>): Promise<void> {
        await this.op(dashboardId, { op: 'result', data });
    }

    // Owner-facing (the dashboard's own routes).
    async get(userIdentifier: string, dashboardId: string): Promise<OwnerView | null> {
        const res = await admin(`/api/dashboard-email/${encodeURIComponent(dashboardId)}?user_identifier=${encodeURIComponent(userIdentifier)}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`schedule get failed (${res.status})`);
        return (await res.json()) as OwnerView;
    }
    async put(userIdentifier: string, dashboardId: string, config: unknown): Promise<StoredSchedule> {
        const res = await admin(`/api/dashboard-email/${encodeURIComponent(dashboardId)}?user_identifier=${encodeURIComponent(userIdentifier)}`, { method: 'PUT', json: { config } });
        if (!res.ok) throw new Error(`schedule save failed (${res.status})`);
        return ((await res.json()) as { schedule: StoredSchedule }).schedule;
    }
    async remove(userIdentifier: string, dashboardId: string): Promise<void> {
        const res = await admin(`/api/dashboard-email/${encodeURIComponent(dashboardId)}?user_identifier=${encodeURIComponent(userIdentifier)}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error(`schedule delete failed (${res.status})`);
    }
}

// ── memory (same rules as the admin) ─────────────────────────────────────

export class InMemoryStore implements ScheduleStore {
    rows: ScheduleRow[];
    constructor(rows: ScheduleRow[] = []) { this.rows = structuredClone(rows); }

    private row(id: string): ScheduleRow | undefined { return this.rows.find((r) => r.dashboardId === id); }

    async listScheduled(userIdentifier?: string): Promise<ScheduleRow[]> {
        const rows = userIdentifier ? this.rows.filter((r) => r.ownerIdentifier === userIdentifier || r.ownerEmail === userIdentifier) : this.rows;
        return structuredClone(rows);
    }
    async claim(id: string, window: string): Promise<boolean> {
        const r = this.row(id);
        if (!r) return false;
        const claimed = r.schedule.state.claimed ?? '';
        if (claimed && window <= claimed) return false;
        r.schedule.state.claimed = window;
        return true;
    }
    async release(id: string, window: string, previous: string): Promise<void> {
        const r = this.row(id);
        if (r && r.schedule.state.claimed === window) r.schedule.state.claimed = previous || undefined;
    }
    async setRecipient(id: string, email: string, status: RecipientStatus, data?: { confirmSentAt?: string; confirmedAt?: string }): Promise<ScheduleState | null> {
        const r = this.row(id);
        if (!r) return null;
        const recips = (r.schedule.state.recipients ??= {});
        const e = email.trim().toLowerCase();
        recips[e] = { ...recips[e], status, at: new Date().toISOString(), ...(data ?? {}) };
        return structuredClone(r.schedule.state);
    }
    async count(id: string, day: string, n: number): Promise<void> {
        const r = this.row(id);
        if (!r) return;
        const sent = (r.schedule.state.sent ??= {});
        sent[day] = (sent[day] ?? 0) + n;
    }
    async result(id: string, data: Record<string, unknown>): Promise<void> {
        const r = this.row(id);
        if (r) r.schedule.state.last = { ...data, at: new Date().toISOString() } as ScheduleState['last'];
    }
}

/** A store that reads the real rows once and changes only its own copy: a dry run leaves no trace. */
export class DryRunStore extends InMemoryStore {
    private loaded = false;
    constructor(private readonly inner: ScheduleStore) { super([]); }
    async listScheduled(userIdentifier?: string): Promise<ScheduleRow[]> {
        if (!this.loaded) { this.rows = structuredClone(await this.inner.listScheduled()); this.loaded = true; }
        return super.listScheduled(userIdentifier);
    }
}
