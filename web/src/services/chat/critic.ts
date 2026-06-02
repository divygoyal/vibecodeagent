/**
 * B2-full — Critic post-pass.
 *
 * After the main streaming pass completes for a critic-enabled persona
 * (DIAGNOSTIC, EXECUTIVE_SUMMARY, OPPORTUNITY, DEEP_DIVE), Flash-Lite
 * scores the answer 0-5 on SEVEN axes:
 *   • groundedness        — every numeric claim cites a tool result or dashboard data
 *   • completeness        — the persona's mandated structure is followed
 *   • format              — markdown shape matches the persona expectation
 *   • specificity         — every action names a specific URL/keyword/number; no
 *                           generic "improve content quality" filler
 *   • numerical_sourcing  — every dollar/CTR/impression has [src:] or [estimate:];
 *                           bare invented numbers like "$0.50/click" score 0
 *   • audience_alignment  — if USER_FACTS contains an industry and top GSC queries
 *                           don't intersect, the answer leads with the mismatch
 *   • one_thing_discipline — when the user asks for "one thing"/"single"/"top",
 *                            the answer contains exactly ONE recommendation
 *
 * Plus a cross-turn consistency pre-check: if a previous assistant turn cited
 * different numbers for the same page/keyword, force a rewrite.
 *
 * If overall < 3 OR any blocking axis fails, the critic returns a short rewrite
 * prompt that the caller feeds back into ONE more streaming pass (no loop).
 *
 * Critic is intentionally cheap (Flash-Lite, ≤260 output tokens). The
 * overhead is ~700ms typical, ~1.8s p95.
 */
import type { GoogleGenAI } from '@google/genai';
import {
    getGoogleGenAIText,
    GOOGLE_GENAI_LIGHT_MODEL,
    GOOGLE_GENAI_THINKING_DISABLED,
} from '@/lib/googleGenAi';

export interface CriticVerdict {
    score: number;                  // 0..5 overall (mean of scored axes)
    groundedness: number;
    completeness: number;
    format: number;
    specificity: number;
    numerical_sourcing: number;
    audience_alignment: number;
    one_thing_discipline: number;   // 0 or 5 (binary)
    cross_turn_drift: string[];     // human-readable list of conflicting entities; empty when clean
    rewritePrompt: string | null;
    notes: string;
}

interface CriticArgs {
    genai: GoogleGenAI;
    intent: string;
    userMessage: string;
    assistantMessage: string;
    /** What the persona's prompt told the model to produce. */
    formatExpectation: string;
    /** Previous assistant message in the same thread, for cross-turn consistency. */
    previousAssistantMessage?: string;
    /** Top GSC queries the user's site ranks for, to check audience alignment. */
    topGscQueries?: Array<{ query: string; clicks?: number; impressions?: number; position?: number }>;
    /** USER_FACTS block (raw text). Used to detect audience-mismatch failure mode. */
    userFactsBlock?: string;
}

const CRITIC_SCHEMA = {
    type: 'OBJECT',
    properties: {
        groundedness: { type: 'NUMBER' },
        completeness: { type: 'NUMBER' },
        format: { type: 'NUMBER' },
        specificity: { type: 'NUMBER' },
        numerical_sourcing: { type: 'NUMBER' },
        audience_alignment: { type: 'NUMBER' },
        one_thing_discipline: { type: 'NUMBER' },
        cross_turn_drift: { type: 'ARRAY', items: { type: 'STRING' } },
        notes: { type: 'STRING' },
    },
    required: ['groundedness', 'completeness', 'format', 'specificity', 'numerical_sourcing', 'audience_alignment', 'one_thing_discipline', 'cross_turn_drift', 'notes'],
} as const;

const ONE_THING_PATTERN = /\b(one thing|single|top priority|the most important|if i had to pick)\b/i;

export async function runCritic({
    genai,
    intent,
    userMessage,
    assistantMessage,
    formatExpectation,
    previousAssistantMessage,
    topGscQueries,
    userFactsBlock,
}: CriticArgs): Promise<CriticVerdict | null> {
    if (!assistantMessage || assistantMessage.length < 20) return null;

    const askedForOneThing = ONE_THING_PATTERN.test(userMessage);
    const topQueriesText = topGscQueries && topGscQueries.length > 0
        ? topGscQueries.slice(0, 5).map(q => `"${q.query}"`).join(', ')
        : '(none)';
    const userFactsText = (userFactsBlock ?? '').slice(0, 500) || '(none provided)';
    const prevTurnBlock = previousAssistantMessage && previousAssistantMessage.length > 50
        ? `PREVIOUS ASSISTANT TURN (for cross-turn consistency only):\n${previousAssistantMessage.slice(0, 2500)}\n`
        : '';

    try {
        const prompt = `You are a strict critic of an SEO/analytics AI's answer. Score this assistant answer 0-5 on SEVEN axes, plus a binary cross-turn-drift check.

INTENT: ${intent}
USER ASKED: ${userMessage.slice(0, 800)}
EXPECTED FORMAT: ${formatExpectation.slice(0, 600)}
USER_FACTS BLOCK: ${userFactsText}
TOP GSC QUERIES (top 5 the site ranks for): ${topQueriesText}
USER ASKED FOR "ONE THING"?: ${askedForOneThing ? 'YES' : 'NO'}

${prevTurnBlock}ASSISTANT ANSWERED:
${assistantMessage.slice(0, 4000)}

Score each axis 0..5 (5 = excellent, 0 = unusable). Be strict — average answer is 3.

- groundedness: every numeric claim ties to a specific data source. Honest uncertainty declarations ("medium confidence, only 17 days of data") are GROUNDEDNESS = 5, not a deduction.
- completeness: did the assistant follow EXPECTED FORMAT? Note: under the new format-as-guide rule, OMITTED sections with no relevant content are CORRECT — don't deduct for missing sections that would have been padding.
- format: markdown quality (tables when appropriate, headings, bullets). Wall-of-text scores low.
- specificity: every action names a specific URL, keyword, or current/target number. Generic phrases like "improve content quality", "build backlinks", "better keywords", "fix your meta" score 0-2.
- numerical_sourcing: every dollar amount, CTR figure, impression count, percentage MUST have a [src:...] tag, [estimate: <assumption>] tag, or come from the prior conversation context.
  • 5 = every number is sourced or explicitly estimated with the assumption visible.
  • 3 = mostly sourced, 1-2 bare numbers slip through.
  • 0 = many bare invented numbers (classic: "$0.50/click for developer traffic", "$2 informational CPC").
  • A pure click-delta ("+450 clicks/mo from snapshot data") doesn't need [src:] — clicks are observed data. But a dollar value derived from clicks REQUIRES a CPC source.
- audience_alignment: if USER_FACTS contains an industry/audience AND TOP GSC QUERIES don't intersect with it, the answer's FIRST LINE must surface the mismatch ("⚠️ Audience mismatch detected..."). If USER_FACTS has no audience value, audience_alignment = 5 automatically (nothing to align). If there IS a mismatch and the answer ignores or buries it (e.g., in a 🔮 BONUS section), score 0-2.
- one_thing_discipline (binary 0 or 5): only relevant when "USER ASKED FOR 'ONE THING'?" is YES. In that case:
  • 5 = answer contains exactly ONE recommendation. No bonus section. No "while you're at it". No second action.
  • 0 = answer contains 2+ recommendations, action lists, or a bonus section.
  When the user did NOT ask for one thing (NO above), score this axis 5 automatically.

cross_turn_drift: if PREVIOUS ASSISTANT TURN is present, compare numbers in the current answer against the previous answer for the SAME page URL or keyword. List each entity where impressions / clicks / position / CTR differ between the two answers, formatted as "entity: prev=X now=Y". Empty array means no drift. If no previous turn was provided, return [].

notes: ONE sentence diagnosis (e.g. "invented $0.50/click without source — score 0 on numerical_sourcing" or "user asked for ONE thing, got three steps + bonus"). ≤180 chars.

Output JSON ONLY matching the schema. No commentary.`;

        const res: any = await genai.models.generateContent({
            model: GOOGLE_GENAI_LIGHT_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0,
                maxOutputTokens: 320,
                responseMimeType: 'application/json',
                responseSchema: CRITIC_SCHEMA as any,
                thinkingConfig: GOOGLE_GENAI_THINKING_DISABLED,
                httpOptions: { timeout: 10000 },
            } as any,
        });
        const raw = getGoogleGenAIText(res).trim();
        if (!raw) return null;
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { return null; }
        if (!parsed) return null;

        const groundedness = clamp(parsed.groundedness);
        const completeness = clamp(parsed.completeness);
        const format = clamp(parsed.format);
        const specificity = clamp(parsed.specificity);
        const numerical_sourcing = clamp(parsed.numerical_sourcing);
        const audience_alignment = clamp(parsed.audience_alignment);
        const one_thing_discipline = askedForOneThing ? (Number(parsed.one_thing_discipline) >= 4 ? 5 : 0) : 5;
        const cross_turn_drift = Array.isArray(parsed.cross_turn_drift)
            ? parsed.cross_turn_drift.filter((s: unknown) => typeof s === 'string' && s.length > 0).slice(0, 6)
            : [];

        // Overall = mean of the four legacy axes + the three new ones, weighted equally.
        const scoredAxes = [groundedness, completeness, format, specificity, numerical_sourcing, audience_alignment, one_thing_discipline];
        const score = Math.round((scoredAxes.reduce((s, n) => s + n, 0) / scoredAxes.length) * 10) / 10;
        const notes = String(parsed.notes || '').slice(0, 220);

        // Rewrite triggers:
        //   • overall < 3
        //   • any blocking axis fails: specificity, numerical_sourcing, audience_alignment all < 3
        //   • one_thing_discipline < 5 (user explicitly asked for one)
        //   • cross-turn drift detected
        const blockingFailure = specificity < 3 || numerical_sourcing < 3 || audience_alignment < 3;
        const oneThingFail = askedForOneThing && one_thing_discipline < 5;
        const driftFail = cross_turn_drift.length > 0;
        const needsRewrite = score < 3 || blockingFailure || oneThingFail || driftFail;

        let rewritePrompt: string | null = null;
        if (needsRewrite) {
            const issues: string[] = [];
            if (numerical_sourcing < 3) issues.push(`numerical_sourcing ${numerical_sourcing}/5: drop or source any dollar amount, CTR, or impression that lacks [src:] or [estimate:].`);
            if (audience_alignment < 3) issues.push(`audience_alignment ${audience_alignment}/5: surface the USER_FACTS vs. GSC-queries mismatch at the TOP of the answer, not buried.`);
            if (oneThingFail) issues.push(`one_thing_discipline 0/5: user asked for ONE thing — keep only the single highest-impact recommendation, drop the rest (no bonus section, no second action).`);
            if (driftFail) issues.push(`cross-turn drift detected: ${cross_turn_drift.join(' · ')}. Reconcile or explicitly note "snapshot refreshed since last reply".`);
            if (specificity < 3) issues.push(`specificity ${specificity}/5: every action must name a URL/keyword/number. Drop generic items instead of keeping them generic.`);
            if (issues.length === 0) issues.push(notes || `overall ${score}/5: fix the issues called out in notes.`);

            rewritePrompt = `Your previous answer needs revision. Fix THESE specific issues in order, keeping all sourced numbers and citations identical:\n\n${issues.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nOutput ONLY the rewritten answer. Do not narrate the revision.`;
        }

        return {
            score,
            groundedness,
            completeness,
            format,
            specificity,
            numerical_sourcing,
            audience_alignment,
            one_thing_discipline,
            cross_turn_drift,
            notes,
            rewritePrompt,
        };
    } catch {
        return null;
    }
}

function clamp(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(5, n));
}
