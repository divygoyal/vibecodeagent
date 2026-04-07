import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

// ── Resolve twitter-cli binary path (async — never blocks the event loop) ────
// Priority: TWITTER_CLI_PATH env > `python -c "..."` discovery > bare "twitter"

async function resolveTwitterBinAsync(): Promise<string> {
    if (process.env.TWITTER_CLI_PATH) return process.env.TWITTER_CLI_PATH;

    // On Linux (Nixpacks / Docker) pip3 installs scripts to /usr/local/bin
    const { existsSync } = await import('fs');
    if (existsSync('/usr/local/bin/twitter')) return '/usr/local/bin/twitter';
    if (existsSync('/usr/bin/twitter')) return '/usr/bin/twitter';

    // Dynamic discovery via python3 (python may not exist on Debian)
    return new Promise((resolve) => {
        exec(
            "python3 -c \"import shutil; print(shutil.which('twitter') or '')\"",
            { timeout: 5000 },
            (err, stdout) => {
                const resolved = stdout?.toString().trim();
                resolve(!err && resolved ? resolved : 'twitter');
            }
        );
    });
}

// Module-level promise so binary is only resolved once per server lifetime
let _twitterBinPromise: Promise<string> | null = null;
function getTwitterBinAsync(): Promise<string> {
    if (!_twitterBinPromise) _twitterBinPromise = resolveTwitterBinAsync();
    return _twitterBinPromise;
}

// ── Types ────────────────────────────────────────────────────────────────────

type TwitterAuthor = {
    id: string;
    name: string;
    screenName: string;
    profileImageUrl: string;
    verified: boolean;
};

type TwitterMetrics = {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views: number;
    bookmarks: number;
};

type TwitterTweet = {
    id: string;
    text: string;
    author: TwitterAuthor;
    metrics: TwitterMetrics;
    createdAt: string;
    createdAtISO: string;
    media: { type: string; url: string; width: number; height: number }[];
    urls: string[];
    isRetweet: boolean;
    lang: string;
    quotedTweet?: {
        id: string;
        text: string;
        author: { screenName: string; name: string };
    };
};

type TwitterResponse = {
    ok: boolean;
    schema_version: string;
    data: TwitterTweet[];
};

export type XMentionPayload = {
    id: string;
    text: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    verified: boolean;
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    createdAt: string;
    media: { type: string; url: string }[];
    urls: string[];
    quotedTweet: {
        id: string;
        text: string;
        authorName: string;
        authorHandle: string;
    } | null;
};

// ── Server-side in-memory cache (24hr TTL per domain+date) ───────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const serverCache = new Map<string, { data: XMentionPayload[]; timestamp: number }>();

function getCached(key: string): XMentionPayload[] | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        serverCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: XMentionPayload[]): void {
    serverCache.set(key, { data, timestamp: Date.now() });
}

function toTimestamp(value?: string): number {
    const timestamp = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

// ── twitter-cli subprocess wrapper ───────────────────────────────────────────

async function runTwitterSearch(domain: string): Promise<string> {
    const bin = await getTwitterBinAsync();
    return new Promise((resolve, reject) => {
        const authToken = process.env.TWITTER_AUTH_TOKEN || '';
        const ct0 = process.env.TWITTER_CT0 || '';

        // Pass twitter auth as env vars so twitter-cli picks them up
        const env = {
            ...process.env,
            TWITTER_AUTH_TOKEN: authToken,
            TWITTER_CT0: ct0,
        };

        // Shell out to twitter-cli with JSON output, max 8 results
        // Timeout reduced from 30s → 15s; caller handles ETIMEDOUT gracefully
        exec(
            `"${bin}" search "${domain}" --json --max 8`,
            { env, timeout: 15000, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    const errMsg = (stderr || error.message || '').toLowerCase();
                    // Timeout — surface as a distinct error so the caller can return a warning
                    if (error.killed || errMsg.includes('etimedout') || errMsg.includes('timed out')) {
                        reject(new Error('TWITTER_CLI_TIMEOUT'));
                        return;
                    }
                    // Auth-specific failures
                    if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('auth') || errMsg.includes('cookie')) {
                        reject(new Error('TWITTER_AUTH_EXPIRED'));
                        return;
                    }
                    reject(new Error(stderr || error.message));
                    return;
                }
                // twitter-cli may print warnings to stderr but still return JSON on stdout
                resolve(stdout);
            }
        );
    });
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Guard: check that Twitter credentials are configured
    if (!process.env.TWITTER_AUTH_TOKEN || !process.env.TWITTER_CT0) {
        return NextResponse.json(
            { mentions: [], warning: 'X integration unavailable — no credentials configured' },
            { status: 200 }
        );
    }

    try {
        const body = await req.json();
        const { domain } = body as { domain?: string };

        if (!domain || typeof domain !== 'string' || domain.length < 3) {
            return NextResponse.json(
                { mentions: [], warning: 'Invalid domain' },
                { status: 200 }
            );
        }

        // Sanitize domain — only allow alphanumeric, dots, hyphens
        const sanitized = domain.replace(/[^a-zA-Z0-9.\-]/g, '');
        if (sanitized !== domain) {
            return NextResponse.json(
                { mentions: [], warning: 'Invalid domain characters' },
                { status: 200 }
            );
        }

        // Build cache key: domain + calendar date (one refresh per day)
        const today = new Date().toISOString().slice(0, 10);
        const cacheKey = `xm:v6:${sanitized}:${today}`;

        // Check server cache first
        const cached = getCached(cacheKey);
        if (cached) {
            return NextResponse.json({ mentions: cached }, { status: 200 });
        }

        // Execute twitter-cli search
        const raw = await runTwitterSearch(sanitized);

        // Parse the JSON envelope
        let parsed: TwitterResponse;
        try {
            parsed = JSON.parse(raw) as TwitterResponse;
        } catch {
            console.error('[x-mentions] Failed to parse twitter-cli output');
            return NextResponse.json(
                { mentions: [], error: 'Failed to parse X response' },
                { status: 500 }
            );
        }

        if (!parsed.ok || !Array.isArray(parsed.data)) {
            // Check for auth error in the structured response
            const errObj = parsed as unknown as { error?: { code?: string; message?: string } };
            if (errObj.error?.code === 'not_authenticated') {
                console.error('[x-mentions] Twitter auth failed:', errObj.error.message);
                return NextResponse.json(
                    { mentions: [], error: 'X authentication failed — admin needs to refresh cookies in .env.local' },
                    { status: 200 }
                );
            }
            return NextResponse.json(
                { mentions: [], warning: 'No results from X' },
                { status: 200 }
            );
        }

        // Normalize text for near-duplicate detection
        const normalizeText = (text: string): string =>
            text.toLowerCase()
                .replace(/https?:\/\/\S+/g, '')
                .replace(/@\w+/g, '')
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        const jaccardSimilarity = (a: string, b: string): number => {
            const setA = new Set(a.split(' ').filter(Boolean));
            const setB = new Set(b.split(' ').filter(Boolean));
            if (setA.size === 0 && setB.size === 0) return 1;
            let intersection = 0;
            for (const w of setA) if (setB.has(w)) intersection++;
            return intersection / (setA.size + setB.size - intersection);
        };

        // Map to our lean payload (deduplicate by tweet ID + text similarity + quote-tweet suppression)
        const seenIds = new Set<string>();
        parsed.data.filter((t) => !t.isRetweet).forEach((t) => seenIds.add(t.id));
        const resultIds = new Set<string>();
        const seenTexts: { norm: string; handle: string }[] = [];
        const mentions: XMentionPayload[] = parsed.data
            .sort((a, b) => {
                const aDate = a.createdAtISO || a.createdAt || '';
                const bDate = b.createdAtISO || b.createdAt || '';
                return toTimestamp(bDate) - toTimestamp(aDate);
            })
            .filter((t) => {
                if (t.isRetweet) return false;
                if (resultIds.has(t.id)) return false;
                if (t.quotedTweet && seenIds.has(t.quotedTweet.id)) return false;
                const norm = normalizeText(t.text);
                const handle = t.author?.screenName?.toLowerCase() || '';
                if (norm.length > 15) {
                    const isDupe = seenTexts.some((prev) => {
                        const sim = jaccardSimilarity(norm, prev.norm);
                        // Same author: lower threshold (catches thread/reply dupes)
                        if (handle === prev.handle) return sim > 0.5;
                        return sim > 0.65;
                    });
                    if (isDupe) return false;
                }
                seenTexts.push({ norm, handle });
                resultIds.add(t.id);
                return true;
            })
            .slice(0, 8)
            .map((t) => ({
                id: t.id,
                text: t.text,
                authorName: t.author?.name || 'Unknown',
                authorHandle: t.author?.screenName || 'unknown',
                authorAvatar: t.author?.profileImageUrl || '',
                verified: t.author?.verified || false,
                likes: t.metrics?.likes || 0,
                retweets: t.metrics?.retweets || 0,
                replies: t.metrics?.replies || 0,
                views: t.metrics?.views || 0,
                createdAt: t.createdAtISO || t.createdAt || '',
                media: (t.media || []).map((m) => ({ type: m.type, url: m.url })),
                urls: (t.urls || []).filter((url) => typeof url === 'string' && url.length > 0),
                quotedTweet: t.quotedTweet ? {
                    id: t.quotedTweet.id,
                    text: t.quotedTweet.text,
                    authorName: t.quotedTweet.author?.name || 'Unknown',
                    authorHandle: t.quotedTweet.author?.screenName || 'unknown',
                } : null,
            }))
            .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

        // Cache the result server-side
        setCache(cacheKey, mentions);

        return NextResponse.json({ mentions }, { status: 200 });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        if (msg === 'TWITTER_AUTH_EXPIRED') {
            console.error('[x-mentions] Twitter auth expired — cookies need refresh');
            return NextResponse.json(
                { mentions: [], error: 'X authentication expired — admin needs to refresh cookies' },
                { status: 200 }
            );
        }

        if (msg === 'TWITTER_CLI_TIMEOUT') {
            console.warn('[x-mentions] Twitter CLI timed out after 15s');
            return NextResponse.json(
                { mentions: [], warning: 'X search timed out — mentions will load on next refresh' },
                { status: 200 }
            );
        }

        console.error('[x-mentions] Error:', error);
        return NextResponse.json(
            { mentions: [], error: 'Failed to fetch X mentions' },
            { status: 500 }
        );
    }
}
