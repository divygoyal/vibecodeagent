/**
 * chatThreadState.ts — per-thread runtime state for anti-repetition.
 *
 * The deterministic re-ranker reads `surfacedInsightIds` and demotes
 * matching items so the next turn's top-ranked insight is genuinely fresh.
 * The LLM never decides what to skip — the ranker does.
 *
 * Writes happen synchronously before the SSE [DONE] frame so a fast
 * follow-up turn (faster than the post-DONE fire-and-forget memory writes)
 * still sees the prior turn's state.
 *
 * Failure mode: every read/write is best-effort. If admin is unreachable,
 * we return empty state and proceed — the chat still works, just without
 * cross-turn awareness.
 */

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export interface QuestionFingerprint {
    cosineSeed: string;       // raw lowercased query (for re-embedding if needed)
    jaccardTokens: string[];  // deduped lemmatized tokens for set-similarity
    temporalAnchor: string | null;  // 'today' | 'yesterday' | 'this_week' | etc., or null
    ts: number;               // Unix ms when stored
    insightId: string | null; // top-ranked insight that was surfaced for this question
}

export interface ChatThreadState {
    threadId: string;
    surfacedInsightIds: string[];           // last ~25 insight IDs already shown
    surfacedSuggestionQuestions: string[];  // last ~30 suggestion-chip texts already emitted
    surfacedSurprises: string[];            // surprise-category insight IDs already revealed
    lastQuestionFingerprints: QuestionFingerprint[];  // last ~10 question fingerprints
    lastUpdated: string | null;
}

const EMPTY_STATE = (threadId: string): ChatThreadState => ({
    threadId,
    surfacedInsightIds: [],
    surfacedSuggestionQuestions: [],
    surfacedSurprises: [],
    lastQuestionFingerprints: [],
    lastUpdated: null,
});

/** Best-effort load. Returns empty state on any error. */
export async function loadThreadState(userId: string, threadId: string): Promise<ChatThreadState> {
    if (!ADMIN_API_KEY || !threadId || !userId) return EMPTY_STATE(threadId);
    try {
        const url = `${ADMIN_API_URL}/api/chat/thread-state?user_identifier=${encodeURIComponent(userId)}&thread_id=${encodeURIComponent(threadId)}`;
        const res = await fetch(url, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
            signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) return EMPTY_STATE(threadId);
        const data = await res.json();
        return {
            threadId: data.thread_id || threadId,
            surfacedInsightIds: Array.isArray(data.surfaced_insight_ids) ? data.surfaced_insight_ids : [],
            surfacedSuggestionQuestions: Array.isArray(data.surfaced_suggestion_questions) ? data.surfaced_suggestion_questions : [],
            surfacedSurprises: Array.isArray(data.surfaced_surprises) ? data.surfaced_surprises : [],
            lastQuestionFingerprints: Array.isArray(data.last_question_fingerprints) ? data.last_question_fingerprints : [],
            lastUpdated: data.last_updated || null,
        };
    } catch {
        return EMPTY_STATE(threadId);
    }
}

interface SaveArgs {
    userId: string;
    threadId: string;
    /** Append this turn's insight IDs to the surfaced list (will dedupe + cap server-side). */
    addSurfacedInsightIds?: string[];
    /** Append this turn's suggestion texts to the dedup list. */
    addSurfacedSuggestions?: string[];
    /** Append this turn's surprise IDs (insights with category 'cross_source_surprise'). */
    addSurfacedSurprises?: string[];
    /** Append this turn's question fingerprint. */
    addQuestionFingerprint?: QuestionFingerprint;
    /** Prior state — used to compute the merged lists locally. Pass loadThreadState() result. */
    prior: ChatThreadState;
}

const MAX_INSIGHT_IDS = 25;
const MAX_SUGGESTIONS = 30;
const MAX_SURPRISES = 25;
const MAX_FINGERPRINTS = 10;

/** Best-effort save. Returns true on success. Synchronous w.r.t. caller — must be
 *  awaited before [DONE] so the next turn sees this state. */
export async function saveThreadState(args: SaveArgs): Promise<boolean> {
    const { userId, threadId, prior } = args;
    if (!ADMIN_API_KEY || !threadId || !userId) return false;

    // Merge — newest-first, deduped, capped
    const mergedInsightIds = [
        ...(args.addSurfacedInsightIds || []),
        ...prior.surfacedInsightIds,
    ];
    const dedupedInsightIds = [...new Set(mergedInsightIds)].slice(0, MAX_INSIGHT_IDS);

    const mergedSuggestions = [
        ...(args.addSurfacedSuggestions || []),
        ...prior.surfacedSuggestionQuestions,
    ];
    const dedupedSuggestions = [...new Set(mergedSuggestions.map(s => s.trim().toLowerCase()))].slice(0, MAX_SUGGESTIONS);

    const mergedSurprises = [
        ...(args.addSurfacedSurprises || []),
        ...prior.surfacedSurprises,
    ];
    const dedupedSurprises = [...new Set(mergedSurprises)].slice(0, MAX_SURPRISES);

    const mergedFingerprints = [
        ...(args.addQuestionFingerprint ? [args.addQuestionFingerprint] : []),
        ...prior.lastQuestionFingerprints,
    ].slice(0, MAX_FINGERPRINTS);

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/chat/thread-state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                user_identifier: userId,
                thread_id: threadId,
                surfaced_insight_ids: dedupedInsightIds,
                surfaced_suggestion_questions: dedupedSuggestions,
                surfaced_surprises: dedupedSurprises,
                last_question_fingerprints: mergedFingerprints,
            }),
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Compute a normalized format suitable for [SURFACED_RECENTLY] block injection. */
export function formatThreadStateForPrompt(state: ChatThreadState): string {
    if (!state || (state.surfacedInsightIds.length === 0 && state.surfacedSuggestionQuestions.length === 0)) {
        return '';
    }
    const lines: string[] = [];
    lines.push('[SURFACED_RECENTLY — already shown earlier in this thread; pick a DIFFERENT angle]');
    if (state.surfacedInsightIds.length > 0) {
        lines.push(`  insight_ids_already_shown: ${state.surfacedInsightIds.slice(0, 8).join(', ')}`);
    }
    if (state.surfacedSuggestionQuestions.length > 0) {
        lines.push(`  suggestions_already_emitted (DO NOT repeat or near-paraphrase):`);
        state.surfacedSuggestionQuestions.slice(0, 8).forEach(q => {
            lines.push(`    - "${q}"`);
        });
    }
    return lines.join('\n');
}
