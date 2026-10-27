'use client';

import { Lightbulb, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Finding } from './lib/findings';

/**
 * The one-line, rule-based finding above a chart ("Clicks up 18% vs previous
 * 28 days, led by /pricing (+340 clicks)."). Written by fixed rules from the
 * numbers on screen, so it costs nothing and never invents a cause.
 */
export function FindingLine({ finding, loading, className }: { finding: Finding | null | undefined; loading?: boolean; className?: string }) {
    if (loading) return <Skeleton className={cn('mb-3 h-4 w-2/3', className)} />;
    if (!finding) return null;
    const Icon = finding.tone === 'good' || finding.tone === 'bad'
        ? (/\bdown\b/.test(finding.text) ? TrendingDown : TrendingUp)
        : finding.tone === 'flat' ? Minus : Lightbulb;
    const tone = finding.tone === 'good' ? 'text-up' : finding.tone === 'bad' ? 'text-down' : 'text-fg-muted';
    return (
        <p className={cn('mb-3 flex items-start gap-2 text-body-sm text-fg-secondary', className)}>
            <Icon aria-hidden size={16} strokeWidth={1.75} className={cn('mt-[2px] shrink-0', tone)} />
            <span className="min-w-0 text-pretty">{finding.text}</span>
        </p>
    );
}
