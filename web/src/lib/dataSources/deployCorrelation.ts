/**
 * deployCorrelation.ts — correlate GitHub deploys with traffic regressions.
 *
 * The "wow" insight: when a query's position degraded sharply, AND a commit/PR
 * was merged within ±2 days of the regression, the deploy is the likely cause.
 * Direct cause-and-effect, surfaced by the chat instead of the user manually
 * cross-checking git log against GSC.
 *
 * Gating: only runs when the user's intent is DIAGNOSTIC OR the query contains
 * regression keywords (drop / dropped / regress / broke / collapse). Prevents
 * burning GitHub API budget on every chat turn.
 */

import { getValidGithubToken, getRecentCommits } from '../githubApi';

export interface SiteRepoLink {
    site_url: string;
    repo_full_name: string;
    base_path?: string | null;
    branch?: string | null;
    confirmed?: boolean;
}

export interface DeployCorrelation {
    /** True if any candidate-cause commit was found near a position-loss event. */
    hasCorrelation: boolean;
    /** Candidate matches: query → suspect commits within ±2d of the period boundary. */
    matches: Array<{
        query: string;
        positionPrevious: number;
        positionCurrent: number;
        clicksLost: number;
        suspectCommits: Array<{ sha: string; date: string; message: string; author: string; html_url: string }>;
    }>;
    repo: string | null;
    repoLinkConfirmed: boolean;
    commitWindowDays: number;
    error?: string;
}

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const COMMIT_WINDOW_DAYS = 30;
const CORRELATION_WINDOW_DAYS = 2;

function emptyResult(): DeployCorrelation {
    return { hasCorrelation: false, matches: [], repo: null, repoLinkConfirmed: false, commitWindowDays: COMMIT_WINDOW_DAYS };
}

/** Fetch a user's site→repo links from admin. Returns null on failure. */
async function fetchSiteRepoLink(userId: string, siteUrl: string): Promise<SiteRepoLink | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/site-repo-links`,
            { headers: { 'X-API-Key': ADMIN_API_KEY }, signal: AbortSignal.timeout(4000) },
        );
        if (!res.ok) return null;
        const data = await res.json();
        const links: SiteRepoLink[] = data?.links || [];
        if (links.length === 0) return null;
        // Match by site_url with fuzzy comparison (sc-domain: vs https://, trailing /, etc.)
        const norm = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const want = norm(siteUrl);
        return links.find(l => norm(l.site_url) === want) || links[0] || null;
    } catch {
        return null;
    }
}

interface CorrelateArgs {
    userId: string;
    siteUrl: string;
    /** GitHub token (OAuth or App-installation). */
    githubToken: string | undefined;
    /** Losing queries from winners-losers (with positionPrevious / positionCurrent / clicksDelta). */
    losers: any[];
    /** When was the period boundary (= when did the regression most likely START)?
     *  Approximation: the start of the current 28d period. */
    periodStartDate: Date;
}

/** Decide whether this turn should run deploy correlation. */
export function shouldRunDeployCorrelation(intentLabel: string | null, userMessage: string): boolean {
    if (intentLabel === 'DIAGNOSTIC') return true;
    if (!userMessage) return false;
    const m = userMessage.toLowerCase();
    return /\b(drop|dropped|drops|dropping|regress|regression|regressed|broke|broken|collapse|collapsed|tank|tanked|crash|fall|fell|cliff|why\s+(did|is|are|has))\b/.test(m);
}

/**
 * Correlate site-repo-link commits with regression queries. Returns matches
 * keyed by query. Best-effort — fails open with empty result on any error.
 */
export async function correlateDeploysWithLosers(args: CorrelateArgs): Promise<DeployCorrelation> {
    const { userId, siteUrl, githubToken, losers, periodStartDate } = args;
    if (!losers || losers.length === 0) return emptyResult();

    // 1. Resolve site-repo link
    const link = await fetchSiteRepoLink(userId, siteUrl);
    if (!link?.repo_full_name) return emptyResult();

    // 2. Resolve a usable GitHub token (githubToken arg + admin DB fallbacks)
    const token = await getValidGithubToken(githubToken, userId).catch(() => null);
    if (!token) return { ...emptyResult(), repo: link.repo_full_name, repoLinkConfirmed: !!link.confirmed };

    // 3. Pull last 30 days of commits
    const since = new Date(periodStartDate);
    since.setDate(since.getDate() - COMMIT_WINDOW_DAYS);
    const sinceIso = since.toISOString();
    const untilIso = new Date(periodStartDate.getTime() + 7 * 86400_000).toISOString();
    const commitsRes = await getRecentCommits(token, {
        repo: link.repo_full_name,
        since: sinceIso,
        until: untilIso,
        per_page: 50,
    });
    if ('error' in commitsRes) return { ...emptyResult(), repo: link.repo_full_name, repoLinkConfirmed: !!link.confirmed };
    const commits = commitsRes.data || [];
    if (commits.length === 0) return { ...emptyResult(), repo: link.repo_full_name, repoLinkConfirmed: !!link.confirmed };

    // 4. For each loser query (top 5 by clicks lost), find commits within ±2 days
    //    of the period boundary. We don't know the EXACT regression date without
    //    daily series, so we use the period start as an approximation.
    const significantLosers = losers
        .filter((l: any) => Math.abs(l.clicksDelta || 0) >= 10 && (l.positionDelta || 0) >= 3)
        .slice(0, 5);

    const matches: DeployCorrelation['matches'] = [];
    for (const l of significantLosers) {
        const suspectCommits = commits.filter((c: any) => {
            if (!c.date) return false;
            const cDate = new Date(c.date).getTime();
            const lower = periodStartDate.getTime() - CORRELATION_WINDOW_DAYS * 86400_000;
            const upper = periodStartDate.getTime() + CORRELATION_WINDOW_DAYS * 86400_000;
            return cDate >= lower && cDate <= upper;
        }).slice(0, 5);
        if (suspectCommits.length === 0) continue;
        matches.push({
            query: l.query,
            positionPrevious: l.positionPrevious,
            positionCurrent: l.positionCurrent,
            clicksLost: Math.abs(l.clicksDelta),
            suspectCommits,
        });
    }

    return {
        hasCorrelation: matches.length > 0,
        matches,
        repo: link.repo_full_name,
        repoLinkConfirmed: !!link.confirmed,
        commitWindowDays: COMMIT_WINDOW_DAYS,
    };
}
