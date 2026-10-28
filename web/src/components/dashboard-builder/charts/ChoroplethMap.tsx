'use client';

/**
 * Country choropleth (BUILDER.md 7.5, DESIGN.md 6.8): SVG with d3-geo + topojson-client over
 * world-atlas countries-110m (public/geo, fetched once, only when a geo widget renders). SVG so
 * PDF export and screenshots capture it. Sequential ramp of the metric's colour; no data = subtle.
 * Loaded through next/dynamic so these libraries stay out of pages without a map.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';

import { numericToAlpha2, countryName } from '@/lib/builder/countries';

type CountryFeature = Feature<Geometry, { name?: string }> & { id?: string | number };

let atlas: Promise<CountryFeature[]> | null = null;
function loadAtlas(): Promise<CountryFeature[]> {
    atlas ??= fetch('/geo/countries-110m.json')
        .then((r) => r.json() as Promise<Topology>)
        .then((topo) => {
            const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name?: string }>);
            return ('features' in fc ? fc.features : [fc]) as CountryFeature[];
        })
        .catch((e) => {
            atlas = null;
            throw e;
        });
    return atlas;
}

export interface ChoroplethMapProps {
    /** alpha-2 -> value */
    values: Map<string, number>;
    color: string;
    width: number;
    height: number;
    projection: 'naturalEarth' | 'mercator';
    steps: 5 | 7;
    format: (v: number) => string;
    label: string;
    showLegend: boolean;
    /** Click to filter (round 2): a click on a country with data calls this with its code. */
    onSelect?: (code: string) => void;
}

export function ChoroplethMap({ values, color, width, height, projection, steps, format, label, showLegend, onSelect }: ChoroplethMapProps) {
    const [features, setFeatures] = useState<CountryFeature[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [hover, setHover] = useState<{ x: number; y: number; code: string } | null>(null);
    const ref = useRef<SVGSVGElement>(null);

    useEffect(() => {
        let live = true;
        loadAtlas().then((f) => live && setFeatures(f), () => live && setFailed(true));
        return () => { live = false; };
    }, []);

    const legendH = showLegend ? 22 : 0;
    const mapH = height - legendH;

    const { path, thresholds, max } = useMemo(() => {
        const proj = (projection === 'mercator' ? geoMercator() : geoNaturalEarth1()).fitExtent([[2, 2], [width - 2, mapH - 2]], { type: 'Sphere' } as GeoPermissibleObjects);
        const vals = [...values.values()].filter((v) => v > 0).sort((a, b) => a - b);
        const t: number[] = [];
        for (let i = 1; i < steps; i++) t.push(vals.length ? vals[Math.min(vals.length - 1, Math.floor((i / steps) * vals.length))] : 0);
        return { path: geoPath(proj), thresholds: t, max: vals.length ? vals[vals.length - 1] : 0 };
    }, [projection, width, mapH, values, steps]);

    const fillFor = (v: number | undefined) => {
        if (!v || v <= 0) return 'var(--color-subtle)';
        let bin = thresholds.findIndex((t) => v < t);
        if (bin < 0) bin = steps - 1;
        const pct = Math.round(18 + (bin / Math.max(1, steps - 1)) * 82);
        return `color-mix(in oklab, ${color} ${pct}%, var(--color-surface))`;
    };

    // Guard: a world map squeezed under ~70 px tall draws as an empty band (round 4 audit #3).
    if (mapH < 72 || width < 100) return null;
    if (failed) return <p className="py-6 text-center text-body-sm text-fg-muted">The map could not load. The list shows the same numbers.</p>;
    if (!features) return <div className="skeleton" style={{ width, height: mapH }} />;

    return (
        // shrink-0: in a column with the country list, the map box (legend included) never gives up height, so
        // the legend cannot ride over the first country row (round 4 polish).
        <div className="relative shrink-0" style={{ width, height }}>
            <svg ref={ref} width={width} height={mapH} className="block" role="img" aria-label={`${label} by country`} onMouseLeave={() => setHover(null)}>
                {features.map((f, i) => {
                    const code = f.id !== undefined ? numericToAlpha2(f.id) : null;
                    const v = code ? values.get(code) : undefined;
                    const d = path(f);
                    if (!d) return null;
                    return (
                        <path
                            key={`${f.id ?? i}`}
                            d={d}
                            fill={fillFor(v)}
                            stroke="var(--color-surface)"
                            strokeWidth={0.5}
                            onClick={onSelect && code && v ? () => onSelect(code) : undefined}
                            style={onSelect && code && v ? { cursor: 'pointer' } : undefined}
                            onMouseMove={(e) => {
                                const box = ref.current?.getBoundingClientRect();
                                if (box && code) setHover({ x: e.clientX - box.left, y: e.clientY - box.top, code });
                            }}
                        />
                    );
                })}
            </svg>
            {hover ? (
                <div className="pointer-events-none absolute z-10 rounded-popover border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-meta shadow-popover" style={{ left: Math.min(width - 150, hover.x + 12), top: Math.max(0, hover.y - 36) }}>
                    <span className="text-fg-secondary">{countryName(hover.code)}</span>{' '}
                    <span className="font-semibold tabular-nums text-fg">{values.has(hover.code) ? format(values.get(hover.code)!) : 'No data'}</span>
                </div>
            ) : null}
            {showLegend ? (
                <div className="mt-1 flex h-[18px] items-center gap-2 overflow-hidden whitespace-nowrap text-caption leading-none text-fg-muted">
                    <span className="tabular-nums">{format(0)}</span>
                    <span className="flex h-2 w-28 overflow-hidden rounded-full">
                        {Array.from({ length: steps }, (_, i) => (
                            <span key={i} className="h-full flex-1" style={{ background: `color-mix(in oklab, ${color} ${Math.round(18 + (i / Math.max(1, steps - 1)) * 82)}%, var(--color-surface))` }} />
                        ))}
                    </span>
                    <span className="tabular-nums">{format(max)}</span>
                </div>
            ) : null}
        </div>
    );
}

export default ChoroplethMap;
