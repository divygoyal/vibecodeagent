import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROUNDING_MODEL = 'gemini-2.5-flash';

interface Citation {
    uri: string;
    domain: string;
    title?: string;
    snippet?: string;
    matchesUserDomain: boolean;
}

interface AioCheckResponse {
    query: string;
    answer: string;
    citations: Citation[];
    userCited: boolean;
    userDomain: string | null;
    competitorDomains: string[];
    citationCount: number;
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

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    let body: { query?: string; userDomain?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const query = body.query?.trim();
    if (!query) {
        return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }
    if (query.length > 300) {
        return NextResponse.json({ error: 'Query too long (max 300 chars)' }, { status: 400 });
    }

    const userDomain = normalizeDomain(body.userDomain);

    try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: GROUNDING_MODEL,
            contents: [{ role: 'user', parts: [{ text: query }] }],
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.3,
                maxOutputTokens: 1500,
            },
        });

        const candidate = response.candidates?.[0];
        const answer = candidate?.content?.parts?.map(p => p.text || '').join('').trim() || '';
        const groundingMetadata = candidate?.groundingMetadata;
        const chunks = groundingMetadata?.groundingChunks || [];

        const seenDomains = new Set<string>();
        const citations: Citation[] = [];
        for (const chunk of chunks) {
            const web = chunk.web;
            if (!web?.uri) continue;
            const domain = domainFromUri(web.uri);
            if (!domain) continue;
            if (seenDomains.has(domain)) continue;
            seenDomains.add(domain);
            citations.push({
                uri: web.uri,
                domain,
                title: web.title,
                matchesUserDomain: userDomain ? domain === userDomain || domain.endsWith(`.${userDomain}`) : false,
            });
        }

        const userCited = citations.some(c => c.matchesUserDomain);
        const competitorDomains = citations.filter(c => !c.matchesUserDomain).map(c => c.domain);

        const result: AioCheckResponse = {
            query,
            answer,
            citations,
            userCited,
            userDomain,
            competitorDomains,
            citationCount: citations.length,
        };

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run AIO check';
        console.error('[aio-check] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
