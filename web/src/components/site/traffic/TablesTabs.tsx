'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { fmtFull } from '@/lib/format';
import { channelColor } from '@/lib/metrics';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { siteHref } from '@/components/shell/nav';
import { BreakdownTable } from '../BreakdownTable';
import { GeoCard } from '../breakdown/GeoCard';
import { useFilterClick } from '../filters/SiteFilters';
import { flagForName } from '../lib/geo';
import { sourceMediumInfo } from '../lib/sources';
import { sourceMediumParts } from '../SourceIcon';
import { displayPage, isAiSource, pageRef } from '../lib/rules';
import type { Ga4BreakdownResponse, Ga4PageTrends, Ga4Row } from '../lib/types';
import { LoadError } from '../SiteStates';
import { PagePath } from '../PagePath';
import { useGa4, useSite, useSiteRange } from '../useSiteData';
import { ChannelsDonut, DevicesDonut, Flag, SimpleList } from './OverviewTab';

const v = (r: Ga4Row, k: string) => r.cur[k] ?? 0;
const p = (r: Ga4Row, k: string) => (r.prev === undefined ? undefined : r.prev === null ? null : r.prev[k] ?? 0);

function useBreakdown(report: string) {
    return useGa4<Ga4BreakdownResponse>(report);
}

/** Traffic > Pages: every page (GA4 views) or landing pages. Row opens the merged page drawer. */
export function TrafficPagesTab() {
    const site = useSite();
    const router = useRouter();
    const { compareOn } = useSiteRange();
    const [view, setView] = useState<'pages' | 'landing'>('pages');
    const pages = useBreakdown(view === 'pages' ? 'pages' : 'landing');
    const rows = useMemo(() => (pages.data?.rows ?? []).map((r) => {
        const ref = pageRef(view === 'pages' ? r.dims.pagePath : r.dims.landingPage, view === 'pages' ? r.dims.hostName || site.siteHost : site.siteHost);
        return { r, ref, label: displayPage(ref, site.siteHost) };
    }).filter((x) => x.label && !x.label.includes('(not set)')), [pages.data, view, site.siteHost]);
    const open = (key: string) => router.push(`${siteHref(site.host, 'pages')}?page=${encodeURIComponent(key)}`);
    const trends = useGa4<Ga4PageTrends>(view === 'pages' ? 'pageTrends' : null, { extra: { limit: '25' } });
    const titleBy = useMemo(() => new Map((trends.data?.titles ?? []).map((t) => [pageRef(t.path, t.host || site.siteHost).key, t.title])), [trends.data, site.siteHost]);
    const toggle = (
        <SegmentedControl
            ariaLabel="Page report"
            size="sm"
            variant="neutral"
            value={view}
            onChange={setView}
            options={[{ value: 'pages', label: 'All pages' }, { value: 'landing', label: 'Landing pages' }]}
        />
    );
    if (pages.state === 'error') return <LoadError error={pages.error} onRetry={pages.mutate} />;
    if (view === 'pages') {
        return (
            <BreakdownTable
                rows={rows}
                rowKey={(x) => x.r.key}
                label={{
                    header: 'Page',
                    text: (x) => `${titleBy.get(x.ref.key) ?? ''} ${x.label}`,
                    cell: (x) => <PagePath path={x.label} title={titleBy.get(x.ref.key)} className="w-[46vw] max-w-[30rem] font-medium text-fg md:w-auto" />,
                }}
                heat={{ metric: 'pageviews', value: (x) => v(x.r, 'screenPageViews') }}
                loading={pages.state === 'loading'}
                defaultSort="views"
                exportName="pages"
                searchPlaceholder="Search pages"
                toolbarExtra={toggle}
                onRowClick={(x) => open(x.ref.key)}
                columns={[
                    { key: 'views', header: 'Views', value: (x) => v(x.r, 'screenPageViews'), previous: compareOn ? (x) => p(x.r, 'screenPageViews') : undefined },
                    { key: 'users', header: 'Users', value: (x) => v(x.r, 'activeUsers'), hideOnMobile: true },
                    { key: 'eng', header: 'Avg. engagement', format: 'duration', value: (x) => (v(x.r, 'activeUsers') ? v(x.r, 'userEngagementDuration') / v(x.r, 'activeUsers') : 0), hideOnMobile: true },
                    { key: 'rate', header: 'Engagement rate', format: 'percent', value: (x) => v(x.r, 'engagementRate'), hideOnMobile: true },
                    { key: 'conv', header: 'Conversions', value: (x) => v(x.r, 'keyEvents'), hideOnMobile: true },
                ]}
            />
        );
    }
    return (
        <BreakdownTable
            rows={rows}
            rowKey={(x) => x.r.key}
            label={{ header: 'Landing page', text: (x) => x.label, cell: (x) => <PagePath path={x.label} className="w-[46vw] max-w-[30rem] md:w-auto" /> }}
            heat={{ metric: 'sessions', value: (x) => v(x.r, 'sessions') }}
            loading={pages.state === 'loading'}
            defaultSort="sessions"
            exportName="landing-pages"
            searchPlaceholder="Search landing pages"
            toolbarExtra={toggle}
            onRowClick={(x) => open(x.ref.key)}
            columns={[
                { key: 'sessions', header: 'Sessions', value: (x) => v(x.r, 'sessions'), previous: compareOn ? (x) => p(x.r, 'sessions') : undefined },
                { key: 'users', header: 'Users', value: (x) => v(x.r, 'activeUsers'), hideOnMobile: true },
                { key: 'rate', header: 'Engagement rate', format: 'percent', value: (x) => v(x.r, 'engagementRate'), hideOnMobile: true },
                { key: 'bounce', header: 'Bounce rate', format: 'percent', better: 'down', value: (x) => v(x.r, 'bounceRate'), hideOnMobile: true },
                { key: 'conv', header: 'Conversions', value: (x) => v(x.r, 'keyEvents'), hideOnMobile: true },
            ]}
        />
    );
}

function ChannelDot({ name }: { name: string }) {
    return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: channelColor(name) }} />;
}

/** Traffic > Sources: channels, then source / medium (and AI assistants). */
export function TrafficSourcesTab() {
    const { compareOn } = useSiteRange();
    const click = useFilterClick();
    const filterSource = (r: Ga4Row) => {
        const v = r.dims.sessionSourceMedium ?? '';
        const i = v.lastIndexOf(' / ');
        click('source', i >= 0 ? v.slice(0, i) : v);
    };
    const channels = useBreakdown('channels');
    const sources = useBreakdown('sources');
    const [onlyAi, setOnlyAi] = useState<'all' | 'ai'>('all');
    const srcRows = useMemo(() => (sources.data?.rows ?? []).filter((r) => onlyAi === 'all' || isAiSource(r.dims.sessionSourceMedium)), [sources.data, onlyAi]);
    const trafficCols = [
        { key: 'sessions', header: 'Sessions', value: (r: Ga4Row) => v(r, 'sessions'), previous: compareOn ? (r: Ga4Row) => p(r, 'sessions') : undefined },
        { key: 'users', header: 'Users', value: (r: Ga4Row) => v(r, 'activeUsers'), hideOnMobile: true },
        { key: 'rate', header: 'Engagement rate', format: 'percent' as const, value: (r: Ga4Row) => v(r, 'engagementRate'), hideOnMobile: true },
        { key: 'dur', header: 'Avg. duration', format: 'duration' as const, value: (r: Ga4Row) => v(r, 'averageSessionDuration'), hideOnMobile: true },
        { key: 'conv', header: 'Conversions', value: (r: Ga4Row) => v(r, 'keyEvents'), previous: compareOn ? (r: Ga4Row) => p(r, 'keyEvents') : undefined, hideOnMobile: true },
    ];
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <ChannelsDonut />
                <div className="min-w-0 xl:col-span-2">
                    {channels.state === 'error' ? <LoadError error={channels.error} onRetry={channels.mutate} /> : (
                        <BreakdownTable
                            caption="Channels"
                            rows={channels.data?.rows ?? []}
                            rowKey={(r) => r.key}
                            loading={channels.state === 'loading'}
                            label={{ header: 'Channel', text: (r) => r.dims.sessionDefaultChannelGroup, cell: (r) => <span className="flex items-center gap-2"><ChannelDot name={r.dims.sessionDefaultChannelGroup} />{r.dims.sessionDefaultChannelGroup}</span> }}
                            heat={{ metric: 'sessions', value: (r) => v(r, 'sessions') }}
                            defaultSort="sessions"
                            exportName="channels"
                            pageSize={12}
                            searchPlaceholder="Search channels"
                            onRowClick={(r) => click('channel', r.dims.sessionDefaultChannelGroup)}
                            columns={trafficCols}
                        />
                    )}
                </div>
            </div>
            {sources.state === 'error' ? <LoadError error={sources.error} onRetry={sources.mutate} /> : (
                <BreakdownTable
                    caption="Source / medium"
                    rows={srcRows}
                    rowKey={(r) => r.key}
                    loading={sources.state === 'loading'}
                    label={{
                        header: 'Source / medium',
                        text: (r) => `${sourceMediumInfo(r.dims.sessionSourceMedium).text} ${r.dims.sessionSourceMedium}`,
                        cell: (r) => {
                            const parts = sourceMediumParts(r.dims.sessionSourceMedium);
                            return <span className="flex min-w-0 items-center gap-2" title={r.dims.sessionSourceMedium}><span className="flex size-4 shrink-0 items-center justify-center">{parts.icon}</span><span className="truncate">{parts.label}</span></span>;
                        },
                    }}
                    onRowClick={filterSource}
                    heat={{ metric: onlyAi === 'ai' ? 'ai' : 'sessions', value: (r) => v(r, 'sessions') }}
                    defaultSort="sessions"
                    exportName="sources"
                    searchPlaceholder="Search sources"
                    toolbarExtra={(
                        <SegmentedControl ariaLabel="Sources shown" size="sm" variant="neutral" value={onlyAi} onChange={setOnlyAi}
                            options={[{ value: 'all', label: 'All sources' }, { value: 'ai', label: 'AI assistants' }]} />
                    )}
                    columns={trafficCols}
                />
            )}
        </div>
    );
}

/** Traffic > Audience: geography, devices, technology, language, new vs returning. */
export function TrafficAudienceTab() {
    const { compareOn } = useSiteRange();
    const click = useFilterClick();
    const [geo, setGeo] = useState<'countries' | 'cities'>('countries');
    const countries = useBreakdown(geo);
    const nvr = useBreakdown('newReturning');
    const nvrRows = nvr.data?.rows ?? [];
    const totalUsers = nvrRows.reduce((a, r) => a + v(r, 'activeUsers'), 0);
    return (
        <div className="flex flex-col gap-4">
            <GeoCard />
            {countries.state === 'error' ? <LoadError error={countries.error} onRetry={countries.mutate} /> : (
                <BreakdownTable
                    caption={geo === 'countries' ? 'Countries' : 'Cities'}
                    rows={countries.data?.rows ?? []}
                    rowKey={(r) => r.key}
                    loading={countries.state === 'loading'}
                    label={geo === 'countries'
                        ? { header: 'Country', text: (r) => r.dims.country, cell: (r) => <span className="flex items-center gap-2"><Flag>{flagForName(r.dims.country)}</Flag>{r.dims.country}</span> }
                        : { header: 'City', text: (r) => `${r.dims.city}, ${r.dims.country}`, cell: (r) => <span className="flex items-center gap-2"><Flag>{flagForName(r.dims.country)}</Flag>{r.dims.city}<span className="text-fg-muted">{r.dims.country}</span></span> }}
                    heat={{ metric: 'users', value: (r) => v(r, 'activeUsers') }}
                    defaultSort="users"
                    exportName={geo}
                    searchPlaceholder={geo === 'countries' ? 'Search countries' : 'Search cities'}
                    onRowClick={(r) => (geo === 'countries' ? click('country', r.dims.country) : click('city', r.dims.city))}
                    toolbarExtra={(
                        <SegmentedControl ariaLabel="Geography" size="sm" variant="neutral" value={geo} onChange={setGeo}
                            options={[{ value: 'countries', label: 'Countries' }, { value: 'cities', label: 'Cities' }]} />
                    )}
                    columns={[
                        { key: 'users', header: 'Users', value: (r) => v(r, 'activeUsers'), previous: compareOn ? (r) => p(r, 'activeUsers') : undefined },
                        { key: 'sessions', header: 'Sessions', value: (r) => v(r, 'sessions'), hideOnMobile: true },
                        { key: 'rate', header: 'Engagement rate', format: 'percent', value: (r) => v(r, 'engagementRate'), hideOnMobile: true },
                        ...(geo === 'countries' ? [{ key: 'conv', header: 'Conversions', value: (r: Ga4Row) => v(r, 'keyEvents'), hideOnMobile: true }] : []),
                    ]}
                />
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DevicesDonut />
                <SimpleList report="browsers" dim="browser" title="Browsers" />
                <SimpleList report="os" dim="operatingSystem" title="Operating systems" />
                <SimpleList report="languages" dim="language" title="Languages" />
            </div>
            {nvr.state === 'error' ? <LoadError error={nvr.error} onRetry={nvr.mutate} /> : (
                <BreakdownTable
                    caption="New and returning"
                    rows={nvrRows.filter((r) => r.dims.newVsReturning && r.dims.newVsReturning !== '(not set)')}
                    rowKey={(r) => r.key}
                    loading={nvr.state === 'loading'}
                    label={{ header: 'Visitor type', text: (r) => (r.dims.newVsReturning === 'new' ? 'New' : r.dims.newVsReturning === 'returning' ? 'Returning' : r.dims.newVsReturning) }}
                    heat={{ metric: 'users', value: (r) => v(r, 'activeUsers') }}
                    defaultSort="users"
                    pageSize={5}
                    exportName="new-vs-returning"
                    columns={[
                        { key: 'users', header: 'Users', value: (r) => v(r, 'activeUsers'), previous: compareOn ? (r) => p(r, 'activeUsers') : undefined },
                        { key: 'share', header: 'Share', format: 'percent', value: (r) => (totalUsers ? v(r, 'activeUsers') / totalUsers : 0), hideOnMobile: true },
                        { key: 'rate', header: 'Engagement rate', format: 'percent', value: (r) => v(r, 'engagementRate'), hideOnMobile: true },
                        { key: 'conv', header: 'Conversions', value: (r) => v(r, 'keyEvents'), hideOnMobile: true },
                    ]}
                />
            )}
            <p className="text-meta text-fg-muted">Users per row can add up to more than the total: one person can use several devices or visit from several cities. Totals: {fmtFull(totalUsers)} users.</p>
        </div>
    );
}
