import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

// Rate limit by IP — 5 requests per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limited. Try again in a minute.' }, { status: 429 });
  }

  const keyword = req.nextUrl.searchParams.get('keyword');
  const domain = req.nextUrl.searchParams.get('domain') || '';
  if (!keyword) return NextResponse.json({ error: 'Missing keyword' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an SEO keyword research expert. Given the seed keyword "${keyword}"${domain ? ` for the domain ${domain}` : ''}, generate 15 related keyword opportunities.

For each keyword, provide:
- keyword: the keyword phrase
- volume: estimated monthly search volume (number)
- difficulty: "Low", "Medium", or "High"
- intent: "Informational", "Commercial", "Transactional", or "Navigational"
- contentType: suggested content type (e.g., "Blog Post", "Landing Page", "Guide", "Product Page", "Service Page")
- reason: brief explanation of why this keyword is valuable

Return ONLY a JSON array, no markdown, no code fences.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const text = response.text?.trim() || '';
    // Clean potential markdown fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const keywords = JSON.parse(cleaned);

    return NextResponse.json({ keywords });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate keywords';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
