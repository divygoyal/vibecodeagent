/**
 * Turn a failed Google call into a clean JSON error response. The routes used to answer 502 with
 * Google's raw body inside `error` (`Google API error 401: {"error":{…}}`), or throw (500, empty body).
 *
 * Body: `{ error: <short code>, message: <one sentence for the UI> }`.
 *   google_reauth        401  revoked / invalid grant / expired token: the owner must reconnect Google
 *   google_timeout       504  Google (or our timeout) did not answer in time
 *   google_rate_limited  502  quota (429)
 *   google_forbidden     502  403: the account has no access to that property / site
 *   google_error         502  anything else
 * With `shared: true` (public share pages, viewers cannot reconnect anything) the answer is 503 for
 * reauth and timeout, with "temporarily unavailable" wording, so the page shows its normal empty state.
 */
export interface GoogleFailure {
    status: number;
    error: 'google_reauth' | 'google_timeout' | 'google_rate_limited' | 'google_forbidden' | 'google_error' | 'google_unavailable';
    message: string;
}

export function describeGoogleError(raw: unknown, opts?: { shared?: boolean }): GoogleFailure {
    const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
    const name = raw instanceof Error ? raw.name : '';
    const code = Number(/Google API error (\d{3})/.exec(text)?.[1] ?? 0);
    const shared = Boolean(opts?.shared);

    if (code === 401 || /invalid_grant|UNAUTHENTICATED|Failed to refresh Google token/i.test(text)) {
        return shared
            ? { status: 503, error: 'google_unavailable', message: 'Analytics data is temporarily unavailable.' }
            : { status: 401, error: 'google_reauth', message: 'Google access expired or was revoked. Reconnect Google.' };
    }
    if (name === 'AbortError' || name === 'TimeoutError' || code === 504 || /timed out/i.test(text)) {
        return { status: shared ? 503 : 504, error: 'google_timeout', message: 'Google took too long to answer. Try again in a moment.' };
    }
    if (code === 429 || /RESOURCE_EXHAUSTED/.test(text)) {
        return { status: shared ? 503 : 502, error: 'google_rate_limited', message: 'Google is limiting requests right now. Try again in a few minutes.' };
    }
    if (code === 403) {
        return { status: 502, error: 'google_forbidden', message: 'Google did not allow access to this data. Check the Google connection.' };
    }
    return { status: 502, error: 'google_error', message: 'Google could not return this data right now. Try again shortly.' };
}

export function googleErrorResponse(raw: unknown, opts?: { shared?: boolean }): Response {
    const { status, error, message } = describeGoogleError(raw, opts);
    return Response.json({ error, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
