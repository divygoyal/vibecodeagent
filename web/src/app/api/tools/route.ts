import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { BRAND_NAME } from '@/lib/brand';

// ── Rate Limiting ──────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
        return true;
    }
    if (entry.count >= 10) return false;
    entry.count++;
    return true;
}

// Periodically clean stale entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
    }
}, 300000);

// ── Helpers ────────────────────────────────────────────────────────────────────

function getIp(req: NextRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        '127.0.0.1';
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': `Mozilla/5.0 (compatible; ${BRAND_NAME}Bot/1.0)`,
                'Accept': 'text/html,application/xhtml+xml,*/*',
            },
        });
        return res;
    } finally {
        clearTimeout(id);
    }
}

// ── Robots.txt Analyzer ────────────────────────────────────────────────────────

const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot', 'Bingbot'];

interface RobotsDirective {
    userAgent: string;
    rules: { type: string; value: string }[];
}

function parseRobotsTxt(raw: string) {
    const lines = raw.split('\n').map((l) => l.trim());
    const directives: RobotsDirective[] = [];
    const sitemaps: string[] = [];
    const issues: { severity: string; message: string }[] = [];

    let current: RobotsDirective | null = null;

    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;

        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const keyLower = key.trim().toLowerCase();

        if (keyLower === 'user-agent') {
            current = { userAgent: value, rules: [] };
            directives.push(current);
        } else if (keyLower === 'disallow' && current) {
            current.rules.push({ type: 'Disallow', value });
        } else if (keyLower === 'allow' && current) {
            current.rules.push({ type: 'Allow', value });
        } else if (keyLower === 'sitemap') {
            sitemaps.push(value);
        }
    }

    // Check crawler access
    const crawlers = AI_CRAWLERS.map((bot) => {
        const botDirective = directives.find(
            (d) => d.userAgent.toLowerCase() === bot.toLowerCase()
        );
        const wildcardDirective = directives.find((d) => d.userAgent === '*');

        if (botDirective) {
            const hasBlock = botDirective.rules.some(
                (r) => r.type === 'Disallow' && r.value === '/'
            );
            return { bot, status: hasBlock ? 'blocked' : 'allowed' };
        }

        if (wildcardDirective) {
            const hasBlock = wildcardDirective.rules.some(
                (r) => r.type === 'Disallow' && r.value === '/'
            );
            return { bot, status: hasBlock ? 'blocked' : 'allowed' };
        }

        return { bot, status: 'not_specified' };
    });

    // Detect issues
    if (sitemaps.length === 0) {
        issues.push({ severity: 'warning', message: 'No Sitemap directive found. Adding a sitemap reference helps crawlers discover your content.' });
    }

    const blockedImportant = crawlers.filter(
        (c) => ['Googlebot', 'Bingbot'].includes(c.bot) && c.status === 'blocked'
    );
    if (blockedImportant.length > 0) {
        issues.push({
            severity: 'error',
            message: `Important search engine crawler(s) blocked: ${blockedImportant.map((c) => c.bot).join(', ')}. This will prevent indexing.`,
        });
    }

    const blockedAI = crawlers.filter(
        (c) => ['GPTBot', 'ClaudeBot', 'PerplexityBot'].includes(c.bot) && c.status === 'blocked'
    );
    if (blockedAI.length > 0) {
        issues.push({
            severity: 'info',
            message: `AI crawler(s) blocked: ${blockedAI.map((c) => c.bot).join(', ')}. This may reduce visibility in AI search results.`,
        });
    }

    if (directives.length === 0) {
        issues.push({ severity: 'warning', message: 'No User-agent directives found. The robots.txt file may be malformed.' });
    }

    // Ensure directives with no rules still appear
    for (const d of directives) {
        if (d.rules.length === 0) {
            d.rules.push({ type: 'Allow', value: '(all — no rules specified)' });
        }
    }

    return { raw, directives, crawlers, sitemaps, issues };
}

async function handleRobots(domain: string) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    let raw: string;

    try {
        const res = await fetchWithTimeout(`https://${cleanDomain}/robots.txt`);
        if (!res.ok) {
            if (res.status === 404) {
                return {
                    raw: '',
                    directives: [],
                    crawlers: AI_CRAWLERS.map((bot) => ({ bot, status: 'not_specified' })),
                    sitemaps: [],
                    issues: [{ severity: 'warning', message: 'No robots.txt file found. All crawlers are allowed by default, but you should create one for better control.' }],
                };
            }
            throw new Error(`Failed to fetch robots.txt (HTTP ${res.status})`);
        }
        raw = await res.text();
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('Request timed out while fetching robots.txt');
        }
        throw err;
    }

    return parseRobotsTxt(raw);
}

// ── Readability Checker ────────────────────────────────────────────────────────

function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;
    for (let i = 0; i < word.length; i++) {
        const isVowel = vowels.includes(word[i]);
        if (isVowel && !prevVowel) count++;
        prevVowel = isVowel;
    }
    if (word.endsWith('e') && count > 1) count--;
    return Math.max(count, 1);
}

function computeReadability(text: string) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const wordCount = words.length;
    const sentenceCount = Math.max(sentences.length, 1);
    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = wordCount > 0 ? totalSyllables / wordCount : 0;

    const score = Math.max(0, Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord));
    const gradeLevel = Math.max(0, 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59);

    let rating: string;
    if (score >= 90) rating = 'Very Easy';
    else if (score >= 80) rating = 'Easy';
    else if (score >= 70) rating = 'Fairly Easy';
    else if (score >= 60) rating = 'Standard';
    else if (score >= 50) rating = 'Fairly Difficult';
    else if (score >= 30) rating = 'Difficult';
    else rating = 'Very Difficult';

    const recommendations: string[] = [];
    if (avgWordsPerSentence > 20) recommendations.push('Shorten your sentences. Aim for 15-20 words per sentence on average.');
    if (avgSyllablesPerWord > 1.6) recommendations.push('Use simpler words. Replace multi-syllable words with shorter alternatives.');
    if (score < 60) recommendations.push('Break up long paragraphs into shorter, more digestible chunks.');
    if (score < 50) recommendations.push('Consider using bullet points or numbered lists to improve scanability.');
    if (score >= 80) recommendations.push('Great readability! Your content is accessible to a wide audience.');
    if (wordCount < 100) recommendations.push('Your text is quite short. Longer content tends to perform better for SEO.');
    if (wordCount > 2000) recommendations.push('Consider adding a table of contents for easier navigation.');

    return {
        score: Math.round(score * 10) / 10,
        gradeLevel: Math.round(gradeLevel * 10) / 10,
        wordCount,
        sentenceCount,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
        rating,
        recommendations,
    };
}

async function handleReadability(url: string) {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Failed to fetch page (HTTP ${res.status})`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer, header to get main content
    $('script, style, nav, footer, header, aside, iframe, noscript').remove();

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 20) {
        throw new Error('Could not extract enough text content from this page.');
    }

    return computeReadability(text);
}

// ── Hreflang Validator ─────────────────────────────────────────────────────────

const VALID_LANG_PATTERN = /^[a-z]{2}(-[a-z]{2})?$|^x-default$/i;

async function handleHreflang(url: string) {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Failed to fetch page (HTTP ${res.status})`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const tags: { lang: string; url: string; status: 'valid' | 'invalid' | 'warning' }[] = [];
    let source: 'html' | 'header' | 'none' = 'none';

    // Check HTML link tags
    $('link[rel="alternate"][hreflang]').each((_, el) => {
        const lang = $(el).attr('hreflang') || '';
        const href = $(el).attr('href') || '';
        const isValidLang = VALID_LANG_PATTERN.test(lang);
        const isValidUrl = href.startsWith('http') || href.startsWith('/');

        tags.push({
            lang,
            url: href,
            status: isValidLang && isValidUrl ? 'valid' : 'invalid',
        });
    });

    if (tags.length > 0) source = 'html';

    // Check for HTTP headers (from response)
    const linkHeader = res.headers.get('link');
    if (linkHeader) {
        const hreflangLinks = linkHeader.split(',').filter((l) => l.includes('hreflang'));
        for (const link of hreflangLinks) {
            const urlMatch = link.match(/<([^>]+)>/);
            const langMatch = link.match(/hreflang="([^"]+)"/);
            if (urlMatch && langMatch) {
                const isValidLang = VALID_LANG_PATTERN.test(langMatch[1]);
                tags.push({
                    lang: langMatch[1],
                    url: urlMatch[1],
                    status: isValidLang ? 'valid' : 'invalid',
                });
                if (source === 'none') source = 'header';
            }
        }
    }

    // Validation checks
    const checks: { name: string; passed: boolean; detail: string }[] = [];

    // Self-referencing tag
    const hasSelfRef = tags.some((t) => {
        try {
            const tagUrl = new URL(t.url, url);
            const pageUrl = new URL(url);
            return tagUrl.pathname === pageUrl.pathname && tagUrl.hostname === pageUrl.hostname;
        } catch {
            return false;
        }
    });
    checks.push({
        name: 'Self-referencing tag',
        passed: hasSelfRef || tags.length === 0,
        detail: hasSelfRef ? 'Page includes a hreflang tag pointing to itself.' : tags.length === 0 ? 'No hreflang tags found to validate.' : 'Missing self-referencing hreflang tag. Each page should reference itself.',
    });

    // x-default present
    const hasXDefault = tags.some((t) => t.lang.toLowerCase() === 'x-default');
    checks.push({
        name: 'x-default tag',
        passed: hasXDefault || tags.length === 0,
        detail: hasXDefault ? 'x-default fallback tag is present.' : tags.length === 0 ? 'No hreflang tags found.' : 'No x-default tag found. Consider adding one as a fallback for unmatched languages.',
    });

    // Valid language codes
    const invalidLangs = tags.filter((t) => !VALID_LANG_PATTERN.test(t.lang));
    checks.push({
        name: 'Valid language codes',
        passed: invalidLangs.length === 0,
        detail: invalidLangs.length === 0 ? 'All language codes are valid ISO 639-1 format.' : `Invalid language codes found: ${invalidLangs.map((t) => t.lang).join(', ')}`,
    });

    // Absolute URLs
    const relativeUrls = tags.filter((t) => !t.url.startsWith('http'));
    checks.push({
        name: 'Absolute URLs',
        passed: relativeUrls.length === 0,
        detail: relativeUrls.length === 0 ? 'All hreflang URLs are absolute.' : `${relativeUrls.length} relative URL(s) found. Hreflang tags should use absolute URLs.`,
    });

    // Issues
    const issues: { severity: string; message: string }[] = [];
    if (tags.length === 0) {
        issues.push({ severity: 'info', message: 'No hreflang tags found. If this site targets multiple languages or regions, consider implementing hreflang.' });
    }
    if (!hasSelfRef && tags.length > 0) {
        issues.push({ severity: 'error', message: 'Missing self-referencing hreflang tag. This is required for proper implementation.' });
    }
    if (invalidLangs.length > 0) {
        issues.push({ severity: 'error', message: `Invalid language code(s): ${invalidLangs.map((t) => t.lang).join(', ')}. Use ISO 639-1 codes (e.g., "en", "fr", "de-AT").` });
    }
    if (relativeUrls.length > 0) {
        issues.push({ severity: 'warning', message: 'Relative URLs detected. Use fully qualified absolute URLs in hreflang tags.' });
    }
    if (!hasXDefault && tags.length > 0) {
        issues.push({ severity: 'warning', message: 'No x-default tag found. This fallback tag helps search engines handle users whose language is not specifically targeted.' });
    }

    return { tags, checks, issues, source };
}

// ── GEO (AI Search Readiness) ──────────────────────────────────────────────────

async function handleGeo(url: string) {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Failed to fetch page (HTTP ${res.status})`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // ── Citability ──
    const bodyText = $('body').text();
    const statPatterns = /\d+(\.\d+)?%|\$[\d,.]+|\d+\s*(million|billion|thousand|percent)/gi;
    const statsCount = (bodyText.match(statPatterns) || []).length;
    const quoteCount = $('blockquote').length + (bodyText.match(/[""\u201C\u201D]/g) || []).length / 2;
    const citationCount = $('a[href*="doi.org"], a[href*="scholar.google"], cite, .citation, .reference, sup a').length;
    const dataElements = $('table, .stat, .data, .metric, [data-stat]').length;

    const citabilityFindings: string[] = [];
    const citabilityRecs: string[] = [];
    let citabilityScore = 30; // base

    if (statsCount > 0) { citabilityScore += Math.min(statsCount * 5, 25); citabilityFindings.push(`Found ${statsCount} statistical reference(s).`); }
    else { citabilityRecs.push('Add specific data points, percentages, or statistics to make content more citable.'); }

    if (quoteCount > 0) { citabilityScore += Math.min(quoteCount * 5, 15); citabilityFindings.push(`Found ~${Math.round(quoteCount)} quote(s) or attributed statements.`); }
    else { citabilityRecs.push('Include expert quotes or attributed statements to boost authority.'); }

    if (citationCount > 0) { citabilityScore += Math.min(citationCount * 5, 15); citabilityFindings.push(`Found ${citationCount} citation(s) or reference(s).`); }
    else { citabilityRecs.push('Link to authoritative sources and studies to support claims.'); }

    if (dataElements > 0) { citabilityScore += Math.min(dataElements * 5, 15); citabilityFindings.push(`Found ${dataElements} data element(s) (tables, metrics).`); }

    citabilityScore = Math.min(citabilityScore, 100);

    // ── Structural Readability ──
    const headings = $('h1, h2, h3, h4, h5, h6');
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;
    const listCount = $('ul, ol').length;
    const paragraphs = $('p');
    const shortParagraphs = paragraphs.filter((_, el) => ($(el).text().split(/\s+/).length || 0) <= 50).length;
    const totalParagraphs = paragraphs.length;

    const structureFindings: string[] = [];
    const structureRecs: string[] = [];
    let structureScore = 20;

    if (h1Count === 1) { structureScore += 15; structureFindings.push('Single H1 tag present (correct).'); }
    else if (h1Count === 0) { structureRecs.push('Add a single H1 tag to define the main topic.'); }
    else { structureScore += 5; structureRecs.push(`Found ${h1Count} H1 tags. Use exactly one H1 per page.`); }

    if (h2Count > 0) { structureScore += Math.min(h2Count * 3, 15); structureFindings.push(`${h2Count} H2 subheading(s) found.`); }
    else { structureRecs.push('Add H2 subheadings to break content into scannable sections.'); }

    if (h3Count > 0) { structureScore += Math.min(h3Count * 2, 10); structureFindings.push(`${h3Count} H3 subheading(s) found.`); }

    if (headings.length > 0) { structureFindings.push(`Total heading count: ${headings.length}.`); }

    if (listCount > 0) { structureScore += Math.min(listCount * 5, 15); structureFindings.push(`${listCount} list(s) found (bullet/numbered).`); }
    else { structureRecs.push('Use bullet points or numbered lists to improve scanability for AI crawlers.'); }

    if (totalParagraphs > 0) {
        const ratio = shortParagraphs / totalParagraphs;
        if (ratio >= 0.7) { structureScore += 15; structureFindings.push(`${Math.round(ratio * 100)}% of paragraphs are concise (50 words or fewer).`); }
        else { structureScore += 5; structureRecs.push('Shorten paragraphs. AI models process shorter, focused paragraphs more accurately.'); }
    }

    structureScore = Math.min(structureScore, 100);

    // ── Multi-modal Content ──
    const images = $('img');
    const imagesWithAlt = images.filter((_, el) => {
        const alt = $(el).attr('alt');
        return alt !== undefined && alt.trim().length > 0;
    });
    const videoCount = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').length;

    const multimodalFindings: string[] = [];
    const multimodalRecs: string[] = [];
    let multimodalScore = 20;

    if (images.length > 0) {
        multimodalScore += Math.min(images.length * 3, 20);
        multimodalFindings.push(`${images.length} image(s) found.`);

        const altRatio = imagesWithAlt.length / images.length;
        if (altRatio >= 0.8) {
            multimodalScore += 25;
            multimodalFindings.push(`${Math.round(altRatio * 100)}% of images have alt text.`);
        } else {
            multimodalScore += Math.round(altRatio * 15);
            multimodalRecs.push(`Only ${Math.round(altRatio * 100)}% of images have alt text. Add descriptive alt text to all images.`);
        }
    } else {
        multimodalRecs.push('Add relevant images to make content more engaging and multi-modal.');
    }

    if (videoCount > 0) {
        multimodalScore += Math.min(videoCount * 10, 20);
        multimodalFindings.push(`${videoCount} video embed(s) found.`);
    } else {
        multimodalRecs.push('Consider embedding relevant video content to enhance multi-modal signals.');
    }

    // Check for figure/figcaption
    const figureCount = $('figure').length;
    if (figureCount > 0) {
        multimodalScore += Math.min(figureCount * 5, 15);
        multimodalFindings.push(`${figureCount} figure element(s) with semantic markup.`);
    }

    multimodalScore = Math.min(multimodalScore, 100);

    // ── Authority Signals ──
    const hasAuthor = $('meta[name="author"]').length > 0 || $('[rel="author"], .author, .byline, [itemprop="author"]').length > 0;
    const hasDatePublished = $('meta[property="article:published_time"], time[datetime], [itemprop="datePublished"]').length > 0;
    const hasDateModified = $('meta[property="article:modified_time"], [itemprop="dateModified"]').length > 0;
    const hasSchema = $('script[type="application/ld+json"]').length > 0;
    const hasCanonical = $('link[rel="canonical"]').length > 0;
    const hasMetaDesc = $('meta[name="description"]').length > 0;

    const authorityFindings: string[] = [];
    const authorityRecs: string[] = [];
    let authorityScore = 10;

    if (hasAuthor) { authorityScore += 15; authorityFindings.push('Author attribution found.'); }
    else { authorityRecs.push('Add author information (meta tag or visible byline) to establish authority.'); }

    if (hasDatePublished) { authorityScore += 15; authorityFindings.push('Publication date found.'); }
    else { authorityRecs.push('Add a publication date. Fresh, dated content is preferred by AI search engines.'); }

    if (hasDateModified) { authorityScore += 10; authorityFindings.push('Last modified date found.'); }
    else { authorityRecs.push('Add a last modified date to signal content freshness.'); }

    if (hasSchema) {
        authorityScore += 20;
        authorityFindings.push('Structured data (JSON-LD) found.');
        // Check specific schema types
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html() || '');
                const schemaType = data['@type'] || (Array.isArray(data) ? data[0]?.['@type'] : '');
                if (schemaType) authorityFindings.push(`Schema type: ${schemaType}`);
            } catch { /* ignore parse errors */ }
        });
    } else {
        authorityRecs.push('Add structured data (JSON-LD schema) to help AI understand your content\'s context and relationships.');
    }

    if (hasCanonical) { authorityScore += 10; authorityFindings.push('Canonical URL specified.'); }
    else { authorityRecs.push('Add a canonical URL to prevent duplicate content issues.'); }

    if (hasMetaDesc) { authorityScore += 10; authorityFindings.push('Meta description present.'); }
    else { authorityRecs.push('Add a meta description. This is often used as a summary by AI search engines.'); }

    // External source links
    const externalLinks = $('a[href^="http"]').filter((_, el) => {
        try {
            const href = $(el).attr('href') || '';
            return new URL(href).hostname !== new URL(url).hostname;
        } catch { return false; }
    }).length;

    if (externalLinks > 2) { authorityScore += 10; authorityFindings.push(`${externalLinks} external source links found.`); }
    else { authorityRecs.push('Link to authoritative external sources to demonstrate research depth.'); }

    authorityScore = Math.min(authorityScore, 100);

    // ── Overall ──
    const categories = [
        { name: 'Citability', score: citabilityScore, findings: citabilityFindings, recommendations: citabilityRecs },
        { name: 'Structural Readability', score: structureScore, findings: structureFindings, recommendations: structureRecs },
        { name: 'Multi-modal Content', score: multimodalScore, findings: multimodalFindings, recommendations: multimodalRecs },
        { name: 'Authority Signals', score: authorityScore, findings: authorityFindings, recommendations: authorityRecs },
    ];

    const overallScore = Math.round(
        categories.reduce((sum, c) => sum + c.score, 0) / categories.length
    );

    return { overallScore, categories };
}

// ── Route Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const ip = getIp(req);
    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Please wait a minute before trying again.' },
            { status: 429 }
        );
    }

    const { searchParams } = new URL(req.url);
    const tool = searchParams.get('tool');

    try {
        switch (tool) {
            case 'robots': {
                const domain = searchParams.get('domain');
                if (!domain) return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });
                const result = await handleRobots(domain);
                return NextResponse.json(result);
            }

            case 'readability': {
                const url = searchParams.get('url');
                if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
                const result = await handleReadability(url);
                return NextResponse.json(result);
            }

            case 'hreflang': {
                const url = searchParams.get('url');
                if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
                const result = await handleHreflang(url);
                return NextResponse.json(result);
            }

            case 'geo': {
                const url = searchParams.get('url');
                if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
                const result = await handleGeo(url);
                return NextResponse.json(result);
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid tool parameter. Supported: robots, readability, hreflang, geo' },
                    { status: 400 }
                );
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
