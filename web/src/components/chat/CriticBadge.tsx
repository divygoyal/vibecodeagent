'use client';

import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

export interface CriticVerdict {
    score: number;          // 0..5
    groundedness: number;
    completeness: number;
    format: number;
    notes: string;
}

interface CriticBadgeProps {
    verdict: CriticVerdict;
}

/**
 * B5-full — Critic badge.
 *
 * Renders the critic's score (0..5) and one-line diagnosis at the bottom
 * of an assistant message for personas where the critic is enabled
 * (DIAGNOSTIC, EXECUTIVE_SUMMARY). Green ≥ 4, amber 3-3.9, red < 3.
 *
 * Lightweight — just communicates that the answer was checked, not a full
 * QA panel. Lets users see at a glance whether to trust a verdict.
 */
export function CriticBadge({ verdict }: CriticBadgeProps) {
    if (!verdict || typeof verdict.score !== 'number') return null;

    const tone = verdict.score >= 4
        ? { Icon: CheckCircle2, fg: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20' }
        : verdict.score >= 3
            ? { Icon: AlertCircle, fg: 'text-amber-400', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20' }
            : { Icon: AlertTriangle, fg: 'text-red-400', bg: 'bg-red-500/[0.08]', border: 'border-red-500/20' };
    const { Icon, fg, bg, border } = tone;

    return (
        <div className={`mt-3 flex items-center gap-1.5 px-2 py-1 rounded-md ${bg} border ${border} text-[10px]`}>
            <Icon className={`w-3 h-3 ${fg}`} />
            <span className={`${fg} font-semibold tabular-nums`}>{verdict.score.toFixed(1)}/5</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 truncate" title={verdict.notes}>{verdict.notes || 'reviewed'}</span>
            <span className="text-zinc-600 text-[9px] ml-auto tabular-nums">
                G {verdict.groundedness} · C {verdict.completeness} · F {verdict.format}
            </span>
        </div>
    );
}
