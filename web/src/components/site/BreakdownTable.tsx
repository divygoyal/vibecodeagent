'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';

import { fmtCurrency, fmtDuration, fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import type { MetricKey } from '@/lib/metrics';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { SearchInput, useDebouncedValue } from '@/components/ui/SearchInput';
import { Table, type TableColumn } from '@/components/ui/Table';
import { downloadCsv } from './useSiteData';

export type ValueFormat = 'count' | 'percent' | 'duration' | 'position' | 'currency';

export interface BreakdownColumn<T> {
    key: string;
    header: string;
    value: (row: T) => number | null | undefined;
    format?: ValueFormat;
    /** Show a delta under/after the value (needs previous). */
    previous?: (row: T) => number | null | undefined;
    better?: 'up' | 'down';
    /** Hide below md (keeps phone tables short). */
    hideOnMobile?: boolean;
}

export interface BreakdownTableProps<T> {
    rows: T[];
    rowKey: (row: T) => string;
    /** First column: label cell and its plain text (search, CSV, sort). */
    label: { header: string; text: (row: T) => string; cell?: (row: T) => ReactNode };
    columns: BreakdownColumn<T>[];
    /** Heat bar on the label column. */
    heat?: { metric: MetricKey | 'neutral'; value: (row: T) => number | null | undefined };
    defaultSort?: string;
    loading?: boolean;
    pageSize?: number;
    searchPlaceholder?: string;
    exportName?: string;
    onRowClick?: (row: T) => void;
    toolbarExtra?: ReactNode;
    empty?: ReactNode;
    caption?: string;
    /** ISO 4217 code for 'currency' columns (GA4 revenue), from the report metadata. */
    currency?: string;
}

export function fmtCell(v: number | null | undefined, format: ValueFormat = 'count', currency?: string): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    if (format === 'currency') return fmtCurrency(v, currency);
    if (format === 'percent') return fmtPercent(v);
    if (format === 'duration') return fmtDuration(v);
    if (format === 'position') return fmtPosition(v);
    return fmtFull(v);
}

/** Sortable, searchable, exportable table for a breakdown (sources, pages, countries ...). */
export function BreakdownTable<T>({
    rows, rowKey, label, columns, heat, defaultSort, loading, pageSize = 25, searchPlaceholder = 'Search', exportName, onRowClick, toolbarExtra, empty, caption, currency,
}: BreakdownTableProps<T>) {
    const [query, setQuery] = useState('');
    const q = useDebouncedValue(query, 120).trim().toLowerCase();
    const filtered = useMemo(() => (q ? rows.filter((r) => label.text(r).toLowerCase().includes(q)) : rows), [rows, q, label]);
    const cols: TableColumn<T>[] = [
        {
            key: 'label',
            header: label.header,
            cell: (r) => label.cell ? label.cell(r) : <span title={label.text(r)}>{label.text(r)}</span>,
            sortable: true,
            sortValue: (r) => label.text(r),
            firstSortDir: 'asc',
            heat,
            width: '40%',
        },
        ...columns.map((c): TableColumn<T> => ({
            key: c.key,
            header: c.header,
            align: 'right',
            sortable: true,
            sortValue: (r) => c.value(r) ?? null,
            firstSortDir: c.better === 'down' ? 'asc' : 'desc',
            headerClassName: c.hideOnMobile ? 'max-md:hidden' : undefined,
            className: c.hideOnMobile ? 'max-md:hidden' : undefined,
            cell: (r) => (
                <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                    <span>{fmtCell(c.value(r), c.format, currency)}</span>
                    {c.previous ? (
                        <MetricDelta current={c.value(r)} previous={c.previous(r)} format={c.format ?? 'count'} better={c.better ?? 'up'} />
                    ) : null}
                </span>
            ),
        })),
    ];
    const exportCsv = exportName ? () => downloadCsv(
        `${exportName}.csv`,
        [label.header, ...columns.flatMap((c) => {
            const h = c.format === 'currency' && currency ? `${c.header} (${currency})` : c.header;
            return c.previous ? [h, `${h} (previous)`] : [h];
        })],
        filtered.map((r) => [label.text(r), ...columns.flatMap((c) => (c.previous ? [c.value(r) ?? '', c.previous(r) ?? ''] : [c.value(r) ?? '']))]),
    ) : undefined;
    return (
        <Table
            caption={caption}
            rows={filtered}
            rowKey={rowKey}
            columns={cols}
            loading={loading}
            defaultSort={{ key: defaultSort ?? columns[0]?.key ?? 'label', dir: 'desc' }}
            pagination={{ pageSize }}
            onRowClick={onRowClick}
            empty={empty ?? <EmptyState variant="inline" title={q ? 'No rows match your search' : 'No data in this period'} />}
            toolbar={
                <>
                    <SearchInput value={query} onValueChange={setQuery} size="sm" slashShortcut={false} placeholder={searchPlaceholder} className="w-full sm:w-64" />
                    {toolbarExtra}
                    <span className="ml-auto text-meta text-fg-muted tabular-nums">{fmtFull(filtered.length)} rows</span>
                    {exportCsv ? <Button size="sm" variant="ghost" icon={Download} onClick={exportCsv} disabled={!filtered.length}>Export</Button> : null}
                </>
            }
        />
    );
}
