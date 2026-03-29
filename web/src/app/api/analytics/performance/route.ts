import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

interface TrendPoint {
    date: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
}

interface PageMetrics {
    page: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
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

interface PerformanceData {
    overview: OverviewMetrics;
    trend: TrendPoint[];
    byPage: PageMetrics[];
    byDevice: DeviceMetrics[];
    score: number;
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

// ─── Mock data generators ───

function jitter(base: number, range: number): number {
    return +(base + (Math.random() - 0.5) * range).toFixed(3);
}

function generateOverview(): OverviewMetrics {
    const lcp = 2.1;
    const inp = 120;
    const cls = 0.05;
    const fcp = 1.2;
    const ttfb = 0.8;
    return {
        lcp: { value: lcp, rating: rateLCP(lcp) },
        inp: { value: inp, rating: rateINP(inp) },
        cls: { value: cls, rating: rateCLS(cls) },
        fcp: { value: fcp, rating: rateFCP(fcp) },
        ttfb: { value: ttfb, rating: rateTTFB(ttfb) },
    };
}

function generateTrend(): TrendPoint[] {
    const points: TrendPoint[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        points.push({
            date: d.toISOString().split('T')[0],
            lcp: jitter(2.1, 0.8),
            inp: Math.round(jitter(120, 60)),
            cls: +jitter(0.05, 0.04).toFixed(3),
            fcp: jitter(1.2, 0.5),
            ttfb: jitter(0.8, 0.3),
        });
    }
    return points;
}

function generateByPage(): PageMetrics[] {
    return [
        { page: '/', lcp: 1.8, inp: 95, cls: 0.03, fcp: 0.9, ttfb: 0.6, score: 92 },
        { page: '/pricing', lcp: 2.5, inp: 180, cls: 0.08, fcp: 1.4, ttfb: 0.9, score: 74 },
        { page: '/blog', lcp: 1.5, inp: 85, cls: 0.02, fcp: 0.8, ttfb: 0.5, score: 96 },
        { page: '/docs/getting-started', lcp: 2.0, inp: 110, cls: 0.04, fcp: 1.1, ttfb: 0.7, score: 88 },
        { page: '/features', lcp: 2.3, inp: 150, cls: 0.06, fcp: 1.3, ttfb: 0.85, score: 79 },
        { page: '/dashboard', lcp: 2.8, inp: 210, cls: 0.12, fcp: 1.6, ttfb: 1.1, score: 65 },
        { page: '/blog/seo-automation', lcp: 1.6, inp: 90, cls: 0.03, fcp: 0.85, ttfb: 0.55, score: 94 },
        { page: '/contact', lcp: 1.9, inp: 100, cls: 0.04, fcp: 1.0, ttfb: 0.65, score: 90 },
    ];
}

function generateByDevice(): DeviceMetrics[] {
    return [
        { device: 'Desktop', lcp: 1.9, inp: 80, cls: 0.03, fcp: 1.0, ttfb: 0.6, score: 91 },
        { device: 'Mobile', lcp: 2.8, inp: 190, cls: 0.08, fcp: 1.5, ttfb: 1.0, score: 72 },
        { device: 'Tablet', lcp: 2.2, inp: 130, cls: 0.05, fcp: 1.2, ttfb: 0.8, score: 83 },
    ];
}

function calculateOverallScore(): number {
    return 84;
}

// ─── Route handler ───

export async function GET(_req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const data: PerformanceData = {
            overview: generateOverview(),
            trend: generateTrend(),
            byPage: generateByPage(),
            byDevice: generateByDevice(),
            score: calculateOverallScore(),
        };

        return NextResponse.json(data);
    } catch (err: unknown) {
        const error = err as Error;
        console.error('Performance API error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch performance data' }, { status: 500 });
    }
}
