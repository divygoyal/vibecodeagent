import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/googleApi';
import { verifyPropertyDomain } from '@/lib/leaderboardVerify';
import { isBlockedUrl } from '@/lib/urlValidation';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

type JoinRateEntry = { timestamps: number[] };
const JOIN_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const JOIN_RATE_MAX = 5;
const joinRateStore = new Map<string, JoinRateEntry>();

function consumeJoinRate(userId: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - JOIN_RATE_WINDOW_MS;
    const recent = (joinRateStore.get(userId)?.timestamps || []).filter((t) => t > windowStart);
    if (recent.length >= JOIN_RATE_MAX) {
        const retry = Math.max(recent[0] + JOIN_RATE_WINDOW_MS - now, 1000);
        joinRateStore.set(userId, { timestamps: recent });
        return { allowed: false, retryAfterSeconds: Math.ceil(retry / 1000) };
    }
    recent.push(now);
    joinRateStore.set(userId, { timestamps: recent });
    return { allowed: true, retryAfterSeconds: 0 };
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

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

/**
 * Fetch GA4 stats and update a leaderboard entry. Used right after join so
 * the new listing has real numbers without waiting for the daily cron.
 */
async function refreshEntryStats(
    entryId: number,
    gaPropertyId: string,
    googleAccessToken: string,
    googleRefreshToken?: string,
) {
    try {
        const token = await getValidAccessToken(googleAccessToken, googleRefreshToken);
        const pid = cleanPropertyId(gaPropertyId);

        const [currentRes, prevRes] = await Promise.all([
            fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
                    metrics: [
                        { name: 'activeUsers' },
                        { name: 'screenPageViews' },
                        { name: 'engagementRate' },
                        { name: 'bounceRate' },
                        { name: 'averageSessionDuration' },
                    ],
                }),
                signal: AbortSignal.timeout(15000),
            }),
            fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '56daysAgo', endDate: '29daysAgo' }],
                    metrics: [{ name: 'activeUsers' }],
                }),
                signal: AbortSignal.timeout(15000),
            }),
        ]);

        if (!currentRes.ok) {
            console.error('[Leaderboard Instant] GA4 API error:', await currentRes.text());
            return null;
        }

        const currentData = await currentRes.json();
        const prevData = prevRes.ok ? await prevRes.json() : null;
        const row = currentData.rows?.[0];
        if (!row) return null;

        const mv = row.metricValues;
        const currentUsers = parseInt(mv[0].value) || 0;
        const prevUsers = prevData?.rows?.[0]?.metricValues?.[0]?.value
            ? parseInt(prevData.rows[0].metricValues[0].value)
            : 0;
        const trend = prevUsers > 0
            ? +((currentUsers - prevUsers) / prevUsers * 100).toFixed(1)
            : 0;

        const stats = {
            monthly_visitors: currentUsers,
            monthly_pageviews: parseInt(mv[1].value) || 0,
            engagement_rate: +((parseFloat(mv[2].value) || 0) * 100).toFixed(1),
            bounce_rate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
            avg_session_duration: Math.round(parseFloat(mv[4].value) || 0),
            visitor_trend: trend,
        };

        const updateRes = await fetch(`${ADMIN_API_URL}/api/leaderboard/${entryId}/stats`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(stats),
        });

        return updateRes.ok ? stats : stats;
    } catch (err) {
        console.error('[Leaderboard Instant] Stats refresh failed:', err);
        return null;
    }
}

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
): Promise<
    | { ok: true; payload: Record<string, unknown>; verifiedHost: string | null; verificationStatus: string }
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

    let verificationStatus: 'verified' | 'host_mismatch' | 'no_web_stream' | 'no_website_url' | 'failed' | 'pending' = 'pending';
    let verifiedHost: string | null = null;
    if (rawBody.ga_property_id && websiteUrl && googleAccessToken) {
        const verify = await verifyPropertyDomain(
            rawBody.ga_property_id,
            websiteUrl,
            googleAccessToken,
            googleRefreshToken,
        );
        verificationStatus = verify.status;
        if (verify.ok) {
            verifiedHost = verify.matchedHost;
        } else if (verify.status === 'host_mismatch' || verify.status === 'no_web_stream') {
            return {
                ok: false,
                response: NextResponse.json(
                    { error: verify.reason, status: verify.status, expectedHost: verify.expectedHost, actualHosts: verify.actualHosts },
                    { status: 400 },
                ),
            };
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

    return { ok: true, payload, verifiedHost, verificationStatus };
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
    // @ts-expect-error - googleAccessToken added in callbacks
    const googleAccessToken: string | undefined = session.user.googleAccessToken;
    // @ts-expect-error - refreshToken added in callbacks
    const googleRefreshToken: string | undefined = session.user.refreshToken;

    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const rate = consumeJoinRate(String(userId));
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

    const prepared = await preparePayload(rawBody, googleAccessToken, googleRefreshToken);
    if (!prepared.ok) return prepared.response;

    try {
        const adminUrl = `${ADMIN_API_URL}/api/leaderboard/${userId}/join`;
        const res = await fetch(adminUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(prepared.payload),
            signal: AbortSignal.timeout(10000),
        });

        const responseText = await res.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json(
                { error: 'Admin API returned non-JSON response', detail: responseText.slice(0, 200) },
                { status: 502 },
            );
        }

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        // Eager stats refresh so the new listing isn't all zeros.
        let stats = null;
        if (data.success && data.id && rawBody.ga_property_id) {
            try {
                stats = await refreshEntryStats(data.id, rawBody.ga_property_id, googleAccessToken, googleRefreshToken);
            } catch (statsErr) {
                console.error('[Leaderboard Join] Stats fetch failed:', statsErr);
            }
        }

        return NextResponse.json({
            ...data,
            stats,
            verification: { status: prepared.verificationStatus, verifiedHost: prepared.verifiedHost },
        });
    } catch (err) {
        console.error('Leaderboard join error:', err);
        return NextResponse.json({ error: 'Failed to join leaderboard', detail: String(err) }, { status: 500 });
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
    // @ts-expect-error - googleAccessToken added in callbacks
    const googleAccessToken: string | undefined = session.user.googleAccessToken;
    // @ts-expect-error - refreshToken added in callbacks
    const googleRefreshToken: string | undefined = session.user.refreshToken;
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

    const prepared = await preparePayload(rawBody, googleAccessToken, googleRefreshToken);
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
