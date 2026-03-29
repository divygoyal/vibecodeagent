import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const funnels = [
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
    ];

    return NextResponse.json({ funnels });
}
