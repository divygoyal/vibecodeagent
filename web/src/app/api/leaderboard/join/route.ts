import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getGoogleCredentialsForRequest } from '@/lib/serverAuth';
import { authOptions } from '@/lib/auth';
import { checkOwnership, type OwnershipCheck } from '@/lib/leaderboardVerify';
import { refreshEntry, storeVerification } from '@/lib/leaderboard/refresh';
import { isBlockedUrl } from '@/lib/urlValidation';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type JoinRateEntry = { timestamps: number[] };
const JOIN_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const JOIN_RATE_MAX = 20;
const joinRateStore = new Map<string, JoinRateEntry>();

function checkJoinRate(userId: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - JOIN_RATE_WINDOW_MS;
    const recent = (joinRateStore.get(userId)?.timestamps || []).filter((t) => t > windowStart);
    if (recent.length >= JOIN_RATE_MAX) {
        const retry = Math.max(recent[0] + JOIN_RATE_WINDOW_MS - now, 1000);
        joinRateStore.set(userId, { timestamps: recent });
        return { allowed: false, retryAfterSeconds: Math.ceil(retry / 1000) };
    }
    joinRateStore.set(userId, { timestamps: recent });
    return { allowed: true, retryAfterSeconds: 0 };
}

// Only count successful joins toward the rate limit. Failed attempts (502, 500,
// 4xx from validation) used to consume the budget too, which locked users out
// after a handful of legitimate retries.
function recordJoinSuccess(userId: string) {
    const now = Date.now();
    const windowStart = now - JOIN_RATE_WINDOW_MS;
    const recent = (joinRateStore.get(userId)?.timestamps || []).filter((t) => t > windowStart);
    recent.push(now);
    joinRateStore.set(userId, { timestamps: recent });
}

const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

function sanitizeDescription(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const stripped = input.replace(CONTROL_CHARS_RE, ' ').trim();
    return stripped.slice(0, 200);
}

function normalizeHost(input: string | undefined | null): string | null {
    if (!input) return null;
    const raw = input.trim().toLowerCase();
    if (!raw) return null;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        return new URL(withScheme).hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

// Google's S2 favicons endpoint always returns *something* — for anything
// vaguely real it serves the site's own icon at the requested size, which is
// dramatically better than the gradient-letter placeholder we were rendering.
function autoLogoForHost(host: string): string {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

const SPAM_TERMS = /(viagra|crypto-?(moon|pump)|free-?bitcoin|adult-?cam|porn-?hub)/i;

export const dynamic = 'force-dynamic';

type RawEntryBody = {
    entry_id?: number;
    startup_name?: string;
    description?: string;
    website_url?: string;
    logo_url?: string;
    category?: string;
    mrr_range?: string;
    looking_for?: string[];
    twitter_handle?: string;
    founder_name?: string;
    contact_email?: string;
    ga_property_id?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verify + sanitize an inbound entry body. Returns either the cleaned payload
 * (ready to forward to admin) or an error response. Shared by POST and PUT.
 */
async function preparePayload(
    rawBody: RawEntryBody,
    googleAccessToken: string | undefined,
    googleRefreshToken: string | undefined,
    userIdentifier?: string,
): Promise<
    | { ok: true; payload: Record<string, unknown>; verifiedHost: string | null; verificationStatus: string; outcome: OwnershipCheck | null }
    | { ok: false; response: NextResponse }
> {
    // Accept bare hostnames (`antigravity.codes`) AND fully-qualified URLs
    // (`https://antigravity.codes/`). We prepend https:// when no scheme is
    // present so verifyPropertyDomain + isBlockedUrl always see a parseable
    // URL, and we store the canonical https form.
    function canonicalizeUrl(raw: unknown): string | undefined {
        if (typeof raw !== 'string') return undefined;
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        // Reject obviously-broken inputs (whitespace, no dot) before adding scheme.
        if (/\s/.test(trimmed) || !trimmed.includes('.')) return trimmed;
        return `https://${trimmed}`;
    }

    const websiteUrl = canonicalizeUrl(rawBody.website_url);
    const logoUrl = canonicalizeUrl(rawBody.logo_url);

    if (websiteUrl && isBlockedUrl(websiteUrl)) {
        return { ok: false, response: NextResponse.json({ error: 'Website URL must be a public http(s) URL.' }, { status: 400 }) };
    }
    if (logoUrl && isBlockedUrl(logoUrl)) {
        return { ok: false, response: NextResponse.json({ error: 'Logo URL must be a public http(s) URL.' }, { status: 400 }) };
    }

    const contactEmailRaw = typeof rawBody.contact_email === 'string' ? rawBody.contact_email.trim() : '';
    if (contactEmailRaw && !EMAIL_RE.test(contactEmailRaw)) {
        return { ok: false, response: NextResponse.json({ error: 'Contact email must be a valid email address.' }, { status: 400 }) };
    }
    const contactEmail: string | undefined = contactEmailRaw || undefined;

    const founderNameRaw = typeof rawBody.founder_name === 'string' ? rawBody.founder_name.trim() : '';
    const founderName: string | undefined = founderNameRaw ? founderNameRaw.slice(0, 100) : undefined;

    const description = sanitizeDescription(rawBody.description);
    if (description && SPAM_TERMS.test(description)) {
        return { ok: false, response: NextResponse.json({ error: 'Description rejected by content filter.' }, { status: 400 }) };
    }

    // v3: ownership is proven through Search Console (owner / full user), with the GA4
    // data stream as a second signal. A failed check no longer rejects the request:
    // the listing is saved as "Pending verification" with fix-it steps.
    let verificationStatus: 'verified' | 'pending' = 'pending';
    let verifiedHost: string | null = null;
    let outcome: OwnershipCheck | null = null;
    if (rawBody.ga_property_id && websiteUrl && googleAccessToken) {
        outcome = await checkOwnership({
            websiteUrl,
            gaPropertyId: rawBody.ga_property_id,
            accessToken: googleAccessToken,
            refreshToken: googleRefreshToken,
            userIdentifier,
        });
        if (outcome.level === 'owner') {
            verificationStatus = 'verified';
            verifiedHost = outcome.verifiedHost;
        }
    }

    // Auto-resolve a logo from the verified host so listings always render
    // a real brand mark instead of the gradient initial. The user can still
    // override by passing logo_url explicitly.
    const resolvedHost = verifiedHost || normalizeHost(websiteUrl);
    const resolvedLogo = logoUrl || (resolvedHost ? autoLogoForHost(resolvedHost) : null);

    const payload: Record<string, unknown> = {
        ...rawBody,
        description,
        website_url: websiteUrl,
        logo_url: resolvedLogo ?? undefined,
        contact_email: contactEmail,
        founder_name: founderName,
        verification_status: verificationStatus,
        verified_host: verifiedHost,
    };
    delete payload.entry_id;

    return { ok: true, payload, verifiedHost, verificationStatus, outcome };
}

/**
 * Create a new leaderboard entry (multi-site).
 *
 * Each call creates a fresh row when the user posts a new ga_property_id; if
 * they re-submit an existing property the admin upserts the same row. The web
 * layer enforces that ga_property_id + website_url + ownership of the GA4
 * property are present — without those we can't stand behind the listing.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }
    // Server-only: Google tokens from the session JWT, then the admin DB.
    const { accessToken: googleAccessToken, refreshToken: googleRefreshToken } = await getGoogleCredentialsForRequest(req, String(userId));

    const rate = checkJoinRate(String(userId));
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many join requests. Try again in a bit.', retryAfterSeconds: rate.retryAfterSeconds },
            { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
        );
    }

    let rawBody: RawEntryBody;
    try {
        rawBody = (await req.json()) as RawEntryBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!rawBody.startup_name || !String(rawBody.startup_name).trim()) {
        return NextResponse.json({ error: 'Startup name is required.' }, { status: 400 });
    }
    if (!rawBody.ga_property_id) {
        return NextResponse.json(
            { error: 'Pick a Google Analytics property — we need it to verify your traffic.' },
            { status: 400 },
        );
    }
    if (!rawBody.website_url || !String(rawBody.website_url).trim()) {
        return NextResponse.json(
            { error: 'Add the website URL you want to list — we match it against your GA4 property.' },
            { status: 400 },
        );
    }
    if (!googleAccessToken) {
        return NextResponse.json(
            { error: 'Reconnect Google so we can verify your GA4 property.' },
            { status: 400 },
        );
    }

    // Wrap everything from here including preparePayload — any uncaught throw
    // (GA4 verify hiccup, JSON.parse on a weird upstream body, etc.) would
    // otherwise bubble to Next.js's default HTML 500 page, which the proxy
    // can't always pass through and surfaces as a Cloudflare 502 with HTML.
    try {
        const prepared = await preparePayload(rawBody, googleAccessToken, googleRefreshToken, String(userId));
        if (!prepared.ok) return prepared.response;

        const adminUrl = `${ADMIN_API_URL}/api/leaderboard/${userId}/join`;
        // 30s — the first second-site join may trigger admin's self-heal
        // migration (rebuild the leaderboard_entries table), which is worst-case
        // a few seconds of SQLite work. 30s gives plenty of headroom while
        // staying under both Cloudflare's 100s edge limit and Coolify defaults.
        const res = await fetch(adminUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(prepared.payload),
            signal: AbortSignal.timeout(30000),
        });

        const responseText = await res.text();
        let data: { success?: boolean; id?: number; error?: string; detail?: string } | null = null;
        try {
            data = responseText ? JSON.parse(responseText) : null;
        } catch {
            // Admin returned non-JSON (likely a crash or proxy error). Surface
            // the actual snippet + upstream status so the failure is debuggable
            // from devtools — far better than the opaque 502 it used to throw.
            console.error('[Leaderboard Join] Admin returned non-JSON:', res.status, responseText.slice(0, 500));
            return NextResponse.json(
                {
                    error: 'Could not save listing right now — please try again in a moment.',
                    upstreamStatus: res.status,
                    detail: responseText.slice(0, 200),
                },
                { status: 502 },
            );
        }

        if (!res.ok || !data?.success) {
            return NextResponse.json(
                data ?? { error: 'Admin API returned an empty response', upstreamStatus: res.status },
                { status: res.ok ? 502 : res.status },
            );
        }

        // Only consume the rate-limit budget on a successful create/upsert so
        // failed attempts don't lock the user out (the prior bug behind the
        // 429s observed in production).
        recordJoinSuccess(String(userId));

        // Store the verification result, then pull the numbers (7d / 28d / 3m, daily series,
        // audience). Fire-and-forget so the response is not held up; the daily cron catches up.
        if (data.id && rawBody.ga_property_id) {
            const entryId = data.id;
            const outcome = prepared.outcome;
            void (async () => {
                if (outcome) await storeVerification(entryId, outcome);
                await refreshEntry({
                    entryId,
                    gaPropertyId: String(rawBody.ga_property_id),
                    websiteUrl: String(prepared.payload.website_url || ''),
                    accessToken: googleAccessToken,
                    refreshToken: googleRefreshToken,
                    userIdentifier: String(userId),
                    skipVerify: true,
                    gscSiteUrl: outcome?.gscSiteUrl ?? null,
                });
            })().catch((err) => console.error('[Leaderboard Join] Background refresh failed:', err));
        }

        return NextResponse.json({
            ...data,
            stats: null,
            verification: {
                status: prepared.verificationStatus,
                verifiedHost: prepared.verifiedHost,
                level: prepared.outcome?.level ?? 'none',
                message: prepared.outcome?.message ?? null,
                fix: prepared.outcome?.fix ?? [],
            },
        });
    } catch (err) {
        console.error('Leaderboard join error:', err);
        const isAbort = err instanceof Error && err.name === 'TimeoutError';
        return NextResponse.json(
            {
                error: isAbort
                    ? 'Saving your listing took too long — please try again.'
                    : 'Failed to join leaderboard',
                detail: String(err),
            },
            { status: isAbort ? 504 : 500 },
        );
    }
}

/**
 * List all of the current user's leaderboard entries (active + inactive).
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ joined: false, entries: [] });
    }

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}/status`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            return NextResponse.json({ joined: false, entries: [] });
        }
        return NextResponse.json(data);
    } catch (err) {
        console.error('Leaderboard status error:', err);
        return NextResponse.json({ joined: false, entries: [] });
    }
}

/**
 * Update an existing leaderboard entry. Body must include `entry_id`. The
 * admin API verifies the entry belongs to the resolved user before mutating.
 */
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    let rawBody: RawEntryBody;
    try {
        rawBody = (await req.json()) as RawEntryBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const entryId = Number(rawBody.entry_id);
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 });
    }

    // Server-only: Google tokens from the session JWT, then the admin DB.
    const { accessToken: googleAccessToken, refreshToken: googleRefreshToken } = await getGoogleCredentialsForRequest(req, String(userId));
    const prepared = await preparePayload(rawBody, googleAccessToken, googleRefreshToken, String(userId));
    if (!prepared.ok) return prepared.response;

    try {
        const params = new URLSearchParams({ user_identifier: String(userId) });
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/entry/${entryId}?${params}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(prepared.payload),
            signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }
        if (res.ok && prepared.outcome) {
            await storeVerification(entryId, prepared.outcome);
        }
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard update error:', err);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

/**
 * Soft-delete a single leaderboard entry. Pass `?entry_id=N` (query) so we
 * never accidentally remove a different site than the one the user clicked.
 */
export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const url = new URL(req.url);
    const entryIdParam = url.searchParams.get('entry_id');
    const entryId = Number(entryIdParam);
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id query param is required' }, { status: 400 });
    }

    try {
        const params = new URLSearchParams({ user_identifier: String(userId) });
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/entry/${entryId}?${params}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard leave error:', err);
        return NextResponse.json({ error: 'Failed to remove entry' }, { status: 500 });
    }
}
