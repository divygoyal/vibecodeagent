/**
 * Owner-watermark signature for the share-overview iframe.
 *
 * The TrafficClaw [logo] strip on top of the iframe-embedded share view is
 * the visible TrafficClaw watermark. We want to suppress it on our own
 * marketing site (the dashboard mockup on the homepage looks cleaner
 * without our own logo above it) but keep it for every customer iframe.
 *
 * Mechanism: the share page reads a `_b=<sig>` query parameter and only
 * suppresses the watermark when sig === HMAC(SHARE_WATERMARK_SECRET, token).
 * The marketing page computes that signature server-side; the embed-code
 * snippet we hand to customers omits the parameter entirely. Customers can
 * read our marketing iframe's URL but the signature is bound to OUR demo
 * token — copying it onto their own share token does nothing.
 *
 * If `SHARE_WATERMARK_SECRET` is unset, sign() returns '' and verify()
 * returns false. The watermark stays visible everywhere — safe fallback.
 */

import crypto from 'node:crypto';

const SECRET = process.env.SHARE_WATERMARK_SECRET || '';
const SIG_LENGTH = 24; // hex chars from a SHA-256 HMAC (96 bits — plenty)

function computeSignature(token: string): string {
    if (!SECRET || !token) return '';
    return crypto
        .createHmac('sha256', SECRET)
        .update(token)
        .digest('hex')
        .slice(0, SIG_LENGTH);
}

export function signShareToken(token: string): string {
    return computeSignature(token);
}

export function verifyShareWatermarkSignature(
    token: string,
    signature: string | undefined | null,
): boolean {
    if (!SECRET || !signature || !token) return false;
    const expected = computeSignature(token);
    if (!expected || expected.length !== signature.length) return false;
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expected, 'hex'),
        );
    } catch {
        return false;
    }
}

/**
 * Append the watermark-suppression signature to a share-iframe URL. The
 * URL already carries the share token in its path; we extract it, sign,
 * and bolt the sig onto the query string. Returns the input URL unchanged
 * if the secret is not configured (no sig to add) or the URL doesn't
 * match the /share/<token>(...) shape.
 */
export function signShareEmbedUrl(url: string): string {
    if (!SECRET) return url;
    const match = url.match(/\/share\/([^/?#]+)/);
    if (!match) return url;
    const sig = computeSignature(match[1]);
    if (!sig) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_b=${sig}`;
}
