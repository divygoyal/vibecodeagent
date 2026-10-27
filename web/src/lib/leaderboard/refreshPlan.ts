/**
 * Pure planning rules for the daily leaderboard refresh (no I/O, unit-tested in
 * tests/leaderboardRefresh.test.mjs): which listings are due, and when the in-process
 * scheduler should look again.
 */

export interface RefreshListEntry {
    user_id: number;
    entry_id: number;
    ga_property_id: string | null;
    website_url: string | null;
    access_token: string;
    refresh_token: string | null;
    gsc_site_url?: string | null;
    /** ISO time of the last stored numbers (admin API since round 2; absent on older admins = unknown = due). */
    last_refreshed?: string | null;
}

export const HOUR_MS = 3_600_000;
/** The scheduler leaves a listing alone when its numbers are younger than this (so a restart or a second caller does not repeat the run). */
export const SCHEDULER_MIN_AGE_MS = 20 * HOUR_MS;
/** One run per day; the jitter only ever adds, so every listing is older than SCHEDULER_MIN_AGE_MS when the next run starts. */
export const RUN_INTERVAL_MS = 24 * HOUR_MS;
export const RUN_JITTER_MS = 30 * 60_000;
/** After a boot, the first look is this late (portfolio sync starts at 5 minutes) plus up to FIRST_RUN_JITTER_MS. */
export const FIRST_RUN_DELAY_MS = 8 * 60_000;
export const FIRST_RUN_JITTER_MS = 5 * 60_000;
/** Never look again sooner than this after a run that found nothing due. */
export const MIN_RECHECK_MS = 30 * 60_000;

export interface RefreshPlan {
    /** Oldest numbers first (never refreshed first). */
    due: RefreshListEntry[];
    /** Entries skipped because their numbers are younger than minAgeMs. */
    fresh: number;
    /** Milliseconds until the first skipped entry becomes due; null when nothing was skipped. */
    nextDueMs: number | null;
}

function ageOf(e: RefreshListEntry, now: number): number {
    if (!e.last_refreshed) return Infinity;
    const t = Date.parse(e.last_refreshed);
    return Number.isNaN(t) ? Infinity : Math.max(now - t, 0);
}

/** Split the admin's list into the entries to refresh now and the ones that are recent enough to leave. */
export function planRefresh(entries: RefreshListEntry[], now: number, minAgeMs: number): RefreshPlan {
    const due: RefreshListEntry[] = [];
    let fresh = 0;
    let nextDueMs: number | null = null;
    for (const e of entries) {
        const age = ageOf(e, now);
        if (minAgeMs > 0 && age < minAgeMs) {
            fresh += 1;
            const wait = minAgeMs - age;
            nextDueMs = nextDueMs === null ? wait : Math.min(nextDueMs, wait);
        } else {
            due.push(e);
        }
    }
    due.sort((a, b) => ageOf(b, now) - ageOf(a, now));
    return { due, fresh, nextDueMs };
}

/**
 * Delay before the scheduler's next run. A run that refreshed something is followed by the
 * next one a day later. A run that found everything fresh (a deploy shortly after a run, or
 * an external cron that already did the work) wakes up when the first listing becomes due.
 */
export function nextRunDelayMs(
    run: { attempted: number; skippedBudget?: number; nextDueMs: number | null },
    rand: () => number = Math.random,
): number {
    const jitter = Math.floor(rand() * RUN_JITTER_MS);
    // The time budget ran out: the rest (oldest first) is picked up soon, not tomorrow.
    if ((run.skippedBudget ?? 0) > 0) return MIN_RECHECK_MS + jitter;
    if (run.attempted > 0 || run.nextDueMs === null) return RUN_INTERVAL_MS + jitter;
    return Math.min(Math.max(run.nextDueMs, MIN_RECHECK_MS), RUN_INTERVAL_MS) + jitter;
}

export function firstRunDelayMs(rand: () => number = Math.random): number {
    return FIRST_RUN_DELAY_MS + Math.floor(rand() * FIRST_RUN_JITTER_MS);
}
