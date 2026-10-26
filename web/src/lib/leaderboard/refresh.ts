/**
 * Refresh one leaderboard entry: re-check ownership, pull GA4 + Search Console
 * numbers for 7d / 28d / 3m (with the previous period) and a 180-day daily series,
 * collect the audience breakdowns, and store everything through the admin API.
 *
 * Used by the daily cron, by the join flow (so a new listing has numbers at once)
 * and by the "Re-check" button. Read-only Google calls only. Per property it makes
 * four GA4 reports in parallel (limit is 10 concurrent) and one Search Console
 * query; nothing here runs on page views of the public site.
 */
import { getValidAccessToken, runGSCQuery } from '@/lib/googleApi';
import { checkOwnership, type OwnershipCheck } from '@/lib/leaderboardVerify';
import { collectAudience } from '@/lib/audienceFetch';
import { lbAdmin } from './admin';
import type { OwnershipOutcome } from './types';

const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const RANGE_DAYS: Array<{ key: '7d' | '28d' | '3m'; days: number }> = [
    { key: '7d', days: 7 },
    { key: '28d', days: 28 },
    { key: '3m', days: 90 },
];
const DAILY_DAYS = 180;

export interface RefreshInput {
    entryId: number;
    gaPropertyId: string;
    websiteUrl: string | null;
    accessToken?: string;
    refreshToken?: string;
    /** Skip the ownership check (the caller just ran it). */
    skipVerify?: boolean;
    /** Search Console property to read when the ownership check is skipped. */
    gscSiteUrl?: string | null;
    /** Skip the (slower) audience breakdowns. */
    skipAudience?: boolean;
}

export interface RefreshResult {
    ok: boolean;
    verification: OwnershipCheck | null;
    days: number;
    gsc: boolean;
    audience: boolean;
    error?: string;
}

function cleanPropertyId(id: string): string {
    return id.startsWith('properties/') ? id : `properties/${id.replace(/[^\d]/g, '')}`;
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function ga4Report(token: string, pid: string, body: Record<string, unknown>) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20_000),
        });
        if (res.ok || res.status < 500) break;
        await sleep(500);
    }
    if (!res || !res.ok) {
        const text = res ? await res.text().catch(() => '') : '';
        throw new Error(`GA4 ${res?.status ?? 0}: ${text.slice(0, 160)}`);
    }
    return (await res.json()) as { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }> };
}

interface RangeNumbers {
    visitors: number | null;
    visitors_prev: number | null;
    engagement_rate: number | null;
    bounce_rate: number | null;
    avg_session_duration: number | null;
}

async function fetchRange(token: string, pid: string, days: number): Promise<RangeNumbers> {
    const report = await ga4Report(token, pid, {
        dateRanges: [
            { name: 'cur', startDate: `${days - 1}daysAgo`, endDate: 'today' },
            { name: 'prev', startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo` },
        ],
        metrics: [{ name: 'activeUsers' }, { name: 'engagementRate' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
    });
    const rows = report.rows || [];
    const byName = (name: string, idx: number) =>
        rows.find((r) => r.dimensionValues?.[0]?.value === name) ?? rows[idx];
    const cur = byName('cur', 0);
    const prev = byName('prev', 1);
    const num = (row: typeof cur, i: number) => {
        const v = row?.metricValues?.[i]?.value;
        return v === undefined ? null : parseFloat(v);
    };
    return {
        visitors: num(cur, 0),
        visitors_prev: rows.length > 1 ? num(prev, 0) : null,
        engagement_rate: num(cur, 1) !== null ? +(num(cur, 1)! * 100).toFixed(1) : null,
        bounce_rate: num(cur, 2) !== null ? +(num(cur, 2)! * 100).toFixed(1) : null,
        avg_session_duration: num(cur, 3) !== null ? Math.round(num(cur, 3)!) : null,
    };
}

interface DailyRow {
    date: string;
    users?: number | null;
    sessions?: number | null;
    pageviews?: number | null;
    clicks?: number | null;
    impressions?: number | null;
}

async function fetchGaDaily(token: string, pid: string): Promise<DailyRow[]> {
    const report = await ga4Report(token, pid, {
        dateRanges: [{ startDate: `${DAILY_DAYS - 1}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 400,
    });
    return (report.rows || []).map((r) => ({
        date: r.dimensionValues?.[0]?.value || '',
        users: parseInt(r.metricValues?.[0]?.value || '0', 10) || 0,
        sessions: parseInt(r.metricValues?.[1]?.value || '0', 10) || 0,
        pageviews: parseInt(r.metricValues?.[2]?.value || '0', 10) || 0,
    }));
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function fetchGscDaily(token: string, siteUrl: string): Promise<DailyRow[]> {
    const end = new Date();
    const start = new Date(end.getTime() - (DAILY_DAYS - 1) * 86_400_000);
    const data = (await runGSCQuery(token, siteUrl, ['date'], isoDay(start), isoDay(end), 400, AbortSignal.timeout(20_000))) as {
        rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number }>;
    };
    return (data.rows || [])
        .filter((r) => r.keys?.[0])
        .map((r) => ({ date: r.keys![0], clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0) }));
}

function mergeDaily(ga: DailyRow[], gsc: DailyRow[]): DailyRow[] {
    const byDay = new Map<string, DailyRow>();
    const norm = (d: string) => (d.includes('-') ? d : `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
    for (const r of ga) byDay.set(norm(r.date), { ...r, date: norm(r.date) });
    for (const r of gsc) {
        const k = norm(r.date);
        byDay.set(k, { ...(byDay.get(k) || { date: k }), clicks: r.clicks, impressions: r.impressions });
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Store a verification result (also used by the join and Re-check routes). */
export async function storeVerification(entryId: number, outcome: OwnershipOutcome & { gscSiteUrl?: string | null; verifiedHost?: string | null }) {
    return lbAdmin(`/api/lb/entry/${entryId}/verification`, {
        method: 'PUT',
        body: outcome.transient
            ? { transient_error: outcome.message }
            : { level: outcome.level, detail: outcome.detail, host: outcome.verifiedHost ?? undefined, gsc_site_url: outcome.gscSiteUrl ?? undefined },
    });
}

export async function refreshEntry(input: RefreshInput): Promise<RefreshResult> {
    const result: RefreshResult = { ok: false, verification: null, days: 0, gsc: false, audience: false };
    let token: string;
    try {
        token = await getValidAccessToken(input.accessToken, input.refreshToken);
    } catch (err) {
        result.error = `Google token: ${err instanceof Error ? err.message : 'unknown error'}`;
        return result;
    }
    const pid = cleanPropertyId(input.gaPropertyId);

    // 1. Ownership (decides the badge and whether the entry ranks).
    let gscSiteUrl: string | null = input.gscSiteUrl ?? null;
    if (!input.skipVerify && input.websiteUrl) {
        try {
            const outcome = await checkOwnership({
                websiteUrl: input.websiteUrl,
                gaPropertyId: input.gaPropertyId,
                accessToken: input.accessToken,
                refreshToken: input.refreshToken,
            });
            result.verification = outcome;
            await storeVerification(input.entryId, outcome);
            gscSiteUrl = outcome.gscSiteUrl;
        } catch (err) {
            console.warn(`[leaderboard] verification failed for entry ${input.entryId}:`, err);
        }
    }

    // 2. Numbers. GA4 is required; Search Console is best effort.
    try {
        const [ranges, daily, gscDaily] = await Promise.all([
            Promise.all(RANGE_DAYS.map((r) => fetchRange(token, pid, r.days))),
            fetchGaDaily(token, pid),
            gscSiteUrl ? fetchGscDaily(token, gscSiteUrl).catch((err) => { console.warn(`[leaderboard] GSC daily failed for entry ${input.entryId}:`, err); return null; }) : Promise.resolve(null),
        ]);
        const rangeBody: Record<string, RangeNumbers> = {};
        RANGE_DAYS.forEach((r, i) => { rangeBody[r.key] = ranges[i]; });
        const merged = mergeDaily(daily, gscDaily || []);
        const put = await lbAdmin(`/api/lb/entry/${input.entryId}/metrics`, {
            method: 'PUT',
            body: { daily: merged, ranges: rangeBody },
            timeoutMs: 30_000,
        });
        if (!put.ok) {
            result.error = `Storing metrics failed: ${put.error}`;
            return result;
        }
        result.days = merged.length;
        result.gsc = Boolean(gscDaily && gscDaily.length > 0);
    } catch (err) {
        result.error = err instanceof Error ? err.message : 'GA4 request failed';
        return result;
    }

    // 3. Audience breakdowns (kept by the admin API; shown only per the owner's privacy settings).
    if (!input.skipAudience) {
        try {
            const audience = await collectAudience({ token, gaPropertyId: input.gaPropertyId, websiteUrl: input.websiteUrl });
            const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${input.entryId}/audience`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                body: JSON.stringify(audience),
                signal: AbortSignal.timeout(15_000),
            });
            result.audience = res.ok;
            const iso2 = audience.countries?.find((c) => c.iso2)?.iso2;
            if (iso2) {
                await lbAdmin(`/api/lb/entry/${input.entryId}/metrics`, { method: 'PUT', body: { daily: [], ranges: {}, primary_country: iso2 } });
            }
        } catch (err) {
            console.warn(`[leaderboard] audience failed for entry ${input.entryId}:`, err);
        }
    }

    result.ok = true;
    return result;
}
