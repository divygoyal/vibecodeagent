/**
 * Safely parse a fetch Response as JSON.
 * Returns either { ok: true, data } or { ok: false, error } — never throws.
 *
 * Handles cases where the server (or upstream proxy like Cloudflare) returns
 * an HTML error page like "<!DOCTYPE html>..." which would otherwise crash
 * `await res.json()` with an unhelpful "Unexpected token '<'" error.
 */
export async function safeJson<T = unknown>(
    res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
    const text = await res.text();
    const looksLikeHtml = text.trimStart().startsWith('<');

    if (looksLikeHtml) {
        if (res.status === 502 || res.status === 504 || res.status === 503) {
            return {
                ok: false,
                status: res.status,
                error: 'The server is busy or temporarily unreachable. Please retry in a moment.',
            };
        }
        return {
            ok: false,
            status: res.status,
            error: `Server returned an HTML error page (status ${res.status}).`,
        };
    }

    try {
        const data = JSON.parse(text) as T & { error?: string };
        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                error: data.error || `Request failed (${res.status})`,
            };
        }
        return { ok: true, data: data as T };
    } catch {
        return {
            ok: false,
            status: res.status,
            error: 'Server returned an unexpected response.',
        };
    }
}
