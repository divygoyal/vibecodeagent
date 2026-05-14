/**
 * Lightweight helpers for the persistent GitHub-connect nudge above the chat
 * input. The earlier version of this file did keyword-based intent detection
 * (only nudge when the user typed "repo" / "commit" / etc.) — that proved
 * too subtle. GitHub connection improves answers across the board, so the
 * nudge is now always-on whenever GitHub isn't connected. Detection logic
 * was deleted; only the dismissal helpers remain.
 *
 * Dismissal is per-provider and per-session (sessionStorage) — survives
 * in-app navigation but resets on tab close.
 */

/** Kept as a type alias rather than a literal `'github'` so dismissal can
 *  extend to other providers later without re-typing the API. */
export type IntentProvider = 'github' | 'ga4' | 'gsc';

const DISMISS_PREFIX = 'tc.connector-nudge.dismissed.';

export function isDismissed(provider: IntentProvider): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.sessionStorage.getItem(DISMISS_PREFIX + provider) === '1';
    } catch {
        return false;
    }
}

export function dismissProvider(provider: IntentProvider): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(DISMISS_PREFIX + provider, '1');
    } catch {
        /* private mode / quota — silently fall back to no persistence */
    }
}
