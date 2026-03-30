import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb, fetchFunnelData, runGAReport } from '@/lib/googleApi';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

// ─── Mock data (fallback) ───

function generateMockData() {
    return {
        funnels: [
            {
                id: 1,
                name: 'Sign-Up Funnel',
                description: 'Tracks visitors from homepage to dashboard onboarding',
                steps: [
                    { name: 'Homepage', count: 1000, percentOfTotal: 100, dropFromPrevious: 0 },
                    { name: 'Pricing Page', count: 400, percentOfTotal: 40, dropFromPrevious: 60 },
                    { name: 'Sign Up Page', count: 120, percentOfTotal: 12, dropFromPrevious: 70 },
                    { name: 'Dashboard', count: 80, percentOfTotal: 8, dropFromPrevious: 33.3 },
                ],
                overallRate: 8,
                biggestDrop: { from: 'Pricing Page', to: 'Sign Up Page', rate: 70 },
                totalEntries: 1000,
                completions: 80,
                avgTimeToComplete: '4m 32s',
            },
            {
                id: 2,
                name: 'Content Funnel',
                description: 'Blog engagement through to newsletter signup and social sharing',
                steps: [
                    { name: 'Blog Post', count: 500, percentOfTotal: 100, dropFromPrevious: 0 },
                    { name: 'Related Posts', count: 200, percentOfTotal: 40, dropFromPrevious: 60 },
                    { name: 'Newsletter', count: 80, percentOfTotal: 16, dropFromPrevious: 60 },
                    { name: 'Social Share', count: 25, percentOfTotal: 5, dropFromPrevious: 68.75 },
                ],
                overallRate: 5,
                biggestDrop: { from: 'Social Share', to: 'Newsletter', rate: 68.75 },
                totalEntries: 500,
                completions: 25,
                avgTimeToComplete: '8m 15s',
            },
            {
                id: 3,
                name: 'E-commerce Funnel',
                description: 'Product browse through to purchase completion',
                steps: [
                    { name: 'Product Page', count: 2400, percentOfTotal: 100, dropFromPrevious: 0 },
                    { name: 'Add to Cart', count: 720, percentOfTotal: 30, dropFromPrevious: 70 },
                    { name: 'Checkout', count: 288, percentOfTotal: 12, dropFromPrevious: 60 },
                    { name: 'Payment', count: 180, percentOfTotal: 7.5, dropFromPrevious: 37.5 },
                    { name: 'Confirmation', count: 156, percentOfTotal: 6.5, dropFromPrevious: 13.3 },
                ],
                overallRate: 6.5,
                biggestDrop: { from: 'Product Page', to: 'Add to Cart', rate: 70 },
                totalEntries: 2400,
                completions: 156,
                avgTimeToComplete: '12m 48s',
            },
        ],
    };
}

// ─── Route Handler ───

export async function GET(req: Request) {
    const [session, jwt] = await Promise.all([
        getServerSession(authOptions),
        getToken({ req: req as any }) as Promise<any>,
    ]);

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') || '';
    const isProduction = !!ADMIN_API_KEY;

    if (isProduction) {
        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
        let googleAccess = jwt?.googleAccessToken as string | undefined;
        let googleRefresh = jwt?.googleRefreshToken as string | undefined;

        if (!googleAccess && !googleRefresh) {
            const dbTokens = await fetchGoogleTokensFromDb(userId);
            if (dbTokens) {
                googleAccess = dbTokens.accessToken;
                googleRefresh = dbTokens.refreshToken;
            }
        }

        if (!googleAccess && !googleRefresh) {
            return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
        }

        let token: string;
        try {
            token = await getValidAccessToken(googleAccess, googleRefresh);
        } catch {
            return NextResponse.json({ error: 'Google authentication failed. Please re-sign in.' }, { status: 401 });
        }

        const stepsParam = searchParams.get('steps');
        const range = searchParams.get('range') || '30d';

        // If no steps specified, auto-detect top pages from GA4
        let steps: string[];
        if (stepsParam) {
            steps = stepsParam.split(',');
        } else {
            try {
                const topPagesReport = await runGAReport(
                    token, propertyId,
                    ['pagePath'], ['sessions'],
                    '28daysAgo', 'today', 10, 'sessions'
                );
                const topPaths = (topPagesReport?.rows || [])
                    .map((r: any) => r.dimensionValues[0].value)
                    .filter((p: string) => p && p !== '/' && p !== '(not set)')
                    .slice(0, 4);
                steps = ['/', ...topPaths.slice(0, 3)];
            } catch {
                steps = ['/', '/pricing', '/signup', '/dashboard'];
            }
        }

        try {
            const funnelSteps = await fetchFunnelData(token, propertyId, steps, range);

            // Find biggest drop-off
            let biggestDropIdx = 0;
            let biggestDropRate = 0;
            for (let i = 1; i < funnelSteps.length; i++) {
                if (funnelSteps[i].dropOff > biggestDropRate) {
                    biggestDropRate = funnelSteps[i].dropOff;
                    biggestDropIdx = i;
                }
            }

            const firstVisitors = funnelSteps[0]?.visitors || 1;
            const lastVisitors = funnelSteps[funnelSteps.length - 1]?.visitors || 0;

            const funnel = {
                id: 1,
                name: 'Sign-Up Funnel',
                description: 'Custom funnel based on page sequence',
                steps: funnelSteps.map((s) => ({
                    name: s.name,
                    count: s.visitors,
                    percentOfTotal: s.percentage,
                    dropFromPrevious: s.dropOff,
                })),
                overallRate: Math.round((lastVisitors / firstVisitors) * 100),
                biggestDrop: funnelSteps.length > 1
                    ? {
                        from: funnelSteps[biggestDropIdx - 1]?.name || funnelSteps[0].name,
                        to: funnelSteps[biggestDropIdx]?.name || '',
                        rate: biggestDropRate,
                    }
                    : { from: '', to: '', rate: 0 },
                totalEntries: firstVisitors,
                completions: lastVisitors,
                avgTimeToComplete: 'N/A',
            };

            return NextResponse.json({ funnels: [funnel] });
        } catch (e) {
            console.error('Funnels API error:', e);
            return NextResponse.json(generateMockData());
        }
    }

    // Dev mode: return mock data
    return NextResponse.json(generateMockData());
}
