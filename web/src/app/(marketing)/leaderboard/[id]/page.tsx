import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import StartupProfileClient, { type StartupProfileData } from './StartupProfileClient';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SITE_URL = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');

// Allow `[a-z0-9-]` slugs (e.g. "antigravity-codes-a3f9b2") and pure numeric
// ids (legacy `/leaderboard/4`). Anything else is rejected before we hit the
// admin API to keep the cache + analytics surface clean.
const SLUG_OR_ID_RE = /^[a-z0-9-]{1,150}$/;

async function fetchEntry(idOrSlug: string): Promise<StartupProfileData | null> {
    if (!SLUG_OR_ID_RE.test(idOrSlug)) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${encodeURIComponent(idOrSlug)}/detail`, {
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
    // Canonical always uses the slug when present so legacy `/leaderboard/4`
    // hits don't compete with the slug URL in Google's index.
    const canonical = `${SITE_URL}/leaderboard/${entry.slug || entry.id}`;
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

    const profileUrl = `${SITE_URL}/leaderboard/${entry.slug || entry.id}`;
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
