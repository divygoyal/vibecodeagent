import { canonicalizeDomainInput } from '@/lib/xMentionsShared';

export type PublicMentionsPlatform = 'x' | 'reddit';

type RateLimitEntry = {
    timestamps: number[];
};

type ConsumeRateLimitResult = {
    allowed: boolean;
    retryAfterSeconds: number;
};

export const PUBLIC_MENTIONS_DEMO_DOMAIN = 'trafficclaw.com';

const WINDOW_MS = 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 6;
const rateLimitStore = new Map<string, RateLimitEntry>();

export function isDemoMentionsDomain(domainInput: string) {
    return canonicalizeDomainInput(domainInput) === PUBLIC_MENTIONS_DEMO_DOMAIN;
}

export function getPublicMentionsRequesterIp(headers: Headers) {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) {
            return first;
        }
    }

    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp) {
        return realIp;
    }

    return 'unknown';
}

export function consumePublicMentionsLookup(
    platform: PublicMentionsPlatform,
    ip: string,
): ConsumeRateLimitResult {
    const key = `${platform}:${ip}`;
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const existing = rateLimitStore.get(key);
    const recentTimestamps = (existing?.timestamps || []).filter((timestamp) => timestamp > windowStart);

    if (recentTimestamps.length >= MAX_LOOKUPS_PER_WINDOW) {
        const retryAfterMs = Math.max(recentTimestamps[0] + WINDOW_MS - now, 1000);
        rateLimitStore.set(key, { timestamps: recentTimestamps });
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
    }

    recentTimestamps.push(now);
    rateLimitStore.set(key, { timestamps: recentTimestamps });

    return {
        allowed: true,
        retryAfterSeconds: 0,
    };
}
