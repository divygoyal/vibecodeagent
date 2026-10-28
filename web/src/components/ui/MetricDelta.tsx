import { computeDelta, deltaOptionsFor, type DeltaResult, type MetricFormat } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { cn } from '@/lib/cn';

export interface MetricDeltaProps {
    current: number | null | undefined;
    previous: number | null | undefined;
    /** Drives polarity and format (percent / points / absolute). */
    metric?: MetricKey;
    /** Without a metric: the value format and which direction is good. */
    format?: MetricFormat;
    better?: 'up' | 'down';
    /** @deprecated One delta style everywhere: 'chip' renders like 'text'. */
    variant?: 'text' | 'chip';
    size?: 'sm' | 'md';
    /** Spoken after the change: "versus previous 3 months". */
    comparisonLabel?: string;
    className?: string;
}

/** Filled triangle, 8x7. Not a text glyph, so it renders the same everywhere. */
export function DeltaArrow({ direction, className }: { direction: 'up' | 'down'; className?: string }) {
    return (
        <svg aria-hidden width="8" height="7" viewBox="0 0 8 7" className={cn('shrink-0 fill-current', className)}>
            {direction === 'up' ? <path d="M4 0 8 7H0z" /> : <path d="M4 7 0 0h8z" />}
        </svg>
    );
}

const TONE_TEXT = { good: 'text-up', bad: 'text-down', neutral: 'text-fg-muted' } as const;

export function deltaFor(props: Pick<MetricDeltaProps, 'current' | 'previous' | 'metric' | 'format' | 'better'>): DeltaResult {
    const m = props.metric ? METRICS[props.metric] : null;
    const format = props.format ?? m?.format ?? 'count';
    const better = props.better ?? m?.better ?? 'up';
    return computeDelta(props.current, props.previous, deltaOptionsFor(format, better));
}

/**
 * Signed change with a triangle (DESIGN 3.5, round 2 critique #3): one look
 * everywhere, plain coloured text right after the value, no pill. Colour =
 * direction x polarity; muted `0%` when flat. With nothing to compare against
 * (no data, or a previous period of 0, or an unchanged position) it renders
 * nothing: say "None in the previous period" in the comparison line instead.
 * `variant="chip"` is kept for old callers and renders the same text style.
 */
export function MetricDelta({ size = 'sm', comparisonLabel = 'versus previous period', className, ...input }: MetricDeltaProps) {
    const d = deltaFor(input);
    if (d.state === 'none' || d.state === 'new') return null;
    if (d.state === 'flat' && d.change === 0 && d.text === '–') return null;
    const tone = d.state === 'change' ? d.tone : 'neutral';
    // Position: ▲ means the rank got better (a lower number). Say so on hover, the arrow alone reads both ways.
    const rank = (input.metric ? METRICS[input.metric].format : input.format) === 'position';
    return (
        <span
            title={rank && d.state === 'change' ? `Position ${d.srText} (lower is better)` : undefined}
            className={cn(
                'inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums whitespace-nowrap',
                size === 'md' ? 'text-body-sm' : 'text-meta',
                TONE_TEXT[tone],
                className,
            )}
        >
            {d.state === 'change' && d.direction !== 'flat' ? <DeltaArrow direction={d.direction} /> : null}
            <span aria-hidden>{d.text}</span>
            <span className="sr-only">{d.state === 'change' ? `${d.srText} ${comparisonLabel}` : d.srText}</span>
        </span>
    );
}
