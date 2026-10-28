/** Query-string parsing for /api/site/* (validated; the client sends resolved days). */
import { rollingWindow, type DataSource } from '@/lib/dateRange';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_DAYS = 560;

export interface Window {
    start: string;
    end: string;
}

export interface RangeParams {
    cur: Window;
    cmp: Window | null;
}

function parseIso(s: string): number {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

export function isoDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
    return isoDay(parseIso(iso) + n * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
    return Math.round((parseIso(b) - parseIso(a)) / DAY_MS) + 1;
}

function validWindow(start: string | null, end: string | null): Window | null {
    if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) return null;
    if (daysBetween(start, end) > MAX_DAYS) return null;
    return { start, end };
}

/** ?start=&end=[&cmpStart=&cmpEnd=]. Falls back to the source's last 28 complete days (lib/dateRange rollingWindow). */
export function parseRange(sp: URLSearchParams, source: DataSource = 'ga4'): RangeParams {
    const cur = validWindow(sp.get('start'), sp.get('end')) ?? (() => {
        const w = rollingWindow(28, source);
        return { start: w.start, end: w.end };
    })();
    const cmp = validWindow(sp.get('cmpStart'), sp.get('cmpEnd'));
    return { cur, cmp };
}

export function rangeKey(r: RangeParams): string {
    return `${r.cur.start}_${r.cur.end}_${r.cmp ? `${r.cmp.start}_${r.cmp.end}` : 'none'}`;
}

/** Valid GA4 property id ('properties/123' or '123'). */
export function parseProperty(v: string | null): string | null {
    if (!v) return null;
    const t = v.trim();
    return /^(properties\/)?\d{1,20}$/.test(t) ? (t.startsWith('properties/') ? t : `properties/${t}`) : null;
}

/** Valid Search Console site ('sc-domain:x.com' or an http(s) URL prefix). */
export function parseSiteUrl(v: string | null): string | null {
    if (!v) return null;
    const t = v.trim();
    if (t.length > 300) return null;
    if (/^sc-domain:[a-z0-9.-]+$/i.test(t)) return t;
    if (/^https?:\/\/[^\s/]+\/.*$/i.test(t)) return t;
    return null;
}
