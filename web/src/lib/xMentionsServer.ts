import 'server-only';

import { exec } from 'child_process';
import { existsSync } from 'fs';

import { canonicalizeDomainInput, type XMentionPayload } from '@/lib/xMentionsShared';

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

export type XMentionsResult = {
    canonicalDomain: string;
    mentions: XMentionPayload[];
    warning?: string;
    error?: string;
};

const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_RAW_FETCH = 30;
const MAX_NORMALIZED_MENTIONS = 18;
const serverCache = new Map<string, { data: XMentionsResult; timestamp: number }>();
const inflightMap = new Map<string, Promise<XMentionsResult>>();

async function resolveTwitterBinAsync(): Promise<string> {
    if (process.env.TWITTER_CLI_PATH) return process.env.TWITTER_CLI_PATH;
    if (existsSync('/usr/local/bin/twitter')) return '/usr/local/bin/twitter';
    if (existsSync('/usr/bin/twitter')) return '/usr/bin/twitter';

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

let twitterBinPromise: Promise<string> | null = null;
function getTwitterBinAsync(): Promise<string> {
    if (!twitterBinPromise) {
        twitterBinPromise = resolveTwitterBinAsync();
    }
    return twitterBinPromise;
}

function getCached(key: string): XMentionsResult | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        serverCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: XMentionsResult): void {
    serverCache.set(key, { data, timestamp: Date.now() });
}

function toTimestamp(value?: string): number {
    const timestamp = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

async function runTwitterSearch(domain: string): Promise<string> {
    const bin = await getTwitterBinAsync();
    return new Promise((resolve, reject) => {
        const authToken = process.env.TWITTER_AUTH_TOKEN || '';
        const ct0 = process.env.TWITTER_CT0 || '';
        const env = {
            ...process.env,
            TWITTER_AUTH_TOKEN: authToken,
            TWITTER_CT0: ct0,
        };

        exec(
            `"${bin}" search "${domain}" --json --max ${MAX_RAW_FETCH}`,
            { env, timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    const errMsg = (stderr || error.message || '').toLowerCase();
                    if (error.killed || errMsg.includes('etimedout') || errMsg.includes('timed out')) {
                        reject(new Error('TWITTER_CLI_TIMEOUT'));
                        return;
                    }
                    if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('auth') || errMsg.includes('cookie')) {
                        reject(new Error('TWITTER_AUTH_EXPIRED'));
                        return;
                    }
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve(stdout);
            }
        );
    });
}

function normalizeMentions(parsed: TwitterResponse): XMentionPayload[] {
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

    const seenIds = new Set<string>();
    parsed.data.filter((t) => !t.isRetweet).forEach((t) => seenIds.add(t.id));
    const resultIds = new Set<string>();
    const seenTexts: { norm: string; handle: string }[] = [];

    return parsed.data
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
                    if (handle === prev.handle) return sim > 0.5;
                    return sim > 0.65;
                });
                if (isDupe) return false;
            }
            seenTexts.push({ norm, handle });
            resultIds.add(t.id);
            return true;
        })
        .slice(0, MAX_NORMALIZED_MENTIONS)
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
        .sort((a, b) => {
            const now = Date.now();
            const ageA_h = (now - toTimestamp(a.createdAt)) / 3_600_000;
            const ageB_h = (now - toTimestamp(b.createdAt)) / 3_600_000;
            const engA = Math.min(a.likes + a.retweets * 2, 500);
            const engB = Math.min(b.likes + b.retweets * 2, 500);
            const scoreA = engA / Math.pow(ageA_h + 2, 1.2);
            const scoreB = engB / Math.pow(ageB_h + 2, 1.2);
            return scoreB - scoreA;
        });
}

async function runAndCacheX(cacheKey: string, canonicalDomain: string): Promise<XMentionsResult> {
    try {
        const raw = await runTwitterSearch(canonicalDomain);
        let parsed: TwitterResponse;
        try {
            parsed = JSON.parse(raw) as TwitterResponse;
        } catch {
            return {
                canonicalDomain,
                mentions: [],
                warning: 'X mentions temporarily unavailable — parse error.',
            };
        }

        if (!parsed.ok || !Array.isArray(parsed.data)) {
            const errObj = parsed as unknown as { error?: { code?: string; message?: string } };
            if (errObj.error?.code === 'not_authenticated') {
                return {
                    canonicalDomain,
                    mentions: [],
                    error: 'X authentication failed — admin needs to refresh cookies in .env.local',
                };
            }

            const result = { canonicalDomain, mentions: [], warning: 'No results from X' };
            setCache(cacheKey, result);
            return result;
        }

        const result = { canonicalDomain, mentions: normalizeMentions(parsed) };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        if (msg === 'TWITTER_AUTH_EXPIRED') {
            return {
                canonicalDomain,
                mentions: [],
                error: 'X authentication expired — admin needs to refresh cookies',
            };
        }

        if (msg === 'TWITTER_CLI_TIMEOUT') {
            return {
                canonicalDomain,
                mentions: [],
                warning: 'X search timed out — mentions will load on next refresh',
            };
        }

        return {
            canonicalDomain,
            mentions: [],
            warning: 'X mentions temporarily unavailable — please try again later.',
        };
    }
}

export async function fetchXMentionsForDomain(domainInput: string): Promise<XMentionsResult> {
    const canonicalDomain = canonicalizeDomainInput(domainInput);
    if (!canonicalDomain) {
        return { canonicalDomain: '', mentions: [], warning: 'Invalid domain' };
    }

    if (!process.env.TWITTER_AUTH_TOKEN || !process.env.TWITTER_CT0) {
        return {
            canonicalDomain,
            mentions: [],
            warning: 'X integration unavailable — no credentials configured',
        };
    }

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `xm:v7:x:${canonicalDomain}:${today}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const inflight = inflightMap.get(cacheKey);
    if (inflight) return inflight;

    const promise = runAndCacheX(cacheKey, canonicalDomain);
    inflightMap.set(cacheKey, promise);
    promise.finally(() => inflightMap.delete(cacheKey));
    return promise;
}
