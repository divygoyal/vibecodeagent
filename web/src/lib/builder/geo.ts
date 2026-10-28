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
