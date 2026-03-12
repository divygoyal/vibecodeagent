/**
 * Safe redirect URL builder for payment checkout flows.
 * Validates window.location.origin against allowed domains to prevent
 * open redirect attacks after payment completion.
 */

const ALLOWED_ORIGINS = new Set([
    'https://trafficclaw.com',
    'https://www.trafficclaw.com',
    'http://localhost:3000',
]);

const FALLBACK_ORIGIN = 'https://trafficclaw.com';

export function getSafeRedirectUrl(path: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!ALLOWED_ORIGINS.has(origin)) {
        return `${FALLBACK_ORIGIN}${path}`;
    }
    return `${origin}${path}`;
}
