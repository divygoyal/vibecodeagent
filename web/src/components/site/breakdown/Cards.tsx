'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { channelColor } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { siteHref } from '@/components/shell/nav';
import { countryFromIso3 } from '../lib/geo';
import { displayPage, isAiSource, pageRef } from '../lib/rules';
import { deviceLabel } from '../lib/sources';
import type { Ga4BreakdownResponse, Ga4Row, GscRowsResponse } from '../lib/types';
import { PageRows } from '../pages/PageRows';
import { LoadError } from '../SiteStates';
import { PagePath } from '../PagePath';
import { pageLabel } from '../lib/pagePath';
import { FlagIcon, sourceParts } from '../SourceIcon';
import { useGa4, useGsc, useSite } from '../useSiteData';
import { gscToAlpha2 } from '@/lib/builder/countries';
import { Ga4List, listMeta } from './Ga4List';
import { TabbedCard } from './TabbedCard';

const channelRender = (r: Ga4Row) => ({
    label: r.dims.sessionDefaultChannelGroup || 'Unassigned',
    text: r.dims.sessionDefaultChannelGroup || 'Unassigned',
    icon: <span aria-hidden className="size-2 rounded-full" style={{ background: channelColor(r.dims.sessionDefaultChannelGroup) }} />,
});
const sourceRender = (r: Ga4Row) => sourceParts(r.dims.sessionSource);
const aiOnly = (r: Ga4Row) => isAiSource(r.dims.sessionSource);

function AiCount() {
    const q = useGa4<Ga4BreakdownResponse>('referrers');
    if (!q.data) return null;
    const n = q.data.rows.filter(aiOnly).reduce((a, r) => a + (r.cur.sessions ?? 0), 0);
    return n > 0 ? <>{fmtFull(n)}</> : null;
}

/** Channels / Sources / AI assistants in one card (sessions). */
export function SourcesCard({ className }: { className?: string }) {
    return (
        <TabbedCard
            id="sources"
            title="Sources"
            className={className}
            tabs={[
                {
                    value: 'sources', label: 'Sources', meta: listMeta('sessions'),
                    content: <Ga4List report="referrers" dim="sessionSource" metric="sessions" filterKey="source" render={sourceRender} labelHeader="Source" viewAllTitle="Sources" emptyTitle="No sessions in this period" />,
                },
                {
                    value: 'channels', label: 'Channels', meta: listMeta('sessions', true),
                    content: <Ga4List report="channels" dim="sessionDefaultChannelGroup" metric="sessions" filterKey="channel" render={channelRender} showShare labelHeader="Channel" viewAllTitle="Channels" emptyTitle="No sessions in this period" />,
                },
                {
                    value: 'ai', label: 'AI', count: <AiCount />, meta: listMeta('sessions'),
                    content: (
                        <Ga4List report="referrers" dim="sessionSource" metric="sessions" filterKey="source" render={sourceRender} include={aiOnly} labelHeader="Assistant" viewAllTitle="AI assistants"
                            emptyTitle="No AI referrals yet" emptyDescription="Visits from ChatGPT, Perplexity, Claude and Gemini show up here." />
                    ),
                },
            ]}
        />
    );
}

function LandingList() {
    const { siteHost } = useSite();
    const render = useMemo(() => (r: Ga4Row) => {
        const path = displayPage(pageRef(r.dims.landingPage, siteHost), siteHost);
        return { label: <PagePath path={path} />, text: pageLabel(path) };
    }, [siteHost]);
    return (
        <Ga4List report="landing" dim="landingPage" metric="sessions" filterKey="landing" render={render} include={(r) => Boolean(r.dims.landingPage) && r.dims.landingPage !== '(not set)'}
            limit={8} labelHeader="Landing page" viewAllTitle="Landing pages" emptyTitle="No sessions in this period" />
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

const deviceRender = (r: Ga4Row) => ({ label: deviceLabel(r.dims.deviceCategory), text: deviceLabel(r.dims.deviceCategory) });

/** Devices / Browsers / OS / Languages (users). */
export function TechCard({ className }: { className?: string }) {
    return (
        <TabbedCard
            id="tech"
            title="Devices"
            className={className}
            tabs={[
                { value: 'devices', label: 'Devices', meta: listMeta('users', true), content: <Ga4List report="devices" dim="deviceCategory" metric="users" filterKey="device" render={deviceRender} showShare labelHeader="Device" viewAllTitle="Devices" /> },
                { value: 'browsers', label: 'Browsers', meta: listMeta('users', true), content: <Ga4List report="browsers" dim="browser" metric="users" filterKey="browser" showShare labelHeader="Browser" viewAllTitle="Browsers" /> },
                { value: 'os', label: 'OS', meta: listMeta('users', true), content: <Ga4List report="os" dim="operatingSystem" metric="users" filterKey="os" showShare labelHeader="Operating system" viewAllTitle="Operating systems" /> },
                { value: 'languages', label: 'Languages', meta: listMeta('users', true), content: <Ga4List report="languages" dim="language" metric="users" filterKey="language" showShare labelHeader="Language" viewAllTitle="Languages" /> },
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
        if (report === 'devices') return { key: r.key, label: deviceLabel(r.key), text: deviceLabel(r.key), value: r.clicks };
        return { key: r.key, label: r.key, text: r.key, value: r.clicks, href: `${siteHref(site.host, 'search')}?detail=${encodeURIComponent(`q:${r.key}`)}` };
    }), [q.data, report, site.host]);
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <BarList items={items} metric="clicks" limit={7} showShare={report !== 'queries'} loading={q.state === 'loading'} labelHeader={header} viewAllTitle={`Search ${header.toLowerCase()}`}
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
