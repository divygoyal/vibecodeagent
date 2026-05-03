/**
 * GitHub REST API helpers for the AI chatbot.
 *
 * Mirrors the shape of googleApi.ts but uses raw fetch() (matches the existing
 * web/src/app/api/github/route.ts pattern) — no Octokit dependency.
 *
 * Token resolution strategy:
 *   1. JWT (session.user.githubAccessToken) — present whenever the user signed in
 *      via GitHub or has clicked Connect GitHub.
 *   2. Admin DB fallback (oauth_connections row, provider='github') — used when
 *      the user signed in with Google but had previously connected GitHub.
 *
 * GitHub OAuth App tokens DO NOT expire (until revoked) so there is no refresh
 * flow. A 401 from the API means the token was revoked — callers should surface
 * a "Reconnect GitHub" prompt.
 *
 * Result trimming: every helper returns only the fields the LLM needs. Bodies
 * are clipped to 500 chars. List endpoints are capped at 50 rows by default to
 * stay inside the token budget.
 */

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ADMIN_OAUTH_LOOKUP_TIMEOUT_MS = 8000;
const GITHUB_REQUEST_TIMEOUT_MS = 15000;
const TOKEN_CACHE_TTL_MS = 30 * 60 * 1000;
const TOKEN_CACHE_MAX = 1000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const GITHUB_API = 'https://api.github.com';
const COMMON_HEADERS = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
};

export type GithubError = {
    error: string;
    status?: number;
    message?: string;
    rateLimited?: boolean;
    resetAt?: number;
};

export type GithubResult<T> = { data: T; rateLimited?: false } | GithubError;

function isError<T>(r: GithubResult<T>): r is GithubError {
    return 'error' in r;
}

// ─── Token resolution ──────────────────────────────────────────────────────

/**
 * Fetch the stored GitHub OAuth token from the admin DB for a given user id.
 * Returns null if no connection or admin API isn't reachable.
 */
export async function fetchGithubTokenFromDb(userId: string): Promise<string | null> {
    if (!ADMIN_API_KEY || !userId) return null;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/oauth/github`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                signal: AbortSignal.timeout(ADMIN_OAUTH_LOOKUP_TIMEOUT_MS),
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.access_token || null;
    } catch {
        return null;
    }
}

/**
 * Resolve a usable GitHub access token. Prefers the JWT-supplied one; falls
 * back to the admin DB. Caches admin lookups per userId for 30 minutes.
 */
export async function getValidGithubToken(
    jwtToken: string | undefined,
    userId: string | undefined
): Promise<string | null> {
    if (jwtToken) return jwtToken;
    if (!userId) return null;

    const cached = tokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.token;
    }

    const token = await fetchGithubTokenFromDb(userId);
    if (!token) return null;

    if (tokenCache.size >= TOKEN_CACHE_MAX) {
        const now = Date.now();
        for (const [k, v] of tokenCache) {
            if (v.expiresAt < now) tokenCache.delete(k);
        }
        if (tokenCache.size >= TOKEN_CACHE_MAX) {
            const oldest = [...tokenCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
            for (let i = 0; i < Math.ceil(oldest.length * 0.25); i++) {
                tokenCache.delete(oldest[i][0]);
            }
        }
    }
    tokenCache.set(userId, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return token;
}

// ─── Low-level fetch ──────────────────────────────────────────────────────

async function ghFetch<T = any>(
    path: string,
    token: string,
    init?: RequestInit
): Promise<GithubResult<T>> {
    try {
        const res = await fetch(`${GITHUB_API}${path}`, {
            ...init,
            headers: {
                ...COMMON_HEADERS,
                Authorization: `Bearer ${token}`,
                ...(init?.headers || {}),
            },
            signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
        });

        if (res.status === 401) {
            return {
                error: 'token_revoked',
                status: 401,
                message: 'GitHub token is no longer valid. Please reconnect GitHub in Settings.',
            };
        }

        if (res.status === 403) {
            const remaining = res.headers.get('x-ratelimit-remaining');
            const reset = res.headers.get('x-ratelimit-reset');
            if (remaining === '0' && reset) {
                return {
                    error: 'rate_limited',
                    status: 403,
                    rateLimited: true,
                    resetAt: parseInt(reset, 10) * 1000,
                    message: `GitHub API rate limit exhausted. Resets at ${new Date(parseInt(reset, 10) * 1000).toISOString()}.`,
                };
            }
        }

        if (res.status === 404) {
            return { error: 'not_found', status: 404, message: 'Resource not found on GitHub.' };
        }

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return {
                error: 'github_error',
                status: res.status,
                message: text.slice(0, 200) || `GitHub API returned ${res.status}.`,
            };
        }

        const data = (await res.json()) as T;
        return { data };
    } catch (e: any) {
        return {
            error: 'network_error',
            message: e?.message?.slice(0, 200) || 'Network error talking to GitHub.',
        };
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────

function clip(text: string | null | undefined, maxLen = 500): string {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function parseRepo(input: string): { owner: string; repo: string } | null {
    const cleaned = input.trim().replace(/^https?:\/\/github\.com\//, '');
    const parts = cleaned.split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
}

// ─── Public helpers (called by aiChatTools) ───────────────────────────────

export async function listUserRepos(
    token: string,
    opts?: { sort?: 'updated' | 'pushed' | 'created' | 'full_name'; per_page?: number }
) {
    const sort = opts?.sort || 'updated';
    const per_page = Math.min(opts?.per_page || 30, 100);
    const r = await ghFetch<any[]>(
        `/user/repos?sort=${sort}&per_page=${per_page}&affiliation=owner,collaborator`,
        token
    );
    if (isError(r)) return r;
    return {
        data: r.data.map((repo) => ({
            full_name: repo.full_name,
            private: repo.private,
            description: clip(repo.description, 200),
            language: repo.language,
            stars: repo.stargazers_count,
            open_issues: repo.open_issues_count,
            default_branch: repo.default_branch,
            updated_at: repo.updated_at,
            pushed_at: repo.pushed_at,
        })),
    };
}

export async function searchRepoCode(
    token: string,
    args: { query: string; repo?: string }
) {
    const q = args.repo ? `${args.query} repo:${args.repo}` : args.query;
    const r = await ghFetch<any>(
        `/search/code?q=${encodeURIComponent(q)}&per_page=20`,
        token
    );
    if (isError(r)) return r;
    return {
        data: {
            total_count: r.data.total_count,
            items: (r.data.items || []).slice(0, 20).map((item: any) => ({
                path: item.path,
                repo: item.repository?.full_name,
                html_url: item.html_url,
            })),
        },
    };
}

export async function getRepoIssues(
    token: string,
    args: { repo: string; state?: 'open' | 'closed' | 'all'; labels?: string; since?: string; per_page?: number }
) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    const params = new URLSearchParams({
        state: args.state || 'open',
        per_page: String(Math.min(args.per_page || 30, 100)),
    });
    if (args.labels) params.set('labels', args.labels);
    if (args.since) params.set('since', args.since);

    const r = await ghFetch<any[]>(
        `/repos/${parsed.owner}/${parsed.repo}/issues?${params.toString()}`,
        token
    );
    if (isError(r)) return r;
    return {
        data: r.data
            .filter((i) => !i.pull_request) // /issues includes PRs; drop them
            .map((i) => ({
                number: i.number,
                title: i.title,
                state: i.state,
                labels: (i.labels || []).map((l: any) => l.name),
                comments: i.comments,
                user: i.user?.login,
                created_at: i.created_at,
                updated_at: i.updated_at,
                body: clip(i.body, 500),
                html_url: i.html_url,
            })),
    };
}

export async function getPullRequests(
    token: string,
    args: { repo: string; state?: 'open' | 'closed' | 'all'; per_page?: number; since?: string }
) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    const params = new URLSearchParams({
        state: args.state || 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: String(Math.min(args.per_page || 30, 100)),
    });

    const r = await ghFetch<any[]>(
        `/repos/${parsed.owner}/${parsed.repo}/pulls?${params.toString()}`,
        token
    );
    if (isError(r)) return r;
    let prs = r.data;
    if (args.since) {
        const sinceMs = new Date(args.since).getTime();
        if (!Number.isNaN(sinceMs)) {
            prs = prs.filter((p) => new Date(p.updated_at).getTime() >= sinceMs);
        }
    }
    return {
        data: prs.map((p) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            merged_at: p.merged_at,
            user: p.user?.login,
            base: p.base?.ref,
            head: p.head?.ref,
            created_at: p.created_at,
            updated_at: p.updated_at,
            body: clip(p.body, 500),
            html_url: p.html_url,
        })),
    };
}

export async function getRecentCommits(
    token: string,
    args: { repo: string; since?: string; until?: string; path?: string; per_page?: number }
) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    const params = new URLSearchParams({
        per_page: String(Math.min(args.per_page || 30, 100)),
    });
    if (args.since) params.set('since', args.since);
    if (args.until) params.set('until', args.until);
    if (args.path) params.set('path', args.path);

    const r = await ghFetch<any[]>(
        `/repos/${parsed.owner}/${parsed.repo}/commits?${params.toString()}`,
        token
    );
    if (isError(r)) return r;
    return {
        data: r.data.map((c) => ({
            sha: c.sha?.slice(0, 7),
            message: clip(c.commit?.message, 200),
            author: c.commit?.author?.name,
            date: c.commit?.author?.date,
            html_url: c.html_url,
        })),
    };
}

export async function getWorkflowRuns(
    token: string,
    args: { repo: string; status?: string; branch?: string; per_page?: number }
) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    const params = new URLSearchParams({
        per_page: String(Math.min(args.per_page || 20, 100)),
    });
    if (args.status) params.set('status', args.status);
    if (args.branch) params.set('branch', args.branch);

    const r = await ghFetch<any>(
        `/repos/${parsed.owner}/${parsed.repo}/actions/runs?${params.toString()}`,
        token
    );
    if (isError(r)) return r;
    return {
        data: {
            total_count: r.data.total_count,
            runs: (r.data.workflow_runs || []).map((run: any) => ({
                id: run.id,
                name: run.name,
                event: run.event,
                status: run.status,
                conclusion: run.conclusion,
                branch: run.head_branch,
                commit: run.head_sha?.slice(0, 7),
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
            })),
        },
    };
}

const FILE_MAX_BYTES = 100 * 1024;

export async function getFileContents(
    token: string,
    args: { repo: string; path: string; ref?: string }
) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    const safePath = args.path.replace(/^\/+/, '');
    const params = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';

    const r = await ghFetch<any>(
        `/repos/${parsed.owner}/${parsed.repo}/contents/${encodeURI(safePath)}${params}`,
        token
    );
    if (isError(r)) return r;

    if (Array.isArray(r.data)) {
        return { error: 'is_directory', message: `${safePath} is a directory. List entries: ${r.data.slice(0, 20).map((e: any) => e.name).join(', ')}` };
    }
    if (r.data.encoding !== 'base64' || typeof r.data.content !== 'string') {
        return { error: 'binary_or_unsupported', message: `File ${safePath} is binary or returned in an unsupported encoding.` };
    }
    if (r.data.size && r.data.size > FILE_MAX_BYTES) {
        return { error: 'file_too_large', message: `File ${safePath} is ${r.data.size} bytes (>${FILE_MAX_BYTES}). Use search_repo_code to locate specific lines instead.` };
    }
    // Runtime-agnostic base64 → UTF-8 (works on Node and Edge).
    const binary = atob(String(r.data.content).replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);
    return {
        data: {
            path: r.data.path,
            sha: r.data.sha?.slice(0, 7),
            size: r.data.size,
            content: clip(content, 6000),
            html_url: r.data.html_url,
        },
    };
}

// ─── Fuzzy site → repo matching ──────────────────────────────────────────────

type RepoLite = {
    full_name: string;
    description?: string | null;
    language?: string | null;
    pushed_at?: string | null;
    [k: string]: unknown;
};

const STOP_TOKENS = new Set([
    'www', 'app', 'web', 'site', 'main', 'next', 'app-web', 'monorepo', 'mono',
    'frontend', 'backend', 'api', 'static', 'docs', 'public', 'private',
]);

/**
 * Score how well a repo's name matches a site URL by token overlap.
 * Returns { repo, score, reason } sorted descending in `findBestRepoMatch`.
 */
function scoreRepoForSite(repo: RepoLite, siteTokens: Set<string>, siteHostFull: string): { score: number; reason: string } {
    const name = repo.full_name.split('/').pop() || repo.full_name;
    const repoTokens = name.toLowerCase().split(/[-_./]+/).filter(Boolean);

    let score = 0;
    let matchedDistinct = false;
    for (const tok of repoTokens) {
        if (STOP_TOKENS.has(tok) || tok.length < 3) continue;
        if (siteTokens.has(tok)) {
            score += 4;
            matchedDistinct = true;
        }
    }

    // Description / homepage often contains the site URL.
    const descLower = (repo.description || '').toLowerCase();
    if (siteHostFull && descLower.includes(siteHostFull)) {
        score += 6;
    }

    // Recency tiebreaker — repos pushed in the last 30 days get +1.
    if (repo.pushed_at) {
        const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 30) score += 1;
    }

    return {
        score,
        reason: matchedDistinct ? 'name token overlap' : score > 0 ? 'description match' : 'recency only',
    };
}

/** Strip protocol/scheme/path and split into tokens for matching. */
export function siteToTokens(siteUrl: string): { host: string; tokens: Set<string> } {
    const cleaned = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const host = cleaned.split('/')[0].toLowerCase();
    const tokens = new Set(host.split('.').flatMap((p) => p.split(/[-_]+/)).filter((t) => t.length >= 3 && !STOP_TOKENS.has(t)));
    return { host, tokens };
}

/**
 * Pick the best-matching repo for a site URL out of a list.
 * Returns null if no repo scores above the minimum confidence threshold.
 */
export function findBestRepoMatch<T extends RepoLite>(
    repos: readonly T[],
    siteUrl: string,
): { repo: T; score: number; reason: string } | null {
    if (!repos.length || !siteUrl) return null;
    const { host, tokens } = siteToTokens(siteUrl);
    if (!tokens.size) return null;

    let best: { repo: T; score: number; reason: string } | null = null;
    for (const repo of repos) {
        const { score, reason } = scoreRepoForSite(repo, tokens, host);
        if (!best || score > best.score) {
            best = { repo, score, reason };
        }
    }
    if (!best || best.score < 4) return null;
    return best;
}

export async function getRepoLanguages(token: string, args: { repo: string }) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };
    return ghFetch<Record<string, number>>(
        `/repos/${parsed.owner}/${parsed.repo}/languages`,
        token
    );
}

export async function getRepoHealth(token: string, args: { repo: string }) {
    const parsed = parseRepo(args.repo);
    if (!parsed) return { error: 'bad_args', message: `Invalid repo "${args.repo}". Use "owner/repo".` };

    const [repoR, langsR, openIssuesR, openPrsR, commitsR] = await Promise.all([
        ghFetch<any>(`/repos/${parsed.owner}/${parsed.repo}`, token),
        ghFetch<Record<string, number>>(`/repos/${parsed.owner}/${parsed.repo}/languages`, token),
        ghFetch<any>(
            `/search/issues?q=repo:${parsed.owner}/${parsed.repo}+type:issue+state:open&per_page=1`,
            token
        ),
        ghFetch<any>(
            `/search/issues?q=repo:${parsed.owner}/${parsed.repo}+type:pr+state:open&per_page=1`,
            token
        ),
        ghFetch<any[]>(`/repos/${parsed.owner}/${parsed.repo}/commits?per_page=1`, token),
    ]);

    if (isError(repoR)) return repoR;

    return {
        data: {
            full_name: repoR.data.full_name,
            description: clip(repoR.data.description, 200),
            default_branch: repoR.data.default_branch,
            stars: repoR.data.stargazers_count,
            forks: repoR.data.forks_count,
            open_issues_count: !isError(openIssuesR) ? openIssuesR.data.total_count : repoR.data.open_issues_count,
            open_prs_count: !isError(openPrsR) ? openPrsR.data.total_count : null,
            primary_language: repoR.data.language,
            languages: !isError(langsR) ? langsR.data : null,
            last_commit:
                !isError(commitsR) && commitsR.data[0]
                    ? {
                          sha: commitsR.data[0].sha?.slice(0, 7),
                          date: commitsR.data[0].commit?.author?.date,
                          message: clip(commitsR.data[0].commit?.message, 120),
                      }
                    : null,
            html_url: repoR.data.html_url,
        },
    };
}
