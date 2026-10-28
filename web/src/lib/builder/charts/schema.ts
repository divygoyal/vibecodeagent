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

export function chartWidgetSchemas({ base, metricRef }: SchemaShared) {
    return [
        z.object({
            ...base, type: z.literal('heatmap'),
            config: z.looseObject({ variant: z.enum(['weekday-hour', 'calendar']), metric: metricRef, weekStart: z.enum(['mon', 'sun']).optional(), finding: z.boolean().optional() }),
        }),
    ] as const;
}
