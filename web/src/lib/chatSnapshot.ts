/**
 * chatSnapshot.ts — server-side dashboard enrichment for the AI chat.
 *
 * The chat route already receives `seoContext` and `analyticsContext`
 * from the client (the compressed dashboard payload). This module:
 *
 *   1. Fetches additional GSC slices the dashboard never sends:
 *      - winners-losers (per-query WoW deltas, top 1000 queries)
 *      - cannibalization (query × page join)
 *      - mobile gap (query × device join)
 *
 *   2. Computes deterministic enrichments:
 *      - branded vs non-branded click split
 *      - brand inference from siteUrl
 *
 *   3. Calls insightEngine.detectTopInsights() to rank money moves
 *
 *   4. Fetches page-meta (current title/description/H1) for the
 *      top-3 insight pages so the LLM can say "your current title is
 *      X, change to Y" rather than "your title is too long".
 *
 *   5. Builds a dense, prompt-ready text block that REPLACES the old
 *      buildDataContext() output in route.ts.
 *
 * All extra fetches are cached for 5min per (userId, siteUrl) so
 * follow-up messages in the same thread are free.
 */
import { cachedFetch } from './apiCache';
import { detectTopInsights, inferSiteProfile, type RankedInsight, type SiteProfile, isBrandedQuery } from './insightEngine';
import { fetchPageMetaBatch, type PageMeta } from './pageMeta';
import { fetchRetentionCohorts, fetchJourneyData, runFlexibleGAReport } from './googleApi';
import { auditPagesSchemaBatch, aggregateSchemaCoverage, type SchemaAuditResult, type SchemaCoverage } from './dataSources/schemaAuditBatch';
import { fetchPsiBatch, type PsiResult } from './dataSources/psiBatch';

// Per-source cache TTLs prevent eviction storms when the snapshot mixes
// fast-rotating GSC data with slow-rotating schema/PSI data.
const TTL = {
    GSC_SHORT: 5 * 60 * 1000,        // winners-losers / cannibalization / mobile-gap — change WoW
    SCHEMA: 24 * 60 * 60 * 1000,     // schema-audit — schema rarely changes; daily refresh
    PSI: 6 * 60 * 60 * 1000,         // PageSpeed — slow + expensive; 6h refresh
    GA4_COHORT: 6 * 60 * 60 * 1000,  // cohort retention curves
    GA4_JOURNEY: 6 * 60 * 60 * 1000, // landing/exit/path patterns
    GA4_EVENTS: 6 * 60 * 60 * 1000,  // top events + key events
    GA4_GEO: 6 * 60 * 60 * 1000,     // geo conversion / engagement
    GA4_TIME: 6 * 60 * 60 * 1000,    // hour-of-day / day-of-week patterns
    PAGE_META: 5 * 60 * 1000,        // page title/desc/h1 — match GSC cadence
} as const;
const SNAPSHOT_TTL_MS = TTL.GSC_SHORT;

export interface EnrichedSnapshot {
    seo: any;
    analytics: any;
    winnersLosers: WinnersLosersData | null;
    cannibalization: CannibalizationData | null;
    mobileGap: MobileGapData | null;
    brandedSplit: BrandedSplit | null;
    insights: RankedInsight[];
    pageMeta: Map<string, PageMeta>;
    /** Per-page schema audit results (top money pages), keyed by URL. */
    schemaAuditPerPage: Map<string, SchemaAuditResult>;
    /** Site-level schema coverage aggregated across audited pages. */
    schemaCoverage: (SchemaCoverage & { totalErrors: number; pagesAudited: number; pagesFetched: number }) | null;
    /** PSI/CWV results for top money pages, keyed by `${strategy}:${url}`. */
    psi: Map<string, PsiResult>;
    /** GA4 cohort retention (day-1, day-7, day-30 averages + curves). */
    cohortRetention: { averages: { day1: number; day7: number; day14: number; day30: number }; curve: any[]; cohorts: any[] } | null;
    /** GA4 journey data (landing pages, exit pages, top paths). */
    journey: { landingPages: any[]; exitPages: any[]; journeys: any[]; totalSessions: number; avgPathLength: number; avgBounce: number } | null;
    /** Top GA4 events (with counts), and which ones are marked conversions. */
    events: { topEvents: Array<{ name: string; count: number; isKey: boolean }>; conversionEvents: string[]; totalEventCount: number } | null;
    /** Geo conversion: top countries by sessions + by conversions (when available). */
    geoConversion: { byCountry: Array<{ country: string; sessions: number; conversions: number; conversionRate: number; engagement: number }> } | null;
    /** Time-of-day / day-of-week patterns. */
    timePatterns: { peakHour: number | null; peakDow: string | null; hourly: Array<{ hour: number; sessions: number }>; dow: Array<{ day: string; sessions: number }> } | null;
    /** Inferred brand string used for branded/unbranded split. Null = couldn't infer. */
    brand: string | null;
    /** Auto-detected site profile (commercial / content / mixed / unknown). Drives
     *  which strategic detectors apply and what the LLM should recommend. */
    siteProfile: SiteProfile;
    /** Insight IDs already surfaced in earlier turns of this thread (passed in by
     *  route.ts from chat thread state). Tools can hard-exclude these as a second
     *  guard beyond the ranker's soft demotion. */
    recentlySurfacedIds: string[];
    /** ISO timestamp the enrichment was computed. */
    computedAt: string;
}

interface WinnersLosersData {
    winners: any[];
    losers: any[];
    new: any[];
    lost: any[];
}

interface CannibalizationData {
    cannibalized: any[];
}

interface MobileGapData {
    data: any[];
}

interface BrandedSplit {
    brandedClicks: number;
    nonBrandedClicks: number;
    brandedPct: number;
    totalQueries: number;
    brandedQueries: number;
}

// ─── Helpers ───

/** Try every reasonable URL/sc-domain variant — the GSC property may be verified under any of them. */
async function gscQueryWithFallback(
    token: string,
    siteUrl: string,
    body: any,
): Promise<any> {
    const variants: string[] = [siteUrl];
    if (siteUrl.startsWith('sc-domain:')) {
        const domain = siteUrl.replace('sc-domain:', '');
        variants.push(`https://${domain}/`, `https://${domain}`);
    } else if (siteUrl.startsWith('http')) {
        const stripped = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        variants.push(`sc-domain:${stripped}`);
    }
    const unique = [...new Set(variants)];
    for (const v of unique) {
        try {
            const res = await fetch(
                `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(v)}/searchAnalytics/query`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(15000),
                },
            );
            if (!res.ok) continue;
            const data = await res.json();
            if (data?.rows?.length) return data;
        } catch { /* try next */ }
    }
    return { rows: [] };
}

/** Format a Date as YYYY-MM-DD. */
function fmt(d: Date): string {
    return d.toISOString().split('T')[0];
}

/** 28-day window ending yesterday + the prior 28-day window. */
function get28dWindows() {
    const now = new Date();
    const endDate = new Date(now); endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate); startDate.setDate(startDate.getDate() - 27);
    const compEnd = new Date(startDate); compEnd.setDate(compEnd.getDate() - 1);
    const compStart = new Date(compEnd); compStart.setDate(compStart.getDate() - 27);
    return { startDate, endDate, compStart, compEnd };
}

// ─── Fetchers ───

async function fetchWinnersLosers(token: string, siteUrl: string): Promise<WinnersLosersData> {
    const { startDate, endDate, compStart, compEnd } = get28dWindows();
    const body = (s: Date, e: Date) => ({
        startDate: fmt(s),
        endDate: fmt(e),
        dimensions: ['query'],
        rowLimit: 1000,
        type: 'web',
    });
    const [cur, prev] = await Promise.all([
        gscQueryWithFallback(token, siteUrl, body(startDate, endDate)),
        gscQueryWithFallback(token, siteUrl, body(compStart, compEnd)),
    ]);
    const curRows: any[] = cur?.rows || [];
    const prevRows: any[] = prev?.rows || [];
    const curMap = new Map<string, any>(curRows.map((r: any) => [r.keys[0], r]));
    const prevMap = new Map<string, any>(prevRows.map((r: any) => [r.keys[0], r]));

    const winners: any[] = [];
    const losers: any[] = [];
    const newQ: any[] = [];
    const lost: any[] = [];

    for (const [query, c] of curMap) {
        const p = prevMap.get(query);
        const curClicks = c.clicks || 0;
        const curPos = c.position || 0;
        const curImp = c.impressions || 0;
        const prevClicks = p?.clicks || 0;
        const prevPos = p?.position || 0;
        const clicksDelta = curClicks - prevClicks;
        const clicksDeltaPct = prevClicks > 0 ? +((clicksDelta / prevClicks) * 100).toFixed(1) : 0;
        const positionDelta = p ? +(curPos - prevPos).toFixed(1) : 0;
        const row = {
            query,
            clicksCurrent: curClicks,
            clicksPrevious: prevClicks,
            clicksDelta,
            clicksDeltaPct,
            positionCurrent: +curPos.toFixed(1),
            positionPrevious: +prevPos.toFixed(1),
            positionDelta,
            impressionsCurrent: curImp,
        };
        if (!p && curClicks >= 5) newQ.push(row);
        else if (p) {
            if (clicksDelta >= 5 && clicksDeltaPct >= 20) winners.push(row);
            else if (clicksDelta <= -5 && clicksDeltaPct <= -20) losers.push(row);
        }
    }
    for (const [query, p] of prevMap) {
        if (curMap.has(query)) continue;
        const prevClicks = p.clicks || 0;
        if (prevClicks < 5) continue;
        lost.push({
            query,
            clicksCurrent: 0,
            clicksPrevious: prevClicks,
            clicksDelta: -prevClicks,
            clicksDeltaPct: -100,
            positionCurrent: 0,
            positionPrevious: +(p.position || 0).toFixed(1),
            positionDelta: 0,
            impressionsCurrent: 0,
        });
    }

    winners.sort((a, b) => b.clicksDelta - a.clicksDelta);
    losers.sort((a, b) => a.clicksDelta - b.clicksDelta);
    newQ.sort((a, b) => b.clicksCurrent - a.clicksCurrent);
    lost.sort((a, b) => b.clicksPrevious - a.clicksPrevious);

    return {
        winners: winners.slice(0, 15),
        losers: losers.slice(0, 15),
        new: newQ.slice(0, 10),
        lost: lost.slice(0, 10),
    };
}

async function fetchCannibalization(token: string, siteUrl: string): Promise<CannibalizationData> {
    const { startDate, endDate } = get28dWindows();
    const data = await gscQueryWithFallback(token, siteUrl, {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query', 'page'],
        rowLimit: 5000,
        type: 'web',
    });
    const rows: any[] = data?.rows || [];

    const grouped = new Map<string, any[]>();
    for (const r of rows) {
        const query = r.keys[0];
        const page = r.keys[1];
        if (!grouped.has(query)) grouped.set(query, []);
        grouped.get(query)!.push({
            page,
            clicks: r.clicks || 0,
            impressions: r.impressions || 0,
            ctr: +((r.ctr || 0) * 100).toFixed(2),
            position: +(r.position || 0).toFixed(1),
        });
    }

    const cannibalized: any[] = [];
    for (const [query, pages] of grouped) {
        if (pages.length < 2) continue;
        const totalImp = pages.reduce((s, p) => s + p.impressions, 0);
        if (totalImp < 50) continue;
        const sortedPages = [...pages].sort((a, b) => b.impressions - a.impressions);
        if (sortedPages[0].impressions / totalImp > 0.85) continue; // dominated, not cannibalized
        const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
        const bestPosition = Math.min(...pages.map(p => p.position));
        const positions = pages.map(p => p.position).sort((a, b) => a - b);
        const positionSpread = positions.length > 1 ? positions[positions.length - 1] - positions[0] : 0;
        let severity: 'high' | 'medium' | 'low' = 'low';
        if (totalImp > 1000 && pages.length >= 3) severity = 'high';
        else if (totalImp > 200 && positionSpread < 5) severity = 'high';
        else if (totalImp > 50) severity = 'medium';
        cannibalized.push({
            query,
            pages: sortedPages,
            totalClicks,
            totalImpressions: totalImp,
            bestPosition,
            severity,
        });
    }

    const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
    cannibalized.sort((a, b) => (order[b.severity] - order[a.severity]) || (b.totalImpressions - a.totalImpressions));

    return { cannibalized: cannibalized.slice(0, 30) };
}

async function fetchMobileGap(token: string, siteUrl: string): Promise<MobileGapData> {
    const { startDate, endDate } = get28dWindows();
    const data = await gscQueryWithFallback(token, siteUrl, {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query', 'device'],
        rowLimit: 500,
        type: 'web',
    });
    const rows: any[] = data?.rows || [];

    const queryMap = new Map<string, { mobile?: any; desktop?: any }>();
    for (const r of rows) {
        const query = r.keys[0];
        const device = r.keys[1];
        if (device !== 'MOBILE' && device !== 'DESKTOP') continue;
        if (!queryMap.has(query)) queryMap.set(query, {});
        queryMap.get(query)![device.toLowerCase() as 'mobile' | 'desktop'] = {
            clicks: r.clicks || 0,
            impressions: r.impressions || 0,
            ctr: r.ctr || 0,
            position: r.position || 0,
        };
    }

    const out: any[] = [];
    for (const [query, devices] of queryMap) {
        if (!devices.mobile || !devices.desktop) continue;
        const gap = devices.desktop.position - devices.mobile.position; // negative = mobile worse
        const impact = devices.mobile.impressions * Math.abs(gap);
        out.push({
            query,
            mobilePosition: +devices.mobile.position.toFixed(1),
            desktopPosition: +devices.desktop.position.toFixed(1),
            mobileCtr: devices.mobile.ctr,
            desktopCtr: devices.desktop.ctr,
            mobileClicks: devices.mobile.clicks,
            desktopClicks: devices.desktop.clicks,
            mobileImpressions: devices.mobile.impressions,
            desktopImpressions: devices.desktop.impressions,
            gap: +gap.toFixed(1),
            impact: Math.round(impact),
        });
    }
    out.sort((a, b) => b.impact - a.impact);
    return { data: out.slice(0, 30) };
}

// ─── Brand inference ───

/** Infer the brand from a siteUrl. Strips TLD, common subdomains, and short noise. */
export function inferBrandFromSite(siteUrl: string): string | null {
    if (!siteUrl) return null;
    let host = siteUrl;
    if (host.startsWith('sc-domain:')) host = host.replace('sc-domain:', '');
    try { host = new URL(host.startsWith('http') ? host : `https://${host}`).hostname; }
    catch { /* fall back to raw */ }
    host = host.replace(/^www\./, '');
    const root = host.split('.')[0];
    if (!root || root.length < 3) return null;
    return root.toLowerCase();
}

function computeBrandedSplit(seoContext: any, brand: string | null): BrandedSplit | null {
    if (!brand) return null;
    const queries = seoContext?.queries || seoContext?.topQueries || [];
    if (!queries.length) return null;
    let brandedClicks = 0, nonBrandedClicks = 0, brandedQueries = 0;
    for (const q of queries) {
        const c = parseInt(q.clicks) || 0;
        if (isBrandedQuery(q.query, brand)) {
            brandedClicks += c;
            brandedQueries++;
        } else {
            nonBrandedClicks += c;
        }
    }
    const total = brandedClicks + nonBrandedClicks;
    return {
        brandedClicks,
        nonBrandedClicks,
        brandedPct: total > 0 ? +((brandedClicks / total) * 100).toFixed(1) : 0,
        totalQueries: queries.length,
        brandedQueries,
    };
}

// ─── URL helpers for page-meta fetch ───

function siteRoot(siteUrl: string): string {
    if (!siteUrl) return '';
    let host = siteUrl;
    if (host.startsWith('sc-domain:')) host = `https://${host.replace('sc-domain:', '')}`;
    if (!host.startsWith('http')) host = `https://${host}`;
    return host.replace(/\/$/, '');
}

function buildAbsoluteUrl(siteUrl: string, pageOrPath: string): string {
    if (!pageOrPath) return '';
    if (pageOrPath.startsWith('http')) return pageOrPath;
    const root = siteRoot(siteUrl);
    if (!root) return '';
    return pageOrPath.startsWith('/') ? `${root}${pageOrPath}` : `${root}/${pageOrPath}`;
}

// ─── Main entry ───

interface BuildArgs {
    userId: string;
    siteUrl: string;
    /** GA4 property ID — required for cohort/journey/events/geo/time data sources.
     *  When omitted, those sources are skipped silently (insights still work without them). */
    propertyId?: string;
    googleToken: string;
    seoContext: any;
    analyticsContext: any;
    /** When true, skip page-meta fetch (useful for low-cost intents like greetings). Default false. */
    skipPageMeta?: boolean;
    /** Insight IDs already surfaced in earlier turns of this thread.
     *  detectTopInsights demotes matching items by 70% of priority before sort. */
    recentlySurfacedIds?: string[];
    /** Optional callback invoked with each data source name BEFORE its fetch starts.
     *  route.ts uses this to emit SSE `source_loading` events so the UI can show
     *  per-source ghost chips ("Loading schema audit...") instead of generic spinner. */
    onSourceLoading?: (source: string) => void;
    /** Optional pre-computed deploy correlation. Computed in route.ts only when intent
     *  is DIAGNOSTIC or message includes regression keywords (gating saves GitHub quota). */
    deployCorrelation?: {
        hasCorrelation: boolean;
        matches: Array<{ query: string; positionPrevious: number; positionCurrent: number; clicksLost: number; suspectCommits: Array<{ sha: string; date: string; message: string; author: string; html_url: string }> }>;
        repo: string | null;
    } | null;
}

// ─── New GA4 fetchers (cohort, journey are reused from googleApi.ts; events / geo / time are simple flexible reports) ───

async function fetchEventsTop(token: string, propertyId: string): Promise<EnrichedSnapshot['events']> {
    try {
        const data = await runFlexibleGAReport(
            token, propertyId,
            ['eventName'],
            ['eventCount'],
            [{ startDate: '28daysAgo', endDate: 'today' }],
            { limit: 25 },
        );
        const rows = data?.rows || [];
        const totalEventCount = rows.reduce((s: number, r: any) => s + (parseInt(r.metricValues?.[0]?.value || '0') || 0), 0);
        const topEvents = rows.slice(0, 15).map((r: any) => {
            const name = r.dimensionValues?.[0]?.value || '';
            const count = parseInt(r.metricValues?.[0]?.value || '0') || 0;
            // Heuristic: events whose name matches conversion patterns are likely "key events"
            const isKey = /^(purchase|sign_up|generate_lead|begin_checkout|add_to_cart|conversion|key_event|signup|subscribe|contact)$/i.test(name);
            return { name, count, isKey };
        });
        const conversionEvents = topEvents.filter((e: { name: string; isKey: boolean }) => e.isKey).map((e: { name: string }) => e.name);
        return { topEvents, conversionEvents, totalEventCount };
    } catch {
        return null;
    }
}

async function fetchGeoConversion(token: string, propertyId: string): Promise<EnrichedSnapshot['geoConversion']> {
    try {
        const data = await runFlexibleGAReport(
            token, propertyId,
            ['country'],
            ['sessions', 'conversions', 'engagementRate'],
            [{ startDate: '28daysAgo', endDate: 'today' }],
            { limit: 20, orderBys: [{ field: 'sessions', type: 'metric', desc: true }] as any },
        );
        const rows = data?.rows || [];
        if (!rows.length) return null;
        const byCountry = rows.map((r: any) => {
            const country = r.dimensionValues?.[0]?.value || '';
            const sessions = parseInt(r.metricValues?.[0]?.value || '0') || 0;
            const conversions = parseInt(r.metricValues?.[1]?.value || '0') || 0;
            const engagement = parseFloat(r.metricValues?.[2]?.value || '0') || 0;
            const conversionRate = sessions > 0 ? +((conversions / sessions) * 100).toFixed(2) : 0;
            return { country, sessions, conversions, conversionRate, engagement: +(engagement * 100).toFixed(1) };
        });
        return { byCountry };
    } catch {
        return null;
    }
}

async function fetchTimePatterns(token: string, propertyId: string): Promise<EnrichedSnapshot['timePatterns']> {
    try {
        const [hourly, dow] = await Promise.all([
            runFlexibleGAReport(
                token, propertyId,
                ['hour'],
                ['sessions'],
                [{ startDate: '28daysAgo', endDate: 'today' }],
                { limit: 24, orderBys: [{ field: 'hour', type: 'dimension', desc: false }] as any },
            ),
            runFlexibleGAReport(
                token, propertyId,
                ['dayOfWeek'],
                ['sessions'],
                [{ startDate: '28daysAgo', endDate: 'today' }],
                { limit: 7, orderBys: [{ field: 'dayOfWeek', type: 'dimension', desc: false }] as any },
            ),
        ]);
        const hourlyRows: any[] = hourly?.rows || [];
        const dowRows: any[] = dow?.rows || [];
        const hourlyArr = hourlyRows.map((r: any) => ({
            hour: parseInt(r.dimensionValues?.[0]?.value || '0') || 0,
            sessions: parseInt(r.metricValues?.[0]?.value || '0') || 0,
        }));
        const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dowArr = dowRows.map((r: any) => {
            const idx = parseInt(r.dimensionValues?.[0]?.value || '0') || 0;
            return {
                day: DOW_LABELS[idx] || String(idx),
                sessions: parseInt(r.metricValues?.[0]?.value || '0') || 0,
            };
        });
        const peakHour = hourlyArr.length ? hourlyArr.reduce((best, h) => (h.sessions > best.sessions ? h : best), hourlyArr[0]).hour : null;
        const peakDow = dowArr.length ? dowArr.reduce((best, d) => (d.sessions > best.sessions ? d : best), dowArr[0]).day : null;
        return { peakHour, peakDow, hourly: hourlyArr, dow: dowArr };
    } catch {
        return null;
    }
}

/**
 * Build the enriched snapshot. Each data source has its OWN cache key with its
 * OWN TTL — GSC short-lived (5min), schema/PSI/cohort/journey/etc. medium-lived
 * (6-24h). This avoids eviction storms when the snapshot mixes fast-rotating
 * data with slow-rotating data.
 *
 * onSourceLoading callback is invoked once per source name BEFORE its fetch
 * starts so route.ts can emit SSE `source_loading` events for the UI's
 * per-source ghost chips.
 */
export async function buildEnrichedSnapshot(args: BuildArgs): Promise<EnrichedSnapshot> {
    const { userId, siteUrl, googleToken, seoContext, analyticsContext, propertyId } = args;
    const brand = inferBrandFromSite(siteUrl);
    const onLoad = args.onSourceLoading || (() => {});

    // ── GSC short-lived enrichments ──
    onLoad('gscEnrichments');
    const gscCacheKey = `chatSnapshotGsc:${userId}:${siteUrl}`;
    type GscEnrichments = {
        winnersLosers: WinnersLosersData | null;
        cannibalization: CannibalizationData | null;
        mobileGap: MobileGapData | null;
    };
    const gscPromise = cachedFetch<GscEnrichments>(gscCacheKey, TTL.GSC_SHORT, async () => {
        const [wlR, canR, mobR] = await Promise.allSettled([
            fetchWinnersLosers(googleToken, siteUrl),
            fetchCannibalization(googleToken, siteUrl),
            fetchMobileGap(googleToken, siteUrl),
        ]);
        return {
            winnersLosers: wlR.status === 'fulfilled' ? wlR.value : null,
            cannibalization: canR.status === 'fulfilled' ? canR.value : null,
            mobileGap: mobR.status === 'fulfilled' ? mobR.value : null,
        };
    });

    // ── GA4 sources (only when propertyId is set; otherwise resolve null) ──
    const cohortPromise: Promise<EnrichedSnapshot['cohortRetention']> = propertyId
        ? (() => { onLoad('cohortRetention'); return cachedFetch(`chatSnapshot:cohort:${propertyId}`, TTL.GA4_COHORT, () => fetchRetentionCohorts(googleToken, propertyId, 'daily').catch(() => null)); })()
        : Promise.resolve(null);

    const journeyPromise: Promise<EnrichedSnapshot['journey']> = propertyId
        ? (() => { onLoad('journey'); return cachedFetch(`chatSnapshot:journey:${propertyId}`, TTL.GA4_JOURNEY, () => fetchJourneyData(googleToken, propertyId, '28d').catch(() => null) as any); })()
        : Promise.resolve(null);

    const eventsPromise: Promise<EnrichedSnapshot['events']> = propertyId
        ? (() => { onLoad('events'); return cachedFetch(`chatSnapshot:events:${propertyId}`, TTL.GA4_EVENTS, () => fetchEventsTop(googleToken, propertyId)); })()
        : Promise.resolve(null);

    const geoPromise: Promise<EnrichedSnapshot['geoConversion']> = propertyId
        ? (() => { onLoad('geoConversion'); return cachedFetch(`chatSnapshot:geoConv:${propertyId}`, TTL.GA4_GEO, () => fetchGeoConversion(googleToken, propertyId)); })()
        : Promise.resolve(null);

    const timePromise: Promise<EnrichedSnapshot['timePatterns']> = propertyId
        ? (() => { onLoad('timePatterns'); return cachedFetch(`chatSnapshot:timePat:${propertyId}`, TTL.GA4_TIME, () => fetchTimePatterns(googleToken, propertyId)); })()
        : Promise.resolve(null);

    // ── Site profile (cheap deterministic compute over already-loaded context) ──
    const siteProfile = inferSiteProfile({
        seoContext,
        analyticsContext,
        brand: brand || undefined,
    });
    const brandedSplit = computeBrandedSplit(seoContext, brand);

    // ── Resolve GSC + initial-pass GA4 sources before we know which pages to schema-audit / PSI-test ──
    const [gsc, cohortRetention, journey, events, geoConversion, timePatterns] = await Promise.all([
        gscPromise,
        cohortPromise,
        journeyPromise,
        eventsPromise,
        geoPromise,
        timePromise,
    ]);

    // Compute initial insights (without schema/PSI/page-meta enrichment) so we
    // know which pages are "money pages" worth schema-auditing + PSI-testing.
    const initialInsights = detectTopInsights({
        seoContext,
        analyticsContext,
        winnersLosers: gsc.winnersLosers,
        cannibalization: gsc.cannibalization,
        mobileGap: gsc.mobileGap,
        brand: brand || undefined,
        siteProfile,
        recentlySurfacedIds: args.recentlySurfacedIds,
    }, 10);

    // ── Page-meta + schema-audit + PSI for top-3 money pages (parallel) ──
    const targetPaths = [...new Set(initialInsights.map(i => i.page).filter((p): p is string => !!p))].slice(0, 3);
    const targetUrls = targetPaths.map(p => buildAbsoluteUrl(siteUrl, p)).filter(u => !!u);

    let pageMeta = new Map<string, PageMeta>();
    let schemaAuditPerPage = new Map<string, SchemaAuditResult>();
    let psi = new Map<string, PsiResult>();

    if (targetUrls.length > 0) {
        const pageMetaPromise = !args.skipPageMeta
            ? (() => { onLoad('pageMeta'); return cachedFetch(
                `pageMeta:${siteUrl}:${targetPaths.join('|')}`,
                TTL.PAGE_META,
                () => fetchPageMetaBatch(targetUrls),
              ).catch(() => new Map<string, PageMeta>()); })()
            : Promise.resolve(new Map<string, PageMeta>());

        onLoad('schemaAudit');
        const schemaPromise = cachedFetch(
            `chatSnapshot:schemaAudit:${siteUrl}:${targetPaths.join('|')}`,
            TTL.SCHEMA,
            () => auditPagesSchemaBatch(targetUrls),
        ).catch(() => new Map<string, SchemaAuditResult>());

        onLoad('psi');
        const psiTargets = targetUrls.flatMap(u => [{ url: u, strategy: 'mobile' as const }, { url: u, strategy: 'desktop' as const }]);
        const psiPromise = cachedFetch(
            `chatSnapshot:psi:${siteUrl}:${targetPaths.join('|')}`,
            TTL.PSI,
            () => fetchPsiBatch(psiTargets),
        ).catch(() => new Map<string, PsiResult>());

        const [pmR, schR, psR] = await Promise.all([pageMetaPromise, schemaPromise, psiPromise]);
        pageMeta = pmR;
        schemaAuditPerPage = schR;
        psi = psR;
    }

    const schemaCoverage = schemaAuditPerPage.size > 0 ? aggregateSchemaCoverage(schemaAuditPerPage) : null;

    // ── Final insight pass with all enrichment present (so detectors that depend on
    //    schema/PSI/cohort/etc. can fire correctly). recentlySurfacedIds is applied
    //    here so the demotion uses the final ranking. ──
    const finalInsights = detectTopInsights({
        seoContext,
        analyticsContext,
        winnersLosers: gsc.winnersLosers,
        cannibalization: gsc.cannibalization,
        mobileGap: gsc.mobileGap,
        brand: brand || undefined,
        siteProfile,
        recentlySurfacedIds: args.recentlySurfacedIds,
        // New context — passed for use by upcoming detectors (WS-4)
        schemaCoverage,
        psi,
        cohortRetention,
        journey,
        events,
        geoConversion,
        timePatterns,
        deployCorrelation: args.deployCorrelation || null,
    } as any, 10);

    // Attach page-meta to insights so fix.before is populated where we have it
    const insights = finalInsights.map((ins) => {
        if (!ins.page) return ins;
        const absoluteUrl = buildAbsoluteUrl(siteUrl, ins.page);
        const meta = pageMeta.get(absoluteUrl);
        if (!meta?.fetched || !meta.title) return ins;
        return {
            ...ins,
            fix: {
                ...ins.fix,
                before: ins.fix.before || `Title: "${meta.title}"${meta.description ? ` | Meta: "${meta.description.slice(0, 140)}"` : ''}${meta.h1 ? ` | H1: "${meta.h1.slice(0, 80)}"` : ''}`,
            },
        };
    });

    return {
        seo: seoContext,
        analytics: analyticsContext,
        winnersLosers: gsc.winnersLosers,
        cannibalization: gsc.cannibalization,
        mobileGap: gsc.mobileGap,
        brandedSplit,
        insights,
        pageMeta,
        schemaAuditPerPage,
        schemaCoverage,
        psi,
        cohortRetention,
        journey,
        events,
        geoConversion,
        timePatterns,
        brand,
        siteProfile,
        recentlySurfacedIds: args.recentlySurfacedIds || [],
        computedAt: new Date().toISOString(),
    };
}

// ─── Late injection: deploy correlation ───
//
// Deploy correlation is gated to DIAGNOSTIC intent / regression keywords (saves
// GitHub quota) and runs AFTER the main snapshot is built. This helper takes
// the existing snapshot, runs the deterministic detector with the new input,
// and merges the resulting deploy_traffic_correlation insights into the
// snapshot.insights array (re-sorted by priority).

export function injectDeployCorrelation(
    snapshot: EnrichedSnapshot,
    deployCorrelation: NonNullable<BuildArgs['deployCorrelation']>,
): EnrichedSnapshot {
    if (!deployCorrelation?.hasCorrelation || !deployCorrelation.matches?.length) return snapshot;

    // Re-run the engine with deploy correlation; we already have all the source data
    // available on the snapshot itself. The ranker re-applies surfaced-IDs demotion.
    const reRanked = detectTopInsights({
        seoContext: snapshot.seo,
        analyticsContext: snapshot.analytics,
        winnersLosers: snapshot.winnersLosers,
        cannibalization: snapshot.cannibalization,
        mobileGap: snapshot.mobileGap,
        brand: snapshot.brand || undefined,
        siteProfile: snapshot.siteProfile,
        recentlySurfacedIds: snapshot.recentlySurfacedIds,
        schemaCoverage: snapshot.schemaCoverage,
        psi: snapshot.psi,
        cohortRetention: snapshot.cohortRetention,
        journey: snapshot.journey,
        events: snapshot.events,
        geoConversion: snapshot.geoConversion,
        timePatterns: snapshot.timePatterns,
        deployCorrelation,
    } as any, 10);

    // Re-attach page-meta `before` strings (since we recomputed insights from scratch)
    const insights = reRanked.map((ins) => {
        if (!ins.page) return ins;
        const absoluteUrl = buildAbsoluteUrl((snapshot.seo?.kpis ? snapshot.brand || '' : ''), ins.page);
        const meta = absoluteUrl ? snapshot.pageMeta.get(absoluteUrl) : null;
        if (!meta?.fetched || !meta.title) return ins;
        return {
            ...ins,
            fix: {
                ...ins.fix,
                before: ins.fix.before || `Title: "${meta.title}"${meta.description ? ` | Meta: "${meta.description.slice(0, 140)}"` : ''}${meta.h1 ? ` | H1: "${meta.h1.slice(0, 80)}"` : ''}`,
            },
        };
    });

    return { ...snapshot, insights };
}

// ─── Prompt block formatting ───

function fmtPct(n: number): string {
    if (!Number.isFinite(n)) return '0%';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
}

function severityEmoji(s: string): string {
    if (s === 'critical') return '🔴';
    if (s === 'high') return '🟡';
    if (s === 'medium') return '🟢';
    return '⚪';
}

/**
 * Produce the dense prompt-ready text block. Replaces the old
 * buildDataContext() output. Keep this < 1500 tokens — Gemini can
 * absorb more, but density beats volume.
 */
export function buildRichChatContext(snapshot: EnrichedSnapshot, opts?: { siteUrl?: string }): string {
    const lines: string[] = [];
    const seo = snapshot.seo;
    const an = snapshot.analytics;
    const profile = snapshot.siteProfile;

    // ── SITE PROFILE — read this FIRST. Determines which diagnoses apply. ──
    if (profile) {
        lines.push(`SITE PROFILE: ${profile.type.toUpperCase()} (confidence: ${profile.confidence})`);
        lines.push(`  ${profile.verdict}`);
        const flags: string[] = [];
        if (profile.hasCommercialPaths) flags.push('hasCommercialPaths');
        if (profile.hasContentPaths) flags.push('hasContentPaths');
        if (profile.hasBuyerIntentQueries) flags.push('hasBuyerIntentQueries');
        if (profile.looksLikePortfolio) flags.push('portfolio');
        if (profile.looksLikeDocs) flags.push('docs');
        if (flags.length > 0) lines.push(`  flags: ${flags.join(', ')}`);
        const s = profile.signals;
        lines.push(`  query mix: transactional ${(s.transactionalShare * 100).toFixed(0)}% / commercial ${(s.commercialShare * 100).toFixed(0)}% / informational ${(s.informationalShare * 100).toFixed(0)}% / branded ${(s.brandedShare * 100).toFixed(0)}% / navigational ${(s.navigationalShare * 100).toFixed(0)}%`);
        if (profile.type === 'content') {
            lines.push(`  ⚠ DO NOT recommend buyer-intent diagnoses for this site (no /pricing, no buyer queries, content/blog goal). Focus on: publishing cadence, content decay, audience capture (email/RSS), topical breadth, retention.`);
        } else if (profile.type === 'unknown') {
            lines.push(`  ⚠ Site type unclear — ask the user about their growth goal before recommending strategic moves. Tactical SEO fixes still apply.`);
        }
        // Edge-case flags
        if (profile.infantSite) {
            lines.push(`  🌱 INFANT SITE — too little data for analysis (${profile.signals.totalImpressions} impressions, ${profile.signals.distinctQueries} queries). Persona has been auto-routed to COACHING. Output a setup checklist, NOT a diagnosis.`);
        }
        if (profile.partialConnection === 'gsc_only') {
            lines.push(`  ⚠ GA4 not connected — analytics-side diagnoses (journey, cohort, events, geo, time-of-day) are unavailable. Stick to GSC-side insights.`);
        } else if (profile.partialConnection === 'ga4_only') {
            lines.push(`  ⚠ GSC not connected — search-side diagnoses (CTR leak, striking distance, schema/AEO) are unavailable. Stick to GA4-side insights.`);
        }
        if (profile.monolingualNonEnglish) {
            lines.push(`  🌐 NON-ENGLISH AUDIENCE — top queries are in ${profile.monolingualNonEnglish.detected}. Translate examples to that idiom; don't assume English search intent norms; don't recommend English-language meta rewrites.`);
        }
        lines.push('');
    }

    // ── Headline KPIs ──
    if (seo?.kpis) {
        const k = seo.kpis;
        lines.push(`GSC(28d): ${(k.totalClicks ?? 0).toLocaleString()}c (${fmtPct(k.changeClicks ?? 0)} WoW) | ${(k.totalImpressions ?? 0).toLocaleString()}imp (${fmtPct(k.changeImpressions ?? 0)}) | CTR ${k.avgCTR ?? 0}% | pos ${k.avgPosition ?? 0}`);
    }
    if (an?.kpis) {
        const k = an.kpis;
        lines.push(`GA4(28d): ${(k.totalUsers ?? 0).toLocaleString()}u (${fmtPct(k.changeUsers ?? 0)}) | ${(k.totalPageViews ?? 0).toLocaleString()}pv | bounce ${k.avgBounceRate ?? 0}% | sess ${(k.totalSessions ?? 0).toLocaleString()}`);
    }

    // ── STRATEGIC DIAGNOSES — root-cause growth blockers (these explain WHY) ──
    const strategic = snapshot.insights.filter(i => i.isStrategic);
    const tactical = snapshot.insights.filter(i => !i.isStrategic);

    if (strategic.length > 0) {
        lines.push('');
        lines.push('STRATEGIC DIAGNOSES (root-cause growth blockers — read these FIRST):');
        for (const ins of strategic.slice(0, 5)) {
            const tag = `${severityEmoji(ins.severity)} #${ins.rank}`;
            const confTag = ins.confidence ? ` (confidence: ${ins.confidence}${ins.confidenceReason ? ` — ${ins.confidenceReason}` : ''})` : '';
            lines.push(`${tag} [STRATEGIC · ${ins.category}] ${ins.title}${confTag}`);
            if (ins.page) lines.push(`   page: ${ins.page}`);
            if (ins.query) lines.push(`   query: "${ins.query}"`);
            const ev = Object.entries(ins.evidence)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? v : `"${v}"`}`)
                .slice(0, 8)
                .join(', ');
            if (ev) lines.push(`   evidence: ${ev}`);
            lines.push(`   why: ${ins.why}`);
            lines.push(`   fix: ${ins.fix.description}`);
        }
    }

    // ── TACTICAL $-LEAKS — specific quantifiable SEO fixes ──
    if (tactical.length > 0) {
        lines.push('');
        lines.push('TACTICAL $-LEAKS (sorted by $/mo lost — pick from here when no strategic critical exists):');
        for (const ins of tactical.slice(0, 8)) {
            const tag = `${severityEmoji(ins.severity)} #${ins.rank}`;
            const valueStr = ins.monthlyValueLost > 0 ? `$${ins.monthlyValueLost.toLocaleString()}/mo` : '(quantifiable)';
            const confTag = ins.confidence ? ` · confidence: ${ins.confidence}${ins.confidenceReason ? ` — ${ins.confidenceReason}` : ''}` : '';
            lines.push(`${tag} [${ins.category}] ${ins.title} — ${valueStr}, ~${ins.estClicksGain}c, effort ${ins.effortMinutes}m, ${ins.difficulty}${confTag}`);
            if (ins.page) lines.push(`   page: ${ins.page}`);
            if (ins.query) lines.push(`   query: "${ins.query}"`);
            const ev = Object.entries(ins.evidence)
                .map(([k, v]) => `${k}=${typeof v === 'number' ? v : `"${v}"`}`)
                .slice(0, 6)
                .join(', ');
            if (ev) lines.push(`   evidence: ${ev}`);
            if (ins.fix.before) lines.push(`   current: ${ins.fix.before.slice(0, 220)}`);
            lines.push(`   why: ${ins.why}`);
            lines.push(`   fix: ${ins.fix.description}`);
        }
    }

    // ── TOP QUERIES (the model uses these for any "show me my keywords" question) ──
    const queries: any[] = seo?.queries || seo?.topQueries || [];
    if (queries.length > 0) {
        lines.push('');
        lines.push('TOP QUERIES (15):');
        queries.slice(0, 15).forEach((q: any, i: number) => {
            const pos = parseFloat(q.position) || 0;
            const ctrRaw = parseFloat(q.ctr) || 0;
            const ctr = ctrRaw < 1 ? ctrRaw * 100 : ctrRaw;
            const flag = (pos >= 4 && pos <= 20 && q.impressions > 50) ? ' ⚡' : '';
            const delta = q.changeClicks !== undefined ? ` (${fmtPct(q.changeClicks)} WoW)` : '';
            lines.push(`${i + 1}. "${q.query}" ${q.clicks}c/${q.impressions}imp ${ctr.toFixed(1)}%ctr p${pos.toFixed(1)}${delta}${flag}`);
        });
    }

    // ── TOP PAGES ──
    const pages: any[] = seo?.pages || seo?.topPages || [];
    if (pages.length > 0) {
        lines.push('');
        lines.push('TOP PAGES (8):');
        pages.slice(0, 8).forEach((p: any, i: number) => {
            const pos = parseFloat(p.position) || 0;
            const ctrRaw = parseFloat(p.ctr) || 0;
            const ctr = ctrRaw < 1 ? ctrRaw * 100 : ctrRaw;
            const delta = p.changeClicks !== undefined ? ` (${fmtPct(p.changeClicks)})` : '';
            lines.push(`${i + 1}. ${p.page} ${p.clicks}c/${p.impressions}imp ${ctr.toFixed(1)}%ctr p${pos.toFixed(1)}${delta}`);
        });
    }

    // ── WINNERS / LOSERS ──
    if (snapshot.winnersLosers) {
        const wl = snapshot.winnersLosers;
        if (wl.winners.length) {
            lines.push('');
            lines.push(`WINNERS (top 5, vs prior 28d):`);
            wl.winners.slice(0, 5).forEach((w: any) => {
                lines.push(`  + "${w.query}" +${w.clicksDelta}c (${w.clicksDeltaPct}%, pos ${w.positionPrevious}→${w.positionCurrent})`);
            });
        }
        if (wl.losers.length) {
            lines.push(`LOSERS (top 5):`);
            wl.losers.slice(0, 5).forEach((l: any) => {
                lines.push(`  - "${l.query}" ${l.clicksDelta}c (${l.clicksDeltaPct}%, pos ${l.positionPrevious}→${l.positionCurrent}) ⚠`);
            });
        }
        if (wl.new.length) {
            const labels = wl.new.slice(0, 4).map((n: any) => `"${n.query}" (${n.clicksCurrent}c, pos ${n.positionCurrent})`).join(', ');
            lines.push(`NEW QUERIES: ${labels}`);
        }
        if (wl.lost.length) {
            const labels = wl.lost.slice(0, 4).map((n: any) => `"${n.query}" (was ${n.clicksPrevious}c)`).join(', ');
            lines.push(`LOST QUERIES: ${labels}`);
        }
    }

    // ── CANNIBALIZATION ──
    if (snapshot.cannibalization?.cannibalized?.length) {
        lines.push('');
        lines.push(`CANNIBALIZATION (${snapshot.cannibalization.cannibalized.length} queries):`);
        snapshot.cannibalization.cannibalized.slice(0, 4).forEach((c: any) => {
            const top2 = c.pages.slice(0, 2).map((p: any) => `${p.page} (pos ${p.position})`).join(' + ');
            lines.push(`  • "${c.query}" — ${c.pages.length} pages [${c.severity}]: ${top2}`);
        });
    }

    // ── MOBILE GAP ──
    if (snapshot.mobileGap?.data?.length) {
        const significant = snapshot.mobileGap.data.filter((g: any) => Math.abs(g.gap) >= 3 && g.mobilePosition > g.desktopPosition);
        if (significant.length > 0) {
            lines.push('');
            lines.push(`MOBILE GAP (${significant.length} keywords mobile worse than desktop by 3+ positions):`);
            significant.slice(0, 4).forEach((g: any) => {
                lines.push(`  • "${g.query}" mobile pos ${g.mobilePosition} vs desktop ${g.desktopPosition}, ${g.mobileImpressions}imp`);
            });
        }
    }

    // ── BRANDED SPLIT ──
    if (snapshot.brandedSplit) {
        const b = snapshot.brandedSplit;
        lines.push('');
        const verdict = b.brandedPct > 70 ? '⚠ overdependent on brand' : b.brandedPct > 40 ? 'mixed brand/non-brand' : 'mostly non-branded SEO';
        lines.push(`BRANDED SPLIT: ${b.brandedPct}% branded clicks (${b.brandedClicks}c branded vs ${b.nonBrandedClicks}c non-branded) — ${verdict}. Brand inferred: "${snapshot.brand || '(none)'}"`);
    }

    // ── GA4 BREAKOUTS ──
    if (an?.devices?.length) {
        const labels = an.devices.map((d: any) => `${d.device}:${d.percentage}%`).join(', ');
        lines.push('');
        lines.push(`DEVICES (GA4): ${labels}`);
    }
    if (an?.channels?.length) {
        const labels = an.channels.slice(0, 5).map((c: any) => `${c.name}:${c.value || c.percentage || 0}`).join(', ');
        lines.push(`CHANNELS: ${labels}`);
    }
    if (an?.topSources?.length || an?.sources?.length) {
        const sources = an.topSources || an.sources || [];
        const labels = sources.slice(0, 5).map((s: any) => `${s.source}:${s.sessions || s.value || 0}`).join(', ');
        lines.push(`TOP SOURCES: ${labels}`);
    }
    if (an?.topCountries?.length || an?.countries?.length) {
        const countries = an.topCountries || an.countries || [];
        const labels = countries.slice(0, 5).map((c: any) => `${c.country || c.name}:${c.sessions || c.value || c.clicks || 0}`).join(', ');
        lines.push(`TOP COUNTRIES: ${labels}`);
    }

    // ── SCHEMA / AEO COVERAGE ──
    if (snapshot.schemaCoverage && snapshot.schemaCoverage.pagesFetched > 0) {
        const c = snapshot.schemaCoverage;
        const has: string[] = [];
        const missing: string[] = [];
        if (c.hasOrganization) has.push('Organization'); else missing.push('Organization');
        if (c.hasArticleLike) has.push('Article'); else missing.push('Article');
        if (c.hasFAQ) has.push('FAQPage'); else missing.push('FAQPage');
        if (c.hasHowTo) has.push('HowTo'); else missing.push('HowTo');
        if (c.hasProduct) has.push('Product'); else missing.push('Product');
        if (c.hasBreadcrumb) has.push('Breadcrumb'); else missing.push('Breadcrumb');
        lines.push('');
        lines.push(`SCHEMA COVERAGE (across ${c.pagesFetched} top page(s)): present=${has.join(',') || '(none)'}; MISSING=${missing.join(',')}; errors=${c.totalErrors}`);
    }

    // ── PSI / CWV ──
    if (snapshot.psi && snapshot.psi.size > 0) {
        const failingMobile: string[] = [];
        const failingDesktop: string[] = [];
        for (const [key, r] of snapshot.psi.entries()) {
            if (!r.fetched) continue;
            const fail = r.lcpVerdict === 'POOR' || r.clsVerdict === 'POOR';
            if (!fail) continue;
            const label = `${r.url} (LCP ${(r.lcpMs / 1000).toFixed(1)}s ${r.lcpVerdict}, CLS ${r.cls.toFixed(2)} ${r.clsVerdict})`;
            if (key.startsWith('mobile:')) failingMobile.push(label);
            else failingDesktop.push(label);
        }
        if (failingMobile.length || failingDesktop.length) {
            lines.push('');
            lines.push('PAGE SPEED FAILURES:');
            if (failingMobile.length) lines.push(`  mobile: ${failingMobile.slice(0, 3).join(' | ')}`);
            if (failingDesktop.length) lines.push(`  desktop: ${failingDesktop.slice(0, 3).join(' | ')}`);
        }
    }

    // ── COHORT RETENTION ──
    if (snapshot.cohortRetention?.averages) {
        const a = snapshot.cohortRetention.averages;
        lines.push('');
        lines.push(`COHORT RETENTION (avg): D1 ${a.day1}% / D7 ${a.day7}% / D14 ${a.day14}% / D30 ${a.day30}% (${snapshot.cohortRetention.cohorts?.length || 0} cohorts)`);
    }

    // ── JOURNEY ──
    if (snapshot.journey) {
        const j = snapshot.journey;
        lines.push('');
        lines.push(`USER JOURNEY: ${j.totalSessions.toLocaleString()} sessions, avg ${j.avgPathLength.toFixed(1)} pages/session, bounce ${j.avgBounce}%`);
        if (j.landingPages?.length) {
            lines.push(`  top landings: ${j.landingPages.slice(0, 3).map((lp: any) => `${lp.page} (${lp.entries} entries, ${lp.percentage}%)`).join(' | ')}`);
        }
        if (j.exitPages?.length) {
            lines.push(`  top exits: ${j.exitPages.slice(0, 3).map((ep: any) => `${ep.page} (${ep.exits} exits)`).join(' | ')}`);
        }
    }

    // ── EVENTS ──
    if (snapshot.events) {
        const e = snapshot.events;
        lines.push('');
        const top = e.topEvents.slice(0, 5).map(ev => `${ev.name}${ev.isKey ? '★' : ''}:${ev.count}`).join(', ');
        lines.push(`GA4 EVENTS: total=${e.totalEventCount.toLocaleString()}, top=${top}`);
        if (e.conversionEvents.length === 0) {
            lines.push(`  ⚠ No events flagged as conversions — measurement is opaque.`);
        } else {
            lines.push(`  conversion events: ${e.conversionEvents.join(', ')}`);
        }
    }

    // ── TIME PATTERNS ──
    if (snapshot.timePatterns?.peakHour !== null && snapshot.timePatterns?.peakHour !== undefined) {
        const t = snapshot.timePatterns;
        lines.push('');
        lines.push(`TIME PATTERNS: peak hour ${t.peakHour}:00 UTC, peak day ${t.peakDow || 'n/a'}`);
    }

    // ── GEO CONVERSION ──
    if (snapshot.geoConversion?.byCountry?.length) {
        const top = snapshot.geoConversion.byCountry.slice(0, 5).map(c => `${c.country}: ${c.sessions} sess / ${c.conversionRate}% conv`).join(' | ');
        lines.push('');
        lines.push(`GEO CONVERSION: ${top}`);
    }

    // ── DASHBOARD-DERIVED RECS (legacy) ──
    if (seo?.recommendations?.length) {
        lines.push('');
        lines.push('DASHBOARD RECS:');
        seo.recommendations.slice(0, 3).forEach((r: any) => {
            lines.push(`  • [${r.severity}] ${r.title} — ${r.action || ''}`);
        });
    }

    return lines.join('\n');
}
