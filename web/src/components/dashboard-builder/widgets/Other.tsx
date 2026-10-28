'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useElementWidth } from '../useElementWidth';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImageOff, PencilLine } from 'lucide-react';

import { cn } from '@/lib/cn';
import { BarList, Sparkline } from '@/components/charts';
import { EmptyState, Favicon, MetricDelta } from '@/components/ui';
import { fmtMetricValue, metricColor, metricLabel, metricDeltaFor } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import { isPlaceholderMarkdown } from '@/lib/builder/placeholders';
import type { GeoWidget, ImageWidget, PortfolioGridWidget, SectionWidget, TextWidget } from '@/lib/builder/types';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { plotHeight } from './Charts';
import { dsFormat, dsKey, metricBetter } from './metricUi';

const ChoroplethMap = dynamic(() => import('../charts/ChoroplethMap'), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

// ── Geo ──────────────────────────────────────────────────────────────────

export function GeoView(props: WidgetViewProps<GeoWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const id = c.metric.id;
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const values = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of frame?.rows ?? []) {
            const code = String(r['d:country'] ?? '');
            const v = r[`m:${id}`];
            if (code.length === 2 && typeof v === 'number') m.set(code, v);
        }
        return m;
    }, [frame, id]);
    const h = plotHeight(props.height, widget.showTitle !== false);
    const layout = geoLayout({ width, height: h, topList: c.topList, bp: props.bp, legend: c.showLegend });
    const [listOnlyMap, setListOnlyMap] = useState(false);
    const top = [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, c.topList || 0);
    const fmt = (v: number) => fmtMetricValue(id, v, { compact: true, currency: ok?.flags.currency });
    const showMap = layout.kind !== 'list' || listOnlyMap;
    const showList = top.length > 0 && (layout.kind === 'side' || layout.kind === 'below' || (layout.kind === 'list' && !listOnlyMap));
    // Too little room for a readable map under the list: the list shows, the map is one click away.
    const toggle = layout.kind === 'list' && values.size ? (
        <button type="button" onClick={() => setListOnlyMap((v) => !v)} className="rounded-md px-1.5 py-0.5 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg" data-pdf-ignore="true">
            {listOnlyMap ? 'List' : 'Map'}
        </button>
    ) : undefined;
    return (
        <WidgetFrame props={props} actions={toggle}>
            <div ref={ref} className={cn('flex h-full min-w-0', layout.kind === 'side' ? 'flex-row items-start gap-4' : 'flex-col gap-3')}>
                {!frame ? null : !values.size ? (
                    <EmptyState variant="inline" title={`No ${metricLabel(id).toLowerCase()} by country in this period`} />
                ) : (
                    <>
                        {width > 0 && showMap ? <ChoroplethMap values={values} color={metricColor(id)} width={layout.kind === 'list' ? width : layout.mapW} height={layout.kind === 'list' ? h : layout.mapH} projection={c.projection} steps={c.scale.steps} format={fmt} label={metricLabel(id)} showLegend={c.showLegend} onSelect={props.onFilterClick} /> : null}
                        {showList ? (
                            <div className="min-w-0 flex-1 overflow-hidden" style={layout.kind === 'side' ? { width: layout.listW, flex: 'none' } : undefined}>
                                <BarList items={top.map(([code, v]) => ({ key: code, label: countryName(code), text: countryName(code), value: v }))} metric={dsKey(id)} limit={layout.kind === 'side' ? Math.min(top.length, layout.listRows) : Math.min(top.length, 5)} formatValue={(v) => fmtMetricValue(id, v, { currency: ok?.flags.currency, compact: layout.kind === 'side' && layout.listW < 200 })} labelHeader="Country" onItemClick={props.onFilterClick ? (it) => props.onFilterClick!(String(it.key)) : undefined} />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </WidgetFrame>
    );
}

/** Smallest map area (px) a world map is drawn in; smaller boxes left an empty grey band (round 4 audit #3). */
export const MIN_MAP_H = 140;
const LIST_ROW_H = 32;

/**
 * Where the map and the top-countries list go. Wide cards: side by side. Otherwise the list
 * goes under the map when the map keeps at least MIN_MAP_H; else beside it from 340 px wide;
 * else the list alone with a Map toggle.
 */
export function geoLayout({ width, height, topList, bp, legend }: { width: number; height: number; topList: number; bp: 'lg' | 'md' | 'sm'; legend: boolean }):
    | { kind: 'map'; mapW: number; mapH: number }
    | { kind: 'side'; mapW: number; mapH: number; listW: number; listRows: number }
    | { kind: 'below'; mapW: number; mapH: number }
    | { kind: 'list' } {
    if (topList <= 0) return { kind: 'map', mapW: Math.max(120, width), mapH: height };
    const listRows = Math.max(1, Math.min(topList, Math.floor((height + 4) / LIST_ROW_H)));
    const side = (listW: number) => {
        const mapW = Math.max(120, width - listW - 16);
        // A world map is about twice as wide as tall: no taller box than that (keeps it top aligned with the list).
        return { kind: 'side' as const, listW, listRows, mapW, mapH: Math.min(height, Math.round(mapW * 0.56) + (legend ? 30 : 0)) }; // 30 = MAP_LEGEND_H (the map module loads lazily)
    };
    if (bp === 'lg' && width > 520) return side(Math.min(240, Math.floor(width * 0.34)));
    const belowH = height - Math.min(topList, 5) * LIST_ROW_H - 12;
    if (belowH >= MIN_MAP_H) return { kind: 'below', mapW: Math.max(120, width), mapH: belowH };
    if (width >= 340) return side(Math.floor(width * 0.45));
    return { kind: 'list' };
}

// ── Text, section, image ─────────────────────────────────────────────────

export function fillVars(md: string, vars: Record<string, string>): string {
    return md.replace(/\{\{\s*([a-z0-9_:]+)\s*\}\}/gi, (m, k: string) => vars[k] ?? vars[k.toLowerCase()] ?? m);
}

const ROLE: Record<TextWidget['config']['role'], string> = {
    heading: 'text-title text-fg [&_h1]:text-heading [&_h2]:text-title [&_h3]:text-title-sm [&_h1+p]:text-body [&_h1+p]:text-fg-secondary [&_h2+p]:text-body [&_h2+p]:text-fg-secondary [&_h1+p]:font-normal [&_h2+p]:font-normal',
    subheading: 'text-title-sm text-fg-secondary',
    body: 'text-body text-fg-secondary',
    note: 'text-body-sm text-fg-muted',
    callout: 'text-body text-fg-secondary',
};

/** Viewers never see empty bullet points left for the author to fill in (round 2). */
export function stripEmptyBullets(md: string): string {
    return /^[ \t]*[-*+][ \t]*$/m.test(md) ? md.split('\n').filter((l) => !/^[ \t]*[-*+][ \t]*$/.test(l)).join('\n') : md;
}

export function TextView({ widget, vars, mode }: WidgetViewProps<TextWidget>) {
    const c = widget.config;
    const prompt = isPlaceholderMarkdown(c.markdown);
    // Template prompts ("What went well this month") are for the author only (round 4).
    if (mode !== 'edit' && (prompt || !c.markdown.trim())) return null;
    const filled = c.variables ? fillVars(c.markdown, vars) : c.markdown;
    const md = mode === 'edit' ? filled : stripEmptyBullets(filled);
    return (
        <div data-dash-widget={c.role !== 'callout' && widget.style?.background === 'surface' && !prompt ? 'md' : undefined} className={cn(
            'h-full overflow-auto',
            prompt ? 'rounded-card border border-dashed border-border bg-surface-sunken/60 p-4'
                : c.role === 'callout' ? 'rounded-card border border-border-subtle bg-surface-sunken p-4' : widget.style?.background === 'surface' ? 'rounded-card border border-border-subtle bg-surface p-4 shadow-card' : 'px-1 py-1',
        )}>
            {prompt ? (
                <p className="mb-2 flex items-center gap-1.5 text-caption font-medium text-fg-muted">
                    <PencilLine aria-hidden size={12} strokeWidth={1.75} />
                    Template prompt: viewers do not see it until you write your own text
                </p>
            ) : null}
            <div className={cn(
                'max-w-none space-y-2 [&_a]:text-brand-text [&_a]:underline [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_strong]:text-fg [&_ul]:list-disc',
                ROLE[c.role],
                prompt && 'opacity-70',
                c.align === 'center' && 'text-center',
                c.align === 'right' && 'text-right',
            )}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}
                >
                    {md}
                </ReactMarkdown>
            </div>
        </div>
    );
}

export function SectionView({ widget }: WidgetViewProps<SectionWidget>) {
    const c = widget.config;
    return (
        <div className={cn('flex h-full flex-col justify-end pb-1', c.align === 'center' && 'items-center text-center')}>
            <h2 className="text-title text-fg">{c.title}</h2>
            {c.subtitle ? <p className="text-body-sm text-fg-muted">{c.subtitle}</p> : null}
            {c.divider ? <div aria-hidden className="mt-2 h-px w-full bg-border-subtle" /> : null}
        </div>
    );
}

export function ImageView({ widget }: WidgetViewProps<ImageWidget>) {
    const c = widget.config;
    const safe = /^https:\/\//i.test(c.src);
    const [failed, setFailed] = useState(false);
    const ref = useRef<HTMLImageElement>(null);
    // A load error that fired before hydration never reaches onError: check the element once mounted.
    useEffect(() => {
        const el = ref.current;
        setFailed(Boolean(el && el.complete && el.naturalWidth === 0));
    }, [c.src]);
    const radius = c.radius === 'none' ? '' : c.radius === 'sm' ? 'rounded-md' : c.radius === 'full' ? 'rounded-full' : 'rounded-card';
    const img = safe && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={c.src} alt={c.alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('h-full w-full', c.fit === 'cover' ? 'object-cover' : 'object-contain', radius)} />
    ) : (
        <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-border bg-surface-sunken px-3 text-center text-body-sm text-fg-muted', radius)}>
            <ImageOff aria-hidden size={20} strokeWidth={1.75} />
            {safe ? (c.alt ? `${c.alt} (image unavailable)` : 'Image unavailable') : 'Add an https image URL'}
        </div>
    );
    return c.href && /^https:\/\//i.test(c.href) ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="block h-full">{img}</a> : <div className="h-full">{img}</div>;
}

// ── Portfolio grid ───────────────────────────────────────────────────────

export function PortfolioGridView(props: WidgetViewProps<PortfolioGridWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const sites = ok?.parts.sites;
    const spark = ok?.parts.spark;
    const c = widget.config;
    const [showAll, setShowAll] = useState(false);
    const metrics = c.metrics.map((m) => m.id);
    const first = metrics[0];
    const sorted = useMemo(() => {
        const rows = [...(sites?.rows ?? [])];
        const key = c.sort.by;
        const val = (r: Record<string, unknown>) => {
            if (key === 'name') return String(r['d:site']);
            if (key === 'change') {
                const cur = Number(r[`m:${first}`] ?? 0);
                const prev = Number(r[`m:${first}:prev`] ?? 0);
                return prev > 0 ? (cur - prev) / prev : cur > 0 ? 1 : 0;
            }
            return Number(r[`m:${key}`] ?? 0);
        };
        rows.sort((a, b) => {
            const av = val(a);
            const bv = val(b);
            const d = typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number);
            return c.sort.dir === 'asc' ? d : -d;
        });
        return rows;
    }, [sites, c.sort, first]);
    const series = useMemo(() => {
        const m = new Map<string, { dates: string[]; a: (number | null)[]; b: (number | null)[] }>();
        for (const r of spark?.rows ?? []) {
            const s = String(r['d:site']);
            const e = m.get(s) ?? { dates: [], a: [], b: [] };
            e.dates.push(String(r['d:date']));
            e.a.push(typeof r[`m:${metrics[0]}`] === 'number' ? (r[`m:${metrics[0]}`] as number) : null);
            e.b.push(metrics[1] && typeof r[`m:${metrics[1]}`] === 'number' ? (r[`m:${metrics[1]}`] as number) : null);
            m.set(s, e);
        }
        return m;
    }, [spark, metrics]);
    // Phones: the card grows with its content (DashboardCanvas growsOnPhone), so show the first few and "Show all".
    const limit = props.bp === 'sm' ? Math.min(c.limit, c.show === 'compact' ? 8 : 4) : c.limit;
    const shown = showAll ? sorted : sorted.slice(0, limit);
    const cols = c.columns === 'auto' ? (props.bp === 'sm' ? 1 : props.bp === 'md' ? 2 : 3) : c.columns;
    return (
        <WidgetFrame props={props} bodyClassName="overflow-y-auto">
            {!sites ? null : !sorted.length ? <EmptyState variant="inline" title="No sites yet" /> : (
                <>
                    <div className={cn('grid gap-3', c.show === 'compact' && 'gap-0 divide-y divide-border-subtle')} style={{ gridTemplateColumns: c.show === 'compact' ? '1fr' : `repeat(${cols}, minmax(0, 1fr))` }}>
                        {shown.map((r) => {
                            const site = String(r['d:site']);
                            const s = series.get(site);
                            const alert = c.alerts && metrics.some((id) => {
                                const d = metricDeltaFor(id, r[`m:${id}`] as number, r[`m:${id}:prev`] as number);
                                return d.state === 'change' && d.tone === 'bad' && (d.change ?? 0) <= -30 && /^(gsc:clicks|ga4:activeUsers|ga4:sessions)$/.test(id);
                            });
                            const body = (
                                <>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Favicon host={site.replace(/--\d+$/, '')} size={16} />
                                        <span className="truncate text-title-sm text-fg" title={sites.sublabels?.[site] ? `${sites.labels?.[site] ?? site} · ${sites.sublabels[site]}` : undefined}>
                                            {sites.labels?.[site] ?? site}
                                            {/* Host first, the GA4 property name after it in muted text (round 5 audit #14); phones: host only. */}
                                            {sites.sublabels?.[site] ? <span className="ml-1.5 text-body-sm font-normal text-fg-muted max-md:hidden">{sites.sublabels[site]}</span> : null}
                                        </span>
                                        {alert ? <span className="ml-auto shrink-0 rounded-badge bg-down-soft px-1.5 text-caption text-down">Drop</span> : null}
                                    </div>
                                    <div className={cn('mt-2 grid gap-x-3 gap-y-1', c.show === 'compact' ? 'grid-cols-4' : 'grid-cols-2')}>
                                        {metrics.map((id) => {
                                            const v = r[`m:${id}`];
                                            const pv = r[`m:${id}:prev`];
                                            return (
                                                <div key={id} className="min-w-0">
                                                    <p className="flex items-center gap-1 truncate text-caption text-fg-muted"><span aria-hidden className="size-1.5 rounded-full" style={{ background: metricColor(id) }} />{metricLabel(id)}</p>
                                                    <p className="flex items-baseline gap-1.5">
                                                        <span className="text-stat-sm text-fg">{fmtMetricValue(id, typeof v === 'number' ? v : null, { compact: true })}</span>
                                                        {typeof v === 'number' ? <MetricDelta current={v} previous={typeof pv === 'number' ? pv : null} format={dsFormat(id)} better={metricBetter(id)} /> : null}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {c.sparkline && s && c.show === 'cards' ? (
                                        <div className="mt-2"><Sparkline series={[{ metric: dsKey(metrics[0]), values: s.a, label: metricLabel(metrics[0]) }, ...(metrics[1] ? [{ metric: dsKey(metrics[1]), values: s.b, label: metricLabel(metrics[1]) }] : [])]} dates={s.dates} height={48} interactive={false} /></div>
                                    ) : null}
                                </>
                            );
                            const cls = cn('block min-w-0 text-left', c.show === 'cards' ? 'rounded-card border border-border-subtle bg-surface p-3' : 'py-2');
                            return c.onClick === 'open-site' && props.mode !== 'public' && props.mode !== 'edit'
                                ? <Link key={site} href={`/dashboard/s/${encodeURIComponent(site)}`} className={cn(cls, 'transition-colors hover:border-border')}>{body}</Link>
                                : <div key={site} className={cls}>{body}</div>;
                        })}
                    </div>
                    {sorted.length > limit ? (
                        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-body-sm font-medium text-brand-text hover:underline">{showAll ? 'Show fewer' : `Show all ${sorted.length} sites`}</button>
                    ) : null}
                </>
            )}
        </WidgetFrame>
    );
}

