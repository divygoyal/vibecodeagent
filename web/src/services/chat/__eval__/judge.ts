/**
 * Gemini-as-judge for chat evaluation scenarios.
 *
 * Takes an EvalScenario rubric and a candidate answer, calls
 * `gemini-3-flash-preview` with a structured-JSON response schema, and
 * returns yes/no/uncertain verdicts on each must / must_not item.
 *
 * The judge is intentionally separate from `synthesizeWithSchema` because
 * the chat eval lives in `__eval__` (test code) and we want it to keep
 * working even if the chat layer's shared helpers change.
 */
import { GoogleGenAI } from '@google/genai';
import type { EvalScenario } from './scenarios';

export interface JudgeItemVerdict {
    item: string;
    verdict: 'pass' | 'fail' | 'uncertain';
    reason: string;
}

export interface JudgeResult {
    pass: boolean;
    must: JudgeItemVerdict[];
    must_not: JudgeItemVerdict[];
    nice_to_have: JudgeItemVerdict[];
    notes: string;
}

const JUDGE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        must: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    item: { type: 'STRING' },
                    verdict: { type: 'STRING', enum: ['pass', 'fail', 'uncertain'] },
                    reason: { type: 'STRING' },
                },
                required: ['item', 'verdict', 'reason'],
            },
        },
        must_not: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    item: { type: 'STRING' },
                    verdict: { type: 'STRING', enum: ['pass', 'fail', 'uncertain'] },
                    reason: { type: 'STRING' },
                },
                required: ['item', 'verdict', 'reason'],
            },
        },
        nice_to_have: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    item: { type: 'STRING' },
                    verdict: { type: 'STRING', enum: ['pass', 'fail', 'uncertain'] },
                    reason: { type: 'STRING' },
                },
                required: ['item', 'verdict', 'reason'],
            },
        },
        notes: { type: 'STRING' },
    },
    required: ['must', 'must_not', 'nice_to_have', 'notes'],
} as const;

export async function judgeAnswer(scenario: EvalScenario, answer: string): Promise<JudgeResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not set');
    }
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a strict QA judge for an SEO/analytics AI assistant. Grade the assistant's answer against the rubric.

USER MESSAGE:
${scenario.userMessage}

ASSISTANT ANSWER:
${answer.slice(0, 8000)}

RUBRIC — MUST (every item must be satisfied for the answer to pass):
${scenario.rubric.must.map((m, i) => `${i + 1}. ${m}`).join('\n')}

RUBRIC — MUST_NOT (none of these may be present in the answer):
${scenario.rubric.must_not.map((m, i) => `${i + 1}. ${m}`).join('\n')}

${scenario.rubric.nice_to_have && scenario.rubric.nice_to_have.length > 0 ? `
RUBRIC — NICE_TO_HAVE (informational; doesn't affect pass/fail):
${scenario.rubric.nice_to_have.map((m, i) => `${i + 1}. ${m}`).join('\n')}
` : ''}

For EACH item, return a verdict:
- "pass" — the item is satisfied (for must) or absent (for must_not)
- "fail" — the item is missing (for must) or present (for must_not)
- "uncertain" — you genuinely can't tell from the answer text alone

For each verdict, give a 1-sentence reason quoting or referencing the relevant part of the answer.

In notes, write a one-line overall diagnosis (≤180 chars).

Be STRICT. If the answer is borderline, return "fail" or "uncertain" — do not give the benefit of the doubt.

Output JSON ONLY matching the schema. No commentary.`;

    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseSchema: JUDGE_SCHEMA as object,
            httpOptions: { timeout: 25000 },
        } as Record<string, unknown>,
    } as Parameters<typeof ai.models.generateContent>[0]);

    const raw = ((res as { text?: string })?.text ?? '').trim();
    if (!raw) throw new Error('judge returned empty response');
    let parsed: {
        must?: JudgeItemVerdict[];
        must_not?: JudgeItemVerdict[];
        nice_to_have?: JudgeItemVerdict[];
        notes?: string;
    };
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`judge JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const must = Array.isArray(parsed.must) ? parsed.must : [];
    const must_not = Array.isArray(parsed.must_not) ? parsed.must_not : [];
    const nice_to_have = Array.isArray(parsed.nice_to_have) ? parsed.nice_to_have : [];

    const allMustPass = must.every(v => v.verdict === 'pass');
    const noMustNotFail = must_not.every(v => v.verdict === 'pass');
    const pass = allMustPass && noMustNotFail;

    return { pass, must, must_not, nice_to_have, notes: parsed.notes ?? '' };
}
