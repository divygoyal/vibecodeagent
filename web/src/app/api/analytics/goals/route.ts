import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function generateTrend(base: number, variance: number, days = 30) {
    const trend = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayOfWeek = d.getDay();
        const weekendDip = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
        const value = Math.max(0, Math.round((base + (Math.random() - 0.4) * variance) * weekendDip));
        trend.push({
            date: d.toISOString().split('T')[0],
            value,
        });
    }
    return trend;
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const goals = [
        {
            id: 1,
            name: 'Sign Ups',
            type: 'page_visit',
            target: '/signup',
            description: 'Users who complete the signup form',
            conversions: 45,
            rate: 3.2,
            change: 12,
            color: '#34d399',
            trend: generateTrend(45, 20),
        },
        {
            id: 2,
            name: 'Pricing Page Views',
            type: 'page_visit',
            target: '/pricing',
            description: 'Users who view the pricing page',
            conversions: 120,
            rate: 8.5,
            change: -5,
            color: '#3b82f6',
            trend: generateTrend(120, 40),
        },
        {
            id: 3,
            name: 'Contact Form',
            type: 'event',
            target: 'contact_submit',
            description: 'Users who submit the contact form',
            conversions: 8,
            rate: 0.6,
            change: 20,
            color: '#a78bfa',
            trend: generateTrend(8, 5),
        },
        {
            id: 4,
            name: 'Blog Engagement',
            type: 'scroll_depth',
            target: '/blog/*',
            description: 'Users who scroll 75%+ on blog posts',
            conversions: 234,
            rate: 15.2,
            change: 3,
            color: '#f472b6',
            trend: generateTrend(234, 60),
        },
    ];

    const bySource = [
        { source: 'Google / Organic', conversions: 245, percentage: 60.1, color: '#34d399' },
        { source: 'Direct', conversions: 102, percentage: 25.0, color: '#3b82f6' },
        { source: 'Social', conversions: 38, percentage: 9.3, color: '#a78bfa' },
        { source: 'Referral', conversions: 15, percentage: 3.7, color: '#f472b6' },
        { source: 'Email', conversions: 7, percentage: 1.9, color: '#fbbf24' },
    ];

    const topPages = [
        { page: '/pricing', title: 'Pricing Plans', conversions: 120, rate: 8.5 },
        { page: '/signup', title: 'Create Account', conversions: 45, rate: 3.2 },
        { page: '/blog/seo-tips-2026', title: '10 SEO Tips for 2026', conversions: 30, rate: 12.1 },
        { page: '/docs/getting-started', title: 'Getting Started Guide', conversions: 25, rate: 5.8 },
        { page: '/features', title: 'Features Overview', conversions: 22, rate: 4.2 },
        { page: '/blog/keyword-research', title: 'Keyword Research Guide', conversions: 18, rate: 9.4 },
        { page: '/contact', title: 'Contact Us', conversions: 8, rate: 0.6 },
        { page: '/case-studies', title: 'Case Studies', conversions: 6, rate: 2.1 },
    ];

    return NextResponse.json({
        goals,
        bySource,
        topPages,
        totalConversions: goals.reduce((sum, g) => sum + g.conversions, 0),
        totalSessions: 1412,
    });
}
