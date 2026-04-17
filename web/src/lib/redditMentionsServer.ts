import 'server-only';

import { exec } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { canonicalizeDomainInput } from '@/lib/xMentionsShared';
import { type RedditMentionPayload } from '@/lib/redditMentionsShared';

type RedditMentionsResult = {
    canonicalDomain: string;
    mentions: RedditMentionPayload[];
    warning?: string;
    error?: string;
};

type JsonRecord = Record<string, unknown>;

const SEARCH_LIMIT = 25;
const MAX_MENTIONS = 18;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 20_000;
const serverCache = new Map<string, { data: RedditMentionsResult; timestamp: number }>();
const inflightMap = new Map<string, Promise<RedditMentionsResult>>();

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

    return `https://www.reddit.com${permalink.startsWith('/') ? permalink : `/${permalink}`}`;
}

function containsDomain(value: string | null, domain: string) {
    return Boolean(value && value.toLowerCase().includes(domain));
}

function listNestedScriptCandidates(rootPath: string, executableNames: string[]) {
    if (!existsSync(rootPath)) return [];

    try {
        return readdirSync(rootPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .flatMap((entry) =>
                executableNames.map((name) => join(rootPath, entry.name, 'Scripts', name))
            );
    } catch {
        return [];
    }
}

function resolveRdtBinSync() {
    if (process.env.RDT_CLI_PATH) return process.env.RDT_CLI_PATH;

    const candidates = ['/usr/local/bin/rdt', '/usr/bin/rdt'];

    if (process.platform === 'win32') {
        const executableNames = ['rdt.exe', 'rdt.cmd', 'rdt.bat'];
        const localAppData = process.env.LOCALAPPDATA;
        const appData = process.env.APPDATA;

        if (localAppData) {
            candidates.push(
                ...listNestedScriptCandidates(join(localAppData, 'Python'), executableNames),
                ...listNestedScriptCandidates(join(localAppData, 'Programs', 'Python'), executableNames)
            );
        }

        if (appData) {
            candidates.push(...listNestedScriptCandidates(join(appData, 'Python'), executableNames));
        }
    }

    const resolved = candidates.find((candidate) => existsSync(candidate));
    if (resolved) {
        return resolved;
    }

    return process.platform === 'win32' ? 'rdt.exe' : 'rdt';
}

function getCached(key: string): RedditMentionsResult | null {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        serverCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: RedditMentionsResult) {
    serverCache.set(key, {
        data,
        timestamp: Date.now(),
    });
}

function getExecEnv() {
    const proxy = process.env.REDDIT_PROXY_URL?.trim();
    return {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        ...(proxy ? {
            HTTP_PROXY: proxy,
            HTTPS_PROXY: proxy,
            http_proxy: proxy,
            https_proxy: proxy,
        } : {}),
    };
}

function runRdtCommand(command: string, timeout: number) {
    return new Promise<string>((resolve, reject) => {
        exec(
            command,
            {
                env: getExecEnv(),
                timeout,
                maxBuffer: 3 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const message = `${stderr || ''} ${error.message || ''}`.trim().toLowerCase();
                    if (
                        message.includes('not recognized') ||
                        message.includes('enoent') ||
                        message.includes('not found')
                    ) {
                        reject(new Error('RDT_NOT_INSTALLED'));
                        return;
                    }
                    if (error.killed || message.includes('timed out') || message.includes('etimedout')) {
                        reject(new Error('RDT_TIMEOUT'));
                        return;
                    }
                    if (message.includes('403') || message.includes('forbidden') || message.includes('blocked')) {
                        reject(new Error('REDDIT_BLOCKED'));
                        return;
                    }
                    reject(new Error(stderr || error.message || 'Unknown rdt error'));
                    return;
                }

                resolve(stdout);
            }
        );
    });
}

async function runRdtSearch(domain: string) {
    const bin = resolveRdtBinSync();
    return runRdtCommand(
        `"${bin}" search "${domain}" -n ${SEARCH_LIMIT} --json --compact`,
        SEARCH_TIMEOUT_MS
    );
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

function extractJsonPayload(raw: string): string | null {
    const start = raw.search(/[\[{]/);
    if (start === -1) return null;
    return raw.slice(start).trim();
}

function normalizePostCandidate(item: unknown, domain: string): RedditMentionPayload | null {
    const node = unwrapNode(item);
    if (!node) return null;

    const postId = pickPostId(node);
    const title = getString(node.title) || getString(node.link_title) || '';
    const text = getString(node.selftext) || getString(node.body) || getString(node.text) || '';
    const permalink = normalizeRedditPermalink(node.permalink);
    const outboundUrl = permalink || getString(node.url) || '';
    const externalUrl = getString(node.url);

    if (!postId || !title || !outboundUrl) {
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
        permalink: outboundUrl,
        outboundUrl,
        externalUrl,
    };
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
    const seen = new Set<string>();
    return mentions.filter((mention) => {
        if (seen.has(mention.id)) {
            return false;
        }
        seen.add(mention.id);
        return true;
    });
}

function parseSearchPosts(raw: string, domain: string): RedditMentionPayload[] {
    try {
        const payload = extractJsonPayload(raw);
        if (!payload) return [];
        const parsed = JSON.parse(payload) as unknown;
        const data = getEnvelopeData(parsed);
        const items = getItemsArray(data);
        return items
            .map((item) => normalizePostCandidate(item, domain))
            .filter((item): item is RedditMentionPayload => Boolean(item));
    } catch {
        return [];
    }
}

async function runAndCacheReddit(cacheKey: string, canonicalDomain: string): Promise<RedditMentionsResult> {
    try {
        const searchRaw = await runRdtSearch(canonicalDomain);
        const mentions = parseSearchPosts(searchRaw, canonicalDomain);
        const result: RedditMentionsResult = {
            canonicalDomain,
            mentions: sortMentions(dedupeMentions(mentions)).slice(0, MAX_MENTIONS),
        };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message === 'RDT_NOT_INSTALLED') {
            return {
                canonicalDomain,
                mentions: [],
                warning: 'Reddit integration unavailable — install rdt-cli in this app runtime or set RDT_CLI_PATH.',
            };
        }

        if (message === 'RDT_TIMEOUT') {
            return {
                canonicalDomain,
                mentions: [],
                warning: 'Reddit search timed out — mentions will load on the next refresh.',
            };
        }

        if (message === 'REDDIT_BLOCKED') {
            return {
                canonicalDomain,
                mentions: [],
                warning: 'Reddit blocked this server right now — add REDDIT_PROXY_URL and try again.',
            };
        }

        console.error('[reddit-mentions] Error:', error);
        return {
            canonicalDomain,
            mentions: [],
            warning: 'Reddit mentions temporarily unavailable — please try again later.',
        };
    }
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

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `rm:v1:${canonicalDomain}:${today}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const inflight = inflightMap.get(cacheKey);
    if (inflight) return inflight;

    const promise = runAndCacheReddit(cacheKey, canonicalDomain);
    inflightMap.set(cacheKey, promise);
    promise.finally(() => inflightMap.delete(cacheKey));
    return promise;
}
