/**
 * GA4 Data API answers from the demo generator: runReport (any dimensions,
 * metrics, filters, ordering, several date ranges, cohorts),
 * runRealtimeReport and metadata. Responses use the same JSON shape as
 * https://analyticsdata.googleapis.com/v1beta so callers parse them unchanged.
 */

import type { DemoSite } from './catalog';
import { findSiteByPropertyId, siteOrigin } from './catalog';
import { DEMO_HISTORY_DAYS, WEEKDAY_NAMES, dayOfWeek, dayToCompact, dayToDate, isoWeek, pad, parseDateToken, sundayWeek, todayIndex } from './dates';
import { DIMENSION_GROUP, type Entity, type Factors, siteGroup, sitePages } from './entities';
import { noise, unit } from './rng';
import { dailySeries, hourProfile, siteRates } from './series';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class DemoApiError extends Error {
    // Plain fields (no parameter properties) so node --test can load this file by stripping types.
    status: number;
    googleStatus: string;
    constructor(status: number, googleStatus: string, message: string) {
        super(message);
        this.status = status;
        this.googleStatus = googleStatus;
    }
    toJSON() {
        return { error: { code: this.status, message: this.message, status: this.googleStatus } };
    }
}

// ─── Request types (the subset of the GA4 Data API the app uses) ───

export interface GaDateRange { startDate?: string; endDate?: string; name?: string }
export interface GaReportRequest {
    dateRanges?: GaDateRange[];
    dimensions?: Array<{ name: string }>;
    metrics?: Array<{ name: string; expression?: string }>;
    dimensionFilter?: any;
    metricFilter?: any;
    orderBys?: any[];
    limit?: number | string;
    offset?: number | string;
    metricAggregations?: string[];
    keepEmptyRows?: boolean;
    cohortSpec?: any;
    minuteRanges?: any[];
}

const TIME_DIMS = new Set(['date', 'dateHour', 'dateHourMinute', 'hour', 'minute', 'day', 'dayOfWeek', 'dayOfWeekName', 'week', 'month', 'year', 'yearMonth', 'yearWeek', 'isoWeek', 'isoYear', 'isoYearIsoWeek', 'nthDay', 'nthWeek', 'nthMonth', 'nthYear', 'nthHour', 'firstSessionDate']);
const HOUR_DIMS = new Set(['dateHour', 'dateHourMinute', 'hour', 'minute', 'nthHour']);

// ─── Metric definitions ───

/** Additive building blocks every metric is derived from. */
interface Comps {
    U: number;   // sum of daily users
    NU: number;  // new users
    S: number;   // sessions
    ENG: number; // engaged sessions
    DUR: number; // session seconds
    UED: number; // user engagement seconds
    PV: number;  // page views
    EV: number;  // events
    KEY: number; // key events
    TX: number;  // purchases
    REV: number; // revenue
    ATC: number; // add to carts
    CO: number;  // checkouts
    VI: number;  // items viewed
    span: number; // days aggregated (for user de-duplication)
}

function emptyComps(): Comps {
    return { U: 0, NU: 0, S: 0, ENG: 0, DUR: 0, UED: 0, PV: 0, EV: 0, KEY: 0, TX: 0, REV: 0, ATC: 0, CO: 0, VI: 0, span: 0 };
}

type MetricType = 'TYPE_INTEGER' | 'TYPE_FLOAT' | 'TYPE_SECONDS' | 'TYPE_CURRENCY';

function users(c: Comps): number {
    if (c.span <= 1) return c.U;
    const returning = Math.max(0, c.U - c.NU);
    return c.NU + returning / (1 + 0.45 * Math.log(c.span));
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

const METRICS: Record<string, { type: MetricType; fn: (c: Comps) => number }> = {
    activeUsers: { type: 'TYPE_INTEGER', fn: users },
    totalUsers: { type: 'TYPE_INTEGER', fn: c => users(c) * 1.04 },
    active1DayUsers: { type: 'TYPE_INTEGER', fn: users },
    active7DayUsers: { type: 'TYPE_INTEGER', fn: c => users(c) * (c.span <= 1 ? 3.1 : 1.6) },
    active28DayUsers: { type: 'TYPE_INTEGER', fn: c => users(c) * (c.span <= 1 ? 8.2 : 1.9) },
    dauPerMau: { type: 'TYPE_FLOAT', fn: c => (c.U > 0 ? 0.12 : 0) },
    dauPerWau: { type: 'TYPE_FLOAT', fn: c => (c.U > 0 ? 0.32 : 0) },
    wauPerMau: { type: 'TYPE_FLOAT', fn: c => (c.U > 0 ? 0.38 : 0) },
    newUsers: { type: 'TYPE_INTEGER', fn: c => c.NU },
    sessions: { type: 'TYPE_INTEGER', fn: c => c.S },
    engagedSessions: { type: 'TYPE_INTEGER', fn: c => c.ENG },
    engagementRate: { type: 'TYPE_FLOAT', fn: c => div(c.ENG, c.S) },
    bounceRate: { type: 'TYPE_FLOAT', fn: c => (c.S > 0 ? 1 - c.ENG / c.S : 0) },
    averageSessionDuration: { type: 'TYPE_SECONDS', fn: c => div(c.DUR, c.S) },
    sessionsPerUser: { type: 'TYPE_FLOAT', fn: c => div(c.S, users(c)) },
    userEngagementDuration: { type: 'TYPE_SECONDS', fn: c => c.UED },
    engagedSessionsPerUser: { type: 'TYPE_FLOAT', fn: c => div(c.ENG, users(c)) },
    screenPageViews: { type: 'TYPE_INTEGER', fn: c => c.PV },
    views: { type: 'TYPE_INTEGER', fn: c => c.PV },
    screenPageViewsPerSession: { type: 'TYPE_FLOAT', fn: c => div(c.PV, c.S) },
    screenPageViewsPerUser: { type: 'TYPE_FLOAT', fn: c => div(c.PV, users(c)) },
    eventCount: { type: 'TYPE_INTEGER', fn: c => c.EV },
    eventCountPerUser: { type: 'TYPE_FLOAT', fn: c => div(c.EV, users(c)) },
    eventsPerSession: { type: 'TYPE_FLOAT', fn: c => div(c.EV, c.S) },
    eventValue: { type: 'TYPE_FLOAT', fn: c => c.KEY * 12 },
    keyEvents: { type: 'TYPE_INTEGER', fn: c => c.KEY },
    conversions: { type: 'TYPE_INTEGER', fn: c => c.KEY },
    sessionKeyEventRate: { type: 'TYPE_FLOAT', fn: c => Math.min(1, div(c.KEY * 0.82, c.S)) },
    sessionConversionRate: { type: 'TYPE_FLOAT', fn: c => Math.min(1, div(c.KEY * 0.82, c.S)) },
    userKeyEventRate: { type: 'TYPE_FLOAT', fn: c => Math.min(1, div(c.KEY * 0.88, users(c))) },
    userConversionRate: { type: 'TYPE_FLOAT', fn: c => Math.min(1, div(c.KEY * 0.88, users(c))) },
    totalRevenue: { type: 'TYPE_CURRENCY', fn: c => c.REV },
    purchaseRevenue: { type: 'TYPE_CURRENCY', fn: c => c.REV },
    grossPurchaseRevenue: { type: 'TYPE_CURRENCY', fn: c => c.REV * 1.04 },
    itemRevenue: { type: 'TYPE_CURRENCY', fn: c => c.REV * 0.93 },
    averagePurchaseRevenue: { type: 'TYPE_CURRENCY', fn: c => div(c.REV, c.TX) },
    averageRevenuePerUser: { type: 'TYPE_CURRENCY', fn: c => div(c.REV, users(c)) },
    averagePurchaseRevenuePerUser: { type: 'TYPE_CURRENCY', fn: c => div(c.REV, users(c)) },
    transactions: { type: 'TYPE_INTEGER', fn: c => c.TX },
    ecommercePurchases: { type: 'TYPE_INTEGER', fn: c => c.TX },
    totalPurchasers: { type: 'TYPE_INTEGER', fn: c => c.TX * 0.94 },
    firstTimePurchasers: { type: 'TYPE_INTEGER', fn: c => c.TX * 0.61 },
    purchaserRate: { type: 'TYPE_FLOAT', fn: c => Math.min(1, div(c.TX * 0.94, users(c))) },
    addToCarts: { type: 'TYPE_INTEGER', fn: c => c.ATC },
    checkouts: { type: 'TYPE_INTEGER', fn: c => c.CO },
    itemsViewed: { type: 'TYPE_INTEGER', fn: c => c.VI },
    itemsAddedToCart: { type: 'TYPE_INTEGER', fn: c => c.ATC * 1.1 },
    itemsPurchased: { type: 'TYPE_INTEGER', fn: c => c.TX * 1.4 },
    cartToViewRate: { type: 'TYPE_FLOAT', fn: c => div(c.ATC, c.VI) },
    purchaseToViewRate: { type: 'TYPE_FLOAT', fn: c => div(c.TX, c.VI) },
};

function metricDef(name: string): { type: MetricType; fn: (c: Comps) => number } {
    return METRICS[name] || { type: 'TYPE_INTEGER', fn: () => 0 };
}

function formatMetric(type: MetricType, v: number): string {
    if (!Number.isFinite(v)) v = 0;
    if (type === 'TYPE_INTEGER') return String(Math.round(v));
    if (type === 'TYPE_CURRENCY') return String(Math.round(v * 100) / 100);
    return String(Number(v.toPrecision(12)));
}

// ─── Filters ───

type Tri = boolean | null;
type Getter = (field: string) => string | number | undefined;

function matchString(value: string, f: any): boolean {
    const caseSensitive = Boolean(f.caseSensitive);
    const v = caseSensitive ? value : value.toLowerCase();
    const want = caseSensitive ? String(f.value ?? '') : String(f.value ?? '').toLowerCase();
    switch (f.matchType || 'EXACT') {
        case 'BEGINS_WITH': return v.startsWith(want);
        case 'ENDS_WITH': return v.endsWith(want);
        case 'CONTAINS': return v.includes(want);
        case 'FULL_REGEXP':
            try { return new RegExp(`^(?:${f.value})$`, caseSensitive ? '' : 'i').test(value); } catch { return false; }
        case 'PARTIAL_REGEXP':
            try { return new RegExp(String(f.value), caseSensitive ? '' : 'i').test(value); } catch { return false; }
        default: return v === want;
    }
}

function numValue(v: any): number {
    if (!v) return 0;
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.int64Value !== undefined) return Number(v.int64Value);
    return 0;
}

function evalFilter(f: any, get: Getter): Tri {
    const raw = get(f.fieldName);
    if (raw === undefined) return null;
    if (f.stringFilter) return matchString(String(raw), f.stringFilter);
    if (f.inListFilter) {
        const cs = Boolean(f.inListFilter.caseSensitive);
        const values: string[] = (f.inListFilter.values || []).map((x: string) => (cs ? x : String(x).toLowerCase()));
        return values.includes(cs ? String(raw) : String(raw).toLowerCase());
    }
    if (f.numericFilter) {
        const n = Number(raw);
        const want = numValue(f.numericFilter.value);
        switch (f.numericFilter.operation) {
            case 'LESS_THAN': return n < want;
            case 'LESS_THAN_OR_EQUAL': return n <= want;
            case 'GREATER_THAN': return n > want;
            case 'GREATER_THAN_OR_EQUAL': return n >= want;
            default: return n === want;
        }
    }
    if (f.betweenFilter) {
        const n = Number(raw);
        return n >= numValue(f.betweenFilter.fromValue) && n <= numValue(f.betweenFilter.toValue);
    }
    if (f.emptyFilter) return raw === '' || raw === '(not set)';
    return true;
}

/** Three-valued evaluation: null means "depends on a field not known yet". */
export function evalGaExpression(expr: any, get: Getter): Tri {
    if (!expr || typeof expr !== 'object') return true;
    if (expr.andGroup) {
        let res: Tri = true;
        for (const e of expr.andGroup.expressions || []) {
            const r = evalGaExpression(e, get);
            if (r === false) return false;
            if (r === null) res = null;
        }
        return res;
    }
    if (expr.orGroup) {
        let res: Tri = false;
        for (const e of expr.orGroup.expressions || []) {
            const r = evalGaExpression(e, get);
            if (r === true) return true;
            if (r === null) res = null;
        }
        return res;
    }
    if (expr.notExpression) {
        const r = evalGaExpression(expr.notExpression, get);
        return r === null ? null : !r;
    }
    if (expr.filter) return evalFilter(expr.filter, get);
    return true;
}

function filterFields(expr: any, out: Set<string> = new Set()): Set<string> {
    if (!expr || typeof expr !== 'object') return out;
    if (expr.filter?.fieldName) out.add(expr.filter.fieldName);
    for (const e of expr.andGroup?.expressions || []) filterFields(e, out);
    for (const e of expr.orGroup?.expressions || []) filterFields(e, out);
    if (expr.notExpression) filterFields(expr.notExpression, out);
    return out;
}

// ─── Entity crossing ───

interface Combo {
    vals: Record<string, string>;
    u: number; pv: number; ev: number; key: number; rev: number;
    f: Required<Factors>;
    /** The entity of each crossed group (group name, entity key), for per-entity noise. */
    ids: Array<[string, string]>;
}

const MAX_COMBOS = 40_000;

function crossGroups(site: DemoSite, groupNames: string[]): Combo[] {
    let groups = groupNames.map(n => siteGroup(site, n).entities);
    // Keep the cross product bounded by dropping the smallest entities.
    let size = groups.reduce((s, g) => s * g.length, 1);
    while (size > MAX_COMBOS) {
        const largest = groups.reduce((bi, g, i) => (g.length > groups[bi].length ? i : bi), 0);
        groups = groups.map((g, i) => (i === largest ? [...g].sort((a, b) => b.w - a.w).slice(0, Math.max(1, Math.floor(g.length * 0.7))) : g));
        size = groups.reduce((s, g) => s * g.length, 1);
    }
    let combos: Combo[] = [{ vals: {}, u: 1, pv: 1, ev: 1, key: 1, rev: 1, f: { eng: 1, dur: 1, nu: 1 }, ids: [] }];
    groups.forEach((entities, gi) => {
        const next: Combo[] = [];
        for (const c of combos) {
            for (const e of entities as Entity[]) {
                const pv = e.wPV ?? e.w;
                next.push({
                    vals: { ...c.vals, ...e.vals },
                    u: c.u * e.w,
                    pv: c.pv * pv,
                    ev: c.ev * (e.wEv ?? pv),
                    key: c.key * (e.wKey ?? e.w),
                    rev: c.rev * (e.wRev ?? e.wKey ?? e.w),
                    f: { eng: c.f.eng * (e.f?.eng ?? 1), dur: c.f.dur * (e.f?.dur ?? 1), nu: c.f.nu * (e.f?.nu ?? 1) },
                    ids: [...c.ids, [groupNames[gi], e.key]],
                });
            }
        }
        combos = next;
    });
    return combos;
}

/**
 * Range noise per entity (round 5 polish), normalised within its group so the group still sums to the site total.
 * A row's noise is the product over its entities, so a two-dimension report (channel x landing page) sums to the
 * one-dimension report (landing page) exactly, as GA4's do; per-row noise made them disagree by a few percent.
 */
const entityNoiseCache = new Map<string, Map<string, number>>();

function entityNoise(site: DemoSite, group: string, start: number, end: number): Map<string, number> {
    const ck = `${site.key}|${group}|${start}|${end}`;
    const hit = entityNoiseCache.get(ck);
    if (hit) return hit;
    if (entityNoiseCache.size > 400) entityNoiseCache.clear();
    const entities = siteGroup(site, group).entities;
    const raw = entities.map(e => noise(0.07, site.key, 'ent', group, e.key, start, end));
    const W = entities.reduce((s, e) => s + e.w, 0) || 1;
    const norm = entities.reduce((s, e, i) => s + e.w * raw[i], 0) / W || 1;
    const out = new Map(entities.map((e, i) => [e.key, raw[i] / norm]));
    entityNoiseCache.set(ck, out);
    return out;
}

/**
 * Channel x landing page (round 5 polish): in real data each landing page has its own channel mix (articles get
 * search, the home page direct visits); independent groups gave every page the site's mix. A combination is scaled
 * by 1 + k·a(channel)·b(page), with a and b centred on the groups' noisy weights for the range, so every channel's
 * total and every page's total stay what the one-dimension reports say.
 */
const CHANNEL_CONTENT_AFFINITY: Record<string, number> = {
    'Organic Search': 1, 'Organic Social': 0.35, Referral: 0.2, 'Organic Video': 0.3,
    Direct: -1, Email: -0.45, 'Paid Search': -0.35, 'Paid Social': -0.2, Display: -0.3, Affiliates: -0.1,
};
const affinityCache = new Map<string, { a: Map<string, number>; b: Map<string, number>; k: number }>();

function channelLanding(site: DemoSite, start: number, end: number) {
    const ck = `${site.key}|${start}|${end}`;
    const hit = affinityCache.get(ck);
    if (hit) return hit;
    if (affinityCache.size > 200) affinityCache.clear();
    const centred = (group: string, raw: (e: Entity) => number) => {
        const entities = siteGroup(site, group).entities;
        const n = entityNoise(site, group, start, end);
        const wt = (e: Entity) => e.w * (n.get(e.key) ?? 1);
        const W = entities.reduce((s, e) => s + wt(e), 0) || 1;
        const mean = entities.reduce((s, e) => s + wt(e) * raw(e), 0) / W;
        return new Map(entities.map(e => [e.key, raw(e) - mean]));
    };
    const a = centred('source', e => CHANNEL_CONTENT_AFFINITY[e.vals.sessionDefaultChannelGroup ?? ''] ?? 0);
    const b = centred('landing', e => {
        const path = e.key;
        if (path === '(not set)') return 0;
        if (path === '/') return -0.9;
        if (path.startsWith(site.topicPrefix)) return 0.35 + 0.5 * unit(site.key, 'aff', path);
        if (/pricing|signup|login|app|checkout|cart/.test(path)) return -0.45;
        return 0.3 * (unit(site.key, 'aff', path) - 0.5);
    });
    const worst = Math.max(...[...a.values()].map(Math.abs)) * Math.max(...[...b.values()].map(Math.abs));
    const out = { a, b, k: worst > 0 ? Math.min(0.9, 0.75 / worst) : 0 }; // every factor stays at 0.25 or more
    affinityCache.set(ck, out);
    return out;
}

function comboNoise(site: DemoSite, c: Combo, start: number, end: number): number {
    let f = 1;
    let src: string | undefined;
    let land: string | undefined;
    for (const [g, key] of c.ids) {
        f *= entityNoise(site, g, start, end).get(key) ?? 1;
        if (g === 'source') src = key;
        else if (g === 'landing') land = key;
    }
    if (src !== undefined && land !== undefined) {
        const { a, b, k } = channelLanding(site, start, end);
        f *= 1 + k * (a.get(src) ?? 0) * (b.get(land) ?? 0);
    }
    return f;
}

// ─── Time values ───

function timeValues(day: number, hour: number | null, rangeStart: number): Record<string, string> {
    const d = dayToDate(day);
    const iso = isoWeek(day);
    const nth = day - rangeStart;
    const h = hour ?? 0;
    const compact = dayToCompact(day);
    return {
        date: compact,
        firstSessionDate: compact,
        dateHour: `${compact}${pad(h)}`,
        dateHourMinute: `${compact}${pad(h)}00`,
        hour: pad(h),
        minute: '00',
        day: pad(d.getUTCDate()),
        dayOfWeek: String(dayOfWeek(day)),
        dayOfWeekName: WEEKDAY_NAMES[dayOfWeek(day)],
        week: pad(sundayWeek(day)),
        month: pad(d.getUTCMonth() + 1),
        year: String(d.getUTCFullYear()),
        yearMonth: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`,
        yearWeek: `${d.getUTCFullYear()}${pad(sundayWeek(day))}`,
        isoWeek: pad(iso.week),
        isoYear: String(iso.year),
        isoYearIsoWeek: `${iso.year}${pad(iso.week)}`,
        nthDay: pad(nth, 4),
        nthWeek: pad(Math.floor(nth / 7), 4),
        nthMonth: pad(Math.floor(nth / 30), 4),
        nthYear: pad(Math.floor(nth / 365), 4),
        nthHour: pad(nth * 24 + h, 4),
    };
}

// ─── Daily components ───

const COMP_KEYS = ['U', 'NU', 'S', 'ENG', 'DUR', 'UED', 'PV', 'EV', 'KEY', 'TX', 'REV', 'ATC', 'CO', 'VI'] as const;
type CompKey = typeof COMP_KEYS[number];

/** Site totals for one day. Rates wobble day to day and drift with the site's shape. */
function siteComps(site: DemoSite, users: number, day: number, today: number): Comps {
    const r = siteRates(site);
    const t = Math.max(0, Math.min(1, (today - day) / DEMO_HISTORY_DAYS)); // 0 = today
    const drift = site.shape === 'growing' || site.shape === 'new' ? 1 + 0.07 * (1 - t) : site.shape === 'declining' ? 1 - 0.08 * (1 - t) : 1;
    const S = users * r.sessionsPerUser * noise(0.06, site.key, 'spu', day);
    const PV = S * r.pagesPerSession * noise(0.08, site.key, 'pps', day) * (0.96 + 0.04 * drift);
    const ENG = Math.min(S * 0.95, S * r.engagementRate * drift * noise(0.07, site.key, 'eng', day));
    const TX = S * r.purchaseRate * noise(0.25, site.key, 'tx', day);
    const aov = (site.aov || 0) * noise(0.12, site.key, 'aov', day);
    const dur = r.avgSessionSeconds * drift * noise(0.12, site.key, 'dur', day);
    return {
        U: users,
        NU: users * Math.min(0.97, r.newUserShare * noise(0.05, site.key, 'nu', day)),
        S,
        ENG,
        DUR: S * dur,
        UED: ENG * dur * 0.85,
        PV,
        EV: PV * r.eventsPerPageview * noise(0.05, site.key, 'epv', day),
        KEY: S * r.keyEventRate * drift * noise(0.22, site.key, 'key', day),
        TX,
        REV: TX * aov,
        ATC: site.kind === 'shop' ? S * 0.11 * noise(0.15, site.key, 'atc', day) : 0,
        CO: site.kind === 'shop' ? S * 0.045 * noise(0.18, site.key, 'co', day) : 0,
        VI: site.kind === 'shop' ? S * 1.6 : 0,
        span: 1,
    };
}

interface CompTable { start: number; daily: Comps[]; prefix: Record<CompKey, Float64Array> }
const compCache = new Map<string, CompTable>();

/** Per-day site totals for the whole window plus prefix sums for fast range totals. */
function compTable(site: DemoSite, today: number): CompTable {
    const key = `${site.key}|${today}`;
    let table = compCache.get(key);
    if (table) return table;
    if (compCache.size > 100) compCache.clear();
    const { start, values } = dailySeries(site, today);
    const daily = Array.from(values, (u, i) => (u > 0 ? siteComps(site, u, start + i, today) : emptyComps()));
    const prefix = {} as Record<CompKey, Float64Array>;
    for (const k of COMP_KEYS) {
        const arr = new Float64Array(daily.length + 1);
        for (let i = 0; i < daily.length; i++) arr[i + 1] = arr[i] + daily[i][k];
        prefix[k] = arr;
    }
    table = { start, daily, prefix };
    compCache.set(key, table);
    return table;
}

function rangeComps(table: CompTable, s: number, e: number): Comps {
    const out = emptyComps();
    const a = s - table.start;
    const b = e - table.start + 1;
    for (const k of COMP_KEYS) out[k] = table.prefix[k][b] - table.prefix[k][a];
    return out;
}

function addScaled(into: Comps, base: Comps, c: Combo, scale: number): void {
    const u = c.u * scale;
    into.U += base.U * u;
    into.S += base.S * u;
    const S = base.S * u;
    into.NU += Math.min(base.U * u, base.NU * u * c.f.nu);
    into.ENG += Math.min(S * 0.97, base.ENG * u * c.f.eng);
    into.DUR += base.DUR * u * c.f.dur;
    into.UED += base.UED * u * c.f.eng * c.f.dur;
    into.PV += base.PV * c.pv * scale;
    into.EV += base.EV * c.ev * scale;
    into.KEY += base.KEY * c.key * scale;
    into.TX += base.TX * c.rev * scale;
    into.REV += base.REV * c.rev * scale;
    into.ATC += base.ATC * u;
    into.CO += base.CO * u;
    into.VI += base.VI * u;
}

// ─── runReport ───

interface ResolvedRange { start: number; end: number; name: string }

function resolveRanges(ranges: GaDateRange[] | undefined, today: number): ResolvedRange[] {
    const list = ranges && ranges.length ? ranges : [{ startDate: '28daysAgo', endDate: 'yesterday' }];
    return list.map((r, i) => {
        const start = parseDateToken(r.startDate, today);
        const end = parseDateToken(r.endDate, today);
        if (start === null || end === null) {
            throw new DemoApiError(400, 'INVALID_ARGUMENT', `Invalid date range: ${r.startDate} – ${r.endDate}`);
        }
        return { start, end, name: r.name || `date_range_${i}` };
    });
}

interface OutRow { dims: string[]; comps: Comps; vals: Record<string, string> }

export interface DemoRunOptions {
    now?: number;
}

export function demoRunReport(propertyId: string, request: GaReportRequest, opts: DemoRunOptions = {}): any {
    const site = findSiteByPropertyId(propertyId);
    if (!site || !site.ga) {
        throw new DemoApiError(403, 'PERMISSION_DENIED', `User does not have sufficient permissions for this property (${propertyId}).`);
    }
    const today = todayIndex(opts.now);
    if (request.cohortSpec) return cohortReport(site, request, today);

    const dims = (request.dimensions || []).map(d => d.name);
    const mets = (request.metrics || []).map(m => m.name);
    if (mets.length === 0 && dims.length === 0) {
        throw new DemoApiError(400, 'INVALID_ARGUMENT', 'At least one dimension or metric is required.');
    }
    const ranges = resolveRanges(request.dateRanges, today);
    const multiRange = ranges.length > 1;

    if (dims.includes('pageReferrer') && dims.includes('pagePath')) return transitionReport(site, request, dims, mets, ranges, today);

    const rows = buildRows(site, dims, request.dimensionFilter, ranges, today);

    // Derive metrics; drop all-zero rows like GA4 does.
    let out = rows.map(r => {
        const values = mets.map(m => metricDef(m).fn(r.comps));
        return { dims: r.dims, values };
    });
    if (!request.keepEmptyRows) {
        out = out.filter(r => r.values.length === 0 || r.values.some(v => Math.round(v * 100) !== 0));
    }
    if (request.metricFilter) {
        out = out.filter(r => evalGaExpression(request.metricFilter, field => {
            const i = mets.indexOf(field);
            return i >= 0 ? r.values[i] : undefined;
        }) !== false);
    }

    sortRows(out, dims, mets, request.orderBys, multiRange);

    const rowCount = out.length;
    const offset = Math.max(0, Number(request.offset) || 0);
    const limit = Math.min(250_000, Math.max(1, Number(request.limit) || 10_000));
    const page = out.slice(offset, offset + limit);

    const metricHeaders = mets.map(name => ({ name, type: metricDef(name).type }));
    const dimensionHeaders = [...dims, ...(multiRange ? ['dateRange'] : [])].map(name => ({ name }));
    const fmtRow = (r: { dims: string[]; values: number[] }) => ({
        dimensionValues: r.dims.map(value => ({ value })),
        metricValues: r.values.map((v, i) => ({ value: formatMetric(metricHeaders[i].type, v) })),
    });

    const response: any = {
        dimensionHeaders,
        metricHeaders,
        metadata: { currencyCode: site.ga.currencyCode, timeZone: site.ga.timeZone },
        kind: 'analyticsData#runReport',
    };
    if (page.length) response.rows = page.map(fmtRow);
    if (rowCount) response.rowCount = rowCount;

    const aggs = request.metricAggregations || [];
    if (aggs.length && mets.length) {
        if (aggs.includes('TOTAL')) {
            const totals = buildRows(site, [], request.dimensionFilter, ranges, today);
            response.totals = (totals.length ? totals : [{ dims: [], comps: emptyComps(), vals: {} }]).map(t => ({
                dimensionValues: [...dims.map(() => ({ value: 'RESERVED_TOTAL' })), ...(multiRange ? [{ value: t.dims[0] ?? 'date_range_0' }] : [])],
                metricValues: mets.map((m, i) => ({ value: formatMetric(metricHeaders[i].type, metricDef(m).fn(t.comps)) })),
            }));
        }
        for (const [agg, key, pickFn] of [['MAXIMUM', 'maximums', Math.max], ['MINIMUM', 'minimums', Math.min]] as const) {
            if (!aggs.includes(agg) || !out.length) continue;
            response[key] = [{
                dimensionValues: dimensionHeaders.map(() => ({ value: `RESERVED_${agg === 'MAXIMUM' ? 'MAX' : 'MIN'}` })),
                metricValues: mets.map((_, i) => ({ value: formatMetric(metricHeaders[i].type, pickFn(...out.map(r => r.values[i]))) })),
            }];
        }
    }
    return response;
}

/**
 * Page-to-page views: pageReferrer + pagePath (Traffic › Journeys, round 5). On a click inside the site GA4 sets
 * page_referrer to the page the visitor came from, so these rows carry internal transitions. The generic crossing
 * pairs pages with the sources' external referrers only, so this builds a small, stable link graph instead: each
 * landing page's sessions continue to about 6 pages (weights from page views and a per-pair affinity), and the
 * landing view itself has an external referrer. Totals follow the site's sessions for the range.
 */
function transitionReport(site: DemoSite, request: GaReportRequest, dims: string[], mets: string[], ranges: ResolvedRange[], today: number): any {
    const origin = siteOrigin(site);
    const rates = siteRates(site);
    const table = compTable(site, today);
    const windowStart = today - DEMO_HISTORY_DAYS + 1;
    const pages = [...sitePages(site)].sort((a, b) => b.views - a.views).slice(0, 40);
    const baseCont = Math.max(0.15, Math.min(0.75, (rates.pagesPerSession - 1) / rates.pagesPerSession));
    const out: Array<{ dims: string[]; values: number[] }> = [];
    for (const range of ranges) {
        const s = Math.max(range.start, windowStart);
        const e = Math.min(range.end, today);
        if (e < s) continue;
        const sessions = rangeComps(table, s, e).S;
        const push = (landing: string, referrer: string, path: string, views: number) => {
            if (views < 0.5) return;
            const vals: Record<string, string> = { landingPage: landing, landingPagePlusQueryString: landing, pageReferrer: referrer, pagePath: path, pagePathPlusQueryString: path, hostName: site.host };
            const scaled = views * noise(0.08, site.key, 'tr', landing, path, range.start, range.end);
            out.push({
                dims: [...dims.map(d => vals[d] ?? '(not set)'), ...(ranges.length > 1 ? [range.name] : [])],
                values: mets.map(m => (m === 'activeUsers' || m === 'totalUsers' ? scaled * 0.82 : m === 'sessions' ? scaled * 0.9 : scaled)),
            });
        };
        for (const l of pages) {
            const sessL = sessions * l.landing;
            if (sessL < 1) continue;
            push(l.path, 'https://www.google.com/', l.path, sessL);
            const cont = baseCont * (0.7 + 0.6 * unit(site.key, 'cont', l.path));
            const next = pages.filter(p => p.path !== l.path)
                .map(p => ({ p, w: p.views * (0.15 + 3 * unit(site.key, 'link', l.path, p.path) ** 2) }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 6);
            const sum = next.reduce((a, x) => a + x.w, 0) || 1;
            for (const x of next) push(l.path, `${origin}${l.path}`, x.p.path, sessL * cont * (x.w / sum));
        }
    }
    sortRows(out, dims, mets, request.orderBys, ranges.length > 1);
    const limit = Math.min(250_000, Math.max(1, Number(request.limit) || 10_000));
    const metricHeaders = mets.map(name => ({ name, type: metricDef(name).type }));
    const response: any = {
        dimensionHeaders: [...dims, ...(ranges.length > 1 ? ['dateRange'] : [])].map(name => ({ name })),
        metricHeaders,
        metadata: { currencyCode: site.ga!.currencyCode, timeZone: site.ga!.timeZone },
        kind: 'analyticsData#runReport',
    };
    const page = out.slice(0, limit);
    if (page.length) {
        response.rows = page.map(r => ({
            dimensionValues: r.dims.map(value => ({ value })),
            metricValues: r.values.map((v, i) => ({ value: formatMetric(metricHeaders[i].type, v) })),
        }));
        response.rowCount = out.length;
    }
    return response;
}

/** Aggregate components per output row (requested dimension values, plus dateRange when several ranges). */
function buildRows(site: DemoSite, dims: string[], dimensionFilter: any, ranges: ResolvedRange[], today: number): OutRow[] {
    const filterSet = filterFields(dimensionFilter);
    const timeDims = dims.filter(d => TIME_DIMS.has(d));
    const entDims = dims.filter(d => !TIME_DIMS.has(d));
    const timeFiltered = [...filterSet].some(f => TIME_DIMS.has(f));
    const needTime = timeDims.length > 0 || timeFiltered;
    const needHour = dims.some(d => HOUR_DIMS.has(d)) || [...filterSet].some(f => HOUR_DIMS.has(f));

    const groupNames = new Set<string>();
    for (const d of [...entDims, ...filterSet]) {
        if (TIME_DIMS.has(d)) continue;
        const g = DIMENSION_GROUP[d];
        if (g) groupNames.add(g);
    }
    // Pass 1: cross the groups and drop combinations the filter rules out.
    let combos = crossGroups(site, [...groupNames]);
    if (dimensionFilter) {
        combos = combos.filter(c => evalGaExpression(dimensionFilter, f => (TIME_DIMS.has(f) ? undefined : c.vals[f] ?? (DIMENSION_GROUP[f] ? undefined : '(not set)'))) !== false);
    }
    // Pass 2: merge combinations that share the requested dimension values. `un` keeps each range's
    // noise-weighted share (the fast path's scale), from the entities' noise.
    const merged = new Map<string, Combo & { key2: string; un: number[] }>();
    const rangeBounds = ranges.map(r => [r.start, r.end] as const);
    for (const c of combos) {
        const values = entDims.map(d => c.vals[d] ?? '(not set)');
        const k = values.join('\u0001');
        const un = needTime ? [] : rangeBounds.map(([rs, re]) => c.u * comboNoise(site, c, rs, re));
        const m = merged.get(k);
        if (!m) {
            merged.set(k, { ...c, vals: Object.fromEntries(entDims.map((d, i) => [d, values[i]])), key2: k, f: { ...c.f }, un });
        } else {
            const total = m.u + c.u || 1;
            m.f = {
                eng: (m.f.eng * m.u + c.f.eng * c.u) / total,
                dur: (m.f.dur * m.u + c.f.dur * c.u) / total,
                nu: (m.f.nu * m.u + c.f.nu * c.u) / total,
            };
            m.u += c.u; m.pv += c.pv; m.ev += c.ev; m.key += c.key; m.rev += c.rev;
            un.forEach((x, i) => { m.un[i] += x; });
        }
    }

    const { start: seriesStart, values } = dailySeries(site, today);
    const table = compTable(site, today);
    const windowStart = today - DEMO_HISTORY_DAYS + 1;
    const hours = needHour ? hourProfile(site) : null;
    const out = new Map<string, OutRow>();

    ranges.forEach((range, ri) => {
        const s = Math.max(range.start, windowStart);
        const e = Math.min(range.end, today);
        for (const row of merged.values()) {
            const rowNoiseKey = row.key2 || '';
            if (!needTime) {
                // Fast path: one bucket for the whole range.
                const days = e - s + 1;
                if (days <= 0) continue;
                const base = rangeComps(table, s, e);
                const scale = rowNoiseKey && row.u > 0 ? row.un[ri] / row.u : 1;
                const k = `${rowNoiseKey}\u0002${range.name}`;
                const acc = out.get(k) || { dims: [...entDims.map(d => row.vals[d]), ...(ranges.length > 1 ? [range.name] : [])], comps: emptyComps(), vals: row.vals };
                addScaled(acc.comps, base, row, scale);
                acc.comps.span += days;
                out.set(k, acc);
                continue;
            }
            for (let day = s; day <= e; day++) {
                const u = values[day - seriesStart];
                if (u <= 0) continue;
                const base = table.daily[day - table.start];
                const hourList = hours ? hours.map((share, h) => [h, share] as const) : [[null, 1] as const];
                for (const [hour, share] of hourList) {
                    const tv = timeValues(day, hour, range.start);
                    if (dimensionFilter && timeFiltered) {
                        const ok = evalGaExpression(dimensionFilter, f => tv[f] ?? row.vals[f]);
                        if (ok === false) continue;
                    }
                    const scale = share * (rowNoiseKey ? noise(0.13, site.key, rowNoiseKey, day, hour ?? '') : hour !== null ? noise(0.1, site.key, 'h', day, hour) : 1);
                    const dimValues = dims.map(d => (TIME_DIMS.has(d) ? tv[d] : row.vals[d]));
                    if (ranges.length > 1) dimValues.push(range.name);
                    const k = dimValues.join('\u0001');
                    let acc = out.get(k);
                    if (!acc) {
                        acc = { dims: dimValues, comps: emptyComps(), vals: row.vals };
                        out.set(k, acc);
                    }
                    addScaled(acc.comps, base, row, scale);
                    if (hour === null || hour === 0) acc.comps.span += 1;
                }
            }
        }
    });
    // A row that aggregates days (e.g. yearMonth) de-duplicates users; daily rows do not.
    for (const r of out.values()) {
        if (r.comps.span === 0) r.comps.span = 1;
        if (needHour) r.comps.span = 1;
    }
    return [...out.values()];
}

function sortRows(rows: Array<{ dims: string[]; values: number[] }>, dims: string[], mets: string[], orderBys: any[] | undefined, multiRange: boolean): void {
    const orders = (orderBys || []).map(o => {
        if (o.metric?.metricName) return { kind: 'metric' as const, idx: mets.indexOf(o.metric.metricName), desc: Boolean(o.desc), numeric: true };
        if (o.dimension?.dimensionName) return { kind: 'dim' as const, idx: dims.indexOf(o.dimension.dimensionName), desc: Boolean(o.desc), numeric: o.dimension.orderType === 'NUMERIC' };
        return null;
    }).filter((o): o is NonNullable<typeof o> => !!o && o.idx >= 0);
    if (!orders.length) {
        const timeIdx = dims.map((d, i) => (TIME_DIMS.has(d) ? i : -1)).filter(i => i >= 0);
        if (timeIdx.length) {
            orders.push(...timeIdx.map(idx => ({ kind: 'dim' as const, idx, desc: false, numeric: false })));
            if (mets.length) orders.push({ kind: 'metric', idx: 0, desc: true, numeric: true });
        } else if (mets.length) {
            orders.push({ kind: 'metric', idx: 0, desc: true, numeric: true });
        }
    }
    rows.sort((a, b) => {
        for (const o of orders) {
            let cmp: number;
            if (o.kind === 'metric') cmp = a.values[o.idx] - b.values[o.idx];
            else if (o.numeric) cmp = Number(a.dims[o.idx]) - Number(b.dims[o.idx]);
            else cmp = a.dims[o.idx] < b.dims[o.idx] ? -1 : a.dims[o.idx] > b.dims[o.idx] ? 1 : 0;
            if (cmp !== 0) return o.desc ? -cmp : cmp;
        }
        if (multiRange) {
            const ra = a.dims[a.dims.length - 1];
            const rb = b.dims[b.dims.length - 1];
            return ra < rb ? -1 : ra > rb ? 1 : 0;
        }
        return 0;
    });
}

// ─── Cohorts ───

function cohortReport(site: DemoSite, request: GaReportRequest, today: number): any {
    const dims = (request.dimensions || []).map(d => d.name);
    const mets = (request.metrics || []).map(m => m.name);
    const spec = request.cohortSpec || {};
    const granularity: string = spec.cohortsRange?.granularity || 'DAILY';
    const periodDays = granularity === 'WEEKLY' ? 7 : granularity === 'MONTHLY' ? 30 : 1;
    const startOffset = Number(spec.cohortsRange?.startOffset) || 0;
    const endOffset = Number(spec.cohortsRange?.endOffset ?? 5);
    const r1 = siteRates(site).day1Retention * (granularity === 'WEEKLY' ? 1.5 : granularity === 'MONTHLY' ? 1.9 : 1);
    const { start: seriesStart, values } = dailySeries(site, today);
    const newShare = siteRates(site).newUserShare;

    const rows: Array<{ dims: string[]; values: number[] }> = [];
    (spec.cohorts || []).forEach((cohort: any, i: number) => {
        const cs = parseDateToken(cohort.dateRange?.startDate, today);
        const ce = parseDateToken(cohort.dateRange?.endDate, today);
        if (cs === null || ce === null) return;
        let total = 0;
        for (let d = cs; d <= Math.min(ce, today); d++) {
            const v = values[d - seriesStart];
            if (v > 0) total += v * newShare;
        }
        total = Math.round(total);
        if (total <= 0) return;
        for (let n = startOffset; n <= endOffset; n++) {
            if (cs + n * periodDays > today) break;
            const retention = n === 0 ? 1 : Math.min(1, r1 * Math.pow(n, -0.42) * noise(0.15, site.key, 'coh', cs, n));
            const active = Math.round(total * retention);
            const dimValues = dims.map(d => {
                if (d === 'cohort') return cohort.name || `cohort_${i}`;
                if (d === 'cohortNthDay' || d === 'cohortNthWeek' || d === 'cohortNthMonth') return pad(n, 4);
                if (d === 'firstSessionDate') return dayToCompact(cs);
                return '(not set)';
            });
            rows.push({
                dims: dimValues,
                values: mets.map(m => (m === 'cohortActiveUsers' ? active : m === 'cohortTotalUsers' ? total : m === 'userEngagementDuration' ? active * 95 : 0)),
            });
        }
    });
    return {
        dimensionHeaders: dims.map(name => ({ name })),
        metricHeaders: mets.map(name => ({ name, type: 'TYPE_INTEGER' })),
        ...(rows.length ? { rows: rows.map(r => ({ dimensionValues: r.dims.map(value => ({ value })), metricValues: r.values.map(v => ({ value: String(v) })) })), rowCount: rows.length } : {}),
        metadata: { currencyCode: site.ga?.currencyCode || 'USD', timeZone: site.ga?.timeZone || 'UTC' },
        kind: 'analyticsData#runReport',
    };
}

// ─── Realtime ───

/** Expected active users in the last 30 minutes. Changes every minute. */
export function realtimeActiveUsers(site: DemoSite, now: number = Date.now()): number {
    const today = todayIndex(now);
    const { start, values } = dailySeries(site, today);
    let week = 0;
    for (let d = today - 7; d < today; d++) week += values[d - start] || 0;
    const daily = week / 7;
    const hour = new Date(now).getUTCHours();
    const profile = hourProfile(site);
    const perThirty = daily * profile[hour] * 0.5 * 1.1; // half an hour of the hourly share; users linger a little
    const minute = Math.floor(now / 60_000);
    const v = perThirty * noise(0.18, site.key, 'rt', minute);
    // Dithered rounding so tiny sites sometimes show 1 visitor.
    return Math.floor(v + unit(site.key, 'rt-dither', minute));
}

export function demoRunRealtimeReport(propertyId: string, request: GaReportRequest, opts: DemoRunOptions = {}): any {
    const site = findSiteByPropertyId(propertyId);
    if (!site || !site.ga) {
        throw new DemoApiError(403, 'PERMISSION_DENIED', `User does not have sufficient permissions for this property (${propertyId}).`);
    }
    const now = opts.now ?? Date.now();
    const minute = Math.floor(now / 60_000);
    const dims = (request.dimensions || []).map(d => d.name);
    const mets = (request.metrics || []).map(m => m.name);
    const total = realtimeActiveUsers(site, now);
    const rates = siteRates(site);

    const groupNames = new Set<string>();
    for (const d of [...dims, ...filterFields(request.dimensionFilter)]) {
        const g = DIMENSION_GROUP[d];
        if (g) groupNames.add(g);
    }
    let combos = crossGroups(site, [...groupNames]);
    if (request.dimensionFilter) {
        combos = combos.filter(c => evalGaExpression(request.dimensionFilter, f => (f === 'minutesAgo' ? undefined : c.vals[f] ?? '(not set)')) !== false);
    }
    const minuteDim = dims.includes('minutesAgo');
    const rows = new Map<string, { dims: string[]; u: number; pv: number; ev: number; key: number }>();
    for (const c of combos) {
        const minutes = minuteDim ? Array.from({ length: 30 }, (_, i) => i) : [null];
        for (const m of minutes) {
            const dimValues = dims.map(d => (d === 'minutesAgo' ? pad(m ?? 0) : c.vals[d] ?? '(not set)'));
            const k = dimValues.join('\u0001');
            const share = m === null ? 1 : 0.16 * noise(0.4, site.key, 'rtm', minute - m);
            const acc = rows.get(k) || { dims: dimValues, u: 0, pv: 0, ev: 0, key: 0 };
            acc.u += total * c.u * share;
            acc.pv += total * rates.pagesPerSession * 0.8 * c.pv * share;
            acc.ev += total * rates.pagesPerSession * rates.eventsPerPageview * 0.8 * c.ev * share;
            acc.key += total * rates.keyEventRate * 1.3 * c.key * share;
            rows.set(k, acc);
        }
    }
    const dither = (v: number, k: string, field: string) => Math.floor(v + unit(site.key, 'rtd', k, field, minute));
    let out = [...rows.values()].map(r => {
        const k = r.dims.join('|');
        const u = dims.length ? dither(r.u, k, 'u') : total;
        const values = mets.map(m => {
            if (m === 'activeUsers') return u;
            if (m === 'screenPageViews' || m === 'views') return u > 0 ? Math.max(u, dither(r.pv, k, 'pv')) : 0;
            if (m === 'eventCount') return u > 0 ? Math.max(u, dither(r.ev, k, 'ev')) : 0;
            if (m === 'keyEvents' || m === 'conversions') return dither(r.key, k, 'key');
            return 0;
        });
        return { dims: r.dims, values };
    }).filter(r => r.values.some(v => v > 0));
    if (request.metricFilter) {
        out = out.filter(r => evalGaExpression(request.metricFilter, f => {
            const i = mets.indexOf(f);
            return i >= 0 ? r.values[i] : undefined;
        }) !== false);
    }
    sortRows(out, dims, mets, request.orderBys, false);
    if (minuteDim && !request.orderBys?.length) out.sort((a, b) => a.dims[dims.indexOf('minutesAgo')].localeCompare(b.dims[dims.indexOf('minutesAgo')]));
    const limit = Math.max(1, Number(request.limit) || 10_000);
    const page = out.slice(0, limit);
    return {
        dimensionHeaders: dims.map(name => ({ name })),
        metricHeaders: mets.map(name => ({ name, type: 'TYPE_INTEGER' })),
        ...(page.length ? { rows: page.map(r => ({ dimensionValues: r.dims.map(value => ({ value })), metricValues: r.values.map(v => ({ value: String(v) })) })), rowCount: out.length } : {}),
        kind: 'analyticsData#runRealtimeReport',
    };
}

// ─── Metadata ───

export function demoMetadata(propertyId: string): any {
    const site = findSiteByPropertyId(propertyId);
    if (!site || !site.ga) throw new DemoApiError(403, 'PERMISSION_DENIED', `No access to ${propertyId}`);
    const digits = /(\d+)/.exec(propertyId)?.[1];
    const label = (api: string) => api.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const dimensions = [...Object.keys(DIMENSION_GROUP), ...TIME_DIMS].map(apiName => ({ apiName, uiName: label(apiName), description: `${label(apiName)} (demo)`, category: DIMENSION_GROUP[apiName] || 'Time' }));
    dimensions.push(
        { apiName: 'customEvent:plan_type', uiName: 'Plan type', description: 'Subscription plan sent with sign_up', category: 'Custom', customDefinition: true } as any,
        { apiName: 'customUser:account_tier', uiName: 'Account tier', description: 'User-scoped account tier', category: 'Custom', customDefinition: true } as any,
    );
    const metrics: any[] = Object.entries(METRICS).map(([apiName, def]) => ({ apiName, uiName: label(apiName), description: `${label(apiName)} (demo)`, type: def.type, category: 'Standard' }));
    metrics.push({ apiName: 'customEvent:order_value', uiName: 'Order value', description: 'Value parameter on purchase', type: 'TYPE_CURRENCY', category: 'Custom', customDefinition: true });
    return { name: `properties/${digits}/metadata`, dimensions, metrics };
}
