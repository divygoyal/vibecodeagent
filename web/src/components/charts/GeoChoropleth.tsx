'use client';

/**
 * Responsive world choropleth for the site pages (Overview, Audience, Realtime).
 *
 * Same data and drawing as the dashboard builder's map
 * (components/dashboard-builder/charts/ChoroplethMap.tsx): SVG with d3-geo +
 * topojson-client over world-atlas countries-110m (/geo/countries-110m.json,
 * fetched once and shared), a sequential ramp of the metric colour. Adds what
 * the site pages need and the builder widget does not: it follows its box
 * width, clicking a country selects it (click-to-filter), the selected
 * country is outlined, and optional pulsing dots mark live countries.
 */
import { useEffect, useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';
import { countryName, numericToAlpha2 } from '@/lib/builder/countries';
import { useElementWidth } from './useElementWidth';

type CountryFeature = Feature<Geometry, { name?: string }> & { id?: string | number };

let atlas: Promise<CountryFeature[]> | null = null;
function loadAtlas(): Promise<CountryFeature[]> {
    atlas ??= fetch('/geo/countries-110m.json')
        .then((r) => {
            if (!r.ok) throw new Error(`atlas ${r.status}`);
            return r.json() as Promise<Topology>;
        })
        .then((topo) => {
            const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name?: string }>);
            // Antarctica (010) has no visitors and takes a fifth of the height.
            return (('features' in fc ? fc.features : [fc]) as CountryFeature[]).filter((f) => String(f.id) !== '010');
        })
        .catch((e) => {
            atlas = null;
            throw e;
        });
    return atlas;
}

export interface GeoChoroplethProps {
    /** ISO alpha-2 -> value. */
    values: Map<string, number>;
    /** Ramp colour (a metric colour CSS var). */
    color: string;
    format: (v: number) => string;
    /** "Users", for the tooltip and aria label. */
    label: string;
    /** Width / height. Default 1.9. */
    aspect?: number;
    maxHeight?: number;
    selected?: string | null;
    onSelect?: (code: string) => void;
    /** Pulsing dots at these countries' centres (realtime). */
    markers?: string[];
    showLegend?: boolean;
    className?: string;
}

const STEPS = 5;

export function rampColor(color: string, step: number, steps = STEPS): string {
    const pct = Math.round(18 + (step / Math.max(1, steps - 1)) * 82);
    return `color-mix(in oklab, ${color} ${pct}%, var(--color-surface))`;
}

export function GeoChoropleth({ values, color, format, label, aspect = 1.9, maxHeight = 360, selected, onSelect, markers, showLegend = true, className }: GeoChoroplethProps) {
    const [features, setFeatures] = useState<CountryFeature[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [hover, setHover] = useState<{ x: number; y: number; code: string } | null>(null);
    const [boxRef, width] = useElementWidth<HTMLDivElement>();
    const reduce = useReducedMotion();

    useEffect(() => {
        let live = true;
        loadAtlas().then((f) => live && setFeatures(f), () => live && setFailed(true));
        return () => { live = false; };
    }, []);

    const height = Math.min(maxHeight, Math.max(120, Math.round(width / aspect)));

    const geo = useMemo(() => {
        if (!features || width <= 0) return null;
        const fc: FeatureCollection = { type: 'FeatureCollection', features };
        const proj = geoNaturalEarth1().fitExtent([[2, 2], [width - 2, height - 2]], fc as GeoPermissibleObjects);
        const path = geoPath(proj);
        const shapes = features.map((f, i) => {
            const code = f.id !== undefined ? numericToAlpha2(f.id) : null;
            return { key: `${f.id ?? i}`, code, d: path(f) ?? '', centroid: path.centroid(f) };
        }).filter((s) => s.d);
        return { shapes };
    }, [features, width, height]);

    const { thresholds, max, total } = useMemo(() => {
        const vals = [...values.values()].filter((v) => v > 0).sort((a, b) => a - b);
        const t: number[] = [];
        for (let i = 1; i < STEPS; i++) t.push(vals.length ? vals[Math.min(vals.length - 1, Math.floor((i / STEPS) * vals.length))] : 0);
        return { thresholds: t, max: vals.length ? vals[vals.length - 1] : 0, total: vals.reduce((a, b) => a + b, 0) };
    }, [values]);

    const fillFor = (v: number | undefined) => {
        if (!v || v <= 0) return 'var(--color-subtle)';
        let bin = thresholds.findIndex((t) => v < t);
        if (bin < 0) bin = STEPS - 1;
        return rampColor(color, bin);
    };

    const markerSet = useMemo(() => new Set(markers ?? []), [markers]);
    const hv = hover ? values.get(hover.code) : undefined;

    return (
        <div ref={boxRef} className={cn('relative w-full min-w-0', className)}>
            {failed ? (
                <p className="py-10 text-center text-body-sm text-fg-muted">The map could not load. The list shows the same numbers.</p>
            ) : !geo ? (
                <div className="skeleton w-full rounded-md" style={{ height: height || 200 }} />
            ) : (
                <svg
                    width={width}
                    height={height}
                    role="img"
                    aria-label={`${label} by country. ${values.size} countries with data.`}
                    className="block"
                    onMouseLeave={() => setHover(null)}
                >
                    {geo.shapes.map((s) => {
                        const v = s.code ? values.get(s.code) : undefined;
                        const isSel = Boolean(selected && s.code === selected);
                        const clickable = Boolean(onSelect && s.code && v && v > 0);
                        return (
                            <path
                                key={s.key}
                                d={s.d}
                                fill={fillFor(v)}
                                stroke={isSel ? 'var(--color-fg)' : 'var(--color-surface)'}
                                strokeWidth={isSel ? 1.25 : 0.5}
                                className={cn('transition-[fill-opacity] duration-120', clickable && 'cursor-pointer hover:[fill-opacity:0.8]')}
                                onMouseMove={(e) => {
                                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                                    if (s.code) setHover({ x: e.clientX - box.left, y: e.clientY - box.top, code: s.code });
                                }}
                                onClick={clickable ? () => onSelect!(s.code!) : undefined}
                            />
                        );
                    })}
                    {markerSet.size ? geo.shapes.filter((s) => s.code && markerSet.has(s.code) && Number.isFinite(s.centroid[0])).map((s) => (
                        <g key={`m-${s.key}`} transform={`translate(${s.centroid[0]},${s.centroid[1]})`} pointerEvents="none">
                            {reduce ? null : (
                                <circle r={4} fill={color} opacity={0.5}>
                                    <animate attributeName="r" from="3.5" to="13" dur="1.8s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from="0.45" to="0" dur="1.8s" repeatCount="indefinite" />
                                </circle>
                            )}
                            <circle r={3.5} fill={color} stroke="var(--color-surface)" strokeWidth={1.5} />
                        </g>
                    )) : null}
                </svg>
            )}
            {hover && geo ? (
                <div
                    className="pointer-events-none absolute z-10 whitespace-nowrap rounded-popover border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-meta shadow-popover"
                    style={{ left: Math.max(0, Math.min(width - 170, hover.x + 12)), top: Math.max(0, hover.y - 40) }}
                >
                    <span className="text-fg-secondary">{countryName(hover.code)}</span>{' '}
                    <span className="font-semibold tabular-nums text-fg">{hv !== undefined ? format(hv) : 'No data'}</span>
                    {hv !== undefined && total > 0 ? <span className="text-fg-muted"> · {Math.round((hv / total) * 1000) / 10}%</span> : null}
                </div>
            ) : null}
            {showLegend && geo && max > 0 ? (
                <div className="mt-2 flex items-center gap-2 text-caption text-fg-muted" aria-hidden>
                    <span>Fewer {label.toLowerCase()}</span>
                    <span className="flex h-1.5 w-24 overflow-hidden rounded-full">
                        {Array.from({ length: STEPS }, (_, i) => <span key={i} className="h-full flex-1" style={{ background: rampColor(color, i) }} />)}
                    </span>
                    <span>More</span>
                </div>
            ) : null}
        </div>
    );
}

export default GeoChoropleth;
