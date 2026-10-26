'use client';

import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';

import { Badge, MetricDelta, Pill, StatusPill } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { cn } from '@/lib/cn';
import { fmtDateRange, fmtPercent } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { VariantChip } from '@/components/portfolio/SiteCard';
import { SiteIcon } from '../site/SiteIcon';
import type { DemoPortfolio, DemoPortfolioSite } from './types';

export type CardView = 'search' | 'traffic';

function MetricItem({ metric, cur, prev, dot = true, labelFirst = false, label }: { metric: MetricKey; cur: number | null; prev: number | null | undefined; dot?: boolean; labelFirst?: boolean; label?: string }) {
    const m = METRICS[metric];
    const text = label ?? m.short;
    return (
        <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            {dot ? <span aria-hidden className="size-2 shrink-0 -translate-y-px self-center rounded-full" style={{ background: m.color }} /> : null}
            {labelFirst ? <span className="text-body-sm text-fg-muted">{text}</span> : null}
            <span className="text-stat-sm tabular-nums text-fg">{fmtMetric(metric, cur, { compact: true })}</span>
            {labelFirst ? null : <span className="text-body-sm text-fg-muted">{text}</span>}
            <MetricDelta metric={metric} current={cur} previous={prev} />
        </span>
    );
}

/**
 * Portfolio card (DESIGN 3.25) for the public demo: identity, metric row with
 * deltas, dual sparkline, status + range, Details. Read only; the whole card
 * links to the sample dashboard for that site.
 */
export function DemoSiteCard({ site, portfolio, view = 'search', sparkHeight = 72, className, linked = true }: {
    site: DemoPortfolioSite;
    portfolio: Pick<DemoPortfolio, 'dates' | 'windows'>;
    view?: CardView;
    sparkHeight?: number;
    className?: string;
    /** Card links to /demo/[slug]. */
    linked?: boolean;
}) {
    const showSearch = view === 'search' ? Boolean(site.search) : !site.traffic && Boolean(site.search);
    const showTraffic = !showSearch && Boolean(site.traffic);
    const win = showSearch ? portfolio.windows.search : portfolio.windows.traffic;
    const dates = showSearch ? portfolio.dates.search : portfolio.dates.traffic;
    const badge = site.gsc ? (site.gsc.propertyType === 'domain' ? 'Domain' : 'Prefix') : 'GA4';
    const alert = site.alerts[0];

    let ariaSummary = site.label;
    if (showSearch && site.search) ariaSummary += `, ${fmtMetric('clicks', site.search.cur.clicks)} clicks`;
    if (showTraffic && site.traffic) ariaSummary += `, ${fmtMetric('users', site.traffic.cur.users)} users`;

    const body = (
        <>
            <div className="flex items-center gap-2">
                <SiteIcon host={site.host} size={20} />
                <span className="min-w-0 truncate text-title-sm text-fg" title={site.label}>{site.label}</span>
                {site.variant ? <VariantChip text={site.variant} /> : null}
                <Badge>{badge}</Badge>
                {site.gsc && site.ga4 ? <Badge className="hidden sm:inline-flex">GA4</Badge> : null}
                <span className="flex-1" />
                {alert ? <Pill tone={alert.severity === 'critical' ? 'down' : 'warn'} className="h-5 px-2">{alert.type === 'zero' ? 'Zero' : 'Drop'}</Pill> : null}
                <Star
                    aria-label={site.starred ? 'Starred' : undefined}
                    aria-hidden={site.starred ? undefined : true}
                    size={16}
                    strokeWidth={1.75}
                    className={cn('shrink-0', site.starred ? 'fill-star text-star' : 'text-fg-faint')}
                />
            </div>

            <div className="flex min-h-12 flex-wrap items-baseline gap-x-4 gap-y-1">
                {showSearch && site.search ? (
                    <>
                        <MetricItem metric="clicks" cur={site.search.cur.clicks} prev={site.search.prev?.clicks} />
                        <MetricItem metric="impressions" cur={site.search.cur.impressions} prev={site.search.prev?.impressions} />
                        <MetricItem metric="position" cur={site.search.cur.position} prev={site.search.prev?.position} dot={false} labelFirst />
                    </>
                ) : showTraffic && site.traffic ? (
                    <>
                        <MetricItem metric="users" cur={site.traffic.cur.users} prev={site.traffic.prev?.users} />
                        <MetricItem metric="sessions" cur={site.traffic.cur.sessions} prev={site.traffic.prev?.sessions} />
                        <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                            <span className="text-body-sm text-fg-muted">eng.</span>
                            <span className="text-stat-sm tabular-nums text-fg">{fmtPercent(site.traffic.cur.engagementRate)}</span>
                        </span>
                    </>
                ) : (
                    <span className="text-body-sm text-fg-muted">No Analytics property linked to this Search Console site.</span>
                )}
            </div>

            <Sparkline
                height={sparkHeight}
                dates={dates}
                series={
                    showSearch
                        ? [{ metric: 'clicks', values: site.series.clicks ?? [] }, { metric: 'impressions', values: site.series.impressions ?? [] }]
                        : showTraffic
                            ? [{ metric: 'users', values: site.series.users ?? [] }, { metric: 'sessions', values: site.series.sessions ?? [] }]
                            : [{ metric: 'clicks', values: site.series.clicks ?? [] }]
                }
            />

            <div className="flex items-center gap-2">
                <StatusPill status="synced" />
                {win ? <span className="truncate text-meta text-fg-muted">{fmtDateRange(win.curStart, win.curEnd)}</span> : null}
                <span className="flex-1" />
                {linked ? (
                    <span className="inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary group-hover:text-fg">
                        Details <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </span>
                ) : null}
            </div>
        </>
    );

    const base = 'tc-card flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4 shadow-card';
    if (!linked) return <div className={cn(base, className)}>{body}</div>;
    return (
        <Link
            href={`/demo/${site.slug}`}
            aria-label={`${ariaSummary}. Open the sample dashboard`}
            className={cn(base, 'group transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0', className)}
        >
            {body}
        </Link>
    );
}
