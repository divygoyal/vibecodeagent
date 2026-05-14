/**
 * Keyword-driven detection of which connector (GitHub / GA4 / GSC) would help
 * the user with the question they're currently typing in the chat input.
 *
 * Used by ConnectorIntentNudge to surface a "Connect X for better answers"
 * pill above the chat input — only when the user is typing about something
 * that connector would unlock, and only when that connector isn't already
 * connected. WordPress/Vercel are intentionally excluded for v1 (they're
 * "coming soon" — no real OAuth flow to send users into yet).
 */

export type IntentProvider = 'github' | 'ga4' | 'gsc';

/** Word-boundary keyword bags. Lower-case; matched as whole words. Keep these
 *  reasonably tight — false positives (a user typing "user feedback" tripping
 *  the GA4 nudge) feel pushier than a missed prompt. */
const KEYWORDS: Record<IntentProvider, string[]> = {
    github: [
        'github', 'repo', 'repos', 'repository', 'repositories',
        'codebase', 'commit', 'commits', 'branch', 'branches',
        'pull request', 'pr', 'prs', 'readme', 'merge', 'merges',
        'clone', 'fork', 'tag', 'release',
    ],
    ga4: [
        'ga4', 'analytics', 'session', 'sessions',
        'pageview', 'pageviews', 'bounce', 'visitor', 'visitors',
        'traffic', 'channel', 'channels', 'acquisition', 'engagement',
        'event count', 'conversions',
    ],
    gsc: [
        'gsc', 'search console', 'ranking', 'rankings', 'rank',
        'keyword', 'keywords', 'serp', 'impressions', 'impression',
        'ctr', 'query', 'queries', 'organic', 'indexed',
    ],
};

export interface ConnectorIntent {
    provider: IntentProvider;
    /** How many keyword hits the input produced for this provider — higher
     *  wins when multiple providers match. */
    score: number;
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns the top-scoring matched provider, or null if no keywords matched. */
export function detectIntent(input: string): ConnectorIntent | null {
    if (!input || input.length < 3) return null;
    const lower = input.toLowerCase();
    let best: ConnectorIntent | null = null;
    for (const provider of Object.keys(KEYWORDS) as IntentProvider[]) {
        let score = 0;
        for (const word of KEYWORDS[provider]) {
            const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
            const hits = lower.match(re);
            if (hits) score += hits.length;
        }
        if (score > 0 && (!best || score > best.score)) {
            best = { provider, score };
        }
    }
    return best;
}

// ─── Dismissal (per session) ────────────────────────────────────────────────
// sessionStorage survives in-app navigation but resets on tab close. Matches
// what we want here: if a user dismisses the GitHub nudge during a chat, don't
// flash it back two messages later — but next time they open the app, give it
// another shot.

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
