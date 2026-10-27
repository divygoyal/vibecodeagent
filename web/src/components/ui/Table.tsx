'use client';

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtFull } from '@/lib/format';
import type { MetricKey } from '@/lib/metrics';
import { heatbarClass } from '@/components/charts/style';
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
    /**
     * Role in the phone list (< 768px, critique #8): 'title' (line 1, left),
     * 'primary' (line 1, right, the number that matters), 'meta' (line 2,
     * muted "Label value" pairs), 'trailing' (end of line 1: menus, buttons)
     * or 'hidden'. Default: first column title, the sorted (else the first
     * right-aligned) column primary, a last column with no text header
     * trailing, up to 4 other columns meta.
     */
    mobile?: 'title' | 'primary' | 'meta' | 'trailing' | 'hidden';
    /** Label for the phone list's line 2 when the header is not plain text. */
    mobileLabel?: string;
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
    /**
     * Phones show each row as a two-line list item (title + main number, then
     * the other numbers) instead of a table that scrolls its numbers off
     * screen (default true). false keeps the scrolling table. 'compact' keeps
     * every row the same height (one meta line, faded at the edge) for
     * fixed-height boxes such as dashboard widgets.
     */
    mobileList?: boolean | 'compact';
    className?: string;
}

// Desktop rows 36px by default (critique 2.4); 44px touch rows on phones.
const ROW_H = { compact: 'h-9', default: 'h-11 md:h-9', comfortable: 'h-12' };
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

function headerText<T>(c: TableColumn<T>): string | null {
    if (c.mobileLabel) return c.mobileLabel;
    if (typeof c.header === 'string' || typeof c.header === 'number') return String(c.header);
    return null;
}

type MobileRole = NonNullable<TableColumn<unknown>['mobile']>;

/** Which column plays which part in the phone list (see TableColumn.mobile). */
function mobileRoles<T>(columns: TableColumn<T>[], sortKey: string | undefined): Map<string, MobileRole> {
    const roles = new Map<string, MobileRole>();
    const hiddenByClass = (c: TableColumn<T>) => /(^|\s)max-md:hidden(\s|$)/.test(c.className ?? '');
    for (const c of columns) if (c.mobile) roles.set(c.key, c.mobile);
    const free = (c: TableColumn<T>) => !roles.has(c.key);
    const title = columns.find((c) => roles.get(c.key) === 'title') ?? columns.find(free);
    if (title && free(title)) roles.set(title.key, 'title');
    const last = columns[columns.length - 1];
    if (last && free(last) && headerText(last) === null && columns.length > 1) roles.set(last.key, 'trailing');
    if (![...roles.values()].includes('primary')) {
        const sorted = columns.find((c) => c.key === sortKey && free(c) && c.align === 'right');
        const primary = sorted ?? columns.find((c) => free(c) && c.align === 'right' && !hiddenByClass(c));
        if (primary) roles.set(primary.key, 'primary');
    }
    // Line 2: the columns a phone table showed first, then the ones it hid; at most 4.
    const rest = columns.filter(free);
    const ordered = [...rest.filter((c) => !hiddenByClass(c)), ...rest.filter(hiddenByClass)];
    ordered.forEach((c, i) => roles.set(c.key, i < 4 ? 'meta' : 'hidden'));
    return roles;
}

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
    pagination, footer, caption, stickyFirstColumn = true, card = true, mobileList = true, className,
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
        <div className={cn('relative overflow-x-auto', mobileList && 'max-md:hidden')}>
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
                                            className={cn('group/sort relative inline-flex items-center gap-1 rounded hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2.5 pointer-coarse:after:-inset-y-2.5', active && 'text-fg', c.align === 'right' && 'flex-row-reverse')}
                                        >
                                            {c.header}
                                            {/* Faint arrows on every sortable column, solid on the sorted one. */}
                                            <SortIcon
                                                aria-hidden
                                                size={12}
                                                strokeWidth={1.75}
                                                className={active ? 'text-fg' : 'text-fg-faint transition-colors duration-120 group-hover/sort:text-fg-muted'}
                                            />
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
                                                            className={cn('absolute inset-y-0 left-[-6px] rounded-md transition-opacity duration-120 group-hover:opacity-80', heatbarClass(c.heat.metric))}
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

    const roles = mobileList ? mobileRoles(columns, sort?.key) : null;
    const byRole = (role: MobileRole) => columns.filter((c) => roles?.get(c.key) === role);
    const titleCol = roles ? byRole('title')[0] : undefined;
    const primaryCol = roles ? byRole('primary')[0] : undefined;
    const metaCols = roles ? byRole('meta') : [];
    const trailingCols = roles ? byRole('trailing') : [];
    const sortable = columns.filter((c) => c.sortable && headerText(c) !== null);

    const list = roles ? (
        <div className="md:hidden">
            {sortable.length > 1 && !loading && visible.length > 1 ? (
                <div className="flex items-center justify-end border-b border-border-subtle px-3 py-2">
                    <Select
                        size="sm"
                        label="Sort:"
                        ariaLabel="Sort rows"
                        value={sort?.key ?? ''}
                        placeholder="Sort"
                        onValueChange={(key) => {
                            const col = columns.find((c) => c.key === key);
                            if (!col) return;
                            const next: SortState = { key, dir: col.firstSortDir ?? 'desc' };
                            if (onSortChange) onSortChange(next);
                            if (sortProp === undefined) setInnerSort(next);
                        }}
                        options={sortable.map((c) => ({ value: c.key, label: headerText(c) as string }))}
                    />
                </div>
            ) : null}
            {loading ? (
                <ul aria-busy className="divide-y divide-border-subtle">
                    {Array.from({ length: 6 }, (_, r) => (
                        <li key={`sk-${r}`} className="flex flex-col gap-2 px-4 py-3">
                            <span className="flex items-center gap-3"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="ml-auto h-3.5 w-12" /></span>
                            <Skeleton className="h-3 w-2/5" />
                        </li>
                    ))}
                </ul>
            ) : visible.length === 0 ? (
                empty ?? <p className="py-6 text-center text-body text-fg-muted">No data</p>
            ) : (
                <ul className="divide-y divide-border-subtle">
                    {visible.map((row, r) => {
                        const hv = titleCol?.heat ? titleCol.heat.value(row) ?? 0 : 0;
                        const pct = titleCol?.heat && heatMax > 0 ? Math.max(0, Math.min(100, (hv / heatMax) * 100)) : 0;
                        const meta = metaCols.map((c) => ({ c, label: headerText(c) }));
                        return (
                            <li
                                key={rowKey(row, r)}
                                tabIndex={onRowClick ? 0 : undefined}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                                className={cn('flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2', onRowClick && 'cursor-pointer active:bg-subtle/60 focus-visible:-outline-offset-2')}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="relative flex min-h-7 min-w-0 flex-1 items-center">
                                        {titleCol?.heat ? (
                                            <span
                                                aria-hidden
                                                className={cn('absolute inset-y-0 left-[-6px] rounded-md', heatbarClass(titleCol.heat.metric))}
                                                style={{ width: `calc(${pct}% + 6px)` }}
                                            />
                                        ) : null}
                                        <span className="relative min-w-0 truncate text-body text-fg">{titleCol ? titleCol.cell(row, r) : null}</span>
                                    </div>
                                    {primaryCol ? (
                                        <span className="shrink-0 text-body font-medium text-fg tabular-nums">{primaryCol.cell(row, r)}</span>
                                    ) : null}
                                    {trailingCols.map((c) => <span key={c.key} className="shrink-0" onClick={(e) => e.stopPropagation()}>{c.cell(row, r)}</span>)}
                                </div>
                                {meta.length ? (
                                    <div
                                        className={cn(
                                            'flex min-w-0 items-center gap-x-3 gap-y-0.5 text-meta tabular-nums',
                                            mobileList === 'compact' ? 'overflow-hidden [mask-image:linear-gradient(to_right,#000_85%,transparent)]' : 'flex-wrap',
                                        )}
                                    >
                                        {meta.map(({ c, label }) => (
                                            <span key={c.key} className={cn('inline-flex items-center gap-1 whitespace-nowrap', mobileList === 'compact' ? 'shrink-0' : 'min-w-0')}>
                                                {label ? <span className="text-fg-muted">{label}</span> : null}
                                                <span className="text-fg-secondary">{c.cell(row, r)}</span>
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    ) : null;

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
            {list}
            {pager}
            {footer ? <div className="border-t border-border-subtle p-3 text-meta text-fg-muted">{footer}</div> : null}
        </>
    );

    return card ? <Card padding="none" className={cn('overflow-hidden', className)}>{body}</Card> : <div className={className}>{body}</div>;
}
