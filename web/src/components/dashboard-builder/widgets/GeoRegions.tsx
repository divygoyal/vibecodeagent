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
import { countryTotals, geoRows, placeBubbles, PLACES_CREDIT, regionsOf, selectedCountry, type GeoRow } from '@/lib/builder/geo';
import type { GeoWidget } from '@/lib/builder/types';
import { useElementWidth } from '../useElementWidth';
import { usePlaces } from '../charts/GeoBubbleMap';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { plotHeight } from './Charts';
import { dsKey } from './metricUi';
import { geoLayout } from './Other';

const BubbleMap = dynamic(() => import('../charts/GeoBubbleMap').then((m) => m.BubbleMap), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });
const CountryOutline = dynamic(() => import('../charts/GeoBubbleMap').then((m) => m.CountryOutline), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

const ROW_H = 32;

// ── Regions of one country ───────────────────────────────────────────────

export function GeoRegionView(props: WidgetViewProps<GeoWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const c = widget.config;
    const id = c.metric.id;
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [picked, setPicked] = useState<string | null>(null);
    const { rows, notSet } = useMemo(() => geoRows(ok?.parts.rows, 'region', id), [ok, id]);
    const totals = useMemo(() => countryTotals(rows), [rows]);
    const country = selectedCountry(picked ?? c.country, totals);
    const regions = country ? regionsOf(rows, country) : [];
    const countryTotal = totals.find((t) => t.code === country)?.value ?? 0;
    const h = plotHeight(props.height, widget.showTitle !== false);
    const SELECT_H = 40;
    const want = c.topList === 10 ? 10 : 5;
    const fit = Math.max(1, Math.min(want, Math.floor((h - SELECT_H) / ROW_H)));
    const side = width >= 440 && h >= 150;
    const outlineW = side ? Math.min(240, Math.floor(width * 0.4)) : 0;
    const fmt = (v: number) => fmtMetricValue(id, v, { compact: true, currency: ok?.flags.currency });
    const options = totals.slice(0, 40).map((t) => ({ value: t.code, label: countryName(t.code) }));
    if (country && !options.some((o) => o.value === country)) options.unshift({ value: country, label: countryName(country) });
    const shown = regions.slice(0, fit);
    const rest = regions.length - shown.length;
    const foot = notSet > 0 ? `${fmt(notSet)} with no region reported by Google` : '';

    return (
        <WidgetFrame props={props} footnote={foot ? { node: foot, text: foot } : undefined}>
            <div ref={ref} className={cn('flex h-full min-w-0', side ? 'flex-row items-start gap-4' : 'flex-col gap-2')} data-geo-level="region">
                {!ok?.parts.rows ? null : !country ? (
                    <EmptyState variant="inline" title={`No ${metricLabel(id).toLowerCase()} by region in this period`} />
                ) : (
                    <>
                        {side && width > 0 ? <CountryOutline code={country} color={metricColor(id)} width={outlineW} height={Math.min(h, Math.round(outlineW * 0.9))} label={metricLabel(id)} /> : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2" style={{ height: SELECT_H - 8 }}>
                                <Select size="sm" ariaLabel="Country" value={country} onValueChange={setPicked} options={options} className="min-w-0 max-w-[220px] flex-1" />
                                <span className="ml-auto shrink-0 text-body-sm tabular-nums text-fg-secondary" title={`${metricLabel(id)} in ${countryName(country)}`}>{fmt(countryTotal)}</span>
                            </div>
                            {shown.length ? (
                                <BarList
                                    items={shown.map((r) => ({ key: r.place, label: r.place, text: r.place, value: r.value }))}
                                    metric={dsKey(id)}
                                    limit={shown.length}
                                    formatValue={(v) => fmtMetricValue(id, v, { currency: ok?.flags.currency, compact: true })}
                                    labelHeader="Region"
                                />
                            ) : <p className="py-2 text-body-sm text-fg-muted">Google reports no regions for {countryName(country)}.</p>}
                            {rest > 0 ? <p className="px-2 text-meta text-fg-muted">and {rest} more region{rest === 1 ? '' : 's'}</p> : null}
                        </div>
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
    const top = sorted.slice(0, topList);
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
    const mapH = layout.kind === 'list' ? h : layout.kind === 'map' ? h : layout.mapH;

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
                                    limit={layout.kind === 'side' ? Math.min(top.length, layout.listRows) : Math.min(top.length, 5)}
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
