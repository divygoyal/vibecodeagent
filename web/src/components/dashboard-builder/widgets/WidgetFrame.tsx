'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Download, Info, Link2, PlugZap, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, Skeleton, Tooltip } from '@/components/ui';
import { fmtDay } from '@/lib/format';
import { metricLabel } from '@/lib/builder/catalog';
import { widgetTitle } from '@/lib/builder/registry';
import type { CompareSpec, ResolvedDates, WidgetDef, WidgetResult, WidgetResultOk } from '@/lib/builder/types';

export interface WidgetViewProps<W extends WidgetDef = WidgetDef> {
    widget: W;
    result?: WidgetResult;
    /** First load (no data yet). */
    loading: boolean;
    /** Refetch with old data on screen. */
    refetching: boolean;
    resolved?: ResolvedDates;
    compare: CompareSpec['mode'];
    /** Pixel height of the grid cell. */
    height: number;
    bp: 'lg' | 'md' | 'sm';
    mode: 'view' | 'edit' | 'public';
    /** {{site}}, {{date_range}} ... for text widgets. */
    vars: Record<string, string>;
    onRetry?: () => void;
    onChooseSource?: () => void;
    /** Click to filter (round 2): the widget allows it and a click on a value calls this. */
    onFilterClick?: (value: string) => void;
    /** The value currently selected by click to filter on this widget's dimension. */
    selectedValue?: string;
}

/** The ok result when there is one (also the stale copy inside an error). */
export function okResult(r?: WidgetResult): WidgetResultOk | undefined {
    if (!r) return undefined;
    if (r.status === 'ok') return r;
    return r.stale;
}

const ERROR_ICON = { NOT_CONNECTED: PlugZap, NO_ACCESS: Link2, NO_GA4_SOURCE: Link2, NO_GSC_SOURCE: Link2 } as const;

export function WidgetError({ result, onRetry, onChooseSource, compact }: { result: Extract<WidgetResult, { status: 'error' }>; onRetry?: () => void; onChooseSource?: () => void; compact?: boolean }) {
    const Icon = (ERROR_ICON as Record<string, typeof AlertTriangle>)[result.code] ?? AlertTriangle;
    const action = result.hint?.action;
    return (
        <div role="status" className={cn('flex h-full flex-col items-center justify-center gap-2 px-3 text-center', compact ? 'py-1' : 'py-4')}>
            <span className="flex size-8 items-center justify-center rounded-full bg-subtle text-fg-muted"><Icon aria-hidden size={16} strokeWidth={1.75} /></span>
            <p className="max-w-[320px] text-body-sm text-fg-secondary">{result.message}</p>
            <div className="flex gap-2">
                {action === 'reconnect' ? <Button asChild size="sm" variant="secondary"><a href="/dashboard/settings">Reconnect Google</a></Button> : null}
                {action === 'choose-source' && onChooseSource ? <Button size="sm" variant="secondary" onClick={onChooseSource}>Choose another site</Button> : null}
                {result.retryable && onRetry ? <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onRetry}>Try again</Button> : null}
            </div>
        </div>
    );
}

/** CSV of the widget's main frame (P1 "Download CSV"). */
export function downloadCsv(widget: WidgetDef, r: WidgetResultOk) {
    const frame = r.parts.rows ?? r.parts.series ?? r.parts.sites ?? r.parts.total;
    if (!frame) return;
    const keys = frame.seriesKeys?.length ? [frame.columns[0]?.id, ...frame.seriesKeys].filter(Boolean) as string[] : frame.columns.map((c) => c.id);
    // Calculated metrics (round 7): the dashboard's name, which the editor's inline queries do not send.
    const labelOf = (k: string) => (k.startsWith('m:calc:') ? metricLabel(k.slice(2)) : frame.columns.find((c) => c.id === k)?.label ?? k.replace(/^[dmb]:/, ''));
    const esc = (v: unknown) => {
        const t = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [keys.map((k) => esc(labelOf(k))).join(','), ...frame.rows.map((row) => keys.map((k) => esc(frame.labels?.[String(row[k])] ?? row[k])).join(','))];
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${widgetTitle(widget).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'widget'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Footnotes for honest data (BUILDER.md 11.9). */
export function flagNotes(r: WidgetResultOk | undefined, widget: WidgetDef): string[] {
    if (!r) return [];
    const f = r.flags;
    const out: string[] = [];
    if (f.stale) out.push(`Showing data from ${new Date(r.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
    if (f.sampled) out.push(`Sampled (${f.sampled.pct}% of events)`);
    if (f.thresholded) out.push('Google hides small groups (privacy thresholds)');
    if (f.otherRow) out.push('Some values are grouped as (other)');
    if (f.preliminaryFrom && (widget.type === 'timeseries' || widget.type === 'scorecard' || widget.type === 'kpi-strip')) out.push(`Search Console data after ${fmtDay(f.preliminaryFrom)} is still being processed`);
    if (f.filtersIgnored?.length) out.push(`${f.filtersIgnored.length === 1 ? 'A filter does' : 'Some filters do'} not apply to this widget`);
    if (f.usersSummed) out.push('Users are summed across sites');
    if (f.sitesFailed?.length) out.push(`${f.sitesFailed.length} site${f.sitesFailed.length === 1 ? '' : 's'} could not load`);
    if (f.missingFamilies?.length) out.push(f.missingFamilies.includes('ga4') ? 'No Analytics property linked: those numbers show –' : 'No Search Console site linked: those numbers show –');
    if (f.sortedWithinTop) out.push(`Sorted within the top ${f.sortedWithinTop.toLocaleString('en-US')} rows by clicks`);
    return out;
}

/**
 * Card chrome shared by chart, table and map widgets: title with optional info tooltip,
 * loading skeleton, refetch dimming with a 2px progress bar, per-widget errors, footnotes.
 */
export function WidgetFrame({ props, children, actions, bodyClassName, skeleton = 'chart', footnote }: {
    props: WidgetViewProps;
    children: ReactNode;
    actions?: ReactNode;
    bodyClassName?: string;
    skeleton?: 'chart' | 'table' | 'none';
    /** Leads the footnote line (round 7: the chart's numbered markers); `text` is its plain form for the tooltip. */
    footnote?: { node: ReactNode; text: string };
}) {
    const { widget, result, loading, refetching, onRetry, onChooseSource } = props;
    const ok = okResult(result);
    const notes = flagNotes(ok, widget);
    const showTitle = widget.showTitle !== false;
    const padding = widget.style?.padding === 'none' ? 'p-0' : widget.style?.padding === 'sm' ? 'p-3' : 'p-4';
    const transparent = widget.style?.background === 'transparent';
    const card = !(widget.style?.border === false || transparent);
    return (
        <div
            // Themes restyle cards through this marker (dashboard-themes.css); no visual effect alone.
            data-dash-widget={card ? (widget.style?.padding ?? 'md') : undefined}
            className={cn(
                'group/frame relative flex h-full min-h-0 flex-col overflow-hidden',
                transparent ? 'bg-transparent' : 'bg-surface',
                widget.style?.border === false || transparent ? '' : 'rounded-card border border-border-subtle shadow-card',
                'rounded-card',
                padding,
            )}
        >
            {refetching ? <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden"><div className="h-full w-1/3 animate-[tc-shimmer_1.4s_linear_infinite] bg-brand/60" /></div> : null}
            {showTitle ? (
                <div className={cn('mb-3 flex min-w-0 items-start gap-2', widget.style?.titleAlign === 'center' && 'justify-center text-center')}>
                    <h3 className={cn('min-w-0 truncate text-fg', widget.style?.titleSize === 'lg' ? 'text-title' : widget.style?.titleSize === 'sm' ? 'text-body-sm font-medium' : 'text-title-sm')}>
                        {widgetTitle(widget)}
                    </h3>
                    {widget.description ? (
                        <Tooltip content={widget.description}>
                            <button type="button" aria-label="About this widget" className="mt-0.5 shrink-0 text-fg-muted hover:text-fg"><Info aria-hidden size={14} strokeWidth={1.75} /></button>
                        </Tooltip>
                    ) : null}
                    {ok?.sourceLabel && props.mode !== 'public' && widget.source?.type && widget.source.type !== 'default' ? (
                        <span className="mt-0.5 truncate rounded-badge bg-subtle px-1.5 text-caption text-fg-muted">{ok.sourceLabel}</span>
                    ) : null}
                    {actions || (ok && props.mode !== 'edit') ? (
                        <div className="ml-auto flex shrink-0 items-center gap-1" data-pdf-ignore="true">
                            {actions}
                            {ok && props.mode !== 'edit' ? (
                                <Tooltip content="Download CSV">
                                    <button type="button" aria-label={`Download ${widgetTitle(widget)} as CSV`} onClick={() => downloadCsv(widget, ok)} className="rounded p-0.5 text-fg-muted opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/frame:opacity-100">
                                        <Download aria-hidden size={14} />
                                    </button>
                                </Tooltip>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className={cn('relative min-h-0 flex-1', refetching && 'opacity-60 transition-opacity', bodyClassName)}>
                {loading && !ok ? (
                    skeleton === 'none' ? null : skeleton === 'table' ? (
                        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                    ) : (
                        <div className="flex h-full flex-col justify-end gap-3">
                            <Skeleton className="h-px w-full" /><Skeleton className="h-px w-full" /><Skeleton className="h-px w-full" />
                            <Skeleton className="h-2/5 w-full" rounded="md" />
                        </div>
                    )
                ) : result?.status === 'error' && !ok ? (
                    <WidgetError result={result} onRetry={onRetry} onChooseSource={onChooseSource} />
                ) : children}
            </div>
            {notes.length || footnote ? (
                <p className="mt-2 truncate text-caption text-fg-muted" title={[footnote?.text, ...notes].filter(Boolean).join(' · ')}>
                    {footnote?.node}{footnote && notes.length ? ' · ' : ''}{notes.join(' · ')}
                </p>
            ) : null}
        </div>
    );
}
