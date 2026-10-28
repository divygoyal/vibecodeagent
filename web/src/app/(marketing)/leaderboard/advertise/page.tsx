import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Megaphone, SearchX } from 'lucide-react';

import { BRAND_NAME } from '@/lib/brand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { PctDelta } from '@/components/leaderboard/shared';
import { billingPeriodSuffix, formatAvailability, formatCents, type AdSlot } from '@/lib/adSlots';
import { fmtCompact, fmtFull } from '@/lib/format';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { jsonLdString } from '@/lib/leaderboard/jsonld';
import { CATEGORIES, CATEGORY_LABELS, SITE_ORIGIN } from '@/lib/leaderboard/constants';
import { AdvertiseFilters } from './AdvertiseFilters';

export const dynamic = 'force-dynamic';

const TITLE = `Sponsor verified sites: ad slots at publisher-set prices | ${BRAND_NAME}`;
const DESCRIPTION = 'Every ad slot listed on the verified traffic leaderboard. Verified owners, prices set by the publisher: no bidding, no CPM, no algorithm.';

export const metadata: Metadata = {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_ORIGIN}/leaderboard/advertise` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_ORIGIN}/leaderboard/advertise`, siteName: BRAND_NAME, type: 'website' },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

interface InventoryEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    category: string | null;
    /** Exact number, or null when the owner shows a range or nothing. */
    monthly_visitors: number | null;
    monthly_visitors_label: string | null;
    visitor_trend: number | null;
    topic_labels: string[];
}
interface InventoryItem extends AdSlot { entry: InventoryEntry }
interface Inventory { slots: InventoryItem[]; total: number; sites: number }

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AdvertisePage({ searchParams }: { searchParams: SearchParams }) {
    const sp = await searchParams;
    const category = first(sp.category);
    const period = first(sp.period);
    const sort = first(sp.sort);
    const res = await lbAdmin<Inventory>('/api/sponsor-inventory', {
        query: { category: category || undefined, period: period || undefined, sort: ['price_asc', 'price_desc', 'newest'].includes(sort) ? sort : undefined },
        revalidate: 120,
    });
    const inv: Inventory = res.data ?? { slots: [], total: 0, sites: 0 };
    const filtered = Boolean(category || period);

    return (
        <main className="mx-auto w-full max-w-[1100px] px-4 pb-24 pt-10 sm:px-6 md:pt-14">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: jsonLdString({
                        '@context': 'https://schema.org',
                        '@type': 'ItemList',
                        name: `Ad slots on verified sites | ${BRAND_NAME}`,
                        numberOfItems: inv.slots.length,
                        itemListElement: inv.slots.map((s, i) => ({
                            '@type': 'ListItem', position: i + 1, name: `${s.name} on ${s.entry.startup_name}`,
                            url: `${SITE_ORIGIN}/leaderboard/${s.entry.slug || s.entry.id}#sponsor`,
                        })),
                    }),
                }}
            />
            <header>
                <Badge variant="sponsored">Advertise</Badge>
                <h1 className="mt-3 text-heading-lg text-fg md:text-display-sm">Sponsor verified sites</h1>
                <p className="mt-2 max-w-[640px] text-body-lg text-fg-secondary">
                    Every ad slot listed on the leaderboard. Owners are verified in Search Console, prices are the publisher&apos;s own, and you arrange the rest directly with them.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary" size="lg"><Link href="/leaderboard">Browse the leaderboard</Link></Button>
                    <Button asChild variant="ghost" size="lg"><Link href="/dashboard/leaderboard">Sell slots on your site</Link></Button>
                </div>
            </header>

            <div className="mt-8 grid gap-3 grid-cols-1 sm:grid-cols-3">
                {[
                    ['1. Pick a slot', 'Header banner, newsletter mention, footer logo: whatever the publisher sells.'],
                    ['2. Send a request', 'The price is snapshotted when you ask, so it cannot change under you.'],
                    ['3. Agree directly', 'The owner replies by email. TrafficClaw only makes the introduction.'],
                ].map(([t, d]) => (
                    <Card key={t} padding="sm"><p className="text-title-sm text-fg">{t}</p><p className="mt-1 text-body-sm text-fg-secondary">{d}</p></Card>
                ))}
            </div>

            <div className="mt-8">
                <Suspense fallback={null}>
                    <AdvertiseFilters categories={[...CATEGORIES]}>
                        <p className="mb-3 text-body-sm text-fg-muted">{fmtFull(inv.total)} slot{inv.total === 1 ? '' : 's'} on {fmtFull(inv.sites)} site{inv.sites === 1 ? '' : 's'}</p>
                        {inv.slots.length === 0 ? (
                            <Card padding="none">
                                <EmptyState
                                    icon={filtered ? SearchX : Megaphone}
                                    title={filtered ? 'No slots match' : 'No ad slots yet'}
                                    description={filtered ? 'Try another category or billing period.' : 'Publishers add slots from their leaderboard settings.'}
                                    actions={filtered ? <Button asChild variant="secondary"><Link href="/leaderboard/advertise">Clear filters</Link></Button> : undefined}
                                />
                            </Card>
                        ) : (
                            <ul className="grid gap-3">
                                {inv.slots.map((s) => {
                                    const host = (s.entry.website_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                                    const visitors = s.entry.monthly_visitors !== null ? fmtCompact(s.entry.monthly_visitors) : s.entry.monthly_visitors_label;
                                    return (
                                        <li key={s.id}>
                                            <Card padding="sm" interactive className="relative flex flex-wrap items-center gap-x-5 gap-y-3 sm:flex-nowrap">
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <Favicon host={host || s.entry.startup_name} size={32} />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-body font-semibold text-fg">{s.name}</p>
                                                        <p className="truncate text-body-sm text-fg-muted">
                                                            <Link href={`/leaderboard/${s.entry.slug || s.entry.id}?slot=${s.id}#offers`} className="text-fg-secondary after:absolute after:inset-0 hover:underline">{s.entry.startup_name}</Link>
                                                            {s.entry.category ? ` · ${CATEGORY_LABELS[s.entry.category] ?? s.entry.category}` : ''}
                                                        </p>
                                                        {s.preview_note ? <p className="mt-0.5 line-clamp-1 text-meta text-fg-muted">{s.preview_note}</p> : null}
                                                    </div>
                                                </div>
                                                <div className="w-28 text-right">
                                                    {visitors ? (
                                                        <>
                                                            <p className="text-body font-semibold tabular-nums text-fg">{visitors}</p>
                                                            <p className="text-meta text-fg-muted">visitors / mo {s.entry.visitor_trend !== null ? <PctDelta pct={s.entry.visitor_trend} /> : null}</p>
                                                        </>
                                                    ) : <p className="text-meta text-fg-muted">Traffic not shared</p>}
                                                </div>
                                                <div className="w-32 text-right">
                                                    <p className="text-stat-sm tabular-nums text-fg">{formatCents(s.price_cents)}</p>
                                                    <p className="text-meta text-fg-muted">{billingPeriodSuffix(s.billing_period)} · {formatAvailability(s)}</p>
                                                </div>
                                            </Card>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </AdvertiseFilters>
                </Suspense>
            </div>
        </main>
    );
}
