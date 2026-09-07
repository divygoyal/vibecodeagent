import type { Metadata } from 'next';
import AdvertiseClient, { type AdvertiseSite } from './AdvertiseClient';
import { resolveSponsorshipPrice, type PublisherListingOverride } from '@/lib/sponsorshipPricing';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SITE_URL = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');

/**
 * `/advertise` — the buyer-side index and budget planner.
 *
 * This is a genuinely new page, not a second copy of anything: it is an index
 * of priced inventory with an interactive allocator, and there is deliberately
 * no per-site route under `/advertise/*`. Every site row links out to its
 * existing `/leaderboard/[id]` profile, which stays the one canonical page per
 * site, so no duplicate-content surface is created. This page therefore
 * canonicals to itself.
 *
 * Prices are computed server-side from data already on the entry, so the page
 * is fully rendered inventory on first paint and the client bundle only carries
 * the allocator.
 */

interface AdminEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    category: string | null;
    monthly_visitors: number;
    monthly_pageviews: number;
    engagement_rate: number;
    bounce_rate: number;
    avg_session_duration?: number;
    primary_country?: string | null;
    verification_status?: string;
    is_verified: boolean;
    sponsorship_listing?: PublisherListingOverride | null;
}

function bareHost(url: string | null): string | null {
    if (!url) return null;
    try {
        const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return new URL(withScheme).hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

async function fetchInventory(): Promise<AdvertiseSite[]> {
    if (!ADMIN_API_KEY) return [];
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard?page_size=100&sort=traffic`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            // Same 5-minute ISR window as the profile pages.
            next: { revalidate: 300 },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { entries?: AdminEntry[] };
        return (data.entries || [])
            .map((entry) => {
                const price = resolveSponsorshipPrice(entry, entry.sponsorship_listing ?? null);
                return {
                    entryId: entry.id,
                    name: entry.startup_name,
                    domain: bareHost(entry.website_url),
                    slug: entry.slug,
                    description: entry.description,
                    category: entry.category,
                    primaryCountry: entry.primary_country ?? null,
                    monthlyVisitors: entry.monthly_visitors || 0,
                    priceCents: price.listPriceCents,
                    estimatedImpressions: price.estimatedImpressions,
                    impliedCpm: Number(price.impliedCpm.toFixed(2)),
                    priceSource: price.priceSource,
                    acceptingRequests: price.acceptingRequests,
                    floorPriced: price.floorApplied,
                } satisfies AdvertiseSite;
            })
            // Drop anything with no sellable price. Sites are still on the
            // leaderboard; they are just not inventory.
            .filter((s) => s.priceCents > 0);
    } catch {
        return [];
    }
}

export const metadata: Metadata = {
    title: 'Advertise on verified indie sites — set a budget, get a plan · TrafficClaw',
    description:
        'Buy sponsorship placements on independent sites whose traffic is verified from their own Google Analytics. Enter a budget and get a proposed allocation across matching sites, with cost and estimated reach per site.',
    alternates: { canonical: `${SITE_URL}/advertise` },
    openGraph: {
        title: 'Advertise on verified indie sites · TrafficClaw',
        description:
            'Enter a budget, pick your targeting, and get a proposed sponsorship plan across sites with GA4-verified traffic.',
        url: `${SITE_URL}/advertise`,
        siteName: 'TrafficClaw',
        type: 'website',
    },
};

export default async function AdvertisePage() {
    const sites = await fetchInventory();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Advertise on verified indie sites',
        url: `${SITE_URL}/advertise`,
        description:
            'Sponsorship inventory on independent sites with traffic verified from their own Google Analytics.',
        breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'TrafficClaw', item: SITE_URL },
                { '@type': 'ListItem', position: 2, name: 'Advertise', item: `${SITE_URL}/advertise` },
            ],
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <AdvertiseClient sites={sites} />
        </>
    );
}
