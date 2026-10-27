/**
 * GA4 reports for the site pages. Each one is a single runReport with the
 * current and comparison ranges in the same request (GA4 adds a `dateRange`
 * dimension), so a card costs one GA4 request, not two.
 */
import { andFilters } from '@/components/site/lib/filters';
import { bucketDates, gaBucketDate, type Interval } from '@/components/site/lib/intervals';
import { AI_SOURCE_PATTERN } from '@/components/site/lib/rules';
import type {
    Ga4Breakdown, Ga4BreakdownResponse, Ga4Heatmap, Ga4OrganicSeries, Ga4PageTrends, Ga4Row, Ga4SeriesPoint, Ga4Summary, Ga4Totals,
    RealtimeResponse, RetentionResponse,
} from '@/components/site/lib/types';
import { ga4Realtime, ga4Report, type GaReport } from './google';
import { addDays, daysBetween, type RangeParams } from './params';

function ranges(r: RangeParams) {
    const out: { startDate: string; endDate: string; name: string }[] = [{ startDate: r.cur.start, endDate: r.cur.end, name: 'cur' }];
    if (r.cmp) out.push({ startDate: r.cmp.start, endDate: r.cmp.end, name: 'cmp' });
    return out;
}

const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

function gaDate(v: string): string {
    return v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
}

/** Split a multi-range report into rows per range ('cur' | 'cmp'). */
function byRange(report: GaReport, dimCount: number, multi: boolean) {
    const out: { cur: { dims: string[]; m: number[] }[]; cmp: { dims: string[]; m: number[] }[] } = { cur: [], cmp: [] };
    for (const row of report.rows ?? []) {
        const dv = (row.dimensionValues ?? []).map((d) => d.value ?? '');
        const m = (row.metricValues ?? []).map((x) => num(x.value));
        const range = multi ? dv[dimCount] : 'cur';
        const dims = dv.slice(0, dimCount);
        if (range === 'cmp' || range === 'date_range_1') out.cmp.push({ dims, m });
        else out.cur.push({ dims, m });
    }
    return out;
}

// ─── Summary (KPIs + daily series + AI traffic) ───────────────────────────

const TOTAL_METRICS = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'screenPageViews', 'keyEvents', 'engagementRate', 'averageSessionDuration'];
const SERIES_METRICS = ['activeUsers', 'sessions', 'screenPageViews', 'keyEvents', 'engagementRate'];

function totalsFrom(m: number[] | undefined, ai: number): Ga4Totals {
    const v = m ?? [];
    return {
        users: v[0] ?? 0,
        newUsers: v[1] ?? 0,
        sessions: v[2] ?? 0,
        engagedSessions: v[3] ?? 0,
        pageviews: v[4] ?? 0,
        conversions: v[5] ?? 0,
        engagementRate: v[6] ?? 0,
        avgDuration: v[7] ?? 0,
        ai,
    };
}

function fillDays(start: string, end: string): string[] {
    const n = Math.max(0, daysBetween(start, end));
    return Array.from({ length: n }, (_, i) => addDays(start, i));
}

type GaFilter = Record<string, unknown> | null;

const BUCKET_DIM: Record<Interval, string> = { day: 'date', week: 'isoYearIsoWeek', month: 'yearMonth' };

export async function ga4Summary(
    userId: string, token: string, property: string, r: RangeParams,
    opts: { filter?: GaFilter; interval?: Interval } = {},
): Promise<Ga4Summary> {
    const multi = Boolean(r.cmp);
    const dr = ranges(r);
    const filter = opts.filter ?? null;
    const interval = opts.interval ?? 'day';
    const bucketDim = BUCKET_DIM[interval];
    const aiFilter = { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'PARTIAL_REGEXP', value: AI_SOURCE_PATTERN, caseSensitive: false } } };
    const withFilter = filter ? { dimensionFilter: filter } : {};
    const [totals, series, ai] = await Promise.all([
        ga4Report(userId, token, property, { dateRanges: dr, metrics: TOTAL_METRICS.map((name) => ({ name })), limit: 5, ...withFilter }),
        ga4Report(userId, token, property, { dateRanges: dr, dimensions: [{ name: bucketDim }], metrics: SERIES_METRICS.map((name) => ({ name })), limit: 2000, keepEmptyRows: true, ...withFilter }),
        ga4Report(userId, token, property, { dateRanges: dr, dimensions: [{ name: bucketDim }], metrics: [{ name: 'sessions' }], dimensionFilter: andFilters(filter, aiFilter), limit: 2000 }).catch(() => null),
    ]);

    const t = byRange(totals, 0, multi);
    const s = byRange(series, 1, multi);
    const a = ai ? byRange(ai, 1, multi) : { cur: [], cmp: [] };
    const curName = (v: string) => gaBucketDate(v, interval, r.cur.start);
    const cmpName = (v: string) => gaBucketDate(v, interval, r.cmp?.start ?? r.cur.start);
    const aiCur = new Map(a.cur.map((x) => [curName(x.dims[0]), x.m[0] ?? 0]));
    const aiCmp = new Map(a.cmp.map((x) => [cmpName(x.dims[0]), x.m[0] ?? 0]));
    const sum = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);

    const curByDate = new Map(s.cur.map((x) => [curName(x.dims[0]), x.m]));
    const cmpByDate = new Map(s.cmp.map((x) => [cmpName(x.dims[0]), x.m]));
    const curDays = interval === 'day' ? fillDays(r.cur.start, r.cur.end) : bucketDates(r.cur.start, r.cur.end, interval);
    const cmpDays = r.cmp ? (interval === 'day' ? fillDays(r.cmp.start, r.cmp.end) : bucketDates(r.cmp.start, r.cmp.end, interval)) : [];
    const points: Ga4SeriesPoint[] = curDays.map((date, i) => {
        const m = curByDate.get(date);
        const p: Ga4SeriesPoint = {
            date,
            users: m?.[0] ?? 0,
            sessions: m?.[1] ?? 0,
            pageviews: m?.[2] ?? 0,
            conversions: m?.[3] ?? 0,
            engagementRate: m?.[4] ?? 0,
            ai: aiCur.get(date) ?? 0,
        };
        if (r.cmp) {
            const pd = cmpDays[i] ?? null;
            const pm = pd ? cmpByDate.get(pd) : undefined;
            p.prevDate = pd;
            p.prev_users = pd ? pm?.[0] ?? 0 : null;
            p.prev_sessions = pd ? pm?.[1] ?? 0 : null;
            p.prev_pageviews = pd ? pm?.[2] ?? 0 : null;
            p.prev_conversions = pd ? pm?.[3] ?? 0 : null;
            p.prev_ai = pd ? aiCmp.get(pd) ?? 0 : null;
        }
        return p;
    });

    return {
        totals: totalsFrom(t.cur[0]?.m, sum(aiCur)),
        previous: multi ? totalsFrom(t.cmp[0]?.m, sum(aiCmp)) : null,
        series: points,
        interval,
        ...(totals.metadata?.timeZone ? { timeZone: totals.metadata.timeZone } : {}),
    };
}

// ─── Breakdowns ────────────────────────────────────────────────────────────

interface BreakdownSpec {
    dims: string[];
    metrics: string[];
    order: string;
    limit: number;
    filter?: Record<string, unknown>;
}

const TRAFFIC = ['sessions', 'activeUsers', 'engagementRate', 'keyEvents', 'averageSessionDuration'];

export const GA4_BREAKDOWNS: Record<Ga4Breakdown, BreakdownSpec> = {
    channels: { dims: ['sessionDefaultChannelGroup'], metrics: TRAFFIC, order: 'sessions', limit: 60 },
    sources: { dims: ['sessionSourceMedium'], metrics: TRAFFIC, order: 'sessions', limit: 300 },
    referrers: { dims: ['sessionSource'], metrics: TRAFFIC, order: 'sessions', limit: 300 },
    pages: {
        dims: ['hostName', 'pagePath'],
        metrics: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'engagementRate', 'keyEvents'],
        order: 'screenPageViews',
        limit: 1500,
    },
    landing: { dims: ['landingPage'], metrics: ['sessions', 'activeUsers', 'engagementRate', 'keyEvents', 'averageSessionDuration', 'bounceRate'], order: 'sessions', limit: 600 },
    countries: { dims: ['country', 'countryId'], metrics: ['activeUsers', 'sessions', 'engagementRate', 'keyEvents'], order: 'activeUsers', limit: 300 },
    cities: { dims: ['city', 'country'], metrics: ['activeUsers', 'sessions', 'engagementRate'], order: 'activeUsers', limit: 300 },
    languages: { dims: ['language'], metrics: ['activeUsers', 'sessions', 'engagementRate'], order: 'activeUsers', limit: 150 },
    devices: { dims: ['deviceCategory'], metrics: ['activeUsers', 'sessions', 'engagementRate', 'keyEvents'], order: 'activeUsers', limit: 12 },
    browsers: { dims: ['browser'], metrics: ['activeUsers', 'sessions', 'engagementRate'], order: 'activeUsers', limit: 60 },
    os: { dims: ['operatingSystem'], metrics: ['activeUsers', 'sessions', 'engagementRate'], order: 'activeUsers', limit: 60 },
    events: { dims: ['eventName'], metrics: ['eventCount', 'totalUsers', 'keyEvents'], order: 'eventCount', limit: 300 },
    newReturning: { dims: ['newVsReturning'], metrics: ['activeUsers', 'sessions', 'engagementRate', 'keyEvents'], order: 'activeUsers', limit: 10 },
};

export function isBreakdown(v: string | null): v is Ga4Breakdown {
    return typeof v === 'string' && v in GA4_BREAKDOWNS;
}

export async function ga4Breakdown(userId: string, token: string, property: string, report: Ga4Breakdown, r: RangeParams, filter: GaFilter = null): Promise<Ga4BreakdownResponse> {
    const spec = GA4_BREAKDOWNS[report];
    const dimensionFilter = andFilters(spec.filter ?? null, filter);
    const multi = Boolean(r.cmp);
    const limit = multi ? spec.limit * 2 : spec.limit;
    const res = await ga4Report(userId, token, property, {
        dateRanges: ranges(r),
        dimensions: spec.dims.map((name) => ({ name })),
        metrics: spec.metrics.map((name) => ({ name })),
        orderBys: [{ metric: { metricName: spec.order }, desc: true }],
        limit,
        ...(dimensionFilter ? { dimensionFilter } : {}),
    });
    const split = byRange(res, spec.dims.length, multi);
    const truncated = (res.rowCount ?? 0) > (res.rows?.length ?? 0);
    const keyOf = (dims: string[]) => dims.join('\u0001');
    const prevMap = new Map(split.cmp.map((x) => [keyOf(x.dims), x.m]));
    const toRec = (m: number[]) => Object.fromEntries(spec.metrics.map((name, i) => [name, m[i] ?? 0]));

    const rows: Ga4Row[] = split.cur.map((x) => {
        const k = keyOf(x.dims);
        const pm = prevMap.get(k);
        const row: Ga4Row = {
            key: k,
            dims: Object.fromEntries(spec.dims.map((d, i) => [d, x.dims[i] ?? ''])),
            cur: toRec(x.m),
        };
        // Missing previous row: zero when GA4 returned everything, unknown when it was cut off.
        if (multi) row.prev = pm ? toRec(pm) : truncated ? null : toRec([]);
        return row;
    });
    return { report, rows: rows.slice(0, spec.limit), truncated };
}

// ─── Realtime ───────────────────────────────────────────────────────────────

export async function ga4RealtimeSnapshot(userId: string, token: string, property: string): Promise<RealtimeResponse> {
    const users = [{ name: 'activeUsers' }];
    const [total, minutes, pages, countries, devices, live] = await Promise.all([
        ga4Realtime(userId, token, property, { metrics: users }),
        ga4Realtime(userId, token, property, { dimensions: [{ name: 'minutesAgo' }], metrics: users, limit: 60 }),
        ga4Realtime(userId, token, property, { dimensions: [{ name: 'unifiedScreenName' }], metrics: users, limit: 20 }),
        ga4Realtime(userId, token, property, { dimensions: [{ name: 'country' }, { name: 'countryId' }], metrics: users, limit: 60 }),
        ga4Realtime(userId, token, property, { dimensions: [{ name: 'deviceCategory' }], metrics: users, limit: 5 }),
        // Aggregated rows (minute x place x device x page), not individual visitors: GA4 has no visitor log.
        ga4Realtime(userId, token, property, {
            dimensions: [{ name: 'minutesAgo' }, { name: 'countryId' }, { name: 'country' }, { name: 'city' }, { name: 'deviceCategory' }, { name: 'unifiedScreenName' }],
            metrics: users,
            orderBys: [{ dimension: { dimensionName: 'minutesAgo', orderType: 'NUMERIC' }, desc: false }, { metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 40,
        }).catch(() => null),
    ]);
    const list = (rep: GaReport) => (rep.rows ?? []).map((row) => ({ name: row.dimensionValues?.[0]?.value || '(not set)', users: num(row.metricValues?.[0]?.value) }));
    const perMinute = Array.from({ length: 30 }, () => 0);
    for (const row of minutes.rows ?? []) {
        const ago = Number(row.dimensionValues?.[0]?.value);
        if (Number.isFinite(ago) && ago >= 0 && ago < 30) perMinute[29 - ago] = num(row.metricValues?.[0]?.value);
    }
    const dv = (row: { dimensionValues?: { value?: string }[] }, i: number) => row.dimensionValues?.[i]?.value || '(not set)';
    return {
        activeUsers: num(total.rows?.[0]?.metricValues?.[0]?.value),
        perMinute,
        pages: list(pages),
        countries: (countries.rows ?? []).map((row) => ({ name: dv(row, 0), code: dv(row, 1), users: num(row.metricValues?.[0]?.value) })),
        devices: list(devices),
        live: live ? (live.rows ?? []).map((row) => ({
            minutesAgo: Number(dv(row, 0)) || 0,
            code: dv(row, 1),
            country: dv(row, 2),
            city: dv(row, 3),
            device: dv(row, 4),
            page: dv(row, 5),
            users: num(row.metricValues?.[0]?.value),
        })) : null,
        fetchedAt: new Date().toISOString(),
    };
}

// ─── Peak hours (weekday x hour) ────────────────────────────────────────────

export async function ga4Heatmap(userId: string, token: string, property: string, r: RangeParams, filter: GaFilter = null): Promise<Ga4Heatmap> {
    const res = await ga4Report(userId, token, property, {
        dateRanges: [{ startDate: r.cur.start, endDate: r.cur.end }],
        dimensions: [{ name: 'dayOfWeek' }, { name: 'hour' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        limit: 200,
        ...(filter ? { dimensionFilter: filter } : {}),
    });
    const grid = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    const sessions = grid();
    const users = grid();
    for (const row of res.rows ?? []) {
        const d = Number(row.dimensionValues?.[0]?.value);
        const h = Number(row.dimensionValues?.[1]?.value);
        if (!(d >= 0 && d < 7 && h >= 0 && h < 24)) continue;
        sessions[d][h] = num(row.metricValues?.[0]?.value);
        users[d][h] = num(row.metricValues?.[1]?.value);
    }
    return { sessions, users, timeZone: res.metadata?.timeZone ?? null, days: daysBetween(r.cur.start, r.cur.end) };
}

// ─── Top pages with titles and trend bars ──────────────────────────────────

const MAX_TREND_BARS = 14;

export async function ga4PageTrends(userId: string, token: string, property: string, r: RangeParams, filter: GaFilter = null, limit = 10): Promise<Ga4PageTrends> {
    const multi = Boolean(r.cmp);
    const n = Math.max(1, Math.min(25, limit));
    const top = await ga4Report(userId, token, property, {
        dateRanges: ranges(r),
        dimensions: [{ name: 'hostName' }, { name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: multi ? 600 : 300,
        ...(filter ? { dimensionFilter: filter } : {}),
    });
    const split = byRange(top, 3, multi);
    type Agg = { host: string; path: string; views: number; prev: number; title: string; titleViews: number };
    const pages = new Map<string, Agg>();
    for (const x of split.cur) {
        const [host, path, title] = x.dims;
        const k = `${host}\u0001${path}`;
        const a = pages.get(k) ?? { host, path, views: 0, prev: 0, title: '', titleViews: -1 };
        const v = x.m[0] ?? 0;
        a.views += v;
        if (v > a.titleViews && title && title !== '(not set)') {
            a.title = title;
            a.titleViews = v;
        }
        pages.set(k, a);
    }
    const truncated = (top.rowCount ?? 0) > (top.rows?.length ?? 0);
    for (const x of split.cmp) {
        const a = pages.get(`${x.dims[0]}\u0001${x.dims[1]}`);
        if (a) a.prev += x.m[0] ?? 0;
    }
    const ranked = [...pages.values()].sort((a, b) => b.views - a.views);
    const chosen = ranked.slice(0, n);
    const titles = ranked.filter((p) => p.title).slice(0, 300).map((p) => ({ host: p.host, path: p.path, title: p.title }));
    if (!chosen.length) return { rows: [], bars: 0, barDays: 0, titles };

    const days = daysBetween(r.cur.start, r.cur.end);
    const bars = Math.min(MAX_TREND_BARS, days);
    const inList = { filter: { fieldName: 'pagePath', inListFilter: { values: [...new Set(chosen.map((c) => c.path))], caseSensitive: true } } };
    const daily = await ga4Report(userId, token, property, {
        dateRanges: [{ startDate: r.cur.start, endDate: r.cur.end }],
        dimensions: [{ name: 'hostName' }, { name: 'pagePath' }, { name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        dimensionFilter: andFilters(filter, inList),
        limit: 10000,
    }).catch(() => null);
    const trend = new Map<string, number[]>();
    const startMs = Date.parse(`${r.cur.start}T00:00:00Z`);
    for (const row of daily?.rows ?? []) {
        const host = row.dimensionValues?.[0]?.value ?? '';
        const path = row.dimensionValues?.[1]?.value ?? '';
        const date = gaDate(row.dimensionValues?.[2]?.value ?? '');
        const i = Math.round((Date.parse(`${date}T00:00:00Z`) - startMs) / 86_400_000);
        if (!(i >= 0 && i < days)) continue;
        const k = `${host}\u0001${path}`;
        const t = trend.get(k) ?? Array.from({ length: bars }, () => 0);
        t[Math.min(bars - 1, Math.floor((i * bars) / days))] += num(row.metricValues?.[0]?.value);
        trend.set(k, t);
    }
    return {
        rows: chosen.map((c) => {
            const k = `${c.host}\u0001${c.path}`;
            return {
                host: c.host,
                path: c.path,
                title: c.title || null,
                views: c.views,
                ...(multi ? { prevViews: c.prev > 0 || !truncated ? c.prev : null } : {}),
                trend: daily ? trend.get(k) ?? Array.from({ length: bars }, () => 0) : null,
            };
        }),
        bars,
        barDays: days / bars,
        titles,
    };
}

// ─── Google organic sessions per day (for the Search vs traffic chart) ─────

export async function ga4OrganicSeries(userId: string, token: string, property: string, r: RangeParams): Promise<Ga4OrganicSeries> {
    const google = {
        andGroup: {
            expressions: [
                { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google', caseSensitive: false } } },
                { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'organic', caseSensitive: false } } },
            ],
        },
    };
    const res = await ga4Report(userId, token, property, {
        dateRanges: [{ startDate: r.cur.start, endDate: r.cur.end }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: google,
        keepEmptyRows: true,
        limit: 2000,
    });
    const byDate = new Map((res.rows ?? []).map((row) => [gaDate(row.dimensionValues?.[0]?.value ?? ''), num(row.metricValues?.[0]?.value)]));
    return { series: fillDays(r.cur.start, r.cur.end).map((date) => ({ date, sessions: byDate.get(date) ?? 0 })) };
}

// ─── Retention (cohorts by first visit) ────────────────────────────────────

const COHORTS = { daily: { count: 14, offset: 14, nth: 'cohortNthDay', gran: 'DAILY' }, weekly: { count: 8, offset: 8, nth: 'cohortNthWeek', gran: 'WEEKLY' }, monthly: { count: 6, offset: 6, nth: 'cohortNthMonth', gran: 'MONTHLY' } } as const;

function utcToday(): Date {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Cohort windows GA4 accepts: single days, Sunday–Saturday weeks, calendar months (complete ones only). */
function cohortWindows(mode: RetentionResponse['mode']): { start: string; end: string }[] {
    const today = utcToday();
    const out: { start: string; end: string }[] = [];
    if (mode === 'daily') {
        for (let i = COHORTS.daily.count; i >= 1; i--) {
            const d = new Date(today.getTime() - i * 86_400_000);
            out.push({ start: iso(d), end: iso(d) });
        }
    } else if (mode === 'weekly') {
        const lastSat = new Date(today.getTime() - ((today.getUTCDay() + 1) % 7 || 7) * 86_400_000);
        for (let i = COHORTS.weekly.count - 1; i >= 0; i--) {
            const end = new Date(lastSat.getTime() - i * 7 * 86_400_000);
            out.push({ start: iso(new Date(end.getTime() - 6 * 86_400_000)), end: iso(end) });
        }
    } else {
        for (let i = COHORTS.monthly.count; i >= 1; i--) {
            const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
            const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i + 1, 0));
            out.push({ start: iso(start), end: iso(end) });
        }
    }
    return out;
}

/** Periods a cohort could have reached by today (later cells are null, not 0). */
function reachable(mode: RetentionResponse['mode'], start: string): number {
    const days = Math.floor((utcToday().getTime() - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    if (mode === 'daily') return days;
    if (mode === 'weekly') return Math.floor(days / 7);
    return Math.floor(days / 30);
}

export async function ga4Retention(userId: string, token: string, property: string, mode: RetentionResponse['mode']): Promise<RetentionResponse> {
    const cfg = COHORTS[mode];
    const windows = cohortWindows(mode);
    const res = await ga4Report(userId, token, property, {
        cohortSpec: {
            cohorts: windows.map((w, i) => ({ name: `c${i}`, dimension: 'firstSessionDate', dateRange: { startDate: w.start, endDate: w.end } })),
            cohortsRange: { granularity: cfg.gran, startOffset: 0, endOffset: cfg.offset },
        },
        dimensions: [{ name: 'cohort' }, { name: cfg.nth }],
        metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
    }, 30 * 60_000);
    const cells = new Map<string, { active: number; total: number }>();
    for (const row of res.rows ?? []) {
        const c = row.dimensionValues?.[0]?.value ?? '';
        const n = Number(row.dimensionValues?.[1]?.value);
        cells.set(`${c}:${n}`, { active: num(row.metricValues?.[0]?.value), total: num(row.metricValues?.[1]?.value) });
    }
    const cohorts = windows.map((w, i) => {
        const total = cells.get(`c${i}:0`)?.total ?? 0;
        const max = reachable(mode, w.start);
        const retention = Array.from({ length: cfg.offset + 1 }, (_, n) => {
            if (n > max) return null;
            if (n === 0) return total > 0 ? 100 : null;
            const cell = cells.get(`c${i}:${n}`);
            return total > 0 ? Math.round(((cell?.active ?? 0) / total) * 1000) / 10 : null;
        });
        return { date: w.start, users: total, retention };
    }).filter((c) => c.users > 0);
    const curve = Array.from({ length: cfg.offset + 1 }, (_, n) => {
        const vals = cohorts.map((c) => c.retention[n]).filter((v): v is number => v !== null);
        return { period: n, retention: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0 };
    });
    const at = (n: number) => curve[Math.min(n, curve.length - 1)]?.retention ?? 0;
    return { mode, cohorts, averages: { day1: at(1), day7: at(7), day14: at(14), day30: at(30) }, curve };
}

// ─── One page (Pages drawer) ────────────────────────────────────────────────

export interface Ga4PageDetail {
    series: { date: string; pageviews: number; users: number; prevDate?: string | null; prev_pageviews?: number | null }[];
    totals: { pageviews: number; users: number; engagement: number; conversions: number };
    previous: { pageviews: number; users: number; engagement: number; conversions: number } | null;
    sources: { name: string; views: number }[];
}

export async function ga4PageDetail(userId: string, token: string, property: string, path: string, host: string | null, r: RangeParams): Promise<Ga4PageDetail> {
    const multi = Boolean(r.cmp);
    const exprs: Record<string, unknown>[] = [{ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: path, caseSensitive: false } } }];
    if (host) exprs.push({ filter: { fieldName: 'hostName', stringFilter: { matchType: 'ENDS_WITH', value: host, caseSensitive: false } } });
    const dimensionFilter = exprs.length > 1 ? { andGroup: { expressions: exprs } } : exprs[0];
    const [daily, totals, sources] = await Promise.all([
        ga4Report(userId, token, property, { dateRanges: ranges(r), dimensions: [{ name: 'date' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], dimensionFilter, limit: 2000 }),
        ga4Report(userId, token, property, { dateRanges: ranges(r), metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'userEngagementDuration' }, { name: 'keyEvents' }], dimensionFilter, limit: 5 }),
        ga4Report(userId, token, property, { dateRanges: [{ startDate: r.cur.start, endDate: r.cur.end }], dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'screenPageViews' }], dimensionFilter, orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 15 }),
    ]);
    const d = byRange(daily, 1, multi);
    const t = byRange(totals, 0, multi);
    const cur = new Map(d.cur.map((x) => [gaDate(x.dims[0]), x.m]));
    const cmp = new Map(d.cmp.map((x) => [gaDate(x.dims[0]), x.m]));
    const curDays = fillDays(r.cur.start, r.cur.end);
    const cmpDays = r.cmp ? fillDays(r.cmp.start, r.cmp.end) : [];
    const tot = (m: number[] | undefined) => {
        const users = m?.[1] ?? 0;
        return { pageviews: m?.[0] ?? 0, users, engagement: users > 0 ? (m?.[2] ?? 0) / users : 0, conversions: m?.[3] ?? 0 };
    };
    return {
        series: curDays.map((date, i) => {
            const pd = cmpDays[i] ?? null;
            return {
                date,
                pageviews: cur.get(date)?.[0] ?? 0,
                users: cur.get(date)?.[1] ?? 0,
                ...(r.cmp ? { prevDate: pd, prev_pageviews: pd ? cmp.get(pd)?.[0] ?? 0 : null } : {}),
            };
        }),
        totals: tot(t.cur[0]?.m),
        previous: multi ? tot(t.cmp[0]?.m) : null,
        sources: (sources.rows ?? []).map((row) => ({ name: row.dimensionValues?.[0]?.value || '(not set)', views: num(row.metricValues?.[0]?.value) })),
    };
}
