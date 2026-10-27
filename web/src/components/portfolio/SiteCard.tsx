'use client';

import Link from 'next/link';
import { memo, type MouseEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ChevronRight, Link2, Star } from 'lucide-react';

import { Badge, Favicon, MetricDelta, Pill, Skeleton, Tooltip, cardBaseClass, cardInteractiveClass } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { cn } from '@/lib/cn';
import { computeDelta, deltaOptionsFor, fmtDateRange, fmtDay, fmtPercent } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import type { DateWindow, PortfolioSite } from '@/lib/portfolio/types';
import { SiteMenu, type SiteMenuActions } from './SiteMenu';
import { SiteStatusPill } from './SiteStatusPill';

export type CardView = 'search' | 'traffic';

export interface SiteCardProps {
    site: PortfolioSite;
    windows: { search: DateWindow | null; traffic: DateWindow | null };
    dates: { search: string[]; traffic: string[] };
    /** Which metrics lead and which pair the sparkline draws. */
    view: CardView;
    /** Global sync running (pending sites show "Syncing"). */
    syncing: boolean;
    /** Exact users for this range are loading. */
    usersPending?: boolean;
    href: string;
    onOpen?: (site: PortfolioSite) => void;
    onToggleStar?: (site: PortfolioSite) => void;
    menu?: SiteMenuActions;
    /** 56px sparkline and chevron instead of "Details" (phones). */
    compact?: boolean;
    readOnly?: boolean;
}

/** Previous totals under this are noise: the delta is shown without colour (DESIGN 6.7). */
const TINY = 20;

function Metric({ metric, value, previous, labelFirst, dot = true, label, small, loading }: {
    metric: MetricKey;
    value: number | null | undefined;
    previous: number | null | undefined;
    labelFirst?: boolean;
    dot?: boolean;
    label?: string;
    /** Secondary row (GA4 under Search Console): body-size numbers. */
    small?: boolean;
    /** Number still loading (exact users being fetched): a bar in its place. */
    loading?: boolean;
}) {
    const m = METRICS[metric];
    const short = label ?? m.short;
    const tiny = typeof previous === 'number' && previous > 0 && previous < TINY && m.format === 'count';
    return (
        <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            {dot ? <span aria-hidden className={cn('shrink-0 self-center rounded-full', small ? 'size-1.5' : 'size-2')} style={{ background: m.color }} /> : null}
            {labelFirst ? <span className="text-body-sm text-fg-muted">{short}</span> : null}
            {loading ? (
                <Skeleton className={cn('self-center', small ? 'h-3.5 w-10' : 'h-4 w-12')} delay={0} />
            ) : (
                <span className={cn('text-fg tabular-nums', small ? 'text-body font-semibold' : 'text-stat-sm')}>{fmtMetric(metric, value, { compact: true })}</span>
            )}
            {labelFirst ? null : <span className="text-body-sm text-fg-muted">{short}</span>}
            {loading || previous === null || previous === undefined ? null : (
                <MetricDelta metric={metric} current={value} previous={previous} className={tiny ? 'text-fg-muted!' : undefined} />
            )}
        </span>
    );
}

function EngagementMetric({ value, previous }: { value: number | null; previous: number | null | undefined }) {
    const d = previous === null || previous === undefined ? null : computeDelta(value, previous, deltaOptionsFor('percent', 'up'));
    return (
        <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-body-sm text-fg-muted">eng.</span>
            <span className="text-stat-sm text-fg tabular-nums">{fmtPercent(value, { tile: true })}</span>
            {d ? <MetricDelta format="percent" current={value} previous={previous} /> : null}
        </span>
    );
}

function SearchMetrics({ site, small }: { site: PortfolioSite; small?: boolean }) {
    const s = site.search!;
    return (
        <div className={cn('flex flex-wrap items-baseline gap-y-1', small ? 'gap-x-3' : 'gap-x-4')}>
            <Metric metric="clicks" value={s.cur.clicks} previous={s.prev?.clicks} small={small} />
            <Metric metric="impressions" value={s.cur.impressions} previous={s.prev?.impressions} small={small} />
            <Metric metric="position" value={s.cur.position} previous={s.prev ? s.prev.position : undefined} labelFirst dot={false} small={small} />
        </div>
    );
}

function TrafficMetrics({ site, withEngagement, small, usersPending }: { site: PortfolioSite; withEngagement?: boolean; small?: boolean; usersPending?: boolean }) {
    const t = site.traffic!;
    return (
        <div className={cn('flex flex-wrap items-baseline gap-y-1', small ? 'gap-x-3' : 'gap-x-4')}>
            <Metric metric="users" value={t.cur.users} previous={t.prev?.users} small={small} loading={usersPending && !t.cur.usersExact} />
            <Metric metric="sessions" value={t.cur.sessions} previous={t.prev?.sessions} small={small} />
            {withEngagement ? <EngagementMetric value={t.cur.engagementRate} previous={t.prev ? t.prev.engagementRate : undefined} /> : null}
        </div>
    );
}

/** Lowercase chip that tells apart sites sharing a host ("http", "www", "/blog"). */
export function VariantChip({ text, className }: { text: string; className?: string }) {
    return (
        <span className={cn('inline-flex h-5 shrink-0 items-center rounded-badge bg-subtle px-1.5 text-caption text-fg-secondary', className)}>
            {text}
        </span>
    );
}

export function alertChipText(site: PortfolioSite): string | null {
    const a = site.alerts[0];
    if (!a) return null;
    if (a.type === 'zero') return `No ${a.metric} · ${a.days}d`;
    return `${a.metric === 'clicks' ? 'Clicks' : 'Users'} −${Math.round(-(a.changePct ?? 0))}%`;
}

function ariaSummary(site: PortfolioSite): string {
    const parts = [site.label];
    if (site.search) {
        const d = computeDelta(site.search.cur.clicks, site.search.prev?.clicks, deltaOptionsFor('count', 'up'));
        parts.push(`${fmtMetric('clicks', site.search.cur.clicks)} clicks${d.state === 'change' ? `, ${d.srText}` : ''}`);
    }
    if (site.traffic) {
        const d = computeDelta(site.traffic.cur.users, site.traffic.prev?.users, deltaOptionsFor('count', 'up'));
        parts.push(`${fmtMetric('users', site.traffic.cur.users)} users${d.state === 'change' ? `, ${d.srText}` : ''}`);
    }
    if (site.alerts.length) parts.push(site.alerts.map((a) => a.message).join(', '));
    return parts.join(', ');
}

/**
 * Portfolio card (DESIGN 3.25, the owner's reference): identity row, metric
 * rows with deltas, a two-series sparkline and a status footer. The whole
 * card links to the site overview; star, menu and "Details" sit above the link.
 */
export const SiteCard = memo(function SiteCard({
    site, windows, dates, view, syncing, usersPending, href, onOpen, onToggleStar, menu, compact, readOnly,
}: SiteCardProps) {
    const hasSearch = Boolean(site.search);
    const hasTraffic = Boolean(site.traffic);
    const loadingData = !hasSearch && !hasTraffic && (site.status === 'syncing' || site.status === 'pending');
    const greyed = site.status === 'error' || site.status === 'no_access';
    const trafficFirst = view === 'traffic' || !hasSearch;

    const sparkSeries = trafficFirst && hasTraffic
        ? { s: [{ metric: 'users' as const, values: site.series.users ?? [] }, { metric: 'sessions' as const, values: site.series.sessions ?? [] }], d: dates.traffic }
        : hasSearch
            ? { s: [{ metric: 'clicks' as const, values: site.series.clicks ?? [] }, { metric: 'impressions' as const, values: site.series.impressions ?? [] }], d: dates.search }
            : null;
    const window = trafficFirst && hasTraffic ? windows.traffic : hasSearch ? windows.search : windows.traffic;
    const chip = alertChipText(site);
    const critical = site.alerts[0]?.severity === 'critical';
    const sparkHeight = compact ? 56 : 72;

    const open = (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        onOpen?.(site);
    };

    let metrics: ReactNode;
    if (loadingData) {
        metrics = (
            <div className="flex flex-col gap-2" aria-hidden>
                <div className="flex gap-4"><Skeleton className="h-5 w-28" delay={0} /><Skeleton className="h-5 w-24" delay={0} /></div>
                <Skeleton className="h-5 w-20" delay={0} />
            </div>
        );
    } else if (!hasSearch && !hasTraffic) {
        metrics = <p className="text-body-sm text-fg-muted">{site.status === 'no_access' ? 'No access to this property' : 'No data yet'}</p>;
    } else {
        // The view's source leads at full size; the paired source follows as a smaller row.
        const blocks = trafficFirst
            ? [<TrafficMetrics key="t" site={site} withEngagement={!hasSearch} usersPending={usersPending} />, hasSearch ? <SearchMetrics key="s" site={site} small /> : null]
            : [<SearchMetrics key="s" site={site} />, hasTraffic ? <TrafficMetrics key="t" site={site} small usersPending={usersPending} /> : null];
        metrics = <div className={cn('flex flex-col gap-1.5', greyed && 'opacity-50')}>{blocks}</div>;
    }

    return (
        <article
            className={cn(cardBaseClass, !readOnly && cardInteractiveClass, 'group/card @container relative flex min-w-0 flex-col gap-3 p-4')}
            data-site={site.slug}
        >
            {readOnly ? null : (
                <Link
                    href={href}
                    prefetch={false}
                    onClick={open}
                    aria-label={ariaSummary(site)}
                    className="absolute inset-0 z-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
                />
            )}

            <div className="flex min-w-0 items-center gap-2">
                <Favicon host={site.host || site.label} size={20} />
                <h3 className="min-w-0 truncate text-title-sm text-fg" title={site.gsc?.siteUrl ?? site.ga4?.displayName ?? site.label}>{site.label}</h3>
                {site.variant ? <VariantChip text={site.variant} /> : null}
                {/* Narrow cards and phones keep the room for the host; the full URL is in its
                    tooltip. No GA4 badge: the users row already says the site has Analytics. */}
                {site.gsc ? (
                    <Badge className="hidden @xs:inline-flex max-sm:hidden">{site.gsc.propertyType === 'domain' ? 'Domain' : 'Prefix'}</Badge>
                ) : null}
                <span className="flex-1" />
                {readOnly ? (
                    site.starred ? <Star aria-label="Starred" size={16} strokeWidth={1.75} className="shrink-0 fill-star text-star" /> : null
                ) : (
                    <button
                        type="button"
                        aria-pressed={site.starred}
                        aria-label={`Star ${site.label}${site.variant ? ` (${site.variant})` : ''}`}
                        onClick={() => onToggleStar?.(site)}
                        className={cn(
                            'relative z-[1] -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-120 hover:bg-subtle pointer-coarse:size-11',
                            site.starred ? 'text-star' : 'text-fg-faint hover:text-fg-muted',
                        )}
                    >
                        <Star aria-hidden size={16} strokeWidth={1.75} className={site.starred ? 'fill-star' : undefined} />
                    </button>
                )}
            </div>

            {metrics}

            <div
                className={cn('relative mt-auto', !readOnly && 'z-[1] cursor-pointer', greyed && 'opacity-50')}
                onClick={readOnly ? undefined : () => onOpen?.(site)}
            >
                {loadingData ? (
                    <Skeleton className="w-full" style={{ height: sparkHeight }} delay={0} />
                ) : sparkSeries ? (
                    <Sparkline series={sparkSeries.s} dates={sparkSeries.d} height={sparkHeight} />
                ) : (
                    <div style={{ height: sparkHeight }} />
                )}
            </div>

            <div className="flex min-w-0 items-center gap-1.5">
                <SiteStatusPill site={site} syncing={syncing} className="shrink-0" />
                {chip ? (
                    <Tooltip content={site.alerts.map((a) => a.message).join(' · ')}>
                        <span className="relative z-[1] inline-flex min-w-0" tabIndex={0}>
                            <Pill tone={critical ? 'down' : 'warn'} icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} />} className="min-w-0">
                                <span className="truncate">{chip}</span>
                            </Pill>
                        </span>
                    </Tooltip>
                ) : window && !loadingData ? (
                    <span className="min-w-0 truncate text-meta whitespace-nowrap text-fg-muted">
                        {greyed && site.lastSyncedAt ? `Last data ${fmtDay(new Date(site.lastSyncedAt * 1000))}` : fmtDateRange(window.curStart, window.curEnd)}
                    </span>
                ) : null}
                <span className="flex-1" />
                {site.ga4 && site.gsc ? (
                    <Tooltip content={`GA4 property ${site.ga4.propertyId} linked${site.pairing === 'manual' ? ' (set by you)' : ''}`}>
                        <span tabIndex={0} className="relative z-[1] hidden rounded text-fg-faint @[21rem]:inline-flex">
                            <Link2 aria-label="GA4 linked" size={14} strokeWidth={1.75} />
                        </span>
                    </Tooltip>
                ) : null}
                {menu && !readOnly ? (
                    <SiteMenu
                        site={site}
                        actions={menu}
                        className="relative z-[1] size-6! pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100 data-[state=open]:opacity-100"
                    />
                ) : null}
                {readOnly ? null : compact ? (
                    <ChevronRight aria-hidden size={16} className="relative z-0 text-fg-muted" />
                ) : (
                    <Link
                        href={href}
                        prefetch={false}
                        onClick={open}
                        tabIndex={-1}
                        className="relative z-[1] inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-fg-secondary underline-offset-4 hover:text-fg hover:underline"
                    >
                        Details
                        <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </Link>
                )}
            </div>
        </article>
    );
});

/** Card-shaped skeleton (DESIGN 3.15: favicon, 2 text bars, number bars, 72px block, footer pill). */
export function SiteCardSkeleton({ compact, delay }: { compact?: boolean; delay?: number }) {
    return (
        <div className={cn(cardBaseClass, 'flex flex-col gap-3 p-4')} aria-hidden>
            <div className="flex items-center gap-2">
                <Skeleton className="size-5" rounded="sm" delay={delay} />
                <Skeleton className="h-4 w-40" delay={delay} />
                <Skeleton className="h-5 w-14" delay={delay} />
                <span className="flex-1" />
                <Skeleton className="size-4" delay={delay} />
            </div>
            <div className="flex gap-4">
                <Skeleton className="h-5 w-28" delay={delay} />
                <Skeleton className="h-5 w-24" delay={delay} />
            </div>
            <Skeleton className="h-5 w-20" delay={delay} />
            <Skeleton className="w-full" style={{ height: compact ? 56 : 72 }} delay={delay} />
            <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-16" rounded="full" delay={delay} />
                <Skeleton className="h-3 w-24" delay={delay} />
                <span className="flex-1" />
                <Skeleton className="h-3 w-14" delay={delay} />
            </div>
        </div>
    );
}
