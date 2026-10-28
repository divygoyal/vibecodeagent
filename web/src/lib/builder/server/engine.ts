/**
 * Builder query engine (BUILDER.md 8.3): compile widgets, plan Google "leaves", merge identical
 * leaves across widgets, batch GA4 reports (batchRunReports, 5 per call, one property per batch),
 * cache every leaf with stale-while-revalidate, run everything through the shared per-property
 * limiter, then join, roll up, zero-fill and shape one result per widget.
 *
 * Every Google call goes through lib/googleApi.ts, so the demo shim (TC_DEMO_DATA=1) answers
 * them in the dev kit. Dates are resolved here (default range ends yesterday) so cache keys are
 * absolute.
 */
import { runGABatch, runGSCSearchAnalytics } from '@/lib/googleApi';
import { GoogleBreakerOpenError, reportGoogleOutcome, withGoogleSlot } from '@/lib/googleLimiter';
import { normalizeHost } from '@/lib/sites/pairing';
import { calcValue, expandCalcs, parseCalcId, registerCalcs, shareTotals, sumOf, withCalcValues, type CalcSpec } from '../calc';
import { dimInFamily, getDim, getMetric, type Family, type MetricDef } from '../catalog';
import { applyViewerControls, canonicalJson, compileWidget } from '../compile';
import { alpha2ToGsc, gscToAlpha2 } from '../countries';
import { lastCompleteDay, searchWindowOf } from '@/lib/dateRange';
import { addDays, autoGranularity, eachDay, fromDay, monthStart, resolveCompare, resolveRange, toDay, todayIn, weekStart } from '../dates';
import { widgetMeta } from '../registry';
import { tableTrendQuery } from '../trend';
import type {
    CalculatedMetric,
    CellValue,
    ControlDef,
    ControlState,
    DashboardQueryResponse,
    DataFrame,
    FilterClause,
    Iso,
    ResultFlags,
    SourceRef,
    WidgetDef,
    WidgetErrorCode,
    WidgetQuery,
    WidgetResult,
    WidgetResultError,
    WidgetResultOk,
} from '../types';
import {
    cacheGet,
    cacheSet,
    leafKey,
    negativeGet,
    negativeSet,
    NEGATIVE_TTL_MS,
    policyFor,
    singleFlight,
} from './cache';
import { loadSiteDirectory, resolvePortfolio, resolveSiteRef, siteSubLabel, sourceLabel, type ResolvedSite, type SiteDirectory } from './sources';

// ── Public types ─────────────────────────────────────────────────────────

export interface EngineDeps {
    /** Owner identity: cache key and limiter key. */
    userId: string;
    /** Owner's Google access token, fetched lazily (null = not connected). */
    getToken: () => Promise<string | null>;
    /**
     * Token for one GA4 property / Search Console site when the owner has extra Google accounts linked
     * (the account that lists it, lib/googleAccounts.ts). Absent or null = getToken's token.
     */
    getTokenFor?: (asset: { kind: 'ga4' | 'gsc'; id: string }) => Promise<string | null>;
    /** Site directory override (tests). */
    loadDirectory?: (token: string) => Promise<SiteDirectory>;
    /** 'public' = share-link traffic: min TTL, no `fresh`, per-owner budget for uncached calls. */
    mode: 'owner' | 'public';
    /** Owner only: ignore fresh TTL (still single-flight). */
    fresh?: boolean;
    now?: Date;
}

export interface EvalWidget { widget: WidgetDef; pageId?: string }

export interface EvalInput {
    widgets: EvalWidget[];
    defaultSource: SourceRef;
    controlDefs: ControlDef[];
    controls: ControlState;
    timezone?: string;
    /** Names of the dashboard's calculated metrics (round 7); the maths is in their ids. */
    calcs?: CalculatedMetric[];
}

// ── Errors ───────────────────────────────────────────────────────────────

class LeafError extends Error {
    constructor(readonly code: WidgetErrorCode, message: string, readonly retryAfterSec?: number) {
        super(message);
    }
}

const ERROR_TEXT: Record<WidgetErrorCode, string> = {
    NOT_CONNECTED: 'Connect Google to see this data.',
    NO_ACCESS: 'You no longer have access to this site. Choose another site.',
    NO_GA4_SOURCE: 'Link a Google Analytics property to this site to see this.',
    NO_GSC_SOURCE: 'Link a Search Console site to see this.',
    INCOMPATIBLE: 'These metrics and dimensions cannot be combined.',
    UNSUPPORTED_FOR_PORTFOLIO: 'Choose up to 10 sites, or break down by site or date only.',
    QUOTA: 'Google is rate limiting this property. Try again in a minute.',
    UPSTREAM: 'Google did not answer. Try again.',
    INVALID: 'This widget is not set up correctly.',
    DEMO_UNSUPPORTED: 'Not available in demo mode.',
};

function errResult(code: WidgetErrorCode, message?: string, extra: Partial<WidgetResultError> = {}): WidgetResultError {
    const retryable = code === 'QUOTA' || code === 'UPSTREAM';
    const hint: WidgetResultError['hint'] =
        code === 'NOT_CONNECTED' ? { action: 'reconnect' }
            : code === 'NO_ACCESS' || code === 'NO_GA4_SOURCE' || code === 'NO_GSC_SOURCE' || code === 'UNSUPPORTED_FOR_PORTFOLIO' ? { action: 'choose-source' }
                : code === 'INCOMPATIBLE' ? { action: 'change-metric' }
                    : code === 'QUOTA' ? { action: 'wait' } : undefined;
    return { status: 'error', code, message: message ?? ERROR_TEXT[code], retryable, hint, ...extra };
}

function classify(err: unknown): LeafError {
    if (err instanceof LeafError) return err;
    if (err instanceof GoogleBreakerOpenError) return new LeafError('QUOTA', ERROR_TEXT.QUOTA, err.retryAfterSec);
    const msg = err instanceof Error ? err.message : String(err);
    const status = Number(/Google API error (\d{3})/.exec(msg)?.[1] ?? 0);
    if (status === 429 || /RESOURCE_EXHAUSTED/.test(msg)) return new LeafError('QUOTA', ERROR_TEXT.QUOTA, 60);
    if (status === 401) return new LeafError('NOT_CONNECTED', 'Google sign-in expired. Reconnect Google.');
    if (status === 403) return new LeafError('NO_ACCESS', ERROR_TEXT.NO_ACCESS);
    if (status === 400) {
        const detail = /"message"\s*:\s*"([^"]{1,200})/.exec(msg)?.[1];
        return new LeafError('INCOMPATIBLE', detail ? `Google refused this combination: ${detail}` : ERROR_TEXT.INCOMPATIBLE);
    }
    return new LeafError('UPSTREAM', ERROR_TEXT.UPSTREAM);
}

function statusOf(err: unknown): number {
    const msg = err instanceof Error ? err.message : String(err);
    return Number(/Google API error (\d{3})/.exec(msg)?.[1] ?? 0);
}

// ── Leaves ───────────────────────────────────────────────────────────────

type Range = { start: Iso; end: Iso };

/** One Google call worth of data need, before merging. */
interface LogicalLeaf {
    family: Family;
    asset: string;
    siteId: string;
    siteHost: string;
    apiDims: string[];
    canonDims: string[];
    metrics: string[]; // canonical metric ids incl. roll-up components (GA4); GSC = all four
    filters: FilterClause[];
    range: Range;
    /** GA4: second named range in the same report. */
    compare?: Range;
    /** GSC comparison leaf: the 'prev' half of a pair. */
    isPrev?: boolean;
    order?: { kind: 'metric' | 'dim'; field: string; desc: boolean };
    limit: number;
}

interface PhysicalLeaf {
    shape: string;
    key: string;
    family: Family;
    asset: string;
    body: Record<string, unknown>;
    metrics: string[]; // api metric names (GA4)
    apiDims: string[];
    range: Range;
    compare?: Range;
}

/** Normalised leaf answer (cached). */
interface LeafData {
    dims: string[];
    metrics: string[]; // api names
    rows: Array<{ d: string[]; m: Array<number | null>; r: number }>; // r = range index (0 current, 1 previous)
    flags: { sampled?: number; thresholded?: boolean; otherRow?: boolean; currency?: string; firstIncomplete?: Iso; lastDate?: Iso };
    rowCount?: number;
}

const GSC_METRIC_API = ['clicks', 'impressions', 'ctr', 'position'];
const TIME_DIMS = new Set(['date', 'week', 'month']);

function ga4ApiDim(dim: string): string {
    return getDim(dim)?.ga4?.api ?? dim;
}

function gscApiDim(dim: string): string {
    if (dim === 'week' || dim === 'month') return 'date';
    return getDim(dim)?.gsc?.api ?? dim;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function gscValue(dim: string, v: string): string {
    if (dim === 'country') return alpha2ToGsc(v) ?? v.toLowerCase();
    if (dim === 'device') return v.toUpperCase();
    return v;
}

function ga4Value(dim: string, v: string): string {
    if (dim === 'country') return v.toUpperCase();
    if (dim === 'device') return v.toLowerCase();
    return v;
}

/** GA4 dimensionFilter (andGroup of expressions). */
export function ga4Filter(clauses: FilterClause[]): Record<string, unknown> | undefined {
    const exprs: Record<string, unknown>[] = [];
    for (const c of clauses) {
        const fieldName = ga4ApiDim(c.dimension);
        const values = (Array.isArray(c.value) ? c.value : [c.value]).map((v) => ga4Value(c.dimension, String(v)));
        const str = (matchType: string, value: string) => ({ filter: { fieldName, stringFilter: { matchType, value, caseSensitive: false } } });
        let e: Record<string, unknown> | null = null;
        let negate = false;
        switch (c.op) {
            case 'eq': e = values.length > 1 ? { filter: { fieldName, inListFilter: { values, caseSensitive: false } } } : str('EXACT', values[0]); break;
            case 'neq': e = str('EXACT', values[0]); negate = true; break;
            case 'in': e = { filter: { fieldName, inListFilter: { values, caseSensitive: false } } }; break;
            case 'not_in': e = { filter: { fieldName, inListFilter: { values, caseSensitive: false } } }; negate = true; break;
            case 'contains': e = str('CONTAINS', values[0]); break;
            case 'not_contains': e = str('CONTAINS', values[0]); negate = true; break;
            case 'starts': e = str('BEGINS_WITH', values[0]); break;
            case 'ends': e = str('ENDS_WITH', values[0]); break;
            case 'regex': e = str('PARTIAL_REGEXP', values[0]); break;
            case 'not_regex': e = str('PARTIAL_REGEXP', values[0]); negate = true; break;
        }
        if (e) exprs.push(negate ? { notExpression: e } : e);
    }
    if (!exprs.length) return undefined;
    return exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
}

/** Search Console dimensionFilterGroups (and only); lists become anchored regexes. */
export function gscFilters(clauses: FilterClause[]): Array<Record<string, unknown>> | undefined {
    const filters: Array<{ dimension: string; operator: string; expression: string }> = [];
    for (const c of clauses) {
        const dimension = gscApiDim(c.dimension);
        const values = (Array.isArray(c.value) ? c.value : [c.value]).map((v) => gscValue(c.dimension, String(v)));
        const pagePath = c.dimension === 'page' && values[0]?.startsWith('/');
        const anyOf = (vs: string[]) => `^(${vs.map((v) => (c.dimension === 'page' && v.startsWith('/') ? `https?://[^/]+${escapeRe(v)}` : escapeRe(v))).join('|')})$`;
        switch (c.op) {
            case 'eq':
                if (values.length > 1 || pagePath) filters.push({ dimension, operator: 'includingRegex', expression: anyOf(values) });
                else filters.push({ dimension, operator: 'equals', expression: values[0] });
                break;
            case 'neq':
                if (pagePath) filters.push({ dimension, operator: 'excludingRegex', expression: anyOf(values) });
                else filters.push({ dimension, operator: 'notEquals', expression: values[0] });
                break;
            case 'in': filters.push({ dimension, operator: 'includingRegex', expression: anyOf(values) }); break;
            case 'not_in': filters.push({ dimension, operator: 'excludingRegex', expression: anyOf(values) }); break;
            case 'contains': filters.push({ dimension, operator: 'contains', expression: values[0] }); break;
            case 'not_contains': filters.push({ dimension, operator: 'notContains', expression: values[0] }); break;
            case 'starts': filters.push({ dimension, operator: 'includingRegex', expression: pagePath ? `^https?://[^/]+${escapeRe(values[0])}` : `^${escapeRe(values[0])}` }); break;
            case 'ends': filters.push({ dimension, operator: 'includingRegex', expression: `${escapeRe(values[0])}$` }); break;
            case 'regex': filters.push({ dimension, operator: 'includingRegex', expression: values[0] }); break;
            case 'not_regex': filters.push({ dimension, operator: 'excludingRegex', expression: values[0] }); break;
        }
    }
    return filters.length ? [{ groupType: 'and', filters }] : undefined;
}

function ga4Body(l: LogicalLeaf, metrics: string[]): Record<string, unknown> {
    const body: Record<string, unknown> = {
        dateRanges: [{ startDate: l.range.start, endDate: l.range.end, name: 'current' }, ...(l.compare ? [{ startDate: l.compare.start, endDate: l.compare.end, name: 'previous' }] : [])],
        dimensions: l.apiDims.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit: l.limit,
    };
    const f = ga4Filter(l.filters);
    if (f) body.dimensionFilter = f;
    if (l.order) {
        body.orderBys = [l.order.kind === 'metric'
            ? { metric: { metricName: l.order.field }, desc: l.order.desc }
            : { dimension: { dimensionName: l.order.field, orderType: l.order.field === 'date' || l.order.field === 'isoYearIsoWeek' || l.order.field === 'yearMonth' ? 'NUMERIC' : 'ALPHANUMERIC' }, desc: l.order.desc }];
    }
    return body;
}

function gscBody(l: LogicalLeaf): Record<string, unknown> {
    const body: Record<string, unknown> = {
        startDate: l.range.start,
        endDate: l.range.end,
        dimensions: l.apiDims,
        rowLimit: Math.min(25_000, l.limit),
        type: 'web',
        dataState: 'all',
    };
    const f = gscFilters(l.filters);
    if (f) body.dimensionFilterGroups = f;
    return body;
}

// ── Parsing ──────────────────────────────────────────────────────────────

interface Ga4Resp {
    dimensionHeaders?: Array<{ name: string }>;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
    rowCount?: number;
    metadata?: {
        samplingMetadatas?: Array<{ samplesReadCount?: string; samplingSpaceSize?: string }>;
        subjectToThresholding?: boolean;
        dataLossFromOtherRow?: boolean;
        currencyCode?: string;
    };
}

interface GscResp {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
    metadata?: { first_incomplete_date?: string; firstIncompleteDate?: string };
}

function parseGa4(resp: Ga4Resp, l: { apiDims: string[]; compare?: Range }, metrics: string[]): LeafData {
    const dimHeaders: string[] = (resp.dimensionHeaders ?? []).map((h) => h.name);
    const rangeIdx = dimHeaders.indexOf('dateRange');
    const rows: LeafData['rows'] = [];
    for (const row of resp.rows ?? []) {
        const dv: string[] = (row.dimensionValues ?? []).map((x) => x.value ?? '');
        const r = rangeIdx >= 0 ? (dv[rangeIdx] === 'previous' || dv[rangeIdx] === 'date_range_1' ? 1 : 0) : 0;
        const d = rangeIdx >= 0 ? dv.filter((_, i) => i !== rangeIdx) : dv;
        const m = (row.metricValues ?? []).map((x) => {
            const n = Number(x.value);
            return Number.isFinite(n) ? n : null;
        });
        rows.push({ d, m, r });
    }
    const meta = resp.metadata ?? {};
    const sampled = Array.isArray(meta.samplingMetadatas) && meta.samplingMetadatas.length
        ? Math.round((Number(meta.samplingMetadatas[0].samplesReadCount) / Math.max(1, Number(meta.samplingMetadatas[0].samplingSpaceSize))) * 100)
        : undefined;
    return {
        dims: l.apiDims,
        metrics,
        rows,
        rowCount: typeof resp.rowCount === 'number' ? resp.rowCount : undefined,
        flags: {
            sampled,
            thresholded: Boolean(meta.subjectToThresholding) || undefined,
            otherRow: Boolean(meta.dataLossFromOtherRow) || undefined,
            currency: typeof meta.currencyCode === 'string' ? meta.currencyCode : undefined,
        },
    };
}

function parseGsc(resp: GscResp, apiDims: string[]): LeafData {
    const rows: LeafData['rows'] = [];
    let lastDate: string | undefined;
    const di = apiDims.indexOf('date');
    for (const row of resp.rows ?? []) {
        const d: string[] = Array.isArray(row.keys) ? row.keys.map(String) : [];
        if (di >= 0 && d[di] && (!lastDate || d[di] > lastDate)) lastDate = d[di];
        const rec = row as Record<string, unknown>;
        rows.push({ d, m: GSC_METRIC_API.map((k) => (typeof rec[k] === 'number' ? (rec[k] as number) : null)), r: 0 });
    }
    const md = resp.metadata ?? {};
    const fid = typeof md.first_incomplete_date === 'string' ? md.first_incomplete_date : typeof md.firstIncompleteDate === 'string' ? md.firstIncompleteDate : undefined;
    return { dims: apiDims, metrics: GSC_METRIC_API, rows, flags: { firstIncomplete: fid, lastDate } };
}

// ── Canonical rows, roll-ups ─────────────────────────────────────────────

/** Values keyed by canonical metric id (components included). */
type Vals = Record<string, number | null>;

interface CRow { dims: Record<string, string>; cur: Vals; prev: Vals }

function ga4DateToIso(v: string): string {
    return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
}

function isoWeekToMonday(v: string): string {
    // GA4 isoYearIsoWeek '202643' -> Monday of ISO week 43 of 2026.
    if (!/^\d{6}$/.test(v)) return v;
    const year = Number(v.slice(0, 4));
    const week = Number(v.slice(4));
    const jan4 = Date.UTC(year, 0, 4);
    const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
    const week1Monday = jan4 / 86_400_000 - jan4Dow;
    return fromDay(week1Monday + (week - 1) * 7);
}

function canonValue(dim: string, family: Family, raw: string, siteHost: string): string {
    if (dim === 'date') return family === 'ga4' ? ga4DateToIso(raw) : raw;
    if (dim === 'week') return family === 'ga4' ? isoWeekToMonday(raw) : weekStart(raw);
    if (dim === 'month') return family === 'ga4' ? (/^\d{6}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}-01` : raw) : monthStart(raw);
    if (dim === 'country') return family === 'gsc' ? gscToAlpha2(raw) ?? raw.toUpperCase() : raw;
    if (dim === 'device') return raw.toLowerCase();
    if (dim === 'page' && family === 'gsc') {
        try {
            const u = new URL(raw);
            if (normalizeHost(u.host) === siteHost) return u.pathname + (u.search || '');
        } catch {
            /* keep raw */
        }
    }
    return raw;
}

/** Roll up several partial value sets into one (days of a GSC week, or sites of a portfolio). */
function rollup(parts: Vals[], wanted: string[], flags: { usersSummed?: boolean }): Vals {
    const out: Vals = {};
    const sum = (id: string) => {
        let s = 0;
        let any = false;
        for (const p of parts) {
            const v = p[id];
            if (typeof v === 'number') {
                s += v;
                any = true;
            }
        }
        return any ? s : null;
    };
    for (const id of wanted) {
        const def = getMetric(id);
        const r = def?.rollup ?? { kind: 'sum' };
        if (parts.length === 1) {
            out[id] = parts[0][id] ?? null;
            continue;
        }
        if (r.kind === 'sum') out[id] = sum(id);
        else if (r.kind === 'ratio') {
            const n = sum(r.num);
            const d = sum(r.den);
            out[id] = n === null || d === null ? null : d === 0 ? 0 : r.oneMinus ? 1 - n / d : n / d;
        } else if (r.kind === 'weighted') {
            let num = 0;
            let den = 0;
            for (const p of parts) {
                const v = p[id];
                const w = p[r.by];
                if (typeof v === 'number' && typeof w === 'number') {
                    num += v * w;
                    den += w;
                }
            }
            out[id] = den > 0 ? num / den : null;
        } else {
            out[id] = sum(id);
            if (def?.scope === 'user' && parts.length > 1) flags.usersSummed = true;
        }
    }
    return out;
}

/** Metrics a roll-up needs besides the ones asked for. */
function withComponents(metrics: string[]): string[] {
    const set = new Set(metrics);
    for (const id of metrics) {
        const r = getMetric(id)?.rollup;
        if (r?.kind === 'ratio') {
            set.add(r.num);
            set.add(r.den);
        } else if (r?.kind === 'weighted') set.add(r.by);
    }
    return [...set];
}

// ── Planning per widget ──────────────────────────────────────────────────

/** A GSC leaf's window: the GA4 window moved onto Search Console's last complete day; the comparison moves with it. */
function searchWindows(range: Range, compare: Range | undefined, today: Iso): { range: Range; compare?: Range } {
    const r = searchWindowOf(range, today);
    const shift = toDay(range.end) - toDay(r.end);
    return { range: r, compare: compare && shift ? { start: addDays(compare.start, -shift), end: addDays(compare.end, -shift) } : compare };
}

interface Target { site: ResolvedSite; families: Family[] }

interface WidgetPlan {
    widget: WidgetDef;
    queries: Array<{
        q: WidgetQuery; range: Range; compare?: Range; targets: Target[]; leaves: Array<{ leaf: LogicalLeaf; site: ResolvedSite }>; families: Family[]; granularity: 'day' | 'week' | 'month';
        /** Catalogue metrics fetched for q.metrics: calculated metrics replaced by their inputs (round 7). */
        base: string[];
    }>;
    error?: WidgetResultError;
    flags: ResultFlags;
    sourceLabel: string;
}

const SNAPSHOT_FANOUT_CAP = 60;
const LIVE_FANOUT_CAP = 10;

function limitFor(q: WidgetQuery, canonDims: string[], compare: boolean): number {
    const nonTime = canonDims.filter((d) => !TIME_DIMS.has(d));
    if (!canonDims.length) return 1 + (compare ? 1 : 0);
    if (!nonTime.length) return 10_000;
    if (canonDims.some((d) => TIME_DIMS.has(d))) return 10_000; // time x breakdown
    const base = q.limit ?? (q.top ? 250 : 1000);
    return Math.min(10_000, compare ? base * 2 : base);
}

// ── Execution ────────────────────────────────────────────────────────────

interface ExecStats { ga4Calls: number; ga4Reports: number; gscCalls: number; hit: number; stale: number; miss: number }

type LeafOutcome = { data: LeafData; fetchedAt: number; cache: 'hit' | 'stale' | 'miss'; stale?: boolean } | { error: LeafError; staleData?: { data: LeafData; fetchedAt: number } };

const PUBLIC_BUDGET_PER_HOUR = 600;
const publicBudget = new Map<string, { count: number; resetAt: number }>();

function takePublicBudget(owner: string, n: number): boolean {
    const now = Date.now();
    let b = publicBudget.get(owner);
    if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + 3_600_000 };
        publicBudget.set(owner, b);
    }
    if (b.count + n > PUBLIC_BUDGET_PER_HOUR) return false;
    b.count += n;
    return true;
}

async function fetchGa4Batch(token: string, userId: string, property: string, leaves: PhysicalLeaf[], stats: ExecStats): Promise<Map<string, LeafData | LeafError>> {
    const out = new Map<string, LeafData | LeafError>();
    const run = async (chunk: PhysicalLeaf[]) => {
        stats.ga4Calls++;
        stats.ga4Reports += chunk.length;
        const resp = await withGoogleSlot('ga4', property, userId, chunk.length, () => runGABatch(token, property, chunk.map((l) => l.body)));
        reportGoogleOutcome('ga4', property, 200);
        const reports: Ga4Resp[] = Array.isArray(resp?.reports) ? (resp.reports as Ga4Resp[]) : [];
        chunk.forEach((l, i) => out.set(l.key, reports[i] ? parseGa4(reports[i], l, l.metrics) : new LeafError('UPSTREAM', ERROR_TEXT.UPSTREAM)));
    };
    for (let i = 0; i < leaves.length; i += 5) {
        const chunk = leaves.slice(i, i + 5);
        try {
            await run(chunk);
        } catch (err) {
            reportGoogleOutcome('ga4', property, statusOf(err) || 500);
            const e = classify(err);
            if (chunk.length === 1 || e.code === 'QUOTA' || e.code === 'NO_ACCESS' || e.code === 'NOT_CONNECTED') {
                for (const l of chunk) out.set(l.key, e);
                continue;
            }
            // Isolate the bad report: retry members one by one.
            for (const l of chunk) {
                try {
                    await run([l]);
                } catch (err2) {
                    reportGoogleOutcome('ga4', property, statusOf(err2) || 500);
                    out.set(l.key, classify(err2));
                }
            }
        }
    }
    return out;
}

async function fetchGsc(token: string, userId: string, leaf: PhysicalLeaf, stats: ExecStats): Promise<LeafData | LeafError> {
    try {
        stats.gscCalls++;
        const resp = await withGoogleSlot('gsc', leaf.asset, userId, 1, () => runGSCSearchAnalytics(token, leaf.asset, leaf.body));
        reportGoogleOutcome('gsc', leaf.asset, 200);
        return parseGsc((resp ?? {}) as GscResp, leaf.apiDims);
    } catch (err) {
        reportGoogleOutcome('gsc', leaf.asset, statusOf(err) || 500);
        return classify(err);
    }
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function evaluateWidgets(input: EvalInput, deps: EngineDeps): Promise<DashboardQueryResponse> {
    const t0 = Date.now();
    registerCalcs(input.calcs);
    const now = deps.now ?? new Date();
    const tz = input.timezone || 'UTC';
    const today = todayIn(tz, now);
    const baseRange = resolveRange(input.controls.date.range, today);
    const baseCompare = resolveCompare(baseRange, input.controls.date.compare);
    const baseSearch = searchWindowOf(baseRange, today);
    const stats: ExecStats = { ga4Calls: 0, ga4Reports: 0, gscCalls: 0, hit: 0, stale: 0, miss: 0 };
    const results: Record<string, WidgetResult> = {};

    const dataWidgets = input.widgets.filter((w) => !widgetMeta(w.widget.type).static);
    for (const w of input.widgets) {
        if (widgetMeta(w.widget.type).static) results[w.widget.id] = { status: 'ok', fetchedAt: now.toISOString(), cache: 'hit', parts: {}, flags: {} };
    }
    // The header names Search Console's days only when a widget reads Search Console (a GA4-only dashboard has one window).
    let readsSearch = false;
    const response = (): DashboardQueryResponse => ({
        results,
        resolved: { range: baseRange, compare: baseCompare, ...(readsSearch && baseSearch.end !== baseRange.end ? { search: baseSearch } : {}), timezone: tz, today },
        meta: { durationMs: Date.now() - t0, google: { ga4Calls: stats.ga4Calls, gscCalls: stats.gscCalls, ga4Reports: stats.ga4Reports }, cache: { hit: stats.hit, stale: stats.stale, miss: stats.miss } },
    });
    if (!dataWidgets.length) return response();

    const token = await deps.getToken().catch(() => null);
    if (!token) {
        for (const w of dataWidgets) results[w.widget.id] = errResult('NOT_CONNECTED');
        return response();
    }
    const tokenMemo = new Map<string, Promise<string>>();
    /** The token of the Google connection that lists the asset (memoised per evaluation). */
    const tokenFor = (kind: 'ga4' | 'gsc', id: string): Promise<string> => {
        if (!deps.getTokenFor) return Promise.resolve(token);
        const k = `${kind}|${id}`;
        let p = tokenMemo.get(k);
        if (!p) {
            p = deps.getTokenFor({ kind, id }).then((t) => t ?? token, () => token);
            tokenMemo.set(k, p);
        }
        return p;
    };
    let dir: SiteDirectory;
    try {
        dir = deps.loadDirectory ? await deps.loadDirectory(token) : await loadSiteDirectory(deps.userId, token);
    } catch (err) {
        const e = classify(err);
        for (const w of dataWidgets) results[w.widget.id] = errResult(e.code, e.message);
        return response();
    }
    const defaultSource: SourceRef = input.defaultSource.type === 'default' ? { type: 'portfolio', include: 'all' } : input.defaultSource;
    const defaultLabel = sourceLabel(defaultSource, dir);

    // 1. Plan (a function: the trend round below plans its extra query the same way).
    const planWidget = (widget: WidgetDef, pageId: string | undefined, extra?: { queries: WidgetQuery[]; filter: FilterClause }): WidgetPlan => {
        const plan: WidgetPlan = { widget, queries: [], flags: {}, sourceLabel: '' };
        const range = widget.dateOverride?.range ? resolveRange(widget.dateOverride.range, today) : baseRange;
        const compare = widget.dateOverride?.compare ? resolveCompare(range, widget.dateOverride.compare) : widget.dateOverride?.range ? resolveCompare(range, input.controls.date.compare) : baseCompare;
        const compiled = compileWidget(widget, { controlDefs: input.controlDefs, controls: input.controls, pageId });
        const queries = extra ? extra.queries : compiled.queries;
        const filterOrigins = extra ? [...compiled.filterOrigins, { clause: extra.filter }] : compiled.filterOrigins;
        const src = widget.source?.type === 'default' || !widget.source ? defaultSource : widget.source;
        plan.sourceLabel = src === defaultSource ? defaultLabel : sourceLabel(src, dir);

        let sites: ResolvedSite[];
        if (src.type === 'portfolio') {
            sites = resolvePortfolio(src, dir);
            if (!sites.length) {
                plan.error = errResult('NO_ACCESS', 'No sites to show. Connect Google or pick other sites.');
                return plan;
            }
        } else if (src.type === 'site') {
            const s = resolveSiteRef(src, dir);
            if (!s) {
                plan.error = errResult('NO_ACCESS', `You no longer have access to ${plan.sourceLabel}. Choose another site.`);
                return plan;
            }
            sites = [s];
        } else {
            plan.error = errResult('INVALID');
            return plan;
        }
        const portfolio = src.type === 'portfolio';

        for (const q of queries) {
            if (q.dimensions.includes('site') && !portfolio) {
                plan.error = errResult('INCOMPATIBLE', 'Break down by site needs the "All sites" source.');
                break;
            }
            // Calculated metrics are fetched as their inputs and computed after the join and roll-up.
            const base = expandCalcs(q.metrics);
            const metricDefs = base.map((id) => getMetric(id)).filter((m): m is MetricDef => Boolean(m) && !m!.calc);
            if (metricDefs.length !== base.length || q.metrics.some((id) => !getMetric(id))) {
                plan.error = errResult('INVALID', 'This widget uses a metric we do not know.');
                break;
            }
            const families = [...new Set(metricDefs.map((m) => m.family))];
            if (families.includes('gsc')) readsSearch = true;
            const canonDims = q.dimensions.filter((d) => d !== 'site');
            // Static compatibility (BUILDER.md 9.4)
            const badDim = canonDims.find((d) => !TIME_DIMS.has(d) && families.some((f) => !dimInFamily(d, f)));
            if (badDim) {
                const fam = families.find((f) => !dimInFamily(badDim, f));
                plan.error = errResult('INCOMPATIBLE', families.length > 1
                    ? 'Search Console and Analytics metrics can only be combined by date, page, country or device.'
                    : `${getDim(badDim)?.label ?? badDim} is not available for ${fam === 'gsc' ? 'Search Console' : 'Google Analytics'} metrics.`);
                break;
            }
            const itemDim = canonDims.some((d) => getDim(d)?.scope === 'item');
            if (itemDim && metricDefs.some((m) => m.scope === 'event')) {
                plan.error = errResult('INCOMPATIBLE', 'Product dimensions only work with item metrics (item revenue, items purchased, items viewed).');
                break;
            }
            const snapshotShape = canonDims.every((d) => d === 'date') && metricDefs.every((m) => m.snapshot);
            if (portfolio && sites.length > (snapshotShape ? SNAPSHOT_FANOUT_CAP : LIVE_FANOUT_CAP)) {
                plan.error = errResult('UNSUPPORTED_FOR_PORTFOLIO', snapshotShape ? `Too many sites (${sites.length}). Pick up to ${SNAPSHOT_FANOUT_CAP}.` : undefined);
                break;
            }

            const timeDim = canonDims.find((d) => TIME_DIMS.has(d));
            const granularity: 'day' | 'week' | 'month' = q.granularity ?? (timeDim === 'week' ? 'week' : timeDim === 'month' ? 'month' : (timeDim ? autoGranularity(range.start, range.end, 'line') : 'day'));
            const effDims = canonDims.map((d) => (d === 'date' && granularity !== 'day' ? granularity : d));
            const qCompare = q.compare ? compare : undefined;
            // Search Console reads its own window (lib/dateRange: through 2 days ago), the days the site page and the
            // portfolio count, except on a date axis it shares with GA4 (its newest day is then marked preliminary).
            const gscOnly = families.length === 1 && families[0] === 'gsc';
            const gscWin = timeDim && !gscOnly ? null : searchWindows(range, qCompare, today);
            const gscRange = gscWin?.range ?? range;
            const gscCompare = gscWin ? gscWin.compare : qCompare;

            const entry: WidgetPlan['queries'][number] = { q, range: gscOnly ? gscRange : range, compare: gscOnly ? gscCompare : qCompare, targets: [], leaves: [], families, granularity, base };
            plan.queries.push(entry);

            const missing = new Set<Family>();
            for (const site of sites) {
                const fams = families.filter((f) => (f === 'ga4' ? site.ga4 : site.gsc));
                for (const f of families) if (!fams.includes(f)) missing.add(f);
                entry.targets.push({ site, families: fams });
                for (const family of fams) {
                    const fMetrics = metricDefs.filter((m) => m.family === family).map((m) => m.id);
                    const applicable = filterOrigins.filter((fo) => dimInFamily(fo.clause.dimension, family));
                    for (const fo of filterOrigins) {
                        if (!dimInFamily(fo.clause.dimension, family) && fo.controlId) {
                            plan.flags.filtersIgnored = [...new Set([...(plan.flags.filtersIgnored ?? []), fo.controlId])];
                        }
                    }
                    const apiDims = effDims.map((d) => (family === 'ga4' ? ga4ApiDim(d) : gscApiDim(d)));
                    const nonTime = effDims.filter((d) => !TIME_DIMS.has(d));
                    let order: LogicalLeaf['order'];
                    if (effDims.length && !nonTime.length) order = { kind: 'dim', field: apiDims[0], desc: false };
                    else if (nonTime.length && family === 'ga4') {
                        // A calculated sort metric orders Google's rows by its first input (A).
                        const sortBy = q.sort?.by ? (parseCalcId(q.sort.by)?.a ?? q.sort.by) : undefined;
                        const sortMetric = sortBy && fMetrics.includes(sortBy) ? sortBy : fMetrics[0];
                        const byChange = widget.type === 'table' && widget.config.sortByChange;
                        // A calculated sort fetches the biggest rows by A (the calc's order is applied to them below).
                        const calcSort = Boolean(q.sort?.by && parseCalcId(q.sort.by));
                        order = { kind: 'metric', field: getMetric(sortMetric)!.api, desc: q.sort && !byChange && !calcSort ? q.sort.dir === 'desc' || sortBy !== sortMetric : true };
                    }
                    const leafMetrics = family === 'gsc' ? ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'] : (portfolio || granularity !== 'day' ? withComponents(fMetrics) : fMetrics);
                    const common = {
                        family, asset: family === 'ga4' ? site.ga4! : site.gsc!, siteId: site.siteId, siteHost: normalizeHost(site.gsc ?? site.label),
                        apiDims, canonDims: effDims, metrics: leafMetrics, filters: applicable.map((a) => a.clause),
                        order, limit: limitFor(q, effDims, Boolean(qCompare) && family === 'ga4'),
                    };
                    if (family === 'ga4') {
                        entry.leaves.push({ site, leaf: { ...common, range, compare: qCompare } });
                    } else {
                        entry.leaves.push({ site, leaf: { ...common, range: gscRange } });
                        if (gscCompare) entry.leaves.push({ site, leaf: { ...common, range: gscCompare, isPrev: true } });
                    }
                }
            }
            if (missing.size === families.length && entry.leaves.length === 0) {
                const only = [...missing][0];
                const denied = sites.length === 1 && (only === 'ga4' ? sites[0].ga4Denied : sites[0].gscDenied);
                plan.error = denied ? errResult('NO_ACCESS') : errResult(only === 'ga4' ? 'NO_GA4_SOURCE' : 'NO_GSC_SOURCE');
                break;
            }
            if (missing.size && !portfolio) plan.flags.missingFamilies = [...missing];
        }
        return plan;
    };
    // Round 7 viewer switchers (site, metric, Day / Week / Month): plan each widget as the viewer sees it.
    const viewedWidgets = dataWidgets.map(({ widget, pageId }) => ({ widget: applyViewerControls(widget, { controlDefs: input.controlDefs, controls: input.controls, pageId }), pageId }));
    const plans = viewedWidgets.map(({ widget, pageId }) => planWidget(widget, pageId));

    /** Steps 2-4 for some plans: merge leaves, fetch (cache first), assemble one result per plan. */
    const runPlans = async (plans: WidgetPlan[]): Promise<WidgetResult[]> => {
        // 2. Merge leaves into physical calls (identical shape -> one call, GA4 metrics unioned).
        const physical = new Map<string, PhysicalLeaf & { metricSet: Set<string>; logical: LogicalLeaf }>();
        const shapeOf = (l: LogicalLeaf) => canonicalJson({ f: l.family, a: l.asset, d: l.apiDims, fl: l.filters, r: l.range, c: l.compare, o: l.order, lim: l.limit });
        for (const plan of plans) {
            if (plan.error) continue;
            for (const e of plan.queries) {
                for (const { leaf } of e.leaves) {
                    const shape = shapeOf(leaf);
                    let p = physical.get(shape);
                    if (!p) {
                        p = { shape, key: '', family: leaf.family, asset: leaf.asset, body: {}, metrics: [], apiDims: leaf.apiDims, range: leaf.range, compare: leaf.compare, metricSet: new Set(), logical: leaf };
                        physical.set(shape, p);
                    }
                    for (const m of leaf.metrics) p.metricSet.add(m);
                }
            }
        }
        // GA4 allows 10 metrics per report: split oversized merges.
        const calls: Array<PhysicalLeaf & { logical: LogicalLeaf }> = [];
        const leafToCalls = new Map<string, Array<PhysicalLeaf & { logical: LogicalLeaf }>>();
        for (const p of physical.values()) {
            const ms = [...p.metricSet].sort();
            const chunks: string[][] = [];
            if (p.family === 'ga4') for (let i = 0; i < ms.length; i += 10) chunks.push(ms.slice(i, i + 10));
            else chunks.push(ms);
            const list: Array<PhysicalLeaf & { logical: LogicalLeaf }> = [];
            for (const chunk of chunks) {
                const apiMetrics = p.family === 'ga4' ? chunk.map((id) => getMetric(id)!.api) : GSC_METRIC_API;
                const body = p.family === 'ga4' ? ga4Body(p.logical, apiMetrics) : gscBody(p.logical);
                const key = leafKey([deps.userId, p.family, p.asset, canonicalJson(body)]);
                const call = { shape: p.shape, key, family: p.family, asset: p.asset, body, metrics: apiMetrics, apiDims: p.apiDims, range: p.range, compare: p.compare, logical: p.logical };
                list.push(call);
                calls.push(call);
            }
            leafToCalls.set(p.shape, list);
        }

        // 3. Cache lookup, then execute misses (GA4 batched per property, GSC one by one).
        const outcomes = new Map<string, LeafOutcome>();
        const misses: Array<PhysicalLeaf & { logical: LogicalLeaf }> = [];
        const seenKeys = new Set<string>();
        for (const c of calls) {
            if (seenKeys.has(c.key)) continue;
            seenKeys.add(c.key);
            const neg = negativeGet(c.key);
            const hit = cacheGet(c.key);
            if (neg && !(deps.fresh && deps.mode === 'owner')) {
                outcomes.set(c.key, { error: neg as LeafError, staleData: hit ? { data: hit.value as LeafData, fetchedAt: hit.fetchedAt } : undefined });
                continue;
            }
            if (hit && (hit.state === 'fresh' && !(deps.fresh && deps.mode === 'owner'))) {
                stats.hit++;
                outcomes.set(c.key, { data: hit.value as LeafData, fetchedAt: hit.fetchedAt, cache: 'hit' });
                continue;
            }
            if (hit && hit.state === 'stale' && !deps.fresh) {
                stats.stale++;
                outcomes.set(c.key, { data: hit.value as LeafData, fetchedAt: hit.fetchedAt, cache: 'stale' });
                // Background refresh (single-flight); errors keep the stale entry.
                void singleFlight(`refresh:${c.key}`, async () => {
                    const t = await tokenFor(c.family, c.asset);
                    const r = c.family === 'ga4'
                        ? (await fetchGa4Batch(t, deps.userId, c.asset, [c], { ga4Calls: 0, ga4Reports: 0, gscCalls: 0, hit: 0, stale: 0, miss: 0 })).get(c.key)
                        : await fetchGsc(t, deps.userId, c, { ga4Calls: 0, ga4Reports: 0, gscCalls: 0, hit: 0, stale: 0, miss: 0 });
                    if (r && !(r instanceof LeafError)) cacheSet(c.key, r, policyFor(c.family, c.range.end, today));
                }).catch(() => undefined);
                continue;
            }
            misses.push(c);
        }

        if (misses.length && deps.mode === 'public' && !takePublicBudget(deps.userId, misses.length)) {
            for (const c of misses) outcomes.set(c.key, { error: new LeafError('QUOTA', 'This shared dashboard is busy. Try again later.', 300) });
            misses.length = 0;
        }

        stats.miss += misses.length;
        const ga4ByProp = new Map<string, Array<PhysicalLeaf & { logical: LogicalLeaf }>>();
        const gscMisses: Array<PhysicalLeaf & { logical: LogicalLeaf }> = [];
        for (const c of misses) {
            if (c.family === 'ga4') {
                const list = ga4ByProp.get(c.asset) ?? [];
                list.push(c);
                ga4ByProp.set(c.asset, list);
            } else gscMisses.push(c);
        }
        const settle = (c: PhysicalLeaf, r: LeafData | LeafError | undefined) => {
            const fetchedAt = Date.now();
            if (!r || r instanceof LeafError) {
                const e = r ?? new LeafError('UPSTREAM', ERROR_TEXT.UPSTREAM);
                const ttl = (NEGATIVE_TTL_MS as Record<string, number>)[e.code];
                if (ttl) negativeSet(c.key, e, ttl);
                const old = cacheGet(c.key);
                outcomes.set(c.key, { error: e, staleData: old ? { data: old.value as LeafData, fetchedAt: old.fetchedAt } : undefined });
                return;
            }
            cacheSet(c.key, r, policyFor(c.family, c.range.end, today));
            outcomes.set(c.key, { data: r, fetchedAt, cache: 'miss' });
        };
        await Promise.all([
            ...[...ga4ByProp.entries()].map(async ([prop, list]) => {
                const t = await tokenFor('ga4', prop);
                const res = await singleFlight(`ga4batch:${list.map((l) => l.key).join(',')}`, () => fetchGa4Batch(t, deps.userId, prop, list, stats));
                for (const c of list) settle(c, res.get(c.key));
            }),
            ...gscMisses.map(async (c) => {
                const t = await tokenFor('gsc', c.asset);
                settle(c, await singleFlight(c.key, () => fetchGsc(t, deps.userId, c, stats)));
            }),
        ]);

        // 4. Assemble each widget.
        return plans.map((plan): WidgetResult => {
            if (plan.error) return { ...plan.error, sourceLabel: plan.sourceLabel };
            try {
                return assemble(plan, leafToCalls, shapeOf, outcomes, today, deps.mode === 'owner');
            } catch (err) {
                return errResult('INVALID', err instanceof Error ? err.message.slice(0, 200) : undefined, { sourceLabel: plan.sourceLabel });
            }
        });
    };

    const first = await runPlans(plans);
    plans.forEach((plan, i) => { results[plan.widget.id] = first[i]; });

    // 5. Trend column (round 7): tables that show each row's trend need the top rows first, so
    // their trend query (sort metric by date x row, filtered to those rows) is a second round:
    // one GA4 report and/or one Search Console call per table, cached like any leaf.
    const trendPlans: WidgetPlan[] = [];
    for (const plan of plans) {
        const w = plan.widget;
        const r = results[w.id];
        if (w.type !== 'table' || !w.config.trend || plan.error || r?.status !== 'ok' || !r.parts.rows) continue;
        const entry = plan.queries.find((e) => e.q.part === 'rows');
        if (!entry) continue;
        const t = tableTrendQuery(w, entry.q, r.parts.rows, entry.range);
        if (t) trendPlans.push(planWidget(w, viewedWidgets.find((d) => d.widget === w)?.pageId, { queries: [t.query], filter: t.filter }));
    }
    if (trendPlans.length) {
        const second = await runPlans(trendPlans);
        trendPlans.forEach((plan, i) => {
            const r = results[plan.widget.id];
            const t = second[i];
            // A failed trend leaves the table as it is (the column shows dashes).
            if (r?.status === 'ok' && t.status === 'ok' && t.parts.trend) r.parts.trend = t.parts.trend;
        });
    }
    return response();
}

// ── Assembly ─────────────────────────────────────────────────────────────


function assemble(
    plan: WidgetPlan,
    leafToCalls: Map<string, Array<PhysicalLeaf & { logical: LogicalLeaf }>>,
    shapeOf: (l: LogicalLeaf) => string,
    outcomes: Map<string, LeafOutcome>,
    today: Iso,
    /** Owner views get GA4 property names as subtitles; public views never see them. */
    owner = false,
): WidgetResult {
    const flags: ResultFlags = { ...plan.flags };
    const parts: Record<string, DataFrame> = {};
    let cache: 'hit' | 'stale' | 'miss' = 'hit';
    let oldest = Infinity;
    const sitesFailed = new Set<string>();
    let firstError: LeafError | null = null;
    let anyData = false;
    const rollFlags: { usersSummed?: boolean } = {};

    for (const e of plan.queries) {
        const { q } = e;
        // Collect per-site, per-family canonical rows (current and previous).
        const perSite = new Map<string, { cur: Map<string, CRow>; prev: Map<string, CRow> }>();
        const keyDims = q.dimensions.filter((d) => d !== 'site').map((d) => (d === 'date' && e.granularity !== 'day' ? e.granularity : d));
        for (const { leaf, site } of e.leaves) {
            const calls = leafToCalls.get(shapeOf(leaf)) ?? [];
            let siteBucket = perSite.get(site.siteId);
            if (!siteBucket) {
                siteBucket = { cur: new Map(), prev: new Map() };
                perSite.set(site.siteId, siteBucket);
            }
            for (const call of calls) {
                const o = outcomes.get(call.key);
                if (!o) continue;
                let data: LeafData | undefined;
                if ('error' in o) {
                    if (o.staleData) {
                        data = o.staleData.data;
                        flags.stale = true;
                        cache = 'stale';
                        oldest = Math.min(oldest, o.staleData.fetchedAt);
                    } else {
                        firstError ??= o.error;
                        sitesFailed.add(site.label);
                        continue;
                    }
                } else {
                    data = o.data;
                    oldest = Math.min(oldest, o.fetchedAt);
                    if (o.cache === 'miss') cache = 'miss';
                    else if (o.cache === 'stale' && cache !== 'miss') cache = 'stale';
                }
                anyData = true;
                if (data.flags.sampled) flags.sampled = { pct: data.flags.sampled };
                if (data.flags.thresholded) flags.thresholded = true;
                if (data.flags.otherRow) flags.otherRow = true;
                if (data.flags.currency) flags.currency = data.flags.currency;
                if (leaf.family === 'gsc' && !leaf.isPrev) {
                    // Days after Search Console's last complete day (lib/dateRange) are preliminary.
                    const lag = addDays(lastCompleteDay('gsc', today), 1);
                    const pf = data.flags.firstIncomplete ?? (leaf.range.end >= lag ? (lag > leaf.range.start ? lag : leaf.range.start) : undefined);
                    if (pf && (!flags.preliminaryFrom || pf < flags.preliminaryFrom)) flags.preliminaryFrom = pf;
                }
                const metricIds = data.metrics.map((api) => (leaf.family === 'gsc' ? `gsc:${api}` : `ga4:${api}`));
                for (const row of data.rows) {
                    const dims: Record<string, string> = {};
                    keyDims.forEach((d, i) => { dims[d] = canonValue(d, leaf.family, row.d[i] ?? '', leaf.siteHost); });
                    const k = keyDims.map((d) => dims[d]).join('\u0001');
                    const target = leaf.isPrev || row.r === 1 ? siteBucket.prev : siteBucket.cur;
                    let cr = target.get(k);
                    const vals: Vals = {};
                    metricIds.forEach((id, i) => { vals[id] = row.m[i]; });
                    if (!cr) {
                        cr = { dims, cur: {}, prev: {} };
                        target.set(k, cr);
                        Object.assign(cr.cur, vals);
                    } else if (leaf.family === 'gsc' && (e.granularity !== 'day' && keyDims.some((d) => d === 'week' || d === 'month'))) {
                        // GSC daily rows rolled into week/month buckets.
                        cr.cur = rollup([cr.cur, vals], Object.keys({ ...cr.cur, ...vals }), {});
                    } else {
                        Object.assign(cr.cur, vals);
                    }
                }
            }
        }

        // Combine sites: keep them apart when 'site' is a dimension, else roll up.
        const bySite = q.dimensions.includes('site');
        const wanted = withComponents(e.base);
        const cur = new Map<string, CRow>();
        const prev = new Map<string, CRow>();
        for (const which of ['cur', 'prev'] as const) {
            const groups = new Map<string, { dims: Record<string, string>; parts: Vals[] }>();
            for (const [siteId, b] of perSite) {
                for (const [k, r] of b[which]) {
                    const dims = bySite ? { site: siteId, ...r.dims } : r.dims;
                    const gk = bySite ? `${siteId}\u0002${k}` : k;
                    const g = groups.get(gk) ?? { dims, parts: [] };
                    g.parts.push(r.cur);
                    groups.set(gk, g);
                }
            }
            const target = which === 'cur' ? cur : prev;
            for (const [gk, g] of groups) {
                // Parts of one site (GA4 + GSC halves) are disjoint metric sets: merge, then roll up across sites.
                const merged = bySite || perSite.size <= 1 ? [Object.assign({}, ...g.parts) as Vals] : g.parts;
                target.set(gk, { dims: g.dims, cur: rollup(merged, wanted, rollFlags), prev: {} });
            }
        }

        const frame = shapeFrame(q, e, cur, prev, bySite, plan, flags);
        if (bySite) {
            frame.labels = Object.fromEntries(e.targets.map((t) => [t.site.siteId, t.site.label]));
            const subs = owner ? e.targets.filter((t) => siteSubLabel(t.site)).map((t) => [t.site.siteId, siteSubLabel(t.site)!]) : [];
            if (subs.length) frame.sublabels = Object.fromEntries(subs);
        }
        parts[q.part] = frame;
    }

    if (rollFlags.usersSummed) flags.usersSummed = true;
    if (sitesFailed.size && anyData) flags.sitesFailed = [...sitesFailed];
    if (!anyData && firstError) return errResult(firstError.code, firstError.message, { retryAfterSec: firstError.retryAfterSec, sourceLabel: plan.sourceLabel });
    const ok: WidgetResultOk = {
        status: 'ok',
        fetchedAt: new Date(Number.isFinite(oldest) ? oldest : Date.now()).toISOString(),
        cache,
        parts,
        flags,
        sourceLabel: plan.sourceLabel,
    };
    return ok;
}

function bucketsFor(range: Range, g: 'day' | 'week' | 'month'): Iso[] {
    const days = eachDay(range.start, range.end);
    if (g === 'day') return days;
    const seen = new Set<string>();
    const out: Iso[] = [];
    for (const d of days) {
        const b = g === 'week' ? weekStart(d) : monthStart(d);
        if (!seen.has(b)) {
            seen.add(b);
            out.push(b);
        }
    }
    return out;
}

function zeroFor(id: string): number | null {
    const m = getMetric(id);
    if (!m) return null;
    return m.format === 'integer' || m.format === 'currency' || (m.additive && m.format !== 'percent') ? 0 : null;
}

function shapeFrame(
    q: WidgetQuery,
    e: WidgetPlan['queries'][number],
    cur: Map<string, CRow>,
    prev: Map<string, CRow>,
    bySite: boolean,
    plan: WidgetPlan,
    flags: ResultFlags,
): DataFrame {
    const keyDims = q.dimensions.filter((d) => d !== 'site').map((d) => (d === 'date' && e.granularity !== 'day' ? e.granularity : d));
    const timeDim = keyDims.find((d) => TIME_DIMS.has(d));
    const outDims = q.dimensions.map((d) => (d === 'date' && e.granularity !== 'day' ? 'date' : d));
    const columns: DataFrame['columns'] = [
        ...outDims.map((d) => ({ id: `d:${d}`, kind: 'dimension' as const, label: getDim(d)?.label ?? d })),
        ...q.metrics.map((id) => ({ id: `m:${id}`, kind: 'metric' as const, label: getMetric(id)?.label ?? id })),
    ];
    // Round 7: calculated metrics are computed here, per row, from their inputs' values after the
    // join and the roll-up (weeks, sites); '% of total' divides by the column total of its input.
    const hasCalc = q.metrics.some((id) => parseCalcId(id));
    const withCalcs = (v: Vals | undefined, totals: Record<string, number | null>): Vals | undefined => (v && hasCalc ? withCalcValues(q.metrics, v, totals) : v);
    const toRow = (dims: Record<string, string>, c: Vals | undefined, p: Vals | undefined): Record<string, CellValue> => {
        const row: Record<string, CellValue> = {};
        for (const d of q.dimensions) {
            const src = d === 'date' && e.granularity !== 'day' ? e.granularity : d;
            row[`d:${d}`] = dims[src] ?? dims[d] ?? null;
        }
        for (const id of q.metrics) {
            row[`m:${id}`] = c ? (c[id] ?? null) : null;
            if (e.compare) row[`m:${id}:prev`] = p ? (p[id] ?? null) : null;
        }
        return row;
    };

    // ── time axis: zero-fill and align the comparison by bucket index ──
    if (timeDim && !q.pivot) {
        const buckets = bucketsFor(e.range, e.granularity);
        const prevBuckets = e.compare ? bucketsFor(e.compare, e.granularity) : [];
        const gscOnly = e.families.length === 1 && e.families[0] === 'gsc';
        const lagStart = flags.preliminaryFrom;
        const siteIds = bySite ? [...new Set([...cur.values()].map((r) => r.dims.site))] : [''];
        // Zero-fill the fetched metrics (a calculation's inputs), so a day without data computes from zeros.
        const fillIds = hasCalc ? e.base : q.metrics;
        const rows: Array<Record<string, CellValue>> = [];
        for (const sid of siteIds) {
            const kOf = (b: Iso) => (bySite ? `${sid}\u0002${b}` : b);
            // Last bucket Search Console returned: later lag days stay empty instead of a false dip to zero.
            let lastWithData = '';
            for (const b of buckets) if (cur.get(kOf(b))) lastWithData = b;
            const curTot = hasCalc ? shareTotals(q.metrics, buckets.map((b) => cur.get(kOf(b))?.cur ?? {})) : {};
            const prevTot = hasCalc && e.compare ? shareTotals(q.metrics, prevBuckets.map((b) => prev.get(kOf(b))?.cur ?? {})) : {};
            buckets.forEach((b, i) => {
                const c = cur.get(kOf(b));
                const p = e.compare ? prev.get(kOf(prevBuckets[i] ?? '')) : undefined;
                const fill: Vals = {};
                const missingTail = gscOnly && !c && lagStart && b >= lagStart && b > lastWithData;
                for (const id of fillIds) fill[id] = missingTail ? null : zeroFor(id);
                const pfill: Vals = {};
                for (const id of fillIds) pfill[id] = zeroFor(id);
                const cv = c ? { ...fill, ...c.cur } : fill;
                const pv = e.compare ? (p ? { ...pfill, ...p.cur } : prevBuckets[i] ? pfill : undefined) : undefined;
                const row = toRow(bySite ? { site: sid, [timeDim]: b } : { [timeDim]: b }, withCalcs(cv, curTot), withCalcs(pv, prevTot));
                row[`d:date`] = b;
                if (e.compare && prevBuckets[i]) row['d:date:prev'] = prevBuckets[i];
                rows.push(row);
            });
        }
        return { columns, rows, rowCount: rows.length };
    }

    // ── pivot: wide frame (time series breakdown, stacked bars, table trend column) ──
    if (q.pivot) {
        const pd = q.pivot.dimension;
        const primary = keyDims.find((d) => d !== pd) ?? keyDims[0];
        const metric = q.metrics[0];
        const spec = parseCalcId(metric);
        const pivotFrame = spec ? pivotCalc(spec, pd, primary, timeDim, q, e, cur) : null;
        if (pivotFrame) return pivotFrame;
        const totals = new Map<string, number>();
        for (const r of cur.values()) {
            const v = r.cur[metric];
            if (typeof v === 'number') totals.set(r.dims[pd], (totals.get(r.dims[pd]) ?? 0) + v);
        }
        const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
        const top = ranked.slice(0, q.pivot.top).map(([k]) => k);
        const topSet = new Set(top);
        const hasOther = q.pivot.other && ranked.length > top.length;
        const seriesKeys = [...top.map((v) => `b:${v}`), ...(hasOther ? ['b:__other'] : [])];
        const wide = new Map<string, Record<string, CellValue>>();
        const primaryKeys: string[] = timeDim ? bucketsFor(e.range, e.granularity) : [];
        if (!timeDim) {
            const pt = new Map<string, number>();
            for (const r of cur.values()) {
                const v = r.cur[metric];
                if (typeof v === 'number') pt.set(r.dims[primary], (pt.get(r.dims[primary]) ?? 0) + v);
            }
            const ordered = [...pt.entries()].sort((a, b) => b[1] - a[1]).slice(0, q.top?.n ?? 10);
            primaryKeys.push(...ordered.map(([k]) => k));
        }
        for (const pk of primaryKeys) {
            const row: Record<string, CellValue> = { [`d:${timeDim ? 'date' : primary}`]: pk };
            for (const s of seriesKeys) row[s] = timeDim ? 0 : null;
            wide.set(pk, row);
        }
        for (const r of cur.values()) {
            const row = wide.get(r.dims[primary]);
            if (!row) continue;
            const v = r.cur[metric];
            if (typeof v !== 'number') continue;
            const col = topSet.has(r.dims[pd]) ? `b:${r.dims[pd]}` : hasOther ? 'b:__other' : null;
            if (col) row[col] = ((row[col] as number | null) ?? 0) + v;
        }
        const pcolumns = [
            { id: `d:${timeDim ? 'date' : primary}`, kind: 'dimension' as const, label: getDim(timeDim ? 'date' : primary)?.label ?? primary },
            ...seriesKeys.map((s) => ({ id: s, kind: 'metric' as const, label: s === 'b:__other' ? 'Other' : s.slice(2) })),
        ];
        return { columns: pcolumns, rows: [...wide.values()], seriesKeys, rowCount: wide.size };
    }

    // ── categorical rows ──
    const curTot = hasCalc ? shareTotals(q.metrics, [...cur.values()].map((r) => r.cur)) : {};
    const prevTot = hasCalc && e.compare ? shareTotals(q.metrics, [...prev.values()].map((r) => r.cur)) : {};
    let rows = [...cur.entries()].map(([k, r]) => {
        const pv = prev.get(k)?.cur;
        return { k, cv: r.cur, pv, row: toRow(r.dims, withCalcs(r.cur, curTot), withCalcs(pv, prevTot)) };
    });
    if (q.having?.length) {
        rows = rows.filter(({ row }) => q.having!.every((h) => {
            const v = row[`m:${h.metric}`];
            if (typeof v !== 'number') return false;
            if (h.op === 'between' && Array.isArray(h.value)) return v >= h.value[0] && v <= h.value[1];
            const t = Array.isArray(h.value) ? h.value[0] : h.value;
            return h.op === 'gt' ? v > t : h.op === 'gte' ? v >= t : h.op === 'lt' ? v < t : v <= t;
        }));
    }
    const sortBy = q.sort?.by ?? q.metrics[0];
    const dir = q.sort?.dir === 'asc' ? 1 : -1;
    const isMetricSort = q.metrics.includes(sortBy);
    const tableWidget = plan.widget.type === 'table' ? plan.widget : null;
    const byChange = Boolean(tableWidget?.config.sortByChange && e.compare);
    rows.sort((a, b) => {
        if (byChange) {
            const ch = (r: Record<string, CellValue>) => (Number(r[`m:${sortBy}`] ?? 0) - Number(r[`m:${sortBy}:prev`] ?? 0));
            return (ch(a.row) - ch(b.row)) * dir;
        }
        if (isMetricSort) {
            const av = a.row[`m:${sortBy}`];
            const bv = b.row[`m:${sortBy}`];
            return ((typeof av === 'number' ? av : -Infinity) - (typeof bv === 'number' ? bv : -Infinity)) * dir || String(a.k).localeCompare(String(b.k));
        }
        return String(a.row[`d:${sortBy}`] ?? '').localeCompare(String(b.row[`d:${sortBy}`] ?? '')) * dir;
    });
    // Mover lists ("Declining pages"): only rows that really moved that way, never a flat or rising row.
    if (byChange && tableWidget?.config.changeOnly) {
        const moved = (r: Record<string, CellValue>) => Number(r[`m:${sortBy}`] ?? 0) - Number(r[`m:${sortBy}:prev`] ?? 0);
        rows = rows.filter(({ row }) => (dir < 0 ? moved(row) > 0 : moved(row) < 0));
    }
    if (e.families.includes('gsc') && isMetricSort && sortBy !== 'gsc:clicks' && q.limit) flags.sortedWithinTop = q.limit;

    /** Inputs summed over some rows, then the calculation (a ratio of sums, never a mean of ratios). */
    const calcOver = (list: typeof rows, id: string, which: 'cv' | 'pv'): number | null => {
        const spec = parseCalcId(id)!;
        const sums: Vals = {};
        for (const input of expandCalcs([id])) sums[input] = sumOf(list.map((r) => r[which] ?? {}), input);
        return calcValue(spec, sums, (which === 'cv' ? curTot : prevTot)[id]);
    };
    const totals: Record<string, number | null> = {};
    for (const id of q.metrics) {
        const def = getMetric(id);
        if (def?.calc && !def.additive) {
            // Totals of a calculation need summable inputs (never users or rates).
            if (expandCalcs([id]).every((x) => getMetric(x)?.additive)) {
                totals[`m:${id}`] = calcOver(rows, id, 'cv');
                if (e.compare) totals[`m:${id}:prev`] = calcOver(rows, id, 'pv');
            }
        } else if (def?.additive) {
            totals[`m:${id}`] = rows.reduce((s, r) => s + (typeof r.row[`m:${id}`] === 'number' ? (r.row[`m:${id}`] as number) : 0), 0);
            if (e.compare) totals[`m:${id}:prev`] = rows.reduce((s, r) => s + (typeof r.row[`m:${id}:prev`] === 'number' ? (r.row[`m:${id}:prev`] as number) : 0), 0);
        }
    }
    const rowCount = rows.length;
    let truncated = false;
    let out = rows.map((r) => r.row);
    if (q.top) {
        const shown = out.slice(0, q.top.n);
        if (q.top.other && out.length > q.top.n) {
            const restRows = rows.slice(q.top.n);
            const rest = out.slice(q.top.n);
            const other: Record<string, CellValue> = {};
            for (const d of q.dimensions) other[`d:${d}`] = '(other)';
            for (const id of q.metrics) {
                if (parseCalcId(id)) {
                    other[`m:${id}`] = calcOver(restRows, id, 'cv');
                    if (e.compare) other[`m:${id}:prev`] = calcOver(restRows, id, 'pv');
                    continue;
                }
                other[`m:${id}`] = rest.reduce((s, r) => s + (Number(r[`m:${id}`]) || 0), 0);
                if (e.compare) other[`m:${id}:prev`] = rest.reduce((s, r) => s + (Number(r[`m:${id}:prev`]) || 0), 0);
            }
            other.__other = 1;
            shown.push(other);
        }
        truncated = out.length > q.top.n;
        out = shown;
    } else if (q.limit && out.length > q.limit) {
        out = out.slice(0, q.limit);
        truncated = true;
    }
    return { columns, rows: out, totals, rowCount, truncated };
}

/**
 * Pivot of a calculated metric: each cell computed from its summed inputs ("Other" included);
 * values ranked by the total of input A (a ratio would rank one-visit rows first).
 */
function pivotCalc(
    spec: CalcSpec,
    pd: string,
    primary: string,
    timeDim: string | undefined,
    q: WidgetQuery,
    e: WidgetPlan['queries'][number],
    cur: Map<string, CRow>,
): DataFrame {
    const inputs = expandCalcs([q.metrics[0]]);
    const all = [...cur.values()];
    const shareTot = spec.op === 'share' ? sumOf(all.map((r) => r.cur), spec.a) : null;
    const add = (acc: Vals, v: Vals) => {
        for (const id of inputs) {
            const x = v[id];
            if (typeof x === 'number') acc[id] = ((acc[id] as number | null | undefined) ?? 0) + x;
        }
    };
    const sizeBy = (key: (r: CRow) => string) => {
        const m = new Map<string, number>();
        for (const r of all) {
            const v = r.cur[spec.a];
            if (typeof v === 'number') m.set(key(r), (m.get(key(r)) ?? 0) + v);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const ranked = sizeBy((r) => r.dims[pd]);
    const top = ranked.slice(0, q.pivot!.top).map(([k]) => k);
    const topSet = new Set(top);
    const hasOther = q.pivot!.other && ranked.length > top.length;
    const seriesKeys = [...top.map((v) => `b:${v}`), ...(hasOther ? ['b:__other'] : [])];
    const primaryKeys = timeDim ? bucketsFor(e.range, e.granularity) : sizeBy((r) => r.dims[primary]).slice(0, q.top?.n ?? 10).map(([k]) => k);
    const cells = new Map<string, Map<string, Vals>>();
    for (const pk of primaryKeys) cells.set(pk, new Map());
    for (const r of all) {
        const row = cells.get(r.dims[primary]);
        if (!row) continue;
        const col = topSet.has(r.dims[pd]) ? `b:${r.dims[pd]}` : hasOther ? 'b:__other' : null;
        if (!col) continue;
        const acc = row.get(col) ?? {};
        add(acc, r.cur);
        row.set(col, acc);
    }
    // A day with no rows computes from zeros (0 − 0 = 0; 0 ÷ 0 = no value).
    const zeros: Vals = Object.fromEntries(inputs.map((id) => [id, zeroFor(id)]));
    const rows = primaryKeys.map((pk) => {
        const row: Record<string, CellValue> = { [`d:${timeDim ? 'date' : primary}`]: pk };
        for (const s of seriesKeys) {
            const v = cells.get(pk)?.get(s);
            row[s] = v ? calcValue(spec, { ...zeros, ...v }, shareTot) : timeDim ? calcValue(spec, zeros, shareTot) : null;
        }
        return row;
    });
    const columns = [
        { id: `d:${timeDim ? 'date' : primary}`, kind: 'dimension' as const, label: getDim(timeDim ? 'date' : primary)?.label ?? primary },
        ...seriesKeys.map((s) => ({ id: s, kind: 'metric' as const, label: s === 'b:__other' ? 'Other' : s.slice(2) })),
    ];
    return { columns, rows, seriesKeys, rowCount: rows.length };
}

/** Exposed for tests: plan-only helpers. */
export const __test = { ga4Filter, gscFilters, isoWeekToMonday, rollup, withComponents, bucketsFor, parseGa4, parseGsc, canonValue, shapeFrame };
