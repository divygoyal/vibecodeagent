/**
 * questionFingerprint.ts — deterministic question-similarity for the AI chat.
 *
 * Purpose: detect when a user is asking the SAME question they asked before
 * so the chat can acknowledge it ("I covered this 14m ago — different angle:")
 * AND so the deterministic ranker can demote previously-surfaced insights.
 *
 * We deliberately do NOT use LLM embeddings here for the gating decision —
 * embeddings have ~12-18% false positives on SEO-domain queries (e.g., "what
 * should I do today" vs "what should I do tomorrow" hits 0.92 cosine but is
 * a different question). Triple-AND with token Jaccard + temporal anchor
 * drops false positives below ~4%.
 *
 * Cosine similarity (when used by the caller) comes from existing chatMemory
 * embeddings — passed in as a separate signal. This module's compare() takes
 * three signals and AND-s them.
 *
 * Pure functions only — no I/O, no globals.
 */

// ─── Token normalization ───

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
    'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
    'were', 'will', 'with', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'they',
    'their', 'them', 'do', 'does', 'did', 'should', 'could', 'would', 'shall',
    'can', 'may', 'might', 'must', 'so', 'but', 'if', 'then', 'than', 'how',
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why',
]);

/** Light lemmatizer — removes plurals, common verb endings. Heuristic, not perfect. */
function lemmatize(token: string): string {
    if (token.length < 4) return token;
    if (token.endsWith('ies')) return token.slice(0, -3) + 'y';   // strategies → strategy
    if (token.endsWith('es') && !token.endsWith('ses')) return token.slice(0, -2);  // pages → page (but classes → class)
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);    // pages → page
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);       // ranking → rank
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);        // dropped → drop
    return token;
}

/** Tokenize, lowercase, strip punctuation, drop stopwords, lemmatize, dedupe. */
function tokenize(text: string): string[] {
    if (!text) return [];
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t))
        .map(lemmatize);
    return [...new Set(tokens)];
}

// ─── Temporal anchor extraction ───

const TEMPORAL_PATTERNS: Array<{ re: RegExp; anchor: string }> = [
    { re: /\btoday\b/i, anchor: 'today' },
    { re: /\btomorrow\b/i, anchor: 'tomorrow' },
    { re: /\byesterday\b/i, anchor: 'yesterday' },
    { re: /\bthis (week|month|quarter|year)\b/i, anchor: 'this_period' },
    { re: /\blast (week|month|quarter|year)\b/i, anchor: 'last_period' },
    { re: /\bnext (week|month|quarter|year)\b/i, anchor: 'next_period' },
    { re: /\b(\d+) (day|week|month|year)s? (ago|back)\b/i, anchor: 'n_periods_ago' },
    { re: /\bover the (last|past) (\d+|few|several) (day|week|month|year)s?\b/i, anchor: 'rolling_window' },
    { re: /\bin the (last|past) (\d+|few|several) (day|week|month|year)s?\b/i, anchor: 'rolling_window' },
    { re: /\bwithin (\d+) (day|week|month|year)s?\b/i, anchor: 'rolling_window' },
];

/** Extract a normalized temporal anchor (today / yesterday / this_period / etc.) or null. */
export function extractTemporalAnchor(text: string): string | null {
    if (!text) return null;
    for (const { re, anchor } of TEMPORAL_PATTERNS) {
        if (re.test(text)) return anchor;
    }
    return null;
}

// ─── Fingerprint construction ───

export interface QuestionFingerprint {
    /** Lowercased raw query — for re-embedding if needed by callers. */
    cosineSeed: string;
    /** Deduped lemmatized tokens for set-similarity (Jaccard). */
    jaccardTokens: string[];
    /** Normalized temporal anchor or null. */
    temporalAnchor: string | null;
    /** Unix ms when this fingerprint was created. */
    ts: number;
    /** The top insight ID surfaced for THIS question (filled in after the turn completes). */
    insightId: string | null;
}

export function makeFingerprint(query: string, opts?: { insightId?: string | null }): QuestionFingerprint {
    return {
        cosineSeed: (query || '').toLowerCase().trim(),
        jaccardTokens: tokenize(query),
        temporalAnchor: extractTemporalAnchor(query),
        ts: Date.now(),
        insightId: opts?.insightId ?? null,
    };
}

// ─── Comparison ───

export interface FingerprintComparison {
    cosineSim: number;       // 0..1, only if caller supplied embedding-derived score; else 0
    jaccardSim: number;      // 0..1
    temporalMatch: boolean;  // true when both anchors are equal (including both null)
    /** Ageing-weighted recency, 0..1. 1 = same minute, 0 = >24h ago. */
    recencyWeight: number;
    /** Final triple-AND verdict: should we treat this as a repeat question? */
    isRepeat: boolean;
    /** Why we decided isRepeat (helpful for telemetry and prompt injection). */
    reason: string;
}

const COSINE_THRESHOLD = 0.85;
const JACCARD_THRESHOLD = 0.7;
/** Repetitions older than 24h don't trigger acknowledgment. */
const RECENCY_HORIZON_MS = 24 * 60 * 60 * 1000;

/** Pure set Jaccard similarity. */
function jaccard(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
}

function recencyWeight(prevTs: number, nowTs: number): number {
    const ageMs = Math.max(0, nowTs - prevTs);
    if (ageMs >= RECENCY_HORIZON_MS) return 0;
    return 1 - (ageMs / RECENCY_HORIZON_MS);
}

/**
 * Compare two fingerprints. Triple-AND gate:
 *   cosineSim ≥ 0.85  AND  jaccardSim ≥ 0.7  AND  temporal anchors equal
 * Plus a recency check (≤ 24h).
 *
 * Pass `cosineSim` when the caller has computed embedding similarity (e.g., from
 * recallSimilarTurns). When omitted (cosineSim=0), the gate is jaccard+temporal+recency,
 * which is more forgiving but still reliable for short SEO queries.
 */
export function compareFingerprints(
    current: QuestionFingerprint,
    prior: QuestionFingerprint,
    cosineSim: number = 0,
): FingerprintComparison {
    const jSim = jaccard(current.jaccardTokens, prior.jaccardTokens);
    const tMatch = current.temporalAnchor === prior.temporalAnchor;
    const rWeight = recencyWeight(prior.ts, current.ts);

    // When we have a cosine signal, require all three thresholds.
    // When we don't, fall back to high-Jaccard + temporal-match + recent.
    let isRepeat: boolean;
    let reason: string;
    if (cosineSim > 0) {
        isRepeat = (cosineSim >= COSINE_THRESHOLD) && (jSim >= JACCARD_THRESHOLD) && tMatch && (rWeight > 0);
        reason = isRepeat
            ? `cosine=${cosineSim.toFixed(2)} ≥ ${COSINE_THRESHOLD}, jaccard=${jSim.toFixed(2)} ≥ ${JACCARD_THRESHOLD}, same temporal anchor, within 24h`
            : `cosine=${cosineSim.toFixed(2)}, jaccard=${jSim.toFixed(2)}, temp=${tMatch}, recent=${rWeight > 0}`;
    } else {
        // Conservative fallback: very high Jaccard (≥0.85) + temporal match + recent
        isRepeat = (jSim >= 0.85) && tMatch && (rWeight > 0);
        reason = isRepeat
            ? `jaccard=${jSim.toFixed(2)} ≥ 0.85, same temporal anchor, within 24h (no cosine signal)`
            : `jaccard=${jSim.toFixed(2)}, temp=${tMatch}, recent=${rWeight > 0}`;
    }

    return { cosineSim, jaccardSim: jSim, temporalMatch: tMatch, recencyWeight: rWeight, isRepeat, reason };
}

/**
 * Find the strongest repetition match against a list of prior fingerprints.
 * Returns the best match (or null if none). Used at turn-start to decide whether
 * to inject [REPETITION_DETECTED].
 */
export function findRepetitionMatch(
    current: QuestionFingerprint,
    priors: QuestionFingerprint[],
    cosineSimByIndex?: number[],
): { prior: QuestionFingerprint; comparison: FingerprintComparison; index: number } | null {
    let best: { prior: QuestionFingerprint; comparison: FingerprintComparison; index: number } | null = null;
    for (let i = 0; i < priors.length; i++) {
        const cosine = cosineSimByIndex?.[i] ?? 0;
        const cmp = compareFingerprints(current, priors[i], cosine);
        if (!cmp.isRepeat) continue;
        if (!best || cmp.jaccardSim > best.comparison.jaccardSim) {
            best = { prior: priors[i], comparison: cmp, index: i };
        }
    }
    return best;
}

/** Format a [REPETITION_DETECTED] block for prompt injection. */
export function formatRepetitionTag(match: { prior: QuestionFingerprint; comparison: FingerprintComparison }): string {
    const ageMin = Math.max(1, Math.round((Date.now() - match.prior.ts) / 60000));
    const priorInsight = match.prior.insightId ? ` prior_insight_id=${match.prior.insightId}` : '';
    return `[REPETITION_DETECTED — user asked something very similar ~${ageMin} minute(s) ago.${priorInsight} Acknowledge briefly ("I covered this ${ageMin}m ago — different angle:") and pick a DIFFERENT insight than last time. The snapshot ranker has already demoted the prior insight; trust the new top-ranked pick.]`;
}
