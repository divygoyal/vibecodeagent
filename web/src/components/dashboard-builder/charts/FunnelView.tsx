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
import { FUNNEL_NOTE, funnelWarnings, shapeFunnel } from '@/lib/builder/charts/funnel';
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
    // One layout at every height: tight cards only use less air (and the list scrolls); the words never change.
    const tight = bodyH > 0 && (bodyH - 90) / Math.max(1, model?.rows.length ?? 1) < 58;
    const repeats = funnelWarnings(c).filter((w) => w.kind === 'duplicate');
    return (
        <WidgetFrame props={props}>
            {!ok || !model ? null : model.needsSteps ? (
                <EmptyState variant="inline" title="Add at least two steps" description="Name an event or a page for each step in the settings." />
            ) : model.empty ? (
                <EmptyState variant="inline" title="No events or page views for these steps in this period" />
            ) : (
                <div ref={body} className="flex h-full min-h-0 flex-col">
                    <p className="mb-1.5 text-caption text-fg-muted">{FUNNEL_NOTE}</p>
                    <div aria-hidden className="mb-0.5 flex justify-end text-caption text-fg-muted"><span className="w-12 text-right">of step 1</span></div>
                    <ol aria-label="Funnel steps" className="min-h-0 flex-1 overflow-y-auto">
                        {model.rows.map((row, i) => {
                            const width = model.max > 0 ? Math.max(row.value > 0 ? 1.5 : 0, (row.value / model.max) * 100) : 0;
                            const next = model.rows[i + 1];
                            return (
                                <li key={i} className={tight ? 'pb-0' : 'pb-0.5'}>
                                    <div className="flex items-baseline gap-2 text-body-sm">
                                        <span className="min-w-0 flex-1 truncate text-fg" title={row.label}><span className="text-fg-muted tabular-nums">{i + 1}. </span>{row.label}</span>
                                        <span className="shrink-0 font-semibold text-fg tabular-nums">{fmt(row.value)}</span>
                                        <span className="w-12 shrink-0 text-right text-caption text-fg-muted tabular-nums"><span className="sr-only">of step 1: </span>{pct(row.ofFirst)}</span>
                                    </div>
                                    <div aria-hidden className={cn('mx-auto rounded-[4px]', tight ? 'mt-0.5 h-2.5' : 'mt-1 h-3.5')} style={{ width: `${width}%`, background: `color-mix(in oklab, ${color} ${Math.round(100 - i * (55 / Math.max(1, model.rows.length - 1)))}%, var(--color-surface))` }} />
                                    {c.showDropoff && next ? (
                                        <div className={cn('flex items-center justify-center gap-1.5 text-caption text-fg-muted tabular-nums', tight ? 'py-0.5' : 'py-1')}>
                                            <ArrowDown aria-hidden size={12} strokeWidth={1.75} />
                                            {next.ofPrev === null ? 'no one in the step above' : <><span className="text-fg-secondary">{pct(next.ofPrev)}</span> continue · {fmt(next.lost ?? 0)} fewer</>}
                                        </div>
                                    ) : <div className="h-1.5" />}
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
                    {repeats.length ? <p className="mt-1 text-caption text-warn">{repeats.map((w) => w.text).join(' ')}</p> : null}
                </div>
            )}
        </WidgetFrame>
    );
}
