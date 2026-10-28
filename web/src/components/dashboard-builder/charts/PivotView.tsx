'use client';

/**
 * Pivot table widget (round 9): one metric across rows and columns, optional totals and heat colour.
 * A real table (headers, row headers, scope), so it reads aloud, prints and exports like any other; the
 * first column and the header row stay put while the rest scrolls. A click on a column header sorts the
 * rows by it (a second click reverses it). Heat shades cells in five steps of the metric's colour with
 * normal text on top: it works on the light and the dark card.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { EmptyState } from '@/components/ui';
import { dimLabel, fmtMetricValue, metricColor, metricLabel } from '@/lib/builder/catalog';
import { colValue, isOtherCol, pivotLevels, shapePivot, sortPivotRows } from '@/lib/builder/charts/pivot';
import type { PivotWidget } from '@/lib/builder/charts/types';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';
import { dimText } from '../widgets/Charts';

const HEAT_PCT = [0, 22, 32, 44, 56, 68];

export function PivotView(props: WidgetViewProps<PivotWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const [sort, setSort] = useState<{ by: number | 'total'; dir: 'asc' | 'desc' } | null>(null);
    const currency = ok?.flags.currency;
    const fmt = (v: number | null) => (v === null ? '–' : fmtMetricValue(c.metric.id, v, { currency }));
    const model = frame ? shapePivot(frame, c) : null;
    const levels = model ? pivotLevels(model, c.heat ?? 'cell') : [];
    const order = model ? sortPivotRows(model, sort && (sort.by === 'total' ? (model.totalsAvailable ? 'total' : null) : sort.by < model.cols.length ? sort.by : null), sort?.dir ?? 'desc') : [];
    const color = metricColor(c.metric.id);
    const showTotals = c.totals !== false && model?.totalsAvailable;
    const label = c.metric.label || metricLabel(c.metric.id);
    const colName = (k: string) => (isOtherCol(k) ? 'Other' : dimText(c.columns, colValue(k), frame?.labels));
    const truncated = Boolean(frame?.truncated);
    const footnote = showTotals && truncated ? { node: `Totals add up the top ${model?.rows.length} ${dimLabel(c.rows).toLowerCase()} values shown`, text: `Totals add up the top ${model?.rows.length} ${dimLabel(c.rows).toLowerCase()} values shown` } : undefined;

    const toggle = (by: number | 'total') => setSort((s) => (s && s.by === by ? (s.dir === 'desc' ? { by, dir: 'asc' } : null) : { by, dir: 'desc' }));
    const sortHead = (key: string, by: number | 'total', children: string) => {
        const on = sort?.by === by;
        return (
            <th key={key} scope="col" aria-sort={on ? (sort!.dir === 'desc' ? 'descending' : 'ascending') : 'none'} className="sticky top-0 z-10 bg-surface px-2 py-1.5 text-right text-caption font-medium text-fg-muted">
                <button type="button" onClick={() => toggle(by)} className="inline-flex max-w-full items-center gap-1 rounded hover:text-fg focus-visible:text-fg" title={`Sort rows by ${children}`}>
                    <span className="truncate">{children}</span>
                    {on ? (sort!.dir === 'desc' ? <ArrowDown aria-hidden size={12} /> : <ArrowUp aria-hidden size={12} />) : null}
                </button>
            </th>
        );
    };

    return (
        <WidgetFrame props={props} skeleton="table" footnote={footnote}>
            {!frame ? null : !model || !model.rows.length || !model.cols.length ? (
                <EmptyState variant="inline" title={`No ${label.toLowerCase()} in this period`} />
            ) : (
                <div className="h-full overflow-auto">
                    <table className="w-full min-w-max border-separate border-spacing-0 text-meta tabular-nums">
                        <caption className="sr-only">{`${label} by ${dimLabel(c.rows).toLowerCase()} and ${dimLabel(c.columns).toLowerCase()}`}</caption>
                        <thead>
                            <tr>
                                <th scope="col" className="sticky left-0 top-0 z-20 bg-surface px-2 py-1.5 text-left text-caption font-medium text-fg-muted">{dimLabel(c.rows)}</th>
                                {model.cols.map((k, j) => sortHead(k, j, colName(k)))}
                                {showTotals ? sortHead('total', 'total', 'Total') : null}
                            </tr>
                        </thead>
                        <tbody>
                            {order.map((i) => (
                                <tr key={model.rows[i]}>
                                    <th scope="row" className="sticky left-0 z-10 max-w-[180px] truncate border-t border-border-subtle bg-surface px-2 py-1.5 text-left font-normal text-fg" title={dimText(c.rows, model.rows[i], frame.labels)}>{dimText(c.rows, model.rows[i], frame.labels)}</th>
                                    {model.cols.map((k, j) => {
                                        const v = model.cells[i][j];
                                        const lv = levels[i][j];
                                        return (
                                            <td key={k} className="relative border-t border-border-subtle px-2 py-1.5 text-right text-fg" aria-label={`${dimText(c.rows, model.rows[i], frame.labels)}, ${colName(k)}: ${fmt(v)}`}>
                                                {lv > 0 ? <span aria-hidden className="absolute inset-0" style={{ background: `color-mix(in oklab, ${color} ${HEAT_PCT[lv]}%, var(--color-surface))` }} /> : null}
                                                <span className="relative">{fmt(v)}</span>
                                            </td>
                                        );
                                    })}
                                    {showTotals ? <td className="border-t border-border-subtle px-2 py-1.5 text-right font-semibold text-fg">{fmt(model.rowTotals[i])}</td> : null}
                                </tr>
                            ))}
                        </tbody>
                        {showTotals ? (
                            <tfoot>
                                <tr>
                                    <th scope="row" className="sticky bottom-0 left-0 z-20 border-t border-border bg-surface px-2 py-1.5 text-left font-semibold text-fg">Total</th>
                                    {model.colTotals.map((t, j) => <td key={model.cols[j]} className="sticky bottom-0 z-10 border-t border-border bg-surface px-2 py-1.5 text-right font-semibold text-fg">{fmt(t)}</td>)}
                                    <td className="sticky bottom-0 z-10 border-t border-border bg-surface px-2 py-1.5 text-right font-semibold text-fg">{fmt(model.grand)}</td>
                                </tr>
                            </tfoot>
                        ) : null}
                    </table>
                </div>
            )}
        </WidgetFrame>
    );
}
