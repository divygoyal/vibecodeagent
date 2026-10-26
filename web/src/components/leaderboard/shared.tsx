'use client';

import type { ReactNode } from 'react';
import { Activity, ShieldCheck, ShieldQuestion } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Pill } from '@/components/ui/Pill';
import { Tooltip } from '@/components/ui/Tooltip';
import { Sparkline } from '@/components/charts/Sparkline';
import { CATEGORY_LABELS, OPEN_TO_OPTIONS } from '@/lib/leaderboard/constants';
import { metricExact, metricText } from '@/lib/leaderboard/format';
import type { CountMetric, OpenTo, SparkData, VerificationPublic } from '@/lib/leaderboard/types';
import type { MetricKey } from '@/lib/metrics';

/** Rank: a small medal for 1-3, plain number after that (DESIGN 5.18). */
export function RankMark({ rank, className }: { rank: number | null; className?: string }) {
    if (rank === null) return <span className={cn('inline-block w-7 text-center text-body-sm text-fg-faint', className)}>–</span>;
    const medal = rank === 1 ? '#c99a1f' : rank === 2 ? '#8e97a6' : rank === 3 ? '#b3702f' : null;
    if (!medal) {
        return <span className={cn('inline-block w-7 text-center text-body-sm font-medium text-fg-muted tabular-nums', className)}>{rank}</span>;
    }
    return (
        <span className={cn('relative inline-flex size-7 items-center justify-center', className)} role="img" aria-label={`Rank ${rank}`}>
            <svg aria-hidden width="28" height="28" viewBox="0 0 28 28" className="absolute inset-0">
                <circle cx="14" cy="14" r="12" fill="none" stroke={medal} strokeWidth="2" />
                <circle cx="14" cy="14" r="9" fill={medal} fillOpacity="0.14" />
            </svg>
            <span aria-hidden className="relative text-meta font-semibold text-fg tabular-nums">{rank}</span>
        </span>
    );
}

/** Verification level as the badge the spec names. `compact` shortens the label for rows. */
export function VerificationBadge({ v, compact, className }: { v: VerificationPublic; compact?: boolean; className?: string }) {
    if (v.level === 'owner') {
        return (
            <Tooltip content="Owner or full user of this domain in Google Search Console. Checked daily.">
                <span tabIndex={0} className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-meta font-semibold whitespace-nowrap text-brand-soft-fg', className)}>
                    <ShieldCheck aria-hidden size={14} strokeWidth={1.75} />
                    {compact ? 'Verified owner' : 'Verified owner (Search Console)'}
                </span>
            </Tooltip>
        );
    }
    if (v.level === 'ga4') {
        return (
            <Tooltip content="The Google Analytics property matches this domain. Ownership in Search Console is not confirmed.">
                <span tabIndex={0} className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-info-soft px-2.5 text-meta font-semibold whitespace-nowrap text-info', className)}>
                    <Activity aria-hidden size={14} strokeWidth={1.75} />
                    GA4 connected
                </span>
            </Tooltip>
        );
    }
    return (
        <Pill tone="warn" icon={<ShieldQuestion aria-hidden size={14} strokeWidth={1.75} />} className={className}>
            Pending verification
        </Pill>
    );
}

/** Second signal next to the owner badge. */
export function Ga4Badge({ className }: { className?: string }) {
    return (
        <Tooltip content="The Google Analytics data stream matches this domain.">
            <span tabIndex={0} className={cn('inline-flex', className)}><Badge variant="info">GA4</Badge></span>
        </Tooltip>
    );
}

/** Percent change from a ready-made delta (the API sends percentages, not both periods). */
export function PctDelta({ pct, size = 'sm', variant = 'text', comparisonLabel }: { pct: number | null | undefined; size?: 'sm' | 'md'; variant?: 'text' | 'chip'; comparisonLabel?: string }) {
    if (pct === null || pct === undefined) return <span className="text-meta text-fg-faint">new</span>;
    return <MetricDelta metric="users" current={100 + pct} previous={100} size={size} variant={variant} comparisonLabel={comparisonLabel} />;
}

/** A shared count: the number, or the band with a tooltip that says it is a range. */
export function CountValue({ m, className, bold = true }: { m: CountMetric | null | undefined; className?: string; bold?: boolean }) {
    const text = metricText(m);
    if (!m || !text) return <span className={cn('text-fg-faint', className)}>–</span>;
    if (m.mode === 'range') {
        return (
            <Tooltip content="The owner shares a range, not the exact number.">
                <span tabIndex={0} className={cn('tabular-nums', bold && 'font-semibold', className)}>{text}</span>
            </Tooltip>
        );
    }
    const exact = metricExact(m);
    return (
        <Tooltip content={exact && exact !== text ? exact : null}>
            <span tabIndex={exact && exact !== text ? 0 : undefined} className={cn('tabular-nums', bold && 'font-semibold', className)}>{text}</span>
        </Tooltip>
    );
}

export function RowSpark({ spark, height = 28, className }: { spark: SparkData | null; height?: number; className?: string }) {
    if (!spark || spark.values.filter((v) => v !== null).length < 2) {
        return <span className="text-meta text-fg-faint">No trend</span>;
    }
    const metric: MetricKey = spark.metric === 'clicks' ? 'clicks' : 'users';
    return (
        <span className={cn('block w-full', className)} title={spark.mode === 'range' ? 'Shape only. The owner shares a range.' : undefined}>
            <Sparkline series={[{ metric, values: spark.values }]} height={height} interactive={false} />
        </span>
    );
}

export function CategoryBadge({ name }: { name: string | null }) {
    if (!name) return null;
    return <Badge variant="neutral">{CATEGORY_LABELS[name] ?? name}</Badge>;
}

const OPEN_LABEL: Record<OpenTo, string> = { sponsorships: 'Sponsorships', acquisition: 'Acquisition', partnerships: 'Partnerships' };

export function OpenToChips({ items, className, limit }: { items: OpenTo[]; className?: string; limit?: number }) {
    if (items.length === 0) return null;
    const shown = limit ? items.slice(0, limit) : items;
    return (
        <span className={cn('flex flex-wrap items-center gap-1', className)}>
            {shown.map((o) => (
                <Tooltip key={o} content={OPEN_TO_OPTIONS.find((x) => x.value === o)?.hint ?? ''}>
                    <span tabIndex={0}><Badge variant="outline">{OPEN_LABEL[o]}</Badge></span>
                </Tooltip>
            ))}
            {limit && items.length > limit ? <Badge variant="outline">+{items.length - limit}</Badge> : null}
        </span>
    );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
    return <h2 id={id} className="text-title text-fg">{children}</h2>;
}
