import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { BRAND_NAME } from '@/lib/brand';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Favicon } from '@/components/ui/Favicon';
import { VerificationBadge, VerifiedMark } from '@/components/leaderboard/shared';
import { CATEGORY_LABELS } from '@/lib/leaderboard/constants';
import { EmbedCard, LiveNow, OfferSection, ProfileCharts, RangeSwitch, ShareButton } from '@/components/leaderboard/ProfileClient';
import { AboutCard, Breakdowns, GrowthCard, KpiGrid, OpenToLine, SimilarCard, SiteLine, SlotsCard } from '@/components/leaderboard/ProfileSections';
import { DEFAULT_RANGE, SITE_ORIGIN } from '@/lib/leaderboard/constants';
import { fmtDay } from '@/lib/format';
import { freshness, metricText } from '@/lib/leaderboard/format';
import { getProfile, parseRange } from '@/lib/leaderboard/server';
import { jsonLdString } from '@/lib/leaderboard/jsonld';
import { canonicalRedirect } from '@/lib/leaderboard/canonical';
import { badgeEligible } from '@/lib/leaderboard/trafficBadge';

// Server rendered per request; the data fetch is cached 60 s.
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
    const { id } = await params;
    const sp = await searchParams;
    const p = await getProfile(id, parseRange(sp.range));
    if (!p) return { title: 'Site not found', robots: { index: false, follow: false } };

    const visitors = metricText(p.kpis?.visitors);
    const title = visitors
        ? `${p.name}: ${visitors} visitors a month | ${BRAND_NAME}`
        : `${p.name} on the ${BRAND_NAME} verified traffic leaderboard`;
    const description = p.description
        || `${p.name} on the ${BRAND_NAME} verified traffic leaderboard.${visitors ? ` ${visitors} visitors in the last 28 days (Google Analytics). Owner verified in Google Search Console.` : ''}`;
    // Relative: resolved against metadataBase (the brand's site URL), like every other page's canonical.
    const canonical = `/leaderboard/${p.slug || p.id}`;
    const indexable = p.status === 'ranked' && !sp.range;
    return {
        // The page title gets "| TrafficClaw" from the root template only when it does not already name it.
        title: { absolute: title.includes(BRAND_NAME) ? title : `${title} | ${BRAND_NAME}` },
        description,
        alternates: { canonical },
        robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
        openGraph: { title, description, url: canonical, siteName: BRAND_NAME, type: 'profile' },
        twitter: { card: 'summary_large_image', title, description },
    };
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
    const { id } = await params;
    const sp = await searchParams;
    const range = parseRange(sp.range);
    const p = await getProfile(id, range);
    if (!p) notFound();

    // An id (or any other spelling the admin API resolves) goes to the canonical slug. Unknown
    // or retired slugs never resolve, so they fall through to notFound() above.
    const canonical = canonicalRedirect(id, p);
    if (canonical) {
        // Temporary redirect: the slug itself can change again.
        redirect(`/leaderboard/${canonical}${range !== DEFAULT_RANGE ? `?range=${encodeURIComponent(range)}` : ''}`);
    }

    const slug = p.slug || String(p.id);
    const profileUrl = `${SITE_ORIGIN}/leaderboard/${slug}`;
    const host = (p.website_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const pending = p.status === 'pending';
    const updated = freshness(p.updated_at);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${p.name} on ${BRAND_NAME}`,
        url: profileUrl,
        breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Leaderboard', item: `${SITE_ORIGIN}/leaderboard` },
                { '@type': 'ListItem', position: 2, name: p.name, item: profileUrl },
            ],
        },
        mainEntity: { '@type': 'Organization', name: p.name, description: p.description || undefined, url: p.website_url || undefined, logo: p.logo_url || undefined },
    };

    const g = p.growth;
    const categoryName = p.category ? CATEGORY_LABELS[p.category] ?? p.category : null;
    const metaLine: string[] = [];
    if (g?.rank_overall) metaLine.push(`#${g.rank_overall} overall`);
    if (g?.rank_category && categoryName) metaLine.push(`#${g.rank_category} in ${categoryName}`);
    else if (categoryName) metaLine.push(categoryName);

    return (
        <main className="mx-auto w-full max-w-[1100px] px-4 pb-24 pt-8 sm:px-6">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-body-sm text-fg-muted">
                    <Link href="/leaderboard" className="hover:text-fg hover:underline">Leaderboard</Link>
                    <span aria-hidden>/</span>
                    <span className="truncate text-fg-secondary">{p.name}</span>
                </nav>
                <div className="flex items-center gap-2">
                    {!pending ? <ShareButton url={profileUrl} title={`${p.name} on the ${BRAND_NAME} verified traffic leaderboard`} ogPath={`/leaderboard/${slug}/opengraph-image`} /> : null}
                    {p.website_url ? (
<Button asChild variant="secondary" size="md" trailingIcon={<ExternalLink aria-hidden size={16} strokeWidth={1.75} />}>
                            <a href={p.website_url} target="_blank" rel="noopener noreferrer">Visit site</a>
                        </Button>
                    ) : null}
                </div>
            </div>

            {pending ? (
                <div className="mt-4">
                    <Banner variant="warn" title="Pending verification">
                        This site is listed but its owner has not been verified in Google Search Console yet, so no numbers are shown and it is not ranked.
                    </Banner>
                </div>
            ) : null}

            <Card className="mt-4" padding="lg">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <Favicon host={host || p.name} size={64} />
                    <div className="min-w-0 flex-1">
                        {/* Round 5: the name with a verified mark; category and ranks as one muted line, not pills. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                            <h1 className="text-heading-lg text-fg">{p.name}</h1>
                            {pending ? <VerificationBadge v={p.verification} /> : <VerifiedMark v={p.verification} size={22} />}
                            {p.live.enabled ? <LiveNow entryId={p.id} className="ml-1" /> : null}
                        </div>
                        {metaLine.length ? <p className="mt-1 text-body text-fg-muted">{metaLine.join(' · ')}</p> : null}
                        {p.description ? <p className="mt-2 max-w-[680px] text-body-lg text-fg-secondary">{p.description}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                            <SiteLine p={p} />
                            <OpenToLine p={p} />
                        </div>
                    </div>
                </div>
            </Card>

            {!pending ? (
                <>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-body-sm text-fg-muted">Last {range === '3m' ? '3 months' : range === '7d' ? '7 days' : '28 days'} versus the period before</p>
                        <RangeSwitch range={range} />
                    </div>

                    <div className="mt-3"><KpiGrid p={p} /></div>

                    {p.series ? <div className="mt-4"><ProfileCharts series={p.series} range={range} name={p.name} /></div> : null}

                    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fg-muted">
                        <ShieldCheck aria-hidden size={14} strokeWidth={1.75} className="text-brand-text" />
                        <span className="text-fg-secondary">{p.verification.label}</span>
                        {p.verification.ga4_connected && p.verification.level === 'owner' ? <span>· GA4 data stream matches {host}</span> : null}
                        {p.verification.checked_at ? <span>· checked {fmtDay(p.verification.checked_at.slice(0, 10))}</span> : null}
                        {updated.text ? <span>· numbers {updated.text.charAt(0).toLowerCase() + updated.text.slice(1)}</span> : null}
                    </p>

                    <div className="mt-6 flex flex-col gap-4">
                        <Breakdowns p={p} />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <GrowthCard p={p} />
                            <AboutCard p={p} />
                        </div>
                        <SlotsCard p={p} />
                        <OfferSection idOrSlug={slug} siteName={p.name} openTo={p.open_to} slots={p.ad_slots} initialSlotId={Number(Array.isArray(sp.slot) ? sp.slot[0] : sp.slot) || null} />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                            <EmbedCard origin={SITE_ORIGIN} slug={slug} id={p.id} name={p.name} liveEnabled={p.live.enabled} trafficBadge={badgeEligible(p)} />
                            <SimilarCard p={p} />
                        </div>
                    </div>
                </>
            ) : null}

            <section className="mt-12 flex flex-col items-start gap-3 rounded-card border border-border-subtle bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between md:p-8">
                <div>
                    <h2 className="text-title text-fg">Get your own verified profile</h2>
                    <p className="mt-1 text-body text-fg-secondary">Free. You choose which numbers are public.</p>
                </div>
                <Button asChild variant="primary" size="lg"><Link href="/leaderboard/join">Add your site, free</Link></Button>
            </section>
        </main>
    );
}
