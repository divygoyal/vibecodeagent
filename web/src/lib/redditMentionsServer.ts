import 'server-only';

import {
    getRedditMentionsCache,
    isRedditMentionsRedisEnabled,
    releaseRedditMentionsLock,
    setRedditMentionsCache,
    tryAcquireRedditMentionsLock,
} from '@/lib/redditMentionsCache';
import { type RedditMentionPayload } from '@/lib/redditMentionsShared';
import { canonicalizeDomainInput } from '@/lib/xMentionsShared';

export type RedditMentionsResult = {
    canonicalDomain: string;
    mentions: RedditMentionPayload[];
    warning?: string;
    error?: string;
};

export type RedditMentionsRequestSource = 'dashboard' | 'public' | 'embed' | 'unknown';

type RedditFetchOutcome = 'success' | 'empty' | 'blocked' | 'timeout' | 'error';
type CacheStatus = 'hit' | 'miss' | 'lock-wait';
type CacheLayer = 'local' | 'redis';

type CachedRedditMentionsResult = RedditMentionsResult & {
    outcome: RedditFetchOutcome;
    cachedAt: string;
};

type CacheEntry = {
    data: CachedRedditMentionsResult;
    expiresAt: number;
};

type JsonRecord = Record<string, unknown>;

type RedditSource = 'domain' | 'search';

type SourceOutcome = {
    source: RedditSource;
    mentions: RedditMentionPayload[];
    status: 'success' | 'blocked' | 'timeout' | 'error';
};

const SEARCH_LIMIT = 25;
const MAX_MENTIONS = 18;
const MIN_DOMAIN_RESULTS_BEFORE_SKIP_SEARCH = 6;
const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BLOCKED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TRANSIENT_CACHE_TTL_MS = 30 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const LOCK_TTL_SECONDS = 20;
const LOCK_WAIT_TIMEOUT_MS = 5_000;
const LOCK_POLL_INTERVAL_MS = 250;
const REDDIT_BASE_URL = 'https://www.reddit.com';
const REDDIT_USER_AGENT = 'TrafficClaw/1.0 (+https://trafficclaw.com)';

const serverCache = new Map<string, CacheEntry>();
const inflightMap = new Map<string, Promise<RedditMentionsResult>>();

function getCacheKey(canonicalDomain: string) {
    const today = new Date().toISOString().slice(0, 10);
    return `rm:v3:${canonicalDomain}:${today}`;
}

function getLockKey(canonicalDomain: string) {
    const today = new Date().toISOString().slice(0, 10);
    return `rm:v3:lock:${canonicalDomain}:${today}`;
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

function getTtlMsForOutcome(outcome: RedditFetchOutcome) {
    switch (outcome) {
        case 'blocked':
            return BLOCKED_CACHE_TTL_MS;
        case 'timeout':
        case 'error':
            return TRANSIENT_CACHE_TTL_MS;
        case 'success':
        case 'empty':
        default:
            return SUCCESS_CACHE_TTL_MS;
    }
}

function getTtlSecondsForOutcome(outcome: RedditFetchOutcome) {
    return Math.ceil(getTtlMsForOutcome(outcome) / 1000);
}

function getLocalCached(key: string): CachedRedditMentionsResult | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        serverCache.delete(key);
        return null;
    }
    return entry.data;
}

function setLocalCache(key: string, data: CachedRedditMentionsResult) {
    serverCache.set(key, {
        data,
        expiresAt: Date.now() + getTtlMsForOutcome(data.outcome),
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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCachedResult(result: CachedRedditMentionsResult): RedditMentionsResult {
    return {
        canonicalDomain: result.canonicalDomain,
        mentions: result.mentions,
        warning: result.warning,
        error: result.error,
    };
}

function toCachedResult(result: RedditMentionsResult, outcome: RedditFetchOutcome): CachedRedditMentionsResult {
    return {
        ...result,
        outcome,
        cachedAt: new Date().toISOString(),
    };
}

function normalizeOutcome(value: unknown): RedditFetchOutcome {
    switch (value) {
        case 'success':
        case 'empty':
        case 'blocked':
        case 'timeout':
        case 'error':
            return value;
        default:
            return 'error';
    }
}

function parseCachedResult(value: unknown): CachedRedditMentionsResult | null {
    if (!isRecord(value)) {
        return null;
    }

    const canonicalDomain = getString(value.canonicalDomain);
    const cachedAt = getString(value.cachedAt);
    if (!canonicalDomain || !cachedAt || !Array.isArray(value.mentions)) {
        return null;
    }

    return {
        canonicalDomain,
        mentions: value.mentions as RedditMentionPayload[],
        warning: getString(value.warning) || undefined,
        error: getString(value.error) || undefined,
        outcome: normalizeOutcome(value.outcome),
        cachedAt,
    };
}

async function readCachedResult(key: string): Promise<{ value: CachedRedditMentionsResult; layer: CacheLayer } | null> {
    const local = getLocalCached(key);
    if (local) {
        return { value: local, layer: 'local' };
    }

    const shared = parseCachedResult(await getRedditMentionsCache<unknown>(key));
    if (!shared) {
        return null;
    }

    setLocalCache(key, shared);
    return { value: shared, layer: 'redis' };
}

async function waitForCachedResult(key: string) {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < LOCK_WAIT_TIMEOUT_MS) {
        const cached = await readCachedResult(key);
        if (cached) {
            return cached;
        }
        await sleep(LOCK_POLL_INTERVAL_MS);
    }
    return null;
}

function logRedditFetch(params: {
    domain: string;
    routeSource: RedditMentionsRequestSource;
    cacheStatus: CacheStatus;
    outcome: RedditFetchOutcome;
    mentionCount: number;
    cacheLayer?: CacheLayer;
}) {
    console.info('[reddit-mentions]', params);
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
            status: 'success',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            source: 'domain',
            mentions: [],
            status: message === 'REDDIT_BLOCKED'
                ? 'blocked'
                : message === 'REDDIT_TIMEOUT'
                    ? 'timeout'
                    : 'error',
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
            status: 'success',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            source: 'search',
            mentions: [],
            status: message === 'REDDIT_BLOCKED'
                ? 'blocked'
                : message === 'REDDIT_TIMEOUT'
                    ? 'timeout'
                    : 'error',
        };
    }
}

function getAggregateWarning(outcomes: SourceOutcome[], mentionCount: number) {
    const failed = outcomes.filter((outcome) => outcome.status !== 'success');
    if (failed.length === 0) {
        return undefined;
    }

    if (failed.every((outcome) => outcome.status === 'blocked')) {
        return 'Reddit blocked this server right now — please try again later.';
    }

    if (failed.every((outcome) => outcome.status === 'timeout')) {
        return mentionCount > 0
            ? 'Some Reddit results were slow — showing partial mentions.'
            : 'Reddit search timed out — mentions will load on the next refresh.';
    }

    return mentionCount > 0
        ? 'Some Reddit results were unavailable — showing partial mentions.'
        : 'Reddit mentions temporarily unavailable — please try again later.';
}

function getAggregateOutcome(outcomes: SourceOutcome[], mentionCount: number): RedditFetchOutcome {
    const failed = outcomes.filter((outcome) => outcome.status !== 'success');
    if (failed.length === 0) {
        return mentionCount > 0 ? 'success' : 'empty';
    }

    if (
        failed.some((outcome) => outcome.status === 'blocked') &&
        !failed.some((outcome) => outcome.status === 'timeout' || outcome.status === 'error')
    ) {
        return 'blocked';
    }

    if (failed.some((outcome) => outcome.status === 'timeout')) {
        return 'timeout';
    }

    return 'error';
}

async function runRedditLookup(canonicalDomain: string) {
    const outcomes: SourceOutcome[] = [];
    const domainOutcome = await fetchDomainMentions(canonicalDomain);
    outcomes.push(domainOutcome);

    if (
        domainOutcome.status !== 'success' ||
        domainOutcome.mentions.length < MIN_DOMAIN_RESULTS_BEFORE_SKIP_SEARCH
    ) {
        outcomes.push(await fetchSearchMentions(canonicalDomain));
    }

    const mentions = sortMentions(
        dedupeMentions(outcomes.flatMap((outcome) => outcome.mentions)),
    ).slice(0, MAX_MENTIONS);
    const warning = getAggregateWarning(outcomes, mentions.length);
    const outcome = getAggregateOutcome(outcomes, mentions.length);

    return toCachedResult(
        {
            canonicalDomain,
            mentions,
            warning,
        },
        outcome,
    );
}

async function persistCachedResult(cacheKey: string, result: CachedRedditMentionsResult) {
    setLocalCache(cacheKey, result);
    await setRedditMentionsCache(cacheKey, result, getTtlSecondsForOutcome(result.outcome));
}

async function fetchFreshRedditMentions(
    cacheKey: string,
    lockKey: string,
    canonicalDomain: string,
    routeSource: RedditMentionsRequestSource,
) {
    let cacheStatus: CacheStatus = 'miss';
    let hasLock = false;

    if (isRedditMentionsRedisEnabled()) {
        hasLock = await tryAcquireRedditMentionsLock(lockKey, LOCK_TTL_SECONDS);

        if (!hasLock) {
            cacheStatus = 'lock-wait';
            const waited = await waitForCachedResult(cacheKey);
            if (waited) {
                const result = stripCachedResult(waited.value);
                logRedditFetch({
                    domain: canonicalDomain,
                    routeSource,
                    cacheStatus,
                    cacheLayer: waited.layer,
                    outcome: waited.value.outcome,
                    mentionCount: result.mentions.length,
                });
                return result;
            }

            hasLock = await tryAcquireRedditMentionsLock(lockKey, LOCK_TTL_SECONDS);
        }
    }

    try {
        const fresh = await runRedditLookup(canonicalDomain);
        await persistCachedResult(cacheKey, fresh);

        logRedditFetch({
            domain: canonicalDomain,
            routeSource,
            cacheStatus,
            outcome: fresh.outcome,
            mentionCount: fresh.mentions.length,
        });

        return stripCachedResult(fresh);
    } finally {
        if (hasLock) {
            await releaseRedditMentionsLock(lockKey);
        }
    }
}

export async function fetchRedditMentionsForDomain(
    domainInput: string,
    options: { source?: RedditMentionsRequestSource } = {},
): Promise<RedditMentionsResult> {
    const canonicalDomain = canonicalizeDomainInput(domainInput);
    if (!canonicalDomain) {
        return {
            canonicalDomain: '',
            mentions: [],
            warning: 'Invalid domain',
        };
    }

    const routeSource = options.source || 'unknown';
    const cacheKey = getCacheKey(canonicalDomain);
    const lockKey = getLockKey(canonicalDomain);

    const cached = await readCachedResult(cacheKey);
    if (cached) {
        const result = stripCachedResult(cached.value);
        logRedditFetch({
            domain: canonicalDomain,
            routeSource,
            cacheStatus: 'hit',
            cacheLayer: cached.layer,
            outcome: cached.value.outcome,
            mentionCount: result.mentions.length,
        });
        return result;
    }

    const inflight = inflightMap.get(cacheKey);
    if (inflight) {
        return inflight;
    }

    const promise = fetchFreshRedditMentions(cacheKey, lockKey, canonicalDomain, routeSource);
    inflightMap.set(cacheKey, promise);

    promise.finally(() => {
        if (inflightMap.get(cacheKey) === promise) {
            inflightMap.delete(cacheKey);
        }
    });

    return promise;
}

export async function peekCachedRedditMentionsForDomain(domainInput: string): Promise<RedditMentionsResult | null> {
    const canonicalDomain = canonicalizeDomainInput(domainInput);
    if (!canonicalDomain) {
        return null;
    }

    const cached = await readCachedResult(getCacheKey(canonicalDomain));
    return cached ? stripCachedResult(cached.value) : null;
}
