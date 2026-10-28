import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { fmtDayLong } from '@/lib/format';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Badge } from '@/components/ui/Badge';
import { fmtMetric, type MetricKey } from '@/lib/metrics';

export interface ChartTooltipRow {
    key: string;
    label: ReactNode;
    /** Series colour (line key). */
    color: string;
    value: ReactNode;
    /** Dashed key for comparison series. */
    dashed?: boolean;
    /** Delta vs the comparison value (text variant). */
    delta?: ReactNode;
}

export interface ChartTooltipCardProps {
    /** "Tue, Oct 13, 2026" */
    title?: ReactNode;
    /** "vs Tue, Jul 14, 2026" */
    subtitle?: ReactNode;
    rows: ChartTooltipRow[];
    partial?: boolean;
    className?: string;
    /** Extra lines under the rows (dashboard chart markers on that date). */
    footer?: ReactNode;
}

/**
 * Chart tooltip card (DESIGN 6.6): card style, not inverse. Values are full
 * numbers. Use it directly for custom charts, or through TimeSeriesChart.
 */
export function ChartTooltipCard({ title, subtitle, rows, partial, className, footer }: ChartTooltipCardProps) {
    return (
        <div className={cn('pointer-events-none min-w-[180px] rounded-popover border border-border-subtle bg-surface-raised p-3 shadow-popover', className)}>
            {title || partial ? (
                <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                        {title ? <p className="text-meta text-fg-muted">{title}</p> : null}
                        {subtitle ? <p className="text-meta text-fg-muted">{subtitle}</p> : null}
                    </div>
                    {partial ? <Badge variant="neutral">Partial</Badge> : null}
                </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
                {rows.map((r) => (
                    <div key={r.key} className="flex items-center gap-2 text-body-sm">
                        <svg aria-hidden width="12" height="2" className="shrink-0 overflow-visible">
                            <line x1="0" y1="1" x2="12" y2="1" stroke={r.color} strokeWidth="2" strokeDasharray={r.dashed ? '3 2' : undefined} opacity={r.dashed ? 0.6 : 1} />
                        </svg>
                        <span className="text-fg-secondary">{r.label}</span>
                        <span className="ml-auto pl-3 font-semibold text-fg tabular-nums">{r.value}</span>
                        {r.delta ? <span className="pl-1">{r.delta}</span> : null}
                    </div>
                ))}
            </div>
            {footer ? <div className="mt-2 border-t border-border-subtle pt-2">{footer}</div> : null}
        </div>
    );
}

/** Convenience: one metric at one date, with optional comparison. */
export function MetricTooltip({ metric, date, value, previous, previousDate, label, color, partial }: {
    metric: MetricKey; date: string; value: number | null; previous?: number | null; previousDate?: string; label?: string; color: string; partial?: boolean;
}) {
    const rows: ChartTooltipRow[] = [
        { key: 'cur', label: label ?? 'This period', color, value: fmtMetric(metric, value), delta: previous !== undefined ? <MetricDelta metric={metric} current={value} previous={previous} /> : undefined },
    ];
    if (previous !== undefined) rows.push({ key: 'prev', label: 'Previous', color, dashed: true, value: fmtMetric(metric, previous) });
    return <ChartTooltipCard title={fmtDayLong(date)} subtitle={previousDate ? `vs ${fmtDayLong(previousDate)}` : undefined} rows={rows} partial={partial} />;
}
