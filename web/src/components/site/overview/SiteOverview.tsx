'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { useAlerts } from '@/lib/useDashboardData';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { siteHref } from '@/components/shell/nav';
import { ActionCard } from '../ActionCard';
import type { Ga4Summary } from '../lib/types';
import { SiteHeader } from '../SiteHeader';
import { AskButton, askHref, LoadError } from '../SiteStates';
import { SearchSummary, SectionCard, TrafficSummary } from '../SummaryPanels';
import { PagesCard, SearchBreakdownCard, SourcesCard, TechCard } from '../breakdown/Cards';
import { GeoCard } from '../breakdown/GeoCard';
import { PageRows } from '../pages/PageRows';
import { SearchVsTrafficCard } from './SearchVsTrafficCard';
import { useSiteActions } from '../useSiteActions';
import { useGa4, useSite, useSiteRange } from '../useSiteData';

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
            {/* Alerts are a compact strip sized to their content; the task cards get the full width. */}
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
                <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                    {list.map((a) => {
                        const Icon = a.severity === 'critical' || a.severity === 'warning' ? AlertTriangle : a.severity === 'success' ? CheckCircle2 : Info;
                        const tone = a.severity === 'critical' ? 'text-down' : a.severity === 'warning' ? 'text-warn' : a.severity === 'success' ? 'text-up' : 'text-info';
                        return (
                            <li key={a.id} className="flex items-start gap-3">
                                <Icon aria-hidden size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-body-sm font-medium text-fg">{a.title}</p>
                                    {a.description ? <p className="mt-0.5 line-clamp-2 text-meta text-fg-muted">{a.description}</p> : null}
                                </div>
                                <Link
                                    href={askHref(`About ${site.siteHost ?? site.label}: "${a.title}". ${a.description ?? ''} What caused it and what should I do?`, { ga4: site.ga4, gsc: site.gsc }, 'site:alert')}
                                    className="tap-area shrink-0 text-meta font-medium text-brand-text hover:underline"
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
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
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
