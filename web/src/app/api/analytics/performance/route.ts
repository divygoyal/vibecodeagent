import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const CRUX_API_KEY = process.env.CRUX_API_KEY || '';

// ─── Types ───

interface MetricSnapshot {
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface OverviewMetrics {
    lcp: MetricSnapshot;
    inp: MetricSnapshot;
    cls: MetricSnapshot;
    fcp: MetricSnapshot;
    ttfb: MetricSnapshot;
}

interface DeviceMetrics {
    device: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
}

type CruxFormFactor = 'DESKTOP' | 'PHONE' | 'TABLET';

interface CruxCollectionDate {
    year?: number;
    month?: number;
    day?: number;
}

interface CruxMetricPercentiles {
    p75?: number | string;
}

interface CruxMetricRecord {
    percentiles?: CruxMetricPercentiles;
}

interface CruxRecordResponse {
    record?: {
        metrics?: {
            largest_contentful_paint?: CruxMetricRecord;
            interaction_to_next_paint?: CruxMetricRecord;
            cumulative_layout_shift?: CruxMetricRecord;
            first_contentful_paint?: CruxMetricRecord;
            experimental_time_to_first_byte?: CruxMetricRecord;
        };
        collectionPeriod?: {
            firstDate?: CruxCollectionDate;
            lastDate?: CruxCollectionDate;
        };
    };
}

// ─── Rating helpers ───

function rateLCP(v: number): MetricSnapshot['rating'] {
    if (v < 2.5) return 'good';
    if (v < 4.0) return 'needs-improvement';
    return 'poor';
}

function rateINP(v: number): MetricSnapshot['rating'] {
    if (v < 200) return 'good';
    if (v < 500) return 'needs-improvement';
    return 'poor';
}

function rateCLS(v: number): MetricSnapshot['rating'] {
    if (v < 0.1) return 'good';
    if (v < 0.25) return 'needs-improvement';
    return 'poor';
}

function rateFCP(v: number): MetricSnapshot['rating'] {
    if (v < 1.8) return 'good';
    if (v < 3.0) return 'needs-improvement';
    return 'poor';
}

function rateTTFB(v: number): MetricSnapshot['rating'] {
    if (v < 0.8) return 'good';
    if (v < 1.8) return 'needs-improvement';
    return 'poor';
}

// ─── CrUX API integration ───

async function fetchCrUX(origin: string, formFactor?: CruxFormFactor): Promise<CruxRecordResponse | null> {
    const body: { origin: string; formFactor?: CruxFormFactor } = { origin };
    if (formFactor) body.formFactor = formFactor;

    const res = await fetch(
        `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        }
    );

    if (!res.ok) return null;
    return res.json();
}

function extractCrUXMetrics(data: CruxRecordResponse): { lcp: number; inp: number; cls: number; fcp: number; ttfb: number } {
    const m = data?.record?.metrics || {};
    const asNumber = (value?: number | string) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return parseFloat(value);
        return 0;
    };

    return {
        lcp: asNumber(m.largest_contentful_paint?.percentiles?.p75) / 1000, // ms → seconds
        inp: asNumber(m.interaction_to_next_paint?.percentiles?.p75), // ms (keep as-is, 0 if unavailable)
        cls: asNumber(m.cumulative_layout_shift?.percentiles?.p75),
        fcp: asNumber(m.first_contentful_paint?.percentiles?.p75) / 1000, // ms → seconds
        ttfb: asNumber(m.experimental_time_to_first_byte?.percentiles?.p75) / 1000, // ms → seconds
    };
}

function computeScore(metrics: { lcp: number; inp: number; cls: number; fcp: number; ttfb: number }): number {
    let score = 100;
    // LCP scoring
    if (metrics.lcp >= 4.0) score -= 30; else if (metrics.lcp >= 2.5) score -= 15;
    // FCP scoring
    if (metrics.fcp >= 3.0) score -= 20; else if (metrics.fcp >= 1.8) score -= 10;
    // CLS scoring
    if (metrics.cls >= 0.25) score -= 20; else if (metrics.cls >= 0.1) score -= 10;
    // TTFB scoring
    if (metrics.ttfb >= 1.8) score -= 15; else if (metrics.ttfb >= 0.8) score -= 7;
    // INP scoring
    if (metrics.inp >= 500) score -= 15; else if (metrics.inp >= 200) score -= 8;
    return Math.max(0, Math.min(100, score));
}

// ─── Route handler ───

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const siteUrl = searchParams.get('siteUrl') || 'https://trafficclaw.com';
    // Normalize to origin (remove trailing paths)
    let origin: string;
    try {
        const u = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
        origin = u.origin;
    } catch {
        origin = `https://${siteUrl.replace(/^sc-domain:/, '')}`;
    }

    try {
        if (!CRUX_API_KEY) {
            return NextResponse.json(
                { error: 'Performance data unavailable', code: 'CRUX_UNAVAILABLE' },
                { status: 503 }
            );
        }

        const [overall, desktop, mobile, tablet] = await Promise.all([
            fetchCrUX(origin),
            fetchCrUX(origin, 'DESKTOP'),
            fetchCrUX(origin, 'PHONE'),
            fetchCrUX(origin, 'TABLET'),
        ]);

        if (!overall) {
            return NextResponse.json(
                { error: 'Performance data unavailable', code: 'CRUX_UNAVAILABLE' },
                { status: 503 }
            );
        }

        const metrics = extractCrUXMetrics(overall);
        const score = computeScore(metrics);

        const overview: OverviewMetrics = {
            lcp: { value: +metrics.lcp.toFixed(2), rating: rateLCP(metrics.lcp) },
            inp: { value: metrics.inp, rating: metrics.inp > 0 ? rateINP(metrics.inp) : 'good' },
            cls: { value: +metrics.cls.toFixed(3), rating: rateCLS(metrics.cls) },
            fcp: { value: +metrics.fcp.toFixed(2), rating: rateFCP(metrics.fcp) },
            ttfb: { value: +metrics.ttfb.toFixed(2), rating: rateTTFB(metrics.ttfb) },
        };

        const byDevice: DeviceMetrics[] = [];
        for (const [label, data] of [['Desktop', desktop], ['Mobile', mobile], ['Tablet', tablet]] as const) {
            if (data) {
                const dm = extractCrUXMetrics(data);
                byDevice.push({
                    device: label,
                    lcp: +dm.lcp.toFixed(2),
                    inp: dm.inp,
                    cls: +dm.cls.toFixed(3),
                    fcp: +dm.fcp.toFixed(2),
                    ttfb: +dm.ttfb.toFixed(2),
                    score: computeScore(dm),
                });
            }
        }

        return NextResponse.json({
            overview,
            trend: [],
            byPage: [],
            byDevice,
            score,
            source: 'crux',
            origin,
            collectionPeriod: overall.record?.collectionPeriod,
        });
    } catch (err: unknown) {
        const error = err as Error;
        console.error('Performance API error:', error.message);
        return NextResponse.json(
            { error: 'Performance data unavailable', code: 'CRUX_UNAVAILABLE' },
            { status: 503 }
        );
    }
}
