import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { cachedFetch } from '@/lib/apiCache';
import {
    getGoogleGenAIClient,
    getGoogleGenAIText,
    GOOGLE_GENAI_PRIMARY_MODEL,
    GOOGLE_GENAI_THINKING_DISABLED,
} from '@/lib/googleGenAi';

export const dynamic = 'force-dynamic';

const ai = getGoogleGenAIClient();

// 7-day cache TTL for annotations — chart data doesn't change retroactively
const ANNOTATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

type SmartAnnotation = {
    date: string;
    title: string;
    detail: string;
    suggestion: string;
    tone: 'emerald' | 'red' | 'amber' | 'cyan';
};

type ChartDataPoint = {
    date: string;
    sessions: number;
    clicks: number;
    position: number;
    impressions: number;
};

type ChartAnnotationResult = {
    annotations: SmartAnnotation[];
    warning?: string;
};

const SYSTEM_PROMPT = `You are a senior web analytics consultant analyzing chart data for a website owner.
You will receive a JSON array of daily data points with: date, sessions (from Google Analytics), clicks (from Google Search Console), impressions, and average search position.

Your task: identify the 5 most interesting/notable data points and generate annotations for them.

Look for:
- Significant traffic spikes or drops (sessions or clicks)
- Position improvements or regressions
- Unusual impression changes (algorithm updates, new rankings)
- Peak performance days
- Trend inflection points (where a decline starts recovering, or growth stalls)
- Correlations between metrics (e.g., position improved but clicks didn't follow)

Rules:
- Return EXACTLY 5 annotations, no more, no fewer
- Each annotation date MUST exactly match a date from the input data
- title: max 25 characters, concise label
- detail: 1-2 sentences explaining what happened and why it matters
- suggestion: 1 actionable recommendation the site owner can take
- tone: "emerald" for positive, "red" for negative, "amber" for caution/neutral, "cyan" for informational
- If the data is mostly flat/boring, still find the 5 most relatively notable points

Return ONLY valid JSON with no markdown fencing, no explanation outside the JSON:
{"annotations":[{"date":"YYYY-MM-DD","title":"...","detail":"...","suggestion":"...","tone":"emerald|red|amber|cyan"},...]}`;

function extractJsonPayload(text: string) {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const fencedOrRaw = (fencedMatch?.[1] || text).trim();
    const firstBrace = fencedOrRaw.indexOf('{');
    const lastBrace = fencedOrRaw.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return fencedOrRaw.slice(firstBrace, lastBrace + 1);
    }

    return fencedOrRaw;
}

function normalizeAnnotations(
    rawAnnotations: Partial<SmartAnnotation>[] | undefined,
    chartData: ChartDataPoint[]
) {
    const annotations: SmartAnnotation[] = (rawAnnotations || [])
        .slice(0, 5)
        .filter((a): a is Required<Pick<SmartAnnotation, 'date' | 'title' | 'detail' | 'suggestion' | 'tone'>> =>
            !!(a.date && a.title && a.detail && a.suggestion && a.tone)
        )
        .map((a) => ({
            date: String(a.date),
            title: String(a.title).slice(0, 30),
            detail: String(a.detail).slice(0, 200),
            suggestion: String(a.suggestion).slice(0, 200),
            tone: (['emerald', 'red', 'amber', 'cyan'].includes(a.tone) ? a.tone : 'cyan') as SmartAnnotation['tone'],
        }));

    const validDates = new Set(chartData.map((p) => p.date));
    return annotations.filter((annotation) => validDates.has(annotation.date));
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ai) {
        return NextResponse.json(
            { annotations: [], warning: 'AI annotations unavailable — no API key configured' },
            { status: 200 }
        );
    }

    try {
        const body = await req.json();
        const { siteUrl, range, chartData } = body as {
            siteUrl?: string;
            range?: string;
            chartData?: ChartDataPoint[];
        };

        if (!chartData || !Array.isArray(chartData) || chartData.length < 3) {
            return NextResponse.json(
                { annotations: [], warning: 'Insufficient chart data for analysis' },
                { status: 200 }
            );
        }

        // Build cache key from data boundaries
        const firstDate = chartData[0]?.date || 'unknown';
        const lastDate = chartData[chartData.length - 1]?.date || 'unknown';
        // @ts-expect-error - id added in callbacks
        const userId = session.user.id || session.user.email || 'anon';
        const cacheKey = `chart-ann:${userId}:${siteUrl || 'default'}:${range || '30d'}:${firstDate}:${lastDate}`;

        const result = await cachedFetch<ChartAnnotationResult>(
            cacheKey,
            ANNOTATION_CACHE_TTL,
            async () => {
                // Prepare compact data for Gemini (strip unnecessary precision)
                const compactData = chartData.map((p) => ({
                    date: p.date,
                    sessions: Math.round(p.sessions),
                    clicks: Math.round(p.clicks),
                    impressions: Math.round(p.impressions),
                    position: Math.round(p.position * 10) / 10,
                }));

                const response = await ai.models.generateContent({
                    model: GOOGLE_GENAI_PRIMARY_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: JSON.stringify(compactData) }],
                        },
                    ],
                    config: {
                        systemInstruction: SYSTEM_PROMPT,
                        temperature: 0.3,
                        maxOutputTokens: 1500,
                        responseMimeType: 'application/json',
                        thinkingConfig: GOOGLE_GENAI_THINKING_DISABLED,
                        httpOptions: { timeout: 15000 },
                    },
                });

                const text = getGoogleGenAIText(response).trim();
                if (!text) {
                    return {
                        annotations: [],
                        warning: 'AI annotations unavailable for this chart right now',
                    };
                }

                try {
                    const parsed = JSON.parse(extractJsonPayload(text)) as {
                        annotations?: Partial<SmartAnnotation>[];
                    };

                    return {
                        annotations: normalizeAnnotations(parsed.annotations, chartData),
                    };
                } catch (error) {
                    console.warn('[chart-annotations] Invalid model JSON, using static fallback:', error);
                    return {
                        annotations: [],
                        warning: 'AI annotations unavailable for this chart right now',
                    };
                }
            }
        );

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.warn('[chart-annotations] Falling back to static annotations:', error);
        return NextResponse.json(
            { annotations: [], warning: 'Failed to generate AI annotations' },
            { status: 200 }
        );
    }
}
