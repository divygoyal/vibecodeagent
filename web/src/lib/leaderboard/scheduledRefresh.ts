/**
 * In-process scheduler for the daily leaderboard refresh, so the board stays fresh without an
 * external cron (the same idea as lib/portfolio/scheduledSync.ts). Started from instrumentation.ts.
 *
 *  - First look 8-13 minutes after boot, then once a day (24 h + up to 30 min of jitter).
 *  - Only listings whose numbers are older than 20 hours are refreshed, so a deploy or restart
 *    does not repeat the day's run, and an external cron calling /api/cron/leaderboard-refresh
 *    on top does not make the scheduler redo its work.
 *  - One run at a time (shared with the route through startLeaderboardRefresh).
 *  - Timers are unref'd, so they never keep the process alive.
 *  - Off with TC_LEADERBOARD_SCHEDULER=0.
 */
import { startLeaderboardRefresh, type RefreshSummary } from './refreshAll';
import { firstRunDelayMs, nextRunDelayMs, SCHEDULER_MIN_AGE_MS } from './refreshPlan';

const RETRY_AFTER_ERROR_MS = 60 * 60_000;
const BUSY_RETRY_MS = 10 * 60_000;

export interface SchedulerHooks {
    /** Starts one refresh, or null when one is already running. Default: startLeaderboardRefresh. */
    run?: () => Promise<RefreshSummary> | null;
    setTimer?: (fn: () => void, ms: number) => { unref?: () => unknown };
    rand?: () => number;
    firstDelayMs?: number;
}

/** Start the scheduler once per process. Returns false when it was already started. */
export function startLeaderboardScheduler(hooks: SchedulerHooks = {}): boolean {
    const g = globalThis as unknown as { __tcLeaderboardScheduler?: boolean };
    if (g.__tcLeaderboardScheduler) return false;
    g.__tcLeaderboardScheduler = true;

    const run = hooks.run ?? (() => startLeaderboardRefresh({ reason: 'scheduler', minAgeMs: SCHEDULER_MIN_AGE_MS }));
    const setTimer = hooks.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const rand = hooks.rand ?? Math.random;

    const schedule = (ms: number) => {
        setTimer(() => void tick(), ms).unref?.();
    };

    const tick = async () => {
        const started = run();
        if (!started) {
            // A run is in progress (the cron route is running it): look again later.
            schedule(BUSY_RETRY_MS);
            return;
        }
        try {
            const summary = await started;
            const delay = nextRunDelayMs(summary, rand);
            if (summary.attempted > 0 || summary.skippedFresh > 0) {
                console.log(
                    `[leaderboard-scheduler] ${summary.successCount} refreshed, ${summary.failCount} failed, ${summary.skippedFresh} recent enough in ${summary.ms}ms; next run in ${Math.round(delay / 60_000)} min`,
                );
            }
            schedule(delay);
        } catch (err) {
            console.error('[leaderboard-scheduler] run failed:', err instanceof Error ? err.message : err);
            schedule(RETRY_AFTER_ERROR_MS);
        }
    };

    schedule(hooks.firstDelayMs ?? firstRunDelayMs(rand));
    return true;
}
