/**
 * Retention cohort windows, shared by the GA4 cohort report (app/api/site/_lib/ga4Reports.ts) and the Traffic
 * header, which names the window instead of showing date controls that do not apply (round 5, audit item 17).
 * Pure: no React, no server imports.
 */
export type CohortMode = 'daily' | 'weekly' | 'monthly';
export const COHORT_MODES: readonly CohortMode[] = ['weekly', 'daily', 'monthly'];

export const COHORTS = {
    daily: { count: 14, offset: 14, nth: 'cohortNthDay', gran: 'DAILY' },
    weekly: { count: 8, offset: 8, nth: 'cohortNthWeek', gran: 'WEEKLY' },
    monthly: { count: 6, offset: 6, nth: 'cohortNthMonth', gran: 'MONTHLY' },
} as const;

export function utcToday(now: number = Date.now()): Date {
    const n = new Date(now);
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Cohort windows GA4 accepts: single days, Sunday–Saturday weeks, calendar months (complete ones only). */
export function cohortWindows(mode: CohortMode, now: number = Date.now()): { start: string; end: string }[] {
    const today = utcToday(now);
    const out: { start: string; end: string }[] = [];
    if (mode === 'daily') {
        for (let i = COHORTS.daily.count; i >= 1; i--) {
            const d = new Date(today.getTime() - i * 86_400_000);
            out.push({ start: iso(d), end: iso(d) });
        }
    } else if (mode === 'weekly') {
        const lastSat = new Date(today.getTime() - ((today.getUTCDay() + 1) % 7 || 7) * 86_400_000);
        for (let i = COHORTS.weekly.count - 1; i >= 0; i--) {
            const end = new Date(lastSat.getTime() - i * 7 * 86_400_000);
            out.push({ start: iso(new Date(end.getTime() - 6 * 86_400_000)), end: iso(end) });
        }
    } else {
        for (let i = COHORTS.monthly.count; i >= 1; i--) {
            const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
            const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i + 1, 0));
            out.push({ start: iso(start), end: iso(end) });
        }
    }
    return out;
}

/** First and last day the cohorts cover ("new users who first visited between …"). */
export function cohortSpan(mode: CohortMode, now: number = Date.now()): { start: string; end: string; count: number } {
    const w = cohortWindows(mode, now);
    return { start: w[0].start, end: w[w.length - 1].end, count: w.length };
}

const UNIT: Record<CohortMode, [string, string]> = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };
export function cohortUnit(mode: CohortMode, n: number): string {
    return n === 1 ? UNIT[mode][0] : UNIT[mode][1];
}
