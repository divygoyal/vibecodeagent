/**
 * Server-side client for the admin API's leaderboard routes (/api/lb/*).
 * Never import from client components: it carries the admin key.
 */
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export interface AdminResult<T> {
    ok: boolean;
    status: number;
    data: T | null;
    /** Error text from the admin API (`detail`) when not ok. */
    error: string | null;
}

export interface AdminCallOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: Record<string, string | number | undefined | null>;
    body?: unknown;
    timeoutMs?: number;
    /** Next.js data-cache lifetime in seconds for GET calls from server components. */
    revalidate?: number;
}

export async function lbAdmin<T = unknown>(path: string, opts: AdminCallOptions = {}): Promise<AdminResult<T>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query || {})) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const url = `${ADMIN_API_URL}${path}${qs.toString() ? `?${qs}` : ''}`;
    const method = opts.method || 'GET';
    try {
        const res = await fetch(url, {
            method,
            headers: {
                'X-API-Key': ADMIN_API_KEY,
                ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
            ...(method === 'GET' && opts.revalidate !== undefined
                ? { next: { revalidate: opts.revalidate } }
                : { cache: 'no-store' as const }),
        });
        const text = await res.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (!res.ok) {
            const detail = (data as { detail?: unknown; error?: unknown } | null)?.detail ?? (data as { error?: unknown } | null)?.error;
            return { ok: false, status: res.status, data: null, error: typeof detail === 'string' ? detail : `Admin API returned ${res.status}` };
        }
        return { ok: true, status: res.status, data: data as T, error: null };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'Admin API unreachable' };
    }
}
