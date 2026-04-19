import 'server-only';

import { canonicalizeDomainInput } from '@/lib/xMentionsShared';
import { type RedditMentionPayload } from '@/lib/redditMentionsShared';

export type RedditMentionsResult = {
    canonicalDomain: string;
    mentions: RedditMentionPayload[];
    warning?: string;
    error?: string;
};

type CacheEntry = {
    data: RedditMentionsResult;
    expiresAt: number;
};

type JsonRecord = Record<string, unknown>;

type RedditSource = 'domain' | 'search';

type SourceOutcome = {
    source: RedditSource;
    mentions: RedditMentionPayload[];
    failed: boolean;
    timedOut: boolean;
    blocked: boolean;
};

const SEARCH_LIMIT = 25;
const MAX_MENTIONS = 18;
const SUCCESS_CACHE_TTL = 24 * 60 * 60 * 1000;
const DEGRADED_CACHE_TTL = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const REDDIT_BASE_URL = 'https://www.reddit.com';
const REDDIT_USER_AGENT = 'TrafficClaw/1.0 (+https://trafficclaw.com)';

const serverCache = new Map<string, CacheEntry>();
const inflightMap = new Map<string, Promise<RedditMentionsResult>>();

function getCacheKey(canonicalDomain: string) {
    const today = new Date().toISOString().slice(0, 10);
    return `rm:v2:${canonicalDomain}:${today}`;
}

function isRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function toIsoString(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
        return new Date(timestamp).toISOString();
    }

    if (typeof value === 'string') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    return new Date(0).toISOString();
}

function normalizeRedditPermalink(value: unknown): string | null {
    const permalink = getString(value);
    if (!permalink) return null;

    if (permalink.startsWith('http://') || permalink.startsWith('https://')) {
        return permalink;
    }

    return `${REDDIT_BASE_URL}${permalink.startsWith('/') ? permalink : `/${permalink}`}`;
}

function containsDomain(value: string | null, domain: string) {
    return Boolean(value && value.toLowerCase().includes(domain));
}

function getCached(key: string): RedditMentionsResult | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        serverCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: RedditMentionsResult, ttl: number) {
    serverCache.set(key, {
        data,
        expiresAt: Date.now() + ttl,
    });
}

function getEnvelopeData(parsed: unknown): unknown {
    if (isRecord(parsed) && 'data' in parsed) {
        return parsed.data;
    }
    return parsed;
}

function getItemsArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }

    if (!isRecord(value)) {
        return [];
    }

    const candidateKeys = ['items', 'results', 'children', 'posts', 'comments'];
    for (const key of candidateKeys) {
        if (Array.isArray(value[key])) {
            return value[key] as unknown[];
        }
    }

    return [];
}

function unwrapNode(value: unknown): JsonRecord | null {
    if (!isRecord(value)) return null;
    if (isRecord(value.data)) {
        return value.data;
    }
    return value;
}

function parseRedditId(value: unknown) {
    const raw = getString(value);
    if (!raw) return null;
    if (raw.startsWith('t1_') || raw.startsWith('t3_')) {
        return raw.slice(3);
    }
    return raw;
}

function parsePermalinkId(value: unknown) {
    const permalink = normalizeRedditPermalink(value);
    if (!permalink) return null;
    const match = permalink.match(/\/comments\/([a-z0-9]+)\//i);
    return match?.[1] || null;
}

function pickPostId(item: JsonRecord) {
    return (
        parseRedditId(item.id) ||
        parseRedditId(item.post_id) ||
        parseRedditId(item.postId) ||
        parseRedditId(item.name) ||
        parsePermalinkId(item.permalink)
    );
}

function normalizePostCandidate(item: unknown, domain: string): RedditMentionPayload | null {
    const node = unwrapNode(item);
    if (!node) return null;

    const postId = pickPostId(node);
    const title = getString(node.title) || getString(node.link_title) || '';
    const text = getString(node.selftext) || getString(node.body) || getString(node.text) || '';
    const permalink = normalizeRedditPermalink(node.permalink);
    const externalUrl = getString(node.url);
    const outboundUrl = permalink || externalUrl || '';

    if (!postId || !title || !permalink || !outboundUrl) {
        return null;
    }

    const urlMatches = containsDomain(outboundUrl, domain) || containsDomain(externalUrl, domain);
    if (!urlMatches && !containsDomain(title, domain) && !containsDomain(text, domain)) {
        return null;
    }

    const subreddit = getString(node.subreddit_name_prefixed) || getString(node.subreddit) || 'reddit';
    const author = getString(node.author) || 'unknown';

    return {
        id: `post:${postId}`,
        postId,
        title,
        text,
        author,
        subreddit: subreddit.replace(/^r\//i, ''),
        score: getNumber(node.score),
        commentCount: getNumber(node.num_comments ?? node.comment_count),
        createdAt: toIsoString(node.created_utc ?? node.created_at ?? node.created),
        permalink,
        outboundUrl,
        externalUrl,
    };
}

function parseListingPosts(payload: unknown, domain: string): RedditMentionPayload[] {
    const data = getEnvelopeData(payload);
    const items = getItemsArray(data);
    return items
        .map((item) => normalizePostCandidate(item, domain))
        .filter((item): item is RedditMentionPayload => Boolean(item));
}

function sortMentions(mentions: RedditMentionPayload[]) {
    return [...mentions].sort((left, right) => {
        const rightDate = new Date(right.createdAt).getTime();
        const leftDate = new Date(left.createdAt).getTime();
        if (rightDate !== leftDate) {
            return rightDate - leftDate;
        }
        return right.score - left.score;
    });
}

function dedupeMentions(mentions: RedditMentionPayload[]) {
    const seenKeys = new Set<string>();
    return mentions.filter((mention) => {
        const keys = [
            mention.postId ? `post:${mention.postId}` : null,
            mention.permalink ? `permalink:${mention.permalink.toLowerCase()}` : null,
        ].filter((key): key is string => Boolean(key));

        if (keys.some((key) => seenKeys.has(key))) {
            return false;
        }

        keys.forEach((key) => seenKeys.add(key));
        return true;
    });
}

function createTimeoutController() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    return { controller, timeoutId };
}

async function fetchRedditListing(url: string) {
    const { controller, timeoutId } = createTimeoutController();

    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'User-Agent': REDDIT_USER_AGENT,
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            if (response.status === 403 || response.status === 429) {
                throw new Error('REDDIT_BLOCKED');
            }

            throw new Error(`REDDIT_HTTP_${response.status}`);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('REDDIT_TIMEOUT');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchDomainMentions(domain: string): Promise<SourceOutcome> {
    const url = `${REDDIT_BASE_URL}/domain/${encodeURIComponent(domain)}/new.json?limit=${SEARCH_LIMIT}`;

    try {
        const payload = await fetchRedditListing(url);
        return {
            source: 'domain',
            mentions: parseListingPosts(payload, domain),
            failed: false,
            timedOut: false,
            blocked: false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            source: 'domain',
            mentions: [],
            failed: true,
            timedOut: message === 'REDDIT_TIMEOUT',
            blocked: message === 'REDDIT_BLOCKED',
        };
    }
}

async function fetchSearchMentions(domain: string): Promise<SourceOutcome> {
    const url = new URL('/search.json', REDDIT_BASE_URL);
    url.searchParams.set('q', domain);
    url.searchParams.set('sort', 'new');
    url.searchParams.set('limit', String(SEARCH_LIMIT));
    url.searchParams.set('type', 'link');

    try {
        const payload = await fetchRedditListing(url.toString());
        return {
            source: 'search',
            mentions: parseListingPosts(payload, domain),
            failed: false,
            timedOut: false,
            blocked: false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            source: 'search',
            mentions: [],
            failed: true,
            timedOut: message === 'REDDIT_TIMEOUT',
            blocked: message === 'REDDIT_BLOCKED',
        };
    }
}

function getAggregateWarning(outcomes: SourceOutcome[], mentionCount: number) {
    const failed = outcomes.filter((outcome) => outcome.failed);
    if (failed.length === 0) {
        return undefined;
    }

    if (failed.every((outcome) => outcome.blocked)) {
        return 'Reddit blocked this server right now — please try again later.';
    }

    if (failed.every((outcome) => outcome.timedOut)) {
        return mentionCount > 0
            ? 'Some Reddit results were slow — showing partial mentions.'
            : 'Reddit search timed out — mentions will load on the next refresh.';
    }

    return mentionCount > 0
        ? 'Some Reddit results were unavailable — showing partial mentions.'
        : 'Reddit mentions temporarily unavailable — please try again later.';
}

async function runAndCacheReddit(cacheKey: string, canonicalDomain: string): Promise<RedditMentionsResult> {
    const outcomes = await Promise.all([
        fetchDomainMentions(canonicalDomain),
        fetchSearchMentions(canonicalDomain),
    ]);

    const mentions = sortMentions(
        dedupeMentions(outcomes.flatMap((outcome) => outcome.mentions))
    ).slice(0, MAX_MENTIONS);
    const warning = getAggregateWarning(outcomes, mentions.length);

    const result: RedditMentionsResult = {
        canonicalDomain,
        mentions,
        warning,
    };

    const ttl = warning ? DEGRADED_CACHE_TTL : SUCCESS_CACHE_TTL;
    setCache(cacheKey, result, ttl);
    return result;
}

export async function fetchRedditMentionsForDomain(domainInput: string): Promise<RedditMentionsResult> {
    const canonicalDomain = canonicalizeDomainInput(domainInput);
    if (!canonicalDomain) {
        return {
            canonicalDomain: '',
            mentions: [],
            warning: 'Invalid domain',
        };
    }

    const cacheKey = getCacheKey(canonicalDomain);
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const inflight = inflightMap.get(cacheKey);
    if (inflight) return inflight;

    const promise = runAndCacheReddit(cacheKey, canonicalDomain);
    inflightMap.set(cacheKey, promise);
    promise.finally(() => inflightMap.delete(cacheKey));
    return promise;
}

export function peekCachedRedditMentionsForDomain(domainInput: string): RedditMentionsResult | null {
    const canonicalDomain = canonicalizeDomainInput(domainInput);
    if (!canonicalDomain) {
        return null;
    }

    return getCached(getCacheKey(canonicalDomain));
}
