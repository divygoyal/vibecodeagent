/** Query helpers shared by the MCP tools. */
import { fmtPeriod, type Period } from '../dates';
import { ToolError } from '../errors';
import { gaRows, type GaReport, type GoogleClient, type GscRow } from '../google';

export interface GscTotals { clicks: number; impressions: number; ctr: number; position: number }

export const EMPTY_GSC: GscTotals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

export function gscBody(p: Period, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { startDate: p.start, endDate: p.end, type: 'web', dataState: 'final', ...extra };
}

export async function gscTotals(g: GoogleClient, siteUrl: string, p: Period, extra: Record<string, unknown> = {}): Promise<GscTotals> {
    const res = await g.gscQuery(siteUrl, gscBody(p, extra));
    const row = res.rows?.[0];
    if (!row) return { ...EMPTY_GSC };
    return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

export async function gscRows(g: GoogleClient, siteUrl: string, p: Period, dimensions: string[], extra: Record<string, unknown> = {}): Promise<GscRow[]> {
    const res = await g.gscQuery(siteUrl, gscBody(p, { dimensions, rowLimit: 1000, ...extra }));
    return res.rows || [];
}

/** Aggregate rows (e.g. several pages) into totals with impression-weighted position. */
export function sumGsc(rows: GscRow[]): GscTotals {
    let clicks = 0;
    let impressions = 0;
    let posWeighted = 0;
    for (const r of rows) {
        clicks += r.clicks;
        impressions += r.impressions;
        posWeighted += r.position * r.impressions;
    }
    return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? posWeighted / impressions : 0 };
}

export function gaRange(p: Period, name?: string) {
    return { startDate: p.start, endDate: p.end, ...(name ? { name } : {}) };
}

/**
 * One GA4 report over the current (and optional previous) period without
 * dimensions. Returns metric arrays per period (zeros when GA4 has no rows).
 */
export async function ga4Totals(g: GoogleClient, property: string, cur: Period, prev: Period | null, metrics: string[], extra: Record<string, unknown> = {}): Promise<{ cur: number[]; prev: number[] | null; report: GaReport }> {
    const dateRanges = prev ? [gaRange(cur, 'cur'), gaRange(prev, 'prev')] : [gaRange(cur, 'cur')];
    const report = await g.ga4Report(property, { dateRanges, metrics: metrics.map((name) => ({ name })), ...extra });
    const zeros = metrics.map(() => 0);
    const rows = gaRows(report);
    if (!prev) return { cur: rows[0]?.mets ?? zeros, prev: null, report };
    const find = (name: string) => rows.find((r) => r.dims[r.dims.length - 1] === name)?.mets ?? zeros;
    return { cur: find('cur'), prev: find('prev'), report };
}

/** Run tasks with a concurrency limit; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    }));
    return out;
}

export function periodLabel(source: string, p: Period, prev?: Period | null): string {
    return `${source} ${fmtPeriod(p)}${prev ? ` vs ${fmtPeriod(prev)}` : ''}`;
}

export function ensureQueriesAllowed(excluded: boolean, what: string): void {
    if (excluded) {
        throw new ToolError('queries_excluded', `${what} needs search queries, which the user chose not to share with this connection`, 'Use page-level tools instead (dimension page), or ask the user to allow queries in TrafficClaw > Connect AI.');
    }
}

/** Escape a string for an RE2 regex literal. */
export function re2Escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** URL Inspection budget per user: 100/day and 20/hour (MCP.md 7.10). */
const inspections = new Map<string, number[]>();
export function takeInspectionQuota(userKey: string, n: number): { ok: boolean; retryAfterS: number } {
    const now = Date.now();
    const list = (inspections.get(userKey) ?? []).filter((t) => t > now - 86400_000);
    const lastHour = list.filter((t) => t > now - 3600_000);
    if (list.length + n > 100) return { ok: false, retryAfterS: Math.ceil((list[0] + 86400_000 - now) / 1000) };
    if (lastHour.length + n > 20) return { ok: false, retryAfterS: Math.ceil((lastHour[0] + 3600_000 - now) / 1000) };
    for (let i = 0; i < n; i++) list.push(now);
    inspections.set(userKey, list);
    return { ok: true, retryAfterS: 0 };
}

/** GA4 'YYYYMMDD' to 'YYYY-MM-DD'. */
export function gaDate(v: string): string {
    return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
}

export function userKeyOf(p: { userId: number; grantId: number | null; tokenId: number }): string {
    return p.userId > 0 ? `u${p.userId}` : `g${p.grantId ?? p.tokenId}`;
}
