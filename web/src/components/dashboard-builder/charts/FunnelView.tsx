'use client';

/**
 * Funnel widget (round 9): one row per step with its count, a bar drawn against the biggest step, and the
 * conversion and drop-off to the next step. Says in words that these are step counts, not visitors followed
 * through the steps in order. Plain list markup (an ordered list), so it prints, reads aloud and works in TV mode.
 */
import { ArrowDown } from 'lucide-react';

import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui';
import { fmtPercent } from '@/lib/format';
import { fmtMetricValue, metricColor } from '@/lib/builder/catalog';
import { FUNNEL_NOTE, shapeFunnel } from '@/lib/builder/charts/funnel';
import type { FunnelWidget } from '@/lib/builder/charts/types';
import { useElementHeight } from '../useElementWidth';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';

const pct = (v: number) => fmtPercent(v, { tile: true });

export function FunnelView(props: WidgetViewProps<FunnelWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const c = widget.config;
    const model = ok ? shapeFunnel(ok.parts, c) : null;
    const [body, bodyH] = useElementHeight<HTMLDivElement>();
    const color = metricColor(c.metric.id);
    const fmt = (v: number) => fmtMetricValue(c.metric.id, v, { currency: ok?.flags.currency });
    // Tight cards drop the line between steps and put the conversion next to the count.
    const compact = bodyH > 0 && (bodyH - 56) / Math.max(1, model?.rows.length ?? 1) < 58;
    return (
        <WidgetFrame props={props}>
            {!ok || !model ? null : model.needsSteps ? (
                <EmptyState variant="inline" title="Add at least two steps" description="Name an event or a page for each step in the settings." />
            ) : model.empty ? (
                <EmptyState variant="inline" title="No events or page views for these steps in this period" />
            ) : (
                <div ref={body} className="flex h-full min-h-0 flex-col">
                    <p className="mb-2 text-caption text-fg-muted">{FUNNEL_NOTE}</p>
                    <ol aria-label="Funnel steps" className="min-h-0 flex-1 overflow-y-auto">
                        {model.rows.map((row, i) => {
                            const width = model.max > 0 ? Math.max(row.value > 0 ? 1.5 : 0, (row.value / model.max) * 100) : 0;
                            const next = model.rows[i + 1];
                            return (
                                <li key={i} className={cn(!compact && 'pb-0.5')}>
                                    <div className="flex items-baseline gap-2 text-body-sm">
                                        <span className="min-w-0 flex-1 truncate text-fg" title={row.label}><span className="text-fg-muted tabular-nums">{i + 1}. </span>{row.label}</span>
                                        {compact && c.showDropoff && row.ofPrev !== null ? <span className="shrink-0 text-caption text-fg-muted tabular-nums">{pct(row.ofPrev)} of previous</span> : null}
                                        <span className="shrink-0 font-semibold text-fg tabular-nums">{fmt(row.value)}</span>
                                        {i > 0 ? <span className="shrink-0 text-caption text-fg-muted tabular-nums" title="Share of the first step">{pct(row.ofFirst)}</span> : null}
                                    </div>
                                    <div aria-hidden className="mx-auto mt-1 h-3.5 rounded-[4px]" style={{ width: `${width}%`, background: `color-mix(in oklab, ${color} ${Math.round(100 - i * (55 / Math.max(1, model.rows.length - 1)))}%, var(--color-surface))` }} />
                                    {!compact && c.showDropoff && next ? (
                                        <div className="flex items-center justify-center gap-1.5 py-1 text-caption text-fg-muted tabular-nums">
                                            <ArrowDown aria-hidden size={12} strokeWidth={1.75} />
                                            {next.ofPrev === null ? 'no one in the step above' : <><span className="text-fg-secondary">{pct(next.ofPrev)}</span> continue · {fmt(next.lost ?? 0)} fewer</>}
                                        </div>
                                    ) : compact ? <div className="h-1.5" /> : null}
                                </li>
                            );
                        })}
                    </ol>
                    {model.overall !== null ? (
                        <p className="mt-1 text-meta text-fg-secondary tabular-nums">
                            Overall: <span className="font-medium text-fg">{pct(model.overall)}</span> of the first step reach the last.
                            {model.outOfOrder ? <span className="text-fg-muted"> A later step is bigger than the one before it, so the steps are not strictly in order.</span> : null}
                        </p>
                    ) : null}
                </div>
            )}
        </WidgetFrame>
    );
}
