'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSWRConfig } from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2, CloudOff, RotateCw, TrendingUp } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { siteHref } from '@/components/shell/nav';
import { ActionList, ActionRow } from '../ActionCard';
import { siteAnomalies, windowText } from '../lib/anomalies';
import type { Ga4Summary, GscRowsResponse, GscSummary } from '../lib/types';
import { SiteHeader } from '../SiteHeader';
import { AskButton, LoadError } from '../SiteStates';
import { SearchSummary, SectionCard, TrafficSummary } from '../SummaryPanels';
import { PagesCard, SearchBreakdownCard, SourcesCard, TechCard } from '../breakdown/Cards';
import { GeoCard } from '../breakdown/GeoCard';
import { PageRows } from '../pages/PageRows';
import { SearchVsTrafficCard } from './SearchVsTrafficCard';
import { useSiteActions } from '../useSiteActions';
import { useGa4, useGsc, useSite, useSiteRange, type SiteQuery } from '../useSiteData';

/** Google did not answer (5xx, timeout) or rate-limited us: not an access problem, which has its own screens. */
function googleDown(q: SiteQuery<unknown>): boolean {
    return q.state === 'error' && Boolean(q.error) && (q.error!.status === 429 || q.error!.status >= 500);
}

/**
 * Round 7 audit #5: when Google fails, the page said so a dozen times (one red box per card) while the Alerts card
 * said "No unusual changes" and the fix list counted only audit tasks. The two summary reports (the same requests the
 * header tiles and Alerts make, so nothing extra is fetched) tell whether each source answered.
 */
function useGoogleOutage() {
    const site = useSite();
    const ga = useGa4<Ga4Summary>(site.hasGa4 ? 'summary' : null);
    const gsc = useGsc<GscSummary>(site.hasGsc ? 'summary' : null);
    const { mutate } = useSWRConfig();
    const ga4 = site.hasGa4 && googleDown(ga);
    const search = site.hasGsc && googleDown(gsc);
    const failed = [ga4 ? 'Analytics' : null, search ? 'Search Console' : null].filter(Boolean) as string[];
    return {
        ga4,
        search,
        any: failed.length > 0,
        /** Every source this site has failed: one page-level state instead of the cards. */
        all: failed.length > 0 && (!site.hasGa4 || ga4) && (!site.hasGsc || search),
        names: failed.join(' and '),
        rateLimited: [ga.error, gsc.error].some((e) => e?.status === 429),
        retrying: ga.isValidating || gsc.isValidating,
        /** Ask Google again for everything on the page. */
        retry: () => { void mutate((key) => typeof key === 'string' && key.startsWith('/api/site/')); },
    };
}

function outageText(o: ReturnType<typeof useGoogleOutage>): { title: string; body: string } {
    return o.rateLimited
        ? { title: 'Google is limiting requests right now', body: `Google asked us to slow down, so this site's ${o.names} data could not be loaded. Wait a minute, then try again.` }
        : { title: "Google didn't answer", body: `We couldn't load this site's ${o.names} data from Google. This is usually brief: try again in a moment.` };
}

/** The whole page when no source answered: one message and one retry, no cards, alerts or tasks that were never checked. */
function GoogleOutage({ outage }: { outage: ReturnType<typeof useGoogleOutage> }) {
    const t = outageText(outage);
    return (
        <Card as="section" aria-label="Google data unavailable" role="alert">
            <EmptyState
                variant="page"
                icon={CloudOff}
                title={t.title}
                description={`${t.body} Nothing on this page has been checked until it answers.`}
                actions={<Button variant="primary" icon={RotateCw} loading={outage.retrying} onClick={outage.retry}>Try again</Button>}
            />
        </Card>
    );
}

/** Site overview (DESIGN 5.4): GA4 and Search Console side by side for one site. */
export function SiteOverview() {
    const site = useSite();
    const { host, hasGa4, hasGsc, label } = site;
    const askSite = { ga4: site.ga4, gsc: site.gsc };
    const searchFirst = hasGsc && !hasGa4;
    const outage = useGoogleOutage();
    const header = (
        <SiteHeader
            both
            source={hasGa4 && hasGsc ? 'Search + traffic' : hasGsc ? 'Search Console only' : 'Google Analytics only'}
            actions={<AskButton prompt={`Give me a quick health check of ${site.siteHost ?? label}: what changed in traffic and search, and what should I fix first?`} site={askSite} label="Ask AI about this site" from="site:overview" />}
        />
    );

    if (outage.all) {
        return (
            <div className="flex flex-col gap-6">
                {header}
                <GoogleOutage outage={outage} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {header}
            {outage.any ? (
                <Banner variant="warn" title={outageText(outage).title}
                    actions={<Button size="sm" icon={RotateCw} loading={outage.retrying} onClick={outage.retry}>Try again</Button>}>
                    {outageText(outage).body} Its cards, alerts and tasks are missing until it answers.
                </Banner>
            ) : null}
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
            {hasGa4 && hasGsc ? <SearchVsTrafficCard /> : null}
            {/* Cards in a row share one height (the shorter one's list grows, "View all" at the bottom). */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {hasGa4 ? <PagesCard className="xl:col-span-2" action="open" withSearch={hasGsc} /> : <GscTopPagesCard className="xl:col-span-2" />}
                {hasGa4 ? <SourcesCard /> : <SearchBreakdownCard />}
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <GeoCard className="xl:col-span-2" />
                {hasGa4 && hasGsc ? <SearchBreakdownCard /> : hasGa4 ? <TechCard /> : <AppearanceHint />}
            </div>
            {/* Alerts: anomalies only (one line when there are none); the fix list below holds the tasks. */}
            <AlertsCard />
            <NextActionsCard />
        </div>
    );
}

/** Search Console-only sites: top pages by clicks. */
function GscTopPagesCard({ className }: { className?: string }) {
    const site = useSite();
    return (
        <SectionCard
            className={className}
            title="Top pages"
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(site.host, 'pages')}>All pages</Link></Button>}
        >
            <PageRows limit={8} />
        </SectionCard>
    );
}

function AppearanceHint() {
    const site = useSite();
    return (
        <SectionCard title="Link Analytics" description="Visitors, sources and devices">
            <p className="text-body-sm text-fg-secondary">This site only has Search Console. Link a GA4 property to see who visits, where they come from and what they do.</p>
            <div className="mt-3"><Button asChild size="sm" variant="secondary"><a href="#link-ga4">Link a GA4 property</a></Button></div>
            <p className="mt-3 text-meta text-fg-muted">Search breakdowns are in <Link className="underline" href={siteHref(site.host, 'search')}>Search</Link>.</p>
        </SectionCard>
    );
}

/** Anomalies only (round 4, audit item 5): the numbers of the header tiles, with their window. Opportunities are tasks below. */
function AlertsCard() {
    const site = useSite();
    const { dr, compareOn } = useSiteRange();
    const gsc = useGsc<GscSummary>(site.hasGsc ? 'summary' : null);
    const ga = useGa4<Ga4Summary>(site.hasGa4 ? 'summary' : null);
    const queries = useGsc<GscRowsResponse>(site.hasGsc && compareOn ? 'queries' : null);
    const { open } = useSiteActions({ includeAudit: true });
    const outage = useGoogleOutage();
    const gscWindow = useMemo(() => ({ start: dr.resolvedSearch.start, end: gsc.data?.lastDate ?? dr.resolvedSearch.end, prevStart: dr.resolvedSearch.prevStart, prevEnd: dr.resolvedSearch.prevEnd }), [dr.resolvedSearch, gsc.data?.lastDate]);
    const list = useMemo(() => siteAnomalies({
        gsc: gsc.data,
        gscWindow,
        ga4: ga.data,
        ga4Window: dr.resolved,
        queries: compareOn ? queries.data : null,
    }), [gsc.data, gscWindow, ga.data, dr.resolved, compareOn, queries.data]);
    const loading = (site.hasGsc && gsc.state === 'loading') || (site.hasGa4 && ga.state === 'loading');
    const openTypes = new Set(open.map((a) => a.type));
    // Search Console runs ~2 days behind, so its comparison ends earlier than the page range: say so instead
    // of showing a window that does not match the header (round 4 polish).
    const span = site.hasGsc && site.hasGa4 && windowText(gscWindow) !== windowText(dr.resolved)
        ? `${windowText(dr.resolved)} (search: ${windowText(gscWindow)}, as Search Console data lags)`
        : windowText(site.hasGsc ? gscWindow : dr.resolved);
    const name = site.siteHost ?? site.label;

    if (loading && list.length === 0) return <Skeleton className="h-12 rounded-card" />;
    if (list.length === 0 && outage.any) {
        // Not "No unusual changes": the numbers were never read.
        return (
            <Card as="section" padding="sm" aria-label="Alerts" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <AlertTriangle aria-hidden size={16} className="shrink-0 text-warn" />
                <h3 className="text-body-sm font-medium text-fg">Couldn&apos;t check for changes</h3>
                <p className="text-meta text-fg-muted">{outage.names} didn&apos;t answer, so unusual changes can&apos;t be flagged until it does</p>
            </Card>
        );
    }
    if (list.length === 0) {
        return (
            <Card as="section" padding="sm" aria-label="Alerts" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <CheckCircle2 aria-hidden size={16} className="shrink-0 text-up" />
                <h3 className="text-body-sm font-medium text-fg">No unusual changes</h3>
                <p className="text-meta text-fg-muted">{span} · we flag swings of 20% or more, unusual days and queries that drop off page one</p>
            </Card>
        );
    }
    return (
        <SectionCard
            title="Alerts"
            description="Unusual changes in this site's numbers"
            actions={<AskButton size="sm" variant="ghost" from="site:alert" label="Ask AI about these" site={{ ga4: site.ga4, gsc: site.gsc }}
                prompt={`About ${name}: ${list.map((a) => `${a.title} (${a.detail})`).join('; ')}. What caused these changes and what should I do?`} />}
        >
            <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                {list.map((a) => {
                    const Icon = a.severity === 'success' ? TrendingUp : AlertTriangle;
                    const tone = a.severity === 'critical' ? 'text-down' : a.severity === 'warning' ? 'text-warn' : 'text-up';
                    const task = a.task && openTypes.has(a.task) ? a.task : null;
                    return (
                        <li key={a.id} className="flex items-start gap-3">
                            <Icon aria-hidden size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                            <div className="min-w-0 flex-1">
                                <p className="text-body-sm font-medium text-fg">{a.title}</p>
                                <p className="mt-0.5 text-meta text-fg-muted [overflow-wrap:anywhere]">{a.detail}</p>
                            </div>
                            {task ? (
                                <Link href={`${siteHref(site.host, 'actions')}?type=${task}`} className="tap-area shrink-0 text-meta font-medium text-brand-text hover:underline">See the fix</Link>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </SectionCard>
    );
}

function NextActionsCard() {
    const site = useSite();
    // includeAudit: the same list (and count) as the Actions page.
    const { open, settled, actions, setStatus, saveUnavailable } = useSiteActions({ includeAudit: true });
    const top = open.slice(0, 3);
    // The rows show once the tasks load; the count waits for the audit too, so it always matches Actions.
    const ready = Boolean(actions.data) || actions.state === 'error';
    // Some Google reports failed on the server: the list holds only what could be checked (audit #5).
    const partial = actions.data?.partial.length ? actions.data.partial : null;
    const missing = partial ? [partial.some((p) => p.startsWith('Search')) ? 'Search' : null, partial.some((p) => p.startsWith('Analytics')) ? 'traffic' : null].filter(Boolean).join(' and ') : '';
    return (
        <SectionCard
            title="What to fix next"
            description={settled ? (open.length > top.length ? `Top ${top.length} of ${fmtFull(open.length)} open tasks, ranked by expected impact` : `${fmtFull(open.length)} open ${open.length === 1 ? 'task' : 'tasks'}, ranked by expected impact`) : 'Ranked from your search and traffic data'}
            actions={<Button asChild size="sm" variant="ghost" trailingIcon={ArrowRight}><Link href={siteHref(site.host, 'actions')}>{settled && open.length ? `All ${fmtFull(open.length)} actions` : 'All actions'}</Link></Button>}
        >
            {partial ? (
                <p className="-mt-1 mb-3 flex items-start gap-1.5 text-meta text-fg-muted">
                    <AlertTriangle aria-hidden size={14} className="mt-px shrink-0 text-warn" />
                    {missing ? `${missing.charAt(0).toUpperCase()}${missing.slice(1)} tasks are missing until Google answers.` : 'Some tasks are missing until Google answers.'}
                </p>
            ) : null}
            {actions.state === 'error' ? <LoadError error={actions.error} onRetry={actions.mutate} /> : !ready ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : top.length === 0 && partial ? null : top.length === 0 ? (
                <EmptyState variant="inline" icon={CheckCircle2} title="Nothing urgent to fix" description="We look for decaying pages, near-page-one queries, low CTR, cannibalization and traffic drops." />
            ) : (
                <ActionList className="-mx-5 -mb-5 border-t border-border-subtle">
                    {top.map((a) => (
                        <ActionRow
                            key={a.id}
                            action={a}
                            site={{ ga4: site.ga4, gsc: site.gsc, siteHost: site.siteHost }}
                            canSave={!saveUnavailable}
                            onStatus={(s, undo) => void setStatus(a, s, { undo })}
                        />
                    ))}
                </ActionList>
            )}
        </SectionCard>
    );
}
