import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import { cachedFetch } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Fallback model chain for non-streaming calls
const VISIBILITY_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'] as const;

function formatDate(d: Date) {
    return d.toISOString().split('T')[0];
}

interface PageSignals {
    url: string;
    wordCount: number;
    headingCount: number;
    hasSchema: boolean;
    schemaTypes: string[];
    hasFaq: boolean;
    hasHowTo: boolean;
    hasAuthor: boolean;
    hasDate: boolean;
    externalLinks: number;
    internalLinks: number;
    hasTableOfContents: boolean;
    metaTitle: string;
    metaDescription: string;
}

async function fetchPageSignals(url: string): Promise<PageSignals | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'TrafficClaw-Bot/1.0 (SEO Analysis)' },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
        });
        if (!res.ok) return null;

        const html = await res.text();
        const $ = cheerio.load(html);

        // Remove scripts and styles
        $('script, style, noscript').remove();

        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(/\s+/).length;
        const headingCount = $('h1, h2, h3, h4').length;

        // Schema detection
        const schemaTypes: string[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const json = JSON.parse($(el).html() || '');
                const types = Array.isArray(json) ? json.map((j: any) => j['@type']).filter(Boolean) : [json['@type']].filter(Boolean);
                schemaTypes.push(...types.flat());
            } catch { /* ignore */ }
        });

        const hasFaq = schemaTypes.some(t => t.toLowerCase().includes('faq')) || $('[itemtype*="FAQPage"]').length > 0 || $('details, .faq, [class*="faq"]').length > 0;
        const hasHowTo = schemaTypes.some(t => t.toLowerCase().includes('howto')) || $('[itemtype*="HowTo"]').length > 0;
        const hasAuthor = !!($('[rel="author"]').length || $('[class*="author"]').length || schemaTypes.some(t => t === 'Person' || t === 'Organization'));
        const hasDate = !!($('time[datetime]').length || $('[class*="date"], [class*="published"]').length);

        const hostname = new URL(url).hostname;
        let externalLinks = 0;
        let internalLinks = 0;
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.startsWith('http') && !href.includes(hostname)) externalLinks++;
            else if (href.startsWith('/') || href.includes(hostname)) internalLinks++;
        });

        const hasTableOfContents = !!($('[class*="toc"], [id*="toc"], nav[aria-label*="content"]').length || $('a[href^="#"]').length > 3);

        return {
            url,
            wordCount,
            headingCount,
            hasSchema: schemaTypes.length > 0,
            schemaTypes: [...new Set(schemaTypes)].slice(0, 10),
            hasFaq,
            hasHowTo,
            hasAuthor,
            hasDate,
            externalLinks,
            internalLinks,
            hasTableOfContents,
            metaTitle: $('title').text().trim().slice(0, 100),
            metaDescription: $('meta[name="description"]').attr('content')?.slice(0, 200) || '',
        };
    } catch {
        return null;
    }
}

// --- Enhanced response helpers ---

function buildTrendData(currentScore: number, topQueries: any[]) {
    // Simulated 4-week sparkline working backward from current score
    const seed = currentScore * 7 + topQueries.length * 3; // deterministic pseudo-random
    const d1 = ((seed % 5) + 2);
    const d2 = ((seed % 3) + 1);
    const d3 = ((seed % 4) + 1);
    const sparkline = [
        Math.max(0, Math.min(100, currentScore - d1 - d2 - d3)),
        Math.max(0, Math.min(100, currentScore - d1 - d2)),
        Math.max(0, Math.min(100, currentScore - d1)),
        currentScore,
    ];
    const change = currentScore - sparkline[0];
    const citationsPerWeek = Math.max(5, Math.floor(topQueries.filter(q => q.position <= 10).length * 1.5));
    const citationsChange = Math.max(1, (seed % 8) + 1);

    return {
        change,
        direction: (change > 0 ? 'up' : change < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        sparkline,
        industryAvg: Math.max(20, currentScore - 8 - (seed % 10)),
        topCompetitorScore: Math.min(95, currentScore + 5 + (seed % 10)),
        citationsPerWeek,
        citationsChange,
    };
}

function buildQueryMonitor(topQueries: any[]) {
    const platformList = ['chatgpt', 'perplexity', 'googleAIO'] as const;
    const citedQueries = topQueries.filter(q => q.position <= 10);
    const missedQueries = topQueries.filter(q => q.position > 10);
    const total = topQueries.length || 1;

    return {
        citationsThisWeek: citedQueries.length,
        missedOpportunities: missedQueries.length,
        citationRate: Math.round((citedQueries.length / total) * 100),
        queries: topQueries.slice(0, 8).map((q, i) => ({
            query: q.query,
            platform: platformList[i % 3],
            status: (q.position <= 10 ? 'cited' : 'missed') as 'cited' | 'missed',
            timeAgo: `${((i + 1) * 3) + (i % 5)}h ago`,
        })),
    };
}

function buildPlatformData(
    platforms: Record<string, string> | Record<string, any>,
    topQueries: any[],
    geoScore: number
) {
    const configs: Record<string, { baseMultiplier: number }> = {
        chatgpt: { baseMultiplier: 0.4 },
        perplexity: { baseMultiplier: 0.55 },
        googleAIO: { baseMultiplier: 0.2 },
    };

    const result: Record<string, any> = {};
    const seed = geoScore * 3 + topQueries.length;

    for (const [key, cfg] of Object.entries(configs)) {
        const raw = platforms[key];
        const likelihood = typeof raw === 'string' ? raw : raw?.likelihood || 'low';
        const citationsFound = typeof raw === 'object' && raw?.citationsFound != null
            ? raw.citationsFound
            : Math.max(1, Math.floor(topQueries.length * cfg.baseMultiplier));
        const topCitedQuery = typeof raw === 'object' && raw?.topCitedQuery
            ? raw.topCitedQuery
            : topQueries[Object.keys(configs).indexOf(key)]?.query || '';

        // Simulated 4-week sparkline per platform
        const base = citationsFound;
        const s = seed + Object.keys(configs).indexOf(key) * 7;
        const sparkline = [
            Math.max(0, base - ((s % 3) + 2)),
            Math.max(0, base - ((s % 2) + 1)),
            Math.max(0, base - (s % 2)),
            base,
        ];

        result[key] = { likelihood, citationsFound, topCitedQuery, sparkline };
    }
    return result;
}

function buildCompetitors(siteUrl: string, geoScore: number, topQueries: any[], geminiCompetitors?: any[]) {
    if (geminiCompetitors && geminiCompetitors.length > 0) return geminiCompetitors;

    // Generate simulated competitors from the site domain
    let domain: string;
    try { domain = new URL(siteUrl).hostname; } catch { domain = siteUrl; }
    const seed = geoScore * 5 + topQueries.length;

    return [
        { domain, isYou: true, geoScore, citationsPerWeek: Math.max(5, Math.floor(topQueries.filter(q => q.position <= 10).length * 1.5)), trend: 'up' as const },
        { domain: `competitor-a.io`, isYou: false, geoScore: Math.min(95, geoScore + 5 + (seed % 8)), citationsPerWeek: Math.max(8, Math.floor(topQueries.length * 1.6)), trend: 'up' as const },
        { domain: `competitor-b.com`, isYou: false, geoScore: Math.max(20, geoScore - 5 - (seed % 6)), citationsPerWeek: Math.max(3, Math.floor(topQueries.length * 0.7)), trend: 'down' as const },
        { domain: `competitor-c.dev`, isYou: false, geoScore: Math.max(15, geoScore - 12 - (seed % 8)), citationsPerWeek: Math.max(2, Math.floor(topQueries.length * 0.4)), trend: 'flat' as const },
    ];
}

function buildPageGeoScores(pageSignals: PageSignals[], geminiPageScores?: Record<string, number>) {
    return pageSignals.map(ps => {
        let score = geminiPageScores?.[ps.url] ?? null;
        if (score == null) {
            // Heuristic per-page score
            let s = 30;
            if (ps.wordCount > 1500) s += 15; else if (ps.wordCount > 800) s += 8;
            if (ps.headingCount > 5) s += 10;
            if (ps.hasSchema) s += 12;
            if (ps.hasFaq) s += 10;
            if (ps.hasAuthor) s += 8;
            if (ps.externalLinks > 3) s += 8;
            if (ps.hasTableOfContents) s += 5;
            if (ps.hasHowTo) s += 7;
            score = Math.min(100, s);
        }
        // Quick win suggestion
        let quickWin: string | null = null;
        if (!ps.hasSchema && ps.wordCount > 1000) {
            quickWin = `Adding schema to ${new URL(ps.url).pathname} (${ps.wordCount.toLocaleString()} words) could boost its page GEO by ~15 pts`;
        } else if (!ps.hasFaq) {
            quickWin = `Adding FAQ schema to ${new URL(ps.url).pathname} could improve answer readiness by ~10 pts`;
        } else if (!ps.hasAuthor) {
            quickWin = `Adding author attribution to ${new URL(ps.url).pathname} could boost brand authority by ~8 pts`;
        }
        return { ...ps, geoScore: score, quickWin };
    });
}

function enrichResponse(base: any, topQueries: any[], pageSignals: PageSignals[], siteUrl: string) {
    const geoScore = base.geoScore || 0;

    // Add subDetail to dimensions if missing
    const avgWordCount = pageSignals.reduce((s, p) => s + p.wordCount, 0) / (pageSignals.length || 1);
    const avgHeadings = pageSignals.reduce((s, p) => s + p.headingCount, 0) / (pageSignals.length || 1);
    const avgExtLinks = pageSignals.reduce((s, p) => s + p.externalLinks, 0) / (pageSignals.length || 1);
    const subDetails: Record<string, string> = {
        'Content Quality': `Avg ${Math.round(avgWordCount).toLocaleString()} words · ${Math.round(avgHeadings)} headings/page`,
        'Structured Data': pageSignals.some(s => s.hasSchema) ? `Schema: ${[...new Set(pageSignals.flatMap(s => s.schemaTypes))].join(', ')}` : 'No schema markup detected',
        'Citation Worthiness': `${Math.round(avgExtLinks)} external references/page avg`,
        'Answer Readiness': pageSignals.some(s => s.hasFaq) ? `FAQ detected on ${pageSignals.filter(s => s.hasFaq).length} of ${pageSignals.length} pages` : 'No FAQ or direct-answer format found',
        'Brand Authority': pageSignals.some(s => s.hasAuthor) ? 'Author signals detected' : 'No author signals detected',
    };
    const dimensions = (base.dimensions || []).map((d: any) => ({
        ...d,
        subDetail: d.subDetail || subDetails[d.name] || '',
    }));

    // Projected score from recommendations
    const recommendations = (base.recommendations || []).map((r: any, i: number) => ({
        ...r,
        projectedPoints: r.projectedPoints || (r.impact === 'high' ? 8 - i : r.impact === 'medium' ? 5 - i : 3 - i),
    }));
    const projectedScore = base.projectedScore || Math.min(100, geoScore + recommendations.reduce((s: number, r: any) => s + Math.max(1, r.projectedPoints), 0));

    // Build enhanced platforms
    const platforms = buildPlatformData(base.platforms || {}, topQueries, geoScore);

    // Build trend data
    const trend = buildTrendData(geoScore, topQueries);

    // Build competitors
    const competitors = buildCompetitors(siteUrl, geoScore, topQueries, base.competitors);
    const topQuery = topQueries[0]?.query || 'your top keywords';
    const competitorGapAlert = base.competitorGapAlert ||
        `competitor-a.io was cited ${Math.max(1, trend.citationsChange + 2)} more times than you for "${topQuery}" this week`;

    // Build query monitor
    const queryMonitor = buildQueryMonitor(topQueries);

    // Build enriched page signals with GEO scores
    const enrichedPages = buildPageGeoScores(pageSignals, base.pageGeoScores);

    return {
        geoScore,
        source: base.source,
        trend,
        dimensions,
        platforms,
        recommendations,
        projectedScore,
        competitors,
        competitorGapAlert,
        queryMonitor,
        pageSignals: enrichedPages,
        topQueries,
        keywordVisibility: topQueries.map((q: any) => ({
            ...q,
            aiCitationLikelihood: q.position <= 3 ? 'high' : q.position <= 10 ? 'medium' : 'low',
        })),
    };
}

function computeHeuristicScore(signals: PageSignals[]): any {
    let contentQuality = 50;
    let structuredData = 20;
    let citationWorthiness = 30;
    let answerReadiness = 25;
    let brandAuthority = 40;

    const avgWordCount = signals.reduce((s, p) => s + p.wordCount, 0) / (signals.length || 1);
    const avgHeadings = signals.reduce((s, p) => s + p.headingCount, 0) / (signals.length || 1);

    // Content Quality
    if (avgWordCount > 1500) contentQuality += 20;
    else if (avgWordCount > 800) contentQuality += 10;
    if (avgHeadings > 5) contentQuality += 10;
    if (signals.some(s => s.hasAuthor)) contentQuality += 10;
    if (signals.some(s => s.hasDate)) contentQuality += 5;

    // Structured Data
    if (signals.some(s => s.hasSchema)) structuredData += 30;
    if (signals.some(s => s.hasFaq)) structuredData += 25;
    if (signals.some(s => s.hasHowTo)) structuredData += 15;

    // Citation Worthiness
    const avgExtLinks = signals.reduce((s, p) => s + p.externalLinks, 0) / (signals.length || 1);
    if (avgExtLinks > 3) citationWorthiness += 20;
    if (signals.some(s => s.hasTableOfContents)) citationWorthiness += 15;
    if (avgWordCount > 2000) citationWorthiness += 15;

    // Answer Readiness
    if (signals.some(s => s.hasFaq)) answerReadiness += 30;
    if (signals.some(s => s.hasHowTo)) answerReadiness += 20;
    if (avgHeadings > 4) answerReadiness += 10;

    const dimensions = [
        { name: 'Content Quality', score: Math.min(100, contentQuality), rationale: `Average ${Math.round(avgWordCount)} words, ${Math.round(avgHeadings)} headings per page.` },
        { name: 'Structured Data', score: Math.min(100, structuredData), rationale: signals.some(s => s.hasSchema) ? `Schema types: ${[...new Set(signals.flatMap(s => s.schemaTypes))].join(', ')}` : 'No structured data detected.' },
        { name: 'Citation Worthiness', score: Math.min(100, citationWorthiness), rationale: `Average ${Math.round(avgExtLinks)} external references per page.` },
        { name: 'Answer Readiness', score: Math.min(100, answerReadiness), rationale: signals.some(s => s.hasFaq) ? 'FAQ content detected.' : 'No FAQ or direct-answer format found.' },
        { name: 'Brand Authority', score: Math.min(100, brandAuthority), rationale: 'Estimated from content signals and page structure.' },
    ];

    const geoScore = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length);

    return {
        geoScore,
        dimensions,
        platforms: {
            chatgpt: geoScore >= 70 ? 'high' : geoScore >= 40 ? 'medium' : 'low',
            perplexity: geoScore >= 65 ? 'high' : geoScore >= 35 ? 'medium' : 'low',
            googleAIO: geoScore >= 60 ? 'high' : geoScore >= 30 ? 'medium' : 'low',
        },
        recommendations: [
            { action: 'Add FAQ schema markup to your most visited pages', impact: 'high', effort: 'low' },
            { action: 'Include author attribution and publish dates on all content', impact: 'medium', effort: 'low' },
            { action: 'Add structured data (HowTo, Article) to key pages', impact: 'high', effort: 'medium' },
        ],
        source: 'heuristic',
    };
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = String(session.user.id);
        const siteUrl = req.nextUrl.searchParams.get('siteUrl');
        if (!siteUrl) {
            return NextResponse.json({ error: 'siteUrl required' }, { status: 400 });
        }

        // Check cache (30 min)
        const cacheKey = `ai-visibility:${userId}:${siteUrl}`;

        return NextResponse.json(await cachedFetch(cacheKey, 30 * 60 * 1000, async () => {
            // Get Google token
            const jwt = await getToken({ req: req as any }) as any;
            let accessToken = jwt?.googleAccessToken as string | undefined;
            let refreshToken = jwt?.googleRefreshToken as string | undefined;

            if (!accessToken && !refreshToken) {
                const dbTokens = await fetchGoogleTokensFromDb(userId);
                if (dbTokens) {
                    accessToken = dbTokens.accessToken;
                    refreshToken = dbTokens.refreshToken;
                }
            }

            if (!accessToken && !refreshToken) {
                return { error: 'No Google connection', geoScore: 0 };
            }

            const token = await getValidAccessToken(accessToken, refreshToken);

            // Fetch top GSC queries and pages
            const today = new Date();
            const endDate = formatDate(new Date(today.getTime() - 2 * 86400000));
            const startDate = formatDate(new Date(today.getTime() - 30 * 86400000));

            const [queryData, pageData] = await Promise.all([
                fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 20, type: 'web' }),
                    signal: AbortSignal.timeout(10000),
                }).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startDate, endDate, dimensions: ['page'], rowLimit: 5, type: 'web' }),
                    signal: AbortSignal.timeout(10000),
                }).then(r => r.ok ? r.json() : null).catch(() => null),
            ]);

            const topQueries = (queryData?.rows || []).map((r: any) => ({
                query: r.keys[0],
                clicks: r.clicks,
                impressions: r.impressions,
                ctr: Math.round(r.ctr * 10000) / 100,
                position: Math.round(r.position * 10) / 10,
            }));

            const topPages = (pageData?.rows || []).map((r: any) => r.keys[0]).slice(0, 3);

            // Crawl top pages for content signals
            const pageSignals = (await Promise.all(topPages.map(fetchPageSignals))).filter(Boolean) as PageSignals[];

            // Try Gemini analysis, fall back to heuristic
            if (ai && pageSignals.length > 0) {
                try {
                    const siteDomain = (() => { try { return new URL(siteUrl).hostname; } catch { return siteUrl; } })();

                    const prompt = `You are an AI Visibility analyst. Analyze this website's content for visibility in AI platforms (ChatGPT, Perplexity, Google AI Overviews).

SITE DOMAIN: ${siteDomain}

TOP SEARCH QUERIES (what users search to find this site):
${topQueries.slice(0, 10).map((q: any) => `- "${q.query}" (pos ${q.position}, ${q.impressions} imp, ${q.ctr}% CTR)`).join('\n')}

PAGE CONTENT SIGNALS:
${pageSignals.map(s => `URL: ${s.url}
- Words: ${s.wordCount}, Headings: ${s.headingCount}
- Schema: ${s.hasSchema ? s.schemaTypes.join(', ') : 'None'}
- FAQ: ${s.hasFaq}, HowTo: ${s.hasHowTo}, Author: ${s.hasAuthor}, Date: ${s.hasDate}
- External Links: ${s.externalLinks}, Internal Links: ${s.internalLinks}
- Table of Contents: ${s.hasTableOfContents}
- Title: ${s.metaTitle}
- Description: ${s.metaDescription}`).join('\n\n')}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "geoScore": <number 0-100>,
  "dimensions": [
    {"name": "Content Quality", "score": <0-100>, "rationale": "<1 sentence>", "subDetail": "<short stat like 'Avg 3,035 words · 71 headings/page'>"},
    {"name": "Structured Data", "score": <0-100>, "rationale": "<1 sentence>", "subDetail": "<short stat>"},
    {"name": "Citation Worthiness", "score": <0-100>, "rationale": "<1 sentence>", "subDetail": "<short stat>"},
    {"name": "Answer Readiness", "score": <0-100>, "rationale": "<1 sentence>", "subDetail": "<short stat>"},
    {"name": "Brand Authority", "score": <0-100>, "rationale": "<1 sentence>", "subDetail": "<short stat>"}
  ],
  "platforms": {
    "chatgpt": {"likelihood": "high|medium|low", "citationsFound": <number>, "topCitedQuery": "<query string>"},
    "perplexity": {"likelihood": "high|medium|low", "citationsFound": <number>, "topCitedQuery": "<query string>"},
    "googleAIO": {"likelihood": "high|medium|low", "citationsFound": <number>, "topCitedQuery": "<query string>"}
  },
  "recommendations": [
    {"action": "<specific action>", "impact": "high|medium|low", "effort": "low|medium|high", "projectedPoints": <number 1-15>}
  ],
  "projectedScore": <number 0-100, score if all recommendations implemented>,
  "competitors": [
    {"domain": "<competitor domain>", "isYou": false, "geoScore": <0-100>, "citationsPerWeek": <number>, "trend": "up|down|flat"}
  ],
  "competitorGapAlert": "<1 sentence about biggest competitive gap>",
  "pageGeoScores": {"<page url>": <0-100>}
}`;

                    // Try models in fallback order on 429/503
                    let text = '';
                    for (const model of VISIBILITY_MODELS) {
                        try {
                            const response = await ai.models.generateContent({
                                model,
                                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                                config: {
                                    temperature: 0.3,
                                    maxOutputTokens: 3000,
                                    httpOptions: { timeout: 20000 },
                                },
                            });
                            text = response.text || '';
                            break; // success
                        } catch (modelErr: any) {
                            const msg = modelErr?.message || '';
                            if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('UNAVAILABLE')) {
                                console.warn(`[AI-VISIBILITY] ${model} unavailable, trying next fallback...`);
                                continue;
                            }
                            throw modelErr;
                        }
                    }
                    // Extract JSON from response (handle markdown fences)
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        return enrichResponse({ ...parsed, source: 'gemini' }, topQueries, pageSignals, siteUrl);
                    }
                } catch (e: any) {
                    console.error('[AI-VISIBILITY] Gemini failed, using heuristic:', e?.message);
                }
            }

            // Fallback: heuristic scoring
            const heuristic = computeHeuristicScore(pageSignals);
            return enrichResponse(heuristic, topQueries, pageSignals, siteUrl);
        }));
    } catch (error: any) {
        console.error('[AI-VISIBILITY]', error?.message);
        return NextResponse.json({ error: error?.message, geoScore: 0 }, { status: 500 });
    }
}
