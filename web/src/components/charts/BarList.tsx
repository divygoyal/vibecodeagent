'use client';

import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { fmtFull, fmtPercent } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { fmtShare, heatbarClass } from './style';

export interface BarListItem {
    key: string;
    label: ReactNode;
    /** Plain text label for the full table and title attribute. */
    text?: string;
    value: number;
    /** Favicon, flag or icon, 16px. */
    icon?: ReactNode;
    href?: string;
}

export interface BarListProps {
    items: BarListItem[];
    /** Heat-bar colour and value format. 'neutral' = grey bars, full counts. */
    metric: MetricKey | 'neutral';
    /** Rows shown before "View all" (default 8). */
    limit?: number;
    /** Show share of total after the value. */
    showShare?: boolean;
    /** Override the value format (default full numbers for the metric). */
    formatValue?: (v: number) => string;
    /**
     * Serializable alternative to `formatValue`, for Server Components (which
     * cannot pass functions to this client component). 'percent100' renders a
     * 0-100 share as a percentage.
     */
    valueFormat?: 'percent100';
    onItemClick?: (item: BarListItem) => void;
    /** Header of the label column in the "View all" table. */
    labelHeader?: string;
    valueHeader?: string;
    /** Custom "View all": otherwise a Drawer with the full Table opens. */
    onViewAll?: () => void;
    viewAllTitle?: string;
    loading?: boolean;
    empty?: ReactNode;
    className?: string;
    /**
     * Fill a stretched parent (a card in an equal-height row): the list grows and
     * "View all" sits at the bottom. The parent must be a flex column.
     */
    fill?: boolean;
}

/**
 * Plausible-style list with heat bars behind labels (DESIGN 3.7): sources,
 * pages, countries, devices, queries.
 */
export function BarList({
    items, metric, limit = 8, showShare, formatValue, valueFormat, onItemClick, labelHeader = 'Name', valueHeader, onViewAll, viewAllTitle = 'All rows', loading, empty, className, fill,
}: BarListProps) {
    const [open, setOpen] = useState(false);
    const fmt = formatValue
        ?? (valueFormat === 'percent100' ? (v: number) => fmtPercent(v / 100, { tile: true }) : undefined)
        ?? ((v: number) => (metric === 'neutral' ? fmtFull(v) : fmtMetric(metric, v)));
    const total = items.reduce((a, b) => a + (Number.isFinite(b.value) ? b.value : 0), 0);
    const max = Math.max(0, ...items.map((i) => i.value));
    const shown = items.slice(0, limit);
    const heat = heatbarClass(metric);

    if (loading) {
        return (
            <div className={cn('flex flex-col gap-1', fill && 'flex-1', className)} aria-busy>
                {Array.from({ length: fill ? limit : Math.min(limit, 6) }, (_, i) => (
                    <div key={i} className="flex h-8 items-center gap-3">
                        <Skeleton className="h-6 rounded-md" style={{ width: `${85 - i * 12}%` }} />
                        <Skeleton className="ml-auto h-3 w-10" />
                    </div>
                ))}
            </div>
        );
    }
    if (items.length === 0) return <>{empty ?? <p className="py-6 text-center text-body text-fg-muted">No data</p>}</>;

    return (
        <div className={cn(fill && 'flex flex-1 flex-col', className)}>
            <ul className="flex flex-col">
                {shown.map((item) => {
                    const pct = max > 0 ? (item.value / max) * 100 : 0;
                    const content = (
                        <>
                            <span className="relative flex min-w-0 flex-1 items-center gap-2 py-1 pl-2">
                                <span aria-hidden className={cn('absolute inset-y-0 left-0 rounded-md transition-opacity duration-120 group-hover:opacity-80', heat)} style={{ width: `${Math.max(pct, 0.5)}%` }} />
                                {item.icon ? <span className="relative flex size-4 shrink-0 items-center justify-center">{item.icon}</span> : null}
                                <span className="relative min-w-0 truncate text-body text-fg" title={item.text}>{item.label}</span>
                            </span>
                            <span className="shrink-0 pl-3 text-body text-fg tabular-nums">{fmt(item.value)}</span>
                            {showShare ? <span className="w-11 shrink-0 text-right text-meta text-fg-muted tabular-nums">{total > 0 ? fmtShare(item.value / total) : '–'}</span> : null}
                        </>
                    );
                    const rowCls = 'group flex h-8 w-full items-center gap-1 rounded-md text-left';
                    return (
                        <li key={item.key}>
                            {item.href ? (
                                <a href={item.href} className={cn(rowCls, 'hover:bg-subtle/40')}>{content}</a>
                            ) : onItemClick ? (
                                <button type="button" onClick={() => onItemClick(item)} className={cn(rowCls, 'cursor-pointer hover:bg-subtle/40')}>{content}</button>
                            ) : (
                                <div className={rowCls}>{content}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {items.length > limit ? (
                <div className={cn('flex justify-end', fill ? 'mt-auto pt-2' : 'mt-2')}>
                    <Button variant="link" size="sm" onClick={() => (onViewAll ? onViewAll() : setOpen(true))}>
                        View all {fmtFull(items.length)} →
                    </Button>
                </div>
            ) : null}
            {!onViewAll ? (
                <Drawer open={open} onOpenChange={setOpen} title={viewAllTitle} subtitle={`${fmtFull(items.length)} rows`} width="wide">
                    <Table
                        rows={items}
                        rowKey={(r) => r.key}
                        defaultSort={{ key: 'value', dir: 'desc' }}
                        pagination={{ pageSize: 50 }}
                        onRowClick={onItemClick}
                        columns={[
                            { key: 'label', header: labelHeader, cell: (r) => <span className="flex items-center gap-2">{r.icon}{r.label}</span>, sortable: true, sortValue: (r) => r.text ?? String(r.key), firstSortDir: 'asc', heat: { metric, value: (r) => r.value } },
                            { key: 'value', header: valueHeader ?? (metric === 'neutral' ? 'Value' : METRICS[metric].label), align: 'right', cell: (r) => fmt(r.value), sortable: true, sortValue: (r) => r.value },
                            ...(showShare ? [{ key: 'share', header: 'Share', align: 'right' as const, cell: (r: BarListItem) => (total > 0 ? fmtShare(r.value / total) : '–') }] : []),
                        ]}
                    />
                </Drawer>
            ) : null}
        </div>
    );
}
