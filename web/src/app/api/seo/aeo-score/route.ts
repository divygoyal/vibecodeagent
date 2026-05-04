import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

interface AeoBreakdown {
    label: string;
    points: number;
    max: number;
    pass: boolean;
    detail: string;
}

interface AeoScoreResponse {
    url: string;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: AeoBreakdown[];
    recommendations: string[];
    fetched: {
        statusCode: number;
        responseTime: number;
        wordCount: number;
        title: string;
    };
}

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'is', 'are', 'do', 'does', 'should'];

function isQuestionLike(text: string): boolean {
    const lower = text.trim().toLowerCase();
    if (lower.endsWith('?')) return true;
    const firstWord = lower.split(/\s+/)[0]?.replace(/[^a-z]/g, '');
    return QUESTION_WORDS.includes(firstWord);
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { url?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const targetUrl = body.url?.trim();
    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    let normalizedUrl = targetUrl;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
    }

    if (isBlockedUrl(normalizedUrl)) {
        return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
    }

    try {
        const start = Date.now();
        const fetchRes = await fetch(normalizedUrl, {
            headers: { 'User-Agent': 'TrafficClawAEOBot/1.0 (+https://trafficclaw.com)' },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow',
        });
        const responseTime = Date.now() - start;

        if (!fetchRes.ok) {
            return NextResponse.json({ error: `Failed to fetch URL: ${fetchRes.status}` }, { status: 502 });
        }

        const html = await fetchRes.text();
        const $ = cheerio.load(html);

        // ─── Extract signals ───
        const title = $('title').first().text().trim() || $('h1').first().text().trim();
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

        // Find first meaningful paragraph (>30 chars)
        let firstParagraph = '';
        $('p').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 30 && !firstParagraph) {
                firstParagraph = text;
            }
        });
        const firstParagraphWords = firstParagraph.split(/\s+/).filter(Boolean).length;

        // Schema detection
        const schemas: string[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            const raw = $(el).html() || '';
            try {
                const json = JSON.parse(raw);
                const items = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
                for (const item of items) {
                    if (item && item['@type']) {
                        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
                        for (const t of types) schemas.push(String(t));
                    }
                }
            } catch {
                // Skip invalid JSON-LD
            }
        });
        const hasFAQ = schemas.includes('FAQPage');
        const hasArticle = schemas.some(t => ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].includes(t));
        const hasHowTo = schemas.includes('HowTo');
        const hasOrg = schemas.some(t => ['Organization', 'LocalBusiness', 'Corporation'].includes(t));
        const hasAuthor = schemas.includes('Person') || $('[itemtype*="schema.org/Person"]').length > 0 || $('meta[name="author"]').length > 0;
        const hasAnyContentSchema = hasFAQ || hasArticle || hasHowTo;

        // H2 question-style analysis
        const h2s: string[] = [];
        $('h2').each((_, el) => {
            h2s.push($(el).text().trim());
        });
        const questionH2Count = h2s.filter(isQuestionLike).length;
        const questionH2Ratio = h2s.length > 0 ? questionH2Count / h2s.length : 0;

        // Lists & tables
        const listCount = $('ul, ol').length;
        const tableCount = $('table').length;

        // Freshness: og:article:published_time, article:modified_time, time elements
        let publishedDate: Date | null = null;
        const dateCandidates = [
            $('meta[property="article:modified_time"]').attr('content'),
            $('meta[property="article:published_time"]').attr('content'),
            $('meta[name="last-modified"]').attr('content'),
            $('time[datetime]').first().attr('datetime'),
        ];
        for (const candidate of dateCandidates) {
            if (candidate) {
                const d = new Date(candidate);
                if (!isNaN(d.getTime())) {
                    publishedDate = d;
                    break;
                }
            }
        }
        const ageDays = publishedDate ? Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

        // ─── Score ───
        const breakdown: AeoBreakdown[] = [];

        // Schema content (15)
        breakdown.push({
            label: 'Content schema (Article/HowTo/FAQ)',
            points: hasAnyContentSchema ? (hasFAQ ? 15 : 10) : 0,
            max: 15,
            pass: hasAnyContentSchema,
            detail: hasFAQ ? 'FAQPage schema detected' : hasArticle ? 'Article schema detected' : hasHowTo ? 'HowTo schema detected' : 'No content schema found',
        });

        // First paragraph length 40-80 words (10) — AIO sweet spot
        const fpInRange = firstParagraphWords >= 40 && firstParagraphWords <= 80;
        const fpClose = firstParagraphWords >= 25 && firstParagraphWords <= 120;
        breakdown.push({
            label: 'First paragraph 40-80 words',
            points: fpInRange ? 10 : fpClose ? 5 : 0,
            max: 10,
            pass: fpInRange,
            detail: `${firstParagraphWords} words (target 40-80)`,
        });

        // Question-style H2s (15)
        const questionScore = h2s.length >= 3 && questionH2Ratio >= 0.5 ? 15 : h2s.length >= 2 && questionH2Ratio >= 0.3 ? 8 : 0;
        breakdown.push({
            label: 'H2s phrased as questions',
            points: questionScore,
            max: 15,
            pass: questionScore === 15,
            detail: `${questionH2Count}/${h2s.length} H2s look like questions`,
        });

        // Lists or tables (10)
        const structuredScore = listCount >= 2 || tableCount >= 1 ? 10 : listCount >= 1 ? 5 : 0;
        breakdown.push({
            label: 'Structured content (lists/tables)',
            points: structuredScore,
            max: 10,
            pass: structuredScore === 10,
            detail: `${listCount} lists, ${tableCount} tables`,
        });

        // Word count (10): 800+ ideal, 400-799 partial
        const wcScore = wordCount >= 800 ? 10 : wordCount >= 400 ? 5 : 0;
        breakdown.push({
            label: 'Word count ≥800',
            points: wcScore,
            max: 10,
            pass: wcScore === 10,
            detail: `${wordCount.toLocaleString()} words`,
        });

        // Freshness (15): <90d full, <365d partial
        let freshScore = 0;
        let freshDetail = 'No publish date found';
        if (ageDays !== null) {
            if (ageDays <= 90) {
                freshScore = 15;
                freshDetail = `Updated ${ageDays} days ago`;
            } else if (ageDays <= 365) {
                freshScore = 8;
                freshDetail = `Updated ${ageDays} days ago (refresh soon)`;
            } else {
                freshScore = 0;
                freshDetail = `Updated ${ageDays} days ago — stale`;
            }
        }
        breakdown.push({
            label: 'Freshness (≤90 days)',
            points: freshScore,
            max: 15,
            pass: freshScore === 15,
            detail: freshDetail,
        });

        // Author signal (10)
        breakdown.push({
            label: 'Author / E-E-A-T signal',
            points: hasAuthor ? 10 : 0,
            max: 10,
            pass: hasAuthor,
            detail: hasAuthor ? 'Author markup or meta detected' : 'No author markup',
        });

        // Organization schema (5)
        breakdown.push({
            label: 'Organization schema',
            points: hasOrg ? 5 : 0,
            max: 5,
            pass: hasOrg,
            detail: hasOrg ? 'Organization/LocalBusiness present' : 'Missing org schema',
        });

        // Title quality (10): present, 30-60 chars
        const titleLen = title.length;
        const titleScore = titleLen >= 30 && titleLen <= 65 ? 10 : titleLen > 0 ? 5 : 0;
        breakdown.push({
            label: 'Title length 30-65 chars',
            points: titleScore,
            max: 10,
            pass: titleScore === 10,
            detail: `${titleLen} chars`,
        });

        const score = breakdown.reduce((s, b) => s + b.points, 0);
        const grade = gradeFromScore(score);

        // Recommendations
        const recommendations: string[] = [];
        for (const b of breakdown) {
            if (b.pass) continue;
            switch (b.label) {
                case 'Content schema (Article/HowTo/FAQ)':
                    recommendations.push('Add FAQPage or Article JSON-LD schema — biggest single AEO win.');
                    break;
                case 'First paragraph 40-80 words':
                    recommendations.push(`Rewrite the lead paragraph to 40-80 words (currently ${firstParagraphWords}). AI Overviews favor this length for direct extraction.`);
                    break;
                case 'H2s phrased as questions':
                    recommendations.push('Reframe section headings as natural questions ("How does X work?", "Why is X important?") — matches voice and AI search queries.');
                    break;
                case 'Structured content (lists/tables)':
                    recommendations.push('Convert prose into bullet lists or comparison tables — easier for LLMs to extract and cite.');
                    break;
                case 'Word count ≥800':
                    recommendations.push(`Expand to at least 800 words (currently ${wordCount}). Depth correlates strongly with AI citation rate.`);
                    break;
                case 'Freshness (≤90 days)':
                    recommendations.push('Update the page and refresh `article:modified_time` — content freshness is a top AI ranking factor.');
                    break;
                case 'Author / E-E-A-T signal':
                    recommendations.push('Add author byline + Person schema or `<meta name="author">` for E-E-A-T signal.');
                    break;
                case 'Organization schema':
                    recommendations.push('Add Organization schema in your site footer/global JSON-LD.');
                    break;
                case 'Title length 30-65 chars':
                    recommendations.push(`Adjust title to 30-65 characters (currently ${titleLen}).`);
                    break;
            }
        }

        const result: AeoScoreResponse = {
            url: normalizedUrl,
            score,
            grade,
            breakdown,
            recommendations,
            fetched: {
                statusCode: fetchRes.status,
                responseTime,
                wordCount,
                title,
            },
        };

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to score page';
        console.error('[aeo-score] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
