import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROUNDING_MODEL = 'gemini-2.5-flash';

const MAX_PROMPTS_PER_REQUEST = 10;
const MAX_PROMPT_LENGTH = 300;

interface PromptCheckResult {
    prompt: string;
    cited: boolean;
    citationDomains: string[];
    competitorDomains: string[];
    answerExcerpt: string;
    fetchedAt: string;
    error?: string;
}

interface AiVisibilityResponse {
    userDomain: string | null;
    results: PromptCheckResult[];
    summary: {
        total: number;
        cited: number;
        citedRate: number;
        topCompetitors: Array<{ domain: string; count: number }>;
    };
}

function normalizeDomain(input: string | null | undefined): string | null {
    if (!input) return null;
    let raw = input.trim();
    raw = raw.replace(/^sc-domain:/, '');
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
        const parsed = new URL(raw);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
}

function domainFromUri(uri: string): string {
    try {
        const parsed = new URL(uri);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

async function runOnePrompt(ai: GoogleGenAI, prompt: string, userDomain: string | null): Promise<PromptCheckResult> {
    try {
        const response = await ai.models.generateContent({
            model: GROUNDING_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.3,
                maxOutputTokens: 1200,
            },
        });

        const candidate = response.candidates?.[0];
        const answer = candidate?.content?.parts?.map(p => p.text || '').join('').trim() || '';
        const chunks = candidate?.groundingMetadata?.groundingChunks || [];

        const seen = new Set<string>();
        const citationDomains: string[] = [];
        for (const chunk of chunks) {
            const uri = chunk.web?.uri;
            if (!uri) continue;
            const dom = domainFromUri(uri);
            if (!dom || seen.has(dom)) continue;
            seen.add(dom);
            citationDomains.push(dom);
        }

        const cited = userDomain
            ? citationDomains.some(d => d === userDomain || d.endsWith(`.${userDomain}`))
            : false;
        const competitorDomains = userDomain
            ? citationDomains.filter(d => d !== userDomain && !d.endsWith(`.${userDomain}`))
            : citationDomains;

        return {
            prompt,
            cited,
            citationDomains,
            competitorDomains,
            answerExcerpt: answer.slice(0, 400),
            fetchedAt: new Date().toISOString(),
        };
    } catch (error) {
        return {
            prompt,
            cited: false,
            citationDomains: [],
            competitorDomains: [],
            answerExcerpt: '',
            fetchedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    let body: { prompts?: string[]; userDomain?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawPrompts = Array.isArray(body.prompts) ? body.prompts : [];
    const prompts = rawPrompts
        .map(p => (typeof p === 'string' ? p.trim() : ''))
        .filter(p => p.length > 0 && p.length <= MAX_PROMPT_LENGTH)
        .slice(0, MAX_PROMPTS_PER_REQUEST);

    if (prompts.length === 0) {
        return NextResponse.json({ error: 'Provide at least one prompt' }, { status: 400 });
    }

    const userDomain = normalizeDomain(body.userDomain);

    try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // Run prompts sequentially with small concurrency (3 at a time) to avoid rate limit
        const results: PromptCheckResult[] = [];
        const concurrency = 3;
        for (let i = 0; i < prompts.length; i += concurrency) {
            const batch = prompts.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map(p => runOnePrompt(ai, p, userDomain)));
            results.push(...batchResults);
        }

        // Aggregate competitor counts
        const competitorCounts = new Map<string, number>();
        for (const r of results) {
            for (const dom of r.competitorDomains) {
                competitorCounts.set(dom, (competitorCounts.get(dom) || 0) + 1);
            }
        }
        const topCompetitors = Array.from(competitorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([domain, count]) => ({ domain, count }));

        const cited = results.filter(r => r.cited).length;
        const total = results.length;

        const response: AiVisibilityResponse = {
            userDomain,
            results,
            summary: {
                total,
                cited,
                citedRate: total > 0 ? +((cited / total) * 100).toFixed(1) : 0,
                topCompetitors,
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run AI visibility check';
        console.error('[ai-visibility] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
