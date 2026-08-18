/**
 * Brave Search API client.
 *
 * Lets the AI chat fetch real organic SERP results for a query so it can
 * answer "what does the page beating me do differently" — rather than
 * inventing competitor structure or generic title-rewrite advice.
 *
 * Free tier: 2,000 queries/month. Sign up at https://brave.com/search/api.
 * Key lives in BRAVE_SEARCH_API_KEY env var. Results are cached for 24h
 * per (query, country, limit) to defend the quota.
 */
import { cachedFetch } from './apiCache';
import { createHash } from 'crypto';

export interface BraveSerpResult {
    rank: number;
    title: string;
    url: string;
    description: string;
    favicon?: string;
    age?: string;
}

export interface FetchSerpArgs {
    query: string;
    limit?: number;        // default 10, max 20
    country?: string;      // ISO-2; default 'us'
    abortSignal?: AbortSignal;
}

export interface FetchSerpResult {
    query: string;
    country: string;
    results: BraveSerpResult[];
    source: 'brave';
    cached?: boolean;
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

interface BraveApiResponse {
    web?: {
        results?: Array<{
            title?: string;
            url?: string;
            description?: string;
            favicon?: string;
            age?: string;
        }>;
    };
}

export async function fetchSerpCompetitors(args: FetchSerpArgs): Promise<FetchSerpResult> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
        throw new Error('BRAVE_SEARCH_API_KEY not configured. Sign up at brave.com/search/api and set the key in .env.local.');
    }

    const query = (args.query ?? '').trim();
    if (!query) throw new Error('query is required');
    if (query.length > 400) throw new Error('query too long (max 400 chars)');

    const limit = Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
    const country = (args.country ?? 'us').toLowerCase().slice(0, 2);

    const cacheKey = `brave-serp:${createHash('sha256').update(`${query}|${country}|${limit}`).digest('hex').slice(0, 24)}`;

    return await cachedFetch<FetchSerpResult>(cacheKey, CACHE_TTL_MS, async () => {
        const url = new URL(BRAVE_ENDPOINT);
        url.searchParams.set('q', query);
        url.searchParams.set('count', String(limit));
        url.searchParams.set('country', country);

        const res = await fetch(url.toString(), {
            headers: {
                'X-Subscription-Token': apiKey,
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
            },
            signal: args.abortSignal,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Brave Search API ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = (await res.json()) as BraveApiResponse;
        const rawResults = data.web?.results ?? [];

        const results: BraveSerpResult[] = rawResults
            .filter(r => r.title && r.url)
            .slice(0, limit)
            .map((r, idx) => ({
                rank: idx + 1,
                title: (r.title ?? '').slice(0, 300),
                url: r.url ?? '',
                description: (r.description ?? '').slice(0, 500),
                favicon: r.favicon,
                age: r.age,
            }));

        return {
            query,
            country,
            results,
            source: 'brave' as const,
        };
    });
}
