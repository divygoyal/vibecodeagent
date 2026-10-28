'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { channelColor, deviceColor } from '@/lib/metrics';
import { fmtShare } from '@/components/charts/style';
import { Skeleton } from '@/components/ui/Skeleton';
import { BarList } from '@/components/charts/BarList';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { siteHref } from '@/components/shell/nav';
import { countryFromIso3 } from '../lib/geo';
import { displayPage, isAiSource, pageRef } from '../lib/rules';
import { deviceLabel } from '../lib/sources';
import type { Ga4BreakdownResponse, Ga4Row, Ga4Summary, GscRowsResponse } from '../lib/types';
import { PageRows } from '../pages/PageRows';
import { LoadError } from '../SiteStates';
import { PagePath } from '../PagePath';
import { pageLabel } from '../lib/pagePath';
import { FlagIcon, sourceParts } from '../SourceIcon';
import { useActiveFilters, useGa4, useGsc, useSite } from '../useSiteData';
import { useFilterClick } from '../filters/SiteFilters';
import { BrowserIcon, DeviceIcon, OsIcon } from '../TechIcon';
import { gscToAlpha2 } from '@/lib/builder/countries';
import { Ga4List, listMeta } from './Ga4List';
import { TabbedCard } from './TabbedCard';

/**
 * Rows in a side card (Sources, Devices, Search) so it is about as tall as the
 * Pages card next to it (8 rows of 40px vs 32px here); cards in a row stretch to
 * one height and "View all" sits at the bottom.
 */
const SIDE_ROWS = 9;

const channelRender = (r: Ga4Row) => ({
    label: r.dims.sessionDefaultChannelGroup || 'Unassigned',
    text: r.dims.sessionDefaultChannelGroup || 'Unassigned',
    icon: <span aria-hidden className="size-2 rounded-full" style={{ background: channelColor(r.dims.sessionDefaultChannelGroup) }} />,
});
const sourceRender = (r: Ga4Row) => sourceParts(r.dims.sessionSource);
const aiOnly = (r: Ga4Row) => isAiSource(r.dims.sessionSource);

/**
 * The AI tab's count: the summary's AI sessions, the same number as the "AI traffic" tile and footer (one source,
 * one definition: sessionSource matching AI_SOURCE_PATTERN over the page's window). Summing the tab's rows could
 * differ (rows cut at the report limit, rounding), so it is not used.
 */
function AiCount() {
    const q = useGa4<Ga4Summary>('summary');
    const n = q.data?.totals.ai ?? 0;
    return n > 0 ? <>{fmtFull(n)}</> : null;
}

/** Channels / Sources / AI assistants in one card (sessions), plus Revenue by source for sites with GA4 revenue. */
export function SourcesCard({ className }: { className?: string }) {
    // Same report (and SWR cache) as the Sources tab: no extra request.
    const referrers = useGa4<Ga4BreakdownResponse>('referrers');
    const money = Boolean(referrers.data?.rows.some((r) => (r.cur.totalRevenue ?? 0) > 0));
    return (
        <TabbedCard
            id="sources"
            title="Sources"
            className={className}
            tabs={[
                {
                    value: 'sources', label: 'Sources', meta: listMeta('sessions'),
                    content: <Ga4List report="referrers" dim="sessionSource" metric="sessions" filterKey="source" render={sourceRender} limit={SIDE_ROWS} fill labelHeader="Source" viewAllTitle="Sources" emptyTitle="No sessions in this period" />,
                },
                {
                    value: 'channels', label: 'Channels', meta: listMeta('sessions', true),
                    content: <Ga4List report="channels" dim="sessionDefaultChannelGroup" metric="sessions" filterKey="channel" render={channelRender} showShare limit={SIDE_ROWS} fill labelHeader="Channel" viewAllTitle="Channels" emptyTitle="No sessions in this period" />,
                },
                {
                    value: 'ai', label: 'AI', count: <AiCount />, meta: listMeta('sessions'),
                    content: (
                        <Ga4List report="referrers" dim="sessionSource" metric="sessions" filterKey="source" render={sourceRender} include={aiOnly} limit={SIDE_ROWS} fill labelHeader="Assistant" viewAllTitle="AI assistants"
                            emptyTitle="No AI referrals yet" emptyDescription="Visits from ChatGPT, Perplexity, Claude and Gemini show up here." />
                    ),
                },
                ...(money ? [{
                    value: 'revenue' as const, label: 'Revenue', meta: listMeta('revenue'),
                    content: <Ga4List report="referrers" dim="sessionSource" metric="revenue" filterKey="source" render={sourceRender} limit={SIDE_ROWS} fill labelHeader="Source" viewAllTitle="Revenue by source" emptyTitle="No revenue in this period" />,
                }] : []),
            ]}
        />
    );
}

function LandingList() {
    const { siteHost } = useSite();
    const render = useMemo(() => (r: Ga4Row) => {
        const path = displayPage(pageRef(r.dims.landingPage, siteHost), siteHost);
        return { label: <PagePath path={path} title={r.dims.pageTitle} />, text: `${r.dims.pageTitle ?? ''} ${pageLabel(path)}`.trim() };
    }, [siteHost]);
    return (
        <Ga4List report="landing" dim="landingPage" metric="sessions" filterKey="landing" render={render} include={(r) => Boolean(r.dims.landingPage) && r.dims.landingPage !== '(not set)'}
            limit={8} fill labelHeader="Landing page" viewAllTitle="Landing pages" emptyTitle="No sessions in this period" />
    );
}

/** Top pages (path, trend, ±%; title on hover) and landing pages. */
export function PagesCard({ className, action = 'filter', withSearch = false }: { className?: string; action?: 'open' | 'filter'; withSearch?: boolean }) {
    const { host } = useSite();
    return (
        <TabbedCard
            id="pages"
            title="Pages"
            className={className}
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(host, 'pages')}>All pages</Link></Button>}
            tabs={[
                { value: 'top', label: 'Top pages', content: <PageRows limit={8} action={action} withSearch={withSearch} /> },
                { value: 'landing', label: 'Landing', meta: listMeta('sessions'), content: <LandingList /> },
            ]}
        />
    );
}

const browserRender = (r: Ga4Row) => ({ label: r.dims.browser, text: r.dims.browser, icon: <BrowserIcon name={r.dims.browser} /> });
const osRender = (r: Ga4Row) => ({ label: r.dims.operatingSystem, text: r.dims.operatingSystem, icon: <OsIcon name={r.dims.operatingSystem} /> });

/** Rows of the Browsers / OS / Languages lists under the device split: the card then matches Peak hours beside it. */
const TECH_ROWS = 5;

/**
 * Devices as one 100% bar (Desktop / Mobile / Tablet) with icons, shares and users (round 5, audit item 24):
 * three rows no longer fill a card as tall as the Peak hours heatmap. A segment or legend entry filters the page.
 */
export function DeviceSplit() {
    const q = useGa4<Ga4BreakdownResponse>('devices');
    const click = useFilterClick();
    const active = useActiveFilters().device;
    const rows = useMemo(() => (q.data?.rows ?? [])
        .map((r) => ({ key: r.key, raw: r.dims.deviceCategory, label: deviceLabel(r.dims.deviceCategory), users: r.cur.activeUsers ?? 0 }))
        .filter((r) => r.users > 0)
        .sort((a, b) => b.users - a.users), [q.data]);
    const total = rows.reduce((a, r) => a + r.users, 0);
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    if (q.state === 'loading') {
        return <div aria-busy className="flex flex-col gap-3"><Skeleton className="h-3 w-full rounded-full" /><div className="flex gap-4"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-20" /></div></div>;
    }
    if (!total) return <EmptyState variant="inline" title="No users in this period" />;
    const pick = active ? undefined : (raw: string) => click('device', raw);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
                aria-label={`Users by device: ${rows.map((r) => `${r.label} ${fmtShare(r.users / total)}`).join(', ')}`}>
                {rows.map((r) => (
                    <span key={r.key} className="h-full first:rounded-l-full last:rounded-r-full" title={`${r.label}: ${fmtFull(r.users)} users (${fmtShare(r.users / total)})`}
                        style={{ width: `${(r.users / total) * 100}%`, minWidth: 3, background: deviceColor(r.raw) }} />
                ))}
            </div>
            <ul className="grid grid-cols-3 gap-2">
                {rows.slice(0, 3).map((r) => {
                    const body = (
                        <>
                            <span className="flex items-center gap-1.5 text-meta text-fg-muted">
                                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: deviceColor(r.raw) }} />
                                <DeviceIcon device={r.raw} />
                                <span className="truncate">{r.label}</span>
                            </span>
                            <span className="text-title-sm text-fg tabular-nums">{fmtShare(r.users / total)}</span>
                            <span className="text-meta text-fg-muted tabular-nums">{fmtFull(r.users)} users</span>
                        </>
                    );
                    return (
                        <li key={r.key} className="min-w-0">
                            {pick ? (
                                <button type="button" onClick={() => pick(r.raw)} title={`Filter by ${r.label}`}
                                    className="-m-1.5 flex w-[calc(100%+12px)] min-w-0 flex-col items-start rounded-control p-1.5 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus">
                                    {body}
                                </button>
                            ) : <div className="flex min-w-0 flex-col">{body}</div>}
                        </li>
                    );
                })}
            </ul>
            {rows.length > 3 ? <p className="text-meta text-fg-muted">Also: {rows.slice(3).map((r) => `${r.label} ${fmtShare(r.users / total)}`).join(', ')}</p> : null}
        </div>
    );
}

/** Devices (split bar) over Browsers / OS / Languages (users). */
export function TechCard({ className }: { className?: string }) {
    return (
        <TabbedCard
            id="tech"
            title="Devices"
            description="Users"
            className={className}
            lead={<DeviceSplit />}
            tabs={[
                { value: 'browsers', label: 'Browsers', meta: listMeta('users', true), content: <Ga4List report="browsers" limit={TECH_ROWS} fill dim="browser" metric="users" filterKey="browser" render={browserRender} showShare labelHeader="Browser" viewAllTitle="Browsers" /> },
                { value: 'os', label: 'OS', meta: listMeta('users', true), content: <Ga4List report="os" limit={TECH_ROWS} fill dim="operatingSystem" metric="users" filterKey="os" render={osRender} showShare labelHeader="Operating system" viewAllTitle="Operating systems" /> },
                { value: 'languages', label: 'Languages', meta: listMeta('users', true), content: <Ga4List report="languages" limit={TECH_ROWS} fill dim="language" metric="users" filterKey="language" showShare labelHeader="Language" viewAllTitle="Languages" /> },
            ]}
        />
    );
}

// ─── Search Console card (Overview) ───────────────────────────────────────

function GscList({ report, header }: { report: 'queries' | 'countries' | 'devices'; header: string }) {
    const site = useSite();
    const q = useGsc<GscRowsResponse>(report);
    const items = useMemo(() => (q.data?.rows ?? []).map((r) => {
        if (report === 'countries') {
            const c = countryFromIso3(r.key);
            return { key: r.key, label: c.name, text: c.name, value: r.clicks, icon: <FlagIcon code={gscToAlpha2(r.key)} /> };
        }
        if (report === 'devices') return { key: r.key, label: deviceLabel(r.key), text: deviceLabel(r.key), value: r.clicks, icon: <DeviceIcon device={r.key} /> };
        return { key: r.key, label: r.key, text: r.key, value: r.clicks, href: `${siteHref(site.host, 'search')}?detail=${encodeURIComponent(`q:${r.key}`)}` };
    }), [q.data, report, site.host]);
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <BarList items={items} metric="clicks" limit={SIDE_ROWS} fill showShare={report !== 'queries'} loading={q.state === 'loading'} labelHeader={header} viewAllTitle={`Search ${header.toLowerCase()}`}
            empty={<EmptyState variant="inline" title="No search clicks in this period" description="New sites can take a few weeks to appear in Google." />} />
    );
}

/** Search Console breakdowns for the Overview: queries, countries, devices (clicks). */
export function SearchBreakdownCard({ className }: { className?: string }) {
    const { host } = useSite();
    return (
        <TabbedCard
            id="search"
            title="Search"
            className={className}
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(host, 'search')}>All</Link></Button>}
            tabs={[
                { value: 'queries', label: 'Queries', meta: listMeta2('Clicks'), content: <GscList report="queries" header="Query" /> },
                { value: 'countries', label: 'Countries', meta: listMeta2('Clicks', true), content: <GscList report="countries" header="Country" /> },
                { value: 'devices', label: 'Devices', meta: listMeta2('Clicks', true), content: <GscList report="devices" header="Device" /> },
            ]}
        />
    );
}

function listMeta2(label: string, share?: boolean) {
    return <span className="flex gap-3"><span>{label}</span>{share ? <span className="w-12 text-right">Share</span> : null}</span>;
}
