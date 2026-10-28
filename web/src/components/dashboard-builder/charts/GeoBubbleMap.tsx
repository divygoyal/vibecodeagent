'use client';

/**
 * Round 9 geo views on the same map code as the country choropleth (d3-geo + topojson-client over world-atlas
 * countries-110m; no new library, no new shapes):
 * - BubbleMap: land in a quiet fill, one bubble per city at its position (lib/builder/geo.ts lookup).
 * - CountryOutline: one country's outline with its neighbours faint, for the region view.
 * SVG, so PDF export and screenshots capture them. Loaded through next/dynamic like ChoroplethMap.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoMercator, geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import { numericToAlpha2, countryName } from '@/lib/builder/countries';
import { bubbleRadius, bubbleView, PLACES_URL, PlaceIndex, type Bubble, type PlacesFile } from '@/lib/builder/geo';
import { loadAtlas, type CountryFeature } from './ChoroplethMap';

let places: Promise<PlaceIndex> | null = null;
/** The city lookup, fetched once and only when a city map renders. */
export function loadPlaces(): Promise<PlaceIndex> {
    places ??= fetch(PLACES_URL)
        .then((r) => r.json() as Promise<PlacesFile>)
        .then((f) => new PlaceIndex(f))
        .catch((e) => {
            places = null;
            throw e;
        });
    return places;
}

/** The lookup as a hook: null while loading, undefined when it failed (the list then carries every city). */
export function usePlaces(): PlaceIndex | null | undefined {
    const [index, setIndex] = useState<PlaceIndex | null | undefined>(null);
    useEffect(() => {
        let live = true;
        loadPlaces().then((i) => live && setIndex(i), () => live && setIndex(undefined));
        return () => { live = false; };
    }, []);
    return index;
}

function useAtlas(): { features: CountryFeature[] | null; failed: boolean } {
    const [features, setFeatures] = useState<CountryFeature[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let live = true;
        loadAtlas().then((f) => live && setFeatures(f), () => live && setFailed(true));
        return () => { live = false; };
    }, []);
    return { features, failed };
}

export interface BubbleMapProps {
    bubbles: Bubble[];
    color: string;
    width: number;
    height: number;
    projection: 'naturalEarth' | 'mercator';
    format: (v: number) => string;
    label: string;
    /** Click to filter: a click on a bubble calls this with its country code. */
    onSelect?: (country: string) => void;
}

export function BubbleMap({ bubbles, color, width, height, projection, format, label, onSelect }: BubbleMapProps) {
    const { features, failed } = useAtlas();
    const [hover, setHover] = useState<{ x: number; y: number; b: Bubble } | null>(null);
    const ref = useRef<SVGSVGElement>(null);
    const view = useMemo(() => bubbleView(bubbles), [bubbles]);

    const { proj, path, max } = useMemo(() => {
        const box: GeoPermissibleObjects = view
            ? { type: 'Polygon', coordinates: [[[view.west, view.south], [view.east, view.south], [view.east, view.north], [view.west, view.north], [view.west, view.south]]] }
            : ({ type: 'Sphere' } as GeoPermissibleObjects);
        // A zoomed view is always Mercator (the box is in degrees); the world uses the owner's projection.
        const p = (view || projection === 'mercator' ? geoMercator() : geoNaturalEarth1()).fitExtent([[2, 2], [width - 2, height - 2]], box);
        return { proj: p, path: geoPath(p), max: bubbles.reduce((m, b) => Math.max(m, b.value), 0) };
    }, [view, projection, width, height, bubbles]);

    if (height < 72 || width < 100) return null;
    if (failed) return <p className="py-6 text-center text-body-sm text-fg-muted">The map could not load. The list shows the same numbers.</p>;
    if (!features) return <div className="skeleton shrink-0" style={{ width, height }} />;

    // Biggest first so the small bubbles sit on top and stay clickable.
    const sorted = [...bubbles].sort((a, b) => b.value - a.value);
    return (
        <div className="relative shrink-0" style={{ width, height }}>
            <svg ref={ref} width={width} height={height} className="block" role="img" aria-label={`${label} by city`} onMouseLeave={() => setHover(null)} data-geo="bubbles">
                {features.map((f, i) => {
                    const d = path(f);
                    return d ? <path key={`${f.id ?? i}`} d={d} fill="var(--color-subtle)" stroke="var(--color-surface)" strokeWidth={0.5} /> : null;
                })}
                {sorted.map((b) => {
                    const xy = proj([b.lng, b.lat]);
                    if (!xy) return null;
                    return (
                        <circle
                            key={b.key}
                            cx={xy[0]} cy={xy[1]} r={bubbleRadius(b.value, max)}
                            fill={`color-mix(in oklab, ${color} 55%, transparent)`} stroke={color} strokeWidth={1}
                            data-bubble={b.city}
                            onClick={onSelect ? () => onSelect(b.country) : undefined}
                            style={onSelect ? { cursor: 'pointer' } : undefined}
                            onMouseMove={(e) => {
                                const box = ref.current?.getBoundingClientRect();
                                if (box) setHover({ x: e.clientX - box.left, y: e.clientY - box.top, b });
                            }}
                        />
                    );
                })}
            </svg>
            {hover ? (
                <div className="pointer-events-none absolute z-10 rounded-popover border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-meta shadow-popover" style={{ left: Math.min(width - 170, hover.x + 12), top: Math.max(0, hover.y - 36) }}>
                    <span className="text-fg-secondary">{hover.b.city}, {countryName(hover.b.country)}</span>{' '}
                    <span className="font-semibold tabular-nums text-fg">{format(hover.b.value)}</span>
                </div>
            ) : null}
        </div>
    );
}

// ── One country ──────────────────────────────────────────────────────────

/** Parts of a country worth fitting the view to: polygons at least a quarter the size of the biggest (drops far islands and the antimeridian slivers). */
function mainParts(f: CountryFeature): GeoPermissibleObjects {
    if (f.geometry.type !== 'MultiPolygon') return f as GeoPermissibleObjects;
    const polys = (f.geometry as MultiPolygon).coordinates.map((coordinates): Feature<Polygon> => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }));
    const areas = polys.map((p) => geoArea(p));
    const big = Math.max(...areas);
    const keep = polys.filter((_, i) => areas[i] >= big * 0.25);
    return { type: 'MultiPolygon', coordinates: keep.map((p) => p.geometry.coordinates) } as GeoPermissibleObjects;
}

export interface CountryOutlineProps {
    /** ISO alpha-2 */
    code: string;
    color: string;
    width: number;
    height: number;
    label: string;
}

export function CountryOutline({ code, color, width, height, label }: CountryOutlineProps) {
    const { features, failed } = useAtlas();
    const found = useMemo(() => features?.find((f) => f.id !== undefined && numericToAlpha2(f.id) === code) ?? null, [features, code]);
    const path = useMemo(() => {
        if (!found) return null;
        const p = geoMercator().fitExtent([[10, 10], [width - 10, height - 10]], mainParts(found));
        return geoPath(p);
    }, [found, width, height]);
    if (failed) return null;
    if (!features) return <div className="skeleton shrink-0" style={{ width, height }} />;
    if (!found || !path) {
        return <div className="flex shrink-0 items-center justify-center rounded-card bg-surface-sunken text-meta text-fg-muted" style={{ width, height }}>No outline for {countryName(code)}</div>;
    }
    return (
        <svg width={width} height={height} className="block shrink-0 rounded-card bg-surface-sunken" role="img" aria-label={`${countryName(code)}, ${label}`} data-geo="outline" overflow="hidden">
            {features.map((f, i) => {
                if (f === found) return null;
                const d = path(f);
                return d ? <path key={`${f.id ?? i}`} d={d} fill="var(--color-subtle)" stroke="var(--color-surface)" strokeWidth={0.5} /> : null;
            })}
            <path d={path(found) ?? ''} fill={`color-mix(in oklab, ${color} 38%, var(--color-surface))`} stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
        </svg>
    );
}
