/**
 * zod schemas of the round 9 chart widgets. Server side only (the client never bundles zod); schema.ts
 * spreads `chartWidgetSchemas(shared)` into the widget union. `shared` is what schema.ts already
 * defines for every widget (the base fields, the metric reference and the dimension id).
 */
import { z } from 'zod';

export interface SchemaShared {
    base: z.ZodRawShape;
    metricRef: z.ZodType;
    dimId: z.ZodType;
}

export function chartWidgetSchemas({ base, metricRef, dimId }: SchemaShared) {
    return [
        z.object({
            ...base, type: z.literal('heatmap'),
            config: z.looseObject({ variant: z.enum(['weekday-hour', 'calendar']), metric: metricRef, weekStart: z.enum(['mon', 'sun']).optional(), finding: z.boolean().optional() }),
        }),
        z.object({
            ...base, type: z.literal('scatter'),
            config: z.looseObject({
                dimension: dimId, x: metricRef, y: metricRef, size: metricRef.optional(),
                top: z.number().int().min(5).max(200), quadrants: z.boolean().optional(), highlight: z.enum(['tl', 'tr', 'bl', 'br']).optional(),
                xScale: z.enum(['linear', 'log']).optional(), yScale: z.enum(['linear', 'log']).optional(), labels: z.boolean().optional(),
            }),
        }),
    ] as const;
}
