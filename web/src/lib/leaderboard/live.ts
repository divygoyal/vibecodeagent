/**
 * "Live now": GA4 realtime active users for a listed site, only when the owner
 * opted in. One Google call per site per 60 seconds no matter how many visitors
 * look at the page (in-process cache + in-flight dedupe, see lib/apiCache).
 */
import { cachedFetch } from '@/lib/apiCache';
import { getValidAccessToken, runFlexibleRealtimeReport } from '@/lib/googleApi';
import { lbAdmin } from './admin';
import type { EmbedPayload } from './types';

export interface LiveNow {
    enabled: boolean;
    active_users: number | null;
    updated_at: string | null;
}

const LIVE_TTL_MS = 60_000;

interface Credentials {
    enabled: boolean;
    available?: boolean;
    ga_property_id?: string;
    access_token?: string;
    refresh_token?: string;
}

export async function getLiveNow(entryId: number): Promise<LiveNow> {
    return cachedFetch<LiveNow>(`lb-live:${entryId}`, LIVE_TTL_MS, async () => {
        const creds = await lbAdmin<Credentials>(`/api/lb/entry/${entryId}/live-credentials`);
        if (!creds.ok || !creds.data?.enabled) return { enabled: false, active_users: null, updated_at: null };
        if (!creds.data.available || !creds.data.ga_property_id) {
            return { enabled: true, active_users: null, updated_at: null };
        }
        try {
            const token = await getValidAccessToken(creds.data.access_token, creds.data.refresh_token);
            const report = (await runFlexibleRealtimeReport(token, creds.data.ga_property_id, [], ['activeUsers'], {
                signal: AbortSignal.timeout(10_000),
            })) as { rows?: Array<{ metricValues?: Array<{ value: string }> }>; totals?: Array<{ metricValues?: Array<{ value: string }> }> };
            const raw = report.rows?.[0]?.metricValues?.[0]?.value ?? report.totals?.[0]?.metricValues?.[0]?.value ?? '0';
            return { enabled: true, active_users: parseInt(raw, 10) || 0, updated_at: new Date().toISOString() };
        } catch {
            // Do not cache a failure as "0 online".
            return { enabled: true, active_users: null, updated_at: null, error: 'unavailable' } as LiveNow;
        }
    });
}

const SLUG_OR_ID_RE = /^[a-z0-9-]{1,150}$/;

/**
 * Resolve a numeric id or the current slug to the entry id (5 minute cache). Both are looked
 * up through the admin API, so an id that does not exist (or a retired slug) gives null.
 */
export async function resolveEntryId(idOrSlug: string): Promise<number | null> {
    if (!SLUG_OR_ID_RE.test(idOrSlug)) return null;
    const found = await cachedFetch<{ id: number | null }>(`lb-resolve:${idOrSlug}`, 300_000, async () => {
        const res = await lbAdmin<EmbedPayload>(`/api/lb/embed/${encodeURIComponent(idOrSlug)}`, { timeoutMs: 5_000 });
        return { id: res.ok && res.data ? res.data.id : null };
    });
    return found.id;
}
