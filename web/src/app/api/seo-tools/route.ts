import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function callGemini(prompt: string): Promise<string> {
    if (!GEMINI_API_KEY) return '';
    try {
        const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
            }),
        });
        if (!res.ok) return '';
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
        return '';
    }
}

export async function POST(req: Request) {
    try {
        const session: any = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { tool, input } = await req.json();

        if (!tool) {
            return NextResponse.json({ error: 'tool parameter required' }, { status: 400 });
        }

        switch (tool) {
            case 'schema': {
                const { pageUrl, pageType } = input || {};
                const prompt = `Generate a complete, valid JSON-LD structured data markup for a ${pageType || 'WebPage'} at URL "${pageUrl || 'https://example.com'}". 
Include all recommended properties. Return ONLY the JSON-LD script tag content (the JSON object), no explanation. 
Make it production-ready with realistic placeholder values that the user should customize.
Include @context, @type, and all relevant properties for ${pageType || 'WebPage'}.
If it's an Article, include headline, datePublished, author, image, etc.
If it's a Product, include name, description, offers, etc.
If it's a FAQ, include mainEntity with multiple questions.`;

                const result = await callGemini(prompt);
                if (!result) {
                    // Fallback schema
                    const fallback = JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": pageType || "WebPage",
                        "name": "Your Page Title",
                        "description": "Your page description",
                        "url": pageUrl || "https://example.com"
                    }, null, 2);
                    return NextResponse.json({ schema: fallback, source: 'fallback' });
                }
                // Extract JSON from response
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                return NextResponse.json({ schema: jsonMatch ? jsonMatch[0] : result, source: 'ai' });
            }

            case 'blog': {
                const { topic, keywords, tone } = input || {};
                const prompt = `Write a comprehensive, SEO-optimized blog post about "${topic || 'SEO best practices'}".
Target keywords: ${keywords || 'SEO, search engine optimization'}.
Tone: ${tone || 'professional and informative'}.

Include:
- An engaging H1 title (with the primary keyword)
- A meta description (150-160 chars)
- 4-6 H2 sections with detailed content
- Internal linking suggestions (marked as [INTERNAL LINK: anchor text -> /suggested-path])
- A conclusion with CTA
- Format in Markdown

Make it at least 800 words, well-structured, and genuinely useful.`;

                const result = await callGemini(prompt);
                if (!result) {
                    return NextResponse.json({ content: `# ${topic || 'SEO Best Practices'}\n\nConfigure your GEMINI_API_KEY to generate AI blog content.`, source: 'fallback' });
                }
                return NextResponse.json({ content: result, source: 'ai' });
            }

            case 'keywords': {
                const { siteUrl, currentKeywords } = input || {};
                const prompt = `You are an expert SEO keyword researcher. Based on a website at "${siteUrl || 'a general website'}" that currently ranks for: ${currentKeywords || 'no known keywords'}.

Find 15 untapped keyword opportunities. For each keyword provide:
1. The keyword phrase
2. Estimated monthly search volume (realistic estimate)
3. Keyword difficulty (Low/Medium/High)
4. Search intent (Informational/Transactional/Navigational/Commercial)
5. Suggested content type (Blog post, Landing page, FAQ, Tool, etc.)
6. Why this is a good opportunity

Format as a JSON array with objects: { "keyword": "", "volume": 0, "difficulty": "", "intent": "", "contentType": "", "reason": "" }
Return ONLY the JSON array, no other text.`;

                const result = await callGemini(prompt);
                if (!result) {
                    return NextResponse.json({ keywords: [], source: 'fallback' });
                }
                try {
                    const jsonMatch = result.match(/\[[\s\S]*\]/);
                    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
                    return NextResponse.json({ keywords: parsed, source: 'ai' });
                } catch {
                    return NextResponse.json({ keywords: [], raw: result, source: 'ai' });
                }
            }

            case 'linking': {
                const { pages } = input || {};
                const pageList = (pages || []).slice(0, 20);
                const prompt = `You are an internal linking expert. Given these pages on a website:
${pageList.map((p: any, i: number) => `${i + 1}. ${p.page || p.url || p} (${p.title || ''})`).join('\n')}

Suggest 10 internal linking opportunities. For each suggestion:
1. Source page (which page should contain the link)
2. Target page (which page to link to)
3. Suggested anchor text
4. Reason why this link would help SEO

Format as a JSON array: { "source": "", "target": "", "anchor": "", "reason": "" }
Return ONLY the JSON array.`;

                const result = await callGemini(prompt);
                if (!result) {
                    return NextResponse.json({ links: [], source: 'fallback' });
                }
                try {
                    const jsonMatch = result.match(/\[[\s\S]*\]/);
                    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
                    return NextResponse.json({ links: parsed, source: 'ai' });
                } catch {
                    return NextResponse.json({ links: [], raw: result, source: 'ai' });
                }
            }

            default:
                return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
        }
    } catch (err: any) {
        console.error('SEO Tools error:', err);
        return NextResponse.json({ error: err.message || 'Tool failed' }, { status: 500 });
    }
}
