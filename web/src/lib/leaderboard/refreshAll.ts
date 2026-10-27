/**
 * The whole-board leaderboard refresh, shared by GET /api/cron/leaderboard-refresh and the
 * in-process scheduler (scheduledRefresh.ts), the same way lib/portfolio/scheduledSync.ts
 * shares runStalePortfolioSync.
 *
 * For every active, unpaused listing: re-check Search Console ownership (and the GA4 stream),
 * pull GA4 + Search Console numbers for 7d / 28d / 3m and the daily series, and refresh the
 * audience breakdowns (see refresh.ts). Works unchanged in demo mode (TC_DEMO_DATA=1), where
 * Google is answered by the demo generator.
 *
 * Safe to call from several places at once: one run at a time per process (a second caller gets
 * `null` from startLeaderboardRefresh and can answer "already running"), and every step upserts,
 * so an external cron calling the route on top of the scheduler only repeats work.
 */
import { planRefresh, type RefreshListEntry } from './refreshPlan';
import { refreshEntry } from './refresh';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
// Entries refreshed in parallel. Each is a different GA4 property, so this stays far
// under the per-property limit (10 concurrent) while keeping the daily run short.
const CONCURRENCY = 3;
/** Stop starting new entries after this long; the oldest go first, so the next run picks up the rest. */
const TIME_BUDGET_MS = 30 * 60_000;

export type RefreshReason = 'cron' | 'scheduler';

export interface RefreshOptions {
    reason: RefreshReason;
    /** Leave entries whose numbers are younger than this (ms). 0 refreshes every entry. */
    minAgeMs?: number;
}

export interface RefreshSummary {
    success: true;
    reason: RefreshReason;
    timestamp: string;
    /** Entries the admin API listed (active, not paused, Google connected). */
    total: number;
    /** Left alone because their numbers were recent enough (minAgeMs). */
    skippedFresh: number;
    /** Not started because the time budget ran out. */
    skippedBudget: number;
    /** Entries a refresh was tried for (successCount + failCount). */
    attempted: number;
    successCount: number;
    failCount: number;
    ownerCount: number;
    ga4OnlyCount: number;
    unverifiedCount: number;
    checkFailedCount: number;
    audienceCount: number;
    /** Milliseconds until the first skipped entry becomes due (null when none was skipped). */
    nextDueMs: number | null;
    ms: number;
}

export class RefreshListError extends Error {
    status: number | null;

    constructor(message: string, status: number | null) {
        super(message);
        this.status = status;
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// On globalThis so every route bundle (cron route, scheduler in instrumentation) shares the guard.
const g = globalThis as unknown as { __tcLeaderboardRefresh?: { promise: Promise<RefreshSummary>; startedAt: number } };

export function isLeaderboardRefreshRunning(): boolean {
    return g.__tcLeaderboardRefresh !== undefined;
}

/**
 * Start a refresh unless one is already running in this process.
 * Resolves with the summary; rejects with RefreshListError when the admin API cannot list the entries.
 * Returns null (and does nothing) when a run is in progress.
 */
export function startLeaderboardRefresh(opts: RefreshOptions): Promise<RefreshSummary> | null {
    if (g.__tcLeaderboardRefresh) return null;
    const promise = doRefresh(opts).finally(() => {
        if (g.__tcLeaderboardRefresh?.promise === promise) g.__tcLeaderboardRefresh = undefined;
    });
    g.__tcLeaderboardRefresh = { promise, startedAt: Date.now() };
    return promise;
}

async function doRefresh(opts: RefreshOptions): Promise<RefreshSummary> {
    const started = Date.now();
    const timestamp = new Date(started).toISOString();
    const tag = `[leaderboard-refresh:${opts.reason}]`;
    console.log(`${tag} started at ${timestamp}`);

    let list: { entries: RefreshListEntry[]; total: number };
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/refresh`, {
            method: 'POST',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(15_000),
            cache: 'no-store',
        });
        if (!res.ok) {
            console.error(`${tag} failed to get the refresh list:`, res.status, (await res.text().catch(() => '')).slice(0, 200));
            throw new RefreshListError('Failed to get refresh list', res.status);
        }
        list = (await res.json()) as { entries: RefreshListEntry[]; total: number };
    } catch (err) {
        if (err instanceof RefreshListError) throw err;
        console.error(`${tag} refresh list unreachable:`, err instanceof Error ? err.message : err);
        throw new RefreshListError('Refresh failed', null);
    }

    const entries = Array.isArray(list.entries) ? list.entries : [];
    const plan = planRefresh(entries, started, opts.minAgeMs ?? 0);
    console.log(`${tag} ${entries.length} entries listed, ${plan.due.length} due, ${plan.fresh} recent enough to skip`);

    const demo = process.env.TC_DEMO_DATA === '1';
    const counts = { successCount: 0, failCount: 0, ownerCount: 0, ga4OnlyCount: 0, unverifiedCount: 0, checkFailedCount: 0, audienceCount: 0 };
    let next = 0;
    let skippedBudget = 0;

    const worker = async () => {
        while (next < plan.due.length) {
            const entry = plan.due[next++];
            if (Date.now() - started > TIME_BUDGET_MS) {
                skippedBudget += 1;
                continue;
            }
            if (!entry.ga_property_id) {
                console.log(`${tag} skipping entry ${entry.entry_id}: no GA property ID`);
                counts.failCount++;
                continue;
            }
            try {
                const result = await refreshEntry({
                    entryId: entry.entry_id,
                    gaPropertyId: entry.ga_property_id,
                    websiteUrl: entry.website_url,
                    accessToken: entry.access_token,
                    refreshToken: entry.refresh_token || undefined,
                    // Admin numeric user id: routes a linked Google account's property to its token.
                    userIdentifier: String(entry.user_id),
                    gscSiteUrl: entry.gsc_site_url ?? null,
                });
                if (result.ok) counts.successCount++;
                else counts.failCount++;
                if (result.audience) counts.audienceCount++;
                const v = result.verification;
                if (v?.transient) counts.checkFailedCount++;
                else if (v?.level === 'owner') counts.ownerCount++;
                else if (v?.level === 'ga4') counts.ga4OnlyCount++;
                else if (v) counts.unverifiedCount++;
                console.log(
                    `${tag} ${result.ok ? 'ok' : 'FAILED'} entry ${entry.entry_id}: ${v ? v.level : 'unchecked'}, ${result.days} days${result.gsc ? ', GSC' : ''}${result.error ? `, ${result.error}` : ''}`,
                );
            } catch (err) {
                counts.failCount++;
                console.error(`${tag} error processing entry ${entry.entry_id}:`, err);
            }
            // Jitter so a big run does not burst Google quota. Skipped in demo mode.
            if (!demo) await sleep(Math.floor(Math.random() * 1500));
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, plan.due.length) }, worker));

    const summary: RefreshSummary = {
        success: true,
        reason: opts.reason,
        timestamp,
        total: entries.length,
        skippedFresh: plan.fresh,
        skippedBudget,
        attempted: counts.successCount + counts.failCount,
        ...counts,
        nextDueMs: plan.nextDueMs,
        ms: Date.now() - started,
    };
    console.log(`${tag} complete:`, summary);
    return summary;
}
