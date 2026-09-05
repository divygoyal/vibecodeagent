/**
 * pageInspect.ts — rich HTML inspector for the AI chat tool.
 *
 * Where pageMeta.ts returns a thin record (title/desc/canonical/h1/word
 * count/link counts) used inline in the dashboard snapshot, this module
 * returns a much richer structure designed to be handed to Gemini as the
 * `fetch_page_html` tool result. The AI uses it to ground recommendations
 * in actual page content — "your <h1> says X, change to Y" rather than
 * "improve your H1".
 *
 * Specifically extracts:
 *   - title, meta description, canonical
 *   - all H1s (so duplicate-H1 bugs can be flagged), all H2s, all H3s
 *   - JSON-LD blocks parsed (so schema.org types and missing fields can
 *     be diagnosed)
 *   - Open Graph + Twitter Card fields
 *   - hreflang map
 *   - image count + alt-text coverage
 *   - internal-link count + a sample of anchor texts (for spotting bad
 *     anchor phrasing)
 *   - robots meta + nofollow flag
 *   - page weight in KB
 *
 * Network safety: 8s timeout, 2 MB response cap, only public URLs (uses
 * the same isBlockedUrl guard as pageMeta).
 */
import * as cheerio from 'cheerio';
import { isBlockedUrl } from './urlValidation';
import { BRAND_NAME } from '@/lib/brand';

export interface PageStructure {
    url: string;
    fetched: boolean;
    statusCode: number;
    title: string;
    metaDescription: string;
    canonical: string;
    headings: { h1: string[]; h2: string[]; h3: string[] };
    /** Raw parsed JSON-LD blocks. Empty when none present or all malformed. */
    jsonLd: unknown[];
    /** Schema.org @type values pulled from jsonLd (deduped). */
    schemaTypes: string[];
    openGraph: {
        title?: string;
        description?: string;
        image?: string;
        url?: string;
        type?: string;
        siteName?: string;
    };
    twitterCard: {
        card?: string;
        title?: string;
        description?: string;
        image?: string;
    };
    /** [{ hreflang: 'en-us', href: 'https://...' }] */
    hreflang: { hreflang: string; href: string }[];
    wordCount: number;
    internalLinks: number;
    externalLinks: number;
    /** Up to 20 internal-link anchor texts (helps the AI spot generic
     *  anchors like "click here" / "learn more"). */
    sampleInternalAnchors: string[];
    images: {
        total: number;
        withAlt: number;
        withoutAlt: number;
    };
    robotsMeta: string;
    noindex: boolean;
    nofollow: boolean;
    pageWeightKb: number;
    error?: string;
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_HEADINGS = 30;
const MAX_HREFLANG = 30;
const MAX_ANCHOR_SAMPLES = 20;
const MAX_JSONLD_BLOCKS = 12;

function blank(url: string, statusCode = 0, error?: string): PageStructure {
    return {
        url,
        fetched: false,
        statusCode,
        title: '',
        metaDescription: '',
        canonical: '',
        headings: { h1: [], h2: [], h3: [] },
        jsonLd: [],
        schemaTypes: [],
        openGraph: {},
        twitterCard: {},
        hreflang: [],
        wordCount: 0,
        internalLinks: 0,
        externalLinks: 0,
        sampleInternalAnchors: [],
        images: { total: 0, withAlt: 0, withoutAlt: 0 },
        robotsMeta: '',
        noindex: false,
        nofollow: false,
        pageWeightKb: 0,
        error,
    };
}

function getHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return ''; }
}

function countWords(text: string): number {
    return text.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0).length;
}

/** Pull every @type out of a JSON-LD object tree (handles nested @graph,
 *  arrays, and string-or-array @type values). Returns deduped string array. */
function extractSchemaTypes(blocks: unknown[]): string[] {
    const out = new Set<string>();
    const walk = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        const t = obj['@type'];
        if (typeof t === 'string') out.add(t);
        else if (Array.isArray(t)) t.forEach(v => { if (typeof v === 'string') out.add(v); });
        const graph = obj['@graph'];
        if (graph) walk(graph);
        // Walk all object/array children — schema can nest arbitrarily.
        for (const key of Object.keys(obj)) {
            if (key === '@type' || key === '@graph') continue;
            const v = obj[key];
            if (v && typeof v === 'object') walk(v);
        }
    };
    blocks.forEach(walk);
    return [...out].sort();
}

/**
 * Fetch and parse a public URL into a structured PageStructure. Best-effort:
 * returns a blank record (with `error` set) on any failure rather than
 * throwing — the caller is the chat tool runner and surfacing a structured
 * "couldn't reach the page" answer is better than a stack trace.
 */
export async function inspectPageHtml(url: string): Promise<PageStructure> {
    if (!url || typeof url !== 'string') return blank('', 0, 'invalid url');
    if (isBlockedUrl(url)) return blank(url, 0, 'blocked url');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(url, {
            headers: {
                'User-Agent': `${BRAND_NAME}-Inspector/1.0`,
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: controller.signal,
        });
    } catch (e: unknown) {
        clearTimeout(timer);
        const msg = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'fetch failed';
        return blank(url, 0, msg);
    }
    clearTimeout(timer);

    if (!res.ok) return blank(url, res.status, `HTTP ${res.status}`);

    let rawHtml = '';
    try {
        const text = await res.text();
        rawHtml = text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'body read failed';
        return blank(url, res.status, msg);
    }
    if (!rawHtml) return blank(url, res.status, 'empty body');

    const $ = cheerio.load(rawHtml);
    const finalUrl = res.url || url;
    const hostname = getHostname(finalUrl);
    const pageWeightKb = Math.round((rawHtml.length / 1024) * 10) / 10;

    // Title + meta basics
    const title = ($('head title').first().text() || '').trim().slice(0, 300);
    const metaDescription = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 400);
    const canonical = ($('link[rel="canonical"]').attr('href') || '').trim().slice(0, 300);
    const robotsMeta = ($('meta[name="robots"]').attr('content') || '').trim();
    const robotsLower = robotsMeta.toLowerCase();
    const noindex = robotsLower.includes('noindex');
    const nofollow = robotsLower.includes('nofollow');

    // Headings — full lists, capped.
    const collectHeadings = (sel: string): string[] => {
        const out: string[] = [];
        $(sel).each((_, el) => {
            if (out.length >= MAX_HEADINGS) return false;
            const t = $(el).text().replace(/\s+/g, ' ').trim();
            if (t) out.push(t.slice(0, 200));
        });
        return out;
    };
    const headings = {
        h1: collectHeadings('h1'),
        h2: collectHeadings('h2'),
        h3: collectHeadings('h3'),
    };

    // JSON-LD blocks
    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        if (jsonLd.length >= MAX_JSONLD_BLOCKS) return false;
        const raw = $(el).contents().text();
        if (!raw) return;
        try {
            jsonLd.push(JSON.parse(raw));
        } catch {
            // Skip malformed blocks — many real-world sites have them.
        }
    });
    const schemaTypes = extractSchemaTypes(jsonLd);

    // Open Graph + Twitter Card
    const og = (prop: string) => $(`meta[property="og:${prop}"]`).attr('content')?.trim().slice(0, 300);
    const tw = (name: string) => $(`meta[name="twitter:${name}"]`).attr('content')?.trim().slice(0, 300);
    const openGraph: PageStructure['openGraph'] = {
        title: og('title') || undefined,
        description: og('description') || undefined,
        image: og('image') || undefined,
        url: og('url') || undefined,
        type: og('type') || undefined,
        siteName: og('site_name') || undefined,
    };
    const twitterCard: PageStructure['twitterCard'] = {
        card: tw('card') || undefined,
        title: tw('title') || undefined,
        description: tw('description') || undefined,
        image: tw('image') || undefined,
    };

    // hreflang map
    const hreflang: { hreflang: string; href: string }[] = [];
    $('link[rel="alternate"][hreflang]').each((_, el) => {
        if (hreflang.length >= MAX_HREFLANG) return false;
        const lang = $(el).attr('hreflang')?.trim();
        const href = $(el).attr('href')?.trim();
        if (lang && href) hreflang.push({ hreflang: lang, href });
    });

    // Body text + word count
    const bodyText = $('body').text() || '';
    const wordCount = countWords(bodyText);

    // Links: count + sample anchors
    let internalLinks = 0;
    let externalLinks = 0;
    const sampleInternalAnchors: string[] = [];
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        let isInternal = false;
        if (href.startsWith('/')) {
            isInternal = true;
        } else {
            try {
                const u = new URL(href, finalUrl);
                isInternal = u.hostname === hostname;
            } catch { return; }
        }
        if (isInternal) {
            internalLinks++;
            if (sampleInternalAnchors.length < MAX_ANCHOR_SAMPLES) {
                const anchor = $(el).text().replace(/\s+/g, ' ').trim();
                if (anchor) sampleInternalAnchors.push(anchor.slice(0, 80));
            }
        } else {
            externalLinks++;
        }
    });

    // Images + alt coverage
    let imgTotal = 0;
    let imgWithAlt = 0;
    $('img').each((_, el) => {
        imgTotal++;
        const alt = $(el).attr('alt');
        if (typeof alt === 'string' && alt.trim().length > 0) imgWithAlt++;
    });

    return {
        url: finalUrl,
        fetched: true,
        statusCode: res.status,
        title,
        metaDescription,
        canonical,
        headings,
        jsonLd,
        schemaTypes,
        openGraph,
        twitterCard,
        hreflang,
        wordCount,
        internalLinks,
        externalLinks,
        sampleInternalAnchors,
        images: { total: imgTotal, withAlt: imgWithAlt, withoutAlt: imgTotal - imgWithAlt },
        robotsMeta,
        noindex,
        nofollow,
        pageWeightKb,
    };
}
