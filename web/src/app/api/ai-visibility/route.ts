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
const VISIBILITY_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'] as const;

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
        recommendations: [],
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
                    const prompt = `You are an AI Visibility analyst. Analyze this website's content for visibility in AI platforms (ChatGPT, Perplexity, Google AI Overviews).

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
    {"name": "Content Quality", "score": <0-100>, "rationale": "<1 sentence>"},
    {"name": "Structured Data", "score": <0-100>, "rationale": "<1 sentence>"},
    {"name": "Citation Worthiness", "score": <0-100>, "rationale": "<1 sentence>"},
    {"name": "Answer Readiness", "score": <0-100>, "rationale": "<1 sentence>"},
    {"name": "Brand Authority", "score": <0-100>, "rationale": "<1 sentence>"}
  ],
  "platforms": {
    "chatgpt": "high|medium|low",
    "perplexity": "high|medium|low",
    "googleAIO": "high|medium|low"
  },
  "recommendations": [
    {"action": "<specific action>", "impact": "high|medium|low", "effort": "low|medium|high"}
  ]
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
                                    maxOutputTokens: 2000,
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
                        return {
                            ...parsed,
                            source: 'gemini',
                            topQueries,
                            pageSignals,
                            keywordVisibility: topQueries.map((q: any) => ({
                                ...q,
                                aiCitationLikelihood: q.position <= 3 ? 'high' : q.position <= 10 ? 'medium' : 'low',
                            })),
                        };
                    }
                } catch (e: any) {
                    console.error('[AI-VISIBILITY] Gemini failed, using heuristic:', e?.message);
                }
            }

            // Fallback: heuristic scoring
            const heuristic = computeHeuristicScore(pageSignals);
            return {
                ...heuristic,
                topQueries,
                pageSignals,
                keywordVisibility: topQueries.map((q: any) => ({
                    ...q,
                    aiCitationLikelihood: q.position <= 3 ? 'high' : q.position <= 10 ? 'medium' : 'low',
                })),
            };
        }));
    } catch (error: any) {
        console.error('[AI-VISIBILITY]', error?.message);
        return NextResponse.json({ error: error?.message, geoScore: 0 }, { status: 500 });
    }
}
