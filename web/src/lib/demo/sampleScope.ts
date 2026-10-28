/**
 * A scoped Google transport for server code that renders sample data (the home page's live product-tour rows).
 *
 * Inside `runWithSampleGoogle(fn)`, the app's own report code (api/site/_lib/google.ts, lib/googleApi.ts gaFetch,
 * hence ga4Summary, gscSummary, buildActions and the dashboard engine) talks to the demo generator through
 * `sampleGoogleFetch` instead of the network, and lib/apiCache files its entries in the small demo bucket without
 * reading request headers (so a static or ISR page stays static). Outside the scope nothing changes: `scopedFetch()`
 * is the global fetch.
 *
 * The scope is an AsyncLocalStorage, so concurrent requests never see each other's transport. Server only.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

type FetchLike = typeof fetch;

const scope = new AsyncLocalStorage<FetchLike>();

/** The fetch for a Google call: the sample transport inside runWithSampleGoogle, else the global fetch (read at call time). */
export function scopedFetch(): FetchLike {
    return scope.getStore() ?? globalThis.fetch;
}

/** True inside runWithSampleGoogle. */
export function inSampleScope(): boolean {
    return scope.getStore() !== undefined;
}

/** Runs `fn` with every scoped Google call answered by `transport` (normally lib/demo/fetchShim sampleGoogleFetch). */
export function runWithSampleGoogle<T>(transport: FetchLike, fn: () => Promise<T>): Promise<T> {
    return scope.run(transport, fn);
}
