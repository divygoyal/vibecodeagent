/**
 * Process-wide singletons. Next.js can load a module once per route bundle,
 * so state that several routes must see (token cache evictions, rate
 * windows, client caches) hangs off globalThis.
 */
export function shared<T>(key: string, init: () => T): T {
    const g = globalThis as unknown as Record<string, unknown>;
    const k = `__trafficclaw_mcp_${key}`;
    if (!(k in g)) g[k] = init();
    return g[k] as T;
}
