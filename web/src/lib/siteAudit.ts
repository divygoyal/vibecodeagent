/**
 * Site Audit Engine — Fetches a URL, parses HTML, and runs 50+ SEO checks.
 * Returns a structured audit report with score, issues, and recommendations.
 */
import * as cheerio from 'cheerio';
import { isBlockedUrl } from './urlValidation';
import { detectSiteType, type SiteTypeResult } from './siteTypeDetector';
import { BRAND_NAME } from '@/lib/brand';

// ─── Types ───

export type Severity = 'critical' | 'warning' | 'info' | 'passed';

export interface AuditIssue {
    id: string;
    category: string;
    title: string;
    description: string;
    severity: Severity;
    recommendation?: string;
    value?: string;
}

export interface AuditReport {
    url: string;
    fetchedAt: string;
    responseTime: number;
    statusCode: number;
    score: number;
    summary: { critical: number; warning: number; info: number; passed: number; total: number };
    issues: AuditIssue[];
    meta: {
        title?: string;
        description?: string;
        canonical?: string;
        wordCount: number;
        pageSize: number;
        headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
        images: { total: number; withAlt: number; withoutAlt: number };
        links: { internal: number; external: number; total: number };
        scripts: number;
        stylesheets: number;
    };
    details: {
        links: { url: string; text: string; type: 'internal' | 'external'; nofollow: boolean }[];
        images: { src: string; alt: string; hasAlt: boolean; lazy: boolean }[];
        headings: { level: number; text: string }[];
        scripts: { src: string }[];
        stylesheets: { href: string }[];
        structuredData: { type: string; data: string }[];
    };
    siteType?: SiteTypeResult;
    htmlExcerpt?: string;
}

// ─── Helpers ───

function normalizeUrl(input: string): string {
    let url = input.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

function getHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function countWords(text: string): number {
    return text.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0).length;
}

// ─── Main Audit Function ───

export async function runSiteAudit(rawUrl: string): Promise<AuditReport> {
    const url = normalizeUrl(rawUrl);

    // SSRF protection: block internal/private IPs and metadata endpoints
    if (isBlockedUrl(url)) {
        throw new Error('URL is not allowed: internal or private addresses are blocked');
    }

    const issues: AuditIssue[] = [];
    const hostname = getHostname(url);

    // 1. Fetch the page
    const startTime = Date.now();
    let html = '';
    let statusCode = 0;
    let headers: Headers = new Headers();
    let finalUrl = url;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, {
            headers: {
                'User-Agent': `${BRAND_NAME}-AuditBot/1.0 (SEO Audit Tool)`,
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: controller.signal,
        });
        clearTimeout(timeout);

        statusCode = res.status;
        headers = res.headers;
        finalUrl = res.url;
        html = await res.text();
    } catch (err: any) {
        throw new Error(`Failed to fetch ${url}: ${err.message}`);
    }

    const responseTime = Date.now() - startTime;
    const pageSize = new Blob([html]).size;
    const $ = cheerio.load(html);

    // ─── Meta extraction ───
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';
    const canonical = $('link[rel="canonical"]').attr('href')?.trim() || '';
    const viewport = $('meta[name="viewport"]').attr('content')?.trim() || '';
    const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || '';
    const lang = $('html').attr('lang') || '';
    const robots = $('meta[name="robots"]').attr('content')?.trim() || '';
    const xRobots = headers.get('x-robots-tag') || '';

    // OG tags
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogUrl = $('meta[property="og:url"]').attr('content') || '';
    const ogType = $('meta[property="og:type"]').attr('content') || '';

    // Twitter Card
    const twCard = $('meta[name="twitter:card"]').attr('content') || '';
    const twTitle = $('meta[name="twitter:title"]').attr('content') || '';
    const twDesc = $('meta[name="twitter:description"]').attr('content') || '';

    // Headings
    const h1s = $('h1');
    const h2s = $('h2');
    const h3s = $('h3');
    const h4s = $('h4');
    const h5s = $('h5');
    const h6s = $('h6');
    const headingCounts = {
        h1: h1s.length, h2: h2s.length, h3: h3s.length,
        h4: h4s.length, h5: h5s.length, h6: h6s.length,
    };

    // Images
    const images = $('img');
    let imagesWithAlt = 0;
    let imagesWithoutAlt = 0;
    const imageDetails: { src: string; alt: string; hasAlt: boolean; lazy: boolean }[] = [];
    images.each((_, el) => {
        const alt = $(el).attr('alt');
        if (alt && alt.trim().length > 0) imagesWithAlt++;
        else imagesWithoutAlt++;
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        const altText = alt || '';
        const loading = $(el).attr('loading') || '';
        imageDetails.push({ src: src.slice(0, 200), alt: altText.slice(0, 200), hasAlt: !!(alt && alt.trim()), lazy: loading === 'lazy' });
    });

    // Links
    const allLinks = $('a[href]');
    let internalLinks = 0;
    let externalLinks = 0;
    const brokenLinkCandidates: string[] = [];
    const linkDetails: { url: string; text: string; type: 'internal' | 'external'; nofollow: boolean }[] = [];
    allLinks.each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().slice(0, 100);
        const rel = $(el).attr('rel') || '';
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        let isInternal = false;
        try {
            const linkUrl = new URL(href, finalUrl);
            if (linkUrl.hostname === hostname) { internalLinks++; isInternal = true; }
            else externalLinks++;
        } catch {
            internalLinks++; // relative URL
            isInternal = true;
        }
        linkDetails.push({ url: href, text, type: isInternal ? 'internal' : 'external', nofollow: rel.includes('nofollow') });
    });

    // Collect heading details
    const headingDetails: { level: number; text: string }[] = [];
    (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).forEach((tag, i) => {
        $(tag).each((_, el) => {
            headingDetails.push({ level: i + 1, text: $(el).text().trim().slice(0, 200) });
        });
    });

    // Collect script details (before removal)
    const scriptDetails: { src: string }[] = [];
    $('script[src]').each((_, el) => { scriptDetails.push({ src: $(el).attr('src') || '' }); });

    // Collect stylesheet details (before removal)
    const stylesheetDetails: { href: string }[] = [];
    $('link[rel="stylesheet"]').each((_, el) => { stylesheetDetails.push({ href: $(el).attr('href') || '' }); });

    // Collect structured data details (before removal)
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const structuredDataDetails: { type: string; data: string }[] = [];
    jsonLdScripts.each((_, el) => {
        const text = $(el).html() || '';
        let schemaType = 'Unknown';
        try {
            const parsed = JSON.parse(text);
            schemaType = parsed['@type'] || parsed.type || 'Unknown';
        } catch { /* invalid JSON */ }
        structuredDataDetails.push({ type: schemaType, data: text.slice(0, 500) });
    });

    // Site type detection — MUST run before scripts are stripped (uses script[src] signals)
    const siteTypeResult = detectSiteType($, html, finalUrl);

    // Capture lowercased script srcs while scripts are still in the DOM (for CRO/vendor checks below)
    const scriptSrcsLower = scriptDetails.map(s => (s.src || '').toLowerCase());

    const scriptCount = scriptDetails.length;
    const stylesheetCount = stylesheetDetails.length;
    const hasStructuredData = jsonLdScripts.length > 0;

    // Body text
    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = countWords(bodyText);
    const bodyTextLower = bodyText.toLowerCase();
    const htmlExcerpt = bodyText.slice(0, 8000);

    // Favicon
    const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || '';

    // ═══════════════════════════════════════
    // ─── SEO CHECKS (50+) ───
    // ═══════════════════════════════════════

    // ── Category: HTTP & Security ──

    // 1. HTTPS check
    if (!finalUrl.startsWith('https://')) {
        issues.push({ id: 'http-no-https', category: 'Security', title: 'Site not using HTTPS', description: 'The page is served over HTTP instead of HTTPS.', severity: 'critical', recommendation: 'Migrate to HTTPS and set up proper SSL/TLS certificates.' });
    } else {
        issues.push({ id: 'http-https', category: 'Security', title: 'HTTPS enabled', description: 'Site is served over HTTPS.', severity: 'passed' });
    }

    // 2. Status code
    if (statusCode >= 400) {
        issues.push({ id: 'http-status-error', category: 'HTTP', title: `HTTP ${statusCode} error`, description: `Server returned status ${statusCode}.`, severity: 'critical', recommendation: 'Ensure the URL returns a 200 OK status.' });
    } else if (statusCode >= 300 && statusCode < 400) {
        issues.push({ id: 'http-redirect', category: 'HTTP', title: `Page redirects (${statusCode})`, description: `The URL redirects to ${finalUrl}.`, severity: 'warning', recommendation: 'Use the final URL directly to avoid redirect chains.' });
    } else {
        issues.push({ id: 'http-status-ok', category: 'HTTP', title: 'HTTP status OK (200)', description: 'Page returned a successful status code.', severity: 'passed' });
    }

    // 3. Response time
    if (responseTime > 3000) {
        issues.push({ id: 'perf-slow-response', category: 'Performance', title: 'Slow server response', description: `Response time: ${responseTime}ms (>3s).`, severity: 'critical', value: `${responseTime}ms`, recommendation: 'Optimize server performance, enable caching, or use a CDN.' });
    } else if (responseTime > 1500) {
        issues.push({ id: 'perf-moderate-response', category: 'Performance', title: 'Moderate response time', description: `Response time: ${responseTime}ms.`, severity: 'warning', value: `${responseTime}ms`, recommendation: 'Consider server-side caching to reduce response times.' });
    } else {
        issues.push({ id: 'perf-fast-response', category: 'Performance', title: 'Fast server response', description: `Response time: ${responseTime}ms.`, severity: 'passed', value: `${responseTime}ms` });
    }

    // 4. Content-Security-Policy
    if (!headers.get('content-security-policy')) {
        issues.push({ id: 'sec-no-csp', category: 'Security', title: 'Missing Content-Security-Policy', description: 'No CSP header found.', severity: 'info', recommendation: 'Add a Content-Security-Policy header to protect against XSS attacks.' });
    } else {
        issues.push({ id: 'sec-csp', category: 'Security', title: 'Content-Security-Policy present', description: 'CSP header is configured.', severity: 'passed' });
    }

    // 5. X-Frame-Options
    if (!headers.get('x-frame-options') && !headers.get('content-security-policy')?.includes('frame-ancestors')) {
        issues.push({ id: 'sec-no-xframe', category: 'Security', title: 'Missing X-Frame-Options', description: 'Page can be embedded in iframes.', severity: 'info', recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN header.' });
    }

    // 6. HSTS
    if (!headers.get('strict-transport-security')) {
        issues.push({ id: 'sec-no-hsts', category: 'Security', title: 'Missing HSTS header', description: 'No Strict-Transport-Security header.', severity: 'info', recommendation: 'Enable HSTS to force HTTPS connections.' });
    } else {
        issues.push({ id: 'sec-hsts', category: 'Security', title: 'HSTS enabled', description: 'Strict-Transport-Security header present.', severity: 'passed' });
    }

    // ── Category: Title Tag ──

    // 7. Title exists
    if (!title) {
        issues.push({ id: 'title-missing', category: 'Title', title: 'Missing title tag', description: 'No <title> tag found.', severity: 'critical', recommendation: 'Add a unique, descriptive title tag (50-60 characters).' });
    } else {
        issues.push({ id: 'title-present', category: 'Title', title: 'Title tag present', description: `Title: "${title}"`, severity: 'passed', value: title });
    }

    // 8. Title length
    if (title) {
        if (title.length < 30) {
            issues.push({ id: 'title-too-short', category: 'Title', title: 'Title too short', description: `Title is ${title.length} characters (recommended: 50-60).`, severity: 'warning', value: `${title.length} chars`, recommendation: 'Expand your title to include more descriptive keywords.' });
        } else if (title.length > 60) {
            issues.push({ id: 'title-too-long', category: 'Title', title: 'Title too long', description: `Title is ${title.length} characters (recommended: 50-60). It may be truncated in search results.`, severity: 'warning', value: `${title.length} chars`, recommendation: 'Shorten to 60 characters or less for full display in SERPs.' });
        } else {
            issues.push({ id: 'title-length-ok', category: 'Title', title: 'Title length optimal', description: `Title is ${title.length} characters.`, severity: 'passed', value: `${title.length} chars` });
        }
    }

    // 9. Multiple title tags
    if ($('title').length > 1) {
        issues.push({ id: 'title-multiple', category: 'Title', title: 'Multiple title tags', description: `Found ${$('title').length} title tags. Only one is recommended.`, severity: 'warning', recommendation: 'Remove duplicate title tags.' });
    }

    // ── Category: Meta Description ──

    // 10. Meta description exists
    if (!metaDesc) {
        issues.push({ id: 'meta-desc-missing', category: 'Meta', title: 'Missing meta description', description: 'No meta description tag found.', severity: 'critical', recommendation: 'Add a compelling meta description (150-160 characters) that includes target keywords.' });
    } else {
        issues.push({ id: 'meta-desc-present', category: 'Meta', title: 'Meta description present', description: `Description: "${metaDesc.substring(0, 80)}${metaDesc.length > 80 ? '...' : ''}"`, severity: 'passed', value: metaDesc });
    }

    // 11. Meta description length
    if (metaDesc) {
        if (metaDesc.length < 70) {
            issues.push({ id: 'meta-desc-short', category: 'Meta', title: 'Meta description too short', description: `${metaDesc.length} characters (recommended: 150-160).`, severity: 'warning', value: `${metaDesc.length} chars`, recommendation: 'Expand to 150-160 characters with a clear call-to-action.' });
        } else if (metaDesc.length > 160) {
            issues.push({ id: 'meta-desc-long', category: 'Meta', title: 'Meta description too long', description: `${metaDesc.length} characters (may be truncated after 160).`, severity: 'warning', value: `${metaDesc.length} chars`, recommendation: 'Trim to 160 characters maximum.' });
        } else {
            issues.push({ id: 'meta-desc-length-ok', category: 'Meta', title: 'Meta description length optimal', description: `${metaDesc.length} characters.`, severity: 'passed', value: `${metaDesc.length} chars` });
        }
    }

    // ── Category: Head Tags ──

    // 12. Canonical URL
    if (!canonical) {
        issues.push({ id: 'head-no-canonical', category: 'Head', title: 'Missing canonical URL', description: 'No <link rel="canonical"> found.', severity: 'warning', recommendation: 'Add a canonical URL to prevent duplicate content issues.' });
    } else {
        issues.push({ id: 'head-canonical', category: 'Head', title: 'Canonical URL set', description: `Canonical: ${canonical}`, severity: 'passed', value: canonical });
    }

    // 13. Viewport
    if (!viewport) {
        issues.push({ id: 'head-no-viewport', category: 'Head', title: 'Missing viewport meta tag', description: 'No viewport meta tag found. Page may not render well on mobile.', severity: 'critical', recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
    } else {
        issues.push({ id: 'head-viewport', category: 'Head', title: 'Viewport meta tag present', description: 'Mobile viewport is configured.', severity: 'passed' });
    }

    // 14. Charset
    if (!charset) {
        issues.push({ id: 'head-no-charset', category: 'Head', title: 'Missing charset declaration', description: 'No charset/encoding declared.', severity: 'warning', recommendation: 'Add <meta charset="UTF-8"> in the <head>.' });
    } else {
        issues.push({ id: 'head-charset', category: 'Head', title: 'Charset declared', description: `Charset: ${typeof charset === 'string' ? charset : 'set'}`, severity: 'passed' });
    }

    // 15. Language attribute
    if (!lang) {
        issues.push({ id: 'head-no-lang', category: 'Head', title: 'Missing lang attribute', description: 'No lang attribute on <html> tag.', severity: 'warning', recommendation: 'Add lang="en" (or appropriate language) to the <html> tag for accessibility and SEO.' });
    } else {
        issues.push({ id: 'head-lang', category: 'Head', title: 'Language attribute set', description: `Language: ${lang}`, severity: 'passed', value: lang });
    }

    // 16. Favicon
    if (!favicon) {
        issues.push({ id: 'head-no-favicon', category: 'Head', title: 'Missing favicon', description: 'No favicon link found in <head>.', severity: 'info', recommendation: 'Add a favicon for better branding in browser tabs and bookmarks.' });
    } else {
        issues.push({ id: 'head-favicon', category: 'Head', title: 'Favicon present', description: 'Favicon link found.', severity: 'passed' });
    }

    // 17. Robots meta
    if (robots.includes('noindex')) {
        issues.push({ id: 'head-noindex', category: 'Head', title: 'Page is set to noindex', description: 'The robots meta tag includes "noindex" — this page will NOT appear in search results.', severity: 'critical', recommendation: 'Remove noindex if this page should be indexed.' });
    }
    if (xRobots.includes('noindex')) {
        issues.push({ id: 'head-xrobots-noindex', category: 'Head', title: 'X-Robots-Tag: noindex', description: 'The X-Robots-Tag HTTP header includes "noindex".', severity: 'critical', recommendation: 'Remove noindex from server headers if this page should be indexed.' });
    }

    // ── Category: Headings ──

    // 18. H1 exists
    if (headingCounts.h1 === 0) {
        issues.push({ id: 'heading-no-h1', category: 'Headings', title: 'Missing H1 tag', description: 'No H1 heading found on the page.', severity: 'critical', recommendation: 'Add exactly one H1 tag with the primary keyword.' });
    } else if (headingCounts.h1 === 1) {
        const h1Text = h1s.first().text().trim();
        issues.push({ id: 'heading-h1-ok', category: 'Headings', title: 'H1 tag present', description: `H1: "${h1Text.substring(0, 80)}${h1Text.length > 80 ? '...' : ''}"`, severity: 'passed', value: h1Text });
    }

    // 19. Multiple H1s
    if (headingCounts.h1 > 1) {
        issues.push({ id: 'heading-multiple-h1', category: 'Headings', title: 'Multiple H1 tags', description: `Found ${headingCounts.h1} H1 tags. Best practice is exactly one H1.`, severity: 'warning', recommendation: 'Keep only one H1 tag per page. Convert others to H2 or H3.' });
    }

    // 20. H1 length
    if (headingCounts.h1 === 1) {
        const h1Len = h1s.first().text().trim().length;
        if (h1Len > 70) {
            issues.push({ id: 'heading-h1-long', category: 'Headings', title: 'H1 tag too long', description: `H1 is ${h1Len} characters. Keep it concise (<70 chars).`, severity: 'info', value: `${h1Len} chars` });
        }
    }

    // 21. Heading hierarchy
    if (headingCounts.h1 > 0 && headingCounts.h2 === 0 && headingCounts.h3 > 0) {
        issues.push({ id: 'heading-skip-h2', category: 'Headings', title: 'Heading hierarchy skips H2', description: 'H3 tags found without H2. This breaks heading hierarchy.', severity: 'warning', recommendation: 'Maintain proper heading hierarchy: H1 → H2 → H3.' });
    }

    // 22. No subheadings
    if (headingCounts.h2 === 0 && wordCount > 300) {
        issues.push({ id: 'heading-no-subheadings', category: 'Headings', title: 'No subheadings (H2) found', description: 'Long content without subheadings is harder to read and less SEO-friendly.', severity: 'warning', recommendation: 'Break content into sections with H2 and H3 headings.' });
    }

    // ── Category: Content ──

    // 23. Word count
    if (wordCount < 100) {
        issues.push({ id: 'content-thin', category: 'Content', title: 'Thin content', description: `Only ${wordCount} words on the page. Search engines may consider this thin content.`, severity: 'critical', value: `${wordCount} words`, recommendation: 'Add more comprehensive, useful content (aim for 500+ words for blog posts).' });
    } else if (wordCount < 300) {
        issues.push({ id: 'content-short', category: 'Content', title: 'Short content', description: `${wordCount} words. Consider adding more depth.`, severity: 'warning', value: `${wordCount} words`, recommendation: 'Expand content to 500+ words for better SEO performance.' });
    } else {
        issues.push({ id: 'content-length-ok', category: 'Content', title: 'Content length adequate', description: `${wordCount} words on the page.`, severity: 'passed', value: `${wordCount} words` });
    }

    // ── Category: Images ──

    // 24. Images without alt text
    if (imagesWithoutAlt > 0) {
        issues.push({ id: 'img-missing-alt', category: 'Images', title: `${imagesWithoutAlt} image(s) missing alt text`, description: `${imagesWithoutAlt} of ${images.length} images have no alt attribute.`, severity: imagesWithoutAlt > 5 ? 'critical' : 'warning', value: `${imagesWithoutAlt}/${images.length}`, recommendation: 'Add descriptive alt text to all images for accessibility and SEO.' });
    } else if (images.length > 0) {
        issues.push({ id: 'img-all-alt', category: 'Images', title: 'All images have alt text', description: `${images.length} image(s) all have alt attributes.`, severity: 'passed', value: `${images.length} images` });
    }

    // 25. No images
    if (images.length === 0 && wordCount > 200) {
        issues.push({ id: 'img-none', category: 'Images', title: 'No images found', description: 'Content-heavy page with no images.', severity: 'info', recommendation: 'Adding relevant images can improve engagement and provide image search traffic.' });
    }

    // 26. Lazy loading
    const lazyImages = $('img[loading="lazy"]').length;
    if (images.length > 5 && lazyImages === 0) {
        issues.push({ id: 'img-no-lazy', category: 'Images', title: 'No lazy-loaded images', description: `${images.length} images without lazy loading.`, severity: 'info', recommendation: 'Add loading="lazy" to below-the-fold images for faster page load.' });
    }

    // ── Category: Links ──

    // 27. Internal links
    if (internalLinks === 0 && wordCount > 100) {
        issues.push({ id: 'link-no-internal', category: 'Links', title: 'No internal links', description: 'Page has no internal links to other pages on the site.', severity: 'warning', recommendation: 'Add internal links to related content to improve site navigation and SEO.' });
    } else if (internalLinks > 0) {
        issues.push({ id: 'link-internal-ok', category: 'Links', title: 'Internal links found', description: `${internalLinks} internal link(s) found.`, severity: 'passed', value: `${internalLinks}` });
    }

    // 28. External links
    if (externalLinks === 0 && wordCount > 500) {
        issues.push({ id: 'link-no-external', category: 'Links', title: 'No external links', description: 'No outbound links found. External links to authoritative sources can boost credibility.', severity: 'info', recommendation: 'Link to relevant, authoritative external sources.' });
    }

    // 29. Too many links
    if (internalLinks + externalLinks > 200) {
        issues.push({ id: 'link-too-many', category: 'Links', title: 'Excessive links on page', description: `${internalLinks + externalLinks} total links found.`, severity: 'warning', recommendation: 'Consider reducing the number of links to avoid diluting link equity.' });
    }

    // 30. Nofollow external links check
    const nofollowLinks = $('a[rel*="nofollow"]').length;
    if (externalLinks > 0 && nofollowLinks === 0) {
        issues.push({ id: 'link-no-nofollow', category: 'Links', title: 'No nofollow on external links', description: 'External links have no rel="nofollow" attribute.', severity: 'info', recommendation: 'Consider adding rel="nofollow" to untrusted or sponsored external links.' });
    }

    // ── Category: Open Graph ──

    // 31. OG Title
    if (!ogTitle) {
        issues.push({ id: 'og-no-title', category: 'Social', title: 'Missing og:title', description: 'No Open Graph title tag. Social shares may not display correctly.', severity: 'warning', recommendation: 'Add <meta property="og:title" content="..."> for better social sharing.' });
    } else {
        issues.push({ id: 'og-title', category: 'Social', title: 'og:title present', description: `og:title: "${ogTitle.substring(0, 60)}..."`, severity: 'passed' });
    }

    // 32. OG Description
    if (!ogDesc) {
        issues.push({ id: 'og-no-desc', category: 'Social', title: 'Missing og:description', description: 'No Open Graph description.', severity: 'warning', recommendation: 'Add <meta property="og:description" content="...">.' });
    }

    // 33. OG Image
    if (!ogImage) {
        issues.push({ id: 'og-no-image', category: 'Social', title: 'Missing og:image', description: 'No Open Graph image. Social shares will lack a preview image.', severity: 'warning', recommendation: 'Add <meta property="og:image" content="..."> with a 1200x630px image.' });
    } else {
        issues.push({ id: 'og-image', category: 'Social', title: 'og:image present', description: 'Open Graph image is set.', severity: 'passed' });
    }

    // 34. OG URL
    if (!ogUrl) {
        issues.push({ id: 'og-no-url', category: 'Social', title: 'Missing og:url', description: 'No og:url meta tag.', severity: 'info', recommendation: 'Add <meta property="og:url" content="..."> with the canonical URL.' });
    }

    // 35. OG Type
    if (!ogType) {
        issues.push({ id: 'og-no-type', category: 'Social', title: 'Missing og:type', description: 'No og:type meta tag.', severity: 'info', recommendation: 'Add <meta property="og:type" content="website"> or appropriate type.' });
    }

    // ── Category: Twitter Card ──

    // 36. Twitter card
    if (!twCard) {
        issues.push({ id: 'tw-no-card', category: 'Social', title: 'Missing Twitter Card', description: 'No twitter:card meta tag.', severity: 'info', recommendation: 'Add <meta name="twitter:card" content="summary_large_image">.' });
    } else {
        issues.push({ id: 'tw-card', category: 'Social', title: 'Twitter Card present', description: `Card type: ${twCard}`, severity: 'passed' });
    }

    // ── Category: Structured Data ──

    // 37. JSON-LD structured data
    if (!hasStructuredData) {
        issues.push({ id: 'sd-missing', category: 'Structured Data', title: 'No structured data (JSON-LD)', description: 'No schema.org structured data found.', severity: 'warning', recommendation: 'Add JSON-LD structured data for better search result appearance (rich snippets).' });
    } else {
        issues.push({ id: 'sd-present', category: 'Structured Data', title: 'Structured data found', description: `${jsonLdScripts.length} JSON-LD script(s) found.`, severity: 'passed', value: `${jsonLdScripts.length}` });
    }

    // 38. Schema validation (basic)
    if (hasStructuredData) {
        jsonLdScripts.each((_, el) => {
            try {
                const text = $(el).html();
                if (text) JSON.parse(text);
            } catch {
                issues.push({ id: 'sd-invalid-json', category: 'Structured Data', title: 'Invalid JSON-LD', description: 'One or more JSON-LD scripts contain invalid JSON.', severity: 'warning', recommendation: 'Fix the JSON-LD syntax to ensure search engines can parse it.' });
            }
        });
    }

    // ── Category: Performance ──

    // 39. Page size
    const pageSizeKB = Math.round(pageSize / 1024);
    if (pageSizeKB > 3000) {
        issues.push({ id: 'perf-page-heavy', category: 'Performance', title: 'Very large page size', description: `Page is ${pageSizeKB}KB (>3MB).`, severity: 'critical', value: `${pageSizeKB}KB`, recommendation: 'Reduce page size by compressing images, minifying code, and removing unused resources.' });
    } else if (pageSizeKB > 1000) {
        issues.push({ id: 'perf-page-large', category: 'Performance', title: 'Large page size', description: `Page is ${pageSizeKB}KB (>1MB).`, severity: 'warning', value: `${pageSizeKB}KB`, recommendation: 'Consider optimizing page weight for faster loading.' });
    } else {
        issues.push({ id: 'perf-page-ok', category: 'Performance', title: 'Page size acceptable', description: `Page is ${pageSizeKB}KB.`, severity: 'passed', value: `${pageSizeKB}KB` });
    }

    // 40. Too many scripts
    if (scriptCount > 15) {
        issues.push({ id: 'perf-many-scripts', category: 'Performance', title: 'Too many JavaScript files', description: `${scriptCount} external scripts found. This impacts load time.`, severity: 'warning', value: `${scriptCount}`, recommendation: 'Combine, defer, or async load scripts to improve performance.' });
    } else {
        issues.push({ id: 'perf-scripts-ok', category: 'Performance', title: 'Script count acceptable', description: `${scriptCount} external script(s).`, severity: 'passed', value: `${scriptCount}` });
    }

    // 41. Too many stylesheets
    if (stylesheetCount > 8) {
        issues.push({ id: 'perf-many-css', category: 'Performance', title: 'Many external stylesheets', description: `${stylesheetCount} stylesheet(s) found.`, severity: 'warning', value: `${stylesheetCount}`, recommendation: 'Combine stylesheets or use critical CSS inlining.' });
    }

    // 42. Render-blocking in head
    const headScriptsBlocking = $('head script:not([async]):not([defer])[src]').length;
    if (headScriptsBlocking > 0) {
        issues.push({ id: 'perf-render-block', category: 'Performance', title: 'Render-blocking scripts in <head>', description: `${headScriptsBlocking} script(s) without async/defer in <head>.`, severity: 'warning', value: `${headScriptsBlocking}`, recommendation: 'Add async or defer to scripts in <head>, or move them to end of <body>.' });
    } else {
        issues.push({ id: 'perf-no-render-block', category: 'Performance', title: 'No render-blocking scripts', description: 'All scripts in <head> use async or defer.', severity: 'passed' });
    }

    // 43. Compression
    const encoding = headers.get('content-encoding') || '';
    if (!encoding.includes('gzip') && !encoding.includes('br') && !encoding.includes('deflate')) {
        issues.push({ id: 'perf-no-compression', category: 'Performance', title: 'No content compression', description: 'Response not compressed with gzip/brotli.', severity: 'warning', recommendation: 'Enable gzip or Brotli compression on the server.' });
    } else {
        issues.push({ id: 'perf-compressed', category: 'Performance', title: 'Content compressed', description: `Encoding: ${encoding}`, severity: 'passed' });
    }

    // ── Category: Mobile & Accessibility ──

    // 44. Touch icons
    const appleTouchIcon = $('link[rel="apple-touch-icon"]').length > 0;
    if (!appleTouchIcon) {
        issues.push({ id: 'mobile-no-touch-icon', category: 'Mobile', title: 'Missing Apple touch icon', description: 'No apple-touch-icon link found.', severity: 'info', recommendation: 'Add <link rel="apple-touch-icon" href="..."> for mobile bookmarking.' });
    }

    // 45. Text size / readability (basic)
    const smallTextElements = $('body *').filter((_, el) => {
        const fontSize = $(el).css('font-size');
        return !!fontSize && parseInt(fontSize) < 12;
    }).length;
    // We can't reliably detect computed styles, so skip this one

    // 46. Tap targets (basic heuristic — check for very small links)
    // Skip — needs computed styles

    // ── Category: SEO Best Practices ──

    // 47. Duplicate title and H1
    if (title && headingCounts.h1 === 1) {
        const h1Text = h1s.first().text().trim();
        if (title.toLowerCase() === h1Text.toLowerCase()) {
            issues.push({ id: 'seo-title-h1-dupe', category: 'SEO', title: 'Title and H1 are identical', description: 'Title tag and H1 have the same text.', severity: 'info', recommendation: 'Differentiate the title tag and H1 slightly for better keyword coverage.' });
        }
    }

    // 48. Meta keywords (deprecated)
    const metaKeywords = $('meta[name="keywords"]').attr('content');
    if (metaKeywords) {
        issues.push({ id: 'seo-meta-keywords', category: 'SEO', title: 'Meta keywords tag found', description: 'Google ignores the meta keywords tag. It provides no SEO value.', severity: 'info', recommendation: 'Remove the meta keywords tag to reduce code clutter.' });
    }

    // 49. Inline CSS abuse
    const inlineStyleElements = $('[style]').length;
    if (inlineStyleElements > 20) {
        issues.push({ id: 'seo-inline-css', category: 'SEO', title: 'Excessive inline styles', description: `${inlineStyleElements} elements with inline style attributes.`, severity: 'info', value: `${inlineStyleElements}`, recommendation: 'Move styles to external CSS for cleaner HTML and better caching.' });
    }

    // 50. iframe usage
    const iframes = $('iframe').length;
    if (iframes > 3) {
        issues.push({ id: 'seo-many-iframes', category: 'SEO', title: 'Multiple iframes detected', description: `${iframes} iframes found. Content in iframes is not indexed by search engines.`, severity: 'warning', recommendation: 'Minimize iframe usage. Embed content directly when possible.' });
    }

    // 51. Flash content
    const flashObjects = $('object[type*="flash"], embed[type*="flash"]').length;
    if (flashObjects > 0) {
        issues.push({ id: 'seo-flash', category: 'SEO', title: 'Flash content detected', description: 'Flash is deprecated and not supported by modern browsers.', severity: 'critical', recommendation: 'Replace Flash content with HTML5 alternatives.' });
    }

    // 52. Text-to-HTML ratio
    const htmlLength = html.length;
    const textRatio = htmlLength > 0 ? (bodyText.length / htmlLength) * 100 : 0;
    if (textRatio < 10) {
        issues.push({ id: 'seo-low-text-ratio', category: 'Content', title: 'Low text-to-HTML ratio', description: `Text ratio: ${textRatio.toFixed(1)}%. High code-to-content ratio.`, severity: 'warning', value: `${textRatio.toFixed(1)}%`, recommendation: 'Increase the proportion of actual content vs. HTML markup.' });
    } else {
        issues.push({ id: 'seo-text-ratio-ok', category: 'Content', title: 'Text-to-HTML ratio acceptable', description: `Text ratio: ${textRatio.toFixed(1)}%.`, severity: 'passed', value: `${textRatio.toFixed(1)}%` });
    }

    // 53. URL structure
    try {
        const urlObj = new URL(finalUrl);
        if (urlObj.pathname.length > 100) {
            issues.push({ id: 'seo-url-long', category: 'SEO', title: 'URL path is very long', description: `URL path is ${urlObj.pathname.length} characters.`, severity: 'info', recommendation: 'Keep URLs short, descriptive, and keyword-rich.' });
        }
        if (urlObj.pathname.includes('_')) {
            issues.push({ id: 'seo-url-underscore', category: 'SEO', title: 'URL uses underscores', description: 'Google treats underscores as word joiners, not separators.', severity: 'info', recommendation: 'Use hyphens (-) instead of underscores (_) in URLs.' });
        }
        if (urlObj.search.length > 0 && urlObj.search.includes('&')) {
            issues.push({ id: 'seo-url-params', category: 'SEO', title: 'URL has query parameters', description: 'Dynamic URLs with parameters are harder for search engines.', severity: 'info', recommendation: 'Consider using clean, static URLs when possible.' });
        }
    } catch { }

    // 54. Deprecated HTML tags
    const deprecatedTags = ['center', 'font', 'marquee', 'blink', 'big', 'strike'];
    for (const tag of deprecatedTags) {
        if ($(tag).length > 0) {
            issues.push({ id: `seo-deprecated-${tag}`, category: 'SEO', title: `Deprecated <${tag}> tag used`, description: `Found ${$(tag).length} <${tag}> element(s).`, severity: 'info', recommendation: `Replace <${tag}> with modern CSS equivalents.` });
        }
    }

    // 55. Empty links
    const emptyLinks = $('a[href]').filter((_, el) => !$(el).text().trim() && !$(el).find('img').length).length;
    if (emptyLinks > 0) {
        issues.push({ id: 'seo-empty-links', category: 'Links', title: 'Empty anchor tags', description: `${emptyLinks} link(s) with no text or image content.`, severity: 'warning', value: `${emptyLinks}`, recommendation: 'Add descriptive anchor text to all links for accessibility and SEO.' });
    }

    // ═══════════════════════════════════════
    // ─── CRO / FUNNEL / TRUST / COMMERCE CHECKS (#56-#81) ───
    // ═══════════════════════════════════════

    // Shared precompute for CRO checks
    const ctaSelector = 'button, a[class*="btn"], a[class*="button"], a[class*="cta"], [role="button"]';
    const allCtaTexts = $(ctaSelector)
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(t => t.length > 0);
    const weakCtaPattern = /^(submit|click here|learn more|read more|more info|continue|next|go|ok)\.?$/i;
    const aboveFoldText = bodyTextLower.slice(0, 800);
    const aboveFoldCtas = allCtaTexts.filter(t => aboveFoldText.includes(t.toLowerCase())).length;
    const primaryCtaPattern = /class="[^"]*(primary|cta|hero)[^"]*"/gi;
    const primaryCtaMatches = (html.slice(0, 4000).match(primaryCtaPattern) || []).length;

    // ── CTA ──

    // 56. No CTA above the fold
    if (aboveFoldCtas === 0 && allCtaTexts.length > 0) {
        issues.push({ id: 'cro-no-cta-above-fold', category: 'CRO', title: 'No CTA above the fold', description: 'No clickable call-to-action detected in the first 800 chars of body content.', severity: 'warning', recommendation: 'Place a clear primary CTA (e.g., "Start Free Trial", "Get a Quote") in the hero area to capture visitor intent.' });
    } else if (aboveFoldCtas === 0 && allCtaTexts.length === 0) {
        issues.push({ id: 'cro-no-cta-at-all', category: 'CRO', title: 'No CTA buttons detected anywhere', description: 'No button-like elements or CTA-styled links found on the page.', severity: 'critical', recommendation: 'Add at least one primary CTA — without it visitors have no clear next step.' });
    }

    // 57. Weak CTA copy
    if (allCtaTexts.length > 0 && allCtaTexts.every(t => weakCtaPattern.test(t))) {
        issues.push({ id: 'cro-cta-weak-copy', category: 'CRO', title: 'All CTAs use weak/generic copy', description: 'Every CTA uses generic verbs like "Submit", "Click here", or "Learn more".', severity: 'warning', value: `${allCtaTexts.length} CTAs`, recommendation: 'Rewrite CTA copy with action verbs and outcome ("Start my free trial", "Get my quote", "See pricing").' });
    }

    // 58. Multiple primary CTAs above the fold
    if (primaryCtaMatches > 3) {
        issues.push({ id: 'cro-multiple-primary-ctas', category: 'CRO', title: 'Multiple competing primary CTAs', description: `${primaryCtaMatches} elements styled as primary CTA in the top of the page.`, severity: 'info', value: `${primaryCtaMatches}`, recommendation: 'Pick one primary action and demote the rest to secondary styling so attention focuses on the highest-value step.' });
    }

    // ── Popups / Funnel ──

    const popupVendorPattern = /(optimonk|sumo\.|mailchimp.*popup|klaviyo|popupally|getsitecontrol|optinmonster|wisepops|sleeknote|hellobar)/i;
    const popupVendorHits = scriptSrcsLower.filter(s => popupVendorPattern.test(s));
    const hasModalElement = $('[class*="modal"], [class*="popup"], [class*="lightbox"], [class*="overlay"], dialog').length > 0;
    const exitIntentPattern = /(exit[-_]?intent|optinmonster.*exit|popupsmart.*exit|mouseleave)/i;
    const hasExitIntent = scriptSrcsLower.some(s => exitIntentPattern.test(s)) || exitIntentPattern.test(html);

    // 59. Popup detected
    if (popupVendorHits.length > 0) {
        issues.push({ id: 'funnel-popup-detected', category: 'Funnel', title: 'Popup/lightbox vendor detected', description: `Detected: ${popupVendorHits[0].split('/').pop()}.`, severity: 'info', recommendation: 'Audit popup timing — fire on scroll-depth or exit-intent rather than immediately on load to avoid SEO penalty and bounce.' });
    }

    // 60. No popup / lead capture
    if (popupVendorHits.length === 0 && !hasModalElement && wordCount > 300) {
        issues.push({ id: 'funnel-popup-missing', category: 'Funnel', title: 'No lead-capture mechanism detected', description: 'No popup, modal, or inline newsletter form found. Visitor intent leaks without a capture point.', severity: 'info', recommendation: 'Add an exit-intent popup or scroll-triggered newsletter form to convert anonymous traffic.' });
    }

    // 61. No exit-intent
    if (!hasExitIntent && (popupVendorHits.length > 0 || hasModalElement)) {
        issues.push({ id: 'funnel-exit-intent-missing', category: 'Funnel', title: 'Popup not exit-intent triggered', description: 'Popup mechanism exists but no exit-intent trigger detected — popups firing on load harm UX and SEO.', severity: 'info', recommendation: 'Switch popup trigger to exit-intent or 30%+ scroll depth.' });
    }

    // ── Trust signals ──

    const hasReviewSchema = structuredDataDetails.some(s => /Review|AggregateRating/.test(s.type));
    const hasTestimonialText = /testimonial|customer (?:says|story|review)/i.test(bodyTextLower);
    const hasTestimonialClass = $('[class*="testimonial"], [class*="review"]').length > 0;

    // 62. No testimonials/reviews
    if (!hasReviewSchema && !hasTestimonialText && !hasTestimonialClass && wordCount > 200) {
        issues.push({ id: 'trust-no-testimonials', category: 'Trust', title: 'No customer testimonials or reviews', description: 'No testimonial or review content detected anywhere on the page.', severity: 'warning', recommendation: 'Add 2-3 specific customer quotes with name, photo, and (if possible) company. Generic praise underperforms — use detail.' });
    }

    // 63. No aggregate rating / star rating
    if (!hasReviewSchema && !/★|⭐|\b\d\.\d\s?\/\s?5\b|\brated\s+\d/i.test(bodyText)) {
        issues.push({ id: 'trust-no-aggregate-rating', category: 'Trust', title: 'No visible star/aggregate rating', description: 'No AggregateRating schema or visible rating UI (★, "4.8/5") detected.', severity: 'info', recommendation: 'Display aggregate review rating (e.g., from Trustpilot, G2, Google Reviews) and add JSON-LD AggregateRating for rich snippets.' });
    }

    // 64. No press / "as seen on" badges
    const hasBadges = $('img[alt*="trusted by" i], img[alt*="as seen on" i], img[alt*="featured in" i], [class*="logo-wall"], [class*="press"], [class*="featured-in"]').length > 0;
    if (!hasBadges && wordCount > 300) {
        issues.push({ id: 'trust-no-badges', category: 'Trust', title: 'No press/customer-logo wall', description: 'No "trusted by", "as seen on", or customer-logo wall detected.', severity: 'info', recommendation: 'If you have notable customers or press coverage, surface them as a logo wall in the hero or below — instant credibility.' });
    }

    // 65. No customer-count proof point
    if (!/\b\d[\d,]{2,}\+?\s+(customers|users|companies|brands|happy customers|members|subscribers|teams|businesses)\b/i.test(bodyText)) {
        issues.push({ id: 'trust-no-customer-count', category: 'Trust', title: 'No quantified social proof', description: 'No "X,XXX+ customers" / "10,000+ users" / similar quantified proof point detected.', severity: 'info', recommendation: 'Add a specific number ("Used by 8,432 teams", "Over 50,000 reels generated") to anchor credibility.' });
    }

    // 66. No guarantee / risk reversal
    if (!/money[\s-]?back|guarantee|refund|free trial|no credit card|cancel any\s*time|risk[\s-]?free|30[\s-]?day/i.test(bodyText)) {
        issues.push({ id: 'trust-no-guarantee', category: 'Trust', title: 'No guarantee or risk-reversal copy', description: 'No "money-back", "30-day", "guarantee", "free trial", or "cancel anytime" copy detected.', severity: 'warning', recommendation: 'Add an explicit risk-reversal line near the primary CTA — guarantees, free trials, or "cancel anytime" lift conversion measurably.' });
    }

    // 67. No security/trust badges (commerce/checkout)
    const hasSecurityBadges = $('img[src*="ssl" i], img[src*="norton" i], img[src*="mcafee" i], img[src*="trustpilot" i], img[src*="bbb" i], img[src*="stripe" i][src*="badge" i]').length > 0;
    if (!hasSecurityBadges && (siteTypeResult.type === 'ecom' || /\/(checkout|cart)/i.test(finalUrl))) {
        issues.push({ id: 'trust-no-security-badges', category: 'Trust', title: 'No security/trust badges on commerce page', description: 'No SSL, Norton, McAfee, Trustpilot, or BBB badge imagery detected.', severity: 'warning', recommendation: 'Surface trust badges near the checkout button — security signals lift completion rates on transactional pages.' });
    }

    // ── Forms ──

    const forms = $('form').toArray();
    let formTooManyFields = 0;
    let formHighRequired = 0;
    let formMissingLabels = 0;
    let formNoTrustNearCta = 0;
    for (const formEl of forms) {
        const $form = $(formEl);
        const visibleInputs = $form.find('input, select, textarea').filter((_, el) => {
            const type = ($(el).attr('type') || '').toLowerCase();
            return type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'csrf';
        });
        const inputCount = visibleInputs.length;
        if (inputCount > 6) formTooManyFields++;
        const requiredCount = visibleInputs.filter((_, el) => $(el).is('[required]')).length;
        if (inputCount >= 3 && requiredCount / inputCount > 0.7) formHighRequired++;
        const missingLabels = visibleInputs.filter((_, el) => {
            const $el = $(el);
            const id = $el.attr('id');
            const hasLabel = id ? $form.find(`label[for="${id}"]`).length > 0 : false;
            return !hasLabel && !$el.attr('aria-label') && !$el.attr('aria-labelledby') && !$el.attr('placeholder');
        }).length;
        if (missingLabels > 0) formMissingLabels += missingLabels;
        const submitNearby = $form.text().toLowerCase();
        if (!/secure|no spam|privacy|free|never share/i.test(submitNearby) && inputCount >= 3) formNoTrustNearCta++;
    }

    // 68. Too many fields
    if (formTooManyFields > 0) {
        issues.push({ id: 'form-too-many-fields', category: 'Forms', title: `${formTooManyFields} form(s) with >6 fields`, description: 'Form length correlates inversely with completion rate — each extra field shaves conversion.', severity: 'warning', value: `${formTooManyFields}`, recommendation: 'Cut to email + name + one custom question. Move secondary qualifiers to a follow-up email or progressive profiling.' });
    }

    // 69. Too many required fields
    if (formHighRequired > 0) {
        issues.push({ id: 'form-high-required-ratio', category: 'Forms', title: `${formHighRequired} form(s) require >70% of fields`, description: 'Heavy required-field ratio increases abandonment.', severity: 'warning', value: `${formHighRequired}`, recommendation: 'Make only the email or core identifier required. Mark the rest optional explicitly ("optional").' });
    }

    // 70. Missing form labels
    if (formMissingLabels > 0) {
        issues.push({ id: 'form-no-labels', category: 'Forms', title: `${formMissingLabels} form input(s) without labels`, description: 'Inputs lack <label>, aria-label, or aria-labelledby. Screen readers and form autofill suffer.', severity: 'warning', value: `${formMissingLabels}`, recommendation: 'Add explicit <label for="..."> or aria-label to every visible input. Placeholder text does not substitute.' });
    }

    // 71. No trust copy near submit
    if (formNoTrustNearCta > 0) {
        issues.push({ id: 'form-no-trust-near-cta', category: 'Forms', title: `${formNoTrustNearCta} form(s) lack reassurance near submit`, description: 'No "we never share your email", "no spam", "secure", or "free" wording near the form.', severity: 'info', value: `${formNoTrustNearCta}`, recommendation: 'Add a one-line reassurance under the submit button to defuse hesitation ("No spam, unsubscribe anytime").' });
    }

    // 72. No quantified social-proof counters
    if (!/\b\d[\d,]{2,}\+/.test(bodyText)) {
        issues.push({ id: 'social-proof-no-counters', category: 'Trust', title: 'No quantified counter ("10,000+")', description: 'No prominent "N+" social-proof counter (users, downloads, reviews, sites).', severity: 'info', recommendation: 'If you have meaningful scale numbers, surface them prominently — "12,847 sites audited", "Trusted by 5,000+ teams".' });
    }

    // ── Urgency ──

    const hasCountdown = $('[class*="countdown"], [class*="timer"], [class*="urgency"]').length > 0;
    const hasUrgencyCopy = /\b(limited time|today only|ends in|hurry|don'?t miss|last chance|while supplies last)\b/i.test(bodyText);
    const countdownVendor = scriptSrcsLower.some(s => /evergreentimer|deadline-funnel|countdownjs/.test(s));

    // 73. No urgency on commerce/promo pages
    if (!hasCountdown && !hasUrgencyCopy && siteTypeResult.type === 'ecom') {
        issues.push({ id: 'urgency-missing', category: 'CRO', title: 'No urgency/scarcity signals', description: 'No countdown, "limited time", or stock-scarcity language detected.', severity: 'info', recommendation: 'For promotional or seasonal offers, surface a real (not fake) urgency cue — countdown to actual deadline or genuine stock remaining.' });
    }

    // 74. Fake-urgency warning (advisory)
    if (countdownVendor && /ends today|expires today/i.test(bodyText)) {
        issues.push({ id: 'urgency-fake-warning', category: 'CRO', title: 'Possible evergreen "fake urgency" detected', description: 'Countdown vendor + "ends today" copy. If the deadline isn\'t real, this erodes trust and may violate FTC guidance.', severity: 'info', recommendation: 'If the deadline is genuine, ignore. If it\'s an evergreen countdown, swap for honest scarcity (real stock count, real promo dates).' });
    }

    // ── Mobile UX ──

    const hasStickyCta = $('[class*="sticky"], [class*="fixed-bottom"], [class*="floating-cta"]').length > 0 || /position\s*:\s*(fixed|sticky)/.test(html);

    // 75. No sticky CTA on long pages
    if (!hasStickyCta && wordCount > 800) {
        issues.push({ id: 'mobile-no-sticky-cta', category: 'Mobile UX', title: 'No sticky/floating CTA on long page', description: 'Long-form content without a persistent CTA forces users to scroll back to convert.', severity: 'info', recommendation: 'Add a sticky bottom-bar CTA on mobile so the primary action follows the scroll. Boosts conversion on content-heavy pages.' });
    }

    // ── Live-chat / vendor presence ──

    const chatVendorPattern = /(intercom|drift\.com|tawk\.to|crisp\.chat|livechatinc|hubspot.*?messages|zendesk.*?chat|tidio|userlike|olark)/i;
    const chatVendorHit = scriptSrcsLower.find(s => chatVendorPattern.test(s));

    // 76. Chat widget detected (informational, can become an opportunity)
    if (chatVendorHit) {
        issues.push({ id: 'chat-widget-detected', category: 'CRO', title: 'Live-chat vendor detected', description: `Detected: ${chatVendorHit.split('/').pop()}.`, severity: 'passed', value: chatVendorHit.split('/').pop() });
    } else if (siteTypeResult.type === 'saas' || siteTypeResult.type === 'lead-gen') {
        issues.push({ id: 'chat-widget-missing', category: 'CRO', title: 'No live-chat widget detected', description: 'For SaaS/lead-gen, live chat captures intent that would otherwise leak.', severity: 'info', recommendation: 'Trial a lightweight chat (Crisp, Intercom Lite) and measure assisted conversions over 30 days.' });
    }

    // ── Compliance ──

    const cookieVendorPattern = /(cookiebot|onetrust|cookieyes|iubenda|osano|cookiehub|usercentrics)/i;
    const hasCookieBanner = scriptSrcsLower.some(s => cookieVendorPattern.test(s)) || $('[id*="cookie" i][role="dialog"], [class*="cookie-consent" i], [class*="cookie-banner" i]').length > 0;

    // 77. Cookie banner detected (informational)
    if (hasCookieBanner) {
        issues.push({ id: 'cookie-banner-detected', category: 'Compliance', title: 'Cookie consent banner detected', description: 'A cookie consent mechanism is in place.', severity: 'passed' });
    }

    // ── Commerce-specific (ecom only) ──

    if (siteTypeResult.type === 'ecom') {
        // 78. Price not visible
        const hasPrice = $('[itemprop="price"], [class*="price"]').length > 0 || /\$\s?\d|€\s?\d|£\s?\d/.test(bodyText) || structuredDataDetails.some(s => /Offer/.test(s.type) && /price/i.test(s.data));
        if (!hasPrice) {
            issues.push({ id: 'commerce-no-price', category: 'Commerce', title: 'No visible price', description: 'No price markup or visible currency amount detected on this commerce page.', severity: 'critical', recommendation: 'Surface the price prominently and wrap it in [itemprop="price"] or schema.org Offer for SERP price snippets.' });
        }

        // 79. No guest checkout language
        const checkoutLinks = $('a[href*="checkout" i], a[href*="cart" i]').map((_, el) => $(el).text().trim().toLowerCase()).get().join(' ');
        if (checkoutLinks && /create account|sign in to continue|register to continue/i.test(checkoutLinks) && !/guest|checkout as guest|no account/i.test(checkoutLinks + ' ' + bodyTextLower)) {
            issues.push({ id: 'commerce-no-guest-checkout', category: 'Commerce', title: 'Forced account creation at checkout', description: 'Checkout flow requires account creation with no "guest checkout" option detected.', severity: 'warning', recommendation: 'Offer guest checkout — forcing accounts is the single largest cart-abandonment driver in ecom benchmarks.' });
        }

        // 80. No payment method icons
        const hasPaymentIcons = $('img[src*="visa" i], img[src*="mastercard" i], img[src*="amex" i], img[src*="paypal" i], img[src*="apple-pay" i], img[src*="apple_pay" i], img[src*="google-pay" i], img[src*="stripe" i][src*="badge" i]').length > 0;
        if (!hasPaymentIcons) {
            issues.push({ id: 'commerce-no-payment-icons', category: 'Commerce', title: 'No payment-method icons visible', description: 'No Visa/Mastercard/PayPal/Apple-Pay imagery detected in the footer or near checkout.', severity: 'info', recommendation: 'Display accepted payment-method icons near the price and in the footer — reduces payment-step hesitation.' });
        }
    }

    // ── Newsletter capture (blog / lead-gen) ──

    if (siteTypeResult.type === 'blog' || siteTypeResult.type === 'lead-gen') {
        const hasEmailInput = $('input[type="email"]').length > 0;
        if (!hasEmailInput) {
            issues.push({ id: 'lead-no-newsletter', category: 'Funnel', title: 'No newsletter / email capture form', description: 'No email input field detected anywhere on the page.', severity: 'warning', recommendation: 'For content sites, an inline or sticky newsletter capture compounds — every page visit becomes a chance to convert anonymous traffic into a subscriber.' });
        }
    }

    // ═══════════════════════════════════════
    // ─── SCORE CALCULATION ───
    // ═══════════════════════════════════════

    const summary = { critical: 0, warning: 0, info: 0, passed: 0, total: issues.length };
    for (const issue of issues) {
        summary[issue.severity]++;
    }

    // Score: start at 100, deduct for issues
    let score = 100;
    score -= summary.critical * 10;
    score -= summary.warning * 3;
    score -= summary.info * 0.5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
        url: finalUrl,
        fetchedAt: new Date().toISOString(),
        responseTime,
        statusCode,
        score,
        summary,
        issues,
        meta: {
            title: title || undefined,
            description: metaDesc || undefined,
            canonical: canonical || undefined,
            wordCount,
            pageSize,
            headings: headingCounts,
            images: { total: images.length, withAlt: imagesWithAlt, withoutAlt: imagesWithoutAlt },
            links: { internal: internalLinks, external: externalLinks, total: internalLinks + externalLinks },
            scripts: scriptCount,
            stylesheets: stylesheetCount,
        },
        details: {
            links: linkDetails.slice(0, 200),
            images: imageDetails.slice(0, 100),
            headings: headingDetails,
            scripts: scriptDetails,
            stylesheets: stylesheetDetails,
            structuredData: structuredDataDetails,
        },
        siteType: siteTypeResult,
        htmlExcerpt,
    };
}
