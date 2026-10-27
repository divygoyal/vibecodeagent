import { adminStore } from '@/lib/portfolio/adminStore';
import { googleAccessFor } from '@/lib/portfolio/auth';
import { STALE_AFTER_S } from '@/lib/portfolio/ranges';
import { startSync, type SyncResult } from '@/lib/portfolio/sync';

const USERS_PER_RUN = 25;
const TIME_BUDGET_MS = 240_000;

export interface StaleSyncRun {
    users: number;
    results: Pick<SyncResult, 'identifier' | 'due' | 'synced' | 'failed' | 'calls' | 'ms'>[];
    skipped: { identifier: string; reason: string }[];
    ms: number;
}

/**
 * Sync the portfolios whose oldest visible asset is older than STALE_AFTER_S.
 * Users run one after another (each sync fetches 4 assets at a time) within a
 * 4-minute budget; the next run picks up the rest. Shared by the cron route
 * and the in-process scheduler.
 */
export async function runStalePortfolioSync(): Promise<StaleSyncRun> {
    const started = Date.now();
    const users = await adminStore.staleUsers(STALE_AFTER_S, USERS_PER_RUN);
    const results: StaleSyncRun['results'] = [];
    const skipped: StaleSyncRun['skipped'] = [];
    for (const u of users) {
        if (Date.now() - started > TIME_BUDGET_MS) {
            skipped.push({ identifier: u.identifier, reason: 'time budget' });
            continue;
        }
        const access = await googleAccessFor(u.identifier);
        if (!access.ok) {
            skipped.push({ identifier: u.identifier, reason: access.reason });
            continue;
        }
        const r = await startSync({ identifier: u.identifier, accessToken: access.token, reason: 'cron' });
        results.push({ identifier: r.identifier, due: r.due, synced: r.synced, failed: r.failed, calls: r.calls, ms: r.ms });
    }
    return { users: users.length, results, skipped, ms: Date.now() - started };
}

const SCHEDULER_INTERVAL_MS = 30 * 60_000;
const FIRST_RUN_DELAY_MS = 5 * 60_000;

/**
 * In-process scheduler so portfolios stay fresh without an external cron.
 * Every 30 minutes it syncs the stale portfolios (at most 25 users per run).
 * One run at a time; timers are unref'd so they never keep the process alive.
 * Off with TC_PORTFOLIO_SCHEDULER=0.
 */
export function startPortfolioScheduler(): void {
    const g = globalThis as unknown as { __tcPortfolioScheduler?: boolean };
    if (g.__tcPortfolioScheduler) return;
    g.__tcPortfolioScheduler = true;

    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const run = await runStalePortfolioSync();
            if (run.users > 0) {
                console.log(`[portfolio-scheduler] ${run.results.length} synced, ${run.skipped.length} skipped in ${run.ms}ms`);
            }
        } catch (err) {
            console.error('[portfolio-scheduler] run failed:', err instanceof Error ? err.message : err);
        } finally {
            running = false;
        }
    };
    setTimeout(() => {
        void tick();
        setInterval(() => void tick(), SCHEDULER_INTERVAL_MS).unref();
    }, FIRST_RUN_DELAY_MS).unref();
}
