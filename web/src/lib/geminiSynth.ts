/**
 * Shared Gemini synthesis helper.
 *
 * Wraps `@google/genai` `generateContent` with structured JSON output
 * (`responseSchema` + `responseMimeType: 'application/json'`), retries,
 * timeouts, fence-stripping, and a defensive JSON-mode fallback.
 *
 * Used by `auditSynth.ts`. Other one-shot synthesis routes (report generation,
 * chart annotations, keyword research) can be migrated to this later — but
 * those are currently stable, so don't refactor them in the same pass.
 */
import { GoogleGenAI } from '@google/genai';

export interface SynthOpts {
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    retries?: number;
    abortSignal?: AbortSignal;
    thinkingBudget?: number;
}

export interface SynthResult<T> {
    data: T | null;
    raw: string;
    error?: string;
    attempts: number;
}

const DEFAULT_MODEL = 'gemini-3-flash-preview';

export async function synthesizeWithSchema<T = unknown>(
    prompt: string,
    responseSchema: object,
    opts: SynthOpts = {},
): Promise<SynthResult<T>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { data: null, raw: '', error: 'no_api_key', attempts: 0 };
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxOutputTokens = 8192,
        timeoutMs = 25000,
        retries = 2,
        abortSignal,
        thinkingBudget,
    } = opts;

    const ai = new GoogleGenAI({ apiKey });
    let lastErr: string | undefined;
    let lastRaw = '';

    const baseConfig: Record<string, unknown> = {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema,
        httpOptions: { timeout: timeoutMs },
    };
    if (thinkingBudget !== undefined) {
        baseConfig.thinkingConfig = { thinkingBudget };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (abortSignal?.aborted) return { data: null, raw: lastRaw, error: 'aborted', attempts: attempt };
        try {
            const res = await ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: baseConfig as Record<string, unknown>,
            } as Parameters<typeof ai.models.generateContent>[0]);

            const raw = stripFences(((res as { text?: string })?.text ?? '').trim());
            lastRaw = raw;
            if (!raw) {
                lastErr = 'empty_response';
                await backoff(attempt);
                continue;
            }
            try {
                const data = JSON.parse(raw) as T;
                return { data, raw, attempts: attempt + 1 };
            } catch (parseErr) {
                lastErr = `parse_error: ${String(parseErr)}`;
                if (attempt === retries) {
                    // Final attempt — try JSON-mode without responseSchema as defence-in-depth
                    const fallback = await jsonModeFallback<T>(ai, prompt, model, temperature, maxOutputTokens, timeoutMs, abortSignal);
                    if (fallback.data) return { ...fallback, attempts: attempt + 2 };
                }
                await backoff(attempt);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            lastErr = msg;
            if (!isRetryable(msg) || attempt === retries) {
                return { data: null, raw: lastRaw, error: lastErr, attempts: attempt + 1 };
            }
            await backoff(attempt);
        }
    }

    return { data: null, raw: lastRaw, error: lastErr ?? 'unknown', attempts: retries + 1 };
}

async function jsonModeFallback<T>(
    ai: GoogleGenAI,
    prompt: string,
    model: string,
    temperature: number,
    maxOutputTokens: number,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<SynthResult<T>> {
    if (abortSignal?.aborted) return { data: null, raw: '', error: 'aborted', attempts: 0 };
    try {
        const res = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nIMPORTANT: respond with valid JSON only. No prose, no markdown fences.` }] }],
            config: {
                temperature,
                maxOutputTokens,
                responseMimeType: 'application/json',
                httpOptions: { timeout: timeoutMs },
            } as Record<string, unknown>,
        } as Parameters<typeof ai.models.generateContent>[0]);
        const raw = stripFences(((res as { text?: string })?.text ?? '').trim());
        if (!raw) return { data: null, raw, error: 'fallback_empty', attempts: 1 };
        try {
            const data = JSON.parse(raw) as T;
            return { data, raw, attempts: 1 };
        } catch (parseErr) {
            return { data: null, raw, error: `fallback_parse: ${String(parseErr)}`, attempts: 1 };
        }
    } catch (err) {
        return { data: null, raw: '', error: `fallback_err: ${err instanceof Error ? err.message : String(err)}`, attempts: 1 };
    }
}

function stripFences(s: string): string {
    if (s.startsWith('```')) {
        return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    return s;
}

function isRetryable(msg: string): boolean {
    return /(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|fetch failed|network error)/i.test(msg);
}

function backoff(attempt: number): Promise<void> {
    const delay = 500 * Math.pow(2, attempt);
    return new Promise(resolve => setTimeout(resolve, delay));
}
