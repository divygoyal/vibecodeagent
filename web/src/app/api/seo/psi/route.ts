import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';

export const dynamic = 'force-dynamic';

// PageSpeed Insights API is its own thing — DO NOT fall back to GEMINI_API_KEY,
// those are different keys served by different products. PSI v5 also works
// without a key (just rate-limited to 1 query/second per IP) so missing key
// isn't fatal. Previously we were sending GEMINI_API_KEY here and getting
// 400/403 from Google → bubbled to the client as 502 Bad Gateway.
const PSI_API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY || '';

type Strategy = 'mobile' | 'desktop';

interface PsiMetric {
    label: string;
    value: number;
    displayValue: string;
    score: number; // 0-1
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface PsiResponse {
    url: string;
    strategy: Strategy;
    performanceScore: number; // 0-100
    seoScore: number;
    accessibilityScore: number;
    bestPracticesScore: number;
    metrics: {
        lcp: PsiMetric | null;
        cls: PsiMetric | null;
        inp: PsiMetric | null;
        fcp: PsiMetric | null;
        ttfb: PsiMetric | null;
    };
    fieldData: {
        hasFieldData: boolean;
        lcpRating?: string;
        clsRating?: string;
        inpRating?: string;
    };
    opportunities: Array<{ id: string; title: string; savingsMs?: number }>;
    fetchedAt: string;
}

function rateLcp(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
}
function rateCls(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
}
function rateInp(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 200) return 'good';
    if (value <= 500) return 'needs-improvement';
    return 'poor';
}

function metricFromAudit(audit: { numericValue?: number; displayValue?: string; score?: number | null } | undefined, rater: (v: number) => 'good' | 'needs-improvement' | 'poor', label: string): PsiMetric | null {
    if (!audit || typeof audit.numericValue !== 'number') return null;
    return {
        label,
        value: audit.numericValue,
        displayValue: audit.displayValue || String(audit.numericValue),
        score: typeof audit.score === 'number' ? audit.score : 0,
        rating: rater(audit.numericValue),
    };
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { url?: string; strategy?: Strategy };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let target = body.url?.trim();
    if (!target) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    if (isBlockedUrl(target)) {
        return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
    }

    const strategy: Strategy = body.strategy === 'desktop' ? 'desktop' : 'mobile';

    try {
        const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
        psiUrl.searchParams.set('url', target);
        psiUrl.searchParams.set('strategy', strategy);
        for (const cat of ['performance', 'seo', 'accessibility', 'best-practices']) {
            psiUrl.searchParams.append('category', cat);
        }
        if (PSI_API_KEY) psiUrl.searchParams.set('key', PSI_API_KEY);

        // PSI is slow on cold cache (first run for a URL can take 30-50s).
        // Strategy: try once with a generous 35s budget. If that times out or
        // returns 5xx, retry ONCE with a tighter 20s budget — the server
        // usually has the result cached by then. Don't retry on 4xx (won't help).
        const fetchPsi = async (timeoutMs: number): Promise<Response> => {
            return fetch(psiUrl.toString(), { signal: AbortSignal.timeout(timeoutMs) });
        };

        let psiRes: Response;
        let lastError: unknown = null;
        try {
            psiRes = await fetchPsi(35_000);
        } catch (firstErr) {
            lastError = firstErr;
            const isTimeoutOr5xx = firstErr instanceof Error && (firstErr.name === 'AbortError' || firstErr.name === 'TimeoutError');
            if (!isTimeoutOr5xx) {
                return NextResponse.json(
                    { error: `Network error reaching PageSpeed Insights: ${firstErr instanceof Error ? firstErr.message : 'unknown'}` },
                    { status: 504 }
                );
            }
            // Retry once with a tighter budget — Google often warm-cached the URL by now.
            try {
                psiRes = await fetchPsi(20_000);
            } catch (secondErr) {
                lastError = secondErr;
                return NextResponse.json(
                    {
                        error: 'PageSpeed Insights is slow right now. Google\'s API takes 30-60s on cold cache for new URLs. Try again in a moment, or audit a different page first to warm the cache.',
                        detail: secondErr instanceof Error ? secondErr.message : 'timeout',
                    },
                    { status: 504 }
                );
            }
        }

        if (!psiRes.ok) {
            const text = await psiRes.text().catch(() => '');
            // 429 with no API key → unauthenticated quota exhausted. Surface as a clean empty state
            // so SeoPageHealthPanel can render an info banner instead of a generic error.
            if ((psiRes.status === 429 || psiRes.status === 403) && !PSI_API_KEY) {
                return NextResponse.json(
                    { supported: false, reason: 'pagespeed_quota_exhausted', error: 'PageSpeed Insights anonymous quota exhausted. Add a free GOOGLE_PAGESPEED_API_KEY (console.cloud.google.com) to lift the limit.' },
                    { status: 200 }
                );
            }
            // Classify upstream errors so the user gets actionable copy instead of "502 Bad Gateway".
            let userMessage = `PageSpeed Insights returned ${psiRes.status}.`;
            if (psiRes.status === 400) {
                userMessage = 'PageSpeed Insights couldn\'t analyze this URL. Make sure it returns a 2xx status and isn\'t blocked by robots.txt or a paywall.';
            } else if (psiRes.status === 403) {
                userMessage = 'PageSpeed Insights API key is invalid or doesn\'t have the PageSpeed Insights API enabled. Check the GOOGLE_PAGESPEED_API_KEY env var.';
            } else if (psiRes.status === 429) {
                userMessage = 'PageSpeed Insights rate limit hit. Wait a minute, then try again.';
            } else if (psiRes.status >= 500) {
                userMessage = 'Google\'s PageSpeed Insights service is having issues. Try again in a few minutes.';
            }
            console.error('[psi] upstream error', psiRes.status, text.slice(0, 200));
            return NextResponse.json({ error: userMessage, status: psiRes.status, detail: text.slice(0, 200) }, { status: 502 });
        }
        // (lastError is intentionally unused here — successful response.)
        void lastError;

        const psiData = await psiRes.json();
        const lh = psiData.lighthouseResult;
        const cats = lh?.categories || {};
        const audits = lh?.audits || {};

        const performanceScore = Math.round((cats.performance?.score || 0) * 100);
        const seoScore = Math.round((cats.seo?.score || 0) * 100);
        const accessibilityScore = Math.round((cats.accessibility?.score || 0) * 100);
        const bestPracticesScore = Math.round((cats['best-practices']?.score || 0) * 100);

        const metrics = {
            lcp: metricFromAudit(audits['largest-contentful-paint'], rateLcp, 'LCP'),
            cls: metricFromAudit(audits['cumulative-layout-shift'], rateCls, 'CLS'),
            inp: metricFromAudit(audits['interaction-to-next-paint'] || audits['experimental-interaction-to-next-paint'], rateInp, 'INP'),
            fcp: metricFromAudit(audits['first-contentful-paint'], rateLcp, 'FCP'),
            ttfb: metricFromAudit(audits['server-response-time'], rateLcp, 'TTFB'),
        };

        // Field data (CrUX)
        const lo = psiData.loadingExperience?.metrics;
        const fieldData = {
            hasFieldData: !!lo,
            lcpRating: lo?.LARGEST_CONTENTFUL_PAINT_MS?.category?.toLowerCase().replace('_', '-'),
            clsRating: lo?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category?.toLowerCase().replace('_', '-'),
            inpRating: lo?.INTERACTION_TO_NEXT_PAINT?.category?.toLowerCase().replace('_', '-'),
        };

        // Top opportunities (the audits with savings)
        const opportunities: Array<{ id: string; title: string; savingsMs?: number }> = [];
        for (const [auditId, audit] of Object.entries(audits) as Array<[string, { score?: number | null; title?: string; details?: { overallSavingsMs?: number } }]>) {
            if (audit.score === null || audit.score === undefined) continue;
            if (audit.score >= 0.9) continue;
            const savings = audit.details?.overallSavingsMs;
            if (typeof savings === 'number' && savings > 100) {
                opportunities.push({ id: auditId, title: audit.title || auditId, savingsMs: savings });
            }
        }
        opportunities.sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0));

        const result: PsiResponse = {
            url: target,
            strategy,
            performanceScore,
            seoScore,
            accessibilityScore,
            bestPracticesScore,
            metrics,
            fieldData,
            opportunities: opportunities.slice(0, 8),
            fetchedAt: new Date().toISOString(),
        };

        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'private, max-age=600' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run PageSpeed Insights';
        console.error('[psi] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
