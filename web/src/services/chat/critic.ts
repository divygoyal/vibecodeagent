/**
 * B2-full — Critic post-pass.
 *
 * After the main streaming pass completes for a critic-enabled persona
 * (DIAGNOSTIC, EXECUTIVE_SUMMARY), Flash-Lite scores the answer 0-5 on
 * three axes:
 *   • groundedness — every numeric claim cites a tool result or dashboard data
 *   • completeness — the persona's mandated structure is followed
 *   • format       — markdown shape matches the persona expectation
 *
 * If overall < 3, the critic returns a short rewrite prompt that the
 * caller feeds back into ONE more streaming pass (single rewrite — no loop).
 *
 * Critic is intentionally cheap (Flash-Lite, ≤200 output tokens). The
 * overhead is ~600ms typical, ~1.5s p95. We only run it for personas
 * where format compliance materially matters.
 */
import type { GoogleGenAI } from '@google/genai';

export interface CriticVerdict {
    score: number;          // 0..5 overall
    groundedness: number;
    completeness: number;
    format: number;
    rewritePrompt: string | null; // null when score >= 3
    notes: string;          // 1-line diagnosis
}

interface CriticArgs {
    genai: GoogleGenAI;
    intent: string;
    userMessage: string;
    assistantMessage: string;
    /** What the persona's prompt told the model to produce. */
    formatExpectation: string;
}

const CRITIC_SCHEMA = {
    type: 'OBJECT',
    properties: {
        groundedness: { type: 'NUMBER' },
        completeness: { type: 'NUMBER' },
        format: { type: 'NUMBER' },
        notes: { type: 'STRING' },
    },
    required: ['groundedness', 'completeness', 'format', 'notes'],
} as const;

export async function runCritic({ genai, intent, userMessage, assistantMessage, formatExpectation }: CriticArgs): Promise<CriticVerdict | null> {
    if (!assistantMessage || assistantMessage.length < 20) return null;
    try {
        const prompt = `You are a strict critic of an SEO/analytics AI's answer. Score this assistant answer 0-5 on three axes.

INTENT: ${intent}
USER ASKED: ${userMessage.slice(0, 800)}
EXPECTED FORMAT: ${formatExpectation.slice(0, 600)}

ASSISTANT ANSWERED:
${assistantMessage.slice(0, 4000)}

Score each axis 0..5 (5 = excellent, 0 = unusable):
- groundedness: every NUMERIC claim should be tied to a specific data source (table, tool result, commit SHA). Flag bare numbers as ungrounded.
- completeness: did the assistant follow the EXPECTED FORMAT? Missing sections / wrong structure → low score.
- format: markdown rendering quality (tables when appropriate, headings, bullets). Wall-of-text gets a low score.

Be strict. A "good" answer scores 4. A "great" answer scores 5. Average = 3. Below 3 means the answer should be rewritten.

notes: ONE sentence diagnosis ("missing revenue impact section" / "rounded numbers without source" / "wall of text, no structure"). ≤120 chars.

Output JSON ONLY matching the schema. No commentary.`;

        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0,
                maxOutputTokens: 200,
                responseMimeType: 'application/json',
                responseSchema: CRITIC_SCHEMA as any,
                httpOptions: { timeout: 8000 },
            } as any,
        });
        const raw = (res?.text || '').trim();
        if (!raw) return null;
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { return null; }
        if (!parsed) return null;

        const groundedness = Math.max(0, Math.min(5, Number(parsed.groundedness) || 0));
        const completeness = Math.max(0, Math.min(5, Number(parsed.completeness) || 0));
        const format = Math.max(0, Math.min(5, Number(parsed.format) || 0));
        const score = Math.round(((groundedness + completeness + format) / 3) * 10) / 10;
        const notes = String(parsed.notes || '').slice(0, 200);

        const rewritePrompt = score < 3
            ? `Your previous answer scored ${score}/5 on the critic. Issue: ${notes}. Rewrite — same data, but FIX the issue cited. Keep numbers, dates, and citations identical; only repair the format/grounding. Output ONLY the rewritten answer.`
            : null;

        return { score, groundedness, completeness, format, notes, rewritePrompt };
    } catch {
        return null;
    }
}
