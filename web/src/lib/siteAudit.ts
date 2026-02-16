/**
 * Site Audit Engine — Fetches a URL, parses HTML, and runs 50+ SEO checks.
 * Returns a structured audit report with score, issues, and recommendations.
 */
import * as cheerio from 'cheerio';

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
                'User-Agent': 'GrowClaw-AuditBot/1.0 (SEO Audit Tool)',
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
    images.each((_, el) => {
        const alt = $(el).attr('alt');
        if (alt && alt.trim().length > 0) imagesWithAlt++;
        else imagesWithoutAlt++;
    });

    // Links
    const allLinks = $('a[href]');
    let internalLinks = 0;
    let externalLinks = 0;
    const brokenLinkCandidates: string[] = [];
    allLinks.each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        try {
            const linkUrl = new URL(href, finalUrl);
            if (linkUrl.hostname === hostname) internalLinks++;
            else externalLinks++;
        } catch {
            internalLinks++; // relative URL
        }
    });

    // Body text
    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = countWords(bodyText);

    // Scripts and stylesheets
    const scriptCount = $('script[src]').length;
    const stylesheetCount = $('link[rel="stylesheet"]').length;

    // Structured data
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let hasStructuredData = jsonLdScripts.length > 0;

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
    } catch {}

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
    };
}
