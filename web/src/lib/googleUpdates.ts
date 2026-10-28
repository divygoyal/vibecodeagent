/**
 * Google Search ranking updates (core, spam, helpful content) shown as
 * markers on the Search and Traffic charts and on dashboard time series. Curated by hand, newest last.
 *
 * Source for every row: Google Search Status Dashboard, "Ranking" incident
 * history, https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
 * (read 2026-10-27). `start` is the announced start; `end` is start plus the
 * rollout length the dashboard reports, rounded to whole days.
 *
 * Left out on purpose: reviews updates, Discover updates and "ranking is
 * experiencing an ongoing issue" incidents (not ranking changes for web search).
 *
 * To add one: copy a row, keep ISO dates, update the "read" date above.
 */

export type GoogleUpdateKind = 'core' | 'spam' | 'helpful';

export interface GoogleUpdate {
    name: string;
    kind: GoogleUpdateKind;
    /** 'YYYY-MM-DD' (rollout start). */
    start: string;
    /** 'YYYY-MM-DD' (rollout complete). */
    end: string;
}

export const GOOGLE_UPDATES_SOURCE = 'https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history';

export const GOOGLE_UPDATES: GoogleUpdate[] = [
    { name: 'March 2023 core update', kind: 'core', start: '2023-03-15', end: '2023-03-28' }, // 13 days, 7 hours
    { name: 'August 2023 core update', kind: 'core', start: '2023-08-22', end: '2023-09-07' }, // 16 days, 3 hours
    { name: 'September 2023 helpful content update', kind: 'helpful', start: '2023-09-14', end: '2023-09-27' }, // 13 days, 11 hours
    { name: 'October 2023 spam update', kind: 'spam', start: '2023-10-04', end: '2023-10-20' }, // 15 days, 12 hours
    { name: 'October 2023 core update', kind: 'core', start: '2023-10-05', end: '2023-10-19' }, // 13 days, 23 hours
    { name: 'November 2023 core update', kind: 'core', start: '2023-11-02', end: '2023-11-28' }, // 25 days, 21 hours
    { name: 'March 2024 core update', kind: 'core', start: '2024-03-05', end: '2024-04-19' }, // 45 days
    { name: 'March 2024 spam update', kind: 'spam', start: '2024-03-05', end: '2024-03-20' }, // 14 days, 21 hours
    { name: 'June 2024 spam update', kind: 'spam', start: '2024-06-20', end: '2024-06-27' }, // 7 days, 1 hour
    { name: 'August 2024 core update', kind: 'core', start: '2024-08-15', end: '2024-09-03' }, // 19 days, 4 hours
    { name: 'November 2024 core update', kind: 'core', start: '2024-11-11', end: '2024-12-05' }, // 23 days, 13 hours
    { name: 'December 2024 core update', kind: 'core', start: '2024-12-12', end: '2024-12-18' }, // 6 days, 4 hours
    { name: 'December 2024 spam update', kind: 'spam', start: '2024-12-19', end: '2024-12-26' }, // 7 days, 2 hours
    { name: 'March 2025 core update', kind: 'core', start: '2025-03-13', end: '2025-03-27' }, // 13 days, 21 hours
    { name: 'June 2025 core update', kind: 'core', start: '2025-06-30', end: '2025-07-17' }, // 16 days, 18 hours
    { name: 'August 2025 spam update', kind: 'spam', start: '2025-08-26', end: '2025-09-22' }, // 26 days, 15 hours
    { name: 'December 2025 core update', kind: 'core', start: '2025-12-11', end: '2025-12-29' }, // 18 days, 2 hours
    { name: 'March 2026 spam update', kind: 'spam', start: '2026-03-24', end: '2026-03-25' }, // 19 hours, 30 minutes
    { name: 'March 2026 core update', kind: 'core', start: '2026-03-27', end: '2026-04-08' }, // 12 days, 4 hours
    { name: 'May 2026 core update', kind: 'core', start: '2026-05-21', end: '2026-06-02' }, // 11 days, 21 hours
    { name: 'June 2026 spam update', kind: 'spam', start: '2026-06-24', end: '2026-06-26' }, // 2 days, 1 hour
    { name: 'August 2026 spam update', kind: 'spam', start: '2026-08-18', end: '2026-08-21' }, // 2 days, 16 hours
    { name: 'September 2026 spam update', kind: 'spam', start: '2026-09-24', end: '2026-10-08' }, // 13 days, 16 hours
];

/** Updates whose rollout started inside [start, end] (inclusive ISO days), oldest first. */
export function googleUpdatesIn(start: string, end: string): GoogleUpdate[] {
    return GOOGLE_UPDATES.filter((u) => u.start >= start && u.start <= end);
}

/** The update rolling out on a given day (start..end inclusive), if any. */
export function googleUpdateOn(day: string): GoogleUpdate | null {
    return GOOGLE_UPDATES.find((u) => day >= u.start && day <= u.end) ?? null;
}
