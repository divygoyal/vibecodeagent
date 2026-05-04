/**
 * Server-side helpers for the AI-chat persistent-memory layer.
 *
 *   loadUserFacts(userId)               → admin GET /api/chat/facts
 *   loadThreadSummary(userId, threadId) → admin GET /api/chat/threads/{id}/messages (returns summary)
 *   extractFactsFromTurn(...)           → Flash-Lite prompt → admin POST /api/chat/facts
 *   summarizeThread(...)                → Flash-Lite prompt → admin PATCH /api/chat/threads/{id}
 *
 *   B1-full additions:
 *   embedTurn(...)                      → Gemini embeddings → admin POST /api/chat/embeddings
 *   recallSimilarTurns(...)             → embed query → admin POST /api/chat/embeddings/search
 *
 * All helpers are best-effort: failures don't crash the chat. Extraction,
 * summarization and embedding are kicked off AFTER the assistant response
 * has streamed to the user, so they never add to user-visible latency.
 * They just enrich the next turn's context.
 */
import type { GoogleGenAI } from '@google/genai';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

interface AdminFetchOpts {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
}
async function adminFetch(path: string, opts: AdminFetchOpts = {}): Promise<any | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const init: RequestInit = {
            method: opts.method || 'GET',
            headers: {
                'X-API-Key': ADMIN_API_KEY,
                ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        };
        if (opts.body) init.body = JSON.stringify(opts.body);
        const res = await fetch(`${ADMIN_API_URL}${path}`, init);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/* ─────────────────────────────────────────────────────────────────
 * Loaders — called BEFORE main streaming
 * ────────────────────────────────────────────────────────────────── */

export interface UserFact {
    id: number;
    scope: string;
    scope_value: string | null;
    key: string;
    value: string;
    confidence: number;
}

/** Fetch high-confidence durable facts for the current user. */
export async function loadUserFacts(userId: string): Promise<UserFact[]> {
    if (!userId) return [];
    const data = await adminFetch(
        `/api/chat/facts?user_identifier=${encodeURIComponent(userId)}&min_confidence=0.6&limit=30`,
    );
    return Array.isArray(data?.facts) ? data.facts : [];
}

/** Fetch the rolling summary for a specific thread (returns null if no thread or no summary yet). */
export async function loadThreadSummary(userId: string, threadId: string | undefined): Promise<string | null> {
    if (!userId || !threadId) return null;
    const data = await adminFetch(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages?user_identifier=${encodeURIComponent(userId)}&limit=1`,
    );
    return (data?.summary as string | null) ?? null;
}

/** Format facts + summary + recalled turns for inclusion in the system prompt.
 *  Capped lengths so the memory block doesn't dominate the context. */
export function formatMemoryBlock(facts: UserFact[], summary: string | null, recalled?: RecalledHit[] | null): string {
    const parts: string[] = [];
    if (summary && summary.trim()) {
        const trimmed = summary.length > 1500 ? summary.slice(0, 1500) + '…' : summary;
        parts.push(`[CONVERSATION SUMMARY]\n${trimmed}`);
    }
    if (facts.length > 0) {
        const lines = facts
            .filter(f => f.value && f.value.trim())
            .slice(0, 20)
            .map(f => {
                const scopeTag = f.scope === 'global' ? '' : ` (${f.scope}${f.scope_value ? `: ${f.scope_value}` : ''})`;
                return `- ${f.key}${scopeTag}: ${f.value}`;
            });
        if (lines.length > 0) {
            parts.push(`[USER FACTS — durable preferences and context]\n${lines.join('\n')}`);
        }
    }
    if (recalled && recalled.length > 0) {
        const lines = recalled
            .slice(0, 3)
            .map((r, i) => {
                const excerpt = (r.text_excerpt || '').slice(0, 400).replace(/\n+/g, ' ');
                return `(${i + 1}) [score=${r.score}] ${excerpt}`;
            });
        if (lines.length > 0) {
            parts.push(`[RECALL — semantically similar past exchanges; use as context, do not repeat]\n${lines.join('\n')}`);
        }
    }
    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/* ─────────────────────────────────────────────────────────────────
 * Writers — called AFTER assistant message streams (background)
 * ────────────────────────────────────────────────────────────────── */

interface ExtractFactsArgs {
    genai: GoogleGenAI;
    userId: string;
    userMessage: string;
    assistantMessage: string;
    threadId?: string;
}

/**
 * Pull durable facts out of the latest user/assistant turn and POST them to
 * admin. We tell Flash-Lite to be conservative — only emit facts the user
 * explicitly stated as a preference / business detail / past commitment.
 * Anything inferred (vs stated) gets confidence ≤ 0.6 so the loader's
 * 0.6 threshold filters it out by default.
 */
export async function extractFactsFromTurn({ genai, userId, userMessage, assistantMessage, threadId }: ExtractFactsArgs): Promise<number> {
    if (!userId || !userMessage) return 0;
    try {
        const prompt = `Extract durable USER FACTS from this exchange. Output STRICTLY a JSON array of objects with this shape:
[{"key": "short_snake_case_key", "value": "concise human-readable value", "confidence": 0.0-1.0, "scope": "global|site|repo|correction", "scope_value": "site URL or repo or null"}]

EXTRACT only facts that:
- Were EXPLICITLY stated by the user (not inferred from your reply)
- Will still be true a week from now (preferences, business model, KPI focus, past decisions, brand voice)
- Are NOT generic SEO/analytics knowledge

DO NOT extract:
- One-off tactical asks ("show me top keywords" — that's a question, not a fact)
- Things the assistant said
- Numerical metric snapshots ("traffic was 12k" — that's a measurement, not a fact)

Confidence guide:
- 0.9+ : user said it word-for-word ("I optimize for signups, not pageviews")
- 0.7  : strongly implied by phrasing
- ≤0.6 : inferred — usually skip these

If there are no durable facts, output an empty array []. Output JSON ONLY, no commentary.

USER: ${userMessage.slice(0, 2000)}
ASSISTANT: ${assistantMessage.slice(0, 2000)}

JSON:`;

        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0,
                maxOutputTokens: 600,
                httpOptions: { timeout: 12000 },
            },
        });
        const raw = (res?.text || '').trim();
        // Strip ``` fences if the model added them despite the instruction.
        const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        let parsed: any;
        try { parsed = JSON.parse(stripped); } catch { return 0; }
        if (!Array.isArray(parsed)) return 0;

        let written = 0;
        for (const f of parsed.slice(0, 8)) {
            if (!f || typeof f !== 'object') continue;
            const key = String(f.key || '').slice(0, 80).trim();
            const value = String(f.value || '').slice(0, 2000).trim();
            const confidence = typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.7;
            const scope = ['global', 'site', 'repo', 'correction'].includes(f.scope) ? f.scope : 'global';
            const scopeValue = f.scope_value && typeof f.scope_value === 'string' ? f.scope_value.slice(0, 255) : null;
            if (!key || !value) continue;
            // Filter out generic / question-shaped extractions.
            if (value.endsWith('?') || /^(what|why|how|when|where|who)\b/i.test(value)) continue;
            const ok = await adminFetch('/api/chat/facts', {
                method: 'POST',
                body: {
                    user_identifier: userId,
                    scope,
                    scope_value: scopeValue,
                    key,
                    value,
                    confidence,
                    source_thread_id: threadId,
                },
            });
            if (ok) written++;
        }
        return written;
    } catch {
        return 0;
    }
}

/* ─────────────────────────────────────────────────────────────────
 * B1-full: embeddings + semantic recall
 * ────────────────────────────────────────────────────────────────── */

const EMBED_MODEL = 'text-embedding-004';

export interface RecalledHit {
    id: number;
    score: number;
    source_kind: 'turn' | 'fact';
    source_id: string;
    thread_id?: string | null;
    text_excerpt: string | null;
}

/** Generate an embedding vector for a piece of text. Returns null on
 *  any failure — caller should treat embedding as best-effort.
 *  Cap input at 8000 chars (the model accepts more but past that is noise). */
async function embedText(genai: GoogleGenAI, text: string): Promise<number[] | null> {
    if (!text || !text.trim()) return null;
    try {
        const trimmed = text.length > 8000 ? text.slice(0, 8000) : text;
        const res: any = await (genai as any).models.embedContent({
            model: EMBED_MODEL,
            contents: trimmed,
        });
        // The SDK returns either { embeddings: [{ values: number[] }] }
        // or { embedding: { values: number[] } } depending on call shape.
        const vec: number[] | undefined =
            res?.embeddings?.[0]?.values
            ?? res?.embedding?.values
            ?? res?.values;
        if (!Array.isArray(vec) || vec.length === 0) return null;
        return vec;
    } catch {
        return null;
    }
}

interface EmbedTurnArgs {
    genai: GoogleGenAI;
    userId: string;
    threadId: string;
    sourceId: string;        // message id (string) for the assistant turn
    userMessage: string;
    assistantMessage: string;
}

/**
 * Embed a (user → assistant) exchange and POST to admin so it can be
 * recalled later. Concatenates the two messages with a clear separator
 * — the embedding captures the QUESTION + ANSWER together, which is
 * what we want to surface on similar future questions.
 */
export async function embedTurn({ genai, userId, threadId, sourceId, userMessage, assistantMessage }: EmbedTurnArgs): Promise<boolean> {
    if (!userId || !sourceId || !userMessage) return false;
    const text = `Q: ${userMessage}\n\nA: ${assistantMessage}`;
    const vec = await embedText(genai, text);
    if (!vec) return false;
    const ok = await adminFetch('/api/chat/embeddings', {
        method: 'POST',
        body: {
            user_identifier: userId,
            source_kind: 'turn',
            source_id: sourceId,
            thread_id: threadId,
            text_excerpt: text.slice(0, 1500),
            vector: vec,
            model: EMBED_MODEL,
        },
    });
    return !!ok;
}

interface RecallArgs {
    genai: GoogleGenAI;
    userId: string;
    query: string;           // the user's CURRENT message
    topK?: number;
}

/**
 * Embed the current user message and pull top-k similar past turns from
 * admin. Used pre-flight to inject [RECALL] block into context.
 */
export async function recallSimilarTurns({ genai, userId, query, topK = 3 }: RecallArgs): Promise<RecalledHit[]> {
    if (!userId || !query) return [];
    const vec = await embedText(genai, query);
    if (!vec) return [];
    const data = await adminFetch('/api/chat/embeddings/search', {
        method: 'POST',
        body: {
            user_identifier: userId,
            vector: vec,
            top_k: topK,
            source_kinds: ['turn'],
        },
    });
    return Array.isArray(data?.hits) ? (data.hits as RecalledHit[]) : [];
}

interface SummarizeArgs {
    genai: GoogleGenAI;
    userId: string;
    threadId: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    previousSummary?: string | null;
    upToMessageIndex: number;
}

/**
 * Roll older turns into a 200-300 word summary so long conversations don't
 * blow the context window. Triggered every 6 turns by the chat route.
 */
export async function summarizeThread({ genai, userId, threadId, messages, previousSummary, upToMessageIndex }: SummarizeArgs): Promise<boolean> {
    if (!userId || !threadId || messages.length < 4) return false;
    try {
        const transcript = messages
            .slice(0, 30)
            .map(m => `${m.role === 'assistant' ? 'AI' : 'USER'}: ${m.content.slice(0, 1200)}`)
            .join('\n\n');

        const prompt = (previousSummary && previousSummary.trim())
            ? `You maintain a rolling summary of an SEO/analytics chat conversation. Update the summary below by INCORPORATING the new exchange. Keep total length <= 250 words. Preserve facts, decisions, and prior commitments. Drop tactical chitchat.

EXISTING SUMMARY:
${previousSummary.slice(0, 1500)}

NEW EXCHANGES:
${transcript}

UPDATED SUMMARY:`
            : `Summarize this SEO/analytics chat conversation in <=200 words. Capture: (1) what the user is working on / their site, (2) any preferences or KPI focus they stated, (3) major findings the AI delivered, (4) any past commitments. Drop greetings and small talk.

CONVERSATION:
${transcript}

SUMMARY:`;

        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.2,
                maxOutputTokens: 600,
                httpOptions: { timeout: 15000 },
            },
        });
        const summary = String(res?.text || '').trim();
        if (!summary) return false;
        await adminFetch(`/api/chat/threads/${encodeURIComponent(threadId)}?user_identifier=${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            body: { summary, summary_updated_at_msg: upToMessageIndex },
        });
        return true;
    } catch {
        return false;
    }
}
