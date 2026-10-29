/**
 * Geo map views beyond countries (round 9). Isomorphic and dependency free.
 *
 * GA4 reports regions and cities by NAME and gives no coordinates and no region shapes. So:
 * - Region view: a ranked list of one country's regions (bars) beside that country's outline (world-atlas, already
 *   shipped for the country map). No region polygons exist in the repo, so none are drawn.
 * - City view: bubbles at each city's position from a small lookup (public/geo/places-50k.json: Natural Earth
 *   populated places with 50,000+ people, PUBLIC DOMAIN, see public/geo/LICENSE-natural-earth.txt). A city the lookup
 *   does not know (a small town, a spelling GA4 uses that we do not) is not drawn; the ranked list under the map
 *   still has it, and the footnote says how many are missing.
 */
import type { DataFrame, GeoConfig } from './types';

export const GEO_LEVELS: Array<{ id: GeoConfig['level']; label: string }> = [
    { id: 'country', label: 'Countries' },
    { id: 'region', label: 'Regions of a country' },
    { id: 'city', label: 'City bubbles' },
];

export const PLACES_URL = '/geo/places-50k.json';
export const PLACES_CREDIT = 'City positions: Natural Earth (public domain)';

export function geoLevelOf(c: Pick<GeoConfig, 'level'> | undefined): GeoConfig['level'] {
    return c?.level === 'region' || c?.level === 'city' ? c.level : 'country';
}

/** The dimension a level breaks the metric down by, next to the country. */
export function geoDimension(level: GeoConfig['level']): 'country' | 'region' | 'city' {
    return level;
}

// ── Rows ─────────────────────────────────────────────────────────────────

export interface GeoRow {
    country: string;
    /** Region or city name. */
    place: string;
    value: number;
}

const NOT_SET = '(not set)';

/** Rows of a region / city frame: country code, place name and value; zero and unknown places dropped. */
export function geoRows(frame: DataFrame | undefined, level: 'region' | 'city', metricId: string): { rows: GeoRow[]; notSet: number } {
    const rows: GeoRow[] = [];
    let notSet = 0;
    for (const r of frame?.rows ?? []) {
        const country = String(r['d:country'] ?? '');
        const place = String(r[`d:${level}`] ?? '');
        const v = r[`m:${metricId}`];
        if (typeof v !== 'number' || !(v > 0)) continue;
        if (!place || place === NOT_SET) {
            notSet += v;
            continue;
        }
        rows.push({ country, place, value: v });
    }
    return { rows, notSet };
}

/** Countries with data, biggest first (sum over their regions or cities). */
export function countryTotals(rows: GeoRow[], notSet: Map<string, number> | null = null): Array<{ code: string; value: number }> {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.country, (m.get(r.country) ?? 0) + r.value);
    if (notSet) for (const [k, v] of notSet) m.set(k, (m.get(k) ?? 0) + v);
    return [...m.entries()].map(([code, value]) => ({ code, value })).sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
}

/** The country a region view shows: the owner's pick when it has data, else the country with the most. */
export function selectedCountry(pick: string | undefined, totals: Array<{ code: string; value: number }>): string | null {
    if (pick && totals.some((t) => t.code === pick)) return pick;
    return totals[0]?.code ?? null;
}

/** Regions of one country, biggest first. */
export function regionsOf(rows: GeoRow[], country: string): GeoRow[] {
    return rows.filter((r) => r.country === country).sort((a, b) => b.value - a.value || a.place.localeCompare(b.place));
}

// ── Places ───────────────────────────────────────────────────────────────

export interface Place { name: string; country: string; lat: number; lng: number }

type PlaceTuple = [name: string, iso2: string, lat: number, lng: number, popMax: number, alt?: string[]];
export interface PlacesFile { v: number; source: string; places: PlaceTuple[] }

/** "São Paulo" and "Sao Paulo" and "sao-paulo" are one key. */
export function placeKey(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export class PlaceIndex {
    private byKey = new Map<string, Place>();

    constructor(file: PlacesFile | null | undefined) {
        // Biggest places first in the file: the first claim on a name wins ("London, CA" never beats "London, GB" because the key includes the country).
        for (const t of file?.places ?? []) {
            const [name, country, lat, lng, , alts] = t;
            if (typeof lat !== 'number' || typeof lng !== 'number') continue;
            const place: Place = { name, country, lat, lng };
            for (const n of [name, ...(alts ?? [])]) {
                const k = `${country}|${placeKey(n)}`;
                if (!this.byKey.has(k)) this.byKey.set(k, place);
            }
        }
    }

    get size(): number {
        return this.byKey.size;
    }

    find(country: string, city: string): Place | null {
        if (!country || !city || city === NOT_SET) return null;
        return this.byKey.get(`${country}|${placeKey(city)}`) ?? null;
    }
}

export interface Bubble { key: string; city: string; country: string; value: number; lat: number; lng: number }

/** Splits city rows into bubbles (position known) and the cities the lookup does not know. */
export function placeBubbles(rows: GeoRow[], index: PlaceIndex): { bubbles: Bubble[]; missing: GeoRow[] } {
    const bubbles: Bubble[] = [];
    const missing: GeoRow[] = [];
    for (const r of rows) {
        const p = index.find(r.country, r.place);
        if (p) bubbles.push({ key: `${r.country}|${r.place}`, city: r.place, country: r.country, value: r.value, lat: p.lat, lng: p.lng });
        else missing.push(r);
    }
    return { bubbles, missing };
}

/** Bubble radius in px: area follows the value, with a floor so the smallest city is still visible. */
export function bubbleRadius(value: number, max: number, maxPx = 16, minPx = 3): number {
    if (!(max > 0) || !(value > 0)) return minPx;
    return minPx + (maxPx - minPx) * Math.sqrt(Math.min(1, value / max));
}

/**
 * Where the map should look: the world (null) unless every bubble sits in a small part of it, then a padded box
 * around them. Longitude/latitude degrees.
 */
export function bubbleView(bubbles: Array<Pick<Bubble, 'lat' | 'lng'>>): { west: number; south: number; east: number; north: number } | null {
    if (bubbles.length === 0) return null;
    let west = 180, east = -180, south = 90, north = -90;
    for (const b of bubbles) {
        west = Math.min(west, b.lng);
        east = Math.max(east, b.lng);
        south = Math.min(south, b.lat);
        north = Math.max(north, b.lat);
    }
    const w = east - west;
    const h = north - south;
    // Spread over more than half the world in either direction: show the world.
    if (w > 150 || h > 70) return null;
    const padX = Math.max(4, w * 0.18);
    const padY = Math.max(3, h * 0.25);
    return { west: Math.max(-180, west - padX), east: Math.min(180, east + padX), south: Math.max(-80, south - padY), north: Math.min(84, north + padY) };
}

// ── Region shapes (admin-1) ──────────────────────────────────────────────

/**
 * First-level regions (states, provinces) of one country, one small file per country under public/geo/admin1/
 * (Natural Earth admin-1, PUBLIC DOMAIN, simplified by scripts/geo/build-admin1.mjs; see
 * public/geo/admin1/LICENSE-natural-earth.txt). Loaded only for the country a region widget shows.
 */
export const ADMIN1_BASE = '/geo/admin1';
export const ADMIN1_CREDIT = 'Region shapes: Natural Earth (public domain)';

export function admin1Url(country: string): string | null {
    return /^[A-Z]{2}$/.test(country) ? `${ADMIN1_BASE}/${country}.json` : null;
}

/** One country's file as shipped. Rings are delta coded integers in 1/q degrees (see the build script). */
export interface Admin1File {
    v: number;
    country: string;
    q: number;
    units: Array<{ n: string; a?: string[]; p: number[][][] }>;
}

export interface RegionShape {
    name: string;
    aliases: string[];
    /** GeoJSON MultiPolygon coordinates, exterior rings clockwise (d3-geo winding). */
    coordinates: number[][][][];
}

const DROP_WORDS = new Set([
    'state', 'of', 'the', 'province', 'prefecture', 'oblast', 'krai', 'kray', 'region', 'county', 'district', 'governorate', 'voivodeship',
    'canton', 'kanton', 'department', 'departement', 'municipality', 'city', 'autonomous', 'metropolitan', 'division', 'emirate',
]);

/**
 * "State of São Paulo", "Sao Paulo", "SAO-PAULO" and "São Paulo Province" are one key. Google Analytics adds words
 * like "State of", "Prefecture", "Voivodeship" that Natural Earth leaves out; they are dropped on both sides. A name
 * made only of such words keeps them.
 */
export function regionKey(name: string): string {
    const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '');
    const words = base.split(/[^a-z0-9]+/).filter(Boolean);
    const kept = words.filter((w) => !DROP_WORDS.has(w));
    return (kept.length ? kept : words).join('');
}

/** Decodes a shipped file into shapes. Rings are closed here. */
export function decodeAdmin1(file: Admin1File | null | undefined): RegionShape[] {
    if (!file || !Array.isArray(file.units) || !(file.q > 0)) return [];
    const q = file.q;
    const ring = (flat: number[]): number[][] => {
        const out: number[][] = [];
        let x = 0, y = 0;
        for (let i = 0; i + 1 < flat.length; i += 2) {
            x += flat[i];
            y += flat[i + 1];
            out.push([x / q, y / q]);
        }
        return out;
    };
    // d3-geo reads a counter-clockwise exterior ring as "everything but this": enforce clockwise exteriors and counter-clockwise holes whatever the file says.
    const wound = (flat: number[], exterior: boolean): number[][] => {
        let r = ring(flat);
        let a = 0;
        for (let i = 0; i < r.length; i++) {
            const p = r[i], n = r[(i + 1) % r.length];
            a += p[0] * n[1] - n[0] * p[1];
        }
        if (a < 0 !== exterior) r = r.reverse();
        if (r.length) r.push(r[0]);
        return r;
    };
    return file.units.map((u) => ({ name: u.n, aliases: u.a ?? [], coordinates: u.p.map((poly) => poly.map((flat, i) => wound(flat, i === 0))) }));
}

/** Region rows matched to shapes. `values` is keyed by shape index. */
export interface RegionMatch {
    values: Map<number, number>;
    /** Rows whose name no shape claims (a region Google reports under a name we do not know). */
    unmatched: GeoRow[];
    /** Shape index per row place name (for hover and highlight). */
    shapeOf: Map<string, number>;
}

export function matchRegions(shapes: Array<Pick<RegionShape, 'name' | 'aliases'>>, rows: GeoRow[]): RegionMatch {
    // Names first, then aliases that no name has claimed ("Lombardy" for a unit Natural Earth calls Lombardia).
    const byKey = new Map<string, number>();
    shapes.forEach((s, i) => { const k = regionKey(s.name); if (k && !byKey.has(k)) byKey.set(k, i); });
    shapes.forEach((s, i) => { for (const a of s.aliases) { const k = regionKey(a); if (k && !byKey.has(k)) byKey.set(k, i); } });
    const values = new Map<number, number>();
    const shapeOf = new Map<string, number>();
    const unmatched: GeoRow[] = [];
    for (const r of rows) {
        const i = byKey.get(regionKey(r.place));
        if (i === undefined) { unmatched.push(r); continue; }
        values.set(i, (values.get(i) ?? 0) + r.value);
        shapeOf.set(r.place, i);
    }
    return { values, unmatched, shapeOf };
}

/** Rows to show in a region list: the first `fit` ones, or all of them when expanded. */
export function visibleRegions<T>(regions: T[], fit: number, expanded: boolean): { shown: T[]; rest: number } {
    if (expanded || regions.length <= fit) return { shown: regions, rest: 0 };
    return { shown: regions.slice(0, fit), rest: regions.length - fit };
}

// ── Colour scale (same as the country map) ───────────────────────────────

/** Quantile cut points of the country map: `steps - 1` thresholds over the positive values. */
export function scaleThresholds(values: Iterable<number>, steps: number): { thresholds: number[]; max: number } {
    const vals = [...values].filter((v) => v > 0).sort((a, b) => a - b);
    const thresholds: number[] = [];
    for (let i = 1; i < steps; i++) thresholds.push(vals.length ? vals[Math.min(vals.length - 1, Math.floor((i / steps) * vals.length))] : 0);
    return { thresholds, max: vals.length ? vals[vals.length - 1] : 0 };
}

/** Step 0..steps-1 of a value on that scale. */
export function scaleBin(v: number, thresholds: number[], steps: number): number {
    const bin = thresholds.findIndex((t) => v < t);
    return bin < 0 ? steps - 1 : bin;
}

/** The ramp colour of a step: the metric colour mixed into the surface, 18% to 100%. */
export function scaleColor(color: string, bin: number, steps: number): string {
    return `color-mix(in oklab, ${color} ${Math.round(18 + (bin / Math.max(1, steps - 1)) * 82)}%, var(--color-surface))`;
}

// ── City bubbles that overlap ────────────────────────────────────────────

export interface ScreenBubble { key: string; city: string; country: string; value: number; x: number; y: number }
export interface BubbleCluster extends ScreenBubble {
    /** Radius in px. */
    r: number;
    /** The other cities folded into this one, biggest first. */
    members: ScreenBubble[];
}

/**
 * Cities that would sit on top of each other (Paris, Brussels, Amsterdam on a Europe map) become one bubble at the
 * biggest city's position with the summed value; the tooltip names the others. A bubble is folded into a bigger one
 * when their centres are closer than `overlap` of the two radii. Radius caps at `maxPx`.
 */
export function declutterBubbles(items: ScreenBubble[], opts: { maxPx: number; minPx?: number; overlap?: number }): BubbleCluster[] {
    const minPx = opts.minPx ?? 3;
    const overlap = opts.overlap ?? 0.75;
    const max = items.reduce((m, b) => Math.max(m, b.value), 0);
    const radius = (v: number) => bubbleRadius(v, max, opts.maxPx, minPx);
    const sorted = [...items].sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
    const clusters: BubbleCluster[] = [];
    for (const b of sorted) {
        const r = radius(b.value);
        const host = clusters.find((c) => Math.hypot(c.x - b.x, c.y - b.y) < (c.r + r) * overlap);
        if (host) {
            host.members.push(b);
            host.value += b.value;
            host.r = radius(host.value);
        } else {
            clusters.push({ ...b, r, members: [] });
        }
    }
    return clusters;
}
