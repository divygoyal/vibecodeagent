'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Clock, Coins } from 'lucide-react';

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

interface PlanCardProps {
    plan: ChatPlan;
}

/**
 * B5-full — Plan-approval card.
 *
 * Renders the planner's structured plan above the streaming answer so the
 * user can see what the model is about to do BEFORE the answer streams.
 * Auto-executes (this session ships visibility, not a manual approval gate).
 *
 * Collapsible — defaults open during streaming, can be folded once the answer
 * lands. Header shows summary + runtime/cost estimate; expanded view shows
 * the step-by-step rationale.
 */
export function PlanCard({ plan }: PlanCardProps) {
    const [open, setOpen] = useState(true);
    if (!plan || !plan.steps?.length) return null;

    return (
        <div className="my-2 rounded-lg border border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.04] to-transparent overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-cyan-500/[0.05] transition-colors"
            >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="font-semibold text-zinc-200">Plan</span>
                <span className="text-zinc-500 truncate flex-1 text-left">{plan.summary}</span>
                <span className="flex items-center gap-2 text-[10px] text-zinc-500 tabular-nums">
                    <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{plan.est_runtime_s}s</span>
                    {plan.est_cost_cents > 0 && (
                        <span className="flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{plan.est_cost_cents.toFixed(1)}¢</span>
                    )}
                </span>
                {open ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />}
            </button>
            {open && (
                <ol className="px-3 pb-2 pt-1 border-t border-cyan-500/10 space-y-1.5">
                    {plan.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-[11px]">
                            <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 flex items-center justify-center text-[9px] font-bold">
                                {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <code className="text-cyan-300 text-[10px] font-mono">{step.tool}</code>
                                <span className="text-zinc-400"> — {step.why}</span>
                                {step.expected && (
                                    <p className="text-zinc-600 text-[10px] mt-0.5">→ {step.expected}</p>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
