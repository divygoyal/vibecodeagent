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
        <div className="my-2 overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
            <button
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-body-sm transition-colors hover:bg-subtle"
            >
                <Sparkles aria-hidden className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
                <span className="font-medium text-fg">Plan</span>
                <span className="min-w-0 flex-1 truncate text-left text-fg-muted">{plan.summary}</span>
                <span className="flex items-center gap-2 text-caption text-fg-muted tabular-nums">
                    <span className="flex items-center gap-0.5"><Clock aria-hidden className="size-3" />{plan.est_runtime_s}s</span>
                    {plan.est_cost_cents > 0 && (
                        <span className="flex items-center gap-0.5"><Coins aria-hidden className="size-3" />{plan.est_cost_cents.toFixed(1)}¢</span>
                    )}
                </span>
                {open ? <ChevronDown aria-hidden className="size-3.5 text-fg-muted" /> : <ChevronRight aria-hidden className="size-3.5 text-fg-muted" />}
            </button>
            {open && (
                <ol className="space-y-1.5 border-t border-border-subtle px-3 pb-2 pt-2">
                    {plan.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-meta">
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-subtle text-caption text-fg-secondary">
                                {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <code className="font-mono text-caption text-fg">{step.tool}</code>
                                <span className="text-fg-muted"> — {step.why}</span>
                                {step.expected && (
                                    <p className="mt-0.5 text-caption text-fg-muted">→ {step.expected}</p>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
