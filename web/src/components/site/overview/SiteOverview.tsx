'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { channelColor, deviceColor } from '@/lib/metrics';
import { useAlerts } from '@/lib/useDashboardData';
import { BarList } from '@/components/charts/BarList';
import { Donut } from '@/components/charts/Donut';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { siteHref } from '@/components/shell/nav';
import { ActionCard } from '../ActionCard';
import { countryFromIso3, flagForName } from '../lib/geo';
import { mergePages } from '../lib/pages';
import type { Ga4BreakdownResponse, Ga4Summary, GscRowsResponse } from '../lib/types';
import { SiteHeader } from '../SiteHeader';
import { AskButton, askHref, LoadError } from '../SiteStates';
import { SearchSummary, SectionCard, TrafficSummary } from '../SummaryPanels';
import { useSiteActions } from '../useSiteActions';
import { useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';

function Flag({ children }: { children: string }) {
    return children ? <span aria-hidden className="text-[14px] leading-none">{children}</span> : null;
}

/** Site overview (DESIGN 5.4): GA4 and Search Console side by side for one site. */
export function SiteOverview() {
    const site = useSite();
    const { host, hasGa4, hasGsc, label } = site;
    const askSite = { ga4: site.ga4, gsc: site.gsc };
    const searchFirst = hasGsc && !hasGa4;

    return (
        <div className="flex flex-col gap-6">
            <SiteHeader
                source={hasGa4 && hasGsc ? 'Search + traffic' : hasGsc ? 'Search Console only' : 'Google Analytics only'}
                actions={<AskButton prompt={`Give me a quick health check of ${site.siteHost ?? label}: what changed in traffic and search, and what should I fix first?`} site={askSite} label="Ask AI about this site" from="site:overview" />}
            />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {searchFirst ? (
                    <>
                        <SearchSummary href={siteHref(host, 'search')} />
                        <TrafficSummary href={siteHref(host, 'traffic')} />
                    </>
                ) : (
                    <>
                        <TrafficSummary href={siteHref(host, 'traffic')} />
                        <SearchSummary href={siteHref(host, 'search')} />
                    </>
                )}
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <TopPagesCard className="xl:col-span-2" />
                {hasGa4 ? <ChannelsCard /> : <GscDevicesCard />}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {hasGsc ? <TopQueriesCard /> : <SourcesCard />}
                <CountriesCard />
                {hasGa4 ? <DevicesCard /> : null}
                {!hasGa4 && hasGsc ? <AppearanceHint /> : null}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AlertsCard />
                <NextActionsCard />
            </div>
        </div>
    );
}

function TopPagesCard({ className }: { className?: string }) {
    const site = useSite();
    const ga = useGa4<Ga4BreakdownResponse>(site.hasGa4 ? 'pages' : null);
    const sc = useGsc<GscRowsResponse>(site.hasGsc ? 'pages' : null);
    const loading = (site.hasGa4 && ga.state === 'loading') || (site.hasGsc && sc.state === 'loading');
    const rows = useMemo(() => {
        const merged = mergePages(ga.data?.rows, sc.data?.rows, site.siteHost);
        return merged.sort((a, b) => (site.hasGa4 ? (b.views ?? 0) - (a.views ?? 0) : (b.clicks ?? 0) - (a.clicks ?? 0))).slice(0, 8);
    }, [ga.data, sc.data, site.siteHost, site.hasGa4]);
    const err = ga.state === 'error' ? ga : sc.state === 'error' ? sc : null;
    return (
        <SectionCard
            className={className}
            title="Top pages"
            description={site.hasGa4 && site.hasGsc ? 'Analytics and Search Console joined by page' : site.hasGa4 ? 'By pageviews' : 'By search clicks'}
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(site.host, 'pages')}>All pages</Link></Button>}
        >
            {err ? <LoadError error={err.error} onRetry={err.mutate} className="mb-3" /> : null}
            <div className="-mx-5 -mb-5">
                <Table
                    card={false}
                    density="compact"
                    loading={loading}
                    rows={rows}
                    rowKey={(r) => r.key}
                    empty={<EmptyState variant="inline" title="No page data in this period" />}
                    columns={[
                        {
                            key: 'page', header: 'Page', width: '46%',
                            cell: (r) => <Link href={`${siteHref(site.host, 'pages')}?page=${encodeURIComponent(r.key)}`} className="hover:underline" title={r.label}>{r.label}</Link>,
                            heat: site.hasGa4 ? { metric: 'pageviews', value: (r) => r.views } : { metric: 'clicks', value: (r) => r.clicks },
                        },
                        ...(site.hasGa4 ? [
                            { key: 'views', header: 'Views', align: 'right' as const, cell: (r: (typeof rows)[number]) => fmtFull(r.views) },
                            { key: 'users', header: 'Users', align: 'right' as const, cell: (r: (typeof rows)[number]) => fmtFull(r.users) },
                        ] : []),
                        ...(site.hasGsc ? [
                            { key: 'clicks', header: 'Clicks', align: 'right' as const, cell: (r: (typeof rows)[number]) => fmtFull(r.clicks) },
                            { key: 'pos', header: 'Pos', align: 'right' as const, cell: (r: (typeof rows)[number]) => (r.position ? r.position.toFixed(1) : '–') },
                        ] : []),
                    ]}
                />
            </div>
        </SectionCard>
    );
}

function ChannelsCard() {
    const q = useGa4<Ga4BreakdownResponse>('channels');
    const site = useSite();
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.sessionDefaultChannelGroup, value: r.cur.sessions ?? 0, color: channelColor(r.dims.sessionDefaultChannelGroup) }));
    return (
        <SectionCard
            title="Channels"
            description="Sessions by default channel group"
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={`${siteHref(site.host, 'traffic')}?tab=sources`}>Sources</Link></Button>}
        >
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? (
                <div className="flex items-center gap-5"><Skeleton className="size-36 rounded-full" /><div className="flex-1 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4" />)}</div></div>
            ) : items.length === 0 ? <EmptyState variant="inline" title="No sessions in this period" /> : (
                <Donut items={items} centerLabel="Sessions" size={144} legend="bottom" />
            )}
        </SectionCard>
    );
}

function DevicesCard() {
    const q = useGa4<Ga4BreakdownResponse>('devices');
    const items = (q.data?.rows ?? []).map((r) => {
        const name = r.dims.deviceCategory;
        const labelText = name ? name[0].toUpperCase() + name.slice(1) : '(not set)';
        return { key: r.key, label: labelText, value: r.cur.activeUsers ?? 0, color: deviceColor(name) };
    });
    return (
        <SectionCard title="Devices" description="Users by device">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? <Skeleton className="mx-auto size-32 rounded-full" /> : items.length === 0 ? (
                <EmptyState variant="inline" title="No users in this period" />
            ) : <Donut items={items} centerLabel="Users" size={128} legend="bottom" />}
        </SectionCard>
    );
}

function GscDevicesCard() {
    const q = useGsc<GscRowsResponse>('devices');
    const items = (q.data?.rows ?? []).map((r) => {
        const name = r.key.toLowerCase();
        return { key: r.key, label: name ? name[0].toUpperCase() + name.slice(1) : r.key, value: r.clicks, color: deviceColor(name) };
    });
    return (
        <SectionCard title="Search devices" description="Clicks by device">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? <Skeleton className="mx-auto size-32 rounded-full" /> : items.length === 0 ? (
                <EmptyState variant="inline" title="No clicks in this period" />
            ) : <Donut items={items} centerLabel="Clicks" size={128} legend="bottom" />}
        </SectionCard>
    );
}

function TopQueriesCard() {
    const site = useSite();
    const q = useGsc<GscRowsResponse>('queries');
    const items = (q.data?.rows ?? []).slice(0, 50).map((r) => ({ key: r.key, label: r.key, text: r.key, value: r.clicks }));
    return (
        <SectionCard
            title="Top queries"
            description="Search clicks"
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(site.host, 'search')}>All queries</Link></Button>}
        >
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="clicks" limit={6} loading={q.state === 'loading'} labelHeader="Query" viewAllTitle="Top queries" empty={<EmptyState variant="inline" title="No search clicks in this period" />} />
            )}
        </SectionCard>
    );
}

function SourcesCard() {
    const q = useGa4<Ga4BreakdownResponse>('referrers');
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.sessionSource, text: r.dims.sessionSource, value: r.cur.sessions ?? 0 }));
    return (
        <SectionCard title="Top sources" description="Sessions by source">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="sessions" limit={6} loading={q.state === 'loading'} labelHeader="Source" viewAllTitle="Sources" empty={<EmptyState variant="inline" title="No sessions in this period" />} />
            )}
        </SectionCard>
    );
}

function CountriesCard() {
    const site = useSite();
    const ga = useGa4<Ga4BreakdownResponse>(site.hasGa4 ? 'countries' : null);
    const sc = useGsc<GscRowsResponse>(!site.hasGa4 && site.hasGsc ? 'countries' : null);
    const q = site.hasGa4 ? ga : sc;
    const items = site.hasGa4
        ? (ga.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.country, text: r.dims.country, value: r.cur.activeUsers ?? 0, icon: <Flag>{flagForName(r.dims.country)}</Flag> }))
        : (sc.data?.rows ?? []).map((r) => {
            const c = countryFromIso3(r.key);
            return { key: r.key, label: c.name, text: c.name, value: r.clicks, icon: <Flag>{c.flag}</Flag> };
        });
    return (
        <SectionCard title="Countries" description={site.hasGa4 ? 'Users by country' : 'Search clicks by country'}>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric={site.hasGa4 ? 'users' : 'clicks'} limit={6} loading={q.state === 'loading'} showShare labelHeader="Country" viewAllTitle="Countries" empty={<EmptyState variant="inline" title="No data in this period" />} />
            )}
        </SectionCard>
    );
}

function AppearanceHint() {
    const site = useSite();
    return (
        <SectionCard title="Link Analytics" description="Visitors, sources and devices">
            <p className="text-body-sm text-fg-secondary">This site only has Search Console. Link a GA4 property to see who visits, where they come from and what they do.</p>
            <div className="mt-3"><Button asChild size="sm" variant="secondary"><Link href="/dashboard/settings?tab=sites">Link a GA4 property</Link></Button></div>
            <p className="mt-3 text-meta text-fg-muted">Search breakdowns are in <Link className="underline" href={siteHref(site.host, 'search')}>Search</Link>.</p>
        </SectionCard>
    );
}

interface AlertRow {
    id: string;
    severity: 'critical' | 'warning' | 'info' | 'success';
    title: string;
    description?: string;
}

/** GSC alerts from /api/alerts (shared with the bell) + GA4 drops computed from the summary already loaded. */
function AlertsCard() {
    const site = useSite();
    const { compareOn } = useSiteRange();
    const { alerts, isLoading } = useAlerts(site.gsc ?? undefined, site.hasGsc);
    const ga = useGa4<Ga4Summary>(site.hasGa4 ? 'summary' : null);
    const list = useMemo(() => {
        const out: AlertRow[] = [];
        const d = ga.data;
        if (d) {
            const full = d.series.slice(0, -1);
            const tail = full.slice(-2);
            if (tail.length === 2 && tail.every((p) => p.sessions === 0) && full.slice(0, -2).some((p) => p.sessions > 0)) {
                out.push({ id: 'ga-zero', severity: 'critical', title: 'No visits recorded for 2 days', description: 'The GA4 tag may be missing or the site may be down.' });
            }
            if (compareOn && d.previous && d.previous.users >= 20) {
                const ch = (d.totals.users - d.previous.users) / d.previous.users;
                if (ch <= -0.3) out.push({ id: 'ga-drop', severity: ch <= -0.5 ? 'critical' : 'warning', title: `Users down ${Math.round(-ch * 100)}%`, description: `${fmtFull(d.previous.users)} → ${fmtFull(d.totals.users)} versus the previous period.` });
            }
        }
        for (const a of alerts as Array<{ id: string | number; severity?: string; title?: string; description?: string }>) {
            const sev = (a.severity === 'critical' || a.severity === 'warning' || a.severity === 'success' ? a.severity : 'info') as AlertRow['severity'];
            out.push({ id: `gsc-${a.id}`, severity: sev, title: a.title ?? 'Alert', description: a.description });
        }
        const order = { critical: 0, warning: 1, info: 2, success: 3 };
        return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
    }, [alerts, ga.data, compareOn]);
    const loading = (site.hasGsc && isLoading) || (site.hasGa4 && ga.state === 'loading');
    return (
        <SectionCard title="Alerts" description="Drops, spikes and ranking changes for this site">
            {loading && list.length === 0 ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : list.length === 0 ? (
                <EmptyState variant="inline" icon={CheckCircle2} title="No alerts right now" description="Big drops and spikes show up here." />
            ) : (
                <ul className="flex flex-col divide-y divide-border-subtle">
                    {list.map((a) => {
                        const Icon = a.severity === 'critical' || a.severity === 'warning' ? AlertTriangle : a.severity === 'success' ? CheckCircle2 : Info;
                        const tone = a.severity === 'critical' ? 'text-down' : a.severity === 'warning' ? 'text-warn' : a.severity === 'success' ? 'text-up' : 'text-info';
                        return (
                            <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                                <Icon aria-hidden size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-body-sm font-medium text-fg">{a.title}</p>
                                    {a.description ? <p className="mt-0.5 line-clamp-2 text-meta text-fg-muted">{a.description}</p> : null}
                                </div>
                                <Link
                                    href={askHref(`About ${site.siteHost ?? site.label}: "${a.title}". ${a.description ?? ''} What caused it and what should I do?`, { ga4: site.ga4, gsc: site.gsc }, 'site:alert')}
                                    className="shrink-0 text-meta font-medium text-brand-text hover:underline"
                                >
                                    Ask AI
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SectionCard>
    );
}

function NextActionsCard() {
    const site = useSite();
    const { list, actions, setStatus, saveUnavailable } = useSiteActions();
    const open = list.filter((a) => a.status === 'open');
    const top = open.slice(0, 3);
    return (
        <SectionCard
            title="What to fix next"
            description={actions.data ? `${fmtFull(open.length)} open tasks, ranked by expected impact` : 'Ranked from your search and traffic data'}
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(site.host, 'actions')}>All actions</Link></Button>}
        >
            {actions.state === 'error' ? <LoadError error={actions.error} onRetry={actions.mutate} /> : actions.state === 'loading' ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : top.length === 0 ? (
                <EmptyState variant="inline" icon={CheckCircle2} title="Nothing urgent to fix" description="We look for decaying pages, near-page-one queries, low CTR, cannibalization and traffic drops." />
            ) : (
                <div className="flex flex-col gap-3">
                    {top.map((a) => (
                        <ActionCard
                            key={a.id}
                            action={a}
                            compact
                            site={{ ga4: site.ga4, gsc: site.gsc }}
                            canSave={!saveUnavailable}
                            onStatus={(s, undo) => void setStatus(a, s, { undo })}
                        />
                    ))}
                </div>
            )}
        </SectionCard>
    );
}
