/**
 * isoWeek.ts — ISO 8601 week utilities for the Weekly Briefing feature.
 *
 * The weekly digest keys snapshots by `(year, isoWeek)` so a tab can render
 * "Week 18 of 2026" deterministically months later. This module provides:
 *
 *   - getCompletedIsoWeekRange(now): the LAST FULLY COMPLETED ISO week
 *     (Monday → Sunday) given a current time. Used by the weekly cron.
 *   - getIsoWeekRange(year, isoWeek): convert (year, weekNum) → date range.
 *     Used when a tab is rendered for an arbitrary historical week.
 *   - getIsoWeekParts(date): convert a Date → { year, isoWeek }.
 *
 * ISO 8601 rules (per ISO-8601):
 *   - Week starts Monday, ends Sunday.
 *   - Week 1 of a year is the week containing the year's first Thursday
 *     (equivalently: the week containing January 4th).
 *   - A given calendar year can have 52 or 53 ISO weeks.
 *   - Late-December and early-January dates may belong to the adjacent
 *     ISO-year (e.g. Jan 1 2024 was ISO week 1 of 2024, but Dec 31 2023
 *     was ISO week 52 of 2023 — Jan 1 2023 was ISO week 52 of 2022).
 *
 * All dates returned are at UTC midnight to avoid timezone drift when the
 * snapshot is serialized across services.
 */

export interface IsoWeekRange {
    /** Monday 00:00 UTC of the week. */
    startDate: Date;
    /** Sunday 23:59:59.999 UTC of the week (inclusive end). */
    endDate: Date;
    /** ISO-year the week belongs to (NOT necessarily the calendar year of startDate). */
    year: number;
    /** ISO week number (1-53). */
    isoWeek: number;
}

/** Return the Monday (UTC) of the ISO week containing `d`. */
function getIsoWeekMonday(d: Date): Date {
    const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat. Convert to ISO: 1=Mon, ..., 7=Sun.
    const isoDow = ((out.getUTCDay() + 6) % 7) + 1;
    out.setUTCDate(out.getUTCDate() - (isoDow - 1));
    return out;
}

/** Compute ISO { year, isoWeek } for the given Date. */
export function getIsoWeekParts(d: Date): { year: number; isoWeek: number } {
    // Use the canonical algorithm: shift to the Thursday of the same ISO week,
    // then take that Thursday's calendar year as the ISO-year, and compute the
    // week number as the ordinal of that Thursday relative to Jan 4th's week.
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const isoDow = ((target.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    // Move to the Thursday of this ISO week
    target.setUTCDate(target.getUTCDate() + (4 - isoDow));
    const year = target.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const firstThursdayDow = ((firstThursday.getUTCDay() + 6) % 7) + 1;
    firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstThursdayDow));
    const diffDays = Math.round((target.getTime() - firstThursday.getTime()) / 86400000);
    const isoWeek = 1 + Math.floor(diffDays / 7);
    return { year, isoWeek };
}

/**
 * Return the LAST FULLY COMPLETED ISO week (Monday → Sunday) given a current
 * time. If `now` is itself a Monday, this returns the prior Mon-Sun.
 *
 * Examples (UTC):
 *   now = Thu 2026-05-15  → Mon 2026-05-05 → Sun 2026-05-11 (Week 19 of 2026)
 *   now = Mon 2026-05-11  → Mon 2026-05-04 → Sun 2026-05-10 (Week 19 of 2026)
 *   now = Sun 2026-05-10  → Mon 2026-04-27 → Sun 2026-05-03 (Week 18 of 2026)
 */
export function getCompletedIsoWeekRange(now: Date = new Date()): IsoWeekRange {
    // Sunday of the *prior* week is "today, minus N days where N puts us on a
    // Sunday but never the current day's Sunday." Work in UTC.
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // Days since the most recent Sunday (0..6 — 0 means today IS Sunday).
    const todayUtcDow = todayUtc.getUTCDay(); // 0=Sun..6=Sat
    // We want the Sunday strictly before today (or 7 days back if today is Sunday).
    const daysBackToSunday = todayUtcDow === 0 ? 7 : todayUtcDow;
    const sunday = new Date(todayUtc);
    sunday.setUTCDate(sunday.getUTCDate() - daysBackToSunday);
    const monday = new Date(sunday);
    monday.setUTCDate(monday.getUTCDate() - 6);
    // Inclusive end-of-day for endDate
    const endDate = new Date(sunday);
    endDate.setUTCHours(23, 59, 59, 999);
    const { year, isoWeek } = getIsoWeekParts(monday);
    return { startDate: monday, endDate, year, isoWeek };
}

/**
 * Convert an explicit (year, isoWeek) pair → Mon-Sun date range.
 * Useful for rendering an arbitrary historical week from a URL like
 * /dashboard/weekly?year=2026&week=18.
 */
export function getIsoWeekRange(year: number, isoWeek: number): IsoWeekRange {
    // Start from Jan 4th of the ISO-year (always in week 1), then offset by
    // (isoWeek - 1) weeks, then snap to that week's Monday.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week1Monday = getIsoWeekMonday(jan4);
    const monday = new Date(week1Monday);
    monday.setUTCDate(monday.getUTCDate() + (isoWeek - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const endDate = new Date(sunday);
    endDate.setUTCHours(23, 59, 59, 999);
    return { startDate: monday, endDate, year, isoWeek };
}
