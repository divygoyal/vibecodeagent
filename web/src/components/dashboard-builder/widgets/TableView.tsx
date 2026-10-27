'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/cn';
import { EmptyState, MetricDelta, SearchInput, Table, type TableColumn as UiColumn } from '@/components/ui';
import { dimLabel, fmtMetricValue, metricHeatbar, metricLabel } from '@/lib/builder/catalog';
import { cellStyle } from '@/lib/builder/cfRules';
import type { CellValue, TableWidget } from '@/lib/builder/types';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { dimText } from './Charts';
import { dsFormat, metricBetter } from './metricUi';

type Row = Record<string, CellValue>;

export function TableView(props: WidgetViewProps<TableWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const totals = ok?.parts.totals?.rows[0];
    const c = widget.config;
    const [q, setQ] = useState('');
    const cols = c.columns.filter((col) => !col.hidden);
    const metricCols = cols.filter((col) => col.kind === 'metric');
    const compare = props.compare !== 'none' && Boolean(frame?.rows.some((r) => metricCols.some((m) => `m:${m.ref}:prev` in r)));

    const all = (frame?.rows ?? []) as Row[];
    const needle = q.trim().toLowerCase();
    const d0 = c.dimensions[0];
    const rows = needle ? all.filter((r) => dimText(d0, r[`d:${d0}`], frame?.labels).toLowerCase().includes(needle)) : all;
    const maxOf: Record<string, number> = {};
    for (const col of metricCols) maxOf[col.ref] = Math.max(0, ...rows.map((r) => (typeof r[`m:${col.ref}`] === 'number' ? (r[`m:${col.ref}`] as number) : 0)));

    const columns: UiColumn<Row>[] = cols.map((col, i) => {
        if (col.kind === 'dimension') {
            const dim = col.ref;
            return {
                key: col.id,
                header: col.label ?? dimLabel(dim),
                sortable: true,
                firstSortDir: 'asc',
                sortValue: (r) => dimText(dim, r[`d:${dim}`], frame?.labels),
                // Round 2: narrow template tables set a width so long URLs truncate instead of pushing columns out.
                className: cn(typeof col.width === 'number' && col.width <= 200 ? 'max-w-[200px]' : 'max-w-[340px]', i === 0 && (typeof col.width === 'number' && col.width <= 200 ? 'min-w-[120px]' : 'min-w-[160px]')),
                cell: (r) => {
                    const text = dimText(dim, r[`d:${dim}`], frame?.labels);
                    const raw = String(r[`d:${dim}`] ?? '');
                    const href = col.link && /^https?:\/\//.test(raw) ? raw : null;
                    const pick = props.onFilterClick && dim === c.dimensions[0] && raw && raw !== '(other)' ? props.onFilterClick : undefined;
                    return (
                        <span className="flex min-w-0 items-center gap-1">
                            {pick ? (
                                <button type="button" onClick={() => pick(raw)} title={`Filter the page by ${text}`} className={cn('truncate text-left hover:text-brand-text hover:underline', props.selectedValue === raw && 'font-semibold text-brand-text')}>{text}</button>
                            ) : <span className="truncate" title={text}>{text}</span>}
                            {href && props.mode !== 'edit' ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${text}`} className="shrink-0 text-fg-faint hover:text-fg-muted"><ExternalLink aria-hidden size={12} /></a> : null}
                        </span>
                    );
                },
            };
        }
        const id = col.ref;
        const showDelta = compare && (col.showDelta || col.visual === 'delta');
        return {
            key: col.id,
            header: col.label ?? metricLabel(id),
            align: 'right',
            sortable: true,
            sortValue: (r) => (typeof r[`m:${id}`] === 'number' ? (r[`m:${id}`] as number) : null),
            cell: (r) => {
                const v = typeof r[`m:${id}`] === 'number' ? (r[`m:${id}`] as number) : null;
                const pv = r[`m:${id}:prev`];
                const pct = col.visual === 'bar' || col.visual === 'heat' ? (maxOf[id] > 0 && v ? Math.min(100, (v / maxOf[id]) * 100) : 0) : 0;
                // Conditional formatting (round 2): only tables with rules get the extra classes.
                const cf = c.rules?.length ? cellStyle(c.rules, col, r) : null;
                return (
                    <span className="relative flex min-h-7 items-center justify-end gap-2">
                        {pct ? <span aria-hidden className={cn('absolute inset-y-0.5 right-[-6px] rounded-md', metricHeatbar(id))} style={{ width: `calc(${pct}% + 6px)` }} /> : null}
                        <span className={cf ? `relative tc-cf-cell tc-cf-${cf} font-medium` : 'relative'} title={cf ? (cf === 'good' ? 'Meets a good rule' : cf === 'bad' ? 'Matches a bad rule' : 'Needs attention') : undefined}>{fmtMetricValue(id, v, { currency: ok?.flags.currency, format: col.format })}</span>
                        {showDelta && pv !== undefined ? (
                            <MetricDelta className="relative" current={v} previous={typeof pv === 'number' ? pv : null} format={dsFormat(id)} better={metricBetter(id)} />
                        ) : null}
                    </span>
                );
            },
        };
    });

    const defaultSort = c.sortByChange ? undefined : { key: c.sort.by, dir: c.sort.dir };
    const footer = c.totalsRow && totals ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-meta text-fg-secondary">
            <span className="font-medium text-fg">Total</span>
            {metricCols.map((col) => (
                <span key={col.id} className="tabular-nums">{col.label ?? metricLabel(col.ref)} {fmtMetricValue(col.ref, typeof totals[`m:${col.ref}`] === 'number' ? (totals[`m:${col.ref}`] as number) : null, { currency: ok?.flags.currency })}</span>
            ))}
        </div>
    ) : undefined;
    const pageSize = props.bp === 'sm' ? 5 : Math.max(5, Math.min(c.pageSize, Math.floor((props.height - 140) / 36)));

    return (
        <WidgetFrame props={props} skeleton="table" bodyClassName="flex flex-col">
            {!frame ? null : (
                <>
                    {c.search ? <SearchInput value={q} onValueChange={setQ} placeholder={`Search ${dimLabel(c.dimensions[0]).toLowerCase()}`} size="sm" className="mb-2" /> : null}
                    <div className="-mx-4 min-h-0 flex-1 overflow-auto">
                        <Table
                            card={false}
                            columns={columns}
                            rows={rows}
                            rowKey={(r, i) => `${c.dimensions.map((d) => String(r[`d:${d}`])).join('|')}-${i}`}
                            defaultSort={defaultSort}
                            density={c.density === 'comfortable' ? 'default' : 'compact'}
                            pagination={c.pagination ? { pageSize } : undefined}
                            footer={footer}
                            empty={widget.filters?.length || c.rowFilters?.length
                                ? <EmptyState variant="inline" title="Nothing matches yet" description={widget.filters?.length ? 'No rows match this widget’s filter in this period. Rows appear here as soon as they do.' : 'No rows pass this table’s thresholds in this period.'} />
                                : <EmptyState variant="inline" title="No rows in this period" />}
                            caption={widget.title}
                        />
                    </div>
                </>
            )}
        </WidgetFrame>
    );
}
