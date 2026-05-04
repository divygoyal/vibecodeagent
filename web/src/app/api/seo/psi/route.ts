import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';

export const dynamic = 'force-dynamic';

const PSI_API_KEY = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GEMINI_API_KEY || '';

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

        const psiRes = await fetch(psiUrl.toString(), {
            signal: AbortSignal.timeout(60000),
        });

        if (!psiRes.ok) {
            const text = await psiRes.text().catch(() => '');
            return NextResponse.json({ error: `PageSpeed API error: ${psiRes.status}`, detail: text.slice(0, 200) }, { status: 502 });
        }

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
