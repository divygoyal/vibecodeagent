import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { runSiteAudit } from '@/lib/siteAudit';
import { isBlockedUrl } from '@/lib/urlValidation';
import {
    getGoogleGenAIClient,
    getGoogleGenAIText,
    GOOGLE_GENAI_PRIMARY_MODEL,
    GOOGLE_GENAI_THINKING_DISABLED,
} from '@/lib/googleGenAi';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Helpers ───

function normalizeDomain(input: string): string {
    let d = input.trim().replace(/\/+$/, '');
    if (!d.startsWith('http://') && !d.startsWith('https://')) {
        d = 'https://' + d;
    }
    return d;
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

// ─── 1. Site Audit ───

async function analyzeSiteAudit(url: string) {
    const report = await runSiteAudit(url);
    return {
        score: report.score,
        summary: report.summary,
        issues: report.issues,
        meta: report.meta,
        responseTime: report.responseTime,
        statusCode: report.statusCode,
    };
}

// ─── 2. PageSpeed Insights ───

interface PageSpeedMetric {
    value: number;
    unit: string;
    rating: string;
}

function scoreToRating(score: number | undefined | null): string {
    if (score == null) return 'UNKNOWN';
    if (score >= 0.9) return 'GOOD';
    if (score >= 0.5) return 'NEEDS_IMPROVEMENT';
    return 'POOR';
}

async function analyzePageSpeed(url: string) {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`PageSpeed API returned ${res.status}`);

    const data = await res.json();
    const lighthouse = data.lighthouseResult;
    if (!lighthouse) throw new Error('No lighthouse result');

    const perfScore = (lighthouse.categories?.performance?.score ?? 0) * 100;
    const audits = lighthouse.audits || {};

    function getMetric(auditId: string, unit: string): PageSpeedMetric {
        const audit = audits[auditId];
        if (!audit) return { value: 0, unit, rating: 'UNKNOWN' };
        return {
            value: audit.numericValue ?? 0,
            unit,
            rating: scoreToRating(audit.score),
        };
    }

    // Extract top 5 opportunities
    const opportunities: Array<{ title: string; description: string; savingsMs: number }> = [];
    for (const key of Object.keys(audits)) {
        const audit = audits[key];
        if (
            audit.score != null &&
            audit.score < 1 &&
            audit.details?.overallSavingsMs > 0
        ) {
            opportunities.push({
                title: audit.title,
                description: audit.description,
                savingsMs: audit.details.overallSavingsMs,
            });
        }
    }
    opportunities.sort((a, b) => b.savingsMs - a.savingsMs);

    return {
        performance: perfScore,
        lcp: getMetric('largest-contentful-paint', 'ms'),
        cls: getMetric('cumulative-layout-shift', ''),
        tbt: getMetric('total-blocking-time', 'ms'),
        fcp: getMetric('first-contentful-paint', 'ms'),
        si: getMetric('speed-index', 'ms'),
        opportunities: opportunities.slice(0, 5),
    };
}

// ─── 3. AI Keyword Research ───

async function analyzeKeywords(domain: string) {
    const ai = getGoogleGenAIClient();
    if (!ai) return [];

    const prompt = `You are an SEO expert. Analyze the domain "${domain}" and suggest 10 keyword opportunities this website should target.

Return ONLY a JSON array (no markdown, no explanation) with objects containing:
- "keyword": the keyword phrase
- "volume": estimated monthly search volume (number)
- "difficulty": "Low", "Medium", or "High"
- "intent": "Informational", "Transactional", "Navigational", or "Commercial"
- "contentType": suggested content format (e.g. "Blog Post", "Landing Page", "Product Page", "Guide")
- "reason": brief reason why this keyword is a good opportunity

Base your analysis on what a site with this domain name likely covers.`;

    try {
        const response = await ai.models.generateContent({
            model: GOOGLE_GENAI_PRIMARY_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                thinkingConfig: GOOGLE_GENAI_THINKING_DISABLED,
                httpOptions: { timeout: 15000 },
            },
        });
        const text = getGoogleGenAIText(response);
        // Strip markdown code fences if present
        const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return [];
    }
}

// ─── 4. Technology Detection ───

async function detectTechnologies(url: string) {
    const technologies: string[] = [];

    const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrafficClaw/1.0; +https://trafficclaw.com)',
        },
        redirect: 'follow',
    });

    if (!res.ok) return technologies;

    // Check headers for Cloudflare
    if (res.headers.get('cf-ray')) {
        technologies.push('Cloudflare');
    }

    const html = await res.text();
    const lower = html.toLowerCase();

    const patterns: Array<[string, string[]]> = [
        ['Next.js', ['__next_data__', '/_next/']],
        ['React', ['data-reactroot', 'react-dom', 'react.production', 'react.development']],
        ['Vue.js', ['__vue__', 'vue.js', 'vue.min.js']],
        ['Angular', ['ng-version', 'angular.js', 'angular.min.js']],
        ['jQuery', ['jquery']],
        ['WordPress', ['wp-content', 'wp-includes']],
        ['Shopify', ['cdn.shopify', 'shopify']],
        ['Wix', ['wix.com', 'static.wixstatic']],
        ['Squarespace', ['squarespace']],
        ['Webflow', ['webflow']],
        ['Bootstrap', ['bootstrap']],
        ['Tailwind CSS', ['tailwindcss', 'tailwind']],
        ['Google Analytics', ['gtag', 'google-analytics', 'googletagmanager']],
        ['Google Tag Manager', ['googletagmanager.com/gtm']],
        ['Font Awesome', ['font-awesome', 'fontawesome']],
    ];

    for (const [name, signatures] of patterns) {
        if (signatures.some(sig => lower.includes(sig))) {
            technologies.push(name);
        }
    }

    // Deduplicate: if GTM is detected, GA is likely already listed via the broader pattern
    // but both can coexist so we keep them
    return [...new Set(technologies)];
}

// ─── 5. Robots.txt ───

async function analyzeRobots(baseUrl: string) {
    const res = await fetch(`${baseUrl}/robots.txt`, {
        signal: AbortSignal.timeout(5000),
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrafficClaw/1.0; +https://trafficclaw.com)',
        },
    });

    if (!res.ok) return { found: false, rules: [], sitemapUrls: [] };

    const text = await res.text();
    const lines = text.split('\n').map(l => l.trim());

    const rules: string[] = [];
    const sitemapUrls: string[] = [];

    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;

        if (line.toLowerCase().startsWith('sitemap:')) {
            sitemapUrls.push(line.substring('sitemap:'.length).trim());
        } else if (rules.length < 10) {
            rules.push(line);
        }
    }

    return { found: true, rules, sitemapUrls };
}

// ─── 6. Sitemap Detection ───

async function analyzeSitemap(baseUrl: string) {
    const res = await fetch(`${baseUrl}/sitemap.xml`, {
        signal: AbortSignal.timeout(5000),
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrafficClaw/1.0; +https://trafficclaw.com)',
        },
    });

    if (!res.ok) return { found: false, urlCount: 0 };

    // Limit parsing to first 50KB
    const reader = res.body?.getReader();
    if (!reader) return { found: false, urlCount: 0 };

    let text = '';
    const decoder = new TextDecoder();
    const maxBytes = 50 * 1024;

    while (text.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    if (!text.includes('<urlset') && !text.includes('<sitemapindex')) {
        return { found: false, urlCount: 0 };
    }

    // Count <url> or <sitemap> tags
    const urlMatches = text.match(/<url>/gi);
    const sitemapMatches = text.match(/<sitemap>/gi);
    const urlCount = (urlMatches?.length ?? 0) + (sitemapMatches?.length ?? 0);

    return { found: true, urlCount };
}

// ─── 7. Readability Analysis ───

function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 2) return 1;

    // Remove trailing silent e
    word = word.replace(/e$/, '');
    // Count vowel groups
    const vowelGroups = word.match(/[aeiouy]+/g);
    const count = vowelGroups ? vowelGroups.length : 1;
    return Math.max(1, count);
}

async function analyzeReadability(url: string) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrafficClaw/1.0; +https://trafficclaw.com)',
        },
        redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove script/style/nav/footer elements
    $('script, style, nav, footer, header, noscript').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    // Split into sentences (period, question mark, exclamation mark followed by space or end)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 2);
    const sentenceCount = Math.max(1, sentences.length);

    // Split into words
    const words = text.split(/\s+/).filter(w => w.replace(/[^a-zA-Z]/g, '').length > 0);
    const wordCount = Math.max(1, words.length);

    // Count syllables
    let totalSyllables = 0;
    for (const word of words) {
        totalSyllables += countSyllables(word);
    }

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = totalSyllables / wordCount;

    // Flesch-Kincaid readability score
    const score = Math.max(0, Math.min(100, Math.round(
        206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord
    )));

    // Flesch-Kincaid grade level
    const grade = Math.max(0, parseFloat(
        (0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59).toFixed(1)
    ));

    // Rating mapping
    let rating: string;
    if (score >= 90) rating = 'Very Easy';
    else if (score >= 80) rating = 'Easy';
    else if (score >= 70) rating = 'Fairly Easy';
    else if (score >= 60) rating = 'Standard';
    else if (score >= 50) rating = 'Fairly Difficult';
    else if (score >= 30) rating = 'Difficult';
    else rating = 'Very Difficult';

    return {
        score,
        grade,
        wordCount,
        sentenceCount,
        avgWordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(1)),
        avgSyllablesPerWord: parseFloat(avgSyllablesPerWord.toFixed(2)),
        rating,
    };
}

// ─── 8. GEO (AI Search Readiness) Analysis ───

async function analyzeGeoReadiness(url: string) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrafficClaw/1.0; +https://trafficclaw.com)',
        },
        redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // ── Citability ──
    const citabilityFindings: string[] = [];
    const bodyText = $('body').text();
    const numberMatches = bodyText.match(/\d+(\.\d+)?%|\$[\d,.]+|\d{2,}/g);
    const statsCount = numberMatches ? numberMatches.length : 0;
    citabilityFindings.push(`${statsCount} statistics/numbers found in content`);

    const blockquotes = $('blockquote').length;
    citabilityFindings.push(`${blockquotes} blockquote(s)`);

    const citeElements = $('cite, [data-citation], .citation, .reference').length;
    citabilityFindings.push(`${citeElements} citation element(s)`);

    const dataTables = $('table').filter(function () {
        return $(this).find('th, thead').length > 0;
    }).length;
    citabilityFindings.push(`${dataTables} data table(s)`);

    let citabilityScore = Math.min(100,
        Math.min(40, statsCount * 4) +
        Math.min(20, blockquotes * 10) +
        Math.min(20, citeElements * 10) +
        Math.min(20, dataTables * 10)
    );

    // ── Structural Readability ──
    const structureFindings: string[] = [];
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;
    const h4Count = $('h4').length;
    const h5Count = $('h5').length;
    const h6Count = $('h6').length;
    const totalHeadings = h1Count + h2Count + h3Count + h4Count + h5Count + h6Count;
    structureFindings.push(`${totalHeadings} headings (H1:${h1Count} H2:${h2Count} H3:${h3Count} H4:${h4Count} H5:${h5Count} H6:${h6Count})`);

    const lists = $('ol, ul').length;
    structureFindings.push(`${lists} ordered/unordered list(s)`);

    // Check for short paragraphs (< 150 words)
    const paragraphs = $('p');
    let shortParagraphs = 0;
    let totalParagraphs = 0;
    paragraphs.each(function () {
        const pText = $(this).text().trim();
        if (pText.length > 0) {
            totalParagraphs++;
            const pWords = pText.split(/\s+/).length;
            if (pWords < 150) shortParagraphs++;
        }
    });
    structureFindings.push(`${shortParagraphs}/${totalParagraphs} paragraphs are concise (<150 words)`);

    const faqSections = $('[itemtype*="FAQPage"], .faq, #faq, [class*="faq"], details, summary').length;
    structureFindings.push(`${faqSections} FAQ/accordion element(s)`);

    let structureScore = Math.min(100,
        Math.min(30, totalHeadings * 5) +
        Math.min(20, lists * 5) +
        (totalParagraphs > 0 ? Math.min(30, Math.round((shortParagraphs / totalParagraphs) * 30)) : 0) +
        Math.min(20, faqSections * 10)
    );

    // ── Multi-modal ──
    const multimodalFindings: string[] = [];
    const images = $('img');
    let imagesWithAlt = 0;
    images.each(function () {
        if ($(this).attr('alt')?.trim()) imagesWithAlt++;
    });
    multimodalFindings.push(`${imagesWithAlt}/${images.length} images have alt text`);

    const videos = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').length;
    multimodalFindings.push(`${videos} video/iframe element(s)`);

    const figures = $('figure').length;
    const figcaptions = $('figcaption').length;
    multimodalFindings.push(`${figures} figure(s), ${figcaptions} figcaption(s)`);

    let multimodalScore = Math.min(100,
        (images.length > 0 ? Math.min(40, Math.round((imagesWithAlt / images.length) * 40)) : 0) +
        Math.min(10, images.length * 2) +
        Math.min(25, videos * 12) +
        Math.min(25, (figures + figcaptions) * 8)
    );

    // ── Authority ──
    const authorityFindings: string[] = [];
    const authorMeta = $('meta[name="author"], [rel="author"], .author, [itemprop="author"]').length;
    authorityFindings.push(`${authorMeta} author indicator(s)`);

    const dateMeta = $('meta[property="article:published_time"], time[datetime], [itemprop="datePublished"], meta[name="date"]').length;
    authorityFindings.push(`${dateMeta} publish date indicator(s)`);

    const jsonLd = $('script[type="application/ld+json"]').length;
    authorityFindings.push(`${jsonLd} JSON-LD schema block(s)`);

    const externalLinks = $('a[href^="http"]').filter(function () {
        try {
            const href = $(this).attr('href') || '';
            const linkHost = new URL(href).hostname;
            const pageHost = new URL(url).hostname;
            return linkHost !== pageHost;
        } catch {
            return false;
        }
    }).length;
    authorityFindings.push(`${externalLinks} external source link(s)`);

    let authorityScore = Math.min(100,
        Math.min(25, authorMeta * 25) +
        Math.min(25, dateMeta * 25) +
        Math.min(25, jsonLd * 12) +
        Math.min(25, externalLinks * 3)
    );

    // Weighted overall
    const overallScore = Math.round(
        citabilityScore * 0.25 +
        structureScore * 0.30 +
        multimodalScore * 0.20 +
        authorityScore * 0.25
    );

    return {
        overallScore,
        categories: {
            citability: { score: citabilityScore, findings: citabilityFindings },
            structure: { score: structureScore, findings: structureFindings },
            multimodal: { score: multimodalScore, findings: multimodalFindings },
            authority: { score: authorityScore, findings: authorityFindings },
        },
    };
}

// ─── Main Handler ───

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { domain } = body;

        if (!domain || typeof domain !== 'string') {
            return NextResponse.json({ error: 'domain parameter is required' }, { status: 400 });
        }

        if (domain.length > 500) {
            return NextResponse.json({ error: 'Domain too long' }, { status: 400 });
        }

        const url = normalizeDomain(domain);
        const cleanDomain = extractDomain(url);

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
        }

        // SSRF protection
        if (isBlockedUrl(url)) {
            return NextResponse.json(
                { error: 'URL not allowed — only public websites can be analyzed' },
                { status: 400 }
            );
        }

        // Run all analyses in parallel
        const [
            auditResult,
            pagespeedResult,
            keywordsResult,
            techResult,
            robotsResult,
            sitemapResult,
            readabilityResult,
            geoResult,
        ] = await Promise.allSettled([
            analyzeSiteAudit(url),
            analyzePageSpeed(url),
            analyzeKeywords(cleanDomain),
            detectTechnologies(url),
            analyzeRobots(url),
            analyzeSitemap(url),
            analyzeReadability(url),
            analyzeGeoReadiness(url),
        ]);

        return NextResponse.json({
            domain: cleanDomain,
            url,
            analyzedAt: new Date().toISOString(),
            audit: auditResult.status === 'fulfilled' ? auditResult.value : null,
            pagespeed: pagespeedResult.status === 'fulfilled' ? pagespeedResult.value : null,
            keywords: keywordsResult.status === 'fulfilled' ? keywordsResult.value : [],
            technologies: techResult.status === 'fulfilled' ? techResult.value : [],
            robots: robotsResult.status === 'fulfilled' ? robotsResult.value : null,
            sitemap: sitemapResult.status === 'fulfilled' ? sitemapResult.value : null,
            readability: readabilityResult.status === 'fulfilled' ? readabilityResult.value : null,
            geoReadiness: geoResult.status === 'fulfilled' ? geoResult.value : null,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        console.error('Domain overview error:', message);
        return NextResponse.json(
            { error: 'Domain analysis failed. Please check the domain and try again.' },
            { status: 500 }
        );
    }
}
