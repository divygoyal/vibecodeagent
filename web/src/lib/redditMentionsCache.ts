import 'server-only';

import { Redis } from '@upstash/redis';

let redisClient: Redis | null | undefined;

function getRedisClient() {
    if (redisClient !== undefined) {
        return redisClient;
    }

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        redisClient = null;
        return redisClient;
    }

    redisClient = new Redis({ url, token });
    return redisClient;
}

export function isRedditMentionsRedisEnabled() {
    return getRedisClient() !== null;
}

export async function getRedditMentionsCache<T = unknown>(key: string) {
    const redis = getRedisClient();
    if (!redis) {
        return null;
    }

    try {
        return await redis.get<T>(key);
    } catch (error) {
        console.error('[reddit-cache] Failed to read Redis cache', { key, error });
        return null;
    }
}

export async function setRedditMentionsCache<T>(
    key: string,
    value: T,
    ttlSeconds: number,
) {
    const redis = getRedisClient();
    if (!redis) {
        return false;
    }

    try {
        await redis.set(key, value, { ex: ttlSeconds });
        return true;
    } catch (error) {
        console.error('[reddit-cache] Failed to write Redis cache', { key, error });
        return false;
    }
}

export async function tryAcquireRedditMentionsLock(key: string, ttlSeconds: number) {
    const redis = getRedisClient();
    if (!redis) {
        return false;
    }

    try {
        const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
        return result === 'OK';
    } catch (error) {
        console.error('[reddit-cache] Failed to acquire Redis lock', { key, error });
        return false;
    }
}

export async function releaseRedditMentionsLock(key: string) {
    const redis = getRedisClient();
    if (!redis) {
        return;
    }

    try {
        await redis.del(key);
    } catch (error) {
        console.error('[reddit-cache] Failed to release Redis lock', { key, error });
    }
}
