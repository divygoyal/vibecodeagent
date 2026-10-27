/**
 * The snapshot store's data shapes (admin /api/portfolio/*) and a pure
 * TypeScript twin of the admin snapshot aggregation, used by the public demo
 * so both paths feed the same builder. Client-safe.
 */
import type { AssetKind, AssetStatus } from './types';
import { addDays, daysBetween, type WindowRequest } from './ranges';

/** One row of portfolio_assets as the admin returns it. */
export interface StoreAsset {
    asset_kind: AssetKind;
    asset_id: string;
    display_name: string | null;
    host: string | null;
    account_name: string | null;
    permission_level: string | null;
    paired_with: string | null;
    /** GA4 rows: null = automatic, "__none__" = force unpaired, else a GSC site URL. */
    pairing_override: string | null;
    starred: boolean;
    hidden: boolean;
    missing: boolean;
    status: AssetStatus;
    last_error: string | null;
    last_synced_at: number | null;
    sync_started_at: number | null;
    /** First day covered by stored data (backfill start). */
    data_start: string | null;
    /** Last day covered by the newest fetch. */
    data_end: string | null;
    backfill_done: boolean;
}

export const NO_PAIR = '__none__';

/**
 * The user's manual GA4 -> Search Console pairings, as stored on the GA4 rows
 * of portfolio_assets (the one pairing store; the MCP tools read it too).
 * GA4 property -> GSC site URL, or null for "never pair this property".
 */
export function pairingOverridesFrom(assets: Pick<StoreAsset, 'asset_kind' | 'asset_id' | 'pairing_override'>[]): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const a of assets) {
        if (a.asset_kind !== 'ga4' || a.pairing_override === null) continue;
        out[a.asset_id] = a.pairing_override === NO_PAIR ? null : a.pairing_override;
    }
    return out;
}

/** One day of one asset (site_daily_metrics). */
export interface DailyRow {
    kind: AssetKind;
    asset_id: string;
    date: string;
    users?: number | null;
    sessions?: number | null;
    pageviews?: number | null;
    key_events?: number | null;
    engagement_rate?: number | null;
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
}

export interface StoreWindow {
    cur_start: string;
    cur_end: string;
    prev_start: string;
    prev_end: string;
}

export interface TotalsRow {
    kind: AssetKind;
    asset_id: string;
    w: 'cur' | 'prev';
    days: number;
    users: number | null;
    sessions: number | null;
    pageviews: number | null;
    key_events: number | null;
    engaged_weighted: number | null;
    clicks: number | null;
    impressions: number | null;
    position_weighted: number | null;
}

/** Exact GA4 users of one range key (portfolio_range_totals). */
export interface RangeTotalRow {
    asset_kind: AssetKind;
    asset_id: string;
    range_key: string;
    cur_start: string;
    cur_end: string;
    prev_start: string;
    prev_end: string;
    active_users_cur: number | null;
    active_users_prev: number | null;
    total_users_cur: number | null;
    total_users_prev: number | null;
    fetched_at: number;
}

export interface SnapshotData {
    assets: StoreAsset[];
    windows: Partial<Record<AssetKind, StoreWindow>>;
    totals: TotalsRow[];
    /**
     * Bucketed sums per asset, oldest bucket first (bucket_days long, counted back
     * from the window end, so only the oldest bucket can be partial). GA4:
     * users, sessions. GSC: clicks, impressions, position_weighted (position x impressions).
     */
    series: Partial<Record<AssetKind, {
        n: number;
        span_days: number;
        by_asset: Record<string, Record<string, number[]>>;
        prev_by_asset: Record<string, Record<string, number[]>>;
    }>>;
    /** Newest `recent_days` daily values (users for GA4, clicks for GSC), oldest first; missing days absent. */
    recent: Partial<Record<AssetKind, Record<string, [string, number][]>>>;
    bucket_days: number;
    /** Present when the request named a range_key. */
    range_totals?: RangeTotalRow[];
}

export interface SnapshotRequest {
    windows: Partial<Record<AssetKind, WindowRequest>>;
    bucket_days: number;
    recent_days: number;
    range_key?: string;
}

function resolveWindow(req: WindowRequest, newest: string | null): StoreWindow | null {
    let end = req.end ?? newest ?? req.end_max ?? null;
    if (!req.end && end) {
        if (req.end_max && end > req.end_max) end = req.end_max;
        if (req.end_min && end < req.end_min) end = req.end_min;
    }
    if (!end) return null;
    const cs = addDays(end, -(req.days - 1));
    const pe = addDays(cs, -1);
    return { cur_start: cs, cur_end: end, prev_start: addDays(pe, -(req.days - 1)), prev_end: pe };
}

/** Same result as POST /api/portfolio/users/{id}/snapshot, computed from in-memory rows. */
export function aggregateSnapshot(assets: StoreAsset[], rows: DailyRow[], req: SnapshotRequest): SnapshotData {
    const b = Math.max(1, Math.min(31, Math.floor(req.bucket_days)));
    const recentDays = Math.max(1, Math.min(31, Math.floor(req.recent_days)));
    const out: SnapshotData = { assets, windows: {}, totals: [], series: {}, recent: {}, bucket_days: b };

    for (const kind of Object.keys(req.windows) as AssetKind[]) {
        const wr = req.windows[kind];
        if (!wr) continue;
        const kindRows = rows.filter((r) => r.kind === kind);
        const newest = kindRows.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
        const w = resolveWindow(wr, newest);
        if (!w) continue;
        out.windows[kind] = w;

        const totals = new Map<string, TotalsRow>();
        const nBuckets = Math.max(1, Math.ceil(wr.days / b));
        const metrics = kind === 'ga4' ? ['users', 'sessions'] : ['clicks', 'impressions', 'position_weighted'];
        const byAsset: Record<string, Record<string, number[]>> = {};
        const prevByAsset: Record<string, Record<string, number[]>> = {};
        const bucketAdd = (target: Record<string, Record<string, number[]>>, r: DailyRow, end: string) => {
            const idx = nBuckets - 1 - Math.floor(daysBetween(r.date, end) / b);
            if (idx < 0 || idx >= nBuckets) return;
            const s = target[r.asset_id] ?? (target[r.asset_id] = Object.fromEntries(metrics.map((m) => [m, new Array<number>(nBuckets).fill(0)])));
            for (const m of metrics) {
                const v = m === 'position_weighted' ? (r.position ?? 0) * (r.impressions ?? 0) : (r[m as keyof DailyRow] as number | null | undefined) ?? 0;
                s[m][idx] += v;
            }
        };
        const recent: Record<string, [string, number][]> = {};
        const recentStart = addDays(w.cur_end, -(recentDays - 1));

        for (const r of kindRows) {
            const inCur = r.date >= w.cur_start && r.date <= w.cur_end;
            const inPrev = r.date >= w.prev_start && r.date <= w.prev_end;
            if (!inCur && !inPrev) continue;
            const win: 'cur' | 'prev' = inCur ? 'cur' : 'prev';
            const key = `${r.asset_id}\u0000${win}`;
            let t = totals.get(key);
            if (!t) {
                t = {
                    kind, asset_id: r.asset_id, w: win, days: 0, users: null, sessions: null, pageviews: null,
                    key_events: null, engaged_weighted: null, clicks: null, impressions: null, position_weighted: null,
                };
                totals.set(key, t);
            }
            t.days += 1;
            const add = (k: keyof TotalsRow, v: number | null | undefined) => {
                if (v === null || v === undefined) return;
                (t as unknown as Record<string, number | null>)[k] = ((t as unknown as Record<string, number | null>)[k] ?? 0) + v;
            };
            add('users', r.users);
            add('sessions', r.sessions);
            add('pageviews', r.pageviews);
            add('key_events', r.key_events);
            if (r.engagement_rate != null && r.sessions != null) add('engaged_weighted', r.engagement_rate * r.sessions);
            add('clicks', r.clicks);
            add('impressions', r.impressions);
            if (r.position != null && r.impressions != null) add('position_weighted', r.position * r.impressions);

            if (inPrev) bucketAdd(prevByAsset, r, w.prev_end);
            if (inCur) {
                bucketAdd(byAsset, r, w.cur_end);
                if (r.date >= recentStart) {
                    (recent[r.asset_id] ?? (recent[r.asset_id] = [])).push([r.date, (kind === 'ga4' ? r.users : r.clicks) ?? 0]);
                }
            }
        }
        for (const list of Object.values(recent)) list.sort((x, y) => (x[0] < y[0] ? -1 : 1));
        out.totals.push(...totals.values());
        out.series[kind] = { n: nBuckets, span_days: wr.days, by_asset: byAsset, prev_by_asset: prevByAsset };
        out.recent[kind] = recent;
    }
    return out;
}
