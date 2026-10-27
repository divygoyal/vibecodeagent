/**
 * Daily traffic series for each demo site. One number per day: expected
 * daily users (GA4) or clicks (Search Console-only sites). Every other metric
 * is derived from this series in ga4.ts / gsc.ts.
 */

import type { DemoKind, DemoSite } from './catalog';
import { DEMO_HISTORY_DAYS, dayOfWeek, dayOfYear, dayToDate } from './dates';
import { hashString, mulberry32, noise, unit } from './rng';

/** Today's figure only covers part of the day. Fixed so screenshots stay stable. */
export const TODAY_PARTIAL_FACTOR = 0.55;

const WEEKEND_FACTOR: Record<DemoKind, number> = {
    saas: 0.55,
    blog: 0.9,
    games: 1.25,
    shop: 1.1,
    docs: 0.4,
    recipes: 1.3,
    agency: 0.5,
};

/** Per-site rates that turn users into the other GA4 metrics. */
export interface SiteRates {
    sessionsPerUser: number;
    pagesPerSession: number;
    engagementRate: number;
    avgSessionSeconds: number;
    newUserShare: number;
    /** Key events per session. */
    keyEventRate: number;
    /** Purchases per session (shops only). */
    purchaseRate: number;
    eventsPerPageview: number;
    /** Day-1 retention for cohort reports. */
    day1Retention: number;
}

const KIND_RATES: Record<DemoKind, SiteRates> = {
    saas: { sessionsPerUser: 1.32, pagesPerSession: 2.6, engagementRate: 0.61, avgSessionSeconds: 168, newUserShare: 0.71, keyEventRate: 0.031, purchaseRate: 0, eventsPerPageview: 3.4, day1Retention: 0.16 },
    blog: { sessionsPerUser: 1.12, pagesPerSession: 1.45, engagementRate: 0.52, avgSessionSeconds: 94, newUserShare: 0.86, keyEventRate: 0.008, purchaseRate: 0, eventsPerPageview: 3.1, day1Retention: 0.05 },
    games: { sessionsPerUser: 1.55, pagesPerSession: 3.4, engagementRate: 0.74, avgSessionSeconds: 412, newUserShare: 0.58, keyEventRate: 0.012, purchaseRate: 0, eventsPerPageview: 5.2, day1Retention: 0.27 },
    shop: { sessionsPerUser: 1.28, pagesPerSession: 4.1, engagementRate: 0.63, avgSessionSeconds: 201, newUserShare: 0.74, keyEventRate: 0.022, purchaseRate: 0.018, eventsPerPageview: 4.0, day1Retention: 0.09 },
    docs: { sessionsPerUser: 1.4, pagesPerSession: 3.1, engagementRate: 0.69, avgSessionSeconds: 236, newUserShare: 0.55, keyEventRate: 0.004, purchaseRate: 0, eventsPerPageview: 3.2, day1Retention: 0.22 },
    recipes: { sessionsPerUser: 1.08, pagesPerSession: 1.6, engagementRate: 0.57, avgSessionSeconds: 132, newUserShare: 0.82, keyEventRate: 0.006, purchaseRate: 0, eventsPerPageview: 3.0, day1Retention: 0.06 },
    agency: { sessionsPerUser: 1.18, pagesPerSession: 2.9, engagementRate: 0.58, avgSessionSeconds: 121, newUserShare: 0.83, keyEventRate: 0.019, purchaseRate: 0, eventsPerPageview: 3.3, day1Retention: 0.07 },
};

export function siteRates(site: DemoSite): SiteRates {
    return KIND_RATES[site.kind];
}

/** Viral spikes for the 'spiky' shape: [daysAgo, amplitude]. Two are fixed so they always show. */
function spikeList(site: DemoSite): Array<[number, number]> {
    const spikes: Array<[number, number]> = [[9, 11], [96, 17], [212, 7]];
    const r = mulberry32(hashString(`${site.key}|spikes`));
    for (let i = 0; i < 6; i++) {
        spikes.push([20 + Math.floor(r() * (DEMO_HISTORY_DAYS - 30)), 2 + r() * 6]);
    }
    return spikes;
}

/** Holiday multiplier for retail-like sites (Black Friday, December, January dip). */
function holidayFactor(day: number, kind: DemoKind): number {
    const d = dayToDate(day);
    const month = d.getUTCMonth();
    const date = d.getUTCDate();
    if (kind === 'recipes') {
        if (month === 10 && date >= 18 && date <= 27) return 2.1; // Thanksgiving
        if (month === 11 && date >= 15 && date <= 25) return 1.8; // Christmas
        if (month === 0) return 1.15; // New year healthy eating
        return 1;
    }
    if (month === 10 && date >= 24 && date <= 30) return 3.2; // Black Friday week
    if (month === 11 && date <= 20) return 2.0;
    if (month === 11) return 1.3;
    if (month === 0) return 0.75;
    return 1;
}

/** Shape multiplier relative to "today" (1.0 = usersToday). */
function shapeFactor(site: DemoSite, daysAgo: number, day: number): number {
    const t = daysAgo / DEMO_HISTORY_DAYS; // 0 today → 1 at the start of the window
    switch (site.shape) {
        case 'growing':
            return Math.exp(-Math.log(12) * t) * (1 + 0.05 * Math.sin(daysAgo / 23));
        case 'declining': {
            const base = 1 + 0.9 * t;
            return daysAgo > 152 ? base * 1.42 : base;
        }
        case 'steady':
            return (0.9 + 0.1 * (1 - t)) * (1 + 0.06 * Math.sin(daysAgo / 31));
        case 'large': {
            const doy = dayOfYear(day);
            const summerDip = doy > 180 && doy < 240 ? 0.9 : 1;
            const decDip = dayToDate(day).getUTCMonth() === 11 && dayToDate(day).getUTCDate() > 20 ? 0.72 : 1;
            return (0.82 + 0.18 * (1 - t)) * summerDip * decDip;
        }
        case 'spiky': {
            let f = 0.9 + 0.1 * (1 - t);
            for (const [at, amp] of spikeList(site)) {
                const since = at - daysAgo; // days since spike start
                if (since >= 0 && since < 8) f += amp * Math.exp(-since / 1.3);
            }
            return f;
        }
        case 'new': {
            const launched = site.launchedDaysAgo ?? 44;
            if (daysAgo > launched) return 0;
            const p = 1 - daysAgo / launched;
            return 0.04 + 0.96 * Math.pow(p, 1.6);
        }
        case 'nearZero':
            return 1 + 0.4 * Math.sin(daysAgo / 17);
        case 'seasonal':
            return (0.85 + 0.15 * (1 - t)) * holidayFactor(day, site.kind);
        default:
            return 1;
    }
}

const seriesCache = new Map<string, Float64Array>();

/**
 * Expected users (or clicks) per day for a site.
 * Index 0 = first day of the window, last index = today.
 * Returns the array and the day index of element 0.
 */
export function dailySeries(site: DemoSite, today: number): { start: number; values: Float64Array } {
    const start = today - DEMO_HISTORY_DAYS + 1;
    const cacheKey = `${site.key}|${today}`;
    let values = seriesCache.get(cacheKey);
    if (!values) {
        if (seriesCache.size > 200) seriesCache.clear();
        values = new Float64Array(DEMO_HISTORY_DAYS);
        const weekend = WEEKEND_FACTOR[site.kind];
        const launched = site.launchedDaysAgo;
        for (let i = 0; i < DEMO_HISTORY_DAYS; i++) {
            const day = start + i;
            const daysAgo = today - day;
            if (launched !== undefined && daysAgo > launched) {
                values[i] = 0;
                continue;
            }
            const dow = dayOfWeek(day);
            const weekly = dow === 0 || dow === 6 ? weekend : 1 + (1 - weekend) * 0.12;
            let v = site.usersToday * shapeFactor(site, daysAgo, day) * weekly * noise(0.16, site.key, 'day', day);
            if (site.shape === 'nearZero') {
                // Sparse: some days have nothing at all.
                v = unit(site.key, 'zero', day) < 0.3 ? 0 : v * (0.4 + 1.2 * unit(site.key, 'nz', day));
            }
            if (daysAgo === 0) v *= TODAY_PARTIAL_FACTOR;
            values[i] = Math.max(0, v);
        }
        seriesCache.set(cacheKey, values);
    }
    return { start, values };
}

/** Value of the daily series for one day (0 outside the window). */
export function seriesValue(site: DemoSite, day: number, today: number): number {
    const { start, values } = dailySeries(site, today);
    const i = day - start;
    return i >= 0 && i < values.length ? values[i] : 0;
}

/** Share of a day's traffic in each hour (UTC-ish local profile). Sums to 1. */
export function hourProfile(site: DemoSite): number[] {
    const peak = site.kind === 'games' ? 20 : site.kind === 'recipes' ? 17 : 14;
    const raw: number[] = [];
    for (let h = 0; h < 24; h++) {
        const dist = Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak));
        raw.push(0.25 + Math.exp(-(dist * dist) / 18));
    }
    const sum = raw.reduce((s, v) => s + v, 0);
    return raw.map(v => v / sum);
}
