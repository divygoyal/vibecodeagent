'use client';

/**
 * Round 9 geo views on the same map code as the country choropleth (d3-geo + topojson-client over world-atlas
 * countries-110m; no new library, no new shapes):
 * - BubbleMap: land in a quiet fill, one bubble per city at its position (lib/builder/geo.ts lookup). Bubbles that
 *   would sit on top of each other are folded into one (declutterBubbles); the tooltip names the cities in it.
 * (The region view has its own shapes, widgets/RegionMap.tsx.)
 * SVG, so PDF export and screenshots capture them. Loaded through next/dynamic like ChoroplethMap.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';

import { countryName } from '@/lib/builder/countries';
import { bubbleView, declutterBubbles, PLACES_URL, PlaceIndex, type Bubble, type BubbleCluster, type PlacesFile } from '@/lib/builder/geo';
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
    const [hover, setHover] = useState<{ x: number; y: number; b: BubbleCluster } | null>(null);
    const ref = useRef<SVGSVGElement>(null);
    const view = useMemo(() => bubbleView(bubbles), [bubbles]);

    const { proj, path } = useMemo(() => {
        const box: GeoPermissibleObjects = view
            ? { type: 'Polygon', coordinates: [[[view.west, view.south], [view.east, view.south], [view.east, view.north], [view.west, view.north], [view.west, view.south]]] }
            : ({ type: 'Sphere' } as GeoPermissibleObjects);
        // A zoomed view is always Mercator (the box is in degrees); the world uses the owner's projection.
        const p = (view || projection === 'mercator' ? geoMercator() : geoNaturalEarth1()).fitExtent([[2, 2], [width - 2, height - 2]], box);
        return { proj: p, path: geoPath(p) };
    }, [view, projection, width, height]);

    // Bubble size follows the map (a small card gets small bubbles) and never exceeds 14 px; bubbles that overlap are folded together.
    const clusters = useMemo(() => {
        const maxPx = Math.max(6, Math.min(14, Math.round(Math.min(width, height) / 16)));
        const items = bubbles.flatMap((b) => {
            const xy = proj([b.lng, b.lat]);
            return xy ? [{ key: b.key, city: b.city, country: b.country, value: b.value, x: xy[0], y: xy[1] }] : [];
        });
        return declutterBubbles(items, { maxPx, minPx: 2.5, overlap: 0.8 });
    }, [bubbles, proj, width, height]);

    if (height < 72 || width < 100) return null;
    if (failed) return <p className="py-6 text-center text-body-sm text-fg-muted">The map could not load. The list shows the same numbers.</p>;
    if (!features) return <div className="skeleton shrink-0" style={{ width, height }} />;

    // clusters come biggest first: draw them in reverse so the small ones sit on top and stay clickable.
    const drawn = [...clusters].reverse();
    return (
        <div className="relative shrink-0" style={{ width, height }}>
            <svg ref={ref} width={width} height={height} className="block" role="img" aria-label={`${label} by city`} onMouseLeave={() => setHover(null)} data-geo="bubbles">
                {features.map((f, i) => {
                    const d = path(f);
                    return d ? <path key={`${f.id ?? i}`} d={d} fill="var(--color-subtle)" stroke="var(--color-surface)" strokeWidth={0.5} /> : null;
                })}
                {drawn.map((b) => (
                    <g key={b.key} data-bubble={b.city} data-cluster={b.members.length ? b.members.length + 1 : undefined}
                        onClick={onSelect ? () => onSelect(b.country) : undefined}
                        style={onSelect ? { cursor: 'pointer' } : undefined}
                        onMouseMove={(e) => {
                            const box = ref.current?.getBoundingClientRect();
                            if (box) setHover({ x: e.clientX - box.left, y: e.clientY - box.top, b });
                        }}>
                        <circle cx={b.x} cy={b.y} r={b.r} fill={`color-mix(in oklab, ${color} 34%, transparent)`} stroke={`color-mix(in oklab, ${color} 80%, transparent)`} strokeWidth={1} />
                        {b.members.length && b.r >= 8 ? <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600} fill="var(--color-fg)" pointerEvents="none">{b.members.length + 1}</text> : null}
                    </g>
                ))}
            </svg>
            {hover ? (
                <div className="pointer-events-none absolute z-10 max-w-[240px] rounded-popover border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-meta shadow-popover" style={{ left: Math.max(0, Math.min(width - 190, hover.x + 12)), top: Math.max(0, hover.y - 36) }}>
                    <div>
                        <span className="text-fg-secondary">{hover.b.city}, {countryName(hover.b.country)}</span>{' '}
                        <span className="font-semibold tabular-nums text-fg">{format(hover.b.members.length ? hover.b.value - hover.b.members.reduce((t, m) => t + m.value, 0) : hover.b.value)}</span>
                    </div>
                    {hover.b.members.length ? (
                        <div className="mt-0.5 text-fg-muted">
                            + {hover.b.members.slice(0, 3).map((m) => m.city).join(', ')}{hover.b.members.length > 3 ? ` and ${hover.b.members.length - 3} more` : ''}
                            <span className="tabular-nums"> · {format(hover.b.value)} together</span>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
