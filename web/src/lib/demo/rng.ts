/**
 * Seeded randomness for the demo data generator. Everything is a pure
 * function of its inputs: the same seed parts always give the same number,
 * so screenshots and tests are stable within a day.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A PRNG seeded from any list of parts. */
export function rngFor(...parts: Array<string | number>): () => number {
    return mulberry32(hashString(parts.join('|')));
}

/** A single uniform float in [0, 1) derived from the parts. */
export function unit(...parts: Array<string | number>): number {
    // One extra mixing round so nearby inputs do not give nearby outputs.
    return mulberry32(hashString(parts.join('|')))();
}

/**
 * Multiplicative noise centred on 1. `spread` 0.1 gives roughly ±10 %.
 * Uses the sum of two uniforms (triangular) so extremes are rare.
 */
export function noise(spread: number, ...parts: Array<string | number>): number {
    const r = mulberry32(hashString(parts.join('|')));
    const tri = r() + r() - 1; // [-1, 1], peaked at 0
    return Math.max(0, 1 + tri * spread);
}

/** Fast integer mix of two numbers (murmur3 finaliser). For hot loops. */
export function mix32(a: number, b: number): number {
    let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/** Fast multiplicative noise from two integer seeds (see noise()). */
export function fastNoise(spread: number, a: number, b: number): number {
    const u1 = mix32(a, b) / 4294967296;
    const u2 = mix32(a ^ 0x5bd1e995, b + 7919) / 4294967296;
    return Math.max(0, 1 + (u1 + u2 - 1) * spread);
}

/** Pick an item from a list deterministically. */
export function pick<T>(items: readonly T[], ...parts: Array<string | number>): T {
    return items[Math.floor(unit(...parts) * items.length) % items.length];
}

/** Zipf-like weights for n ranked items, normalised to sum to 1. */
export function zipfWeights(n: number, exponent = 1.05, seed?: string): number[] {
    const raw: number[] = [];
    for (let i = 0; i < n; i++) {
        const jitter = seed ? 0.75 + 0.5 * unit(seed, i) : 1;
        raw.push(jitter / Math.pow(i + 1, exponent));
    }
    const sum = raw.reduce((s, v) => s + v, 0) || 1;
    return raw.map(v => v / sum);
}

/** Normalise a list of weights so they sum to 1. */
export function normalise(weights: number[]): number[] {
    const sum = weights.reduce((s, v) => s + v, 0) || 1;
    return weights.map(v => v / sum);
}
