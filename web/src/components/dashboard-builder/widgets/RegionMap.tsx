'use client';

/**
 * Region choropleth (round 9 polish): the states or provinces of one country, shaded like the country map (same
 * quantile steps, same ramp, same legend). Natural Earth admin-1 shapes, one small file per country
 * (public/geo/admin1, see lib/builder/geo.ts). d3-geo only; no new library. The United States uses the Albers USA
 * projection so Alaska and Hawaii sit in their insets; other countries get a projection fitted to their main land
 * (far islands and overseas parts do not shrink the map). SVG, so PDF export and screenshots capture it.
 * Loaded through next/dynamic from GeoRegions.
 */
import { useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoArea, geoBounds, geoCentroid, geoConicEqualArea, geoDistance, geoMercator, geoPath, type GeoProjection, type GeoPermissibleObjects } from 'd3-geo';
import type { MultiPolygon } from 'geojson';

import { countryName } from '@/lib/builder/countries';
import { scaleBin, scaleColor, scaleThresholds, type RegionShape } from '@/lib/builder/geo';

export const REGION_STEPS = 5;
/** Height of the legend under the map, same box as the country map's. */
export const REGION_LEGEND_H = 30;

type Poly = number[][][];

const landCache = new WeakMap<RegionShape[], GeoPermissibleObjects>();
/** Polygons whose centres are this close (degrees) belong to the same piece of land. */
const LINK_DEG = 8;

/**
 * The land the view is fitted to: polygons are linked when their centres are within LINK_DEG of each other (single
 * linkage, so a chain of islands or states counts as one), and the linked group with the most area wins. Overseas
 * territories and far islands (French Guiana, the Canaries) are left out of the fit; they are drawn only when they
 * happen to fall inside the box.
 */
export function mainLand(shapes: RegionShape[]): GeoPermissibleObjects {
    const hit = landCache.get(shapes);
    if (hit) return hit;
    const polys: Array<{ poly: Poly; area: number; c: [number, number] }> = [];
    for (const s of shapes) {
        for (const poly of s.coordinates) {
            const g = { type: 'Polygon', coordinates: poly } as const;
            polys.push({ poly, area: geoArea(g), c: geoCentroid(g) });
        }
    }
    const parent = polys.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const maxRad = (LINK_DEG * Math.PI) / 180;
    for (let i = 0; i < polys.length; i++) {
        for (let j = i + 1; j < polys.length; j++) {
            if (find(i) !== find(j) && geoDistance(polys[i].c, polys[j].c) <= maxRad) parent[find(i)] = find(j);
        }
    }
    const area = new Map<number, number>();
    polys.forEach((p, i) => area.set(find(i), (area.get(find(i)) ?? 0) + p.area));
    let best = -1, bestArea = -1;
    for (const [root, a] of area) if (a > bestArea) { best = root; bestArea = a; }
    // Specks (Okinawa's islands next to Japan's) would stretch the box for nothing: leave pieces under 0.4% of the land out of the fit.
    const kept = polys.filter((p, i) => find(i) === best && p.area >= bestArea * 0.004);
    const out: GeoPermissibleObjects = { type: 'MultiPolygon', coordinates: kept.map((p) => p.poly) };
    landCache.set(shapes, out);
    return out;
}

export function regionProjection(code: string, shapes: RegionShape[], width: number, height: number): GeoProjection {
    const pad = 4;
    const extent: [[number, number], [number, number]] = [[pad, pad], [Math.max(pad + 1, width - pad), Math.max(pad + 1, height - pad)]];
    if (code === 'US') return geoAlbersUsa().fitExtent(extent, { type: 'MultiPolygon', coordinates: shapes.flatMap((s) => s.coordinates) } as GeoPermissibleObjects);
    const land = mainLand(shapes);
    const [[w, s], [e, n]] = geoBounds(land);
    const lonSpan = e >= w ? e - w : e - w + 360;
    const latSpan = n - s;
    const c = geoCentroid(land);
    // A wide country in a flat Mercator is stretched toward the poles (Canada, Russia): a conic projection keeps the shapes true.
    const proj = lonSpan >= 10 || latSpan >= 14
        ? geoConicEqualArea().rotate([-c[0], 0]).center([0, c[1]]).parallels([s + latSpan / 6, n - latSpan / 6])
        : geoMercator();
    return proj.fitExtent(extent, land);
}

export interface RegionMapProps {
    /** ISO alpha-2 */
    code: string;
    shapes: RegionShape[];
    /** Value by shape index. */
    values: Map<number, number>;
    color: string;
    width: number;
    /** Box height, legend included. */
    height: number;
    format: (v: number) => string;
    label: string;
    showLegend?: boolean;
    /** Shape index to emphasise (a hovered list row). */
    active?: number | null;
    onHover?: (index: number | null) => void;
}

export function RegionMap({ code, shapes, values, color, width, height, format, label, showLegend = true, active, onHover }: RegionMapProps) {
    const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
    const ref = useRef<SVGSVGElement>(null);
    const legendH = showLegend ? REGION_LEGEND_H : 0;
    const mapH = height - legendH;

    const paths = useMemo(() => {
        if (mapH < 72 || width < 100) return [];
        const proj = regionProjection(code, shapes, width, mapH);
        const path = geoPath(proj);
        return shapes.map((s) => path({ type: 'MultiPolygon', coordinates: s.coordinates } as MultiPolygon) ?? '');
    }, [code, shapes, width, mapH]);

    const { thresholds, max } = useMemo(() => scaleThresholds(values.values(), REGION_STEPS), [values]);
    const fillFor = (i: number) => {
        const v = values.get(i);
        return v && v > 0 ? scaleColor(color, scaleBin(v, thresholds, REGION_STEPS), REGION_STEPS) : 'var(--color-subtle)';
    };

    if (mapH < 72 || width < 100) return null;
    const hv = hover ? values.get(hover.i) : undefined;
    const lit = hover?.i ?? active ?? null;
    return (
        <div className="relative shrink-0" style={{ width, height }} data-geo-regions={code}>
            <svg ref={ref} width={width} height={mapH} className="block overflow-hidden" role="img" aria-label={`${label} by region, ${countryName(code)}. ${values.size} regions with data.`} onMouseLeave={() => { setHover(null); onHover?.(null); }}>
                {paths.map((d, i) => d ? (
                    <path
                        key={i}
                        d={d}
                        fill={fillFor(i)}
                        stroke={lit === i ? 'var(--color-fg)' : 'var(--color-surface)'}
                        strokeWidth={lit === i ? 1.25 : 0.6}
                        strokeLinejoin="round"
                        data-region={shapes[i].name}
                        onMouseMove={(e) => {
                            const box = ref.current?.getBoundingClientRect();
                            if (box) setHover({ x: e.clientX - box.left, y: e.clientY - box.top, i });
                            onHover?.(i);
                        }}
                    />
                ) : null)}
            </svg>
            {hover ? (
                <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-popover border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-meta shadow-popover" style={{ left: Math.max(0, Math.min(width - 170, hover.x + 12)), top: Math.max(0, hover.y - 40) }}>
                    <span className="text-fg-secondary">{shapes[hover.i].name}</span>{' '}
                    <span className="font-semibold tabular-nums text-fg">{hv !== undefined ? format(hv) : 'No data'}</span>
                </div>
            ) : null}
            {showLegend ? (
                <div className="mt-1 mb-2 flex h-[18px] items-center gap-2 overflow-hidden whitespace-nowrap text-caption leading-none text-fg-muted" aria-hidden>
                    <span className="tabular-nums">{format(0)}</span>
                    <span className="flex h-2 w-28 overflow-hidden rounded-full">
                        {Array.from({ length: REGION_STEPS }, (_, i) => <span key={i} className="h-full flex-1" style={{ background: scaleColor(color, i, REGION_STEPS) }} />)}
                    </span>
                    <span className="tabular-nums">{format(max)}</span>
                </div>
            ) : null}
        </div>
    );
}

export default RegionMap;
