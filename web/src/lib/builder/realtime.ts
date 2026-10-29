/**
 * Realtime widget (round 9): active users in the last 30 minutes from the GA4 Realtime API.
 * Isomorphic and dependency free: the editor, the viewer, the server module and the tests import from here.
 *
 * What GA4's Realtime API offers (developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema):
 * dimensions country, city, deviceCategory, unifiedScreenName (page title), minutesAgo, eventName and a few more.
 * It has NO traffic source dimension, so the list under the number is Country, City, Page or Device, never Source.
 */
import { getDim } from './catalog';
import type { DataFrame, FilterClause, RealtimeBreakdown, RealtimeConfig, WidgetErrorCode, WidgetResult } from './types';

/** The window GA4 reports for standard properties. */
export const REALTIME_MINUTES = 30;
/** The widget asks again this often while it is on screen and visible. */
export const REALTIME_REFRESH_MS = 60_000;
/** Public links never see data older than this, and never trigger a Google call more often than this per dashboard + widget. */
export const REALTIME_PUBLIC_TTL_MS = 30_000;
/** Owner views (also TV): Google is asked at most this often per user + property. */
export const REALTIME_OWNER_TTL_MS = 20_000;
/** Sites one realtime widget adds up on an "All sites" source (3 Google calls each). */
export const REALTIME_MAX_SITES = 10;

export const REALTIME_BREAKDOWNS: Array<{ id: RealtimeBreakdown; label: string; api: string | null }> = [
    { id: 'none', label: 'Number and bars only', api: null },
    { id: 'country', label: 'Country', api: 'countryId' },
    { id: 'city', label: 'City', api: 'city' },
    { id: 'page', label: 'Page', api: 'unifiedScreenName' },
    { id: 'device', label: 'Device', api: 'deviceCategory' },
];

export const REALTIME_TOPS: Array<3 | 5 | 8> = [3, 5, 8];

export function realtimeBreakdownLabel(b: RealtimeBreakdown): string {
    return REALTIME_BREAKDOWNS.find((x) => x.id === b)?.label ?? 'Country';
}

export function defaultRealtimeConfig(): RealtimeConfig {
    return { breakdown: 'country', top: 5, bars: true };
}

/** A config as the viewer renders it: anything unknown falls back to the default (old or hand-edited docs). */
export function normalizeRealtimeConfig(raw: Partial<RealtimeConfig> | undefined): RealtimeConfig {
    const d = defaultRealtimeConfig();
    const breakdown = REALTIME_BREAKDOWNS.some((b) => b.id === raw?.breakdown) ? raw!.breakdown! : d.breakdown;
    const top = REALTIME_TOPS.includes(raw?.top as 3 | 5 | 8) ? (raw!.top as 3 | 5 | 8) : d.top;
    return { breakdown, top, bars: raw?.bars === false ? false : d.bars };
}

// ── Result ───────────────────────────────────────────────────────────────

export interface RealtimeRow {
    /** Country code, city, page title or device. */
    key: string;
    users: number;
}

export interface RealtimeSnapshot {
    /** Distinct active users over the whole window (not the sum of the minutes). */
    activeUsers: number;
    /** Active users per minute, oldest first, always REALTIME_MINUTES long (the last one is "now"). */
    perMinute: number[];
    breakdown: { by: Exclude<RealtimeBreakdown, 'none'>; rows: RealtimeRow[] } | null;
    /** ISO time the numbers were read from Google (not the time of the request: caches make them older). */
    fetchedAt: string;
    sourceLabel: string;
    /** Sites added up (an "All sites" source). */
    sites: number;
    /** Filters of the dashboard the realtime report could not apply (it only knows country, city and device). */
    filtersIgnored?: number;
}

export type RealtimeResponse =
    | { status: 'ok'; snapshot: RealtimeSnapshot }
    | { status: 'error'; code: WidgetErrorCode; message: string; retryable: boolean; retryAfterSec?: number; sourceLabel?: string; detail?: string };

// ── Errors in plain words ────────────────────────────────────────────────

/** What a viewer reads when Google's live report cannot be loaded. The widget keeps trying (every 30 s), so it says so. */
export const REALTIME_UPSTREAM_TEXT = "Couldn't load live data from Google Analytics. Retrying…";
export const REALTIME_QUOTA_TEXT = 'Google Analytics is limiting live data for a moment. Retrying…';

type RealtimeFail = Extract<RealtimeResponse, { status: 'error' }>;

/**
 * An error of the request itself (HTTP status from our route, or the network) as a plain answer. The viewer never reads
 * a raw string: not the server's error text, not "Failed to fetch". The technical detail is only for the owner
 * (`owner` true), who can open it behind a "Details" toggle; public links get none.
 */
export function realtimeHttpError(err: unknown, opts: { owner: boolean }): RealtimeFail {
    const status = typeof (err as { status?: unknown } | null)?.status === 'number' ? (err as { status: number }).status : 0;
    const raw = err instanceof Error ? (err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message) : typeof err === 'string' ? err : '';
    const detail = opts.owner ? `${status ? `HTTP ${status}` : 'Network error'}${raw ? `: ${raw}` : ''}`.slice(0, 240) : undefined;
    const base = (code: WidgetErrorCode, message: string, retryable: boolean, extra: Partial<RealtimeFail> = {}): RealtimeFail => ({ status: 'error', code, message, retryable, ...(detail ? { detail } : {}), ...extra });
    if (status === 401) return base('NOT_CONNECTED', opts.owner ? 'You are signed out. Sign in again to see live data.' : 'This dashboard needs a password to show live data.', false);
    if (status === 403) return base('NO_ACCESS', 'You do not have access to this live data.', false);
    if (status === 404) return base('UPSTREAM', 'Live data is not available on this dashboard any more.', false);
    if (status === 429) return base('QUOTA', 'Too many refreshes. Live data will update again in a minute.', true, { retryAfterSec: 60 });
    return base('UPSTREAM', REALTIME_UPSTREAM_TEXT, true);
}

/** The answer a card shows: the server's own error answer, with the owner-only detail dropped for everyone else. */
export function realtimeFailureView(response: RealtimeResponse | undefined, err: unknown, opts: { owner: boolean }): RealtimeFail | undefined {
    if (response?.status === 'error') return opts.owner ? response : { ...response, detail: undefined };
    return err ? realtimeHttpError(err, opts) : undefined;
}

// ── Filters ──────────────────────────────────────────────────────────────

/** Dimensions the realtime report can filter by (GA4 realtime has no page path, channel or source). */
const FILTERABLE = new Set(['country', 'city', 'device']);

/** Splits dashboard filters into the ones the realtime report can apply and a count of the rest. */
export function splitRealtimeFilters(clauses: FilterClause[]): { apply: FilterClause[]; ignored: number } {
    const apply: FilterClause[] = [];
    let ignored = 0;
    for (const c of clauses) {
        if (FILTERABLE.has(c.dimension) && getDim(c.dimension)?.ga4) apply.push(c);
        else ignored++;
    }
    return { apply, ignored };
}

// ── Parsing Google's answers ─────────────────────────────────────────────

interface GaReport {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
}

const num = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** The activeUsers column of a report (by header name, so extra columns cannot shift it). */
function usersIndex(r: GaReport): number {
    const i = (r.metricHeaders ?? []).findIndex((h) => h.name === 'activeUsers');
    return i >= 0 ? i : 0;
}

/** Total active users of the window: the one row of a report with no dimension. */
export function parseTotal(r: GaReport | null | undefined): number {
    if (!r?.rows?.length) return 0;
    const i = usersIndex(r);
    // One minute range = one row; take the largest so an extra date-range row can never double the number.
    return r.rows.reduce((m, row) => Math.max(m, num(row.metricValues?.[i]?.value)), 0);
}

/** Per-minute bars: minutesAgo 0 is the current minute, so the array runs oldest to newest. */
export function parsePerMinute(r: GaReport | null | undefined, minutes = REALTIME_MINUTES): number[] {
    const out = new Array<number>(minutes).fill(0);
    if (!r?.rows?.length) return out;
    const di = (r.dimensionHeaders ?? []).findIndex((h) => h.name === 'minutesAgo');
    const mi = usersIndex(r);
    for (const row of r.rows) {
        const ago = Number(row.dimensionValues?.[di >= 0 ? di : 0]?.value);
        if (!Number.isInteger(ago) || ago < 0 || ago >= minutes) continue;
        out[minutes - 1 - ago] = num(row.metricValues?.[mi]?.value);
    }
    return out;
}

/** Ranked rows of a one-dimension report, biggest first, empty and "(not set)" values dropped. */
export function parseRows(r: GaReport | null | undefined, limit: number): RealtimeRow[] {
    if (!r?.rows?.length) return [];
    const mi = usersIndex(r);
    const rows: RealtimeRow[] = [];
    for (const row of r.rows) {
        const key = (row.dimensionValues?.[0]?.value ?? '').trim();
        const users = num(row.metricValues?.[mi]?.value);
        if (!key || key === '(not set)' || users <= 0) continue;
        rows.push({ key: key.slice(0, 200), users });
    }
    return rows.sort((a, b) => b.users - a.users || a.key.localeCompare(b.key)).slice(0, limit);
}

export interface RawSnapshot {
    activeUsers: number;
    perMinute: number[];
    rows: RealtimeRow[];
    fetchedAt: number;
}

/** Adds the snapshots of several sites (an "All sites" source). Users on two sites count twice: the footnote says so. */
export function mergeRaw(list: RawSnapshot[], top: number): RawSnapshot {
    const perMinute = new Array<number>(REALTIME_MINUTES).fill(0);
    const rows = new Map<string, number>();
    let activeUsers = 0;
    let fetchedAt = Infinity;
    for (const s of list) {
        activeUsers += s.activeUsers;
        s.perMinute.forEach((v, i) => { perMinute[i] += v; });
        for (const r of s.rows) rows.set(r.key, (rows.get(r.key) ?? 0) + r.users);
        fetchedAt = Math.min(fetchedAt, s.fetchedAt);
    }
    return {
        activeUsers,
        perMinute,
        rows: [...rows.entries()].map(([key, users]) => ({ key, users })).sort((a, b) => b.users - a.users || a.key.localeCompare(b.key)).slice(0, top),
        fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
    };
}

// ── Keys ─────────────────────────────────────────────────────────────────

/** Digits of a GA4 property id ('properties/123' and '123' are the same property). */
export function propertyDigits(property: string): string {
    return /(\d+)/.exec(property)?.[1] ?? '';
}

/**
 * Cache key of one property's snapshot. ALWAYS per user as well as per property: a property-only key served
 * one user's realtime visitors to anyone who asked for that id while it was warm (round 3 fix).
 */
export function snapshotKey(userId: string, property: string, breakdown: RealtimeBreakdown, filterKey: string): string {
    return `rt|${userId}|${propertyDigits(property)}|${breakdown}|${filterKey}`;
}

/** Cache key of a public view's rendered answer: one entry per share link + widget + the viewer's own picks. */
export function publicResultKey(shareToken: string, ownerId: string, widgetId: string, picks: string): string {
    return `rtpub|${shareToken}|${ownerId}|${widgetId}|${picks}`;
}

/** "3 min ago" style age for the footnote. */
export function ageLabel(fetchedAt: string, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - new Date(fetchedAt).getTime()) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    return m <= 1 ? '1 min ago' : `${m} min ago`;
}

// ── Client helpers ───────────────────────────────────────────────────────

/** Query parameters of a public page URL that matter to a realtime read (site picks, filters, click filter, page). */
export function publicRealtimeQuery(pageQuery: string, widgetId: string): string {
    const src = new URLSearchParams(pageQuery);
    const out = new URLSearchParams();
    for (const [k, v] of src) if (k === 'page' || k === 'x' || k.startsWith('s.') || k.startsWith('f.')) out.append(k, v);
    out.set('w', widgetId);
    return out.toString();
}

/**
 * The answer as a WidgetResult, so the shared card chrome (title, source chip, errors, CSV) works unchanged.
 * The ranked list becomes the 'rows' frame (CSV of the list); the number and bars stay in the snapshot.
 */
export function realtimeFrameResult(res: RealtimeResponse): WidgetResult {
    if (res.status === 'error') {
        return { status: 'error', code: res.code, message: res.message, retryable: res.retryable, retryAfterSec: res.retryAfterSec, sourceLabel: res.sourceLabel, ...(res.code === 'NOT_CONNECTED' ? { hint: { action: 'reconnect' as const } } : {}) };
    }
    const s = res.snapshot;
    const parts: Record<string, DataFrame> = {};
    if (s.breakdown) {
        const dim = `d:${s.breakdown.by}`;
        parts.rows = {
            columns: [{ id: dim, kind: 'dimension', label: realtimeBreakdownLabel(s.breakdown.by) }, { id: 'm:ga4:activeUsers', kind: 'metric', label: 'Active users' }],
            rows: s.breakdown.rows.map((r) => ({ [dim]: r.key, 'm:ga4:activeUsers': r.users })),
        };
    }
    return { status: 'ok', fetchedAt: s.fetchedAt, cache: 'hit', parts, flags: {}, sourceLabel: s.sourceLabel };
}

/** How many list rows fit under the number and the bars (32 px each); 0 hides the list. */
export function realtimeRows(height: number, top: number, opts: { title: boolean; bars: boolean; footnote: boolean }): number {
    const used = (opts.title ? 36 : 0) + 32 + 60 + (opts.bars ? 64 : 0) + (opts.footnote ? 22 : 0);
    return Math.max(0, Math.min(top, Math.floor((height - used) / 32)));
}
