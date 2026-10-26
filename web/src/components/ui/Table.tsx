'use client';

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtFull } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { Button } from './Button';
import { Card } from './Card';
import { Select } from './Select';
import { Skeleton } from './Skeleton';

export type SortDir = 'asc' | 'desc';
export interface SortState {
    key: string;
    dir: SortDir;
}

export interface TableColumn<T> {
    key: string;
    header: ReactNode;
    /** Cell content. Format numbers with lib/format (full numbers in tables). */
    cell: (row: T, index: number) => ReactNode;
    align?: 'left' | 'right' | 'center';
    /** Makes the header a sort button. Needs sortValue (client sort) or onSortChange (server sort). */
    sortable?: boolean;
    sortValue?: (row: T) => number | string | null | undefined;
    /** Default direction when this column is first sorted (numbers: desc). */
    firstSortDir?: SortDir;
    /** CSS width, e.g. '40%' or 120. */
    width?: string | number;
    /**
     * Heat bar behind the cell content (one column per table, usually the
     * label column) sized by value / max of the visible rows.
     */
    heat?: { metric: MetricKey | 'neutral'; value: (row: T) => number | null | undefined };
    className?: string;
    headerClassName?: string;
}

export interface TablePagination {
    /** Rows per page. */
    pageSize: number;
    /** Controlled page (0-based). Omit for internal state. */
    page?: number;
    onPageChange?: (page: number) => void;
    /** Server-side total. Omit to paginate `rows` on the client. */
    total?: number;
    pageSizes?: number[];
    onPageSizeChange?: (size: number) => void;
}

export interface TableProps<T> {
    columns: TableColumn<T>[];
    rows: T[];
    rowKey: (row: T, index: number) => string;
    /** Controlled sort. Omit for internal client-side sort starting at defaultSort. */
    sort?: SortState | null;
    onSortChange?: (sort: SortState) => void;
    defaultSort?: SortState;
    onRowClick?: (row: T) => void;
    /** compact h-9 · default h-10 · comfortable h-12 */
    density?: 'compact' | 'default' | 'comfortable';
    loading?: boolean;
    /** Shown in the body when there are no rows (use <EmptyState variant="inline" />). */
    empty?: ReactNode;
    /** Filter chips, search, export: rendered above the table inside the card. */
    toolbar?: ReactNode;
    pagination?: TablePagination;
    /** "View all" style footer instead of pagination. */
    footer?: ReactNode;
    /** Screen-reader caption. */
    caption?: string;
    /** First column sticks on horizontal scroll (default true). */
    stickyFirstColumn?: boolean;
    /** Wrap in a Card (default true). */
    card?: boolean;
    className?: string;
}

const ROW_H = { compact: 'h-9', default: 'h-10', comfortable: 'h-12' };
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Data table (DESIGN 3.13): sticky header, sortable columns with aria-sort,
 * tabular numbers, one optional heat-bar column, client or server pagination,
 * 8 skeleton rows while loading, horizontal scroll with a sticky first column.
 */
export function Table<T>({
    columns, rows, rowKey, sort: sortProp, onSortChange, defaultSort, onRowClick, density = 'default', loading, empty, toolbar,
    pagination, footer, caption, stickyFirstColumn = true, card = true, className,
}: TableProps<T>) {
    const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort ?? null);
    const sort = sortProp !== undefined ? sortProp : innerSort;
    const [innerPage, setInnerPage] = useState(0);
    const page = pagination?.page ?? innerPage;
    const setPage = (p: number) => {
        if (pagination?.onPageChange) pagination.onPageChange(p);
        if (pagination?.page === undefined) setInnerPage(p);
    };

    const sorted = useMemo(() => {
        if (!sort || onSortChange) return rows;
        const col = columns.find((c) => c.key === sort.key);
        if (!col?.sortValue) return rows;
        const sv = col.sortValue;
        const out = [...rows].sort((a, b) => compare(sv(a), sv(b)));
        return sort.dir === 'desc' ? out.reverse() : out;
    }, [rows, sort, columns, onSortChange]);

    const clientPaged = pagination && pagination.total === undefined;
    const total = pagination ? pagination.total ?? sorted.length : sorted.length;
    const visible = clientPaged ? sorted.slice(page * pagination.pageSize, (page + 1) * pagination.pageSize) : sorted;

    const heatCol = columns.find((c) => c.heat);
    const heatMax = heatCol?.heat ? Math.max(0, ...visible.map((r) => heatCol.heat!.value(r) ?? 0)) : 0;

    const toggleSort = (col: TableColumn<T>) => {
        const next: SortState = sort?.key === col.key
            ? { key: col.key, dir: sort.dir === 'desc' ? 'asc' : 'desc' }
            : { key: col.key, dir: col.firstSortDir ?? 'desc' };
        if (onSortChange) onSortChange(next);
        if (sortProp === undefined) setInnerSort(next);
    };

    const onRowKey = (e: KeyboardEvent, row: T) => {
        if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onRowClick(row);
        }
    };

    const stickyCell = (i: number) => (stickyFirstColumn && i === 0 ? 'sticky left-0 z-[1] bg-surface' : '');

    const table = (
        <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-body tabular-nums">
                {caption ? <caption className="sr-only">{caption}</caption> : null}
                <thead>
                    <tr>
                        {columns.map((c, i) => {
                            const active = sort?.key === c.key;
                            const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined;
                            const SortIcon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                            return (
                                <th
                                    key={c.key}
                                    scope="col"
                                    aria-sort={ariaSort}
                                    style={{ width: c.width }}
                                    className={cn(
                                        'h-9 border-b border-border-subtle bg-surface-sunken px-3 text-meta font-medium whitespace-nowrap text-fg-muted first:pl-4 last:pr-4',
                                        ALIGN[c.align ?? 'left'],
                                        stickyCell(i) && 'sticky left-0 z-[2] bg-surface-sunken',
                                        c.headerClassName,
                                    )}
                                >
                                    {c.sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => toggleSort(c)}
                                            className={cn('relative inline-flex items-center gap-1 rounded hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5', active && 'text-fg', c.align === 'right' && 'flex-row-reverse')}
                                        >
                                            {c.header}
                                            <SortIcon aria-hidden size={12} className={active ? 'text-fg' : 'text-fg-faint'} />
                                        </button>
                                    ) : c.header}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {loading
                        ? Array.from({ length: 8 }, (_, r) => (
                            <tr key={`sk-${r}`} className={cn(ROW_H[density], 'border-b border-border-subtle last:border-0')}>
                                {columns.map((c, i) => (
                                    <td key={c.key} className={cn('px-3 first:pl-4 last:pr-4', stickyCell(i))}>
                                        <Skeleton className={cn('h-3', i === 0 ? 'w-3/4' : 'ml-auto w-12', c.align !== 'right' && i !== 0 && 'ml-0')} />
                                    </td>
                                ))}
                            </tr>
                        ))
                        : visible.length === 0
                            ? (
                                <tr>
                                    <td colSpan={columns.length}>{empty ?? <p className="py-6 text-center text-body text-fg-muted">No data</p>}</td>
                                </tr>
                            )
                            : visible.map((row, r) => (
                                <tr
                                    key={rowKey(row, r)}
                                    tabIndex={onRowClick ? 0 : undefined}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                                    className={cn(
                                        ROW_H[density],
                                        'group border-b border-border-subtle transition-colors duration-120 last:border-0 hover:bg-subtle/60',
                                        onRowClick && 'cursor-pointer focus-visible:-outline-offset-2',
                                    )}
                                >
                                    {columns.map((c, i) => {
                                        const hv = c.heat ? c.heat.value(row) ?? 0 : 0;
                                        const pct = c.heat && heatMax > 0 ? Math.max(0, Math.min(100, (hv / heatMax) * 100)) : 0;
                                        return (
                                            <td
                                                key={c.key}
                                                className={cn(
                                                    'px-3 text-fg first:pl-4 last:pr-4',
                                                    ALIGN[c.align ?? 'left'],
                                                    stickyCell(i) && 'sticky left-0 z-[1] bg-surface group-hover:bg-[color-mix(in_oklab,var(--tc-subtle)_60%,var(--tc-surface))]',
                                                    c.className,
                                                )}
                                            >
                                                {c.heat ? (
                                                    <div className="relative flex min-h-7 items-center">
                                                        <span
                                                            aria-hidden
                                                            className={cn('absolute inset-y-0 left-[-6px] rounded-md transition-opacity duration-120 group-hover:opacity-80', c.heat.metric === 'neutral' ? 'heatbar-neutral' : METRICS[c.heat.metric].heatbar)}
                                                            style={{ width: `calc(${pct}% + 6px)` }}
                                                        />
                                                        <span className="relative min-w-0 truncate">{c.cell(row, r)}</span>
                                                    </div>
                                                ) : c.cell(row, r)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                </tbody>
            </table>
        </div>
    );

    const pager = pagination && total > Math.min(...(pagination.pageSizes ?? [pagination.pageSize])) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle p-3">
            <span className="text-meta text-fg-muted tabular-nums">
                {total === 0 ? '0' : `${fmtFull(page * pagination.pageSize + 1)}–${fmtFull(Math.min(total, (page + 1) * pagination.pageSize))}`} of {fmtFull(total)}
            </span>
            <div className="flex items-center gap-2">
                {pagination.pageSizes && pagination.onPageSizeChange ? (
                    <Select
                        size="sm"
                        className="min-w-0"
                        ariaLabel="Rows per page"
                        value={String(pagination.pageSize)}
                        onValueChange={(v) => { pagination.onPageSizeChange?.(Number(v)); setPage(0); }}
                        options={pagination.pageSizes.map((n) => ({ value: String(n), label: `${n} rows` }))}
                    />
                ) : null}
                <Button size="sm" iconOnly icon={ChevronLeft} aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} />
                <Button size="sm" iconOnly icon={ChevronRight} aria-label="Next page" disabled={(page + 1) * pagination.pageSize >= total} onClick={() => setPage(page + 1)} />
            </div>
        </div>
    ) : null;

    const body = (
        <>
            {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3">{toolbar}</div> : null}
            {table}
            {pager}
            {footer ? <div className="border-t border-border-subtle p-3 text-meta text-fg-muted">{footer}</div> : null}
        </>
    );

    return card ? <Card padding="none" className={cn('overflow-hidden', className)}>{body}</Card> : <div className={className}>{body}</div>;
}
