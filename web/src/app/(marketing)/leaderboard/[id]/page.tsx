import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import StartupProfileClient, { type StartupProfileData } from './StartupProfileClient';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SITE_URL = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');

async function fetchEntry(id: string): Promise<StartupProfileData | null> {
    if (!/^\d+$/.test(id)) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${id}/detail`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            // Re-render at most every 5 minutes so OG tags stay fresh.
            next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        return (await res.json()) as StartupProfileData;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const entry = await fetchEntry(id);
    if (!entry) {
        return { title: 'Startup not found · TrafficClaw Leaderboard' };
    }
    const visitors = entry.monthly_visitors.toLocaleString();
    const title = `${entry.startup_name} — ${visitors} verified monthly visitors · TrafficClaw`;
    const description = entry.description
        ? entry.description
        : `${entry.startup_name} on the TrafficClaw verified traffic leaderboard. ${visitors} monthly visitors confirmed via Google Analytics.`;
    const canonical = `${SITE_URL}/leaderboard/${entry.id}`;
    return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            url: canonical,
            siteName: 'TrafficClaw',
            type: 'profile',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    };
}

export default async function StartupProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const entry = await fetchEntry(id);
    if (!entry) {
        notFound();
    }

    const profileUrl = `${SITE_URL}/leaderboard/${entry.id}`;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${entry.startup_name} on TrafficClaw`,
        url: profileUrl,
        breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Leaderboard', item: `${SITE_URL}/leaderboard` },
                { '@type': 'ListItem', position: 2, name: entry.startup_name, item: profileUrl },
            ],
        },
        mainEntity: {
            '@type': 'Organization',
            name: entry.startup_name,
            description: entry.description || undefined,
            url: entry.website_url || undefined,
            logo: entry.logo_url || undefined,
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <StartupProfileClient entry={entry} profileUrl={profileUrl} />
        </>
    );
}
