'use client';

/**
 * Heatmap widget (round 9). Weekday x hour reuses the site pages' peak-hours grid (one component, one
 * look); the calendar lays one metric's days out in weeks. Cells are shaded in five steps of the metric's
 * colour (quantiles of the values, so a few spikes do not wash the rest out); every cell is a labelled
 * grid cell, focusable with the arrow keys, and the line under the chart says the value of the cell under
 * the pointer or focus.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui';
import { WeekHourHeatmap } from '@/components/charts/WeekHourHeatmap';
import { FindingLine } from '@/components/site/Finding';
import { peakWindow } from '@/components/site/lib/findings';
import { fmtDayLong } from '@/lib/format';
import { fmtMetricValue, getMetric, metricColor, metricLabel } from '@/lib/builder/catalog';
import { calendarGeometry, CALENDAR_GAP, CALENDAR_LABEL_W, calendarModel, heatLevel, peakSentence, weekdayHourGrid, type CalendarCell, type CalendarModel } from '@/lib/builder/charts/heatmap';
import type { HeatmapWidget } from '@/lib/builder/charts/types';
import { useElementWidth } from '../useElementWidth';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';

const TIME_ZONE_NOTE = 'Hours are in the Analytics property’s time zone.';
const LEVEL_PCT = [0, 18, 38, 58, 78, 100];

/** Fill of a cell at a level: the metric colour mixed into the card (works in light and dark). */
export function heatFill(color: string, level: number): string {
    return level <= 0 ? 'var(--color-subtle)' : `color-mix(in oklab, ${color} ${LEVEL_PCT[Math.min(level, 5)]}%, var(--color-surface))`;
}

export function HeatmapView(props: WidgetViewProps<HeatmapWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const c = widget.config;
    const id = c.metric.id;
    const label = (c.metric.label || metricLabel(id)).toLowerCase();
    const currency = ok?.flags.currency;
    const fmt = (v: number) => fmtMetricValue(id, v, { currency });
    const color = metricColor(id);
    const additive = Boolean(getMetric(id)?.additive);
    const calendar = c.variant === 'calendar';
    const frame = calendar ? ok?.parts.series : ok?.parts.rows;
    const week = useMemo(() => (!calendar && frame ? weekdayHourGrid(frame.rows, id) : null), [calendar, frame, id]);
    const cal = useMemo(() => (calendar && frame ? calendarModel(frame.rows, id, c.weekStart) : null), [calendar, frame, id, c.weekStart]);
    const peak = week && additive ? peakWindow(week.grid, 3) : null;
    const empty = calendar ? !cal || cal.max <= 0 : !week || week.cells === 0 || (additive && week.total <= 0);
    return (
        <WidgetFrame props={props}>
            {!frame ? null : empty ? (
                <EmptyState variant="inline" title={`No ${label} in this period`} />
            ) : (
                <div className="h-full min-h-0 overflow-y-auto">
                    {week ? (
                        <>
                            {c.finding && additive && peak ? <FindingLine finding={{ text: peakSentence(peak, week.total, label), tone: 'info' }} /> : null}
                            <WeekHourHeatmap grid={week.grid} color={color} format={fmt} unit={label} highlight={peak && peak.ratio >= 1.15 ? peak : null} legend note={TIME_ZONE_NOTE} />
                        </>
                    ) : cal ? <CalendarHeat model={cal} color={color} format={fmt} short={(v) => fmtMetricValue(id, v, { currency, compact: true })} unit={label} /> : null}
                </div>
            )}
        </WidgetFrame>
    );
}

// ── Calendar ─────────────────────────────────────────────────────────────

const GAP = CALENDAR_GAP;
const LABEL_W = CALENDAR_LABEL_W;

function CalendarHeat({ model, color, format, short, unit }: { model: CalendarModel; color: string; format: (v: number) => string; short: (v: number) => string; unit: string }) {
    const [box, width] = useElementWidth<HTMLDivElement>();
    const scroller = useRef<HTMLDivElement | null>(null);
    const [hover, setHover] = useState<CalendarCell | null>(null);
    const [active, setActive] = useState<{ c: number; r: number }>(() => {
        const r = model.weeks[0].findIndex(Boolean);
        return { c: 0, r: Math.max(0, r) };
    });
    const cols = model.weeks.length;
    const { w: s, h: sh, roomy, text: showText } = calendarGeometry(width, cols);
    const gridW = LABEL_W + cols * (s + GAP);
    const scrolls = width > 0 && gridW > width + 1;
    useEffect(() => {
        const el = scroller.current;
        if (el && scrolls) el.scrollLeft = el.scrollWidth;
    }, [scrolls, cols]);

    const best = useMemo(() => {
        let b: CalendarCell | null = null;
        for (const w of model.weeks) for (const cell of w) if (cell && typeof cell.value === 'number' && (!b || cell.value > (b.value as number))) b = cell;
        return b;
    }, [model]);
    const nameOf = (cell: CalendarCell) => fmtDayLong(cell.date);

    const move = (e: KeyboardEvent<HTMLDivElement>) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        let { c, r } = active;
        // Step until a cell inside the range is found (the first and last weeks are partial).
        for (let i = 0; i < Math.max(cols, 7); i++) {
            c += d[0];
            r += d[1];
            if (c < 0 || c >= cols || r < 0 || r > 6) return;
            if (model.weeks[c][r]) break;
        }
        if (!model.weeks[c]?.[r]) return;
        setActive({ c, r });
        const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-c="${c}"][data-r="${r}"]`);
        el?.focus();
    };

    // Month labels: skip one that would sit closer than 3 columns to the previous label.
    const monthLabels = model.months.filter((m, i, all) => i === 0 || m.col - all[i - 1].col >= 3);
    const shown = hover ?? null;
    return (
        <div ref={box} className="min-w-0">
            <div ref={scroller} className={cn('pb-1', scrolls ? 'overflow-x-auto' : 'overflow-x-hidden')}>
                <div
                    role="grid"
                    aria-label={`${unit} by day`}
                    aria-rowcount={7}
                    aria-colcount={cols}
                    className="relative mx-auto w-fit"
                    style={{ width: gridW }}
                    onMouseLeave={() => setHover(null)}
                    onKeyDown={move}
                >
                    <div aria-hidden className="relative h-4" style={{ marginLeft: LABEL_W }}>
                        {monthLabels.map((m) => (
                            <span key={m.col} className="absolute top-0 whitespace-nowrap text-caption text-fg-muted" style={{ left: m.col * (s + GAP) }}>{m.label}</span>
                        ))}
                    </div>
                    {model.rows.map((rowLabel, r) => (
                        <div key={r} role="row" className="flex items-center" style={{ height: sh + GAP }}>
                            <span role="rowheader" className="shrink-0 pr-1 text-caption text-fg-muted" style={{ width: LABEL_W }}>{roomy || r % 2 === 0 ? rowLabel : ''}<span className="sr-only">{roomy || r % 2 === 0 ? '' : rowLabel}</span></span>
                            {model.weeks.map((w, ci) => {
                                const cell = w[r];
                                if (!cell) return <span key={ci} role="gridcell" aria-hidden className="shrink-0" style={{ width: s, height: sh, marginRight: GAP }} />;
                                const level = heatLevel(cell.value, model.thresholds);
                                const isActive = active.c === ci && active.r === r;
                                return (
                                    <span
                                        key={ci}
                                        role="gridcell"
                                        data-c={ci}
                                        data-r={r}
                                        tabIndex={isActive ? 0 : -1}
                                        aria-label={`${nameOf(cell)}: ${typeof cell.value === 'number' ? format(cell.value) : 'no data'} ${typeof cell.value === 'number' ? unit : ''}`.trim()}
                                        onMouseEnter={() => setHover(cell)}
                                        onFocus={() => { setHover(cell); setActive({ c: ci, r }); }}
                                        onBlur={() => setHover(null)}
                                        className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-caption tabular-nums outline-offset-1', level >= 5 ? 'text-white' : 'text-fg', hover?.date === cell.date && 'outline-2 outline-fg-muted')}
                                        style={{ width: s, height: sh, marginRight: GAP, background: heatFill(color, level) }}
                                    >
                                        {showText && typeof cell.value === 'number' ? <span aria-hidden>{short(cell.value)}</span> : null}
                                    </span>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
                <p className="h-4 min-w-0 flex-1 truncate text-meta text-fg-muted tabular-nums" aria-live="polite">
                    {shown ? (
                        <>
                            <span className="text-fg-secondary">{nameOf(shown)}:</span>{' '}
                            <span className="font-medium text-fg">{typeof shown.value === 'number' ? format(shown.value) : 'no data'}</span>{typeof shown.value === 'number' ? ` ${unit}` : ''}
                        </>
                    ) : best && typeof best.value === 'number' ? (
                        <><span className="text-fg-secondary">Highest: {nameOf(best)},</span> <span className="font-medium text-fg">{format(best.value)}</span> {unit}</>
                    ) : null}
                </p>
                <div aria-hidden className="flex shrink-0 items-center gap-1 text-caption text-fg-muted" title={`Lowest ${format(model.min)}, highest ${format(model.max)}`}>
                    <span>Less</span>
                    {[1, 2, 3, 4, 5].map((l) => <span key={l} className="block size-2.5 rounded-[2px]" style={{ background: heatFill(color, l) }} />)}
                    <span>More</span>
                </div>
            </div>
        </div>
    );
}
