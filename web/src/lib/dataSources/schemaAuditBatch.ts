/**
 * schemaAuditBatch.ts — JSON-LD schema audit for the chat snapshot.
 *
 * Fetches HTML for the top money-page URL(s) and detects schema.org type coverage:
 * Organization, Website, Article-like (Article/BlogPosting/...), FAQPage, HowTo,
 * Product, BreadcrumbList, Person.
 *
 * Drives the `aeo_invisibility` strategic detector. The "single biggest AEO win"
 * for content sites — appearing in Google SGE, Perplexity, ChatGPT answers —
 * starts with FAQPage / HowTo / Article schema. If those are missing on a
 * site that already has good content, the AEO gap is the headline issue.
 */
import * as cheerio from 'cheerio';
import { isBlockedUrl } from '../urlValidation';

export interface SchemaCoverage {
    hasOrganization: boolean;
    hasWebsite: boolean;
    hasArticleLike: boolean;
    hasFAQ: boolean;
    hasHowTo: boolean;
    hasProduct: boolean;
    hasBreadcrumb: boolean;
    hasPerson: boolean;
}

export interface SchemaAuditResult {
    url: string;
    fetched: boolean;
    coverage: SchemaCoverage;
    detectedTypes: string[];          // unique @type strings observed
    schemaCount: number;              // raw count of <script type="application/ld+json"> blocks
    errorCount: number;
    error?: string;
}

const EMPTY_COVERAGE: SchemaCoverage = {
    hasOrganization: false,
    hasWebsite: false,
    hasArticleLike: false,
    hasFAQ: false,
    hasHowTo: false,
    hasProduct: false,
    hasBreadcrumb: false,
    hasPerson: false,
};

function blank(url: string, error?: string): SchemaAuditResult {
    return { url, fetched: false, coverage: { ...EMPTY_COVERAGE }, detectedTypes: [], schemaCount: 0, errorCount: 0, error };
}

export async function auditPageSchema(url: string): Promise<SchemaAuditResult> {
    if (!url) return blank('', 'no url');
    if (isBlockedUrl(url)) return blank(url, 'blocked url');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res: Response;
    try {
        res = await fetch(url, {
            headers: { 'User-Agent': 'TrafficClaw-SchemaBot/1.0', Accept: 'text/html,application/xhtml+xml' },
            redirect: 'follow',
            signal: controller.signal,
        });
    } catch (e: any) {
        clearTimeout(timer);
        return blank(url, e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch failed'));
    }
    clearTimeout(timer);
    if (!res.ok) return blank(url, `HTTP ${res.status}`);

    let html = '';
    try { html = await res.text(); } catch (e: any) { return blank(url, e?.message || 'body read failed'); }
    if (!html) return blank(url, 'empty body');

    const $ = cheerio.load(html);
    const detectedTypes: string[] = [];
    let schemaCount = 0;
    let errorCount = 0;

    $('script[type="application/ld+json"]').each((_, el) => {
        schemaCount++;
        const raw = $(el).html() || '';
        try {
            const parsed = JSON.parse(raw);
            const items: any[] = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                const t = item['@type'];
                if (!t) continue;
                const types = Array.isArray(t) ? t : [t];
                for (const type of types) detectedTypes.push(String(type));
            }
        } catch {
            errorCount++;
        }
    });

    const has = (re: RegExp) => detectedTypes.some(t => re.test(t));
    const coverage: SchemaCoverage = {
        hasOrganization: has(/Organization|LocalBusiness|Corporation/),
        hasWebsite: has(/WebSite/),
        hasArticleLike: has(/Article|BlogPosting|NewsArticle|TechArticle/),
        hasFAQ: has(/FAQPage/),
        hasHowTo: has(/HowTo/),
        hasProduct: has(/Product/),
        hasBreadcrumb: has(/BreadcrumbList/),
        hasPerson: has(/Person/),
    };

    return {
        url: res.url || url,
        fetched: true,
        coverage,
        detectedTypes: [...new Set(detectedTypes)],
        schemaCount,
        errorCount,
    };
}

/**
 * Audit schema across multiple URLs in parallel. Used to detect site-wide
 * AEO coverage across the top-3 money pages.
 */
export async function auditPagesSchemaBatch(urls: string[]): Promise<Map<string, SchemaAuditResult>> {
    const out = new Map<string, SchemaAuditResult>();
    const unique = [...new Set(urls.filter(u => !!u))].slice(0, 5);
    if (unique.length === 0) return out;
    const results = await Promise.all(unique.map(u => auditPageSchema(u).catch(() => blank(u, 'unhandled'))));
    unique.forEach((u, i) => out.set(u, results[i]));
    return out;
}

/** Aggregate site-wide schema coverage from per-page results. */
export function aggregateSchemaCoverage(perPage: Map<string, SchemaAuditResult>): SchemaCoverage & { totalErrors: number; pagesAudited: number; pagesFetched: number } {
    const agg: SchemaCoverage = { ...EMPTY_COVERAGE };
    let totalErrors = 0;
    let pagesFetched = 0;
    for (const r of perPage.values()) {
        if (!r.fetched) continue;
        pagesFetched++;
        agg.hasOrganization = agg.hasOrganization || r.coverage.hasOrganization;
        agg.hasWebsite = agg.hasWebsite || r.coverage.hasWebsite;
        agg.hasArticleLike = agg.hasArticleLike || r.coverage.hasArticleLike;
        agg.hasFAQ = agg.hasFAQ || r.coverage.hasFAQ;
        agg.hasHowTo = agg.hasHowTo || r.coverage.hasHowTo;
        agg.hasProduct = agg.hasProduct || r.coverage.hasProduct;
        agg.hasBreadcrumb = agg.hasBreadcrumb || r.coverage.hasBreadcrumb;
        agg.hasPerson = agg.hasPerson || r.coverage.hasPerson;
        totalErrors += r.errorCount;
    }
    return { ...agg, totalErrors, pagesAudited: perPage.size, pagesFetched };
}
