/**
 * B2-full — Planner pre-pass.
 *
 * For DIAGNOSTIC + TECHNICAL_AUDIT intents (per persona.plannerEnabled),
 * a Pro-tier model with thinkingBudget enabled emits a structured JSON plan
 * BEFORE the main streaming pass. The plan is surfaced to the user via a
 * `plan_proposed` SSE event so they can see what the model is about to do.
 *
 * Output schema (validated client-side):
 *   {
 *     intent: string,                    // matches IntentLabel
 *     summary: string,                   // 1-line "what I'm going to do"
 *     steps: [
 *       { tool: string, why: string, expected: string }
 *     ],
 *     est_runtime_s: number,
 *     est_cost_cents: number             // rough — used for plan-approval gating
 *   }
 *
 * The planner is pre-flight — it never auto-executes anything. The main
 * streaming pass that runs after the planner uses the plan as guidance
 * (the plan lands in the conversation context as a 'model'-role message).
 *
 * Failure mode: planner errors are non-fatal. If the planner fails, we
 * skip plan-emit and proceed to the normal streaming pass — the model
 * still has the persona system prompt.
 */
import type { GoogleGenAI } from '@google/genai';

export interface PlanStep {
    tool: string;
    why: string;
    expected: string;
}

export interface ChatPlan {
    intent: string;
    summary: string;
    steps: PlanStep[];
    est_runtime_s: number;
    est_cost_cents: number;
}

interface PlannerArgs {
    genai: GoogleGenAI;
    intent: string;
    userMessage: string;
    /** The shortlist of tool names this persona is allowed to call. */
    availableTools: string[];
    /** Site/repo/dashboard context tags that already exist in the user msg. */
    contextTags: string;
}

const PLAN_SCHEMA = {
    type: 'OBJECT',
    properties: {
        intent: { type: 'STRING' },
        summary: { type: 'STRING' },
        steps: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    tool: { type: 'STRING' },
                    why: { type: 'STRING' },
                    expected: { type: 'STRING' },
                },
                required: ['tool', 'why', 'expected'],
            },
        },
        est_runtime_s: { type: 'NUMBER' },
        est_cost_cents: { type: 'NUMBER' },
    },
    required: ['intent', 'summary', 'steps', 'est_runtime_s', 'est_cost_cents'],
} as const;

export async function runPlanner({ genai, intent, userMessage, availableTools, contextTags }: PlannerArgs): Promise<ChatPlan | null> {
    try {
        const prompt = `You are the planner for a SEO/analytics AI chat. Output a concrete plan for handling this user request, using ONLY the listed tools.

INTENT: ${intent}
USER MESSAGE: ${userMessage.slice(0, 1500)}
CONTEXT: ${contextTags.slice(0, 800)}

AVAILABLE TOOLS: ${availableTools.join(', ') || '(generator-only persona)'}

RULES:
- 1 to 4 steps. Prefer 1. Reach for more only when the answer needs cross-source data.
- Each step.tool MUST be one of the available tools above (or "respond" for a direct text answer with no tool).
- step.why is one short clause ("to find the change date").
- step.expected is what the result will look like ("verdict-shaped payload with start date and suspect commits").
- est_runtime_s is the wall-clock you expect end-to-end (typical: 4-25s).
- est_cost_cents is rough — 0.5 per cheap tool call, 2 per slow tool (PageSpeed, audits), 1 per LLM pass.
- summary is ONE sentence the user will read on the plan card before the answer streams.

Output JSON ONLY matching the schema. No markdown, no commentary.`;

        const res: any = await genai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.2,
                maxOutputTokens: 800,
                responseMimeType: 'application/json',
                responseSchema: PLAN_SCHEMA as any,
                // thinkingBudget controls "reasoning" budget on Gemini 3.x Pro;
                // a small budget produces tighter plans without long internal monologues.
                thinkingConfig: { thinkingBudget: 1024 },
                httpOptions: { timeout: 20000 },
            } as any,
        });
        const raw = (res?.text || '').trim();
        if (!raw) return null;
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { return null; }
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Array.isArray(parsed.steps)) return null;
        return {
            intent: String(parsed.intent || intent),
            summary: String(parsed.summary || '').slice(0, 280),
            steps: parsed.steps
                .slice(0, 6)
                .map((s: any): PlanStep => ({
                    tool: String(s?.tool || 'respond').slice(0, 60),
                    why: String(s?.why || '').slice(0, 200),
                    expected: String(s?.expected || '').slice(0, 200),
                })),
            est_runtime_s: Math.max(0, Math.min(120, Number(parsed.est_runtime_s) || 0)),
            est_cost_cents: Math.max(0, Math.min(50, Number(parsed.est_cost_cents) || 0)),
        };
    } catch {
        return null;
    }
}
