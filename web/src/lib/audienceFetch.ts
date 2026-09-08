/**
 * Audience intelligence collector for the leaderboard refresh cron.
 *
 * Pulls 28-day GA4 dimension breakdowns, GSC top queries and Gemini-labelled
 * topics for one verified entry and shapes them into `AudienceUpsertBody`
 * (see audienceTypes.ts — the frozen contract). Everything is best-effort:
 * each section fails independently and is *omitted* from the body on a
 * transient error (the admin API only writes keys that are present), and set
 * to `null` only when the source is definitively unavailable.
 *
 * The pure shaping helpers are exported so they can be unit-tested without
 * network access. Nothing here feeds ad-slot pricing.
 */

import type {
    AudienceCountry,
    AudienceDemographics,
    AudiencePage,
    AudienceQuery,
    AudienceShare,
    AudienceTopic,
    AudienceUpsertBody,
} from './audienceTypes';
import { listSearchConsoleSites, runGSCQuery } from './googleApi';
import {
    getGoogleGenAIClient,
    getGoogleGenAIText,
    GOOGLE_GENAI_LIGHT_MODEL,
    GOOGLE_GENAI_THINKING_DISABLED,
} from './googleGenAi';

const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const GA_TIMEOUT_MS = 15000;
const GSC_TIMEOUT_MS = 15000;
const GEMINI_TIMEOUT_MS = 20000;
const DATA_WINDOW = '28d';

/** Dimension values GA4 emits when it has no real value. Never shown to readers. */
const PLACEHOLDER_VALUES = new Set(['(not set)', '(other)', 'unknown', '(not provided)', '']);

// ─── Types ────────────────────────────────────────────────────────────────

export interface GA4Row {
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
}

export interface GA4Report {
    rows?: GA4Row[];
    totals?: GA4Row[];
    rowCount?: number;
}

/** A single dimension row reduced to what the shaping helpers need. */
export interface ShareRow {
    name: string;
    value: number;
    iso2?: string;
}

export interface ShapeSharesOptions {
    /** Denominator for shares. Defaults to the sum of the (non-placeholder) rows. */
    total?: number;
    /** Keep at most this many named rows (before any "Other" bucket). */
    top?: number;
    /** Drop rows whose share is below this percentage. */
    minShare?: number;
    /** Append an `{ name: "Other" }` row for the remainder of `total` not covered by kept rows. */
    otherBucket?: boolean;
}

export interface PageRow {
    path: string;
    views: number;
}

export interface GscSiteEntry {
    siteUrl: string;
    permissionLevel?: string;
}

interface GscQueryRow {
    keys?: string[];
    clicks?: number;
    impressions?: number;
}

export interface CollectAudienceOptions {
    token: string;
    gaPropertyId: string;
    websiteUrl: string | null;
}

// ─── Small utilities ──────────────────────────────────────────────────────

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function isPlaceholder(name: string): boolean {
    return PLACEHOLDER_VALUES.has(name.trim().toLowerCase());
}

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

function fmtDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

function hostFromUrl(websiteUrl: string | null): string | null {
    if (!websiteUrl) return null;
    const raw = websiteUrl.trim();
    if (!raw) return null;
    try {
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
        const host = new URL(withScheme).hostname.toLowerCase();
        return host || null;
    } catch {
        return null;
    }
}

function normalizeSiteUrl(siteUrl: string): string {
    const s = siteUrl.trim().toLowerCase();
    if (s.startsWith('sc-domain:')) return s;
    return s.endsWith('/') ? s : `${s}/`;
}

// ─── Pure shaping helpers ─────────────────────────────────────────────────

/**
 * Turn dimension rows into `{ name, share }` entries sorted by share desc.
 * Placeholder rows ("(not set)", "unknown", …) are always removed; when an
 * explicit `total` is supplied they fall into the "Other" bucket (if enabled),
 * otherwise shares are renormalised over the remaining rows.
 */
export function shapeShares(rows: ShareRow[], opts: ShapeSharesOptions = {}): AudienceCountry[] {
    const clean = rows
        .filter((r) => r.name && !isPlaceholder(r.name) && Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value);

    const total = opts.total !== undefined && opts.total > 0
        ? opts.total
        : clean.reduce((sum, r) => sum + r.value, 0);
    if (total <= 0 || clean.length === 0) return [];

    const kept = opts.top !== undefined ? clean.slice(0, opts.top) : clean;
    const out: AudienceCountry[] = [];
    for (const r of kept) {
        const share = round1((r.value / total) * 100);
        if (opts.minShare !== undefined && share < opts.minShare) continue;
        const item: AudienceCountry = { name: r.name, share };
        if (r.iso2) item.iso2 = r.iso2;
        out.push(item);
    }

    if (opts.otherBucket) {
        const covered = kept.reduce((sum, r) => sum + r.value, 0);
        const remainder = total - covered;
        if (remainder > 0) {
            const share = round1((remainder / total) * 100);
            if (share > 0) out.push({ name: 'Other', share });
        }
    }

    return out;
}

/** Top pages with share of total pageviews. `total` defaults to the sum of the given rows. */
export function shapePages(rows: PageRow[], total?: number, top = 8): AudiencePage[] {
    const clean = rows
        .filter((r) => r.path && !isPlaceholder(r.path) && Number.isFinite(r.views) && r.views > 0)
        .sort((a, b) => b.views - a.views)
        .slice(0, top);
    const denom = total !== undefined && total > 0
        ? total
        : clean.reduce((sum, r) => sum + r.views, 0);
    if (denom <= 0) return [];
    return clean.map((r) => ({
        path: r.path,
        views: Math.round(r.views),
        share: round1((r.views / denom) * 100),
    }));
}

/**
 * Choose the GSC property that represents `websiteUrl`. Domain properties win
 * over URL-prefix properties; a leading "www." is treated as interchangeable.
 * Sites the user has not verified are ignored. Returns the site's `siteUrl` as
 * GSC spells it, or null when nothing matches.
 */
export function pickGscSite(sites: GscSiteEntry[], websiteUrl: string | null): string | null {
    const host = hostFromUrl(websiteUrl);
    if (!host) return null;
    const bare = host.replace(/^www\./, '');
    const www = `www.${bare}`;

    const candidates: string[] = [];
    const push = (s: string) => { if (!candidates.includes(s)) candidates.push(s); };
    push(`sc-domain:${host}`);
    push(`sc-domain:${bare}`);
    for (const scheme of ['https', 'http']) {
        push(`${scheme}://${host}/`);
        push(`${scheme}://${www}/`);
        push(`${scheme}://${bare}/`);
    }

    const usable = new Map<string, string>();
    for (const site of sites) {
        if (!site?.siteUrl) continue;
        if (site.permissionLevel === 'siteUnverifiedUser') continue;
        usable.set(normalizeSiteUrl(site.siteUrl), site.siteUrl);
    }

    for (const c of candidates) {
        const hit = usable.get(normalizeSiteUrl(c));
        if (hit) return hit;
    }
    return null;
}

/** GSC data lags ~2–3 days; end two days ago and cover 28 days inclusive. */
export function gscDateWindow(now: Date = new Date()): { startDate: string; endDate: string } {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 2);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

/** Largest-remainder rounding so integer shares sum to exactly 100. */
function renormalizeToHundred(values: number[]): number[] {
    const sum = values.reduce((s, v) => s + v, 0);
    const n = values.length;
    if (n === 0) return [];
    const scaled = sum > 0 ? values.map((v) => (v / sum) * 100) : values.map(() => 100 / n);
    const floors = scaled.map((v) => Math.floor(v));
    let remainder = 100 - floors.reduce((s, v) => s + v, 0);
    const order = scaled
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac);
    for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
        floors[order[k].i] += 1;
    }
    return floors;
}

/**
 * Parse Gemini's topics reply defensively. Strips code fences, validates the
 * shape, keeps 3–6 topics, renormalises integer shares to sum to 100 and drops
 * evidence strings that aren't verbatim from `allowedEvidence`.
 * Returns null when the reply is unusable.
 */
export function parseTopicsJson(text: string, allowedEvidence: string[]): AudienceTopic[] | null {
    if (!text) return null;
    let body = text.trim();
    body = body.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    body = body.slice(first, last + 1);

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    const topicsRaw = (parsed as { topics?: unknown })?.topics;
    if (!Array.isArray(topicsRaw)) return null;

    const allowed = new Set(allowedEvidence.map((s) => s.trim()));
    const topics: AudienceTopic[] = [];
    for (const item of topicsRaw) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const label = typeof rec.label === 'string' ? rec.label.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        if (!label) continue;
        const shareNum = typeof rec.share === 'number' ? rec.share : Number(rec.share);
        const share = Number.isFinite(shareNum) && shareNum > 0 ? shareNum : 0;
        const evidence = Array.isArray(rec.evidence)
            ? rec.evidence
                .filter((e): e is string => typeof e === 'string')
                .map((e) => e.trim())
                .filter((e) => allowed.has(e))
                .filter((e, i, arr) => arr.indexOf(e) === i)
                .slice(0, 4)
            : [];
        topics.push({ label, share, evidence });
    }

    topics.sort((a, b) => b.share - a.share);
    const clamped = topics.slice(0, 6);
    if (clamped.length < 3) return null;

    const shares = renormalizeToHundred(clamped.map((t) => t.share));
    return clamped.map((t, i) => ({ ...t, share: shares[i] }));
}

/** One-line summary for the cron log. */
export function summarizeAudienceForLog(body: Partial<AudienceUpsertBody>): string {
    const count = (arr: unknown): string => {
        if (arr === undefined) return '-';
        if (arr === null) return 'null';
        return Array.isArray(arr) ? String(arr.length) : '?';
    };
    const demo = body.demographics === undefined
        ? '-'
        : body.demographics === null
            ? 'null'
            : `${body.demographics.age ? 'age' : ''}${body.demographics.age && body.demographics.gender ? '+' : ''}${body.demographics.gender ? 'gender' : ''}` || 'null';
    return [
        `countries=${count(body.countries)}`,
        `channels=${count(body.channels)}`,
        `devices=${count(body.devices)}`,
        `pages=${count(body.top_pages)}`,
        `cities=${count(body.cities)}`,
        `queries=${count(body.top_queries)}`,
        `topics=${count(body.topics)}`,
        `demo=${demo}`,
        `gsc=${body.gsc_site_url === undefined ? '-' : body.gsc_site_url ?? 'null'}`,
    ].join(' ');
}

// ─── GA4 fetching ─────────────────────────────────────────────────────────

interface DimensionReportSpec {
    dimensions: string[];
    metric: string;
    limit: number;
    orderByMetric?: boolean;
}

async function runDimensionReport(token: string, pid: string, spec: DimensionReportSpec): Promise<GA4Report> {
    const res = await fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
            dimensions: spec.dimensions.map((name) => ({ name })),
            metrics: [{ name: spec.metric }],
            metricAggregations: ['TOTAL'],
            orderBys: spec.orderByMetric === false
                ? undefined
                : [{ metric: { metricName: spec.metric }, desc: true }],
            limit: spec.limit,
        }),
        signal: AbortSignal.timeout(GA_TIMEOUT_MS),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`GA4 ${spec.dimensions.join(',')} report failed ${res.status}: ${err.slice(0, 200)}`);
    }
    return (await res.json()) as GA4Report;
}

function reportTotal(report: GA4Report): number | undefined {
    const raw = report.totals?.[0]?.metricValues?.[0]?.value;
    if (raw === undefined) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toShareRows(report: GA4Report, iso2Index?: number): ShareRow[] {
    return (report.rows || []).map((r) => {
        const row: ShareRow = {
            name: r.dimensionValues?.[0]?.value ?? '',
            value: parseFloat(r.metricValues?.[0]?.value ?? '0') || 0,
        };
        if (iso2Index !== undefined) {
            const iso2 = r.dimensionValues?.[iso2Index]?.value;
            if (iso2 && /^[A-Z]{2}$/.test(iso2)) row.iso2 = iso2;
        }
        return row;
    });
}

async function fetchCountries(token: string, pid: string): Promise<AudienceCountry[]> {
    const report = await runDimensionReport(token, pid, {
        dimensions: ['country', 'countryId'],
        metric: 'activeUsers',
        limit: 50,
    });
    return shapeShares(toShareRows(report, 1), { total: reportTotal(report), top: 6, otherBucket: true });
}

async function fetchChannels(token: string, pid: string): Promise<AudienceShare[]> {
    const report = await runDimensionReport(token, pid, {
        dimensions: ['sessionDefaultChannelGroup'],
        metric: 'sessions',
        limit: 50,
    });
    return shapeShares(toShareRows(report), { total: reportTotal(report), minShare: 0.5 }).slice(0, 8);
}

async function fetchDevices(token: string, pid: string): Promise<AudienceShare[]> {
    const report = await runDimensionReport(token, pid, {
        dimensions: ['deviceCategory'],
        metric: 'activeUsers',
        limit: 10,
    });
    // GA4 reports "smart tv" etc. at 0.0% for most sites; a row that rounds to zero is noise.
    return shapeShares(toShareRows(report), { total: reportTotal(report), minShare: 0.1 });
}

async function fetchTopPages(token: string, pid: string): Promise<AudiencePage[]> {
    const report = await runDimensionReport(token, pid, {
        dimensions: ['pagePath'],
        metric: 'screenPageViews',
        limit: 8,
    });
    const rows: PageRow[] = (report.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value ?? '',
        views: parseFloat(r.metricValues?.[0]?.value ?? '0') || 0,
    }));
    return shapePages(rows, reportTotal(report), 8);
}

async function fetchCities(token: string, pid: string): Promise<AudienceShare[]> {
    const report = await runDimensionReport(token, pid, {
        dimensions: ['city'],
        metric: 'activeUsers',
        limit: 6,
    });
    return shapeShares(toShareRows(report), { total: reportTotal(report), top: 5 });
}

/** Demographics are thresholded / need Google Signals: any failure or empty result → null. */
async function fetchDemographicHalf(token: string, pid: string, dimension: string): Promise<AudienceShare[] | null> {
    try {
        const report = await runDimensionReport(token, pid, { dimensions: [dimension], metric: 'activeUsers', limit: 20 });
        const shaped = shapeShares(toShareRows(report));
        return shaped.length > 0 ? shaped : null;
    } catch {
        return null;
    }
}

// ─── GSC fetching ─────────────────────────────────────────────────────────

interface GscResult {
    siteUrl: string | null;
    /** undefined = query failed transiently (omit); null = no property (definitive). */
    queries: AudienceQuery[] | null | undefined;
}

async function fetchGscQueries(token: string, websiteUrl: string | null): Promise<GscResult> {
    const sites = (await listSearchConsoleSites(token, AbortSignal.timeout(GSC_TIMEOUT_MS))) as GscSiteEntry[];
    const siteUrl = pickGscSite(sites, websiteUrl);
    if (!siteUrl) return { siteUrl: null, queries: null };

    try {
        const { startDate, endDate } = gscDateWindow();
        const data = (await runGSCQuery(
            token,
            siteUrl,
            ['query'],
            startDate,
            endDate,
            20,
            AbortSignal.timeout(GSC_TIMEOUT_MS),
        )) as { rows?: GscQueryRow[] };
        const queries: AudienceQuery[] = (data.rows || [])
            .map((r) => ({
                query: r.keys?.[0] ?? '',
                clicks: Math.round(r.clicks ?? 0),
                impressions: Math.round(r.impressions ?? 0),
            }))
            .filter((q) => q.query)
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 20);
        return { siteUrl, queries };
    } catch (err) {
        console.warn(`[AUDIENCE] GSC query failed for ${siteUrl}:`, err);
        return { siteUrl, queries: undefined };
    }
}

// ─── Topics via Gemini ────────────────────────────────────────────────────

function buildTopicsPrompt(
    websiteUrl: string | null,
    queries: AudienceQuery[],
    pages: AudiencePage[],
): string {
    const host = hostFromUrl(websiteUrl) ?? 'unknown site';
    const queryLines = queries.map((q) => `- "${q.query}" (${q.clicks} clicks)`).join('\n');
    const pageLines = pages.map((p) => `- "${p.path}" (${p.views} views)`).join('\n');
    return [
        `You label the audience of a website for a sponsor who is deciding whether the readers are a fit.`,
        `Site: ${host}${websiteUrl ? ` (${websiteUrl})` : ''}`,
        ``,
        `Top search queries that bring visitors (last 28 days):`,
        queryLines || '- (none)',
        ``,
        `Top page paths by views (last 28 days):`,
        pageLines || '- (none)',
        ``,
        `Group what these visitors are interested in into 3 to 6 topics.`,
        `Rules:`,
        `- "label": at most 4 words, plain audience vocabulary (e.g. "SEO tooling", "Indie game dev"), no marketing fluff.`,
        `- "share": integer percentage of search-driven visits; all shares must sum to exactly 100.`,
        `- "evidence": 2 to 4 strings copied VERBATIM from the queries or page paths above (no edits, no new strings).`,
        `Return STRICT JSON only, no prose, no code fences, exactly this shape:`,
        `{"topics":[{"label":string,"share":number,"evidence":string[]}]}`,
    ].join('\n');
}

async function fetchTopics(
    websiteUrl: string | null,
    queries: AudienceQuery[],
    pages: AudiencePage[],
): Promise<AudienceTopic[] | undefined> {
    const client = getGoogleGenAIClient();
    if (!client) return undefined;
    if (queries.length < 3 && pages.length < 3) return undefined;

    try {
        const response = await client.models.generateContent({
            model: GOOGLE_GENAI_LIGHT_MODEL,
            contents: buildTopicsPrompt(websiteUrl, queries, pages),
            config: {
                temperature: 0.2,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
                thinkingConfig: GOOGLE_GENAI_THINKING_DISABLED,
                httpOptions: { timeout: GEMINI_TIMEOUT_MS },
            },
        });
        const text = getGoogleGenAIText(response);
        const allowed = [...queries.map((q) => q.query), ...pages.map((p) => p.path)];
        return parseTopicsJson(text, allowed) ?? undefined;
    } catch (err) {
        console.warn('[AUDIENCE] Gemini topics failed:', err);
        return undefined;
    }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

function settled<T>(result: PromiseSettledResult<T>, label: string): T | undefined {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[AUDIENCE] ${label} failed:`, result.reason);
    return undefined;
}

/**
 * Collect every audience section for one entry. Sections that fail
 * transiently are omitted from the returned body so the admin upsert leaves
 * the previous value untouched; sections that are definitively unavailable
 * are `null`.
 */
export async function collectAudience(opts: CollectAudienceOptions): Promise<AudienceUpsertBody> {
    const { token, websiteUrl } = opts;
    const pid = cleanPropertyId(opts.gaPropertyId);

    const [countriesR, channelsR, devicesR, pagesR, citiesR, ageR, genderR, gscR] = await Promise.allSettled([
        fetchCountries(token, pid),
        fetchChannels(token, pid),
        fetchDevices(token, pid),
        fetchTopPages(token, pid),
        fetchCities(token, pid),
        fetchDemographicHalf(token, pid, 'userAgeBracket'),
        fetchDemographicHalf(token, pid, 'userGender'),
        fetchGscQueries(token, websiteUrl),
    ]);

    const countries = settled(countriesR, 'countries');
    const channels = settled(channelsR, 'channels');
    const devices = settled(devicesR, 'devices');
    const topPages = settled(pagesR, 'top_pages');
    const cities = settled(citiesR, 'cities');
    const age = settled(ageR, 'demographics.age') ?? null;
    const gender = settled(genderR, 'demographics.gender') ?? null;
    const gsc = settled(gscR, 'gsc');

    const demographics: AudienceDemographics | null = age || gender ? { age, gender } : null;

    const topics = await fetchTopics(websiteUrl, gsc?.queries ?? [], topPages ?? []);

    // Keys are only added when we have a value to write; the admin API performs
    // a partial upsert and leaves absent keys untouched.
    const body: AudienceUpsertBody = { data_window: DATA_WINDOW, demographics };
    if (countries !== undefined) body.countries = countries;
    if (channels !== undefined) body.channels = channels;
    if (devices !== undefined) body.devices = devices;
    if (topPages !== undefined) body.top_pages = topPages;
    if (cities !== undefined) body.cities = cities;
    if (gsc !== undefined) {
        body.gsc_site_url = gsc.siteUrl;
        if (gsc.queries !== undefined) body.top_queries = gsc.queries;
    }
    if (topics !== undefined) body.topics = topics;

    return body;
}
