/**
 * Weekly-digest per-user runner.
 *
 * Extracted from the cron route (`api/cron/weekly-digest/route.ts`) so the same
 * logic can be invoked both by the weekly cron loop AND by ad-hoc superadmin
 * regeneration ("run this user's digest right now"). The cron iterates users
 * and calls `runWeeklyDigestForUser()` once each; the superadmin route calls it
 * with `{ dryRun: true }` for preview-without-write, or no options for a real
 * regeneration.
 *
 * Behavior is IDENTICAL to the inline cron implementation it replaced —
 * preserved verbatim per the "don't break anything" mandate.
 */
import { GoogleGenAI } from '@google/genai';
import { buildEnrichedSnapshot, type IsoWeekRange, getCompletedIsoWeekRange } from '@/lib/chatSnapshot';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Shared Gemini client. Cheap to construct, pointless to recreate.
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ActionItem {
    title: string;
    action: string;
}

interface UserLike {
    id?: number | string;
    github_id?: string | null;
    email?: string | null;
}

interface UserWorkspace {
    selected_site_url: string | null;
    selected_property_id: string | null;
}

export interface RunWeeklyDigestOptions {
    /** Specific ISO week to run for. Defaults to last completed Mon-Sun. */
    range?: IsoWeekRange;
    /** When true, runs everything (snapshot, Gemini) but skips the admin persist. */
    dryRun?: boolean;
}

export interface RunWeeklyDigestResult {
    ok: boolean;
    userIdentifier: string | null;
    year: number;
    isoWeek: number;
    siteUrl: string | null;
    headline: string | null;
    actionItems: ActionItem[] | null;
    snapshotEmpty: boolean;
    snapshotReason?: string;
    /** True if the digest was POSTed to admin successfully (false when dryRun). */
    persisted: boolean;
    /** Snapshot size in chars (useful for ops). */
    snapshotChars?: number;
    /** Set when the runner caught an error; the outer caller should LOG, not throw. */
    error?: string;
}

// ─── Identifier + workspace helpers ────────────────────────────────────────

/**
 * Pick the stable string identifier to send to the admin API. Mirrors the
 * `reportEmail.ts`/`adminClient`-style usage: prefer github_id (matches the
 * primary OAuth identity), fall back to email, finally fall back to the
 * stringified DB id. `get_user_by_identifier()` on the admin side resolves
 * all three.
 */
export function pickUserIdentifier(user: UserLike): string | null {
    if (user.github_id) return String(user.github_id);
    if (user.email) return String(user.email);
    if (user.id !== undefined && user.id !== null) return String(user.id);
    return null;
}

/** Fetch the user's stored workspace selection (GA4 property + GSC site). */
async function fetchWorkspace(userIdentifier: string): Promise<UserWorkspace | null> {
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(userIdentifier)}/workspace`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(8_000),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            selected_site_url: data?.selected_site_url || null,
            selected_property_id: data?.selected_property_id || null,
        };
    } catch {
        return null;
    }
}

// ─── Gemini headline + action-items synth ──────────────────────────────────

interface NarrativeOutput {
    headline: string | null;
    action_items: ActionItem[] | null;
}

function buildHeadlinePrompt(snapshot: unknown, range: IsoWeekRange, siteUrl: string | null): string {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    let snapshotJson = '';
    try {
        snapshotJson = JSON.stringify(snapshot, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
    } catch {
        snapshotJson = '{}';
    }
    if (snapshotJson.length > 18000) snapshotJson = snapshotJson.slice(0, 18000) + '...';

    const siteLabel = siteUrl || '(no site connected)';
    return `You are TrafficClaw's weekly analyst. Given the user's enriched snapshot for the week of Mon ${fmt(range.startDate)} to Sun ${fmt(range.endDate)} (their site: ${siteLabel}), produce:

1. A one-sentence headline (max 90 chars, prose, NO emoji at the start). Examples:
   - "Week 19 — /pricing lost 1,240 sessions after the May 8 redeploy."
   - "Week 19 — Google Discover doubled visits for /blog/ai-seo."
   - "Week 19 — Quiet week; one striking-distance keyword almost cracked the top 10."

2. Exactly 3 action items the user should do this week. Each is { title: string (max 80 chars), action: string (max 200 chars, concrete next step, not generic). }. Prioritize by quantified $/mo impact when present.

If the snapshot is empty / new site with no data, return:
{ "headline": "Week ${range.isoWeek} — Not enough data yet — we'll build your full briefing next week.", "action_items": [...3 starter tasks for a new site...] }

Output STRICT JSON only, no commentary. Shape:
{"headline": string, "action_items": [{"title": string, "action": string}, {"title": string, "action": string}, {"title": string, "action": string}]}

SNAPSHOT:
${snapshotJson}`;
}

function parseNarrative(raw: string): NarrativeOutput {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        const headline = typeof parsed?.headline === 'string' ? parsed.headline.slice(0, 200) : null;
        const itemsRaw = Array.isArray(parsed?.action_items) ? parsed.action_items : [];
        const items: ActionItem[] = itemsRaw
            .filter((it: unknown): it is Record<string, unknown> => !!it && typeof it === 'object')
            .map((it: Record<string, unknown>) => ({
                title: String(it.title || '').slice(0, 120),
                action: String(it.action || '').slice(0, 280),
            }))
            .filter((it: ActionItem) => it.title || it.action);
        return {
            headline,
            action_items: items.length ? items.slice(0, 3) : null,
        };
    } catch {
        return { headline: null, action_items: null };
    }
}

async function geminiHeadline(snapshot: unknown, range: IsoWeekRange, siteUrl: string | null): Promise<NarrativeOutput> {
    if (!ai) return { headline: null, action_items: null };
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: buildHeadlinePrompt(snapshot, range, siteUrl),
            config: { temperature: 0.4 },
        });
        const text = response.text?.trim() || '';
        if (!text) return { headline: null, action_items: null };
        return parseNarrative(text);
    } catch (err) {
        console.error('[WEEKLY-DIGEST] Gemini headline failed:', err);
        return { headline: null, action_items: null };
    }
}

// ─── Admin persist ────────────────────────────────────────────────────────

interface PersistArgs {
    userIdentifier: string;
    year: number;
    iso_week: number;
    site_url: string | null;
    headline: string | null;
    action_items: ActionItem[] | null;
    snapshot: unknown;
}

async function postWeeklyDigest(args: PersistArgs): Promise<boolean> {
    if (!ADMIN_API_KEY) return false;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(args.userIdentifier)}/weekly-digests`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({
                    year: args.year,
                    iso_week: args.iso_week,
                    site_url: args.site_url,
                    headline: args.headline,
                    action_items: args.action_items,
                    snapshot: args.snapshot,
                }),
                signal: AbortSignal.timeout(15_000),
            },
        );
        return res.ok;
    } catch (err) {
        console.error('[WEEKLY-DIGEST] postWeeklyDigest failed:', err);
        return false;
    }
}

// ─── Public runner ────────────────────────────────────────────────────────

/**
 * Run the full weekly-digest pipeline for ONE user:
 *   1. Resolve workspace (site + property) from admin
 *   2. Resolve a valid Google access token (refresh if needed)
 *   3. Build the enriched snapshot for the target ISO week
 *      (or a stub if no Google connection / no site)
 *   4. Ask Gemini for a one-sentence headline + 3 action items
 *   5. POST to admin to persist (skipped when dryRun)
 *
 * Never throws — all failures are caught and surfaced in the result's
 * `ok`/`error`/`snapshotReason` fields. The cron loop and the superadmin
 * action both consume this shape.
 */
export async function runWeeklyDigestForUser(
    user: UserLike,
    options: RunWeeklyDigestOptions = {},
): Promise<RunWeeklyDigestResult> {
    const range = options.range ?? getCompletedIsoWeekRange(new Date());
    const dryRun = options.dryRun === true;

    const userIdentifier = pickUserIdentifier(user);
    if (!userIdentifier) {
        return {
            ok: false,
            userIdentifier: null,
            year: range.year,
            isoWeek: range.isoWeek,
            siteUrl: null,
            headline: null,
            actionItems: null,
            snapshotEmpty: true,
            snapshotReason: 'no_user_identifier',
            persisted: false,
            error: 'No usable identifier (github_id / email / id all missing)',
        };
    }

    try {
        // 1. Workspace
        const workspace = await fetchWorkspace(userIdentifier);
        const siteUrl = workspace?.selected_site_url || null;
        const propertyId = workspace?.selected_property_id || undefined;

        // 2. Google token (refresh if needed)
        let validGoogleToken: string | null = null;
        let tokenFetchErr: string | null = null;
        try {
            const tokens = await fetchGoogleTokensFromDb(userIdentifier);
            if (tokens?.accessToken || tokens?.refreshToken) {
                validGoogleToken = await getValidAccessToken(tokens?.accessToken, tokens?.refreshToken);
            } else {
                tokenFetchErr = 'no_google_connection';
            }
        } catch (e) {
            tokenFetchErr = `token_refresh_failed: ${(e as Error).message}`;
        }

        // 3. Snapshot — rich path if we have token+site, stub otherwise
        let snapshot: unknown;
        let snapshotEmpty = false;
        let snapshotReason: string | undefined;
        if (validGoogleToken && siteUrl) {
            try {
                snapshot = await buildEnrichedSnapshot({
                    userId: userIdentifier,
                    siteUrl,
                    propertyId,
                    googleToken: validGoogleToken,
                    seoContext: {},
                    analyticsContext: {},
                    dateRange: { startDate: range.startDate, endDate: range.endDate },
                    skipPageMeta: false,
                });
            } catch (snapErr) {
                console.error(`[WEEKLY-DIGEST] snapshot build failed for ${userIdentifier}:`, snapErr);
                snapshotEmpty = true;
                snapshotReason = `snapshot_failed: ${(snapErr as Error).message}`;
                snapshot = {
                    empty: true,
                    reason: snapshotReason,
                    computedAt: new Date().toISOString(),
                    range: {
                        startDate: range.startDate.toISOString(),
                        endDate: range.endDate.toISOString(),
                        year: range.year,
                        isoWeek: range.isoWeek,
                    },
                };
            }
        } else {
            snapshotEmpty = true;
            snapshotReason = tokenFetchErr || (siteUrl ? 'unknown' : 'no_site_selected');
            snapshot = {
                empty: true,
                reason: snapshotReason,
                computedAt: new Date().toISOString(),
                range: {
                    startDate: range.startDate.toISOString(),
                    endDate: range.endDate.toISOString(),
                    year: range.year,
                    isoWeek: range.isoWeek,
                },
            };
        }

        // 4. Gemini narrative
        const narrative = await geminiHeadline(snapshot, range, siteUrl);

        // 5. Persist (unless dry-run)
        let persisted = false;
        if (!dryRun) {
            persisted = await postWeeklyDigest({
                userIdentifier,
                year: range.year,
                iso_week: range.isoWeek,
                site_url: siteUrl,
                headline: narrative.headline,
                action_items: narrative.action_items,
                snapshot,
            });
        }

        // Snapshot size for ops visibility
        let snapshotChars: number | undefined;
        try {
            snapshotChars = JSON.stringify(snapshot).length;
        } catch {
            snapshotChars = undefined;
        }

        return {
            ok: true,
            userIdentifier,
            year: range.year,
            isoWeek: range.isoWeek,
            siteUrl,
            headline: narrative.headline,
            actionItems: narrative.action_items,
            snapshotEmpty,
            snapshotReason,
            persisted,
            snapshotChars,
        };
    } catch (err) {
        // Catch-all — preserves the cron's per-user isolation guarantee.
        console.error(`[WEEKLY-DIGEST] runWeeklyDigestForUser failed for ${userIdentifier}:`, err);
        return {
            ok: false,
            userIdentifier,
            year: range.year,
            isoWeek: range.isoWeek,
            siteUrl: null,
            headline: null,
            actionItems: null,
            snapshotEmpty: true,
            snapshotReason: 'runner_threw',
            persisted: false,
            error: (err as Error).message,
        };
    }
}
