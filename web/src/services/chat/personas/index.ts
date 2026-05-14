/**
 * B3-full — Persona registry.
 *
 * Each intent label maps to a Persona that bundles:
 *   • systemPrompt — the response-shape instructions for THIS intent
 *   • allowedTools — set of tool names the model is allowed to call
 *                    (omit ⇒ all tools allowed). Shrinks the hallucination
 *                    surface for narrow intents.
 *   • plannerEnabled — whether B2 planner pass should run for this intent
 *   • criticEnabled  — whether B2 critic pass should run for this intent
 *   • formatHints — per-intent format scaffolding the model should follow
 *                   when composing its answer.
 *
 * Resolution: route.ts calls classifyIntent() → label → resolvePersona(label).
 * Composition: route.ts builds the final system prompt as
 *   SHARED_PREAMBLE + persona.systemPrompt + SHARED_RULES + memoryBlock + ...
 *
 * Why files-not-objects: each persona will likely grow its own format
 * spec, allowed-tool list, sample exchanges, and benchmark prompts. The
 * file structure makes that growth painless.
 */

import { diagnostic } from './diagnostic';
import { opportunity } from './opportunity';
import { contentBrief } from './contentBrief';
import { executiveSummary } from './executiveSummary';
import { technicalAudit } from './technicalAudit';
import { casualGreeting } from './casualGreeting';
import { metaQuestion } from './metaQuestion';
import { deepDive } from './deepDive';
import { coaching } from './coaching';
import { comparison } from './comparison';
import { hypothetical } from './hypothetical';
import { seoConsultant } from './seoConsultant';

export type IntentLabel =
    | 'CASUAL_GREETING' | 'DIAGNOSTIC' | 'OPPORTUNITY' | 'CONTENT_BRIEF'
    | 'EXECUTIVE_SUMMARY' | 'TECHNICAL_AUDIT' | 'META_QUESTION' | 'DEEP_DIVE'
    | 'COACHING' | 'COMPARISON' | 'HYPOTHETICAL' | 'SEO_CONSULTANT';

export interface Persona {
    label: IntentLabel;
    /** Per-intent system-prompt block. Composed AFTER the shared preamble
     *  and BEFORE the shared rules + memory + dashboard blocks. */
    systemPrompt: string;
    /** When set, restricts which tools Gemini may call for this intent.
     *  Undefined = all declared tools allowed. */
    allowedTools?: Set<string>;
    /** Whether the B2 planner pass should run before main streaming. */
    plannerEnabled: boolean;
    /** Whether the B2 critic pass should run after main streaming. */
    criticEnabled: boolean;
    /** Suggested temperature override for THIS intent's main answer pass.
     *  Undefined = use route.ts default (0.85 first pass, 0.3 tool-result pass). */
    temperatureOverride?: number;
}

const REGISTRY: Record<IntentLabel, Persona> = {
    CASUAL_GREETING: casualGreeting,
    DIAGNOSTIC: diagnostic,
    OPPORTUNITY: opportunity,
    CONTENT_BRIEF: contentBrief,
    EXECUTIVE_SUMMARY: executiveSummary,
    TECHNICAL_AUDIT: technicalAudit,
    META_QUESTION: metaQuestion,
    DEEP_DIVE: deepDive,
    COACHING: coaching,
    COMPARISON: comparison,
    HYPOTHETICAL: hypothetical,
    SEO_CONSULTANT: seoConsultant,
};

/** Resolve a Persona for an intent label. Falls back to DIAGNOSTIC (the
 *  most-capable persona) if the label is unknown — better to over-respond
 *  than fail silently. */
export function resolvePersona(label: string | null | undefined): Persona {
    if (!label) return REGISTRY.DIAGNOSTIC;
    const persona = REGISTRY[label as IntentLabel];
    return persona ?? REGISTRY.DIAGNOSTIC;
}

export function listPersonas(): Persona[] {
    return Object.values(REGISTRY);
}
