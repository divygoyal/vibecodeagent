'use client';

import { useMemo, useState } from 'react';

import { fmtDateRange, fmtFull } from '@/lib/format';
import { CATEGORICAL_OTHER, channelColor, METRICS } from '@/lib/metrics';
import { fmtShare } from '@/components/charts/style';
import { useElementWidth } from '@/components/charts/useElementWidth';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { BreakdownTable } from '../BreakdownTable';
import { clipLabel, FlowChart, type FlowChartLink, type FlowChartNode } from '../chart/FlowChart';
import { buildJourneyFlow, buildSearchFlow, continuationRate, nextPagesByLanding, OTHER, type Flow, type FlowNode, type JourneyMode } from '../lib/journeys';
import { displayPage, pageRef } from '../lib/rules';
import type { Ga4BreakdownResponse, Ga4Row, Ga4Summary, JourneysResponse, SearchFlowResponse } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { PagePath } from '../PagePath';
import { LoadError } from '../SiteStates';
import { useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';

const v = (r: Ga4Row, k: string) => r.cur[k] ?? 0;
const p = (r: Ga4Row, k: string) => (r.prev === undefined ? undefined : r.prev === null ? null : r.prev[k] ?? 0);

/** Below this card width the flow chart's labels do not fit: phones get the same flows as a list. */
const CHART_MIN = 640;

interface Styled { nodes: FlowChartNode[]; links: FlowChartLink[] }

/** Labels and colours for a flow (channel colours, sessions, page views, key events; "Other" and end states grey). */
function styleFlow(flow: Flow, label: (n: FlowNode) => { label: string; title?: string }): Styled {
    const color = (n: FlowNode) => {
        switch (n.kind) {
            case 'channel': return channelColor(n.name);
            case 'landing': return METRICS.sessions.color;
            case 'next': return METRICS.pageviews.color;
            case 'key': return METRICS.conversions.color;
            case 'query': return METRICS.clicks.color;
            default: return CATEGORICAL_OTHER;
        }
    };
    const nodes = flow.nodes.map((n) => ({ id: n.id, col: n.col, value: n.value, color: color(n), ...label(n) }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = flow.links.map((l) => {
        const s = byId.get(l.source);
        const t = byId.get(l.target);
        // Bands into the first step carry the source's colour; bands out of the landing page the outcome's.
        return { ...l, color: (s && s.col === 0 ? s.color : t?.color) ?? CATEGORICAL_OTHER };
    });
    return { nodes, links };
}

/** Phones: each middle-column node with where it came from and where it went. */
function FlowList({ flow, unit, fromLabel, thenLabel }: { flow: Styled; unit: string; fromLabel: string; thenLabel?: string }) {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const mids = flow.nodes.filter((n) => n.col === 1);
    return (
        <ul className="flex flex-col">
            {mids.map((m) => {
                const ins = flow.links.filter((l) => l.target === m.id).sort((a, b) => b.value - a.value);
                // Real pages (or "Had a key event") first, then "Other pages" and the end state.
                const last = (id: string) => (id.startsWith('o:__') && id !== 'o:__key' ? 1 : 0);
                const outs = flow.links.filter((l) => l.source === m.id).sort((a, b) => last(a.target) - last(b.target) || b.value - a.value);
                const inSum = ins.reduce((a, l) => a + l.value, 0) || 1;
                return (
                    <li key={m.id} className="flex flex-col gap-1.5 border-t border-border-subtle py-3 first:border-t-0 first:pt-0">
                        <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-body-sm font-medium text-fg" title={m.title ?? m.label}>{m.label}</span>
                            <span className="shrink-0 text-body-sm text-fg tabular-nums">{fmtFull(m.value)} <span className="text-fg-muted">{unit}</span></span>
                        </span>
                        <span aria-hidden className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
                            {ins.map((l) => <span key={l.source} className="h-full" style={{ width: `${(l.value / inSum) * 100}%`, minWidth: 2, background: l.color }} />)}
                        </span>
                        <span className="text-meta text-fg-muted">
                            {fromLabel}: {ins.slice(0, 3).map((l) => `${clipLabel(byId.get(l.source)?.label ?? '', 28)} ${fmtShare(l.value / inSum)}`).join(' · ')}
                        </span>
                        {thenLabel && outs.length ? (
                            <span className="text-meta text-fg-secondary">
                                {thenLabel}: {[...outs.filter((l) => !last(l.target)).slice(0, 2), ...outs.filter((l) => l.target === 'o:__end' || l.target === 'o:__nokey')].map((l) => `${clipLabel(byId.get(l.target)?.label ?? '', 28)} ${fmtShare(l.value / (m.value || 1))}`).join(' · ')}
                            </span>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

function FlowSkeleton() {
    return <div aria-busy className="flex h-[380px] items-stretch justify-between gap-6 py-6"><Skeleton className="w-1/4" /><Skeleton className="w-1/4" /><Skeleton className="w-1/4" /></div>;
}

/** GA4: channel -> landing page -> next page / key event (audit item 18). */
function VisitFlowCard({ titles }: { titles: Map<string, string> }) {
    const { siteHost } = useSite();
    const { dr } = useSiteRange();
    const q = useGa4<JourneysResponse>('journeys');
    const [pick, setPick] = useState<JourneyMode>('next');
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const d = q.data;
    const hasNext = Boolean(d && d.next.length > 0);
    const mode: JourneyMode = d && !hasNext ? 'key' : pick;
    const cont = d ? continuationRate(d) : null;
    const styled = useMemo(() => {
        if (!d) return null;
        const flow = buildJourneyFlow(d, mode);
        const page = (path: string) => displayPage(pageRef(path, siteHost), siteHost);
        return {
            flow,
            styled: styleFlow(flow, (n) => {
                if (n.name === OTHER) return { label: n.col === 0 ? 'Other channels' : n.col === 1 ? 'Other landing pages' : 'Other pages' };
                if (n.kind === 'key') return { label: 'Had a key event' };
                if (n.kind === 'nokey') return { label: 'No key event' };
                if (n.kind === 'end') return { label: 'No next page' };
                if (n.kind === 'channel') return { label: n.name };
                const title = titles.get(n.name);
                return { label: page(n.name), title: title ? `${title} (${page(n.name)})` : page(n.name) };
            }),
        };
    }, [d, mode, siteHost, titles]);
    const keyShare = d ? d.entries.reduce((a, e) => a + e.keySessions, 0) / Math.max(1, d.entries.reduce((a, e) => a + e.sessions, 0)) : null;
    return (
        <Card as="section" aria-label="How visits flow">
            <CardHeader
                title="How visits flow"
                description={`Sessions, ${fmtDateRange(dr.resolved.start, dr.resolved.end)}: channel → landing page → ${mode === 'next' ? 'the page opened next' : 'key event or not'}.`}
                actions={hasNext || !d ? (
                    <SegmentedControl ariaLabel="Then" size="sm" variant="neutral" value={mode} onChange={setPick}
                        options={[{ value: 'next', label: 'Next page' }, { value: 'key', label: 'Key event' }]} />
                ) : undefined}
            />
            <div ref={ref}>
                {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : !styled ? <FlowSkeleton /> : styled.flow.total === 0 ? (
                    <EmptyState variant="inline" title="No sessions in this period" />
                ) : width >= CHART_MIN ? (
                    <FlowChart
                        nodes={styled.styled.nodes}
                        links={styled.styled.links}
                        columns={['Channel', 'Landing page', mode === 'next' ? 'Next page' : 'Key event']}
                        format={fmtFull}
                        unit={mode === 'next' ? 'sessions or views' : 'sessions'}
                        ariaLabel={`Sessions by channel, landing page and ${mode === 'next' ? 'next page' : 'key event'}`}
                    />
                ) : (
                    <FlowList flow={styled.styled} unit="sessions" fromLabel="From" thenLabel={mode === 'next' ? 'Then' : 'Key event'} />
                )}
            </div>
            {d ? (
                <p className="mt-3 text-meta text-fg-muted">
                    {mode === 'next'
                        ? `Next page: a page opened from the landing page in the same visit (GA4's page referrer), counted in page views. ${cont !== null ? `${fmtShare(cont)} of sessions went on to another page; ` : ''}"No next page" is the rest: they left, or stayed on the first page.`
                        : `Key event: sessions with at least one key event (GA4's session key event rate)${keyShare !== null ? `, ${fmtShare(keyShare)} of all sessions` : ''}.`}
                    {!hasNext ? ' GA4 recorded no page referrers inside the site for this property, so the next page cannot be shown.' : ''}
                    {d.truncated ? ' Very small flows are left out (GA4 row limit).' : ''}
                </p>
            ) : null}
        </Card>
    );
}

/** Search Console: query -> landing page (clicks). */
function SearchFlowCard() {
    const { siteHost } = useSite();
    const { dr } = useSiteRange();
    const q = useGsc<SearchFlowResponse>('searchFlow');
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const styled = useMemo(() => {
        if (!q.data) return null;
        const flow = buildSearchFlow(q.data);
        const page = (u: string) => displayPage(pageRef(u), siteHost);
        return {
            flow,
            styled: styleFlow(flow, (n) => (n.name === OTHER ? { label: n.col === 0 ? 'Other queries' : 'Other pages' } : n.kind === 'query' ? { label: n.name } : { label: page(n.name), title: n.name })),
        };
    }, [q.data, siteHost]);
    return (
        <Card as="section" aria-label="From Google search">
            <CardHeader
                title="From Google search"
                description={`Clicks, ${fmtDateRange(dr.resolvedSearch.start, dr.resolvedSearch.end)}: search → the page it landed on.`}
            />
            <div ref={ref}>
                {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : !styled ? <FlowSkeleton /> : styled.flow.total === 0 ? (
                    <EmptyState variant="inline" title="No search clicks in this period" description="New sites can take a few weeks to appear in Google." />
                ) : width >= CHART_MIN ? (
                    <FlowChart nodes={styled.styled.nodes} links={styled.styled.links} columns={['Search', 'Landing page']} height={340} format={fmtFull} unit="clicks"
                        ariaLabel="Search clicks by query and landing page" />
                ) : (
                    <FlowList flow={styled.styled} unit="clicks" fromLabel="Searches" />
                )}
            </div>
            <p className="mt-3 text-meta text-fg-muted">Search Console data (2-day delay). Google leaves rare, anonymised searches out of query reports.</p>
        </Card>
    );
}

/**
 * Traffic > Journeys (round 5): what GA4 and Search Console really report about paths. The flow of sessions
 * (channel -> landing page -> next page or key event), searches -> landing pages, then the landing pages table
 * with each page's usual next page. Full per-visitor paths would need a tracking script.
 */
export function JourneysTab() {
    const { siteHost, hasGsc } = useSite();
    const { compareOn, compareText } = useSiteRange();
    const summary = useGa4<Ga4Summary>('summary');
    const landing = useGa4<Ga4BreakdownResponse>('landing');
    const journeys = useGa4<JourneysResponse>('journeys');
    const t = summary.data?.totals;
    const prev = compareOn ? summary.data?.previous ?? null : undefined;
    const loading = summary.state === 'loading';
    const titles = useMemo(() => new Map((landing.data?.rows ?? []).filter((r) => r.dims.pageTitle).map((r) => [r.dims.landingPage, r.dims.pageTitle as string])), [landing.data]);
    const next = useMemo(() => (journeys.data ? nextPagesByLanding(journeys.data, 1) : null), [journeys.data]);
    const rows = useMemo(() => (landing.data?.rows ?? []).filter((r) => r.dims.landingPage && r.dims.landingPage !== '(not set)').map((r) => {
        const ref = pageRef(r.dims.landingPage, siteHost);
        return { r, label: displayPage(ref, siteHost), next: next?.get(r.dims.landingPage)?.[0] ?? null };
    }), [landing.data, siteHost, next]);
    const hasNext = Boolean(journeys.data?.next.length);
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="pageviews" label="Pages per session" format="position" better="up" value={t && t.sessions ? Math.round((t.pageviews / t.sessions) * 100) / 100 : null} previous={prev === undefined ? undefined : prev && prev.sessions ? Math.round((prev.pageviews / prev.sessions) * 100) / 100 : null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Avg. session duration" format="duration" value={t?.avgDuration} previous={prev === undefined ? undefined : prev?.avgDuration ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Engaged sessions" value={t?.engagedSessions} previous={prev === undefined ? undefined : prev?.engagedSessions ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Bounce rate" format="percent" better="down" value={t ? 1 - t.engagementRate : null} previous={prev === undefined ? undefined : prev ? 1 - prev.engagementRate : null} loading={loading} comparisonLabel={compareText} />
            </div>
            <VisitFlowCard titles={titles} />
            {hasGsc ? <SearchFlowCard /> : null}
            {landing.state === 'error' ? <LoadError error={landing.error} onRetry={landing.mutate} /> : (
                <BreakdownTable
                    caption="Where sessions start"
                    rows={rows}
                    rowKey={(x) => x.r.key}
                    loading={landing.state === 'loading'}
                    label={{
                        header: 'Landing page',
                        text: (x) => `${x.r.dims.pageTitle ?? ''} ${x.label}`.trim(),
                        cell: (x) => <PagePath path={x.label} title={x.r.dims.pageTitle} className="w-full font-medium text-fg md:w-auto" />,
                    }}
                    heat={{ metric: 'sessions', value: (x) => v(x.r, 'sessions') }}
                    twoLine
                    defaultSort="sessions"
                    exportName="landing-pages"
                    searchPlaceholder="Search landing pages"
                    columns={[
                        { key: 'sessions', header: 'Sessions', value: (x) => v(x.r, 'sessions'), previous: compareOn ? (x) => p(x.r, 'sessions') : undefined },
                        ...(hasNext ? [{
                            key: 'next', header: 'Usual next page', format: 'percent' as const, hideOnMobile: true, mobile: 'hidden' as const, width: '26%',
                            value: (x: (typeof rows)[number]) => (x.next ? x.next.share : null),
                            csv: (x: (typeof rows)[number]) => (x.next ? `${x.next.next} (${fmtShare(x.next.share)})` : ''),
                            cell: (x: (typeof rows)[number]) => (x.next ? (
                                <span className="whitespace-nowrap" title={`${fmtShare(x.next.share)} of these sessions opened ${x.next.next} next`}>
                                    {clipLabel(displayPage(pageRef(x.next.next, siteHost), siteHost), 34)}{' '}
                                    <span className="text-meta text-fg-muted tabular-nums">{fmtShare(x.next.share)}</span>
                                </span>
                            ) : <span className="text-fg-faint">–</span>),
                        }] : []),
                        { key: 'rate', header: 'Went deeper', format: 'percent', value: (x) => v(x.r, 'engagementRate'), hideOnMobile: true },
                        { key: 'conv', header: 'Key events', value: (x) => v(x.r, 'keyEvents'), hideOnMobile: true },
                    ]}
                />
            )}
            <p className="text-meta text-fg-muted">
                &ldquo;Went deeper&rdquo; is GA4&apos;s engagement rate: the session lasted 10+ seconds, viewed 2+ pages or converted.
                Paths of single visitors are not in GA4&apos;s API; for a fixed sequence of pages, build a funnel.
            </p>
        </div>
    );
}
