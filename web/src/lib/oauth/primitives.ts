/**
 * Pure OAuth 2.1 helpers for the MCP authorization server: random tokens and
 * hashes, PKCE (S256 only), redirect-URI rules (MCP.md 4.3), resource
 * normalisation (RFC 8707, MCP.md 4.1) and scope parsing.
 *
 * No Next.js or network imports, so tests can load this file directly.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(prefix: string, bytes = 32): string {
    return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}

export function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ───────────── PKCE (RFC 7636) ─────────────

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeChallenge(challenge: string | null | undefined): boolean {
    return typeof challenge === 'string' && CHALLENGE_RE.test(challenge);
}

export function s256(verifier: string): string {
    return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
    if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
    return safeEqual(s256(verifier), challenge);
}

// ───────────── redirect URIs (MCP.md 4.3) ─────────────

export type RedirectKind = 'https' | 'loopback' | 'custom';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const KNOWN_APP_SCHEMES = new Set(['cursor', 'vscode', 'vscode-insiders', 'windsurf', 'zed', 'claude']);
const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'file', 'blob', 'ftp', 'about', 'vbscript', 'ws', 'wss', 'mailto', 'tel', 'chrome', 'view-source']);

export function classifyRedirectUri(uri: unknown): { ok: true; kind: RedirectKind; host: string } | { ok: false; reason: string } {
    if (typeof uri !== 'string' || uri.length === 0 || uri.length > 2000) return { ok: false, reason: 'redirect_uri must be a string under 2000 characters' };
    if (uri.includes('#')) return { ok: false, reason: 'redirect_uri must not contain a fragment' };
    if (uri.includes('*')) return { ok: false, reason: 'wildcards are not allowed in redirect_uri' };
    let url: URL;
    try {
        url = new URL(uri);
    } catch {
        return { ok: false, reason: 'redirect_uri is not an absolute URL' };
    }
    if (url.username || url.password) return { ok: false, reason: 'redirect_uri must not contain user info' };
    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    if (scheme === 'https') {
        if (!url.hostname) return { ok: false, reason: 'redirect_uri needs a host' };
        return { ok: true, kind: 'https', host: url.host.toLowerCase() };
    }
    if (scheme === 'http') {
        if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return { ok: true, kind: 'loopback', host: url.hostname.toLowerCase() };
        return { ok: false, reason: 'http redirect_uri is only allowed for loopback (127.0.0.1, [::1], localhost)' };
    }
    if (BLOCKED_SCHEMES.has(scheme)) return { ok: false, reason: `scheme ${scheme}: is not allowed` };
    if (KNOWN_APP_SCHEMES.has(scheme) || /[.-]/.test(scheme)) return { ok: true, kind: 'custom', host: `${scheme}://` };
    return { ok: false, reason: 'custom schemes must be an app scheme (for example cursor:// or com.example.app://)' };
}

/**
 * Exact match, except loopback redirects where the port is ignored
 * (RFC 8252 7.3: native apps pick a free port at runtime).
 */
export function matchRedirectUri(registered: readonly string[], presented: string): boolean {
    if (registered.includes(presented)) return true;
    const p = classifyRedirectUri(presented);
    if (!p.ok || p.kind !== 'loopback') return false;
    let pu: URL;
    try {
        pu = new URL(presented);
    } catch {
        return false;
    }
    return registered.some((r) => {
        const rc = classifyRedirectUri(r);
        if (!rc.ok || rc.kind !== 'loopback') return false;
        const ru = new URL(r);
        return ru.protocol === pu.protocol
            && ru.hostname.toLowerCase() === pu.hostname.toLowerCase()
            && ru.pathname === pu.pathname
            && ru.search === pu.search;
    });
}

export function redirectHostLabel(uri: string): string {
    const c = classifyRedirectUri(uri);
    return c.ok ? c.host : 'unknown';
}

// ───────────── resource indicators (RFC 8707) ─────────────

/**
 * Normalise a client-supplied `resource` to the canonical resource URL.
 * Returns the canonical value, or null when it names another resource.
 * A missing resource is tolerated (some clients omit it) and defaults to canonical.
 */
export function normalizeResource(value: string | null | undefined, canonical: string): string | null {
    if (value === null || value === undefined || value === '') return canonical;
    if (value.includes('#')) return null;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    const canon = new URL(canonical);
    if (url.username || url.password || url.search) return null;
    if (url.protocol !== canon.protocol) return null;
    const bareCanon = canon.host.replace(/^www\./, '').toLowerCase();
    const bareGiven = url.host.replace(/^www\./, '').toLowerCase();
    if (bareGiven !== bareCanon) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (path !== '' && path !== '/mcp') return null;
    return canonical;
}

// ───────────── scopes ─────────────

export function parseScope(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return Array.from(new Set(raw.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
}

/** Requested scopes must be a subset of supported. Empty request means mcp:read. */
export function resolveScopes(raw: string | null | undefined, supported: readonly string[], fallback: string): { ok: true; scopes: string[] } | { ok: false; invalid: string[] } {
    const requested = parseScope(raw);
    if (requested.length === 0) return { ok: true, scopes: [fallback] };
    const invalid = requested.filter((s) => !supported.includes(s));
    if (invalid.length) return { ok: false, invalid };
    const scopes = requested.includes(fallback) ? requested : [fallback, ...requested];
    return { ok: true, scopes };
}
