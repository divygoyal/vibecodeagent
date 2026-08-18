/**
 * weeklyDigestClient.ts — typed client-side fetchers for the weekly briefing.
 *
 * Hits the web proxy at /api/weekly-digests (which forwards to admin). The
 * response shapes mirror admin's `_serialize_weekly_digest_summary` and
 * `_serialize_weekly_digest_full` exactly (see admin/main.py:6031-6055).
 */

/**
 * One row in the list-mode response — lightweight, no snapshot blob.
 */
export interface DigestSummary {
    id: number;
    year: number;
    iso_week: number;
    site_url: string | null;
    headline: string | null;
    /** Free-form list of strings or `{ title, body }`-shaped objects. */
    action_items: unknown;
    /** ISO-8601 timestamp string. */
    created_at: string | null;
}

/**
 * Full row in the single-fetch response — includes the heavy snapshot blob.
 *
 * The snapshot blob is intentionally loose (Record<string, unknown>) because
 * its shape is owned by the cron writer and may evolve. UI components that
 * dig into it use defensive destructuring at the read site.
 */
export interface DigestDetail {
    id: number;
    year: number;
    iso_week: number;
    site_url: string | null;
    headline: string | null;
    action_items: unknown;
    snapshot: DigestSnapshot | null;
    created_at: string | null;
}

/**
 * Best-effort typed view of the snapshot blob.
 *
 * Source-of-truth: the cron writer (currently the shell at
 * `web/src/app/api/cron/weekly-digest/route.ts`). Until that writer is
 * upgraded to call `buildEnrichedSnapshot()`, this matches a *subset*
 * of the EnrichedSnapshot shape from `web/src/lib/chatSnapshot.ts` —
 * specifically the fields the UI reads. Anything else stays in
 * `[key: string]: unknown` and is read via narrowing at the use site.
 *
 * TODO(cron): once the cron writer is shipped, lock this shape down
 * and remove the index signature.
 */
export interface DigestSnapshot {
    /** Headline KPIs (clicks/imps/users/pageviews) the WeekSummary tiles render. */
    kpis?: {
        totalClicks?: number;
        totalImpressions?: number;
        changeClicks?: number;
        changeImpressions?: number;
        avgCTR?: number;
        avgPosition?: number;
        totalUsers?: number;
        totalPageViews?: number;
        avgBounceRate?: number;
        totalSessions?: number;
        // Fallback / GA4-side metrics — naming varies depending on
        // which side wrote the snapshot. WeekSummary reads defensively.
        changeUsers?: number;
    } | null;
    /** Top winners/losers, mirrors EnrichedSnapshot.winnersLosers. */
    winnersLosers?: {
        winners?: Array<{ query: string; clicksDelta: number; clicksDeltaPct: number; positionPrevious: number; positionCurrent: number }>;
        losers?: Array<{ query: string; clicksDelta: number; clicksDeltaPct: number; positionPrevious: number; positionCurrent: number }>;
        new?: Array<{ query: string; clicksCurrent: number; positionCurrent: number }>;
        lost?: Array<{ query: string; clicksPrevious: number }>;
    } | null;
    /** Striking-distance candidates (positions 11–20) for empty-week fallback. */
    queries?: Array<{
        query: string;
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
    }>;
    topQueries?: Array<{
        query: string;
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
    }>;
    /** Top pages — used by WeekSummary "Linked artifacts" section. */
    pages?: Array<{
        page: string;
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
    }>;
    topPages?: Array<{
        page: string;
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
    }>;
    /** Cannibalization rows. */
    cannibalization?: {
        cannibalized?: Array<{
            query: string;
            pages: Array<{ page: string; position: number }>;
            severity: string;
        }>;
    } | null;
    /** Anything else the cron writer attaches — read at the use site with caution. */
    [key: string]: unknown;
}

/**
 * Structured action item — the cron may write strings or objects. We render
 * both shapes in WeekSummary.
 */
export interface ActionItem {
    title: string;
    body?: string;
    /** Optional pre-filled prompt for the "Ask AI about this" button. */
    askPrompt?: string;
}

/**
 * Normalize the wire format (string | object) into a uniform ActionItem.
 * Used by WeekSummary; exported so tests / other components can reuse.
 */
export function normalizeActionItems(raw: unknown): ActionItem[] {
    if (!Array.isArray(raw)) return [];
    const out: ActionItem[] = [];
    for (const entry of raw) {
        if (typeof entry === 'string') {
            const trimmed = entry.trim();
            if (trimmed) out.push({ title: trimmed });
            continue;
        }
        if (entry && typeof entry === 'object') {
            const obj = entry as Record<string, unknown>;
            const title = typeof obj.title === 'string' ? obj.title : typeof obj.text === 'string' ? obj.text : null;
            if (!title) continue;
            out.push({
                title,
                body: typeof obj.body === 'string' ? obj.body : typeof obj.description === 'string' ? obj.description : undefined,
                askPrompt: typeof obj.askPrompt === 'string' ? obj.askPrompt : typeof obj.prompt === 'string' ? obj.prompt : undefined,
            });
        }
    }
    return out;
}

interface ListResponse {
    digests: DigestSummary[];
    exists: boolean;
}

interface ErrorResponse {
    error?: string;
}

/**
 * Stable identifier for a (year, iso_week) pair. Use this as the React key
 * for week tabs and as the `selectedKey` state for WeekTabs.
 *
 * Format: "2026-W19" — matches the ISO 8601 week notation users may see in
 * other tools (Notion, Linear, Google Calendar).
 */
export function digestKey(year: number, isoWeek: number): string {
    return `${year}-W${String(isoWeek).padStart(2, '0')}`;
}

/**
 * Parse a digestKey back into { year, isoWeek }. Returns null if the input
 * doesn't match the expected format.
 */
export function parseDigestKey(key: string): { year: number; isoWeek: number } | null {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(key);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const isoWeek = parseInt(m[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(isoWeek)) return null;
    if (isoWeek < 1 || isoWeek > 53) return null;
    return { year, isoWeek };
}

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        // Try to surface admin's error message; never throw the raw response.
        const body = (await res.json().catch(() => ({}))) as ErrorResponse;
        throw new Error(body?.error || `Request failed: ${res.status}`);
    }
    return (await res.json()) as T;
}

/**
 * Fetch the most-recent N weekly digest summaries for the current user.
 * Returns an empty list if the user has none (admin returns `{ digests: [], exists: false }`).
 */
export async function fetchWeeklyDigestList(limit = 8, siteUrl?: string): Promise<DigestSummary[]> {
    const safeLimit = Math.max(1, Math.min(limit, 26));
    const params = new URLSearchParams({ limit: String(safeLimit) });
    if (siteUrl) params.set('site_url', siteUrl);
    const data = await getJson<ListResponse>(`/api/weekly-digests?${params.toString()}`);
    return Array.isArray(data?.digests) ? data.digests : [];
}

/**
 * Fetch the full digest detail (including snapshot blob) for a specific week.
 * Returns null if admin returns 404 (the user has no digest for that week yet).
 */
export async function fetchWeeklyDigestDetail(
    year: number,
    isoWeek: number,
    siteUrl?: string,
): Promise<DigestDetail | null> {
    const params = new URLSearchParams({
        year: String(year),
        iso_week: String(isoWeek),
    });
    if (siteUrl) params.set('site_url', siteUrl);
    const res = await fetch(`/api/weekly-digests?${params.toString()}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorResponse;
        throw new Error(body?.error || `Request failed: ${res.status}`);
    }
    return (await res.json()) as DigestDetail;
}

/**
 * Heuristic — decide whether a digest's headline / snapshot indicates a
 * "quiet week" (no notable changes), in which case the UI shows the
 * EmptyWeekState fallback instead of the full summary.
 */
export function isQuietWeek(digest: DigestDetail | null | undefined): boolean {
    if (!digest) return true;
    const headline = (digest.headline || '').toLowerCase();
    if (!headline) return true;
    const quietMarkers = ['quiet week', 'no significant', 'no notable', 'nothing notable', 'flat week'];
    if (quietMarkers.some(m => headline.includes(m))) return true;
    const winners = digest.snapshot?.winnersLosers?.winners?.length || 0;
    const losers = digest.snapshot?.winnersLosers?.losers?.length || 0;
    const items = normalizeActionItems(digest.action_items);
    return winners === 0 && losers === 0 && items.length === 0;
}
