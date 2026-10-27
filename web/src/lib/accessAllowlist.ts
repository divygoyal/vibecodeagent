/**
 * Optional sign-in allowlist for private previews (env TC_ALLOWED_EMAILS,
 * comma-separated, case-insensitive). Unset or empty: everyone may sign in,
 * exactly as before. Read by the NextAuth signIn callback (lib/auth.ts).
 */

/** Page shown to a sign-in that is not on the list. */
export const PREVIEW_PRIVATE_PATH = '/preview-private';

export function parseAllowedEmails(raw: string | undefined | null): Set<string> | null {
    const list = (raw ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return list.length ? new Set(list) : null;
}

/** True when sign-in is allowed: no allowlist, or a (verified) email on it. */
export function isEmailAllowed(email: string | null | undefined, allowed: Set<string> | null, opts: { verified?: boolean } = {}): boolean {
    if (!allowed) return true;
    if (!email || opts.verified === false) return false;
    return allowed.has(email.trim().toLowerCase());
}
