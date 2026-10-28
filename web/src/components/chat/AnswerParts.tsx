'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { heatbarClass } from '@/components/charts/style';
import { area as d3area, curveMonotoneX, line as d3line } from 'd3-shape';
import { useElementWidth } from '@/components/charts/useElementWidth';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { Favicon } from '@/components/ui/Favicon';
import { useScrollEdges } from '@/components/ui/useScrollEdges';
import { analyzeTable, metricForLabel, parseDelta, parseNumber, type TableShape } from '@/lib/chat/answerFormat';
import { AnswerDelta } from './AnswerDelta';
import { highlightNumbersInChildren } from './HighlightedNumbers';

/**
 * Ask answer parts that look like the rest of the app (round 5, audit item 19): changes with the
 * app's ▲▼ colours, links into the app, numeric columns right-aligned with a heat bar on the ranked
 * count, and a sparkline above tables whose rows are dates. They read the markdown the model wrote;
 * nothing about the question or the prompt changes.
 */

/* ─── tables ─── */

interface HastNode {
    type: string;
    tagName?: string;
    value?: string;
    children?: HastNode[];
    position?: { start: { offset?: number } };
}

function hastText(n: HastNode | undefined): string {
    if (!n) return '';
    if (n.type === 'text') return n.value ?? '';
    return (n.children ?? []).map(hastText).join('');
}

function rowsOf(table: HastNode): HastNode[] {
    const out: HastNode[] = [];
    const walk = (n: HastNode) => {
        if (n.tagName === 'tr') { out.push(n); return; }
        (n.children ?? []).forEach(walk);
    };
    walk(table);
    return out;
}

interface TableInfo {
    shape: TableShape;
    header: string[];
    /** Source offset of each th/td -> its column. */
    colAt: Map<number, number>;
    /** The trend above a date table: values in reading order (oldest first). */
    trend: { label: string; values: number[]; labels: string[] } | null;
}

const TableCtx = createContext<TableInfo | null>(null);

const cellsOf = (tr: HastNode) => (tr.children ?? []).filter((c) => c.tagName === 'th' || c.tagName === 'td');

function tableInfo(node: HastNode | undefined): TableInfo | null {
    if (!node) return null;
    const trs = rowsOf(node);
    if (trs.length < 2) return null;
    const header = cellsOf(trs[0]).map((c) => hastText(c).trim());
    const body = trs.slice(1).map((tr) => cellsOf(tr).map((c) => hastText(c).trim()));
    const colAt = new Map<number, number>();
    for (const tr of trs) {
        cellsOf(tr).forEach((c, i) => {
            const off = c.position?.start.offset;
            if (typeof off === 'number') colAt.set(off, i);
        });
    }
    const shape = analyzeTable(header, body);
    let trend: TableInfo['trend'] = null;
    if (shape.timeSeries) {
        let pairs = body.map((r) => ({ when: r[0] ?? '', v: parseNumber(r[shape.seriesCol] ?? '') }));
        // Newest first (common in answers): draw oldest to newest.
        const iso = pairs.every((p) => /^\d{4}-\d{2}/.test(p.when));
        if (iso && pairs.length > 1 && pairs[0].when > pairs[pairs.length - 1].when) pairs = [...pairs].reverse();
        const values = pairs.map((p) => p.v ?? 0);
        if (values.filter((v) => v > 0).length >= 2) {
            trend = { label: header[shape.seriesCol] ?? '', values, labels: pairs.map((p) => p.when) };
        }
    }
    return { shape, header, colAt, trend };
}

const metricOr = (label: string): MetricKey => metricForLabel(label) ?? 'sessions';

/**
 * The trend above a table of dates: one line scaled to the range of the values (a zero-based sparkline
 * would draw 9,840 to 10,612 as a flat line), a dot per row, the first and last labels, and the change.
 */
function TrendLine({ values, labels, metric }: { values: number[]; labels: string[]; metric: MetricKey }) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const H = 64;
    const padX = 6;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(1, Math.abs(max) * 0.1);
    const x = (i: number) => padX + (values.length > 1 ? (i / (values.length - 1)) * (width - padX * 2) : (width - padX * 2) / 2);
    const y = (v: number) => 6 + (1 - (v - min) / span) * (H - 12);
    const color = METRICS[metric].color;
    const linePath = width > 0 ? d3line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values) ?? '' : '';
    const areaPath = width > 0 ? d3area<number>().x((_, i) => x(i)).y0(H).y1((v) => y(v)).curve(curveMonotoneX)(values) ?? '' : '';
    const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(width / 72))));
    return (
        <div ref={ref} className="relative w-full">
            <svg aria-hidden width="100%" height={H} className="block overflow-visible">
                {width > 0 ? (
                    <>
                        <path d={areaPath} fill={color} fillOpacity={0.08} />
                        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
                        {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={color} stroke="var(--tc-surface)" strokeWidth={1.5} />)}
                    </>
                ) : null}
            </svg>
            <div aria-hidden className="relative mt-1 h-4 text-meta text-fg-muted">
                {width > 0 ? labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && !(i !== labels.length - 1 && labels.length - 1 - i < every) ? (
                    <span key={i} className={cn('absolute top-0 whitespace-nowrap', i === 0 ? '' : i === labels.length - 1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: i === labels.length - 1 ? x(i) + padX : i === 0 ? x(i) - padX : x(i) }}>{l}</span>
                ) : null) : null}
            </div>
        </div>
    );
}

function TrendStrip({ info }: { info: TableInfo }) {
    const t = info.trend!;
    const metric = metricOr(t.label);
    const first = t.values[0];
    const last = t.values[t.values.length - 1];
    const change = first > 0 ? parseDelta(`${last >= first ? '+' : '−'}${Math.abs(Math.round((last / first - 1) * 100))}%`) : null;
    const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
    // The change is first row to last row; the answer's text may compare other points (the low, a week). Name the
    // window, and the low when it sits in between, so both readings show on the chart.
    const lowAt = t.values.indexOf(Math.min(...t.values));
    const lowInside = lowAt > 0 && lowAt < t.values.length - 1;
    return (
        <figure className="border-b border-border-subtle px-4 pt-3 pb-2">
            <figcaption className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-meta text-fg-muted">
                <span className="font-medium text-fg-secondary">{t.label}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 tabular-nums">
                    <span>{t.labels[0]} to {t.labels[t.labels.length - 1]}:</span>
                    <span className="flex items-center gap-1.5">
                        {fmt(first)} → <span className="font-semibold text-fg">{fmt(last)}</span>
                        {change ? <AnswerDelta delta={change} /> : null}
                    </span>
                    {lowInside ? <span>· low {fmt(t.values[lowAt])} ({t.labels[lowAt]})</span> : null}
                </span>
            </figcaption>
            <TrendLine values={t.values} labels={t.labels} metric={metric} />
        </figure>
    );
}

/**
 * Where the first column that does not fit starts (px from the scroller's left edge), or null when all fit. The right
 * fade ends there, so a cut-off column is hidden whole instead of showing "vs befo…" / "▲835…" (round 7, audit 17).
 */
function useColumnCut(el: HTMLDivElement | null, more: boolean, scrolled: boolean): number | null {
    const [cut, setCut] = useState<number | null>(null);
    useEffect(() => {
        if (!el || !more) return;
        const measure = () => {
            const box = el.getBoundingClientRect();
            const cells = el.querySelectorAll<HTMLElement>('tr:first-child > th, tr:first-child > td');
            let at: number | null = null;
            for (const c of cells) {
                const r = c.getBoundingClientRect();
                if (r.right > box.right + 1 && r.left < box.right) {
                    at = r.left - box.left;
                    break;
                }
            }
            // A single column wider than the box: a plain edge fade.
            setCut(at !== null && at >= 48 ? Math.round(at) : null);
        };
        measure();
        el.addEventListener('scroll', measure, { passive: true });
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        ro?.observe(el);
        return () => {
            el.removeEventListener('scroll', measure);
            ro?.disconnect();
        };
    }, [el, more, scrolled]);
    return more ? cut : null;
}

/**
 * Tables: thin rules, muted headers, tabular numbers. Each table scrolls sideways in its own box (`relative`, so the
 * screen-reader text inside cells cannot widen the page); on phones the first column stays put while the rest
 * scrolls. When columns are left over, the box fades out where the first hidden column starts and a round arrow
 * scrolls to it, so no word is cut in half (round 7, audit item 17).
 */
export function AnswerTable({ node, children }: { node?: unknown; children?: ReactNode }) {
    const info = useMemo(() => tableInfo(node as HastNode | undefined), [node]);
    const [edgeRef, { more, scrolled }] = useScrollEdges();
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    const ref = useCallback((node: HTMLDivElement | null) => {
        edgeRef(node);
        setEl(node);
    }, [edgeRef]);
    const cut = useColumnCut(el, more, scrolled);
    const mask = more ? (cut !== null ? `linear-gradient(to right, #000 ${cut - 16}px, transparent ${cut}px)` : 'linear-gradient(to left, transparent, #000 40px)') : undefined;
    const next = () => {
        if (!el) return;
        const sticky = el.querySelector<HTMLElement>('tr:first-child > :first-child');
        const stuck = sticky && getComputedStyle(sticky).position === 'sticky' ? sticky.getBoundingClientRect().width : 0;
        el.scrollBy({ left: Math.max(64, (cut ?? el.clientWidth * 0.6) - stuck), behavior: 'smooth' });
    };
    return (
        <TableCtx.Provider value={info}>
            <div className="relative my-4 min-w-0 max-w-full overflow-hidden rounded-card border border-border-subtle bg-surface">
                {info?.trend ? <TrendStrip info={info} /> : null}
                <div className="relative">
                    <div
                        ref={ref}
                        data-scrolled={scrolled ? '' : undefined}
                        // Keyboard users can scroll a table that is wider than its box.
                        tabIndex={more || scrolled ? 0 : undefined}
                        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
                        className="group/answer-table relative overflow-x-auto overscroll-x-contain focus-visible:-outline-offset-2"
                    >
                        <table className="w-full border-collapse text-body-sm tabular-nums">{children}</table>
                    </div>
                    {more ? (
                        // Pointer cue; keyboard users scroll the focusable box itself.
                        <button type="button" tabIndex={-1} aria-hidden onClick={next}
                            className="absolute top-1 right-1.5 grid size-7 place-items-center rounded-full border border-border-subtle bg-surface-raised text-fg-muted shadow-sm hover:text-fg">
                            <ChevronRight size={16} strokeWidth={1.75} />
                        </button>
                    ) : null}
                </div>
            </div>
        </TableCtx.Provider>
    );
}

/** Phones: the first column (the row's name) stays put while the numbers scroll under it. */
const STICKY_FIRST = 'max-md:first:sticky max-md:first:left-0 max-md:first:z-[1] max-md:group-data-[scrolled]/answer-table:first:shadow-[inset_-1px_0_0_var(--tc-border-subtle)]';

function useCell(node: unknown): { info: TableInfo | null; col: number } {
    const info = useContext(TableCtx);
    const off = (node as HastNode | undefined)?.position?.start.offset;
    const col = info && typeof off === 'number' ? info.colAt.get(off) ?? -1 : -1;
    return { info, col };
}

export function AnswerTh({ node, children }: { node?: unknown; children?: ReactNode }) {
    const { info, col } = useCell(node);
    const numeric = info && col >= 0 ? info.shape.numeric[col] : false;
    return (
        <th className={cn('whitespace-nowrap px-3 py-2 text-meta font-medium text-fg-muted first:pl-4 last:pr-4 max-md:first:bg-surface-sunken', STICKY_FIRST, numeric ? 'text-right' : 'text-left')}>{children}</th>
    );
}

/** The underline heat bar of the app's tables (ui/Table `heat.style: 'underline'`). */
const UNDERLINE_HEAT = (pct: number) => ({ width: `${Math.max(pct, 1.5)}%`, ['--tc-heatbar' as string]: '45%' }) as CSSProperties;

export function AnswerTd({ node, children }: { node?: unknown; children?: ReactNode }) {
    const { info, col } = useCell(node);
    // Phones: the name column keeps at least 9.5rem (words wrap whole) so about three columns show; the rest scroll.
    const base = cn('px-3 py-2 align-top text-fg first:pl-4 last:pr-4 max-md:first:min-w-[9.5rem] max-md:first:bg-surface max-md:first:break-words', STICKY_FIRST);
    if (!info || col < 0) return <td className={base}>{highlightNumbersInChildren(children, 'td')}</td>;
    const { shape } = info;
    const text = hastText(node as HastNode).trim();
    const numeric = shape.numeric[col];
    if (shape.delta[col]) {
        const d = parseDelta(text, { bare: true, betterDown: shape.betterDown[col], rank: shape.rankDelta[col] });
        return <td className={cn(base, 'text-right whitespace-nowrap')}>{d ? <AnswerDelta delta={d} /> : children}</td>;
    }
    if (col === shape.barCol) {
        const v = parseNumber(text);
        const pct = v !== null && shape.barMax > 0 ? Math.max(0, Math.min(100, (v / shape.barMax) * 100)) : 0;
        return (
            <td className={cn(base, 'text-right whitespace-nowrap')}>
                <span className="relative inline-flex min-w-16 justify-end pb-1.5">
                    {children}
                    {v !== null ? <span aria-hidden className={cn('absolute bottom-0 right-0 h-[3px] rounded-full', heatbarClass(shape.barMetric ?? 'neutral'))} style={UNDERLINE_HEAT(pct)} /> : null}
                </span>
            </td>
        );
    }
    // Numbers in one weight (the bold-the-big-numbers highlight made "350" bold and "28" not); text cells keep it.
    if (numeric) return <td className={cn(base, 'text-right whitespace-nowrap')}>{children}</td>;
    return <td className={base}>{highlightNumbersInChildren(children, 'td', { betterDown: shape.betterDown[col] })}</td>;
}

/* ─── links ─── */

const SITE_ROOT = /^\/dashboard\/s\/([^/?#]+)$/;

/** Links in answers: into the app with next/link (a site name, or a tab of a site), out with a new tab. */
export function AnswerLink({ href, children, external }: { href?: string; children?: ReactNode; external: (href: string, children: ReactNode) => ReactNode }) {
    const inTable = useContext(TableCtx) !== null;
    if (!href || !href.startsWith('/') || href.startsWith('//')) return <>{external(href ?? '', children)}</>;
    const site = SITE_ROOT.exec(href);
    if (site) {
        const host = decodeURIComponent(site[1]);
        return (
            <Link
                href={href}
                className={cn(
                    'text-fg decoration-border-strong underline-offset-2 transition-colors hover:decoration-fg',
                    inTable ? 'inline-flex max-w-full items-center gap-2 no-underline hover:underline' : 'underline',
                )}
            >
                {inTable ? <Favicon host={host} size={16} /> : null}
                {/* Phones: the whole host (the name column is sticky and the numbers scroll), not "designstudio.exa…" */}
                {inTable ? <span className="min-w-0 max-md:whitespace-nowrap md:truncate">{children}</span> : children}
            </Link>
        );
    }
    return (
        <Link href={href} className="inline-flex items-baseline gap-0.5 font-medium text-brand-text underline decoration-brand-text/30 underline-offset-2 transition-colors hover:decoration-brand-text">
            {children}
            <ArrowRight aria-hidden className="size-3.5 self-center" />
        </Link>
    );
}
