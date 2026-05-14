import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { buildEnrichedSnapshot, getCompletedIsoWeekRange, type IsoWeekRange } from '@/lib/chatSnapshot';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';
// The snapshot pipeline does a lot of upstream calls (GSC + GA4 + schema + PSI).
// Per-user we Promise.allSettled, but iterating users sequentially can take a
// while on production. Give the route the full Vercel/Coolify max execution
// budget. Defaults are too low if there's >5 users with data.
export const maxDuration = 300;

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// One shared Gemini client (cheap to construct, but pointless to recreate per
// user). `gemini-2.0-flash` matches /api/keyword-research and other one-shot
// callsites in this codebase. Temperature is biased low because the headline
// must be factual; the model gets the entire snapshot as grounding.
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    if (header.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// ─── User → identifier + workspace + Google-token helpers ─────────────────

/**
 * Pick the stable string identifier to send to the admin API. Mirrors
 * `reportEmail.ts`/`adminClient`-style usage: prefer github_id (matches the
 * primary OAuth identity), fall back to email, finally fall back to the
 * stringified DB id. `get_user_by_identifier()` on the admin side resolves
 * all three.
 */
function pickUserIdentifier(user: { id?: number | string; github_id?: string | null; email?: string | null }): string | null {
    if (user.github_id) return String(user.github_id);
    if (user.email) return String(user.email);
    if (user.id !== undefined && user.id !== null) return String(user.id);
    return null;
}

interface UserWorkspace {
    selected_site_url: string | null;
    selected_property_id: string | null;
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

interface ActionItem {
    title: string;
    action: string;
}
interface NarrativeOutput {
    headline: string | null;
    action_items: ActionItem[] | null;
}

function buildHeadlinePrompt(snapshot: any, range: IsoWeekRange, siteUrl: string | null): string {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    // Pass the snapshot as compressed JSON so the model gets the full enriched
    // payload without prose summarization on our end. The model is good at
    // pulling the headline finding from this much context — temperature 0.4
    // keeps it from hallucinating numbers that aren't in the JSON.
    let snapshotJson = '';
    try {
        snapshotJson = JSON.stringify(snapshot, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
    } catch {
        snapshotJson = '{}';
    }
    // Cap the JSON we send so we don't blow past the model's effective context
    // budget on extremely data-rich sites. 18k chars ≈ ~6k tokens — plenty for
    // a flash model and well below the limit. Truncating discards low-priority
    // schema/PSI tail data first by virtue of where it sits in the object.
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
            .filter((it: any) => it && typeof it === 'object')
            .map((it: any) => ({
                title: String(it.title || '').slice(0, 120),
                action: String(it.action || '').slice(0, 280),
            }))
            .filter((it: ActionItem) => it.title || it.action);
        // Best-effort: only return what we got. The route handles partial
        // shapes gracefully (a null headline is fine).
        return {
            headline,
            action_items: items.length ? items.slice(0, 3) : null,
        };
    } catch {
        return { headline: null, action_items: null };
    }
}

async function geminiHeadline(snapshot: any, range: IsoWeekRange, siteUrl: string | null): Promise<NarrativeOutput> {
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
    snapshot: any;
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

// ─── Route handler ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Weekly digest job started at ${timestamp}`);

    // The ISO-week range we're persisting is the same for every user — compute
    // it once. Mon 00:00 UTC → Sun 23:59:59 UTC of the last fully-completed
    // week. If today is Monday this is the Mon-Sun that just ended.
    const range = getCompletedIsoWeekRange(new Date());
    console.log(`[CRON] Weekly digest covering Week ${range.isoWeek} of ${range.year} (${range.startDate.toISOString().slice(0,10)} → ${range.endDate.toISOString().slice(0,10)})`);

    try {
        // Fetch all users from admin API
        const usersRes = await fetch(`${ADMIN_API_URL}/api/users`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });

        if (!usersRes.ok) {
            console.error('[WEEKLY-DIGEST] Failed to fetch users:', usersRes.status);
            return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
        }

        const users = await usersRes.json();
        let processed = 0;
        let skipped = 0;
        // Track snapshot+persist outcomes separately from the email step so we
        // can tell at a glance whether the new pipeline is producing rows.
        let snapshotsPersisted = 0;
        let snapshotsFailed = 0;

        for (const user of Array.isArray(users) ? users : []) {
            // Check user notification preferences (stored in their profile or default to enabled)
            const hasEmail = user.email;
            if (!hasEmail) {
                skipped++;
                continue;
            }

            // ── NEW (Wave 2 / Track 1c): build the weekly snapshot, ask Gemini
            //    for headline + action items, persist to admin. Wrapped in a
            //    try/catch so failures here NEVER block the existing email send.
            //    Per-user isolation: this whole block can throw without
            //    aborting the rest of the loop.
            const userIdentifier = pickUserIdentifier(user);
            if (userIdentifier) {
                try {
                    // 1. Pull workspace (site + property). Missing workspace is
                    //    fine — we still persist a stub digest with
                    //    site_url=null so the user sees "no data yet" for
                    //    Week N rather than nothing at all.
                    const workspace = await fetchWorkspace(userIdentifier);
                    const siteUrl = workspace?.selected_site_url || null;
                    const propertyId = workspace?.selected_property_id || undefined;

                    // 2. Resolve Google tokens. Without them we can't fetch
                    //    GSC/GA4 — persist a stub snapshot keyed to this week
                    //    so the user's tab isn't blank.
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

                    // 3. Build the snapshot. If we have no Google token OR no
                    //    site, hand a stub object to Gemini (it'll still
                    //    produce the "Not enough data yet" headline). Without
                    //    a site URL the GSC fetchers would 404, so skip the
                    //    rich path entirely.
                    let snapshot: any;
                    if (validGoogleToken && siteUrl) {
                        try {
                            snapshot = await buildEnrichedSnapshot({
                                userId: userIdentifier,
                                siteUrl,
                                propertyId,
                                googleToken: validGoogleToken,
                                // The chat injects compressed dashboard payloads
                                // here; for the cron there's nothing to inject —
                                // the analyzers fetch GSC/GA4 directly from the
                                // user's tokens. Empty objects are explicitly
                                // supported by the snapshot builder.
                                seoContext: {},
                                analyticsContext: {},
                                dateRange: { startDate: range.startDate, endDate: range.endDate },
                                skipPageMeta: false,
                            });
                        } catch (snapErr) {
                            console.error(`[WEEKLY-DIGEST] snapshot build failed for ${userIdentifier}:`, snapErr);
                            snapshot = {
                                empty: true,
                                reason: `snapshot_failed: ${(snapErr as Error).message}`,
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
                        snapshot = {
                            empty: true,
                            reason: tokenFetchErr || (siteUrl ? 'unknown' : 'no_site_selected'),
                            computedAt: new Date().toISOString(),
                            range: {
                                startDate: range.startDate.toISOString(),
                                endDate: range.endDate.toISOString(),
                                year: range.year,
                                isoWeek: range.isoWeek,
                            },
                        };
                    }

                    // 4. Ask Gemini for headline + 3 action items. Best-effort:
                    //    if this fails or returns invalid JSON, we persist the
                    //    snapshot with headline/action_items = null. The UI
                    //    handles null gracefully — better than no row at all.
                    const narrative = await geminiHeadline(snapshot, range, siteUrl);

                    // 5. Persist. Failure here is logged but doesn't poison
                    //    the email send below.
                    const persisted = await postWeeklyDigest({
                        userIdentifier,
                        year: range.year,
                        iso_week: range.isoWeek,
                        site_url: siteUrl,
                        headline: narrative.headline,
                        action_items: narrative.action_items,
                        snapshot,
                    });
                    if (persisted) {
                        snapshotsPersisted++;
                    } else {
                        snapshotsFailed++;
                    }
                } catch (snapshotErr) {
                    // Per-user isolation: any uncaught failure in the new
                    // pipeline (token refresh, snapshot, Gemini, persist) is
                    // swallowed here so the existing email send still runs.
                    snapshotsFailed++;
                    console.error(`[WEEKLY-DIGEST] snapshot+persist failed for user ${user.id}:`, snapshotErr);
                }
            } else {
                snapshotsFailed++;
                console.warn(`[WEEKLY-DIGEST] No usable identifier for user.id=${user.id} — skipping snapshot persist`);
            }
            // ── END NEW PIPELINE — existing email flow below is UNCHANGED ──

            // Build digest content for this user
            const digest = {
                userId: user.id,
                email: user.email,
                name: user.name || 'TrafficClaw User',
                timestamp,
                // The actual email sending would be handled by an email service
                // (e.g., Resend, SendGrid, Postmark) integrated in the admin API
                type: 'weekly_digest',
            };

            // Send digest via admin API (admin API would handle actual email delivery)
            try {
                await fetch(`${ADMIN_API_URL}/api/notifications/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': ADMIN_API_KEY,
                    },
                    body: JSON.stringify(digest),
                });
                processed++;
            } catch {
                console.error(`[WEEKLY-DIGEST] Failed to send digest to user ${user.id}`);
                skipped++;
            }
        }

        console.log(`[CRON] Weekly digest completed: ${processed} sent, ${skipped} skipped, ${snapshotsPersisted} snapshots persisted, ${snapshotsFailed} snapshot failures`);
        return NextResponse.json({
            success: true,
            timestamp,
            processed,
            skipped,
            // New counters — exposed so cron run logs surface whether Track 1c
            // is producing rows. Doesn't change the legacy { success, processed,
            // skipped } shape that any external monitor might be parsing.
            snapshotsPersisted,
            snapshotsFailed,
            week: { year: range.year, isoWeek: range.isoWeek },
        });
    } catch (err) {
        console.error('[WEEKLY-DIGEST] Error:', err);
        return NextResponse.json({ success: false, error: 'Digest job failed' }, { status: 500 });
    }
}
