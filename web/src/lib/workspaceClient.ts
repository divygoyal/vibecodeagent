/**
 * Client-side wrapper for /api/user/workspace PATCH with retry-on-transient.
 *
 * Cloudflare occasionally returns a 502 to the user when the origin container
 * blips (Coolify restart, brief OOM, admin-api hang). Without retry, the user
 * gets "Could not save your workspace" on what's actually a transient infra
 * hiccup. PATCH is idempotent, so retries are safe.
 */

interface PatchOpts {
    /** Maximum number of attempts (initial + retries). Default 3. */
    maxAttempts?: number;
    /** Per-attempt timeout in ms. Default 10s. */
    timeoutMs?: number;
}

export interface PatchWorkspaceResult {
    ok: boolean;
    status: number;
    attempts: number;
    /** Final response object when one was received (may be a non-2xx). */
    response?: Response;
    /** Error message when no response was ever received. */
    error?: string;
}

const RETRIABLE_STATUSES = new Set([502, 503, 504]);

export async function patchWorkspaceWithRetry(
    payload: Record<string, unknown>,
    opts: PatchOpts = {},
): Promise<PatchWorkspaceResult> {
    const { maxAttempts = 3, timeoutMs = 10000 } = opts;
    let lastError: string | undefined;
    let lastResponse: Response | undefined;
    let lastStatus = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetch('/api/user/workspace', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(timeoutMs),
            });
            lastResponse = res;
            lastStatus = res.status;
            if (res.ok) {
                return { ok: true, status: res.status, attempts: attempt + 1, response: res };
            }
            if (!RETRIABLE_STATUSES.has(res.status)) {
                return { ok: false, status: res.status, attempts: attempt + 1, response: res };
            }
            lastError = `HTTP ${res.status}`;
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            lastStatus = 0;
        }

        if (attempt < maxAttempts - 1) {
            await delay(500 * Math.pow(2, attempt));
        }
    }

    return { ok: false, status: lastStatus, attempts: maxAttempts, response: lastResponse, error: lastError };
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
