/**
 * Shared globe utilities — used by both the dashboard globe page and the public embed page.
 * Converts GA4 realtime data (byCity, byCountry, byPage) into GlobeVisitor[] and activity feed items.
 */

import { COUNTRY_COORDS, CITY_COORDS } from '@/components/analytics/RealtimeGlobe';
import type { GlobeVisitor as MaplibreGlobeVisitor } from '@/components/globe/RealtimeGlobeMaplibre';

export { COUNTRY_COORDS, CITY_COORDS };

// Extended GlobeVisitor with optional `users` field for compatibility with both
// RealtimeMapbox (requires `users`) and RealtimeGlobeMaplibre (doesn't need it)
export interface GlobeVisitor extends MaplibreGlobeVisitor {
    users?: number;
}

// ─── Constants ───

export const ADJECTIVES = [
    'amaranth', 'bronze', 'blue', 'orange', 'crimson', 'golden', 'silver', 'jade', 'coral', 'violet',
    'scarlet', 'ivory', 'copper', 'magenta', 'teal', 'indigo', 'amber', 'cobalt', 'sage', 'ruby',
    'gold', 'iron', 'pearl', 'onyx', 'topaz', 'opal', 'slate', 'rose', 'ash', 'moss',
];

export const ANIMALS = [
    'finch', 'ptarmigan', 'salmon', 'aardvark', 'falcon', 'panda', 'fox', 'owl', 'bear', 'wolf',
    'hawk', 'lynx', 'deer', 'seal', 'crow', 'hare', 'orca', 'viper', 'tiger', 'koala',
    'xerinae', 'condor', 'marten', 'egret', 'ibis', 'robin', 'wren', 'crane', 'swift', 'lark',
];

export const AVATAR_COLORS = [
    '#e11d48', '#7c3aed', '#0891b2', '#059669', '#d97706', '#4f46e5', '#65a30d', '#db2777',
    '#0d9488', '#dc2626', '#9333ea', '#2563eb', '#16a34a', '#ca8a04', '#c026d3', '#0284c7',
];

// ─── Helper functions ───

export function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

export function predictWarmth(country: string, device: string, pageIdx: number): number {
    const hotCountries = ['United States', 'United Kingdom', 'Germany', 'Canada', 'Australia', 'France', 'Japan', 'Netherlands', 'Switzerland', 'Sweden'];
    const warmCountries = ['India', 'Brazil', 'South Korea', 'Singapore', 'Israel', 'United Arab Emirates'];
    let score = 0.2;
    if (hotCountries.includes(country)) score += 0.35;
    else if (warmCountries.includes(country)) score += 0.2;
    if (device === 'desktop') score += 0.15;
    if (pageIdx > 2) score += 0.1;
    score += (hashStr(country + device) % 20) / 100;
    return Math.min(1, Math.max(0, score));
}

export function getWarmthDot(warmth: number): string {
    if (warmth > 0.6) return 'bg-red-500';
    if (warmth > 0.4) return 'bg-orange-400';
    if (warmth > 0.25) return 'bg-yellow-400';
    return 'bg-blue-400';
}

export function makeName(seed: string): string {
    const h = hashStr(seed);
    return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >> 4) % ANIMALS.length]}`;
}

// ─── Activity feed item type ───

export interface ActivityFeedItem {
    id: string;
    name: string;
    country: string;
    page: string;
    event: 'visited' | 'exited to';
    exitUrl?: string;
    timestamp: number;
    warmth: number;
    estValue: string;
    confidence: number;
}

// ─── Convert GA4 byCity data → GlobeVisitor[] ───

export function convertCitiesToGlobeVisitors(
    byCity: { city: string; country: string; users?: number }[],
    byCountry: { country: string; users: number }[],
): GlobeVisitor[] {
    const visitors: GlobeVisitor[] = [];
    const usedKeys = new Set<string>();

    const isCityInCountry = (cityCoord: [number, number], countryCoord: [number, number]) => {
        const dLat = Math.abs(cityCoord[0] - countryCoord[0]);
        const dLng = Math.abs(cityCoord[1] - countryCoord[1]);
        return dLat < 20 && dLng < 30;
    };

    const sortedCities = [...byCity].sort((a, b) => {
        const ka = `${a.country}-${a.city}`;
        const kb = `${b.country}-${b.city}`;
        return ka.localeCompare(kb);
    });

    sortedCities.slice(0, 40).forEach((c) => {
        if (visitors.length >= 30) return;
        const cityStr = String(c.city ?? '');
        const countryStr = String(c.country ?? '');
        const countryCoord = COUNTRY_COORDS[countryStr];
        if (!countryCoord) return;

        let coord = countryCoord;
        if (cityStr && !cityStr.startsWith('(')) {
            const cityCoord = CITY_COORDS[cityStr];
            if (cityCoord && isCityInCountry(cityCoord, countryCoord)) {
                coord = cityCoord;
            }
        }

        const key = `${coord[0].toFixed(1)},${coord[1].toFixed(1)}`;
        const cityHash = hashStr(`${cityStr}-${countryStr}`);
        let lat = coord[0];
        let lng = coord[1];
        if (usedKeys.has(key)) {
            const angle = (cityHash % 360) * (Math.PI / 180);
            const radius = 1.2 + (cityHash % 5) * 0.6;
            lat += Math.cos(angle) * radius;
            lng += Math.sin(angle) * radius;
        }
        usedKeys.add(key);

        const seed = `${cityStr}-${countryStr}`;
        const name = makeName(seed);
        const hash = hashStr(seed);
        const warmth = predictWarmth(countryStr, 'desktop', 0);

        visitors.push({
            id: seed, lat, lng, name, country: countryStr,
            avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
            avatarInitial: name.charAt(0).toUpperCase(),
            warmth,
            users: Number(c.users) || 1,
        });
    });

    // Backfill from country data if fewer than 8 city-based visitors
    if (visitors.length < 15) {
        const sortedCountries = [...byCountry].sort((a, b) =>
            String(a.country ?? '').localeCompare(String(b.country ?? ''))
        );
        sortedCountries.forEach((c) => {
            if (visitors.length >= 30) return;
            const countryStr = String(c.country ?? '');
            const coord = COUNTRY_COORDS[countryStr];
            if (!coord) return;
            if (visitors.some(v => v.country === countryStr)) return;

            const seed = `${countryStr}-country`;
            const name = makeName(seed);
            const hash = hashStr(seed);
            const warmth = predictWarmth(countryStr, 'desktop', 0);

            visitors.push({
                id: seed, lat: coord[0], lng: coord[1], name, country: countryStr,
                avatarColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
                avatarInitial: name.charAt(0).toUpperCase(),
                warmth,
                users: Number(c.users) || 1,
            });
        });
    }

    return visitors;
}

// ─── Convert GA4 data → activity feed items ───

export function convertToActivityFeed(
    byCity: { city: string; country: string; users?: number }[],
    byPage: { page: string; users?: number }[],
    byDevice: { device: string; users?: number }[],
): ActivityFeedItem[] {
    const feedCounts = new Map<string, number>();
    return byCity.slice(0, 20).map((c, i) => {
        const cityStr = String(c.city ?? 'Unknown');
        const countryStr = String(c.country ?? 'Unknown');
        const feedKey = `${cityStr}-${countryStr}`;
        const count = feedCounts.get(feedKey) || 0;
        feedCounts.set(feedKey, count + 1);
        const hash = hashStr(`${feedKey}-${count}`);
        const name = `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash >> 4) % ANIMALS.length]}`;
        const page = String(byPage[i % Math.max(byPage.length, 1)]?.page ?? '/');
        const device = String(byDevice[i % Math.max(byDevice.length, 1)]?.device ?? 'desktop');
        const isExit = i % 8 === 0;
        const warmth = predictWarmth(countryStr, device, i);
        const confidence = Math.round(50 + warmth * 40 + (hash % 10));
        const estVal = (warmth * 3.5 + (hash % 100) / 100).toFixed(2);

        return {
            id: `${cityStr}-${i}`,
            name,
            country: countryStr,
            page: isExit ? '' : page,
            event: isExit ? 'exited to' as const : 'visited' as const,
            exitUrl: isExit ? 'apps.apple.com/app/...' : undefined,
            timestamp: Date.now() - i * 12000,
            warmth,
            estValue: `$${estVal}`,
            confidence,
        };
    });
}
