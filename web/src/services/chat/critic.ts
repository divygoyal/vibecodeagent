/**
 * B2-full — Critic post-pass.
 *
 * After the main streaming pass completes for a critic-enabled persona
 * (DIAGNOSTIC, EXECUTIVE_SUMMARY, OPPORTUNITY, DEEP_DIVE), Flash-Lite
 * scores the answer 0-5 on FOUR axes:
 *   • groundedness — every numeric claim cites a tool result or dashboard data
 *   • completeness — the persona's mandated structure is followed
 *   • format       — markdown shape matches the persona expectation
 *   • specificity  — every action names a specific URL/keyword/number; no
 *                    generic "improve content quality" filler
 *
 * If overall < 3, the critic returns a short rewrite prompt that the
 * caller feeds back into ONE more streaming pass (single rewrite — no loop).
 *
 * Critic is intentionally cheap (Flash-Lite, ≤220 output tokens). The
 * overhead is ~600ms typical, ~1.5s p95.
 */
import type { GoogleGenAI } from '@google/genai';

export interface CriticVerdict {
    score: number;          // 0..5 overall (mean of axes)
    groundedness: number;
    completeness: number;
    format: number;
    specificity: number;
    rewritePrompt: string | null; // null when score >= 3 and specificity >= 3
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
        specificity: { type: 'NUMBER' },
        notes: { type: 'STRING' },
    },
    required: ['groundedness', 'completeness', 'format', 'specificity', 'notes'],
} as const;

export async function runCritic({ genai, intent, userMessage, assistantMessage, formatExpectation }: CriticArgs): Promise<CriticVerdict | null> {
    if (!assistantMessage || assistantMessage.length < 20) return null;
    try {
        const prompt = `You are a strict critic of an SEO/analytics AI's answer. Score this assistant answer 0-5 on FOUR axes.

INTENT: ${intent}
USER ASKED: ${userMessage.slice(0, 800)}
EXPECTED FORMAT: ${formatExpectation.slice(0, 600)}

ASSISTANT ANSWERED:
${assistantMessage.slice(0, 4000)}

Score each axis 0..5 (5 = excellent, 0 = unusable):
- groundedness: every NUMERIC claim should be tied to a specific data source (table, tool result, commit SHA). Flag bare numbers as ungrounded. IMPORTANT: honest declarations of uncertainty about data sufficiency ("I'm medium-confidence — only 17 days of data") are GROUNDEDNESS = 5, not a deduction. The snapshot ships confidence tags; the assistant transcribing them honestly is the gold standard, not a flaw.
- completeness: did the assistant follow the EXPECTED FORMAT? Missing sections / wrong structure → low score.
- format: markdown rendering quality (tables when appropriate, headings, bullets). Wall-of-text gets a low score.
- specificity: does EVERY recommended action name a specific URL, keyword, or current/target number? Bullets like "improve content quality", "build backlinks", "better keywords", "fix your meta" without naming WHICH page/keyword are GENERIC and score 0-2. A great answer (5) names URLs and keywords in every action line and shows before→after where applicable.

Be strict. A "good" answer scores 4. A "great" answer scores 5. Average = 3. Below 3 means the answer should be rewritten.

notes: ONE sentence diagnosis ("missing revenue impact section" / "rounded numbers without source" / "wall of text, no structure" / "actions are generic — no URLs cited"). ≤140 chars.

Output JSON ONLY matching the schema. No commentary.`;

        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0,
                maxOutputTokens: 220,
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
        const specificity = Math.max(0, Math.min(5, Number(parsed.specificity) || 0));
        const score = Math.round(((groundedness + completeness + format + specificity) / 4) * 10) / 10;
        const notes = String(parsed.notes || '').slice(0, 200);

        // Trigger rewrite when overall < 3 OR specificity < 3 (specificity is the
        // axis the user complained about — generic answers feel wrong even when
        // grounded/complete). Specificity-only failure produces a more targeted
        // rewrite prompt.
        const needsRewrite = score < 3 || specificity < 3;
        let rewritePrompt: string | null = null;
        if (needsRewrite) {
            if (specificity < 3 && score >= 3) {
                rewritePrompt = `Your previous answer scored ${specificity}/5 on specificity — actions were too generic. Rewrite — keep the same data, dates, and numbers — but make EVERY recommendation name a specific URL, keyword, or current/target number. No more "improve content quality", "build backlinks", "fix your meta", "better keywords". If you genuinely don't have enough data to be specific about an item, drop that item rather than keep it generic. Output ONLY the rewritten answer.`;
            } else {
                rewritePrompt = `Your previous answer scored ${score}/5 on the critic. Issue: ${notes}. Rewrite — same data, but FIX the issue cited. Keep numbers, dates, and citations identical; only repair the format/grounding/specificity. Output ONLY the rewritten answer.`;
            }
        }

        return { score, groundedness, completeness, format, specificity, notes, rewritePrompt };
    } catch {
        return null;
    }
}
