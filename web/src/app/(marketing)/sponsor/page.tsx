import type { Metadata } from 'next';
import SponsorIndexClient, { type SponsorInventoryResponse } from './SponsorIndexClient';
import { BRAND_NAME } from '@/lib/brand';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SITE_URL = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');

const EMPTY: SponsorInventoryResponse = { slots: [], total: 0, sites: 0 };

const TITLE = `Sponsor verified indie sites — ad slots at publisher-set prices | ${BRAND_NAME}`;
const DESCRIPTION =
    'Browse every ad slot listed on the verified traffic leaderboard. GA4-verified traffic on every site, prices set by the publisher — no bidding, no CPM, no algorithm.';

export const metadata: Metadata = {
    // Root layout appends "| BRAND" via its title template; this one already carries it.
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/sponsor` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${SITE_URL}/sponsor`,
        siteName: BRAND_NAME,
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
    },
};

async function fetchInventory(): Promise<SponsorInventoryResponse> {
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/sponsor-inventory`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            // Same freshness window as the profile pages.
            next: { revalidate: 300 },
        });
        if (!res.ok) return EMPTY;
        const data = (await res.json()) as Partial<SponsorInventoryResponse>;
        return {
            slots: Array.isArray(data.slots) ? data.slots : [],
            total: Number(data.total) || 0,
            sites: Number(data.sites) || 0,
        };
    } catch {
        return EMPTY;
    }
}

export default async function SponsorIndexPage() {
    const data = await fetchInventory();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Ad slots on verified indie sites — ${BRAND_NAME}`,
        description: DESCRIPTION,
        url: `${SITE_URL}/sponsor`,
        numberOfItems: data.slots.length,
        itemListElement: data.slots.map((slot, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: `${slot.name} on ${slot.entry.startup_name}`,
            url: `${SITE_URL}/leaderboard/${slot.entry.slug || slot.entry.id}#sponsor`,
        })),
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <SponsorIndexClient initial={data} />
        </>
    );
}
