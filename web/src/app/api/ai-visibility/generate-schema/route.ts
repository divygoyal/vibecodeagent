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

        const { url } = await req.json();
        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'url required' }, { status: 400 });
        }
        if (url.length > 2000 || isBlockedUrl(url)) {
            return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = String(session.user.id);
        const cacheKey = `schema-gen:${userId}:${url}`;

        const result = await cachedFetch(cacheKey, 30 * 60 * 1000, async () => {
            // Crawl the page
            let html = '';
            try {
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'TrafficClaw-Bot/1.0 (Schema Generator)' },
                    signal: AbortSignal.timeout(8000),
                    redirect: 'follow',
                });
                if (res.ok) html = await res.text();
            } catch { /* continue with empty */ }

            if (!html) {
                return { error: 'Could not fetch page', schemas: [] };
            }

            const $ = cheerio.load(html);
            $('script, style, noscript').remove();

            const title = $('title').text().trim();
            const description = $('meta[name="description"]').attr('content') || '';
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
            const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().slice(0, 20);
            const hasFaq = $('details, .faq, [class*="faq"]').length > 0;
            const hasHowTo = $('[class*="step"], ol li').length > 3;

            // Existing schemas
            const existingSchemas: string[] = [];
            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const json = JSON.parse($(el).html() || '');
                    existingSchemas.push(json['@type'] || 'Unknown');
                } catch { /* ignore */ }
            });

            if (!ai) {
                return { error: 'AI not configured', schemas: [] };
            }

            const prompt = `You are a structured data expert. Generate JSON-LD schema markup for this web page.

PAGE INFO:
- URL: ${url}
- Title: ${title}
- Description: ${description}
- Headings: ${headings.join(' | ')}
- Has FAQ-like content: ${hasFaq}
- Has step-by-step content: ${hasHowTo}
- Existing schemas: ${existingSchemas.length > 0 ? existingSchemas.join(', ') : 'None'}
- Content excerpt: ${bodyText.slice(0, 1500)}

Generate the MOST IMPACTFUL schema types this page is missing. For each, provide complete, valid JSON-LD that can be directly pasted into the page <head>.

Return ONLY valid JSON (no markdown, no code fences):
{
  "schemas": [
    {
      "type": "<schema type like Article, FAQPage, HowTo, BreadcrumbList, WebPage>",
      "description": "<1 sentence explaining why this schema helps AI visibility>",
      "jsonLd": <complete JSON-LD object, NOT a string>
    }
  ]
}

Rules:
- Generate 2-4 schema types
- Always include FAQPage if any Q&A content exists
- Always include Article or WebPage as base
- Include HowTo if step-by-step content exists
- Include BreadcrumbList for navigation
- Use real content from the page for the schema values
- Ensure @context is "https://schema.org"`;

            let text = '';
            for (const model of MODELS) {
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        config: { temperature: 0.2, maxOutputTokens: 3000, httpOptions: { timeout: 20000 } },
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
                const parsed = JSON.parse(jsonMatch[0]);
                // Stringify each jsonLd for display
                const schemas = (parsed.schemas || []).map((s: any) => ({
                    type: s.type,
                    description: s.description,
                    jsonLd: typeof s.jsonLd === 'string' ? s.jsonLd : JSON.stringify(s.jsonLd, null, 2),
                }));
                return { schemas };
            }

            return { error: 'Failed to generate schemas', schemas: [] };
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[SCHEMA-GEN]', error?.message);
        return NextResponse.json({ error: 'Schema generation failed', schemas: [] }, { status: 500 });
    }
}
