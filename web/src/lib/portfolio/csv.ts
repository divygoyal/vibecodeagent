/**
 * Portfolio CSV export (one row per site, current vs previous period). Pure.
 */
import { pctChange } from './build';
import type { PortfolioResponse, PortfolioSite } from './types';

const HEADER = [
    'Site', 'Search Console property', 'Property type', 'GA4 property', 'GA4 name', 'Starred', 'Hidden', 'Status',
    'Clicks', 'Clicks (previous)', 'Clicks change %',
    'Impressions', 'Impressions (previous)', 'Impressions change %',
    'CTR %', 'Avg. position', 'Avg. position (previous)',
    'Users', 'Users (previous)', 'Users change %',
    'Sessions', 'Sessions (previous)', 'Sessions change %',
    'Pageviews', 'Key events', 'Engagement rate %',
    'Search period', 'Traffic period', 'Last synced (UTC)', 'Alerts',
];

function cell(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
    // Quote, and defuse spreadsheet formulas.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const pct = (cur: number | undefined, prev: number | null | undefined) => {
    if (cur === undefined) return null;
    const c = pctChange(cur, prev);
    return c === null ? null : Math.round(c * 10) / 10;
};

function row(s: PortfolioSite, res: PortfolioResponse): (string | number | null | undefined)[] {
    const sc = s.search;
    const tr = s.traffic;
    const w = res.windows;
    return [
        s.label, s.gsc?.siteUrl, s.gsc ? (s.gsc.propertyType === 'domain' ? 'Domain' : 'URL prefix') : null,
        s.ga4?.propertyId, s.ga4?.displayName, s.starred ? 'yes' : 'no', s.hidden ? 'yes' : 'no', s.status,
        sc?.cur.clicks, sc?.prev?.clicks, pct(sc?.cur.clicks, sc?.prev?.clicks),
        sc?.cur.impressions, sc?.prev?.impressions, pct(sc?.cur.impressions, sc?.prev?.impressions),
        sc?.cur.ctr != null ? sc.cur.ctr * 100 : null, sc?.cur.position, sc?.prev?.position,
        tr?.cur.users, tr?.prev?.users, pct(tr?.cur.users, tr?.prev?.users),
        tr?.cur.sessions, tr?.prev?.sessions, pct(tr?.cur.sessions, tr?.prev?.sessions),
        tr?.cur.pageviews, tr?.cur.keyEvents, tr?.cur.engagementRate != null ? tr.cur.engagementRate * 100 : null,
        sc && w.search ? `${w.search.curStart} to ${w.search.curEnd}` : null,
        tr && w.traffic ? `${w.traffic.curStart} to ${w.traffic.curEnd}` : null,
        s.lastSyncedAt ? new Date(s.lastSyncedAt * 1000).toISOString().replace('T', ' ').slice(0, 16) : null,
        s.alerts.map((a) => a.message).join('; ') || null,
    ];
}

export function portfolioCsv(res: PortfolioResponse, opts: { includeHidden?: boolean } = {}): string {
    const sites = res.sites.filter((s) => opts.includeHidden || !s.hidden);
    const lines = [HEADER.map(cell).join(','), ...sites.map((s) => row(s, res).map(cell).join(','))];
    return `﻿${lines.join('\r\n')}\r\n`;
}

export function portfolioCsvFilename(res: PortfolioResponse): string {
    return `trafficclaw-portfolio-${res.range}-${new Date(res.generatedAt).toISOString().slice(0, 10)}.csv`;
}
