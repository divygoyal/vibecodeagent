import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = {
        overview: {
            avgPathLength: 2.3,
            avgTimeOnSite: 192, // seconds
            bounceRate: 42,
            mostCommonPath: '/ \u2192 /pricing \u2192 EXIT',
        },
        journeys: [
            {
                id: 1,
                steps: ['/', '/pricing', '/signup', 'EXIT'],
                users: 450,
                percentage: 18,
                avgDuration: 260,
            },
            {
                id: 2,
                steps: ['/', 'EXIT'],
                users: 380,
                percentage: 15.2,
                avgDuration: 30,
            },
            {
                id: 3,
                steps: ['/blog/seo-tips', '/blog/analytics-guide', 'EXIT'],
                users: 320,
                percentage: 12.8,
                avgDuration: 285,
            },
            {
                id: 4,
                steps: ['/docs/getting-started', '/docs/api-reference', '/docs/examples', 'EXIT'],
                users: 275,
                percentage: 11,
                avgDuration: 420,
            },
            {
                id: 5,
                steps: ['/', '/features', '/pricing', '/signup', 'EXIT'],
                users: 210,
                percentage: 8.4,
                avgDuration: 340,
            },
            {
                id: 6,
                steps: ['/pricing', '/signup', 'EXIT'],
                users: 180,
                percentage: 7.2,
                avgDuration: 195,
            },
            {
                id: 7,
                steps: ['/blog/keyword-research', '/pricing', 'EXIT'],
                users: 145,
                percentage: 5.8,
                avgDuration: 240,
            },
            {
                id: 8,
                steps: ['/', '/docs/getting-started', '/docs/api-reference', 'EXIT'],
                users: 120,
                percentage: 4.8,
                avgDuration: 380,
            },
        ],
        landingPages: [
            { page: '/', entries: 1125, percentage: 45, avgPagesAfter: 2.3 },
            { page: '/blog/*', entries: 625, percentage: 25, avgPagesAfter: 1.5 },
            { page: '/docs/*', entries: 375, percentage: 15, avgPagesAfter: 3.1 },
            { page: '/pricing', entries: 250, percentage: 10, avgPagesAfter: 1.8 },
            { page: 'Other', entries: 125, percentage: 5, avgPagesAfter: 1.2 },
        ],
        exitPages: [
            { page: '/signup', exits: 875, percentage: 35, avgSessionDuration: 260 },
            { page: '/pricing', exits: 625, percentage: 25, avgSessionDuration: 130 },
            { page: '/', exits: 500, percentage: 20, avgSessionDuration: 30 },
            { page: '/blog/*', exits: 375, percentage: 15, avgSessionDuration: 225 },
            { page: '/docs/*', exits: 125, percentage: 5, avgSessionDuration: 360 },
        ],
    };

    return NextResponse.json(data);
}
