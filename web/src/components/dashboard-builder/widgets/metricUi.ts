/**
 * Bridges builder catalogue metrics to the design-system components, which speak the nine
 * MetricKeys of lib/metrics.ts: colour family, delta format and polarity.
 */
import type { MetricKey } from '@/lib/metrics';
import type { MetricFormat } from '@/lib/format';
import { getMetric } from '@/lib/builder/catalog';

export function dsKey(id: string): MetricKey {
    return getMetric(id)?.colorKey ?? 'sessions';
}

/** Delta/format family for MetricDelta and Donut ('count' covers integers, decimals and money). */
export function dsFormat(id: string): MetricFormat {
    const f = getMetric(id)?.format;
    if (f === 'percent' || f === 'position' || f === 'duration') return f;
    return 'count';
}

export function metricBetter(id: string): 'up' | 'down' {
    return getMetric(id)?.better === 'down' ? 'down' : 'up';
}
