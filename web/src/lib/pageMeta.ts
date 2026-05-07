/**
 * pageMeta.ts — lightweight on-page metadata fetcher.
 *
 * Returns title, meta description, canonical, H1, word count, and
 * internal-link count for a URL. Uses cheerio (already a dependency
 * via siteAudit.ts).
 *
 * Used by chatSnapshot.ts to enrich the top "money pages" so the
 * LLM can say "your current title is X, change to Y" instead of
 * vague "your title is too long".
 */
import * as cheerio from 'cheerio';
import { isBlockedUrl } from './urlValidation';

export interface PageMeta {
    url: string;
    fetched: boolean;
    statusCode: number;
    title: string;
    description: string;
    canonical: string;
    h1: string;
    wordCount: number;
    internalLinks: number;
    externalLinks: number;
    /** "Open Graph" title — fallback when <title> is generic. */
    ogTitle: string;
    /** Whether the page declares <meta name="robots" content="noindex">. */
    noindex: boolean;
    error?: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;

/** Build a "blank" PageMeta record for failed fetches. */
function blank(url: string, statusCode = 0, error?: string): PageMeta {
    return {
        url,
        fetched: false,
        statusCode,
        title: '',
        description: '',
        canonical: '',
        h1: '',
        wordCount: 0,
        internalLinks: 0,
        externalLinks: 0,
        ogTitle: '',
        noindex: false,
        error,
    };
}

function getHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return ''; }
}

function countWords(text: string): number {
    return text.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0).length;
}

/**
 * Fetch metadata for a single URL. Best-effort — returns a blank
 * record on failure rather than throwing.
 */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
    if (!url || typeof url !== 'string') return blank('', 0, 'invalid url');
    if (isBlockedUrl(url)) return blank(url, 0, 'blocked url');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(url, {
            headers: {
                'User-Agent': 'TrafficClaw-MetaBot/1.0',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: controller.signal,
        });
    } catch (e: any) {
        clearTimeout(timer);
        return blank(url, 0, e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch failed'));
    }
    clearTimeout(timer);
    if (!res.ok) return blank(url, res.status, `HTTP ${res.status}`);

    let html = '';
    try {
        const text = await res.text();
        html = text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
    } catch (e: any) {
        return blank(url, res.status, e?.message || 'body read failed');
    }
    if (!html) return blank(url, res.status, 'empty body');

    const $ = cheerio.load(html);
    const hostname = getHostname(res.url || url);

    const title = ($('head title').first().text() || '').trim();
    const description = ($('meta[name="description"]').attr('content') || '').trim();
    const canonical = ($('link[rel="canonical"]').attr('href') || '').trim();
    const ogTitle = ($('meta[property="og:title"]').attr('content') || '').trim();
    const robots = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
    const noindex = robots.includes('noindex');
    const h1 = ($('h1').first().text() || '').trim().slice(0, 200);
    // word count from body text (cheerio doesn't run JS, so SPAs return mostly empty here — that's fine for SSR sites)
    const bodyText = $('body').text() || '';
    const wordCount = countWords(bodyText);
    let internalLinks = 0;
    let externalLinks = 0;
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        if (href.startsWith('/')) { internalLinks++; return; }
        try {
            const u = new URL(href, res.url || url);
            if (u.hostname === hostname) internalLinks++;
            else externalLinks++;
        } catch { /* malformed href — ignore */ }
    });

    return {
        url: res.url || url,
        fetched: true,
        statusCode: res.status,
        title: title.slice(0, 300),
        description: description.slice(0, 400),
        canonical: canonical.slice(0, 300),
        h1,
        wordCount,
        internalLinks,
        externalLinks,
        ogTitle: ogTitle.slice(0, 300),
        noindex,
    };
}

/**
 * Fetch metadata for multiple URLs in parallel. Capped at 5 concurrent
 * to avoid hammering the user's origin. Returns a Map keyed by the URL
 * you passed in (NOT the post-redirect URL).
 */
export async function fetchPageMetaBatch(urls: string[]): Promise<Map<string, PageMeta>> {
    const out = new Map<string, PageMeta>();
    const unique = [...new Set(urls.filter(u => !!u))].slice(0, 8);
    if (unique.length === 0) return out;
    // Run all in parallel — Node's http agent will pool up to its default limit
    const results = await Promise.all(unique.map(u => fetchPageMeta(u).catch(() => blank(u, 0, 'unhandled error'))));
    unique.forEach((u, i) => out.set(u, results[i]));
    return out;
}
