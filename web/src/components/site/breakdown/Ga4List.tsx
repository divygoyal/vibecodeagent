'use client';

import { useMemo, type ReactNode } from 'react';

import { BarList, type BarListItem } from '@/components/charts/BarList';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtCurrency } from '@/lib/format';
import type { FilterKey } from '../lib/filters';
import type { Ga4Breakdown, Ga4BreakdownResponse, Ga4Row } from '../lib/types';
import { useFilterClick } from '../filters/SiteFilters';
import { LoadError } from '../SiteStates';
import { useActiveFilters, useGa4 } from '../useSiteData';

export type Ga4ListMetric = 'sessions' | 'users' | 'revenue';

const METRIC_FIELD: Record<Ga4ListMetric, string> = { sessions: 'sessions', users: 'activeUsers', revenue: 'totalRevenue' };
const METRIC_LABEL: Record<Ga4ListMetric, string> = { sessions: 'Sessions', users: 'Users', revenue: 'Revenue' };

export interface Ga4ListProps {
    report: Ga4Breakdown;
    /** GA4 dimension that is the row's filter value. */
    dim: string;
    metric: Ga4ListMetric;
    filterKey: FilterKey;
    /** Label, plain text and icon for a row (default: the raw value). */
    render?: (row: Ga4Row) => { label: ReactNode; text: string; icon?: ReactNode };
    include?: (row: Ga4Row) => boolean;
    limit?: number;
    showShare?: boolean;
    labelHeader: string;
    viewAllTitle: string;
    emptyTitle?: string;
    emptyDescription?: string;
    /** Grow to the card's height, "View all" at the bottom (cards in an equal-height row). */
    fill?: boolean;
}

/**
 * A GA4 breakdown as a bar list whose rows filter the page (Traffic) or open
 * Traffic filtered (other pages). Heat bars use the Analytics tint for every
 * list, so a page has at most two tints (Analytics, Search Console).
 */
export function Ga4List({
    report, dim, metric, filterKey, render, include, limit = 7, showShare, labelHeader, viewAllTitle, emptyTitle = 'No data in this period', emptyDescription, fill,
}: Ga4ListProps) {
    const q = useGa4<Ga4BreakdownResponse>(report);
    const click = useFilterClick();
    const active = useActiveFilters()[filterKey];
    const { items, raw } = useMemo(() => {
        // Revenue lists leave out rows that sold nothing.
        const rows = (q.data?.rows ?? []).filter((r) => (include ? include(r) : true) && (metric !== 'revenue' || (r.cur.totalRevenue ?? 0) > 0))
            .sort((a, b) => (metric === 'revenue' ? (b.cur.totalRevenue ?? 0) - (a.cur.totalRevenue ?? 0) : 0));
        const rawMap = new Map<string, string>();
        const list: BarListItem[] = rows.map((r) => {
            const value = r.dims[dim] ?? '';
            rawMap.set(r.key, value);
            const parts = render ? render(r) : { label: value, text: value };
            return { key: r.key, label: parts.label, text: parts.text, icon: parts.icon, value: r.cur[METRIC_FIELD[metric]] ?? 0 };
        });
        return { items: list, raw: rawMap };
    }, [q.data, include, render, dim, metric]);

    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <BarList
            items={items}
            metric="users"
            valueHeader={METRIC_LABEL[metric]}
            formatValue={metric === 'revenue' ? (n) => fmtCurrency(n, q.data?.currency, { compact: true }) : undefined}
            limit={limit}
            showShare={showShare}
            loading={q.state === 'loading'}
            labelHeader={labelHeader}
            viewAllTitle={viewAllTitle}
            fill={fill}
            onItemClick={active ? undefined : (item) => click(filterKey, raw.get(item.key) ?? '')}
            empty={<EmptyState variant="inline" title={emptyTitle} description={emptyDescription} />}
        />
    );
}

export function listMeta(metric: Ga4ListMetric, share?: boolean) {
    return <span className="flex gap-3"><span>{METRIC_LABEL[metric]}</span>{share ? <span className="w-12 text-right">Share</span> : null}</span>;
}
