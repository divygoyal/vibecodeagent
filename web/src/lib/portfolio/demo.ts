/**
 * Public demo portfolio: the full portfolio response built from the demo data
 * generator. Pure (no network, no admin, no session), deterministic per day,
 * so the marketing /demo page can render it without sign-in:
 *
 *   import { buildDemoPortfolio } from '@/lib/portfolio/demo';
 *   const data = buildDemoPortfolio({ range: '3m' });   // PortfolioResponse
 *
 * It runs the same requests, parsers, aggregation and builder as the real
 * portfolio, just against src/lib/demo instead of Google and the admin store.
 */
import { DEMO_DEFAULT_ACCOUNT, getDemoAccount } from '@/lib/demo/catalog';
import { DEMO_HISTORY_DAYS } from '@/lib/demo/dates';
import { demoAccountSummaries, demoDataStreams } from '@/lib/demo/gaAdmin';
import { demoRunReport } from '@/lib/demo/ga4';
import { demoListSites, demoSearchAnalytics } from '@/lib/demo/gsc';
import { normalizeHost, pairSites, type Ga4PropertyInput, type GscSiteInput } from '@/lib/sites/pairing';
import { buildPortfolio, RECENT_DAYS } from './build';
import { addDays, bucketDaysFor, RANGE_DAYS, syncEndDay, todayIso, windowRequests } from './ranges';
import { ga4DailyRequest, ga4RangeUsersRequest, gscDailyRequest, parseGa4Daily, parseGa4RangeUsers, parseGscDaily } from './rows';
import { aggregateSnapshot, type DailyRow, type RangeTotalRow, type StoreAsset } from './snapshot';
import type { PortfolioRange, PortfolioResponse } from './types';

export interface DemoPortfolioOptions {
    range?: PortfolioRange;
    now?: number;
    /** Demo Google account key (default: the main demo account). */
    account?: string;
    /** Hosts to star, like the owner's reference. */
    starred?: string[];
}

const DEFAULT_STARRED = ['acmeanalytics.example', 'healthinsights.example'];

interface DemoInventory {
    properties: (Ga4PropertyInput & { accountName?: string })[];
    sites: GscSiteInput[];
}

function demoInventory(accountKey: string): DemoInventory {
    const account = getDemoAccount(accountKey);
    const summaries = demoAccountSummaries(account) as {
        accountSummaries: { displayName: string; propertySummaries: { property: string; displayName: string }[] }[];
    };
    const properties = summaries.accountSummaries.flatMap((acc) =>
        acc.propertySummaries.map((p) => {
            const streams = demoDataStreams(p.property) as { dataStreams: { type: string; webStreamData?: { defaultUri?: string } }[] };
            return {
                property: p.property,
                displayName: p.displayName,
                accountName: acc.displayName,
                streamUris: streams.dataStreams
                    .filter((s) => s.type === 'WEB_DATA_STREAM')
                    .map((s) => s.webStreamData?.defaultUri)
                    .filter((u): u is string => Boolean(u)),
            };
        }),
    );
    const sites = (demoListSites(account) as { siteEntry: GscSiteInput[] }).siteEntry;
    return { properties, sites };
}

const memo = new Map<string, { value: PortfolioResponse; until: number }>();
const MEMO_MS = 10 * 60_000;

export function buildDemoPortfolio(opts: DemoPortfolioOptions = {}): PortfolioResponse {
    const range = opts.range ?? '3m';
    const now = opts.now ?? Date.now();
    // Same inputs on the same day give the same data; memoise for 10 minutes (the generator takes ~0.5 s).
    const key = JSON.stringify([range, todayIso(now), opts.account ?? '', opts.starred ?? null, opts.now === undefined]);
    const hit = memo.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = computeDemoPortfolio(range, now, opts);
    if (memo.size > 50) memo.clear();
    memo.set(key, { value, until: Date.now() + MEMO_MS });
    return value;
}

function computeDemoPortfolio(range: PortfolioRange, now: number, opts: DemoPortfolioOptions): PortfolioResponse {
    const starred = new Set(opts.starred ?? DEFAULT_STARRED);
    const inv = demoInventory(opts.account ?? DEMO_DEFAULT_ACCOUNT);
    const pairs = pairSites(inv.properties, inv.sites);

    const today = todayIso(now);
    const historyStart = addDays(today, -(DEMO_HISTORY_DAYS - 1));
    const end = syncEndDay(now);
    const days = RANGE_DAYS[range];
    // Enough history for the current and previous windows (GSC ends up to 6 days early).
    const fetchStart = [addDays(end, -(2 * days + 7)), historyStart].sort()[1];
    const syncedAt = Math.floor(now / 1000) - 20 * 60;

    const assets: StoreAsset[] = [];
    const rows: DailyRow[] = [];
    const base = {
        pairing_override: null, missing: false, status: 'synced' as const, last_error: null,
        last_synced_at: syncedAt, sync_started_at: syncedAt - 30, data_start: historyStart, data_end: end, backfill_done: true,
    };
    for (const pair of pairs) {
        const isStarred = starred.has(pair.host);
        if (pair.ga4) {
            const prop = pair.ga4 as Ga4PropertyInput & { accountName?: string };
            assets.push({
                ...base, asset_kind: 'ga4', asset_id: prop.property, display_name: prop.displayName,
                host: normalizeHost(prop.streamUris[0] ?? ''), account_name: prop.accountName ?? null, permission_level: null,
                paired_with: pair.gsc?.siteUrl ?? null, starred: isStarred, hidden: false,
            });
            rows.push(...parseGa4Daily(prop.property, demoRunReport(prop.property, ga4DailyRequest(fetchStart, end), { now })));
        }
        if (pair.gsc) {
            assets.push({
                ...base, asset_kind: 'gsc', asset_id: pair.gsc.siteUrl, display_name: pair.host, host: pair.host,
                account_name: null, permission_level: pair.gsc.permissionLevel ?? null,
                paired_with: pair.ga4?.property ?? null, starred: isStarred, hidden: false,
            });
            rows.push(...parseGscDaily(pair.gsc.siteUrl, demoSearchAnalytics(pair.gsc.siteUrl, gscDailyRequest(fetchStart, end), { now })));
        }
    }

    const snap = aggregateSnapshot(assets, rows, {
        windows: windowRequests(range, now),
        bucket_days: bucketDaysFor(range),
        recent_days: RECENT_DAYS,
    });
    // Exact users per property, the same single report the app makes per range.
    const w = snap.windows.ga4;
    if (w) {
        snap.range_totals = assets.filter((a) => a.asset_kind === 'ga4').map((a): RangeTotalRow => {
            const u = parseGa4RangeUsers(demoRunReport(a.asset_id, ga4RangeUsersRequest(
                { start: w.cur_start, end: w.cur_end }, { start: w.prev_start, end: w.prev_end },
            ), { now }));
            return {
                asset_kind: 'ga4', asset_id: a.asset_id, range_key: range, ...w, fetched_at: syncedAt,
                active_users_cur: u.activeCur, active_users_prev: u.activePrev, total_users_cur: u.totalCur, total_users_prev: u.totalPrev,
            };
        });
    }
    return buildPortfolio(snap, { range, now, demo: true });
}
