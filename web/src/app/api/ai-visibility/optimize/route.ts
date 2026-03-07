import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import { cachedFetch } from '@/lib/apiCache';
import { isBlockedUrl } from '@/lib/urlValidation';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'] as const;

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url, topQueries } = await req.json();
        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'url required' }, { status: 400 });
        }
        if (url.length > 2000 || isBlockedUrl(url)) {
            return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = String(session.user.id);
        const cacheKey = `optimize:${userId}:${url}`;

        const result = await cachedFetch(cacheKey, 30 * 60 * 1000, async () => {
            // Crawl the page
            let html = '';
            try {
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'TrafficClaw-Bot/1.0 (Content Optimizer)' },
                    signal: AbortSignal.timeout(8000),
                    redirect: 'follow',
                });
                if (res.ok) html = await res.text();
            } catch { /* continue */ }

            if (!html) {
                return { error: 'Could not fetch page', suggestions: [] };
            }

            const $ = cheerio.load(html);
            $('script, style, noscript').remove();

            const title = $('title').text().trim();
            const description = $('meta[name="description"]').attr('content') || '';
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            const wordCount = bodyText.split(/\s+/).length;
            const headings = $('h1, h2, h3, h4').map((_, el) => `${el.tagName}: ${$(el).text().trim()}`).get().slice(0, 25);
            const hasSchema = $('script[type="application/ld+json"]').length > 0;
            const hasFaq = $('details, .faq, [class*="faq"]').length > 0 || bodyText.toLowerCase().includes('frequently asked');
            const hasAuthor = $('[rel="author"], [class*="author"]').length > 0;
            const externalLinks = $('a[href^="http"]').filter((_, el) => {
                const href = $(el).attr('href') || '';
                try { return new URL(href).hostname !== new URL(url).hostname; } catch { return false; }
            }).length;

            if (!ai) {
                return { error: 'AI not configured', suggestions: [] };
            }

            const queryContext = (topQueries || []).slice(0, 5).map((q: string) => `"${q}"`).join(', ');

            const prompt = `You are an AI content optimization expert specializing in making content more likely to be cited by AI platforms (ChatGPT, Perplexity, Google AI Overviews).

Analyze this page and provide specific, actionable optimization suggestions:

PAGE: ${url}
TITLE: ${title}
META DESCRIPTION: ${description}
WORD COUNT: ${wordCount}
HEADINGS: ${headings.join('\n')}
HAS SCHEMA: ${hasSchema}
HAS FAQ: ${hasFaq}
HAS AUTHOR: ${hasAuthor}
EXTERNAL LINKS: ${externalLinks}
TARGET QUERIES: ${queryContext || 'Not specified'}

CONTENT EXCERPT (first 2000 chars):
${bodyText.slice(0, 2000)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "readabilityScore": <0-100>,
  "overallAssessment": "<2-3 sentence summary of the page's AI-readiness>",
  "suggestions": [
    {
      "category": "structure|content|schema|keywords|authority",
      "title": "<short action title>",
      "current": "<what the page currently has/does wrong>",
      "recommended": "<specific recommendation>",
      "impact": "high|medium|low",
      "example": "<optional: a before/after snippet or code example>"
    }
  ]
}

Rules:
- Provide 5-8 specific suggestions
- Order by impact (high first)
- Include at least one suggestion per category: structure, content, schema
- For "example" field, provide actual rewrite snippets using the page's real content
- Focus on what makes AI platforms cite content: direct answers, structured data, authority signals, factual density`;

            let text = '';
            for (const model of MODELS) {
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        config: { temperature: 0.3, maxOutputTokens: 3000, httpOptions: { timeout: 20000 } },
                    });
                    text = response.text || '';
                    break;
                } catch (err: any) {
                    const msg = err?.message || '';
                    if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('UNAVAILABLE')) continue;
                    throw err;
                }
            }

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return { error: 'Failed to generate optimizations', suggestions: [] };
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[CONTENT-OPTIMIZE]', error?.message);
        return NextResponse.json({ error: 'Content optimization failed', suggestions: [] }, { status: 500 });
    }
}
