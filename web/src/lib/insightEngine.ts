/**
 * insightEngine.ts — deterministic ranked-insight detector.
 *
 * Given an enriched snapshot (basic GSC dashboard + winners-losers +
 * cannibalization + mobile-gap), this returns up to N ranked insights
 * sorted by estimated monthly $ value lost.
 *
 * The insights are pure JS — no LLM calls. The chat route runs this
 * BEFORE handing context to Gemini, so the model narrates ranked
 * findings rather than searching for them itself.
 *
 * Why deterministic: LLMs are bad at multi-row arithmetic, ranking,
 * and consistency. Move "finding" into JS, leave "explaining" to the LLM.
 */
import { expectedCTR } from './alertEngine';

export type InsightCategory =
    // ─── Tactical (specific, $-quantifiable SEO fixes) ───
    | 'ctr_leak'
    | 'striking_distance'
    | 'cannibalization'
    | 'content_decay'
    | 'mobile_gap'
    | 'new_query_opportunity'
    | 'position_regression'
    | 'page_2_breakthrough'
    | 'untapped_geo'
    // ─── Strategic — apply to commercial / mixed sites (sites that sell or capture) ───
    | 'intent_mix_gap'           // wrong-intent traffic: blog readers, not buyers
    | 'buyer_intent_invisible'   // brand transactional queries not ranking
    | 'funnel_disconnect'        // content traffic never reaches conversion pages
    // ─── Strategic — apply to content / blog / portfolio sites ───
    | 'publishing_velocity_stall'  // no new queries appearing — content engine stopped
    | 'top_post_decay_systemic'    // top-performing posts are losing clicks at the same time
    | 'audience_capture_missing'   // no email/newsletter/RSS path visible
    | 'topical_breadth_narrow'     // content site with very few topic clusters
    // ─── Strategic — universal (apply to any site type) ───
    | 'topic_concentration'      // top-5 page concentration — single-page-of-failure risk
    | 'channel_concentration'    // single-channel dependency
    | 'conversion_opacity'       // GA4 has no conversion / engagement events configured
    | 'branded_overdependence'   // % of clicks from brand searches too high
    | 'audience_geo_mismatch'    // top traffic country has worst engagement
    // ─── Driven by expanded data (schema/PSI/cohort/journey/events/time) ───
    | 'journey_dead_end'         // landing pages whose visitors leave without going deeper
    | 'event_misalignment'       // conversion events firing on wrong pages
    | 'cross_source_surprise'    // multi-source patterns: AEO gap, CWV-rank link, time anomaly, etc.
    | 'deploy_traffic_correlation' // a commit/PR shipped within ±2d of a position regression
    // ─── Pattern-library additions (Phase X — anomaly archetypes, not tactical fixes) ───
    | 'directory_trap'            // page ranks for broad queries it doesn't satisfy — title fix won't help
    | 'ai_channel_emergent'       // ChatGPT/Perplexity/Gemini in top GA4 sources but no Org/FAQ schema to capture citations
    | 'linguistic_concentration'  // one locale owns disproportionate clicks while site has multiple locales
    | 'question_query_unmet'      // interrogative queries dominate but FAQPage / question-shaped H2s absent
    | 'trust_signal_absence_commerce' // ecom site with no Review/AggregateRating/testimonial signals
    | 'programmatic_thin_content_explosion' // 50+ pages on same path pattern with thin median content + low engagement
    | 'top_page_fragility'        // single page accounts for >35% of all clicks — collapse risk if it slips
    | 'pos_2_3_stuck_cluster';    // 5+ queries stuck at pos 2-3 with flat WoW deltas — needs a different lever

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface InsightFix {
    type: 'meta_title_rewrite' | 'meta_description_rewrite' | 'consolidate_pages' | 'refresh_content' | 'mobile_optimize' | 'create_page' | 'internal_link' | 'investigate' | 'configure_analytics' | 'create_funnel' | 'diversify_channels' | 'prune_pages' | 'create_buyer_intent_pages' | 'retarget_page' | 'add_schema' | 'replicate_locale' | 'surface_trust_signals' | 'restructure_as_questions' | 'other';
    description: string;
    /** Concrete before-string when we can fetch the current state (page meta). */
    before?: string;
    /** Concrete after-string suggestion (or null when LLM should generate). */
    after?: string;
}

export interface RankedInsight {
    id: string;
    rank: number;
    category: InsightCategory;
    severity: InsightSeverity;
    title: string;                  // 1-line headline ("CTR leak on /react-animation-library")
    page: string | null;
    query: string | null;
    evidence: Record<string, number | string | boolean>;
    /** Estimated $/mo lost. Strategic insights set this from a synthetic priority
     *  (see priority field) or 0 when truly non-$-quantifiable. */
    monthlyValueLost: number;
    /** Synthetic ranking priority. For TACTICAL insights this defaults to
     *  monthlyValueLost ($/mo). For STRATEGIC insights this is a synthetic score so
     *  they sort vs $-leaks appropriately: critical ≈ 8000, high ≈ 3000, medium ≈ 800.
     *  Filled in by detectTopInsights() if not provided by the detector. */
    priority?: number;
    /** True when this is a strategic root-cause insight (not a tactical $ fix).
     *  Defaults to false if not set. */
    isStrategic?: boolean;
    /** Deterministic confidence in the diagnosis. Filled in by detectTopInsights()
     *  if not provided by the detector. Driven by sample size (impressions),
     *  data window (days), and signal-to-noise. The LLM is told to TRANSCRIBE
     *  this — never to generate confidence on its own (LLMs hedge inconsistently). */
    confidence?: 'high' | 'medium' | 'low';
    /** Optional one-line reason the confidence is what it is, e.g. "based on 17 days of data". */
    confidenceReason?: string;
    estClicksGain: number;          // clicks/mo if fix lands (0 for strategic)
    effortMinutes: number;
    difficulty: 'easy' | 'medium' | 'hard';
    why: string;                    // 1-2 sentence narrative for the LLM to lean on
    fix: InsightFix;
    receipts: string[];             // pointers like 'gsc.queries[3]', 'wl.losers[0]'
}

export interface InsightInput {
    /** Either the raw seoData ({queries, pages, kpis, trend, recommendations}) OR the compact seoContext shape. */
    seoContext?: any;
    /** Same — accepts either shape. */
    analyticsContext?: any;
    winnersLosers?: { winners?: any[]; losers?: any[]; new?: any[]; lost?: any[] } | null;
    cannibalization?: { cannibalized?: any[] } | null;
    mobileGap?: { data?: any[]; gaps?: any[] } | null;
    /** Optional: brand string (used to compute branded vs non-branded share). */
    brand?: string;
    /** Optional: page-meta map keyed by page path or URL (provides current title/desc/H1). */
    pageMeta?: Map<string, { title?: string; description?: string; h1?: string; wordCount?: number }>;
    /** Optional: site profile (auto-detected by detectTopInsights if missing).
     *  Strategic detectors gate themselves on profile.type so they don't fire
     *  inappropriately for content/blog/portfolio/docs sites. */
    siteProfile?: SiteProfile;
    /** Optional: insight IDs already surfaced in earlier turns of this thread.
     *  The ranker demotes matching items before sort so the next turn's #1 is
     *  genuinely fresh. Drives anti-repetition without depending on LLM compliance. */
    recentlySurfacedIds?: string[];
    /** Optional: aggregate schema coverage across audited pages (FAQ, HowTo, Article…).
     *  Drives `aeo_invisibility` strategic detector. */
    schemaCoverage?: {
        hasOrganization: boolean; hasWebsite: boolean; hasArticleLike: boolean;
        hasFAQ: boolean; hasHowTo: boolean; hasProduct: boolean;
        hasBreadcrumb: boolean; hasPerson: boolean;
        totalErrors: number; pagesAudited: number; pagesFetched: number;
    } | null;
    /** Optional: PageSpeed Insights results keyed by `${strategy}:${url}`.
     *  Drives `cwv_ranking_correlation` cross-source detector. */
    psi?: Map<string, { url: string; strategy: 'mobile' | 'desktop'; fetched: boolean; lcpMs: number; cls: number; tbtMs: number; performance: number; lcpVerdict: string; clsVerdict: string }>;
    /** Optional: GA4 cohort retention (day-1, day-7, day-30 averages + curves).
     *  Drives `cohort_decay` strategic detector. */
    cohortRetention?: { averages: { day1: number; day7: number; day14: number; day30: number }; curve: any[]; cohorts: any[] } | null;
    /** Optional: GA4 journey data. Drives `journey_dead_end` strategic detector.
     *  Shape mirrors fetchJourneyData() return: overview is nested. */
    journey?: { landingPages: any[]; exitPages: any[]; journeys: any[]; overview?: { avgPathLength?: number; avgTimeOnSite?: number; bounceRate?: number; mostCommonPath?: any } } | null;
    /** Optional: GA4 events. Drives `event_misalignment` strategic detector. */
    events?: { topEvents: Array<{ name: string; count: number; isKey: boolean }>; conversionEvents: string[]; totalEventCount: number } | null;
    /** Optional: GA4 geo conversion data. */
    geoConversion?: { byCountry: Array<{ country: string; sessions: number; conversions: number; conversionRate: number; engagement: number }> } | null;
    /** Optional: GA4 time-of-day / day-of-week patterns. Drives `time_pattern_anomaly` surprise. */
    timePatterns?: { peakHour: number | null; peakDow: string | null; hourly: Array<{ hour: number; sessions: number }>; dow: Array<{ day: string; sessions: number }> } | null;
    /** Optional: GitHub deploy correlation (only computed when intent is DIAGNOSTIC
     *  or the user message contains regression keywords AND a repo is linked).
     *  Drives `deploy_traffic_correlation` surprise detector. */
    deployCorrelation?: {
        hasCorrelation: boolean;
        matches: Array<{
            query: string;
            positionPrevious: number;
            positionCurrent: number;
            clicksLost: number;
            suspectCommits: Array<{ sha: string; date: string; message: string; author: string; html_url: string }>;
        }>;
        repo: string | null;
    } | null;
}

// ─── Tunable constants ───
const MIN_IMP_FOR_OPP = 50;
const MIN_IMP_FOR_LEAK = 200;
const TARGET_CTR_RECOVERY = 0.6; // assume we close 60% of the CTR gap
const TARGET_POSITION_FOR_STRIKING = 3;

// ─── Helpers ───

function readQueries(seo: any): any[] {
    if (!seo) return [];
    return seo.queries || seo.topQueries || [];
}
function readPages(seo: any): any[] {
    if (!seo) return [];
    return seo.pages || seo.topPages || [];
}
function readKpis(seo: any): any {
    return seo?.kpis || null;
}

/** Normalize any incoming CTR value to a 0-100 percentage. */
function toCtrPct(v: any): number {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return n < 1 ? n * 100 : n;
}

function toPos(v: any): number {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function toInt(v: any): number {
    const n = typeof v === 'number' ? v : parseInt(v);
    return Number.isFinite(n) ? n : 0;
}

/** Money-per-click estimator from query intent. Keeps everything dollar-comparable. */
export function intentValuePerClick(query: string | null | undefined): number {
    if (!query) return 0.5;
    const q = query.toLowerCase();
    if (/\b(buy|price|pricing|cost|signup|sign up|free trial|demo|get started|order|purchase|subscription|plans?|checkout)\b/.test(q)) return 3.27;
    if (/\b(vs|versus|comparison|review|best|top \d+|alternatives?)\b/.test(q)) return 1.50;
    if (/\b(how to|tutorial|guide|examples?|what is|definition|learn)\b/.test(q)) return 0.30;
    return 0.50;
}

/** Classify a query into a search-intent class. Used by strategic detectors
 *  (intent_mix_gap, buyer_intent_invisible) to compute traffic distribution. */
export type QueryIntent = 'transactional' | 'commercial' | 'informational' | 'branded' | 'navigational' | 'other';

export function classifyQueryIntent(query: string | null | undefined, brand?: string | null): QueryIntent {
    if (!query) return 'other';
    const q = query.toLowerCase().trim();
    if (brand && q.includes(brand.toLowerCase())) return 'branded';
    if (/\b(buy|pricing|price|cost|plans?|subscription|signup|sign up|demo|free trial|get started|order|purchase|checkout|discount|coupon|deal|book a)\b/.test(q)) return 'transactional';
    if (/\b(vs|versus|review|reviews|best|top \d+|alternative|alternatives|compare|comparison|recommend|recommended|cheapest|fastest|easiest)\b/.test(q)) return 'commercial';
    if (/\b(how to|how do|what is|what are|tutorial|guide|examples?|definition|tips?|why|when|where|learn|explained?|introduction|basics?)\b/.test(q)) return 'informational';
    if (/\b(login|log in|sign in|dashboard|account|app|download|home|contact|support|docs|documentation|api)\b/.test(q)) return 'navigational';
    return 'other';
}

export function isBrandedQuery(query: string | null | undefined, brand?: string | null): boolean {
    if (!query) return false;
    if (!brand) return false;
    const q = query.toLowerCase();
    const b = brand.toLowerCase();
    if (b.length < 3) return false;
    return q.includes(b);
}

/** $/mo gain if we go from current CTR to (current + recoveryShare × gap). */
function estimateCtrFixGain(impressions: number, position: number, currentCtrPct: number, recoveryShare: number, valuePerClick: number) {
    const expected = expectedCTR(position);
    const gap = Math.max(0, expected - currentCtrPct);
    const targetCtr = currentCtrPct + gap * recoveryShare;
    const currentClicks = (currentCtrPct / 100) * impressions;
    const targetClicks = (targetCtr / 100) * impressions;
    const extraClicks = Math.max(0, targetClicks - currentClicks);
    return {
        currentClicks: Math.round(currentClicks),
        targetClicks: Math.round(targetClicks),
        extraClicks: Math.round(extraClicks),
        currentCtrPct,
        expectedCtrPct: expected,
        gap,
        monthlyValue: Math.round(extraClicks * valuePerClick),
    };
}

/** $/mo gain if we go from currentPosition to targetPosition (e.g., pos 7 → pos 3). */
function estimatePositionGain(impressions: number, currentPos: number, targetPos: number, currentCtrPct: number, valuePerClick: number) {
    const targetCtr = expectedCTR(targetPos);
    const currentClicks = (currentCtrPct / 100) * impressions;
    const targetClicks = (targetCtr / 100) * impressions;
    const extraClicks = Math.max(0, targetClicks - currentClicks);
    return {
        currentClicks: Math.round(currentClicks),
        targetClicks: Math.round(targetClicks),
        extraClicks: Math.round(extraClicks),
        currentCtrPct,
        targetCtrPct: targetCtr,
        monthlyValue: Math.round(extraClicks * valuePerClick),
    };
}

/** Rough page-path extraction from a full URL. */
function pathOf(urlOrPath: string): string {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('/')) return urlOrPath;
    try {
        const u = new URL(urlOrPath);
        return u.pathname || '/';
    } catch {
        return urlOrPath;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// SITE PROFILE — auto-detect the site's TYPE so strategic detectors only
// fire when they're relevant. A "no buyer-intent traffic" alarm is wrong
// for a personal blog or open-source documentation site.
// ═══════════════════════════════════════════════════════════════════════

export type SiteType = 'commercial' | 'content' | 'mixed' | 'unknown';

export interface SiteProfile {
    /** Best-guess site type. */
    type: SiteType;
    /** How confident the detector is in its guess. */
    confidence: 'high' | 'medium' | 'low';
    /** Site has commercial-pattern URLs (/pricing, /signup, /buy, /demo, /checkout). */
    hasCommercialPaths: boolean;
    /** Site has content-pattern URLs (/blog, /docs, /article, /tutorial). */
    hasContentPaths: boolean;
    /** Any buyer-intent (transactional/commercial) queries appear in top queries. */
    hasBuyerIntentQueries: boolean;
    /** Site looks like a portfolio/personal brand (high branded share, narrow surface). */
    looksLikePortfolio: boolean;
    /** Site looks like documentation (heavy /docs|/api|/reference, navigational queries). */
    looksLikeDocs: boolean;
    /** Edge case: site has too little data for analysis (≤100 imp/mo OR <5 distinct queries). */
    infantSite: boolean;
    /** Edge case: which connections are present. */
    partialConnection: 'gsc_only' | 'ga4_only' | 'both' | 'none';
    /** Edge case: non-English audience — top queries are in another script/language. */
    monolingualNonEnglish: { detected: string } | null;
    signals: {
        commercialPathsFound: string[];
        contentPathsFound: string[];
        buyerIntentSamples: string[];
        navigationalShare: number;     // 0..1
        brandedShare: number;          // 0..1
        informationalShare: number;    // 0..1
        commercialShare: number;       // 0..1
        transactionalShare: number;    // 0..1
        totalImpressions: number;
        distinctQueries: number;
        nonAsciiQueryShare: number;    // 0..1, share of top queries with non-ASCII chars
    };
    /** Human-readable verdict ("Looks like a content/blog site — readers, not buyers"). */
    verdict: string;
}

const COMMERCIAL_PATH_RE = /\/(pricing|plans?|signup|sign-up|register|demo|trial|buy|cart|checkout|book|schedule|get-started|start|order|purchase|shop|store|product|products)(\/|$|\?)/i;
const CONTENT_PATH_RE = /\/(blog|article|articles|post|posts|guide|tutorial|tutorials|docs?|documentation|learn|news|insights?|resources?|story|stories|read|magazine|journal)(\/|$|\?)/i;
const DOCS_PATH_RE = /\/(docs?|documentation|api|reference|guide|guides|sdk|developer|developers|examples?)(\/|$|\?)/i;

/** Infer site type from queries + pages + analytics + brand. Pure function. */
export function inferSiteProfile(input: InsightInput): SiteProfile {
    const queries = readQueries(input.seoContext);
    const pages = readPages(input.seoContext);
    const an = input.analyticsContext;
    const brand = input.brand;

    // ─── Path signals ───
    const commercialPathsFound: string[] = [];
    const contentPathsFound: string[] = [];
    const docsPathsFound: string[] = [];
    const allPagePaths: string[] = [];

    const collectPath = (raw: string) => {
        const path = pathOf(raw);
        if (!path) return;
        allPagePaths.push(path);
        if (COMMERCIAL_PATH_RE.test(path)) commercialPathsFound.push(path);
        if (CONTENT_PATH_RE.test(path)) contentPathsFound.push(path);
        if (DOCS_PATH_RE.test(path)) docsPathsFound.push(path);
    };
    for (const p of pages) collectPath(p.page || p.url || '');
    if (an?.pages) for (const p of an.pages) collectPath(p.page || p.path || '');
    if (an?.topPages) for (const p of an.topPages) collectPath(p.page || p.path || '');

    // ─── Query intent distribution ───
    let totalImp = 0;
    const intentImp: Record<QueryIntent, number> = {
        transactional: 0, commercial: 0, informational: 0, branded: 0, navigational: 0, other: 0,
    };
    const buyerIntentSamples: string[] = [];
    for (const q of queries) {
        const intent = classifyQueryIntent(q.query, brand);
        const imp = toInt(q.impressions);
        intentImp[intent] += imp;
        totalImp += imp;
        if ((intent === 'transactional' || intent === 'commercial') && buyerIntentSamples.length < 5) {
            buyerIntentSamples.push(q.query);
        }
    }
    const safeTotal = Math.max(totalImp, 1);
    const transactionalShare = intentImp.transactional / safeTotal;
    const commercialShare = intentImp.commercial / safeTotal;
    const informationalShare = intentImp.informational / safeTotal;
    const brandedShare = intentImp.branded / safeTotal;
    const navigationalShare = intentImp.navigational / safeTotal;
    const buyerShare = transactionalShare + commercialShare;

    const hasCommercialPaths = commercialPathsFound.length > 0;
    const hasContentPaths = contentPathsFound.length > 0;
    const hasBuyerIntentQueries = buyerIntentSamples.length > 0;

    // ─── Heuristic classification ───
    // Commercial: clear /pricing|/signup|/buy presence, OR meaningful buyer-intent share
    // Content: heavy /blog|/article|/docs presence and NO commercial paths and low buyer-intent share
    // Mixed: both signals present (e.g., SaaS with a content marketing layer)
    // Unknown: insufficient signal (very low traffic, no clear paths)
    let type: SiteType = 'unknown';
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let verdict = '';

    const looksLikeDocs = docsPathsFound.length > 0 && navigationalShare > 0.25 && !hasCommercialPaths;
    const looksLikePortfolio = brandedShare > 0.55 && allPagePaths.length < 10 && !hasCommercialPaths;

    if (hasCommercialPaths && hasContentPaths) {
        type = 'mixed';
        confidence = 'high';
        verdict = `Mixed site — has commercial pages (${commercialPathsFound.slice(0, 2).join(', ')}) AND content (${contentPathsFound.slice(0, 2).join(', ')}). Treat as commercial with a content marketing layer; growth diagnoses for both apply.`;
    } else if (hasCommercialPaths || buyerShare > 0.15) {
        type = 'commercial';
        confidence = hasCommercialPaths ? 'high' : 'medium';
        verdict = hasCommercialPaths
            ? `Commercial site — has buyer pages (${commercialPathsFound.slice(0, 2).join(', ')}). Buyer-intent diagnoses (intent_mix_gap, funnel_disconnect, buyer_intent_invisible) apply.`
            : `Commercial site (inferred from ${(buyerShare * 100).toFixed(0)}% buyer-intent traffic share). Buyer-intent diagnoses apply.`;
    } else if (looksLikeDocs) {
        type = 'content';
        confidence = 'high';
        verdict = `Documentation/developer site — heavy /docs|/api paths, ${(navigationalShare * 100).toFixed(0)}% navigational queries. Goal is developer adoption, NOT conversions. Skip buyer-intent diagnoses; check publishing velocity, retention, and topic depth instead.`;
    } else if (looksLikePortfolio) {
        type = 'content';
        confidence = 'medium';
        verdict = `Portfolio/personal-brand site — ${(brandedShare * 100).toFixed(0)}% branded queries, narrow page surface. Goal is brand recognition and inbound contact, NOT conversion funnels. High brand share is GOOD here, not a risk.`;
    } else if (hasContentPaths && !hasCommercialPaths && buyerShare < 0.05) {
        type = 'content';
        confidence = 'high';
        verdict = `Content/blog site — heavy content paths (${contentPathsFound.slice(0, 2).join(', ')}), no commercial paths, ${(buyerShare * 100).toFixed(0)}% buyer-intent traffic. Goal is readers, subscribers, awareness — NOT direct conversion. Skip buyer-intent diagnoses; check publishing cadence, content decay, retention, and email capture.`;
    } else if (totalImp < 100 || allPagePaths.length < 3) {
        type = 'unknown';
        confidence = 'low';
        verdict = `Site type unclear — too little data to classify (${totalImp} impressions, ${allPagePaths.length} pages tracked). Skip strategic-direction diagnoses until more data arrives.`;
    } else {
        type = 'unknown';
        confidence = 'low';
        verdict = `Site type unclear — no commercial paths and no clear content paths. Could be a landing page, microsite, or atypical structure. Treat strategic diagnoses with caution and ask the user about their growth goal before recommending.`;
    }

    // ─── Edge-case flags ───
    const distinctQueries = queries.length;
    const infantSite = (totalImp < 100 && totalImp > 0) || (distinctQueries < 5 && distinctQueries > 0);

    // Connection presence — has GSC if seoContext present and queries exist; has GA4 if analytics has KPIs
    const hasGsc = !!input.seoContext && (distinctQueries > 0 || (input.seoContext.kpis && (input.seoContext.kpis.totalClicks || 0) > 0));
    const hasGa4 = !!input.analyticsContext && !!input.analyticsContext.kpis && ((input.analyticsContext.kpis.totalSessions || 0) > 0 || (input.analyticsContext.kpis.totalUsers || 0) > 0);
    const partialConnection: SiteProfile['partialConnection'] =
        hasGsc && hasGa4 ? 'both'
        : hasGsc && !hasGa4 ? 'gsc_only'
        : !hasGsc && hasGa4 ? 'ga4_only'
        : 'none';

    // Non-English share: top queries containing chars outside basic Latin range
    let nonAsciiCount = 0;
    const sampleSize = Math.min(queries.length, 20);
    for (let i = 0; i < sampleSize; i++) {
        const q = queries[i]?.query || '';
        if (q && /[^\x00-\x7F]/.test(q)) nonAsciiCount++;
    }
    const nonAsciiQueryShare = sampleSize > 0 ? nonAsciiCount / sampleSize : 0;
    const monolingualNonEnglish: SiteProfile['monolingualNonEnglish'] = nonAsciiQueryShare >= 0.5
        ? { detected: detectScriptHint(queries.slice(0, 20).map((q: any) => q.query || '')) }
        : null;

    return {
        type,
        confidence,
        hasCommercialPaths,
        hasContentPaths,
        hasBuyerIntentQueries,
        looksLikePortfolio,
        looksLikeDocs,
        infantSite,
        partialConnection,
        monolingualNonEnglish,
        signals: {
            commercialPathsFound: [...new Set(commercialPathsFound)].slice(0, 5),
            contentPathsFound: [...new Set(contentPathsFound)].slice(0, 5),
            buyerIntentSamples,
            navigationalShare: +navigationalShare.toFixed(3),
            brandedShare: +brandedShare.toFixed(3),
            informationalShare: +informationalShare.toFixed(3),
            commercialShare: +commercialShare.toFixed(3),
            transactionalShare: +transactionalShare.toFixed(3),
            totalImpressions: totalImp,
            distinctQueries,
            nonAsciiQueryShare: +nonAsciiQueryShare.toFixed(3),
        },
        verdict,
    };
}

/** Tiny heuristic to give the LLM a hint about which non-Latin script dominates.
 *  Not a full language detector — the franc lib is overkill here when the goal is
 *  just "tell the LLM the audience isn't reading English". */
function detectScriptHint(samples: string[]): string {
    let cyrillic = 0, cjk = 0, arabic = 0, devanagari = 0, hebrew = 0, thai = 0, korean = 0;
    for (const s of samples) {
        if (!s) continue;
        if (/[Ѐ-ӿ]/.test(s)) cyrillic++;
        if (/[一-鿿぀-ヿ]/.test(s)) cjk++;
        if (/[؀-ۿ]/.test(s)) arabic++;
        if (/[ऀ-ॿ]/.test(s)) devanagari++;
        if (/[֐-׿]/.test(s)) hebrew++;
        if (/[฀-๿]/.test(s)) thai++;
        if (/[가-힯]/.test(s)) korean++;
    }
    const top = [
        ['cyrillic (likely Russian/Ukrainian/Bulgarian)', cyrillic],
        ['CJK (likely Chinese/Japanese)', cjk],
        ['Korean', korean],
        ['Arabic', arabic],
        ['Devanagari (likely Hindi/Marathi)', devanagari],
        ['Hebrew', hebrew],
        ['Thai', thai],
    ].sort((a, b) => (b[1] as number) - (a[1] as number));
    return (top[0][1] as number) > 0 ? (top[0][0] as string) : 'non-English (mixed)';
}

// ─── Detectors ───

/** CTR leak: page (or query) with high impressions + position ≤10 + CTR << expected. */
function detectCtrLeaks(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const queries = readQueries(input.seoContext);
    const pages = readPages(input.seoContext);

    // Page-level CTR leaks (most actionable — fixes a single title/meta and helps every query the page ranks for)
    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const impressions = toInt(p.impressions);
        const position = toPos(p.position);
        const ctrPct = toCtrPct(p.ctr);
        if (impressions < MIN_IMP_FOR_LEAK) continue;
        if (position <= 0 || position > 10) continue;
        const expected = expectedCTR(position);
        if (ctrPct >= expected * 0.7) continue; // need >30% gap
        const path = pathOf(p.page || p.url || '');
        // Find the dominant query for this page so we can talk about intent + meta
        const dominantQuery = queries.find((q: any) => q.page === path) || null;
        const headlineQuery = dominantQuery?.query || null;
        const valuePerClick = intentValuePerClick(headlineQuery);
        const proj = estimateCtrFixGain(impressions, position, ctrPct, TARGET_CTR_RECOVERY, valuePerClick);
        if (proj.monthlyValue < 30) continue; // skip rounding-error opportunities
        const meta = input.pageMeta?.get(path);

        out.push({
            id: `ctr-leak-${path.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'ctr_leak',
            severity: proj.monthlyValue >= 1000 ? 'critical' : proj.monthlyValue >= 300 ? 'high' : 'medium',
            title: `CTR leak on ${path}`,
            page: path,
            query: headlineQuery,
            evidence: {
                impressions,
                position: +position.toFixed(1),
                currentCtrPct: +ctrPct.toFixed(2),
                expectedCtrPct: +expected.toFixed(1),
                gapPct: +(expected - ctrPct).toFixed(1),
                currentClicks: proj.currentClicks,
                projectedClicks: proj.targetClicks,
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 15,
            difficulty: 'easy',
            why: `${path} hits ${impressions.toLocaleString()} impressions/mo at position ${position.toFixed(1)}. The expected CTR at that position is ~${expected.toFixed(1)}%, but you're at ${ctrPct.toFixed(1)}% — a ${(expected - ctrPct).toFixed(1)}-point gap. Closing 60% of that gap unlocks ~${proj.extraClicks.toLocaleString()} clicks/mo at $${valuePerClick.toFixed(2)} intent value = $${proj.monthlyValue.toLocaleString()}/mo.`,
            fix: {
                type: 'meta_title_rewrite',
                description: `Rewrite the <title> and <meta description> for ${path} to lead with the search intent and add a curiosity hook (numbers, year, value-prop). Target CTR ~${(ctrPct + (expected - ctrPct) * TARGET_CTR_RECOVERY).toFixed(1)}%.`,
                before: meta?.title ? `Title: ${meta.title}${meta.description ? ` | Meta: ${meta.description}` : ''}` : undefined,
            },
            receipts: [`gsc.pages[${i}]`, dominantQuery ? `gsc.queries[${queries.indexOf(dominantQuery)}]` : ''].filter(Boolean),
        });
    }

    // Query-level CTR leaks (only if no page-level leak already covers them — dedupe on page)
    const pagesWithLeak = new Set(out.map(o => o.page));
    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const impressions = toInt(q.impressions);
        const position = toPos(q.position);
        const ctrPct = toCtrPct(q.ctr);
        if (impressions < MIN_IMP_FOR_LEAK) continue;
        if (position <= 0 || position > 10) continue;
        const expected = expectedCTR(position);
        if (ctrPct >= expected * 0.7) continue;
        const queryPage = q.page ? pathOf(q.page) : null;
        if (queryPage && pagesWithLeak.has(queryPage)) continue;
        const valuePerClick = intentValuePerClick(q.query);
        const proj = estimateCtrFixGain(impressions, position, ctrPct, TARGET_CTR_RECOVERY, valuePerClick);
        if (proj.monthlyValue < 30) continue;

        out.push({
            id: `ctr-leak-q-${(q.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'ctr_leak',
            severity: proj.monthlyValue >= 1000 ? 'critical' : proj.monthlyValue >= 300 ? 'high' : 'medium',
            title: `CTR leak on "${q.query}"`,
            page: queryPage,
            query: q.query,
            evidence: {
                impressions,
                position: +position.toFixed(1),
                currentCtrPct: +ctrPct.toFixed(2),
                expectedCtrPct: +expected.toFixed(1),
                gapPct: +(expected - ctrPct).toFixed(1),
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 20,
            difficulty: 'easy',
            why: `"${q.query}" hits ${impressions.toLocaleString()} imps at pos ${position.toFixed(1)} but only ${ctrPct.toFixed(1)}% CTR (expected ~${expected.toFixed(1)}%). The page targeting this query is hiding under a poor title. Worth $${proj.monthlyValue.toLocaleString()}/mo if fixed.`,
            fix: {
                type: 'meta_title_rewrite',
                description: `Find the page ranking for "${q.query}" and rewrite its title to match user intent. Use the keyword in the first 30 chars; add a year, number, or differentiator after.`,
            },
            receipts: [`gsc.queries[${i}]`],
        });
    }

    return out;
}

/** Striking distance: query at pos 4-15 with high impressions — small push = big win. */
function detectStrikingDistance(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const queries = readQueries(input.seoContext);

    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const impressions = toInt(q.impressions);
        const position = toPos(q.position);
        const ctrPct = toCtrPct(q.ctr);
        if (impressions < MIN_IMP_FOR_OPP) continue;
        if (position < 4 || position > 15) continue;
        const valuePerClick = intentValuePerClick(q.query);
        const proj = estimatePositionGain(impressions, position, TARGET_POSITION_FOR_STRIKING, ctrPct, valuePerClick);
        if (proj.monthlyValue < 50) continue;

        const difficulty: 'easy' | 'medium' | 'hard' = position <= 7 ? 'medium' : 'hard';
        const effort = position <= 7 ? 60 : 240;
        const queryPage = q.page ? pathOf(q.page) : null;

        out.push({
            id: `striking-${(q.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'striking_distance',
            severity: proj.monthlyValue >= 1500 ? 'critical' : proj.monthlyValue >= 500 ? 'high' : 'medium',
            title: `Striking distance: "${q.query}" pos ${position.toFixed(1)} → 3`,
            page: queryPage,
            query: q.query,
            evidence: {
                impressions,
                currentPosition: +position.toFixed(1),
                targetPosition: TARGET_POSITION_FOR_STRIKING,
                currentClicks: proj.currentClicks,
                projectedClicks: proj.targetClicks,
                currentCtrPct: +ctrPct.toFixed(2),
                targetCtrPct: +proj.targetCtrPct.toFixed(1),
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: effort,
            difficulty,
            why: `"${q.query}" sits at position ${position.toFixed(1)} with ${impressions.toLocaleString()} impressions/mo — already on page 1 territory. Pushing to position 3 (CTR ${proj.targetCtrPct.toFixed(1)}% vs current ${ctrPct.toFixed(1)}%) would unlock ~${proj.extraClicks.toLocaleString()} clicks/mo.`,
            fix: {
                type: 'refresh_content',
                description: `Beef up the page ranking for "${q.query}": add a deeper section answering the query, link in 2-3 internal authority pages, refresh the publish date, and add 1-2 schema types matching the SERP intent.`,
            },
            receipts: [`gsc.queries[${i}]`],
        });
    }

    return out;
}

/** Cannibalization: same query, 2+ pages competing — pick winner, redirect or de-target the rest. */
function detectCannibalization(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const items = input.cannibalization?.cannibalized || [];

    for (let i = 0; i < items.length; i++) {
        const c = items[i];
        const totalImpressions = toInt(c.totalImpressions);
        const totalClicks = toInt(c.totalClicks);
        if (totalImpressions < 100) continue;
        if (!c.pages || c.pages.length < 2) continue;

        const bestPage = c.pages[0];
        const bestPos = toPos(c.bestPosition || bestPage.position);
        const bestCtr = toCtrPct(bestPage.ctr);
        const valuePerClick = intentValuePerClick(c.query);
        // Estimate: if we consolidated, the winner page would gain the impressions and rank ~1 step better
        const estGainPos = Math.max(1, bestPos - 1);
        const proj = estimatePositionGain(totalImpressions, bestPos, estGainPos, bestCtr, valuePerClick);

        out.push({
            id: `cannibal-${(c.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'cannibalization',
            severity: c.severity === 'high' ? 'high' : c.severity === 'medium' ? 'medium' : 'low',
            title: `Cannibalization on "${c.query}" (${c.pages.length} pages)`,
            page: bestPage.page || null,
            query: c.query,
            evidence: {
                pageCount: c.pages.length,
                totalImpressions,
                totalClicks,
                bestPage: bestPage.page,
                bestPosition: bestPos,
                otherPages: c.pages.slice(1).map((p: any) => `${p.page} (pos ${p.position})`).join(', '),
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 90,
            difficulty: 'medium',
            why: `Google sees ${c.pages.length} pages on your site competing for "${c.query}" (${totalImpressions.toLocaleString()} imps/mo). The strongest page (${bestPage.page} at pos ${bestPos.toFixed(1)}) is being held back by sibling pages diluting topical relevance. Pick a winner; redirect or de-target the others.`,
            fix: {
                type: 'consolidate_pages',
                description: `Make ${bestPage.page} the canonical target for "${c.query}". For competing pages: either 301-redirect to ${bestPage.page}, OR rewrite their titles to target a different intent variant of the query.`,
            },
            receipts: [`cannibal[${i}]`],
        });
    }

    return out;
}

/** Content decay: query/page that lost a meaningful slice of clicks vs prior period. */
function detectContentDecay(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const losers: any[] = input.winnersLosers?.losers || [];

    for (let i = 0; i < losers.length; i++) {
        const l = losers[i];
        const clicksLost = Math.max(0, -toInt(l.clicksDelta));
        const positionDelta = toPos(l.positionDelta);
        const impressions = toInt(l.impressionsCurrent);
        if (clicksLost < 10) continue;
        const valuePerClick = intentValuePerClick(l.query);
        const monthlyValueLost = Math.round(clicksLost * valuePerClick);
        if (monthlyValueLost < 50) continue;

        out.push({
            id: `decay-${(l.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'content_decay',
            severity: clicksLost >= 200 ? 'critical' : clicksLost >= 50 ? 'high' : 'medium',
            title: `"${l.query}" losing clicks: -${clicksLost} (${l.clicksDeltaPct}%)`,
            page: null,
            query: l.query,
            evidence: {
                clicksCurrent: toInt(l.clicksCurrent),
                clicksPrevious: toInt(l.clicksPrevious),
                clicksLost,
                clicksDeltaPct: toPos(l.clicksDeltaPct),
                positionCurrent: toPos(l.positionCurrent),
                positionPrevious: toPos(l.positionPrevious),
                positionDelta,
                impressions,
                valuePerClick,
            },
            monthlyValueLost,
            estClicksGain: clicksLost,
            effortMinutes: 60,
            difficulty: 'medium',
            why: `"${l.query}" dropped from ${l.clicksPrevious} to ${l.clicksCurrent} clicks (${l.clicksDeltaPct}%)${positionDelta > 0 ? `, slipping ${positionDelta.toFixed(1)} positions to ${l.positionCurrent.toFixed(1)}` : ''}. Either Google's algorithm shifted, a competitor took the slot, or your content went stale. Refresh the page targeting this query and re-publish.`,
            fix: {
                type: 'refresh_content',
                description: `Pull up the page ranking for "${l.query}", update the date, refresh statistics, add a new top-of-page summary, and republish. Then request indexing in GSC.`,
            },
            receipts: [`wl.losers[${i}]`],
        });
    }

    return out;
}

/** Position regression: query that lost 5+ positions but might still recover. */
function detectPositionRegression(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const losers: any[] = input.winnersLosers?.losers || [];
    for (let i = 0; i < losers.length; i++) {
        const l = losers[i];
        const positionDelta = toPos(l.positionDelta);
        if (positionDelta < 5) continue; // only big slips
        const impressions = toInt(l.impressionsCurrent);
        if (impressions < 100) continue;
        const valuePerClick = intentValuePerClick(l.query);
        const monthlyValueLost = Math.round(toInt(l.clicksPrevious) - toInt(l.clicksCurrent)) * valuePerClick;
        if (monthlyValueLost < 50) continue;

        out.push({
            id: `regression-${(l.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'position_regression',
            severity: positionDelta >= 10 ? 'critical' : 'high',
            title: `"${l.query}" position slipped ${positionDelta.toFixed(1)} spots`,
            page: null,
            query: l.query,
            evidence: {
                positionPrevious: toPos(l.positionPrevious),
                positionCurrent: toPos(l.positionCurrent),
                positionDelta,
                clicksCurrent: toInt(l.clicksCurrent),
                clicksPrevious: toInt(l.clicksPrevious),
                impressions,
            },
            monthlyValueLost: Math.round(monthlyValueLost),
            estClicksGain: Math.max(0, toInt(l.clicksPrevious) - toInt(l.clicksCurrent)),
            effortMinutes: 90,
            difficulty: 'medium',
            why: `"${l.query}" went from position ${toPos(l.positionPrevious).toFixed(1)} to ${toPos(l.positionCurrent).toFixed(1)} — a ${positionDelta.toFixed(1)}-point slide. Diagnose: did a competitor publish? Did you change the page? Investigate the SERP and check recent commits to the ranking page.`,
            fix: {
                type: 'investigate',
                description: `Open the SERP for "${l.query}". Compare your page to the top 3 results. Check git log for changes to the ranking page in the last 30 days.`,
            },
            receipts: [`wl.losers[${i}]`],
        });
    }
    return out;
}

/** Mobile gap: query where mobile rank is 3+ positions worse than desktop. */
function detectMobileGap(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const items = input.mobileGap?.data || input.mobileGap?.gaps || [];
    for (let i = 0; i < items.length; i++) {
        const g = items[i];
        const gap = Math.abs(toPos(g.gap));
        const mobilePos = toPos(g.mobilePosition);
        const mobileImp = toInt(g.mobileImpressions);
        // Only flag when mobile is meaningfully worse and there's volume
        if (gap < 3) continue;
        if (mobileImp < 100) continue;
        // gap > 0 means desktop ranked better than mobile in some computations; route's compute is desktop - mobile
        const mobileWorse = toPos(g.mobilePosition) > toPos(g.desktopPosition);
        if (!mobileWorse) continue;
        const valuePerClick = intentValuePerClick(g.query);
        // If mobile matched desktop position, projected gain is the diff
        const proj = estimatePositionGain(mobileImp, mobilePos, toPos(g.desktopPosition), toCtrPct(g.mobileCtr) * 100, valuePerClick);
        if (proj.monthlyValue < 50) continue;

        out.push({
            id: `mobile-gap-${(g.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'mobile_gap',
            severity: gap >= 6 ? 'high' : 'medium',
            title: `Mobile lagging desktop on "${g.query}" by ${gap.toFixed(1)} positions`,
            page: null,
            query: g.query,
            evidence: {
                mobilePosition: mobilePos,
                desktopPosition: toPos(g.desktopPosition),
                gap,
                mobileImpressions: mobileImp,
                desktopImpressions: toInt(g.desktopImpressions),
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 180,
            difficulty: 'hard',
            why: `Mobile rank for "${g.query}" is ${mobilePos.toFixed(1)} but desktop is ${toPos(g.desktopPosition).toFixed(1)}. Mobile is the majority of search traffic. Likely culprits: Core Web Vitals, viewport-specific layout shifts, or a mobile-only meta override.`,
            fix: {
                type: 'mobile_optimize',
                description: `Run PageSpeed mobile audit on the page ranking for "${g.query}". Address LCP > 2.5s and CLS > 0.1 issues. Also check if the page has a mobile-specific viewport, font, or layout that hurts E-E-A-T.`,
            },
            receipts: [`mobile[${i}]`],
        });
    }
    return out;
}

/** Branded overdependence: branded clicks > 70% of total — fragile, no SEO defensibility. */
function detectBrandedOverdependence(input: InsightInput): RankedInsight[] {
    if (!input.brand) return [];
    // Skip for portfolio sites — high branded share is the WHOLE POINT of a personal brand.
    const profile = input.siteProfile;
    if (profile?.looksLikePortfolio) return [];
    const queries = readQueries(input.seoContext);
    let brandedClicks = 0;
    let nonBrandedClicks = 0;
    for (const q of queries) {
        const c = toInt(q.clicks);
        if (isBrandedQuery(q.query, input.brand)) brandedClicks += c;
        else nonBrandedClicks += c;
    }
    const totalClicks = brandedClicks + nonBrandedClicks;
    if (totalClicks < 100) return [];
    const brandedPct = totalClicks > 0 ? (brandedClicks / totalClicks) * 100 : 0;
    if (brandedPct < 70) return [];
    // For content sites, high branded share is acceptable — readers come back. Soften messaging.
    const isContent = profile?.type === 'content';
    return [{
        id: 'branded-overdep',
        rank: 0,
        category: 'branded_overdependence',
        severity: brandedPct > 85 ? 'high' : 'medium',
        title: isContent
            ? `${brandedPct.toFixed(0)}% of clicks are returning readers searching your name — limited new-reader acquisition`
            : `${brandedPct.toFixed(0)}% of clicks come from branded queries`,
        page: null,
        query: null,
        evidence: { brandedClicks, nonBrandedClicks, brandedPct: +brandedPct.toFixed(1), totalClicks, siteType: profile?.type || 'unknown' },
        monthlyValueLost: 0,
        estClicksGain: 0,
        effortMinutes: 600,
        difficulty: 'hard',
        why: isContent
            ? `${brandedPct.toFixed(0)}% of your clicks come from people who already know your name and are coming back. That's loyal readership — good for retention. But it also means you're not capturing new readers from search. To grow your audience, you need topical authority on 2-3 non-branded subject areas readers can discover you through.`
            : `${brandedPct.toFixed(0)}% of your organic clicks come from people searching your brand name. That means if your name awareness drops, your traffic drops with it. You have no SEO moat. Build non-branded topical authority by publishing on 3-5 related search-intent topics.`,
        fix: {
            type: 'create_page',
            description: isContent
                ? `Pick 2-3 topics where you have authentic depth (your domain expertise) and commit to a 6-month publishing plan covering long-tail informational queries inside those topics. Optimize for "how to", "what is", "best [thing]" patterns. Goal: 30%+ non-branded clicks within 6 months.`
                : `Identify 3 informational queries adjacent to your product (use Google Suggest, "People also ask", or competitor pages). Create one cornerstone page per query. Target 1500+ words, schema, internal links.`,
        },
        receipts: ['gsc.queries.aggregate'],
    }];
}

/** New query opportunity: query that just appeared in the last period — get there first. */
function detectNewQueryOpportunity(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const newQ: any[] = input.winnersLosers?.new || [];
    for (let i = 0; i < newQ.length; i++) {
        const q = newQ[i];
        const clicks = toInt(q.clicksCurrent);
        const impressions = toInt(q.impressionsCurrent);
        const position = toPos(q.positionCurrent);
        if (clicks < 5 || impressions < 50) continue;
        const valuePerClick = intentValuePerClick(q.query);
        // If we move to position 3, what's the upside?
        const proj = estimatePositionGain(impressions, position, 3, expectedCTR(position), valuePerClick);
        if (proj.monthlyValue < 50) continue;

        out.push({
            id: `new-q-${(q.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'new_query_opportunity',
            severity: 'medium',
            title: `New query gaining traction: "${q.query}"`,
            page: null,
            query: q.query,
            evidence: {
                clicks,
                impressions,
                position: +position.toFixed(1),
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 120,
            difficulty: 'medium',
            why: `"${q.query}" is a new query you've started ranking for (${impressions} imps in the last period). It didn't appear before. Capitalize fast: optimize a dedicated page for it before competitors notice.`,
            fix: {
                type: 'refresh_content',
                description: `Find which page is ranking for "${q.query}" and add a dedicated H2 + 200-word section explicitly answering that query. Internal-link to it from 2-3 high-authority pages.`,
            },
            receipts: [`wl.new[${i}]`],
        });
    }
    return out;
}

/** Page-2 breakthrough: query at pos 11-15 with high imp — closer to page 1 than people think. */
function detectPage2Breakthrough(input: InsightInput): RankedInsight[] {
    const out: RankedInsight[] = [];
    const queries = readQueries(input.seoContext);
    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const position = toPos(q.position);
        const impressions = toInt(q.impressions);
        const ctrPct = toCtrPct(q.ctr);
        if (position < 11 || position > 15) continue;
        if (impressions < 200) continue;
        const valuePerClick = intentValuePerClick(q.query);
        const proj = estimatePositionGain(impressions, position, 7, ctrPct, valuePerClick);
        if (proj.monthlyValue < 60) continue;

        out.push({
            id: `page2-${(q.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${i}`,
            rank: 0,
            category: 'page_2_breakthrough',
            severity: 'medium',
            title: `Page-2 breakthrough candidate: "${q.query}"`,
            page: q.page ? pathOf(q.page) : null,
            query: q.query,
            evidence: {
                impressions,
                currentPosition: +position.toFixed(1),
                targetPosition: 7,
                currentClicks: proj.currentClicks,
                projectedClicks: proj.targetClicks,
                valuePerClick,
            },
            monthlyValueLost: proj.monthlyValue,
            estClicksGain: proj.extraClicks,
            effortMinutes: 180,
            difficulty: 'medium',
            why: `"${q.query}" is at position ${position.toFixed(1)} (page 2). With ${impressions.toLocaleString()} impressions/mo it's already relevant — Google just isn't convinced you're authoritative. Push to page 1 (pos 7) for $${proj.monthlyValue.toLocaleString()}/mo.`,
            fix: {
                type: 'refresh_content',
                description: `Expand the page targeting "${q.query}" by 30-50%, add 3-5 H2 subsections covering related sub-intents, add internal links from your top-performing pages, and submit to GSC for re-indexing.`,
            },
            receipts: [`gsc.queries[${i}]`],
        });
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════
// STRATEGIC DETECTORS — root-cause growth blockers, not tactical $ fixes.
// These answer "why isn't growth happening" rather than "what to tweak".
// They produce non-$-quantifiable findings that rank via priority score:
//   critical=8000, high=3000, medium=800, low=200.
// ═══════════════════════════════════════════════════════════════════════

const STRATEGIC_PRIORITY = { critical: 8000, high: 3000, medium: 800, low: 200 } as const;

/** Intent mix gap: traffic distribution is heavily informational/branded with little
 *  commercial or transactional intent. Site brings readers, not buyers.
 *
 *  GATE: only applies to commercial / mixed sites. A "no buyer-intent traffic"
 *  alarm is irrelevant for blogs, docs, portfolios, and personal sites — they
 *  don't WANT buyers, they want readers/subscribers/contributors.
 */
function detectIntentMixGap(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (profile && (profile.type === 'content' || profile.type === 'unknown')) return [];
    const queries = readQueries(input.seoContext);
    if (queries.length < 5) return [];

    let totalImp = 0, totalClicks = 0;
    const buckets: Record<QueryIntent, { impressions: number; clicks: number; queries: string[] }> = {
        transactional: { impressions: 0, clicks: 0, queries: [] },
        commercial: { impressions: 0, clicks: 0, queries: [] },
        informational: { impressions: 0, clicks: 0, queries: [] },
        branded: { impressions: 0, clicks: 0, queries: [] },
        navigational: { impressions: 0, clicks: 0, queries: [] },
        other: { impressions: 0, clicks: 0, queries: [] },
    };

    for (const q of queries) {
        const intent = classifyQueryIntent(q.query, input.brand);
        const imp = toInt(q.impressions);
        const clk = toInt(q.clicks);
        buckets[intent].impressions += imp;
        buckets[intent].clicks += clk;
        if (buckets[intent].queries.length < 3) buckets[intent].queries.push(q.query);
        totalImp += imp;
        totalClicks += clk;
    }
    if (totalImp < 100) return [];

    const buyerImp = buckets.transactional.impressions + buckets.commercial.impressions;
    const buyerPct = (buyerImp / totalImp) * 100;
    const infoImp = buckets.informational.impressions;
    const infoPct = (infoImp / totalImp) * 100;
    const buyerClicks = buckets.transactional.clicks + buckets.commercial.clicks;
    const buyerClicksPct = totalClicks > 0 ? (buyerClicks / totalClicks) * 100 : 0;

    let severity: InsightSeverity;
    let priority: number;
    let title: string;
    if (buyerPct < 5) {
        severity = 'critical';
        priority = STRATEGIC_PRIORITY.critical;
        title = `ZERO buyer-intent visibility — only ${buyerPct.toFixed(1)}% of impressions are commercial/transactional`;
    } else if (buyerPct < 15) {
        severity = 'high';
        priority = STRATEGIC_PRIORITY.high;
        title = `Weak buyer-intent visibility — ${buyerPct.toFixed(1)}% of impressions are commercial/transactional`;
    } else if (buyerPct < 30) {
        severity = 'medium';
        priority = STRATEGIC_PRIORITY.medium;
        title = `Buyer-intent traffic underweight — ${buyerPct.toFixed(1)}% commercial/transactional`;
    } else {
        return []; // healthy mix
    }

    return [{
        id: 'intent-mix-gap',
        rank: 0,
        category: 'intent_mix_gap',
        severity,
        title,
        page: null,
        query: null,
        evidence: {
            buyerIntentImpressionsPct: +buyerPct.toFixed(1),
            buyerIntentClicksPct: +buyerClicksPct.toFixed(1),
            informationalImpressionsPct: +infoPct.toFixed(1),
            transactionalImp: buckets.transactional.impressions,
            commercialImp: buckets.commercial.impressions,
            informationalImp: buckets.informational.impressions,
            brandedImp: buckets.branded.impressions,
            sampleTransactional: buckets.transactional.queries.join(', ') || '(none)',
            sampleCommercial: buckets.commercial.queries.join(', ') || '(none)',
            sampleInformational: buckets.informational.queries.slice(0, 3).join(', ') || '(none)',
            totalQueriesAnalyzed: queries.length,
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 1200,
        difficulty: 'hard',
        why: `${buyerPct.toFixed(1)}% of your impressions come from commercial or transactional queries — searches by people who want to BUY. ${infoPct.toFixed(1)}% are informational ("how to", "what is"). You're attracting readers, not customers. This is the root cause of "lots of traffic, no growth": Google sees you as a content site, not a product site. Fix: build dedicated landing pages for buyer-intent queries (pricing comparisons, alternatives pages, "[your product] for [use case]").`,
        fix: {
            type: 'create_buyer_intent_pages',
            description: `Identify 5-7 buyer-intent queries adjacent to your product (e.g., "[product] vs competitor", "[product] for [use case]", "[product] alternative"). Create one cornerstone page per query: 1500+ words, schema, internal links from existing top-traffic pages. Re-balance your content calendar so 30%+ of new posts target commercial intent.`,
        },
        receipts: ['gsc.queries.intent_mix'],
    }];
}

/** Buyer-intent invisibility: branded transactional queries (e.g., "[brand] pricing")
 *  do not appear in the top queries list at all.
 *
 *  GATE: only commercial / mixed sites. A blog or portfolio doesn't have "[brand] pricing"
 *  because it doesn't sell anything.
 */
function detectBuyerIntentInvisible(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (profile && (profile.type === 'content' || profile.type === 'unknown')) return [];
    const brand = input.brand;
    if (!brand) return [];
    const queries = readQueries(input.seoContext);
    if (queries.length < 5) return [];

    const expectedBuyerPatterns = ['pricing', 'cost', 'price', 'plans', 'review', 'reviews', 'vs', 'alternative', 'alternatives', 'login', 'sign up', 'signup', 'demo', 'free trial'];
    const queryStrings = queries.map((q: any) => (q.query || '').toLowerCase());
    const found: string[] = [];
    const missing: string[] = [];
    for (const pat of expectedBuyerPatterns) {
        const hit = queryStrings.some((q: string) => q.includes(brand) && q.includes(pat));
        if (hit) found.push(pat);
        else missing.push(pat);
    }

    // Need at least some branded query presence to compute this meaningfully
    const brandedQueries = queries.filter((q: any) => isBrandedQuery(q.query, brand));
    const brandedImp = brandedQueries.reduce((s: number, q: any) => s + toInt(q.impressions), 0);
    if (brandedImp < 30) return []; // not enough brand presence to measure

    if (missing.length < 4) return []; // most patterns found — healthy

    const severity: InsightSeverity = missing.length >= 8 ? 'high' : 'medium';
    const priority = severity === 'high' ? STRATEGIC_PRIORITY.high : STRATEGIC_PRIORITY.medium;

    return [{
        id: 'buyer-intent-invisible',
        rank: 0,
        category: 'buyer_intent_invisible',
        severity,
        title: `Bottom-of-funnel branded queries missing (${missing.length}/${expectedBuyerPatterns.length})`,
        page: null,
        query: null,
        evidence: {
            brand,
            brandedImpressions: brandedImp,
            foundPatterns: found.join(', ') || '(none)',
            missingPatterns: missing.join(', '),
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 360,
        difficulty: 'medium',
        why: `People who already know your brand and are about to buy search for things like "${brand} pricing", "${brand} vs [competitor]", "${brand} reviews", "${brand} alternative". Of ${expectedBuyerPatterns.length} standard buyer-intent patterns, ${missing.length} don't appear in your top queries. This means: when someone is about to convert, they can't find your dedicated landing page. Either you don't have those pages, or they're not indexed/optimized.`,
        fix: {
            type: 'create_buyer_intent_pages',
            description: `Audit whether you have dedicated pages for: ${missing.slice(0, 5).join(', ')}. If missing, create them — these are the highest-converting page types per dollar of effort. Link to them from your top-traffic content pages and footer.`,
        },
        receipts: ['gsc.queries.brand_invisible'],
    }];
}

/** Topic concentration: top-5 pages own >70% of clicks → narrow topical surface. */
function detectTopicConcentration(input: InsightInput): RankedInsight[] {
    const pages = readPages(input.seoContext);
    if (pages.length < 5) return [];
    const totalClicks = pages.reduce((s: number, p: any) => s + toInt(p.clicks), 0);
    if (totalClicks < 100) return [];

    const sorted = [...pages].sort((a: any, b: any) => toInt(b.clicks) - toInt(a.clicks));
    const top5 = sorted.slice(0, 5);
    const top5Clicks = top5.reduce((s: number, p: any) => s + toInt(p.clicks), 0);
    const top5Pct = (top5Clicks / totalClicks) * 100;

    let severity: InsightSeverity;
    let priority: number;
    let title: string;
    if (top5Pct >= 90) {
        severity = 'critical';
        priority = STRATEGIC_PRIORITY.critical;
        title = `${top5Pct.toFixed(0)}% of clicks come from just 5 pages — extreme single-page-of-failure risk`;
    } else if (top5Pct >= 80) {
        severity = 'high';
        priority = STRATEGIC_PRIORITY.high;
        title = `${top5Pct.toFixed(0)}% of clicks concentrated in 5 pages — narrow topical surface`;
    } else if (top5Pct >= 70) {
        severity = 'medium';
        priority = STRATEGIC_PRIORITY.medium;
        title = `${top5Pct.toFixed(0)}% of clicks in top 5 pages — concentration risk`;
    } else {
        return [];
    }

    const topPagesList = top5.map((p: any) => `${p.page} (${p.clicks}c)`).join(', ');

    return [{
        id: 'topic-concentration',
        rank: 0,
        category: 'topic_concentration',
        severity,
        title,
        page: null,
        query: null,
        evidence: {
            top5Pct: +top5Pct.toFixed(1),
            top5Clicks,
            totalClicks,
            otherPagesCount: pages.length - 5,
            otherPagesClicks: totalClicks - top5Clicks,
            topPages: topPagesList,
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 600,
        difficulty: 'hard',
        why: `${top5Pct.toFixed(0)}% of your organic clicks come from just 5 pages: ${topPagesList}. If any one of those drops in ranking, you lose a huge chunk of traffic instantly. Worse, Google sees you as topically narrow — making it harder to rank new content. The fix isn't to get more traffic to those pages; it's to broaden your topical authority by publishing supporting content around their themes.`,
        fix: {
            type: 'create_page',
            description: `Pick the top-3 traffic pages. For each, identify 4-5 sibling topics (related questions, sub-topics, comparison angles). Publish supporting articles linking back to the hero page. Goal: spread the click distribution so no single page is >25% of clicks within 6 months.`,
        },
        receipts: ['gsc.pages.concentration'],
    }];
}

/** Funnel disconnect: GA4 traffic lands heavily on content pages but rarely on
 *  conversion pages (pricing, signup, demo, contact).
 *
 *  GATE: only commercial / mixed sites. A pure blog or docs site has no funnel
 *  by design — flagging "no /pricing traffic" would be nonsense advice.
 */
function detectFunnelDisconnect(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (profile && (profile.type === 'content' || profile.type === 'unknown')) return [];
    const an = input.analyticsContext;
    if (!an) return [];
    const pages: any[] = an.pages || an.topPages || [];
    if (pages.length < 5) return [];

    const isContent = (path: string) => /\/(blog|article|articles|post|posts|guide|tutorial|tutorials|docs?|documentation|learn|news|insights?|resources?)\b/i.test(path);
    const isConversion = (path: string) => /\/(pricing|plans?|signup|sign-up|register|demo|trial|buy|cart|checkout|contact|book|schedule|get-started|start)\b/i.test(path);

    let contentViews = 0, conversionViews = 0;
    const contentPages: string[] = [];
    const conversionPages: string[] = [];
    for (const p of pages) {
        const path = p.page || p.path || '';
        const views = toInt(p.views || p.pageviews || p.value || 0);
        if (isContent(path)) {
            contentViews += views;
            if (contentPages.length < 3) contentPages.push(`${path} (${views}v)`);
        } else if (isConversion(path)) {
            conversionViews += views;
            if (conversionPages.length < 3) conversionPages.push(`${path} (${views}v)`);
        }
    }
    const total = contentViews + conversionViews;
    if (total < 100) return []; // not enough volume to judge
    if (contentViews < 100) return []; // no content pages — different problem
    const conversionRatio = (conversionViews / Math.max(contentViews, 1)) * 100;

    let severity: InsightSeverity;
    let priority: number;
    let title: string;
    if (conversionRatio < 2) {
        severity = 'critical';
        priority = STRATEGIC_PRIORITY.critical;
        title = `Content readers never reach conversion pages (ratio ${conversionRatio.toFixed(1)}%)`;
    } else if (conversionRatio < 8) {
        severity = 'high';
        priority = STRATEGIC_PRIORITY.high;
        title = `Funnel leak: only ${conversionRatio.toFixed(1)} conversion-page views per 100 content views`;
    } else if (conversionRatio < 15) {
        severity = 'medium';
        priority = STRATEGIC_PRIORITY.medium;
        title = `Funnel underperforming: ${conversionRatio.toFixed(1)} conversion views per 100 content views`;
    } else {
        return [];
    }

    return [{
        id: 'funnel-disconnect',
        rank: 0,
        category: 'funnel_disconnect',
        severity,
        title,
        page: null,
        query: null,
        evidence: {
            contentViews,
            conversionViews,
            conversionRatioPct: +conversionRatio.toFixed(1),
            sampleContentPages: contentPages.join(', ') || '(none)',
            sampleConversionPages: conversionPages.join(', ') || '(none — possibly missing)',
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 240,
        difficulty: 'medium',
        why: `Your content pages get ${contentViews.toLocaleString()} views but conversion-pattern pages (pricing/signup/demo/contact) get only ${conversionViews.toLocaleString()} — that's ${conversionRatio.toFixed(1)} conversion views per 100 content views. Either your content has no in-context CTAs, or your conversion pages aren't indexed/findable. Most readers leave without ever seeing what you sell.`,
        fix: {
            type: 'create_funnel',
            description: `Audit your top 5 content pages: each one should have at least 2 inline CTAs (sticky sidebar + bottom-of-post) pointing to /pricing or /demo. Add a "From the same author" or "Try it" widget. If you don't have a /pricing or /demo page yet, that's step 1.`,
        },
        receipts: ['ga4.pages.funnel'],
    }];
}

/** Channel concentration: a single GA4 channel owns >80% of sessions. */
function detectChannelConcentration(input: InsightInput): RankedInsight[] {
    const an = input.analyticsContext;
    const channels: any[] = an?.channels || [];
    if (channels.length === 0) return [];
    const sumValue = (c: any) => toInt(c.value ?? c.sessions ?? c.percentage ?? 0);
    const total = channels.reduce((s, c) => s + sumValue(c), 0);
    if (total < 50) return [];

    const sorted = [...channels].sort((a, b) => sumValue(b) - sumValue(a));
    const top = sorted[0];
    const topName = top.name || top.channel || top.source || 'Unknown';
    const topValue = sumValue(top);
    const topPct = (topValue / total) * 100;

    let severity: InsightSeverity;
    let priority: number;
    if (topPct >= 90) { severity = 'critical'; priority = STRATEGIC_PRIORITY.critical; }
    else if (topPct >= 80) { severity = 'high'; priority = STRATEGIC_PRIORITY.high; }
    else if (topPct >= 70) { severity = 'medium'; priority = STRATEGIC_PRIORITY.medium; }
    else return [];

    const title = `${topPct.toFixed(0)}% of traffic comes from ${topName} — single-channel dependency`;

    return [{
        id: 'channel-concentration',
        rank: 0,
        category: 'channel_concentration',
        severity,
        title,
        page: null,
        query: null,
        evidence: {
            topChannel: topName,
            topChannelPct: +topPct.toFixed(1),
            topChannelValue: topValue,
            channelCount: channels.length,
            channelMix: sorted.slice(0, 5).map(c => `${c.name || c.channel || 'Unknown'}:${sumValue(c)}`).join(', '),
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 1800,
        difficulty: 'hard',
        why: `${topPct.toFixed(0)}% of your traffic flows through ${topName}. If that channel changes (algo update, paid spend stops, social platform reach drops), your traffic collapses overnight. You have no acquisition diversity. Even one secondary channel above 15% would massively reduce risk.`,
        fix: {
            type: 'diversify_channels',
            description: `Pick ONE secondary channel to develop in the next 90 days based on where your audience already exists: email (newsletter signup on /pricing & top content), referral (3-5 strategic partnerships), or paid (LinkedIn/Google Search for transactional queries). Goal: secondary channel ≥15% of sessions within 6 months.`,
        },
        receipts: ['ga4.channels'],
    }];
}

/** Conversion opacity: GA4 has events but no conversions configured (best-effort detection). */
function detectConversionOpacity(input: InsightInput): RankedInsight[] {
    const an = input.analyticsContext;
    if (!an?.kpis) return [];
    const profile = input.siteProfile;
    // Skip entirely for portfolio sites — they likely don't have conversion goals.
    if (profile?.looksLikePortfolio) return [];
    const k = an.kpis;
    // Look for any conversion-related field. If we have GA4 KPIs but no conversion field, flag it.
    const hasConversionField = ['totalConversions', 'conversions', 'conversionRate', 'conversionValue', 'totalRevenue', 'purchaseRevenue'].some(field => field in k);
    const hasConversionValue = ['totalConversions', 'conversions'].some(field => toInt(k[field]) > 0);

    if (hasConversionField && hasConversionValue) return [];
    if (!hasConversionField && (k.totalSessions || k.totalUsers)) {
        // For content sites, the right "conversion" is newsletter / email / RSS — adapt message.
        const isContent = profile?.type === 'content';
        // GA4 is connected (has sessions/users) but no conversion fields — likely no events configured
        return [{
            id: 'conversion-opacity',
            rank: 0,
            category: 'conversion_opacity',
            severity: isContent ? 'medium' : 'high',
            title: isContent
                ? `GA4 has no engagement-goal events — you can't see what's working`
                : `GA4 connected but no conversion events visible — you can't measure growth`,
            page: null,
            query: null,
            evidence: {
                hasGA4: true,
                conversionFieldsPresent: hasConversionField,
                kpiFieldsAvailable: Object.keys(k).slice(0, 10).join(', '),
                siteType: profile?.type || 'unknown',
            },
            monthlyValueLost: 0,
            priority: isContent ? STRATEGIC_PRIORITY.medium : STRATEGIC_PRIORITY.high,
            isStrategic: true,
            estClicksGain: 0,
            effortMinutes: 60,
            difficulty: 'easy',
            why: isContent
                ? `Your GA4 tracks sessions but no engagement goals. For a content site, that means you can't see: which posts drive newsletter signups, which topics make readers stick, which referrers send loyal readers. Set up at least: newsletter_signup, scroll_depth_75, and external_link_click events. Without these, "what's working" is invisible.`
                : `Your GA4 reports sessions and users but I can't find conversion events. That means: you can't measure which traffic drives signups, which content drives revenue, or which channels are profitable. Every "growth" recommendation right now is flying blind. This is the FIRST thing to fix — nothing else's $-impact is verifiable until you can measure it.`,
            fix: {
                type: 'configure_analytics',
                description: `In GA4 → Admin → Events → mark these as conversions: sign_up, generate_lead, purchase (if e-comm), and any custom CTA-click event you track. Set up at least 2 conversion events. After 7 days, re-run the chat.`,
            },
            receipts: ['ga4.kpis.no_conversion'],
        }];
    }
    if (hasConversionField && !hasConversionValue) {
        return [{
            id: 'conversion-zero',
            rank: 0,
            category: 'conversion_opacity',
            severity: 'medium',
            title: `Conversion events configured but ZERO conversions recorded`,
            page: null,
            query: null,
            evidence: {
                hasGA4: true,
                conversionFieldsPresent: true,
                conversionsValue: toInt(k.totalConversions || k.conversions || 0),
            },
            monthlyValueLost: 0,
            priority: STRATEGIC_PRIORITY.medium,
            isStrategic: true,
            estClicksGain: 0,
            effortMinutes: 60,
            difficulty: 'easy',
            why: `You have conversion events set up, but they're firing zero times. Either your tagging is broken, the events are misnamed, or your site truly has no conversions. Either way: this signal is fundamental to measuring growth.`,
            fix: {
                type: 'configure_analytics',
                description: `Open GA4 → DebugView while you click your CTAs. Confirm the events fire with the right name. If they don't, your tracking is broken. Fix this before chasing any other "growth" insight.`,
            },
            receipts: ['ga4.kpis.zero_conversion'],
        }];
    }
    return [];
}

// ═══════════════════════════════════════════════════════════════════════
// CONTENT-SITE DETECTORS — for blogs, portfolios, docs, magazines, hobby
// sites. These ANSWER different growth questions: not "are you converting"
// but "are you publishing", "are you retaining readers", "do you capture
// emails", "is your topical surface broad enough".
// ═══════════════════════════════════════════════════════════════════════

/** Publishing velocity stall: content site shows no new queries appearing —
 *  the content engine has stopped feeding Google. */
function detectPublishingVelocityStall(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (!profile || (profile.type !== 'content' && profile.type !== 'mixed')) return [];
    const wl = input.winnersLosers;
    if (!wl) return []; // need winners-losers data to know "new queries"

    const newCount = (wl.new || []).length;
    const totalSignals = (wl.winners || []).length + (wl.losers || []).length + newCount;
    if (totalSignals < 5) return []; // not enough data

    let severity: InsightSeverity;
    let priority: number;
    let title: string;
    if (newCount === 0) {
        severity = 'critical';
        priority = STRATEGIC_PRIORITY.critical;
        title = `ZERO new queries appeared this period — your content engine has stopped`;
    } else if (newCount <= 2) {
        severity = 'high';
        priority = STRATEGIC_PRIORITY.high;
        title = `Only ${newCount} new query/queries appeared — publishing velocity is stalling`;
    } else if (newCount < 5 && (wl.losers || []).length > newCount * 2) {
        severity = 'medium';
        priority = STRATEGIC_PRIORITY.medium;
        title = `New queries (${newCount}) far outpaced by losing queries (${(wl.losers || []).length}) — content engine bleeding`;
    } else {
        return [];
    }

    return [{
        id: 'publishing-stall',
        rank: 0,
        category: 'publishing_velocity_stall',
        severity,
        title,
        page: null,
        query: null,
        evidence: {
            newQueriesThisPeriod: newCount,
            losersThisPeriod: (wl.losers || []).length,
            winnersThisPeriod: (wl.winners || []).length,
            siteType: profile.type,
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 1200,
        difficulty: 'medium',
        why: `Content sites grow by feeding Google new pages on rising search topics. In the last 28 days, only ${newCount} new query started bringing you clicks. ${newCount === 0 ? 'That means: nothing you published recently is getting indexed and ranked, OR you stopped publishing.' : 'That\'s under the threshold for a healthy content site.'} Without a publishing rhythm, you'll keep losing more queries than you add — the gradient is downward.`,
        fix: {
            type: 'create_page',
            description: `Audit your last 90 days of published content vs queries that appeared. If you published and they didn't appear: indexing/SEO problem (check robots.txt, sitemap, internal links to new posts). If you didn't publish: commit to 1 post/week for the next 8 weeks targeting long-tail informational queries from your existing topical surface.`,
        },
        receipts: ['wl.new'],
    }];
}

/** Audience capture missing: content site has no visible newsletter / subscribe / email
 *  signal anywhere — readers come and go without becoming an audience. */
function detectAudienceCaptureMissing(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (!profile || profile.type !== 'content') return [];

    const queries = readQueries(input.seoContext);
    const pages = readPages(input.seoContext);
    const an = input.analyticsContext;

    // Check for audience-capture signals across queries and pages
    const captureRe = /\b(newsletter|subscribe|subscription|email|signup|sign up|join|rss|feed)\b/i;
    const capturePathRe = /\/(newsletter|subscribe|subscription|join|rss|feed|signup)/i;

    const captureQueries = queries.filter((q: any) => captureRe.test(q.query || ''));
    const capturePages = pages.filter((p: any) => capturePathRe.test(p.page || p.url || ''));
    const ga4CapturePages = (an?.pages || an?.topPages || []).filter((p: any) => capturePathRe.test(p.page || p.path || ''));

    const hasAnyCapture = captureQueries.length > 0 || capturePages.length > 0 || ga4CapturePages.length > 0;
    if (hasAnyCapture) return [];

    // Need enough volume to declare this a real gap
    const totalClicks = queries.reduce((s: number, q: any) => s + toInt(q.clicks), 0);
    if (totalClicks < 200) return []; // not enough audience for capture to matter yet

    return [{
        id: 'audience-capture-missing',
        rank: 0,
        category: 'audience_capture_missing',
        severity: 'high',
        title: `No audience-capture path visible — readers come once and disappear`,
        page: null,
        query: null,
        evidence: {
            captureQueriesFound: captureQueries.length,
            capturePagesFound: capturePages.length,
            totalMonthlyClicks: totalClicks,
            siteType: profile.type,
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.high,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 240,
        difficulty: 'easy',
        why: `Your site brings ${totalClicks.toLocaleString()} clicks/mo of organic readers, but I can't find a /newsletter, /subscribe, /rss, or /signup page in your top pages — and no one searches for those terms on your site. That means: every reader is a one-time visitor. You're doing the hard work of attracting traffic with zero compounding return. The single highest-ROI move for a content site is converting traffic into an owned audience (email/RSS) before it leaves.`,
        fix: {
            type: 'create_funnel',
            description: `Add an inline email-capture widget to your top 5 traffic pages (between intro and first H2, AND at the end of post). Use a single-field form with one specific promise (e.g., "Get next week's post by email"). Build a /subscribe page targeting "[your topic] newsletter" as the SEO anchor. Goal: 3% conversion of organic visitors to email within 90 days.`,
        },
        receipts: ['gsc.queries.no_capture'],
    }];
}

/** Topical breadth narrow: content site with too few topic clusters concentrates risk. */
function detectTopicalBreadthNarrow(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (!profile || profile.type !== 'content') return [];

    const queries = readQueries(input.seoContext);
    if (queries.length < 5) return [];

    // Quick semantic clustering by longest meaningful word
    const clusters = new Map<string, number>();
    for (const q of queries) {
        const words = (q.query || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3 && !['with', 'this', 'that', 'from', 'have', 'your', 'what', 'when', 'where'].includes(w));
        const key = words.sort((a: string, b: string) => b.length - a.length)[0] || 'other';
        clusters.set(key, (clusters.get(key) || 0) + toInt(q.clicks));
    }
    // Keep clusters with ≥1 click
    const meaningfulClusters = [...clusters.entries()].filter(([, c]) => c > 0);
    const clusterCount = meaningfulClusters.length;
    if (clusterCount === 0) return [];

    // For a content site, healthy is 8+ clusters. Narrow is <4.
    if (clusterCount >= 5) return [];

    const severity: InsightSeverity = clusterCount <= 2 ? 'high' : 'medium';
    const priority = severity === 'high' ? STRATEGIC_PRIORITY.high : STRATEGIC_PRIORITY.medium;
    const topClusters = meaningfulClusters.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => `${k}(${c}c)`).join(', ');

    return [{
        id: 'topical-breadth-narrow',
        rank: 0,
        category: 'topical_breadth_narrow',
        severity,
        title: `Narrow topical footprint — only ${clusterCount} active topic cluster${clusterCount === 1 ? '' : 's'}`,
        page: null,
        query: null,
        evidence: {
            clusterCount,
            topClusters,
            queryCount: queries.length,
            siteType: profile.type,
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 1800,
        difficulty: 'hard',
        why: `Your content surface clusters into only ${clusterCount} meaningful topic${clusterCount === 1 ? '' : 's'} (${topClusters}). For a content site, that's narrow — Google rewards topical authority, but you can't dominate one tiny niche forever. If readers exhaust your cluster, they leave. Build out 1-2 adjacent clusters (related but distinct topics) over the next 6 months to broaden your footprint and reduce dependency on any single topic.`,
        fix: {
            type: 'create_page',
            description: `Pick 2 topic clusters adjacent to your strongest existing cluster (related, but search-distinct). For each, plan a 5-post mini-pillar (1 cornerstone + 4 supporting). Publish over 8 weeks. Aim for cluster count ≥ 6 within 6 months.`,
        },
        receipts: ['gsc.queries.cluster_breadth'],
    }];
}

// ═══════════════════════════════════════════════════════════════════════
// NEW DETECTORS DRIVEN BY EXPANDED DATA SOURCES (schema, PSI, cohort,
// journey, events, geo, time). These are the "wow" detectors — most fire
// only when a cross-source pattern is genuinely revealing.
// ═══════════════════════════════════════════════════════════════════════

/** AEO invisibility: site has no FAQPage / HowTo / Article schema → invisible
 *  in AI answers (Google SGE, Perplexity, ChatGPT, Claude). The "single biggest
 *  AEO win" for content sites. */
function detectAeoInvisibility(input: InsightInput): RankedInsight[] {
    const cov = input.schemaCoverage;
    if (!cov || cov.pagesFetched === 0) return [];
    const profile = input.siteProfile;
    // For content/portfolio/docs sites: FAQ / HowTo / Article schema is critical for AI answers
    // For commercial sites: same applies, plus Product / Organization
    const missing: string[] = [];
    if (!cov.hasFAQ) missing.push('FAQPage');
    if (!cov.hasArticleLike && profile?.type !== 'commercial') missing.push('Article (or BlogPosting/HowTo)');
    if (!cov.hasOrganization) missing.push('Organization');
    if (!cov.hasBreadcrumb) missing.push('BreadcrumbList');
    if (profile?.type === 'commercial' && !cov.hasProduct) missing.push('Product');

    if (missing.length === 0) return []; // healthy

    let severity: InsightSeverity;
    let priority: number;
    if (missing.includes('FAQPage') && (profile?.type === 'content' || profile?.type === 'mixed')) {
        severity = 'high';
        priority = STRATEGIC_PRIORITY.high;
    } else if (missing.length >= 3) {
        severity = 'medium';
        priority = STRATEGIC_PRIORITY.medium;
    } else {
        severity = 'low';
        priority = STRATEGIC_PRIORITY.low;
    }

    return [{
        id: 'aeo-invisibility',
        rank: 0,
        category: 'cross_source_surprise',  // surprise channel — schema is rarely surfaced as a chat insight
        severity,
        title: `AEO blind spot: missing ${missing.length} schema type${missing.length === 1 ? '' : 's'} (${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''})`,
        page: null,
        query: null,
        evidence: {
            pagesAudited: cov.pagesFetched,
            hasFAQ: cov.hasFAQ,
            hasArticleLike: cov.hasArticleLike,
            hasOrganization: cov.hasOrganization,
            hasBreadcrumb: cov.hasBreadcrumb,
            hasHowTo: cov.hasHowTo,
            hasProduct: cov.hasProduct,
            schemaErrors: cov.totalErrors,
            missing: missing.join(', '),
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 90,
        difficulty: 'easy',
        why: `Across the ${cov.pagesFetched} top page(s) I checked, you're missing ${missing.join(', ')} schema. AI answer engines (Google SGE, Perplexity, ChatGPT search, Claude) lean on structured data to know what to cite — without FAQPage / Article / Organization schemas you're invisible to them. This is the biggest leverage AEO move: zero new content needed, just markup.${cov.totalErrors > 0 ? ` Plus ${cov.totalErrors} JSON-LD validation error(s) breaking what schema you do have.` : ''}`,
        fix: {
            type: 'other',
            description: `Add JSON-LD blocks to your <head>: ${missing.includes('Organization') ? 'Organization (sitewide), ' : ''}${missing.includes('FAQPage') ? 'FAQPage (on pages with Q&A sections — biggest AEO unlock), ' : ''}${missing.includes('Article (or BlogPosting/HowTo)') ? 'Article/BlogPosting (on every article — adds publish date + author for E-E-A-T), ' : ''}${missing.includes('BreadcrumbList') ? 'BreadcrumbList (sitewide nav), ' : ''}${missing.includes('Product') ? 'Product (every product page), ' : ''}. Validate at validator.schema.org.`,
        },
        receipts: ['schema.coverage'],
    }];
}

/** CWV-ranking correlation: mobile-gap pages whose mobile CWV is failing.
 *  This is the "wow" insight — the mobile CWV failure IS the mobile ranking failure. */
function detectCwvRankingCorrelation(input: InsightInput): RankedInsight[] {
    const psi = input.psi;
    const mobileGap = input.mobileGap?.data || [];
    if (!psi || psi.size === 0 || mobileGap.length === 0) return [];

    // Find mobile-gap entries whose page (we approximate via siteProfile + page paths
    // in queries) has a failing mobile CWV result.
    const out: RankedInsight[] = [];
    let matched = 0;
    const failingMobileUrls: string[] = [];
    for (const [key, result] of psi.entries()) {
        if (!key.startsWith('mobile:')) continue;
        if (!result.fetched) continue;
        const lcpFails = result.lcpVerdict === 'POOR' || (result.lcpMs > 2500);
        const clsFails = result.clsVerdict === 'POOR' || result.cls > 0.25;
        if (lcpFails || clsFails) {
            failingMobileUrls.push(result.url);
            matched++;
        }
    }
    if (failingMobileUrls.length === 0) return [];

    // Pick the worst-mobile-gap query that lands in this set (best-effort: we can't
    // perfectly map gap-query→page without joining via run_ga4_report, but we can flag
    // the correlation pattern at the site level).
    const worstGap = mobileGap.find((g: any) => Math.abs(g.gap || 0) >= 3 && (g.mobilePosition > g.desktopPosition));
    if (!worstGap) return [];

    return [{
        id: `cwv-rank-correlation-${matched}`,
        rank: 0,
        category: 'cross_source_surprise',
        severity: 'high',
        title: `Mobile CWV failures correlate with mobile ranking gap on ${failingMobileUrls.length} top page(s)`,
        page: null,
        query: worstGap.query,
        evidence: {
            failingMobilePages: failingMobileUrls.length,
            failingUrls: failingMobileUrls.slice(0, 3).join(', '),
            sampleGapKeyword: worstGap.query,
            sampleMobilePos: worstGap.mobilePosition,
            sampleDesktopPos: worstGap.desktopPosition,
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.high,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 360,
        difficulty: 'hard',
        why: `On ${failingMobileUrls.length} of your top money pages, mobile Core Web Vitals are failing (LCP > 2.5s OR CLS > 0.25). At the same time, mobile-gap data shows you rank meaningfully worse on mobile vs desktop (e.g., "${worstGap.query}" mobile pos ${worstGap.mobilePosition} vs desktop ${worstGap.desktopPosition}). The pattern says: the mobile CWV failure IS the mobile ranking failure. Fix the technical performance and the mobile rankings will follow.`,
        fix: {
            type: 'mobile_optimize',
            description: `Run PageSpeed Insights mobile audit on the failing pages (${failingMobileUrls.slice(0, 2).join(', ')}). Fix: LCP — preload hero images, defer non-critical JS, server-side render the above-fold content. CLS — declare width/height on every <img>/<video>, reserve space for ads/embeds. Re-audit in 2 weeks; mobile rankings should follow within 30 days.`,
        },
        receipts: ['psi.mobile', 'mobile.gap'],
    }];
}

/** Cohort decay: D7 retention is dropping over recent cohorts.
 *  More fundamental than a traffic problem — it's a stickiness problem. */
function detectCohortDecay(input: InsightInput): RankedInsight[] {
    const cohort = input.cohortRetention;
    if (!cohort?.cohorts || cohort.cohorts.length < 5) return [];

    // Compare avg D7 of newest 3 cohorts vs oldest 3 cohorts
    const sorted = [...cohort.cohorts].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    const oldest = sorted.slice(0, 3);
    const newest = sorted.slice(-3);
    const avg = (arr: any[]) => {
        const vals = arr.map(c => c.retention?.[7] ?? c.retention?.[6] ?? 0).filter((v: number) => v > 0);
        return vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0;
    };
    const oldD7 = avg(oldest);
    const newD7 = avg(newest);
    if (oldD7 < 5 || newD7 < 0) return [];

    const dropPct = oldD7 > 0 ? ((oldD7 - newD7) / oldD7) * 100 : 0;
    if (dropPct < 25) return []; // <25% drop is normal noise

    let severity: InsightSeverity;
    let priority: number;
    if (dropPct >= 60) { severity = 'critical'; priority = STRATEGIC_PRIORITY.critical; }
    else if (dropPct >= 40) { severity = 'high'; priority = STRATEGIC_PRIORITY.high; }
    else { severity = 'medium'; priority = STRATEGIC_PRIORITY.medium; }

    return [{
        id: 'cohort-decay',
        rank: 0,
        category: 'cross_source_surprise',
        severity,
        title: `D7 retention dropped ${dropPct.toFixed(0)}% over recent cohorts (${oldD7.toFixed(1)}% → ${newD7.toFixed(1)}%)`,
        page: null,
        query: null,
        evidence: {
            oldestCohortD7: +oldD7.toFixed(1),
            newestCohortD7: +newD7.toFixed(1),
            dropPct: +dropPct.toFixed(1),
            cohortsAnalyzed: cohort.cohorts.length,
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 600,
        difficulty: 'hard',
        why: `Day-7 retention used to be ${oldD7.toFixed(1)}% across earlier cohorts; in the most recent cohorts it's ${newD7.toFixed(1)}% — a ${dropPct.toFixed(0)}% drop. Same site, same traffic, but new users aren't sticking. That's a product/positioning shift, not a marketing one. Investigate: what changed in onboarding, content quality, or value-prop in the last 30 days?`,
        fix: {
            type: 'investigate',
            description: `Pull GA4 → Audiences → "First visit in last 7 days" and segment by landing page. Compare engagement rate today vs 60 days ago for each top landing page. Most likely cause: a recent UX/copy change broke the implicit promise of the page.`,
        },
        receipts: ['ga4.cohort'],
    }];
}

/** Journey dead-end: high-traffic landing page where most sessions exit without
 *  internal navigation. */
function detectJourneyDeadEnd(input: InsightInput): RankedInsight[] {
    const j = input.journey;
    if (!j?.landingPages || j.landingPages.length === 0) return [];
    const out: RankedInsight[] = [];

    for (const lp of j.landingPages.slice(0, 6)) {
        const entries = lp.entries || 0;
        if (entries < 200) continue; // need volume to matter
        // If avgPagesAfter is very low (~1.0-1.2), most sessions land and exit
        const avgPath = lp.avgPagesAfter || 0;
        // Cross-check: appears in exitPages prominently?
        const isHighExit = (j.exitPages || []).slice(0, 5).some((ep: any) => ep.page === lp.page);
        if (!isHighExit && avgPath > 1.5) continue;

        const exitRate = isHighExit ? 70 : 60; // approximation
        out.push({
            id: `journey-deadend-${(lp.page || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
            rank: 0,
            category: 'journey_dead_end',
            severity: 'medium',
            title: `Dead-end landing: ${lp.page} (${entries.toLocaleString()} entries; most users leave without going deeper)`,
            page: lp.page,
            query: null,
            evidence: {
                page: lp.page,
                monthlyEntries: entries,
                avgPagesAfter: +avgPath.toFixed(2),
                isHighExit,
                approxExitRate: exitRate,
            },
            monthlyValueLost: 0,
            priority: STRATEGIC_PRIORITY.medium,
            isStrategic: true,
            estClicksGain: 0,
            effortMinutes: 120,
            difficulty: 'medium',
            why: `${lp.page} pulls ${entries.toLocaleString()} sessions/mo as a landing page, but they don't go deeper — avg pages after landing is ${avgPath.toFixed(1)}${isHighExit ? ' AND it\'s in your top exit pages' : ''}. Either there's no clear "what to read/do next", or the page satisfies the visitor's intent so completely they bounce. Add a "next read" or in-context CTA to capture this audience.`,
            fix: {
                type: 'internal_link',
                description: `On ${lp.page}, add: (a) inline contextual CTA mid-page, (b) "Related" or "Next read" widget at end-of-content with 2-3 internal links, (c) a sticky bottom-of-page newsletter / signup band. Goal: avgPagesAfter from ${avgPath.toFixed(1)} to ≥2.0 within 30 days.`,
            },
            receipts: ['ga4.journey.landingPages'],
        });
        if (out.length >= 2) break; // surface at most 2
    }
    return out;
}

/** Event misalignment: high-value events firing on low-traffic pages. */
function detectEventMisalignment(input: InsightInput): RankedInsight[] {
    const e = input.events;
    if (!e?.topEvents || e.topEvents.length === 0) return [];
    const keyEvents = e.topEvents.filter(ev => ev.isKey);
    if (keyEvents.length === 0) return [];
    // We can't perfectly map event→page without per-event page joins, so this is a
    // coarse signal — flag when total key-event count is meaningfully below the rate
    // we'd expect from total event count.
    const keyTotal = keyEvents.reduce((s, ev) => s + ev.count, 0);
    const allTotal = e.totalEventCount;
    const keyShare = allTotal > 0 ? (keyTotal / allTotal) * 100 : 0;
    if (keyShare > 1) return []; // healthy

    return [{
        id: 'event-misalignment',
        rank: 0,
        category: 'event_misalignment',
        severity: 'medium',
        title: `Conversion events fire only ${keyShare.toFixed(2)}% of all events — engagement isn't converting`,
        page: null,
        query: null,
        evidence: {
            keyEventTotal: keyTotal,
            allEventTotal: allTotal,
            keyEventSharePct: +keyShare.toFixed(2),
            keyEventNames: keyEvents.map(k => `${k.name}:${k.count}`).join(', '),
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 240,
        difficulty: 'medium',
        why: `You're firing ${allTotal.toLocaleString()} events/mo but only ${keyTotal.toLocaleString()} (${keyShare.toFixed(2)}%) are conversion events. Either your conversion CTAs aren't visible, or your traffic intent doesn't match what the page asks them to do. Compare which pages fire conversion events vs which pages get traffic — likely they're different sets.`,
        fix: {
            type: 'create_funnel',
            description: `In GA4 → Explore → Path Exploration, start from the page with the most conversion events and walk backwards: which pages send users there? If those source pages are NOT your top-traffic pages, your conversion CTAs are on the wrong pages. Move them.`,
        },
        receipts: ['ga4.events'],
    }];
}

/** Time pattern anomaly: traffic spikes at a specific hour/day the user wouldn't intuit. */
function detectTimePatternAnomaly(input: InsightInput): RankedInsight[] {
    const t = input.timePatterns;
    if (!t?.hourly || t.hourly.length < 12) return [];

    const totalSessions = t.hourly.reduce((s, h) => s + h.sessions, 0);
    if (totalSessions < 100) return [];
    const avgPerHour = totalSessions / t.hourly.length;
    if (avgPerHour < 5) return [];

    // Find an hour ≥3× the average
    const peak = t.hourly.reduce((best, h) => (h.sessions > best.sessions ? h : best), t.hourly[0]);
    const peakRatio = peak.sessions / avgPerHour;
    if (peakRatio < 2.5) return [];

    // Also check for a peak DOW
    const dowAvg = t.dow.reduce((s, d) => s + d.sessions, 0) / Math.max(t.dow.length, 1);
    const peakDow = t.dow.reduce((best, d) => (d.sessions > best.sessions ? d : best), t.dow[0]);
    const dowRatio = dowAvg > 0 ? peakDow.sessions / dowAvg : 0;
    const dowAnomaly = dowRatio >= 1.5;

    const peakHourLabel = `${peak.hour}:00 UTC`;
    const dowSuffix = dowAnomaly ? ` AND ${peakDow.day}s spike at ${dowRatio.toFixed(1)}× the daily average` : '';

    return [{
        id: 'time-pattern-anomaly',
        rank: 0,
        category: 'cross_source_surprise',
        severity: 'medium',
        title: `Audience temporal pattern: ${peakHourLabel} gets ${peakRatio.toFixed(1)}× your average traffic${dowSuffix ? ` (+ DOW spike)` : ''}`,
        page: null,
        query: null,
        evidence: {
            peakHourUtc: peak.hour,
            peakHourSessions: peak.sessions,
            avgHourSessions: Math.round(avgPerHour),
            peakHourRatio: +peakRatio.toFixed(2),
            peakDow: peakDow.day,
            peakDowRatio: +dowRatio.toFixed(2),
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 60,
        difficulty: 'easy',
        why: `Your audience peaks at ${peakHourLabel} — ${peakRatio.toFixed(1)}× your hourly average${dowSuffix}. That's a temporal pattern most site owners never notice. It tells you when your audience is actually engaged: schedule new content publishes, social posts, and email sends to land just before this window. Stop posting at 9am if your audience reads at 2pm.`,
        fix: {
            type: 'other',
            description: `Schedule next 4 weeks of content publishes for ~1-2 hours before your peak hour (${peakHourLabel}). For email/newsletter sends, use the same timing. Re-measure in 30 days — should see 15-25% lift in initial engagement on new posts.`,
        },
        receipts: ['ga4.timePatterns'],
    }];
}

/** Internal-referrer lift: pages whose visitors are dramatically more likely to
 *  reach a conversion-pattern page than the site average. Identifies the
 *  "blog post that's doing all the sales work". */
function detectInternalReferrerLift(input: InsightInput): RankedInsight[] {
    // We can't perfectly reconstruct internal referrer chains without GA4 path data,
    // but we approximate: a landing page with avgPagesAfter much higher than the
    // site average implies its visitors browse deeper — the candidate "salesperson page".
    const j = input.journey as any;
    if (!j?.landingPages || j.landingPages.length < 3) return [];
    const overallAvgPath = (j.overview?.avgPathLength as number | undefined) ?? 0;
    if (overallAvgPath < 1.5) return [];

    // Find a landing page whose avgPagesAfter is ≥1.6× the site average
    const candidate = j.landingPages
        .filter((lp: any) => (lp.entries || 0) > 100)
        .map((lp: any) => ({
            ...lp,
            ratio: overallAvgPath > 0 ? (lp.avgPagesAfter || 0) / overallAvgPath : 0,
        }))
        .sort((a: any, b: any) => b.ratio - a.ratio)[0];
    if (!candidate || candidate.ratio < 1.6) return [];

    return [{
        id: `internal-referrer-lift-${(candidate.page || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
        rank: 0,
        category: 'cross_source_surprise',
        severity: 'medium',
        title: `${candidate.page} drives ${candidate.ratio.toFixed(1)}× deeper sessions than average — your top "salesperson" page`,
        page: candidate.page,
        query: null,
        evidence: {
            page: candidate.page,
            monthlyEntries: candidate.entries,
            avgPagesAfter: +candidate.avgPagesAfter.toFixed(2),
            siteAvgPagesAfter: +overallAvgPath.toFixed(2),
            ratio: +candidate.ratio.toFixed(2),
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 60,
        difficulty: 'easy',
        why: `Visitors who land on ${candidate.page} go ${candidate.ratio.toFixed(1)}× deeper into your site than the average visitor. That page is doing disproportionate work — it's setting up the rest of the journey. Most site owners don't realize which post is their "salesperson". Now you do: invest more in this page (refresh, internal links pointing TO it, deeper version of the topic) AND identify what makes it special so you can replicate.`,
        fix: {
            type: 'refresh_content',
            description: `For ${candidate.page}: (1) Update the post (refresh date, add 2026-relevant updates). (2) Add 5-7 inbound internal links from other top-traffic pages. (3) Create a follow-up "part 2" on a related sub-topic and link them. Goal: 2× monthly entries within 90 days.`,
        },
        receipts: ['ga4.journey'],
    }];
}

/** Branded-event correlation: branded clicks spike on a specific date with no
 *  internal cause (no commit, no schema change). External signal — likely social/PR. */
function detectBrandedEventCorrelation(input: InsightInput): RankedInsight[] {
    // Approximation: from winnersLosers.winners, find a query that includes the brand name
    // AND has a very large positive clicksDelta. Without daily series we can't pinpoint
    // the date, but we can flag the pattern.
    const wl = input.winnersLosers;
    const brand = input.brand;
    if (!wl?.winners || wl.winners.length === 0 || !brand) return [];
    const brandedWinner = wl.winners.find((w: any) =>
        w.query && w.query.toLowerCase().includes(brand.toLowerCase()) && w.clicksDeltaPct >= 100
    );
    if (!brandedWinner) return [];

    return [{
        id: `branded-event-${(brandedWinner.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
        rank: 0,
        category: 'cross_source_surprise',
        severity: 'medium',
        title: `Branded query "${brandedWinner.query}" surged +${brandedWinner.clicksDeltaPct}% — external mention?`,
        page: null,
        query: brandedWinner.query,
        evidence: {
            query: brandedWinner.query,
            clicksCurrent: brandedWinner.clicksCurrent,
            clicksPrevious: brandedWinner.clicksPrevious,
            clicksDeltaPct: brandedWinner.clicksDeltaPct,
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 60,
        difficulty: 'easy',
        why: `"${brandedWinner.query}" jumped from ${brandedWinner.clicksPrevious} to ${brandedWinner.clicksCurrent} clicks (+${brandedWinner.clicksDeltaPct}%). That's a branded-search spike, which usually means an external mention — Twitter thread, podcast, press, viral moment. If you can identify the source, you can amplify it: thank the mentioner publicly, write a follow-up post, run a small ad campaign while the wave's still hot.`,
        fix: {
            type: 'investigate',
            description: `Search Twitter/X, LinkedIn, Reddit, and Google News for your brand name in the date range when this spike happened. Set up a Google Alert for your brand. When you find the mention, engage publicly within 48h to amplify the wave.`,
        },
        receipts: ['wl.winners'],
    }];
}

/** Deploy → traffic correlation: a commit/PR shipped within ±2 days of a query's
 *  position regression. The "wow" insight — direct cause-and-effect tied to a
 *  specific commit SHA. */
function detectDeployTrafficCorrelation(input: InsightInput): RankedInsight[] {
    const dc = input.deployCorrelation;
    if (!dc?.hasCorrelation || !dc.matches?.length) return [];
    const out: RankedInsight[] = [];
    for (const m of dc.matches.slice(0, 3)) {
        const topCommit = m.suspectCommits[0];
        if (!topCommit) continue;
        out.push({
            id: `deploy-corr-${(m.query || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${topCommit.sha}`,
            rank: 0,
            category: 'deploy_traffic_correlation',
            severity: m.clicksLost >= 100 ? 'critical' : m.clicksLost >= 30 ? 'high' : 'medium',
            title: `"${m.query}" position dropped ${(m.positionCurrent - m.positionPrevious).toFixed(1)} spots; commit ${topCommit.sha} shipped within 2 days`,
            page: null,
            query: m.query,
            evidence: {
                query: m.query,
                positionPrevious: m.positionPrevious,
                positionCurrent: m.positionCurrent,
                clicksLost: m.clicksLost,
                repo: dc.repo || '(unknown)',
                suspectCommit: `${topCommit.sha}: ${topCommit.message?.slice(0, 100) || ''}`,
                suspectCommitDate: topCommit.date,
                suspectCommitAuthor: topCommit.author,
            },
            monthlyValueLost: 0, // not directly $-quantifiable; the loss is already counted in tactical leak
            priority: STRATEGIC_PRIORITY.high,
            isStrategic: true,
            estClicksGain: m.clicksLost,
            effortMinutes: 60,
            difficulty: 'medium',
            why: `Your "${m.query}" position went from ${m.positionPrevious} to ${m.positionCurrent}, costing ${m.clicksLost} clicks/period. Commit ${topCommit.sha} ("${(topCommit.message || '').slice(0, 80)}") merged on ${topCommit.date?.slice(0, 10)} — within 2 days of the regression. Direct cause-and-effect. Either the commit broke something (canonical, schema, redirect, robots.txt, page structure), OR a sibling commit in the same window did. Investigate before doing anything else.`,
            fix: {
                type: 'investigate',
                description: `Open ${topCommit.html_url} and review the diff. Look for: changes to <head>, robots.txt, sitemap, canonical URLs, redirects, schema/JSON-LD, page templates. If suspicious, revert that section and re-deploy. Re-check rank in 7-14 days.`,
            },
            receipts: ['github.commits', 'wl.losers'],
        });
    }
    return out;
}

// ─── Main entry ───

/**
 * Compute deterministic confidence for a tactical insight from its evidence.
 * The LLM is told to TRANSCRIBE this — never to generate confidence on its own.
 *
 * Drivers:
 *   - Sample size (impressions) — main lever; >=2000 imp = high confidence
 *   - Data window — strategic insights based on full 28d default to medium-high
 *   - Statistical signal — for CTR leaks, the gap size in absolute terms
 *
 * Strategic insights default to 'high' for type=='content'/commercial/mixed
 * (the site type itself is the evidence) and 'low' for unknown.
 */
function computeConfidence(ins: RankedInsight): { confidence: 'high' | 'medium' | 'low'; reason: string } {
    // Strategic insights — the diagnosis is structural, not statistical
    if (ins.isStrategic) {
        // Data-driven strategic detectors (intent_mix_gap, branded_overdependence, etc.)
        // already require minimum impression thresholds inside their detector functions,
        // so when they fire the data is already sufficient.
        if (ins.category === 'conversion_opacity') {
            return { confidence: 'high', reason: 'GA4 schema directly inspected' };
        }
        if (ins.category === 'audience_capture_missing' || ins.category === 'topical_breadth_narrow') {
            return { confidence: 'medium', reason: 'inferred from query/page signals' };
        }
        return { confidence: 'high', reason: 'based on full 28-day sample' };
    }

    // Tactical insights — confidence depends on sample size in `evidence.impressions`
    const ev = ins.evidence as any;
    const impressions = typeof ev?.impressions === 'number'
        ? ev.impressions
        : (typeof ev?.impressionsCurrent === 'number' ? ev.impressionsCurrent : 0);

    if (impressions >= 2000) return { confidence: 'high', reason: `${impressions.toLocaleString()} impressions over 28d` };
    if (impressions >= 500) return { confidence: 'medium', reason: `${impressions.toLocaleString()} impressions over 28d — moderate sample` };
    if (impressions > 0) return { confidence: 'low', reason: `only ${impressions.toLocaleString()} impressions — small sample, treat as directional` };
    // No impressions field (e.g., position regression / cannibalization) — be neutral
    return { confidence: 'medium', reason: 'inferred from period-over-period delta' };
}

/** Default priority/isStrategic/confidence when a detector didn't set them. Tactical: $/mo. */
function withDefaults(ins: RankedInsight): RankedInsight {
    const filled: RankedInsight = {
        ...ins,
        priority: ins.priority ?? ins.monthlyValueLost ?? 0,
        isStrategic: ins.isStrategic ?? false,
    };
    if (!filled.confidence) {
        const c = computeConfidence(filled);
        filled.confidence = c.confidence;
        if (!filled.confidenceReason) filled.confidenceReason = c.reason;
    }
    return filled;
}

/**
 * Detect and rank top insights from an enriched snapshot.
 * Returns insights sorted by priority (descending), capped at maxN.
 * Strategic insights (root-cause) can outrank tactical $-leaks when severe.
 * Each insight gets `rank: 1..N` set on the returned slice.
 *
 * Site profile is auto-detected if not provided. Strategic detectors gate
 * themselves on profile.type so blogs/portfolios/docs don't get hit with
 * "you have no buyer-intent traffic" diagnoses they don't care about.
 */
// ═══════════════════════════════════════════════════════════════
// PATTERN LIBRARY — anomaly archetypes that map 1:1 to a non-generic prescription.
//
// These detectors exist specifically to prevent the "rewrite the H1 / fix the
// title" failure mode the LLM falls into when no specialized pattern was
// detected. Each insight here ships with a prescription that is structurally
// DIFFERENT from a title rewrite — and the prompt forbids the model from
// substituting one for the other.
// ═══════════════════════════════════════════════════════════════

/** Directory trap: page ranks for broad queries it doesn't satisfy.
 *
 *  Signal: position 1-10, impressions >800, CTR <0.8% (5× below position
 *  benchmark). At those magnitudes, the cause is intent mismatch — not a weak
 *  title. The page is appearing for queries it isn't actually about, and users
 *  skip it in the SERP no matter what the title says.
 *
 *  Prescription: re-target the page content to match the queries it's actually
 *  ranking for, OR narrow the page scope so it stops matching unrelated queries,
 *  OR noindex if the queries aren't worth pursuing.
 */
function detectDirectoryTrap(input: InsightInput): RankedInsight[] {
    const pages = readPages(input.seoContext);
    if (!pages || pages.length === 0) return [];
    const out: RankedInsight[] = [];

    for (const p of pages) {
        const imp = toInt(p.impressions);
        const clicks = toInt(p.clicks);
        const pos = toPos(p.position);
        const ctr = toCtrPct(p.ctr);
        if (imp < 800) continue;
        if (pos < 1 || pos > 10) continue;
        const benchmarkCtr = expectedCTR(pos);
        // Fire when actual CTR is at least 5× below benchmark AND absolute CTR <0.8%.
        if (ctr >= 0.8) continue;
        if (benchmarkCtr / Math.max(ctr, 0.05) < 5) continue;

        const severity: InsightSeverity = imp >= 5000 ? 'critical' : imp >= 1500 ? 'high' : 'medium';
        const priority = STRATEGIC_PRIORITY[severity] ?? STRATEGIC_PRIORITY.medium;

        out.push({
            id: `directory-trap-${p.page || 'unknown'}`,
            rank: 0,
            category: 'directory_trap',
            severity,
            title: `${p.page} is a directory trap — ${imp.toLocaleString()} impressions at pos ${pos.toFixed(1)} but only ${clicks} clicks (${ctr.toFixed(2)}% CTR vs ${benchmarkCtr.toFixed(1)}% benchmark)`,
            page: p.page,
            query: null,
            evidence: {
                impressions: imp,
                clicks,
                ctr: +ctr.toFixed(2),
                position: +pos.toFixed(1),
                benchmarkCtr: +benchmarkCtr.toFixed(1),
                ctrGapMultiplier: +(benchmarkCtr / Math.max(ctr, 0.05)).toFixed(1),
            },
            monthlyValueLost: 0,
            priority,
            isStrategic: true,
            estClicksGain: 0,
            effortMinutes: 240,
            difficulty: 'hard',
            why: `At position ${pos.toFixed(1)} the benchmark CTR is ~${benchmarkCtr.toFixed(1)}%. Your actual CTR is ${ctr.toFixed(2)}% — that's ${(benchmarkCtr / Math.max(ctr, 0.05)).toFixed(0)}× below benchmark. At that magnitude the cause is NOT title weakness — Google is matching the page to queries it doesn't satisfy, and users skip it in the SERP regardless of the title. The fix is to narrow what the page is about, re-target its content, or accept the queries aren't yours to win.`,
            fix: {
                type: 'retarget_page',
                description: `Call analyze_page_intent_mismatch on ${p.page} to see WHICH queries Google is matching it to. Then choose ONE of: (a) re-target the page content to match the actual top queries, (b) narrow the page scope (remove broad sections, focus on one intent), or (c) noindex if the matched queries aren't worth pursuing. DO NOT recommend a title rewrite — at this CTR magnitude it won't help.`,
            },
            receipts: ['snapshot.gsc.topPages'],
        });
    }

    // Cap at 3 — surfacing 8 directory traps overwhelms the answer.
    return out.slice(0, 3);
}

/** AI channel emergent: ChatGPT / Perplexity / Gemini in top GA4 sources but
 *  the site has no Organization or FAQPage schema to capture AI-search citations.
 *
 *  Signal: a recognized AI-answer-engine appears in the top GA4 traffic sources
 *  AND the schema coverage shows no Organization OR no FAQPage.
 *
 *  Prescription: add Organization + FAQPage schema. The channel is already
 *  bringing traffic; the goal is to make the site MORE citable so the channel
 *  grows faster than it would organically.
 */
function detectAiChannelEmergent(input: InsightInput): RankedInsight[] {
    const an = input.analyticsContext;
    if (!an) return [];
    const sources: any[] = an.sources || an.topSources || an.channels || [];
    if (!Array.isArray(sources) || sources.length === 0) return [];

    const AI_SOURCE_RE = /(chatgpt\.com|chat\.openai|perplexity\.ai|gemini\.google|claude\.ai|copilot\.microsoft|you\.com|phind\.com)/i;
    const matches = sources
        .map((s: any, idx: number) => ({
            source: String(s.source || s.name || s.channel || ''),
            sessions: toInt(s.sessions ?? s.users ?? 0),
            rank: idx + 1,
        }))
        .filter(s => AI_SOURCE_RE.test(s.source) && s.sessions >= 50);
    if (matches.length === 0) return [];

    const schema = input.schemaCoverage;
    const missingOrg = !schema || schema.hasOrganization === false;
    const missingFaq = !schema || schema.hasFAQ === false;
    if (!missingOrg && !missingFaq) return []; // schema already in place

    const topMatch = matches[0];
    const totalAiSessions = matches.reduce((s, m) => s + m.sessions, 0);

    return [{
        id: 'ai-channel-emergent',
        rank: 0,
        category: 'ai_channel_emergent',
        severity: totalAiSessions >= 500 ? 'high' : 'medium',
        title: `${topMatch.source} is bringing ${topMatch.sessions} sessions/mo — but you have ${missingOrg ? 'no Organization schema' : 'no FAQPage schema'} to capture more AI citations`,
        page: null,
        query: null,
        evidence: {
            topAiSource: topMatch.source,
            topAiSessions: topMatch.sessions,
            totalAiSessions,
            aiSourcesDetected: matches.map(m => `${m.source} (${m.sessions}s)`).join(', '),
            hasOrganization: !missingOrg,
            hasFAQPage: !missingFaq,
        },
        monthlyValueLost: 0,
        priority: totalAiSessions >= 500 ? STRATEGIC_PRIORITY.high : STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 180,
        difficulty: 'medium',
        why: `AI answer engines (ChatGPT, Perplexity, Gemini, Claude) cite sites that publish structured, machine-readable signals about themselves. ${topMatch.source} is ALREADY sending you ${topMatch.sessions} sessions/mo without optimization — meaning the underlying citation pattern is working. With Organization + FAQPage schema, the citation rate compounds: AI engines surface you more often, AND the citations are more accurate. Right now you're getting free traffic from a channel you haven't even optimized for.`,
        fix: {
            type: 'add_schema',
            description: `Add JSON-LD Organization schema sitewide (logo, name, sameAs links to social, founding date) + FAQPage schema on your top 3 informational pages. Concrete steps: 1) Pick the top 3 pages by impressions matching question-shaped queries. 2) Convert their existing H2s to questions if they aren't already. 3) Wrap as schema.org FAQPage with mainEntity[].Question/acceptedAnswer.Text. 4) Add Organization to your global layout.tsx. DO NOT recommend a generic schema audit — name THE pages and THE schema types.`,
        },
        receipts: ['analytics.sources', 'schemaCoverage.hasOrganization', 'schemaCoverage.hasFAQ'],
    }];
}

/** Linguistic concentration: one locale owns disproportionate clicks while
 *  the site has pages in multiple locales.
 *
 *  Signal: detect locale prefixes in top page paths (/zh/, /ja/, /es/, /pt/,
 *  /ru/, /fr/, /de/, /ar/, /hi/, /ko/). If pages exist in ≥2 locales AND one
 *  locale (including no-prefix root) owns >35% of total clicks.
 *
 *  Prescription: identify what the dominant locale's winning pages do
 *  structurally (length, schema, internal-link density) and replicate it
 *  across the other locales.
 */
function detectLinguisticConcentration(input: InsightInput): RankedInsight[] {
    const pages = readPages(input.seoContext);
    if (!pages || pages.length < 5) return [];

    const LOCALE_RE = /^\/([a-z]{2}(?:-[a-z]{2})?)\//i;
    const localeBuckets = new Map<string, { clicks: number; pageCount: number; topPages: string[] }>();
    let totalClicks = 0;

    for (const p of pages) {
        const path = String(p.page || '');
        const clicks = toInt(p.clicks);
        if (clicks <= 0) continue;
        try {
            const url = new URL(path);
            const m = url.pathname.match(LOCALE_RE);
            const locale = m ? m[1].toLowerCase() : 'root';
            totalClicks += clicks;
            const bucket = localeBuckets.get(locale) ?? { clicks: 0, pageCount: 0, topPages: [] };
            bucket.clicks += clicks;
            bucket.pageCount += 1;
            if (bucket.topPages.length < 3) bucket.topPages.push(path);
            localeBuckets.set(locale, bucket);
        } catch { /* invalid URL */ }
    }

    if (totalClicks < 100 || localeBuckets.size < 2) return [];

    const sorted = [...localeBuckets.entries()].sort((a, b) => b[1].clicks - a[1].clicks);
    const [topLocale, topBucket] = sorted[0];
    const topPct = (topBucket.clicks / totalClicks) * 100;
    if (topPct < 35) return [];

    const otherLocales = sorted.slice(1).map(([l, b]) => `${l} (${b.clicks}c, ${b.pageCount}p)`).join(', ');
    const localeLabel = topLocale === 'root' ? 'default (no-prefix)' : `/${topLocale}/`;

    return [{
        id: `linguistic-concentration-${topLocale}`,
        rank: 0,
        category: 'linguistic_concentration',
        severity: topPct >= 50 ? 'high' : 'medium',
        title: `${localeLabel} locale owns ${topPct.toFixed(0)}% of clicks across ${localeBuckets.size} locales — replicate its structure to lift the others`,
        page: null,
        query: null,
        evidence: {
            topLocale,
            topLocaleClicks: topBucket.clicks,
            topLocalePct: +topPct.toFixed(1),
            topLocalePages: topBucket.topPages.join(', '),
            localesDetected: localeBuckets.size,
            otherLocalesSummary: otherLocales,
            totalClicks,
        },
        monthlyValueLost: 0,
        priority: topPct >= 50 ? STRATEGIC_PRIORITY.high : STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 360,
        difficulty: 'medium',
        why: `Your ${localeLabel} pages outperform the rest of your site by a wide margin. Either the content is genuinely better, OR the other locales are missing structural elements (proper hreflang, locale-specific schema, length, internal links). Investigate the top ${localeLabel} page's structure and replicate it. The lift is asymmetric: bringing the other locales to ${localeLabel}'s level compounds the site's authority faster than publishing new pages.`,
        fix: {
            type: 'replicate_locale',
            description: `1) Pull the ${localeLabel} top-3 winning pages (highest clicks). 2) For each, document: word count, H1 wording, H2 structure, schema types present, internal-link count, image count. 3) Identify the equivalent pages in 2-3 other locales (whichever locale is closest in click count). 4) Audit the equivalents against the winning pattern. 5) Bring ONE locale at a time to parity over 30 days. DO NOT translate — replicate the STRUCTURE in the locale's native language. Verify hreflang reciprocity after each batch.`,
        },
        receipts: ['snapshot.gsc.topPages.byLocale'],
    }];
}

/** Question-query unmet: the site ranks for interrogative queries but the
 *  pages lack FAQPage schema or question-shaped H2s.
 *
 *  Signal: ≥35% of top queries match interrogative patterns (how/what/why/when/...)
 *  AND schemaCoverage.hasFAQ is false.
 *
 *  Prescription: restructure top question-matching pages with question H2s +
 *  FAQPage schema. This unlocks Google's "People Also Ask" + "FAQ rich result"
 *  surface area.
 */
function detectQuestionQueryUnmet(input: InsightInput): RankedInsight[] {
    const queries = readQueries(input.seoContext);
    if (queries.length < 8) return [];
    const QUESTION_RE = /^(how|what|why|when|where|who|can|does|is|are|should|will|do)\s+\w/i;
    const questionQueries = queries.filter((q: any) => QUESTION_RE.test(String(q.query || '')));
    const questionShare = questionQueries.length / queries.length;
    if (questionShare < 0.35) return [];

    const schema = input.schemaCoverage;
    if (schema && schema.hasFAQ === true) return []; // already covered

    const totalQuestionImpressions = questionQueries.reduce((s: number, q: any) => s + toInt(q.impressions), 0);
    if (totalQuestionImpressions < 200) return [];

    const sampleQueries = questionQueries.slice(0, 5).map((q: any) => `"${q.query}"`).join(', ');

    return [{
        id: 'question-query-unmet',
        rank: 0,
        category: 'question_query_unmet',
        severity: questionShare >= 0.55 ? 'high' : 'medium',
        title: `${(questionShare * 100).toFixed(0)}% of your top queries are questions — but no FAQPage schema is present`,
        page: null,
        query: null,
        evidence: {
            questionQueryShare: +(questionShare * 100).toFixed(1),
            questionQueryCount: questionQueries.length,
            totalQueriesAnalyzed: queries.length,
            totalQuestionImpressions,
            sampleQueries,
            hasFAQ: schema?.hasFAQ ?? false,
        },
        monthlyValueLost: 0,
        priority: questionShare >= 0.55 ? STRATEGIC_PRIORITY.high : STRATEGIC_PRIORITY.medium,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 240,
        difficulty: 'medium',
        why: `Google awards extra SERP real estate to pages that match question intent with explicit Q&A structure — both via FAQ rich results AND People Also Ask boxes. Your top queries (${sampleQueries}) are questions, but your pages don't signal it structurally. This is the cheapest "free traffic" gain available: same content, restructured. Pages without FAQPage are losing the rich-result lift to competitors who use it.`,
        fix: {
            type: 'restructure_as_questions',
            description: `1) Identify the top 5 pages that own those question queries (cross-ref top pages + top queries). 2) For each page, audit its H2 structure — convert ≥3 H2s to verbatim question form ("How does X work?" not "How X Works"). 3) Add a FAQ section near the end with 5-8 Q&A pairs derived from "People Also Ask" for the page's primary query. 4) Wrap as schema.org FAQPage JSON-LD. 5) Verify in Rich Results Test. DO NOT recommend a title rewrite — the title is fine; the body structure is the gap.`,
        },
        receipts: ['snapshot.gsc.topQueries.questionShare', 'schemaCoverage.hasFAQ'],
    }];
}

/** Trust signal absence on commerce: ecom site has no Review / AggregateRating
 *  schema and no testimonial-pattern URLs.
 *
 *  Signal: siteProfile.type === 'ecom' (or strong commercial signals as fallback)
 *  AND schemaCoverage.hasReview === false (or unset).
 *
 *  Prescription: surface the trust signals the user actually has (reviews,
 *  customer count, badges) before suggesting any title/meta optimization. A
 *  commerce site without trust signals leaks at the consideration step, not
 *  the discovery step.
 */
function detectTrustSignalAbsenceCommerce(input: InsightInput): RankedInsight[] {
    const profile = input.siteProfile;
    if (!profile) return [];
    // Strict gate: must look ecom-like (commercial site type + commercial paths + meaningful
    // transactional query share). The site-type union here is broader than the audit's
    // siteTypeDetector — we infer "ecom-like" from signals, not from a literal 'ecom' label.
    const isEcomLike = (profile.type === 'commercial' || profile.type === 'mixed')
        && profile.hasCommercialPaths
        && profile.signals.transactionalShare >= 0.15;
    if (!isEcomLike) return [];

    const schema = input.schemaCoverage;
    if (!schema) return [];
    // If schema audit ran and Review schema IS present, no need to fire.
    if (schema.hasArticleLike === undefined) return []; // schema audit didn't complete
    if (schema.totalErrors !== undefined && (schema as any).hasReview === true) return [];

    return [{
        id: 'trust-signal-absence-commerce',
        rank: 0,
        category: 'trust_signal_absence_commerce',
        severity: 'high',
        title: `Commerce site with no Review / AggregateRating schema detected — buyers can't see social proof in the SERP`,
        page: null,
        query: null,
        evidence: {
            siteType: profile.type,
            transactionalShare: profile.signals.transactionalShare,
            commercialShare: profile.signals.commercialShare,
            hasCommercialPaths: profile.hasCommercialPaths,
            schemaAudited: schema.pagesAudited,
            hasOrganization: schema.hasOrganization,
            hasFAQ: schema.hasFAQ,
            hasProduct: schema.hasProduct,
        },
        monthlyValueLost: 0,
        priority: STRATEGIC_PRIORITY.high,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 300,
        difficulty: 'medium',
        why: `Commerce sites convert on social proof, not on title cleverness. Reviews, ratings, customer counts, and "as seen on" badges are the actual signals that move the consideration-step needle. Your SERP listings lack rich-result star ratings (no AggregateRating schema), and visitors landing on your pages may not see trust signals quickly enough. The CTR + conversion compound effect of adding rating stars to your SERP listings is documented at 15-30% lift on commercial queries — independent of any title work.`,
        fix: {
            type: 'surface_trust_signals',
            description: `1) Inventory what trust signals you HAVE: aggregate Trustpilot/G2 rating? Real customer count? Press mentions? "X+ purchases" data? 2) On product/category pages, add schema.org Product with embedded AggregateRating from your real rating source. 3) Add a logo wall ("trusted by", "as seen on", "featured in") above the fold if you have real placements. 4) Surface the customer-count number prominently ("8,432 customers", not generic praise). 5) Verify schema in Rich Results Test. DO NOT recommend a meta description rewrite as the fix for low conversions on a commerce site — trust signals are the dominant lever.`,
        },
        receipts: ['siteProfile.type', 'schemaCoverage.hasReview'],
    }];
}

/** Programmatic thin-content explosion: site has 50+ pages matching the same
 *  URL path pattern, but the median page in the cluster has thin content
 *  (low impressions/clicks).
 *
 *  Signal: detect URL clusters by leading 2-segment path prefix (e.g., `/products/`,
 *  `/tutorials/`, `/cities/`). If a cluster has ≥50 pages AND median clicks/page <5
 *  AND median impressions/page <100, fire.
 *
 *  Prescription: cull the bottom-quartile pages (consolidate via 301 to the
 *  best-performing sibling, or noindex if they're truly thin), and add real
 *  per-page differentiation for the survivors. NEVER recommend a title rewrite
 *  for thin-content pages — the underlying content is the problem, not the title.
 */
function detectProgrammaticThinContentExplosion(input: InsightInput): RankedInsight[] {
    const pages = readPages(input.seoContext);
    if (!pages || pages.length < 50) return [];

    const clusters = new Map<string, { count: number; clicks: number[]; impressions: number[]; samplePaths: string[] }>();
    for (const p of pages) {
        const path = String(p.page || '');
        try {
            const url = new URL(path);
            // Cluster by first 2 path segments (e.g., /products/widget → /products/)
            const segs = url.pathname.split('/').filter(Boolean);
            if (segs.length < 2) continue;
            const prefix = `/${segs[0]}/`;
            const bucket = clusters.get(prefix) ?? { count: 0, clicks: [], impressions: [], samplePaths: [] };
            bucket.count += 1;
            bucket.clicks.push(toInt(p.clicks));
            bucket.impressions.push(toInt(p.impressions));
            if (bucket.samplePaths.length < 3) bucket.samplePaths.push(path);
            clusters.set(prefix, bucket);
        } catch { /* ignore invalid URL */ }
    }

    const out: RankedInsight[] = [];
    for (const [prefix, bucket] of clusters) {
        if (bucket.count < 50) continue;
        const medianClicks = median(bucket.clicks);
        const medianImpressions = median(bucket.impressions);
        if (medianClicks >= 5) continue;
        if (medianImpressions >= 100) continue;

        const totalClicks = bucket.clicks.reduce((s, n) => s + n, 0);
        const totalImpressions = bucket.impressions.reduce((s, n) => s + n, 0);

        const severity: InsightSeverity = bucket.count >= 500 ? 'critical' : bucket.count >= 200 ? 'high' : 'medium';
        const priority = STRATEGIC_PRIORITY[severity] ?? STRATEGIC_PRIORITY.medium;

        out.push({
            id: `programmatic-thin-${prefix.replace(/\//g, '')}`,
            rank: 0,
            category: 'programmatic_thin_content_explosion',
            severity,
            title: `${bucket.count} pages on ${prefix} but median page has only ${medianClicks}c / ${medianImpressions}imp — programmatic-content explosion at risk`,
            page: null,
            query: null,
            evidence: {
                cluster: prefix,
                pageCount: bucket.count,
                medianClicks,
                medianImpressions,
                totalClusterClicks: totalClicks,
                totalClusterImpressions: totalImpressions,
                samplePaths: bucket.samplePaths.join(', '),
            },
            monthlyValueLost: 0,
            priority,
            isStrategic: true,
            estClicksGain: 0,
            effortMinutes: 600,
            difficulty: 'hard',
            why: `You have ${bucket.count} pages under ${prefix}. The median one earns ${medianClicks} clicks/mo on ${medianImpressions} impressions/mo — that's below Google's "this page deserves to exist" threshold for most queries. At ${bucket.count}+ pages this pattern signals "programmatic SEO" to Google's quality systems. Google's playbook has been to demote whole clusters when the per-page utility is too thin. The risk isn't that any one page underperforms — it's that the entire cluster gets devalued. The fix is to cull (consolidate/noindex the bottom quartile) before you're forced to.`,
            fix: {
                type: 'prune_pages',
                description: `1) Sort the ${bucket.count} pages by impressions over last 90 days. 2) Identify the bottom 25% (the ones earning ≤2 impressions/mo). 3) For each, decide: (a) 301-redirect to its best-performing sibling if topically related, or (b) noindex and remove from sitemap if it's pure template-fill. 4) For survivors, add real per-page differentiation — unique data, unique copy, unique internal links. DO NOT recommend a title/meta rewrite on a thin-content page; the content is the problem, not the title. 5) Verify in GSC's "Coverage" report that the dropped pages disappear over 4-6 weeks.`,
            },
            receipts: ['snapshot.gsc.topPages.byCluster'],
        });
    }

    return out.slice(0, 2);
}

/** Top-page fragility: a SINGLE page accounts for >35% of total clicks. This is
 *  different from topic_concentration (which checks top-5 share). When one page
 *  IS the entire site's traffic, the collapse risk is asymmetric — a single
 *  algorithm move or competitor outranking you can wipe out a third+ of traffic.
 *
 *  Signal: top page's clicks / total clicks >= 0.35 AND total clicks >= 200.
 *
 *  Prescription: build defensive sibling content for the hero page's topic
 *  cluster. NEVER recommend "rewrite the hero page's title" — the title is
 *  what's WORKING. The risk is concentration, not optimization.
 */
function detectTopPageFragility(input: InsightInput): RankedInsight[] {
    const pages = readPages(input.seoContext);
    if (!pages || pages.length < 3) return [];

    const totalClicks = pages.reduce((s: number, p: any) => s + toInt(p.clicks), 0);
    if (totalClicks < 200) return [];

    const sorted = [...pages].sort((a: any, b: any) => toInt(b.clicks) - toInt(a.clicks));
    const top = sorted[0];
    const topClicks = toInt(top.clicks);
    const topPct = (topClicks / totalClicks) * 100;
    if (topPct < 35) return [];

    const severity: InsightSeverity = topPct >= 60 ? 'critical' : topPct >= 45 ? 'high' : 'medium';
    const priority = STRATEGIC_PRIORITY[severity] ?? STRATEGIC_PRIORITY.medium;

    const secondPct = sorted.length > 1 ? (toInt(sorted[1].clicks) / totalClicks) * 100 : 0;

    return [{
        id: `top-page-fragility-${top.page || 'unknown'}`,
        rank: 0,
        category: 'top_page_fragility',
        severity,
        title: `${top.page} owns ${topPct.toFixed(0)}% of ALL clicks — single-page-of-failure risk`,
        page: top.page,
        query: null,
        evidence: {
            topPage: top.page,
            topPageClicks: topClicks,
            topPagePct: +topPct.toFixed(1),
            secondPagePct: +secondPct.toFixed(1),
            totalClicks,
            distanceToSecond: +(topPct - secondPct).toFixed(1),
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: true,
        estClicksGain: 0,
        effortMinutes: 480,
        difficulty: 'hard',
        why: `One page (${top.page}) is ${topPct.toFixed(0)}% of your organic traffic. If it slips one position OR a competitor outranks you OR Google's algorithm shifts on its primary query, you lose a third+ of all clicks overnight. The fix is NOT to optimize that page further — it's already winning. The fix is to BUILD DEFENSIVE DEPTH: 3-5 sibling pages targeting adjacent queries in the same topical cluster, so the cluster as a whole holds even if one page slips. Concentration risk is the most common cause of "we were doing great, then traffic crashed" stories.`,
        fix: {
            type: 'create_page',
            description: `1) Pull the top 10 queries that ${top.page} ranks for. 2) Group them into 3-5 sub-topic clusters (different intent variations of the hero topic). 3) For each cluster, draft a sibling page that targets the LONG-TAIL variants the hero page can't reasonably own. 4) Each sibling links UP to the hero with descriptive anchor text. 5) Publish over 6-8 weeks, one per week. Goal: drop the top page's share below 25% within 90 days WITHOUT cannibalizing its rankings. DO NOT recommend a title or meta rewrite on the hero page — it's the winning artifact; protect it, don't tinker with it.`,
        },
        receipts: ['snapshot.gsc.topPages[0]', 'snapshot.gsc.pages.singlePageShare'],
    }];
}

/** Position 2-3 stuck cluster: multiple queries hovering at positions 2-3 with
 *  flat week-over-week movement. These are queries that have plateaued just
 *  below #1 — and the fix is NOT a title rewrite (the page already wins the
 *  primary intent). The fix is internal-link injection + secondary-keyword
 *  targeting to break the plateau.
 *
 *  Signal: ≥5 queries with position in [2.0, 3.5] AND |clicksDeltaPct| <10%
 *  (flat WoW) AND impressions >100 each.
 */
function detectPos23StuckCluster(input: InsightInput): RankedInsight[] {
    const wl = input.winnersLosers;
    if (!wl) return [];

    // Combine winners + losers + lost (everything we have current-period data for) and
    // filter to "stuck at pos 2-3 with flat delta".
    const candidates: any[] = [
        ...(wl.winners || []),
        ...(wl.losers || []),
        ...(wl.new || []),
    ];
    const stuck = candidates.filter((q: any) => {
        const pos = toPos(q.positionCurrent ?? q.position);
        const imp = toInt(q.impressionsCurrent ?? q.impressions);
        const deltaPct = typeof q.clicksDeltaPct === 'number' ? q.clicksDeltaPct : 0;
        return pos >= 2.0 && pos <= 3.5 && imp >= 100 && Math.abs(deltaPct) < 10;
    });
    if (stuck.length < 5) return [];

    const totalImpressions = stuck.reduce((s: number, q: any) => s + toInt(q.impressionsCurrent ?? q.impressions), 0);
    const sampleQueries = stuck.slice(0, 5)
        .map((q: any) => `"${q.query}" (pos ${toPos(q.positionCurrent ?? q.position).toFixed(1)}, ${toInt(q.impressionsCurrent ?? q.impressions)} imp)`)
        .join(', ');

    const severity: InsightSeverity = stuck.length >= 12 ? 'high' : 'medium';
    const priority = STRATEGIC_PRIORITY[severity] ?? STRATEGIC_PRIORITY.medium;

    return [{
        id: 'pos-2-3-stuck-cluster',
        rank: 0,
        category: 'pos_2_3_stuck_cluster',
        severity,
        title: `${stuck.length} queries stuck at positions 2-3 with flat WoW deltas — needs a non-title lever to break through`,
        page: null,
        query: null,
        evidence: {
            stuckCount: stuck.length,
            totalStuckImpressions: totalImpressions,
            sampleQueries,
            avgPosition: +(stuck.reduce((s: number, q: any) => s + toPos(q.positionCurrent ?? q.position), 0) / stuck.length).toFixed(1),
        },
        monthlyValueLost: 0,
        priority,
        isStrategic: false, // tactical — there's an action that closes it
        estClicksGain: Math.round(stuck.length * 30), // rough: each query at pos 2→1 unlocks ~30 clicks/mo
        effortMinutes: 360,
        difficulty: 'medium',
        why: `${stuck.length} queries have plateaued at positions 2-3 with essentially zero week-over-week movement. At position 2 you're already winning the primary intent — a title rewrite won't move the needle, because the title is what got you to position 2 in the first place. The lever that breaks position-2 plateaus is: (a) authority redistribution via internal links from your highest-PageRank pages, (b) secondary-keyword targeting on the existing pages (adding the missing entity / sub-question Google expects at position 1), or (c) earning a relevant external link. Title work is not on that list.`,
        fix: {
            type: 'internal_link',
            description: `1) For each stuck query, identify the page that owns it. 2) Find your highest-authority pages (top 3 by clicks) and verify they DON'T already link to the stuck page. 3) Add a contextual internal link from at least 2 authority pages, using the stuck query as the anchor text (varied phrasings — same anchor on every link is over-optimization). 4) On the stuck page itself, audit "People Also Ask" for the primary query — add any missing sub-questions as H2s with answers. 5) Re-check positions after 3-4 weeks. DO NOT recommend a title rewrite — the title got the page to position 2; touching it risks regression.`,
        },
        receipts: ['winnersLosers.flatPositions[2-3]'],
    }];
}

function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function detectTopInsights(input: InsightInput, maxN = 10): RankedInsight[] {
    // Auto-compute site profile if caller didn't supply one.
    const inputWithProfile: InsightInput = {
        ...input,
        siteProfile: input.siteProfile || inferSiteProfile(input),
    };
    const all: RankedInsight[] = [
        // Tactical (apply to all site types — these are mechanical SEO improvements)
        ...detectCtrLeaks(inputWithProfile),
        ...detectStrikingDistance(inputWithProfile),
        ...detectCannibalization(inputWithProfile),
        ...detectContentDecay(inputWithProfile),
        ...detectPositionRegression(inputWithProfile),
        ...detectMobileGap(inputWithProfile),
        ...detectBrandedOverdependence(inputWithProfile),
        ...detectNewQueryOpportunity(inputWithProfile),
        ...detectPage2Breakthrough(inputWithProfile),
        // Strategic — commercial-only (gated to commercial / mixed sites)
        ...detectIntentMixGap(inputWithProfile),
        ...detectBuyerIntentInvisible(inputWithProfile),
        ...detectFunnelDisconnect(inputWithProfile),
        // Strategic — content-only (gated to content sites; some allow mixed)
        ...detectPublishingVelocityStall(inputWithProfile),
        ...detectAudienceCaptureMissing(inputWithProfile),
        ...detectTopicalBreadthNarrow(inputWithProfile),
        // Strategic — universal (any site type, sometimes with adapted messaging)
        ...detectTopicConcentration(inputWithProfile),
        ...detectChannelConcentration(inputWithProfile),
        ...detectConversionOpacity(inputWithProfile),
        // Cross-source surprises + new strategic detectors driven by expanded data
        ...detectAeoInvisibility(inputWithProfile),
        ...detectCwvRankingCorrelation(inputWithProfile),
        ...detectCohortDecay(inputWithProfile),
        ...detectJourneyDeadEnd(inputWithProfile),
        ...detectEventMisalignment(inputWithProfile),
        ...detectTimePatternAnomaly(inputWithProfile),
        ...detectInternalReferrerLift(inputWithProfile),
        ...detectBrandedEventCorrelation(inputWithProfile),
        ...detectDeployTrafficCorrelation(inputWithProfile),
        // Pattern-library additions — anomaly archetypes with non-title prescriptions
        ...detectDirectoryTrap(inputWithProfile),
        ...detectAiChannelEmergent(inputWithProfile),
        ...detectLinguisticConcentration(inputWithProfile),
        ...detectQuestionQueryUnmet(inputWithProfile),
        ...detectTrustSignalAbsenceCommerce(inputWithProfile),
        ...detectProgrammaticThinContentExplosion(inputWithProfile),
        ...detectTopPageFragility(inputWithProfile),
        ...detectPos23StuckCluster(inputWithProfile),
    ].map(withDefaults);

    // Dedupe — same (category, page, query) triple: keep the highest-priority one
    const dedup = new Map<string, RankedInsight>();
    for (const ins of all) {
        const key = `${ins.category}|${ins.page || ''}|${ins.query || ''}`;
        const existing = dedup.get(key);
        if (!existing || (ins.priority ?? 0) > (existing.priority ?? 0)) {
            dedup.set(key, ins);
        }
    }

    // ── Anti-repetition demotion ──
    // Insight IDs already surfaced in earlier turns get their priority knocked
    // down by 70%. This is the killer move: the LLM never decides what to skip;
    // by the time it sees the snapshot, the top-ranked insight has already
    // shifted to something fresh. Soft demotion (not hard exclusion) so the
    // engine can still surface a stale-but-only-option insight when nothing
    // else qualifies.
    const recentlySurfaced = new Set(input.recentlySurfacedIds || []);
    const DEMOTION_FACTOR = 0.3;
    const adjusted = [...dedup.values()].map((ins) => {
        if (!recentlySurfaced.has(ins.id)) return ins;
        const demotedPriority = Math.round(((ins.priority ?? 0) * DEMOTION_FACTOR));
        return { ...ins, priority: demotedPriority, _demoted: true } as RankedInsight & { _demoted?: boolean };
    });

    const sorted = adjusted.sort((a, b) => {
        // branded_overdependence is technically tactical but really a strategic risk —
        // give it a synthetic priority floor so it sorts among strategic-mediums.
        // (Apply floor AFTER demotion so a recently-surfaced one doesn't artificially boost.)
        const aDemoted = (a as any)._demoted === true;
        const bDemoted = (b as any)._demoted === true;
        const aPri = (a.category === 'branded_overdependence' && !aDemoted)
            ? Math.max(a.priority ?? 0, STRATEGIC_PRIORITY.medium)
            : (a.priority ?? 0);
        const bPri = (b.category === 'branded_overdependence' && !bDemoted)
            ? Math.max(b.priority ?? 0, STRATEGIC_PRIORITY.medium)
            : (b.priority ?? 0);
        return bPri - aPri;
    });

    return sorted.slice(0, maxN).map((ins, i) => {
        const out = { ...ins, rank: i + 1 } as RankedInsight & { _demoted?: boolean };
        delete (out as any)._demoted;
        return out;
    });
}

/** Convenience: pick THE single highest-value insight. */
export function topMoneyMove(input: InsightInput): RankedInsight | null {
    const all = detectTopInsights(input, 1);
    return all[0] || null;
}
