/**
 * Page intent mismatch analyzer.
 *
 * Given a page URL, this tool answers a question no other tool answers:
 * *"Does this page actually match the queries Google is ranking it for?"*
 *
 * The /mcp class of problem (high impressions, near-zero CTR at page-1 positions)
 * is almost never a title/meta issue at the magnitudes we see in production —
 * it's a query-intent mismatch. The page ranks for queries it doesn't satisfy,
 * so users skip it in the SERP no matter what the title says.
 *
 * Output is structured for direct consumption by Gemini in the chat layer:
 * the model gets the queries, the page content, a Jaccard overlap score,
 * and a categorical diagnosis (aligned / partial_mismatch / severe_mismatch).
 */
import * as cheerio from 'cheerio';
import { runGSCQuery } from './googleApi';
import { isBlockedUrl } from './urlValidation';
import { BRAND_NAME } from '@/lib/brand';

export interface IntentMismatchQuery {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface IntentMismatchPageContent {
    title: string;
    h1: string;
    metaDescription: string;
    firstParagraphExcerpt: string;
}

export type IntentMismatchDiagnosis = 'aligned' | 'partial_mismatch' | 'severe_mismatch' | 'inconclusive';

export interface PageIntentMismatchResult {
    pageUrl: string;
    siteUrl: string;
    pageQueries: IntentMismatchQuery[];
    pageContent: IntentMismatchPageContent;
    totalImpressions: number;
    totalClicks: number;
    weightedCtr: number;            // impression-weighted CTR across the queries
    weightedPosition: number;       // impression-weighted position
    benchmarkCtrAtPosition: number; // expected CTR at the weighted position
    ctrGapPercentagePoints: number; // benchmarkCtrAtPosition - weightedCtr (in pp)
    topQueryTokens: string[];       // top stemmed/lowercased tokens from the GSC queries
    pageContentTokens: string[];    // top tokens from page (title + h1 + meta + first paragraph)
    overlapScore: number;           // Jaccard over the two token sets, 0..1
    diagnosis: IntentMismatchDiagnosis;
    signals: string[];              // human-readable evidence lines
    fetchedAt: string;
}

interface AnalyzeArgs {
    token: string;
    siteUrl: string;
    pageUrl: string;
    abortSignal?: AbortSignal;
}

const QUERY_LIMIT = 20;
const LOOKBACK_DAYS = 28;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;

// Minimal English stopword list — drop the words that carry no intent
// (the same set as is used implicitly by the model in similar analyses).
const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for', 'from', 'has', 'have',
    'how', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our',
    'so', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
    'to', 'too', 'us', 'use', 'was', 'we', 'were', 'what', 'when', 'where', 'who', 'why',
    'will', 'with', 'you', 'your', 'yours', 'me', 'mine', 'his', 'her', 'hers', 'theirs',
    'about', 'also', 'any', 'all', 'into', 'just', 'like', 'make', 'more', 'most', 'much',
    'only', 'over', 'see', 'some', 'such', 'up', 'very', 'best', 'good', 'one', 'two',
]);

export async function analyzePageIntentMismatch(args: AnalyzeArgs): Promise<PageIntentMismatchResult> {
    const { token, siteUrl, pageUrl, abortSignal } = args;
    const fetchedAt = new Date().toISOString();

    if (!pageUrl || isBlockedUrl(pageUrl)) {
        throw new Error('Invalid or blocked page URL');
    }

    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // ─── Fetch GSC top queries for THIS page ───
    const gscResp = await runGSCQuery(token, siteUrl, ['query'], startDate, endDate, QUERY_LIMIT, abortSignal)
        .catch(() => null);
    const allRows = ((gscResp as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> })?.rows) ?? [];

    // GSC doesn't accept a page filter in our wrapper; filter in JS.
    // To get truly page-filtered queries, we'd need to pass dimensionFilterGroups
    // into runGSCQuery. We can't here without changing the wrapper, so we do a
    // second pass with both dimensions and group by page.
    const pageFilteredRows = await fetchPageFilteredQueries(token, siteUrl, pageUrl, startDate, endDate, abortSignal);

    const pageQueries: IntentMismatchQuery[] = pageFilteredRows
        .filter(r => r.query && r.impressions > 0)
        .slice(0, QUERY_LIMIT);

    const totalImpressions = pageQueries.reduce((s, q) => s + q.impressions, 0);
    const totalClicks = pageQueries.reduce((s, q) => s + q.clicks, 0);
    const weightedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const weightedPosition = totalImpressions > 0
        ? pageQueries.reduce((s, q) => s + q.position * q.impressions, 0) / totalImpressions
        : 0;
    const benchmarkCtrAtPosition = expectedCtrAtPosition(weightedPosition);
    const ctrGapPercentagePoints = benchmarkCtrAtPosition - weightedCtr;

    // ─── Fetch the page HTML and extract content ───
    const pageContent = await fetchPageContent(pageUrl, abortSignal);

    // ─── Tokenize + score overlap ───
    const queryTokens = topTokens(pageQueries.map(q => q.query).join(' '), 30);
    const contentTokens = topTokens(
        [pageContent.title, pageContent.h1, pageContent.metaDescription, pageContent.firstParagraphExcerpt].join(' '),
        50,
    );
    const overlapScore = jaccard(queryTokens, contentTokens);

    let diagnosis: IntentMismatchDiagnosis;
    if (pageQueries.length === 0) diagnosis = 'inconclusive';
    else if (overlapScore >= 0.4) diagnosis = 'aligned';
    else if (overlapScore >= 0.2) diagnosis = 'partial_mismatch';
    else diagnosis = 'severe_mismatch';

    // ─── Human-readable signals ───
    const signals: string[] = [];
    if (pageQueries.length === 0) {
        signals.push(`No GSC query data for ${pageUrl} in the last ${LOOKBACK_DAYS} days (page may be new, deindexed, or has zero impressions).`);
    } else {
        const topQuery = pageQueries[0];
        signals.push(`Top query for this page: "${topQuery.query}" — pos ${topQuery.position.toFixed(1)}, ${topQuery.impressions} impressions, ${topQuery.ctr.toFixed(2)}% CTR.`);
        if (pageContent.h1) signals.push(`Page H1: "${pageContent.h1}"`);
        if (pageContent.title) signals.push(`Page title: "${pageContent.title}"`);

        if (ctrGapPercentagePoints > 3) {
            signals.push(`Weighted CTR (${weightedCtr.toFixed(2)}%) is ${ctrGapPercentagePoints.toFixed(1)} percentage points below the benchmark (${benchmarkCtrAtPosition.toFixed(1)}%) at the weighted position ${weightedPosition.toFixed(1)}. That magnitude points at intent fit, not title weakness.`);
        }

        if (diagnosis === 'severe_mismatch') {
            signals.push(`Severe token-overlap mismatch: only ${(overlapScore * 100).toFixed(0)}% of the page's content terms appear in the queries Google ranks it for. Likely cause: the page is matching for queries it does not actually satisfy. Fix candidates: re-target the page (rewrite to match the actual queries), narrow the content, or noindex if the queries aren't worth pursuing.`);
        } else if (diagnosis === 'partial_mismatch') {
            signals.push(`Partial mismatch: ${(overlapScore * 100).toFixed(0)}% token overlap. The page covers SOME of the matched queries but not all. A title/meta rewrite probably helps; reorganizing content sections per top query helps more.`);
        } else if (diagnosis === 'aligned') {
            signals.push(`Intent alignment looks healthy (${(overlapScore * 100).toFixed(0)}% token overlap). If CTR is still low, the bottleneck is title/meta presentation, not intent.`);
        }
    }

    return {
        pageUrl,
        siteUrl,
        pageQueries,
        pageContent,
        totalImpressions,
        totalClicks,
        weightedCtr: round(weightedCtr, 2),
        weightedPosition: round(weightedPosition, 1),
        benchmarkCtrAtPosition: round(benchmarkCtrAtPosition, 1),
        ctrGapPercentagePoints: round(ctrGapPercentagePoints, 1),
        topQueryTokens: queryTokens,
        pageContentTokens: contentTokens,
        overlapScore: round(overlapScore, 3),
        diagnosis,
        signals,
        fetchedAt,
    };
}

// ─── Helpers ───

async function fetchPageFilteredQueries(
    token: string,
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
): Promise<IntentMismatchQuery[]> {
    // GSC supports dimensionFilterGroups in the body. We bypass runGSCQuery for the filter.
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const body = {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: QUERY_LIMIT,
        startRow: 0,
        dataState: 'all',
        dimensionFilterGroups: [{
            filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
        }],
    };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) return [];
        const data = await res.json() as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };
        return (data.rows ?? [])
            .filter(r => r.keys?.[0])
            .map(r => ({
                query: r.keys![0],
                clicks: Number(r.clicks ?? 0),
                impressions: Number(r.impressions ?? 0),
                ctr: Math.round((Number(r.ctr ?? 0)) * 10000) / 100,
                position: Math.round((Number(r.position ?? 0)) * 10) / 10,
            }));
    } catch {
        return [];
    }
}

async function fetchPageContent(pageUrl: string, signal?: AbortSignal): Promise<IntentMismatchPageContent> {
    const blank: IntentMismatchPageContent = { title: '', h1: '', metaDescription: '', firstParagraphExcerpt: '' };
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const composedSignal = signal ?? controller.signal;
        const res = await fetch(pageUrl, {
            headers: {
                'User-Agent': `${BRAND_NAME}-IntentMismatchBot/1.0`,
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: composedSignal,
        });
        clearTimeout(timeout);
        if (!res.ok) return blank;
        const reader = res.body?.getReader();
        if (!reader) return blank;
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
            if (total > MAX_HTML_BYTES) break;
        }
        const html = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
        const $ = cheerio.load(html);
        $('script, style, noscript').remove();
        const title = $('title').first().text().trim();
        const h1 = $('h1').first().text().trim();
        const metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim();
        const firstParagraph = $('p').first().text().trim();
        return {
            title: title.slice(0, 200),
            h1: h1.slice(0, 200),
            metaDescription: metaDescription.slice(0, 300),
            firstParagraphExcerpt: firstParagraph.slice(0, 500),
        };
    } catch {
        return blank;
    }
}

function topTokens(text: string, limit: number): string[] {
    if (!text) return [];
    const tokens = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
    // Simple stemmer: strip common plural / -ing / -ed suffixes
    const stemmed = tokens.map(stem);
    // Count frequencies, return top N
    const counts = new Map<string, number>();
    for (const t of stemmed) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([t]) => t);
}

function stem(t: string): string {
    if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
    if (t.endsWith('ed') && t.length > 4) return t.slice(0, -2);
    if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
    if (t.endsWith('es') && t.length > 3) return t.slice(0, -2);
    if (t.endsWith('s') && t.length > 3 && !t.endsWith('ss')) return t.slice(0, -1);
    return t;
}

function jaccard(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter++;
    const union = sa.size + sb.size - inter;
    return union === 0 ? 0 : inter / union;
}

function expectedCtrAtPosition(pos: number): number {
    // Advanced Web Ranking 2023 CTR study (rough).
    if (pos <= 1) return 28;
    if (pos <= 2) return 16;
    if (pos <= 3) return 11;
    if (pos <= 5) return 7;
    if (pos <= 7) return 4.5;
    if (pos <= 10) return 2.5;
    return 1;
}

function round(n: number, dp: number): number {
    const factor = Math.pow(10, dp);
    return Math.round(n * factor) / factor;
}
