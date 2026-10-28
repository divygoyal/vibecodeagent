import { cn } from '@/lib/cn';
import { DeltaArrow } from '@/components/ui/MetricDelta';
import type { DeltaText } from '@/lib/chat/answerFormat';

const TONE_TEXT = { good: 'text-up', bad: 'text-down', neutral: 'text-fg-muted' } as const;

/** A change written in an answer, drawn like MetricDelta: triangle + unsigned value, coloured by polarity. */
export function AnswerDelta({ delta, className }: { delta: DeltaText; className?: string }) {
    const value = delta.text.replace(/^[+−]/, '');
    const spoken = delta.spoken ?? (delta.direction === 'flat' ? `no change, ${value}` : `${delta.direction} ${value}`);
    // Position changes say what the colour means (a rising number is a worse position), like MetricDelta's tooltip.
    const title = delta.spoken ? `Position ${delta.spoken} (lower is better)` : undefined;
    return (
        <span title={title} className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums whitespace-nowrap', TONE_TEXT[delta.tone], className)}>
            {delta.direction !== 'flat' ? <DeltaArrow direction={delta.direction} /> : null}
            <span aria-hidden>{value}</span>
            <span className="sr-only">{spoken}</span>
        </span>
    );
}
