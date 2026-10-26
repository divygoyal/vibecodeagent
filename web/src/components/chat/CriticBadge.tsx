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
        ? { Icon: CheckCircle2, fg: 'text-up', bg: 'bg-up-soft', border: 'border-up/20' }
        : verdict.score >= 3
            ? { Icon: AlertCircle, fg: 'text-warn', bg: 'bg-warn-soft', border: 'border-warn/25' }
            : { Icon: AlertTriangle, fg: 'text-down', bg: 'bg-down-soft', border: 'border-down/20' };
    const { Icon, fg, bg, border } = tone;

    return (
        <div className={`mt-3 flex items-center gap-1.5 rounded-control border px-2 py-1 text-caption ${bg} ${border}`}>
            <Icon aria-hidden className={`size-3.5 ${fg}`} />
            <span className={`${fg} font-medium tabular-nums`}>{verdict.score.toFixed(1)}/5</span>
            <span aria-hidden className="text-fg-faint">·</span>
            <span className="truncate text-fg-secondary" title={verdict.notes}>{verdict.notes || 'reviewed'}</span>
            <span className="ml-auto text-caption text-fg-muted tabular-nums">
                G {verdict.groundedness} · C {verdict.completeness} · F {verdict.format}
            </span>
        </div>
    );
}
