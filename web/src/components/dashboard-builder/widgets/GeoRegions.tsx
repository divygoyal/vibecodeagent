'use client';

/**
 * Geo widget, region and city views (round 9). The country view stays in Other.tsx (GeoView); WidgetRenderer picks
 * the view by config.level. Data comes from the same page query (country + region / city rows).
 */
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import { cn } from '@/lib/cn';
import { BarList } from '@/components/charts';
import { EmptyState, Select } from '@/components/ui';
import { fmtMetricValue, metricColor, metricLabel } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import { ADMIN1_CREDIT, countryTotals, geoRows, matchRegions, bubbleView, placeBubbles, PLACES_CREDIT, regionsOf, selectedCountry, visibleRegions, type GeoRow } from '@/lib/builder/geo';
import type { GeoWidget } from '@/lib/builder/types';
import { useElementWidth } from '../useElementWidth';
import { usePlaces } from '../charts/GeoBubbleMap';
import { useAdmin1 } from '../useAdmin1';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { plotHeight } from './Charts';
import { dsKey } from './metricUi';
import { geoLayout } from './Other';

const BubbleMap = dynamic(() => import('../charts/GeoBubbleMap').then((m) => m.BubbleMap), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });
const RegionMap = dynamic(() => import('./RegionMap').then((m) => m.RegionMap), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

const ROW_H = 32;
/** Header row (country picker, metric and total) and the "Show all" control under the list. */
const HEAD_H = 32;
const CONTROL_H = 28;

/** How a region card is laid out in a body of this size (pure, so it is tested). */
export function regionLayout({ width, height, map, want, count }: { width: number; height: number; map: boolean; want: number; count: number }): {
    kind: 'side' | 'stacked' | 'list';
    mapW: number;
    mapH: number;
    listW: number;
    listH: number;
    fit: number;
} {
    const side = map && width >= 440 && height >= 170;
    const stacked = map && !side && width >= 200 && height >= 320;
    const mapW = side ? Math.max(220, Math.min(400, Math.round(width * 0.5))) : width;
    const mapH = side ? height : stacked ? Math.min(Math.round(height * 0.48), Math.round(width * 0.75)) : 0;
    const listW = side ? width - mapW - 16 : width;
    const listH = side ? height : stacked ? height - mapH - 12 : height;
    const rows = Math.max(1, Math.floor((listH - HEAD_H) / ROW_H));
    // The setting (Top 5 / Top 10) is the least that shows; spare card height shows more, up to 10, so the card does not end in empty space.
    const all = Math.min(rows, Math.max(want, 10));
    // Everything fits: no control. Otherwise leave room for it.
    const fit = count <= all ? count : Math.max(2, Math.min(Math.max(want, 10), Math.floor((listH - HEAD_H - CONTROL_H) / ROW_H)));
    return { kind: side ? 'side' : stacked ? 'stacked' : 'list', mapW, mapH, listW, listH, fit };
}

// ── Regions of one country ───────────────────────────────────────────────

export function GeoRegionView(props: WidgetViewProps<GeoWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const c = widget.config;
    const id = c.metric.id;
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [picked, setPicked] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const { rows, notSet } = useMemo(() => geoRows(ok?.parts.rows, 'region', id), [ok, id]);
    const totals = useMemo(() => countryTotals(rows), [rows]);
    const country = selectedCountry(picked ?? c.country, totals);
    const regions = useMemo(() => (country ? regionsOf(rows, country) : []), [rows, country]);
    const countryTotal = totals.find((t) => t.code === country)?.value ?? 0;
    const shapes = useAdmin1(country);
    const match = useMemo(() => (shapes ? matchRegions(shapes, regions) : null), [shapes, regions]);
    // A country with no shapes (or none of whose regions we can place) shows the list across the card.
    const mapOn = shapes === undefined || Boolean(match && match.values.size > 0);
    const h = plotHeight(props.height, widget.showTitle !== false);
    const want = c.topList === 10 ? 10 : 5;
    const lay = regionLayout({ width, height: h, map: mapOn, want, count: regions.length });
    const fmt = (v: number) => fmtMetricValue(id, v, { compact: true, currency: ok?.flags.currency });
    const options = totals.slice(0, 40).map((t) => ({ value: t.code, label: countryName(t.code) }));
    if (country && !options.some((o) => o.value === country)) options.unshift({ value: country, label: countryName(country) });
    const { shown, rest } = visibleRegions(regions, lay.fit, expanded);
    const foot = [
        notSet > 0 ? `${fmt(notSet)} with no region reported by Google` : '',
        match && match.unmatched.length && mapOn ? `${match.unmatched.length} region${match.unmatched.length === 1 ? ' is' : 's are'} in the list only (not found on the map)` : '',
        mapOn && shapes ? ADMIN1_CREDIT : '',
    ].filter(Boolean).join(' · ');
    const metric = metricLabel(id);

    const list = country ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1" style={lay.kind === 'side' ? { width: lay.listW, flex: 'none' } : undefined}>
            <div className="flex items-center gap-2" style={{ height: HEAD_H - 4 }}>
                <Select size="sm" ariaLabel="Country" value={country} onValueChange={(v) => { setPicked(v); setExpanded(false); }} options={options} className="min-w-0 max-w-[220px] flex-1" />
                <span className="ml-auto shrink-0 text-body-sm tabular-nums text-fg-secondary" title={`${metric} in ${countryName(country)}`} data-testid="region-total">
                    <span className="text-fg-muted">{metric}</span> <span className="font-medium text-fg">{fmt(countryTotal)}</span>
                </span>
            </div>
            {shown.length ? (
                <div className={cn(expanded && 'overflow-y-auto')} style={expanded ? { maxHeight: Math.max(ROW_H * 3, lay.listH - HEAD_H - CONTROL_H) } : undefined} data-testid="region-list">
                    <BarList
                        items={shown.map((r) => ({ key: r.place, label: r.place, text: r.place, value: r.value }))}
                        metric={dsKey(id)}
                        limit={shown.length}
                        formatValue={(v) => fmtMetricValue(id, v, { currency: ok?.flags.currency, compact: true })}
                        labelHeader="Region"
                        valueHeader={metric}
                    />
                </div>
            ) : <p className="py-2 text-body-sm text-fg-muted">Google reports no regions for {countryName(country)}.</p>}
            {rest > 0 || (expanded && regions.length > lay.fit) ? (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="self-start rounded-md px-2 py-1 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg" aria-expanded={expanded} data-pdf-ignore="true" data-testid="region-more">
                    {expanded ? `Show top ${lay.fit}` : `Show all ${regions.length} regions`}
                </button>
            ) : null}
        </div>
    ) : null;

    const map = mapOn && country && lay.mapH > 0 && width > 0 ? (
        shapes && match ? <RegionMap code={country} shapes={shapes} values={match.values} color={metricColor(id)} width={lay.mapW} height={lay.mapH} format={fmt} label={metric} />
            : <div className="skeleton shrink-0 rounded-card" style={{ width: lay.mapW, height: lay.mapH }} />
    ) : null;

    return (
        <WidgetFrame props={props} footnote={foot ? { node: foot, text: foot } : undefined}>
            <div ref={ref} className={cn('flex h-full min-w-0', lay.kind === 'side' ? 'flex-row items-start gap-4' : 'flex-col gap-3')} data-geo-level="region" data-geo-layout={lay.kind}>
                {!ok?.parts.rows ? null : !country ? (
                    <EmptyState variant="inline" title={`No ${metric.toLowerCase()} by region in this period`} />
                ) : (
                    <>
                        {map}
                        {list}
                    </>
                )}
            </div>
        </WidgetFrame>
    );
}

// ── City bubbles ─────────────────────────────────────────────────────────

export function GeoCityView(props: WidgetViewProps<GeoWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const c = widget.config;
    const id = c.metric.id;
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const index = usePlaces();
    const { rows } = useMemo(() => geoRows(ok?.parts.rows, 'city', id), [ok, id]);
    const sorted = useMemo<GeoRow[]>(() => [...rows].sort((a, b) => b.value - a.value), [rows]);
    // The map draws the 150 biggest cities; the list under it has them all.
    const { bubbles, missing } = useMemo(() => (index ? placeBubbles(sorted.slice(0, 150), index) : { bubbles: [], missing: [] as GeoRow[] }), [sorted, index]);
    const h = plotHeight(props.height, widget.showTitle !== false);
    const topList = c.topList === 10 ? 10 : 5;
    const layout = geoLayout({ width, height: h, topList, bp: props.bp, legend: false });
    const [listOnlyMap, setListOnlyMap] = useState(false);
    // Beside the map the list uses the card height it has (the Top 5 / Top 10 setting is the least it shows, up to 10 rows).
    const listRows = layout.kind === 'side' ? Math.min(10, Math.max(topList, Math.floor((h + 4) / ROW_H))) : topList;
    const top = sorted.slice(0, listRows);
    const fmt = (v: number) => fmtMetricValue(id, v, { compact: true, currency: ok?.flags.currency });
    const showMap = layout.kind !== 'list' || listOnlyMap;
    const showList = top.length > 0 && (layout.kind === 'side' || layout.kind === 'below' || (layout.kind === 'list' && !listOnlyMap));
    const toggle = layout.kind === 'list' && sorted.length ? (
        <button type="button" onClick={() => setListOnlyMap((v) => !v)} className="rounded-md px-1.5 py-0.5 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg" data-pdf-ignore="true">
            {listOnlyMap ? 'List' : 'Map'}
        </button>
    ) : undefined;
    const foot = [
        PLACES_CREDIT,
        index === undefined ? 'the city positions could not load, the list has every city' : missing.length ? `${missing.length} smaller or unknown ${missing.length === 1 ? 'city is' : 'cities are'} in the list only` : '',
    ].filter(Boolean).join(' · ');
    const mapW = layout.kind === 'list' ? width : layout.kind === 'map' ? width : layout.mapW;
    // A zoomed map (every city in one part of the world) uses the whole card height beside the list; a world map is
    // only about half as tall as wide, so it keeps its own height instead of leaving grey land under it.
    const zoomed = useMemo(() => bubbleView(bubbles) !== null, [bubbles]);
    const mapH = layout.kind === 'list' ? h : layout.kind === 'map' ? h : layout.kind === 'side' && zoomed ? h : layout.mapH;

    return (
        <WidgetFrame props={props} actions={toggle} footnote={sorted.length ? { node: foot, text: foot } : undefined}>
            <div ref={ref} className={cn('flex h-full min-w-0', layout.kind === 'side' ? 'flex-row items-start gap-4' : 'flex-col gap-3')} data-geo-level="city">
                {!ok?.parts.rows ? null : !sorted.length ? (
                    <EmptyState variant="inline" title={`No ${metricLabel(id).toLowerCase()} by city in this period`} />
                ) : (
                    <>
                        {width > 0 && showMap ? (
                            index === null ? <div className="skeleton shrink-0" style={{ width: mapW, height: mapH }} />
                                : index === undefined ? null
                                    : <BubbleMap bubbles={bubbles} color={metricColor(id)} width={mapW} height={mapH} projection={c.projection} format={fmt} label={metricLabel(id)} onSelect={props.onFilterClick} />
                        ) : null}
                        {showList ? (
                            <div className="min-w-0 flex-1 overflow-hidden" style={layout.kind === 'side' ? { width: layout.listW, flex: 'none' } : undefined}>
                                <BarList
                                    items={top.map((r) => ({ key: `${r.country}|${r.place}`, label: r.place, text: `${r.place}, ${countryName(r.country)}`, value: r.value }))}
                                    metric={dsKey(id)}
                                    limit={layout.kind === 'side' ? Math.min(top.length, listRows) : Math.min(top.length, 5)}
                                    formatValue={(v) => fmtMetricValue(id, v, { currency: ok?.flags.currency, compact: layout.kind === 'side' && layout.listW < 200 })}
                                    labelHeader="City"
                                />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </WidgetFrame>
    );
}
