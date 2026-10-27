import type { ReactElement } from 'react';

import { AXIS_TICK } from './axis';

export interface EdgeTickProps {
    x?: number | string;
    y?: number | string;
    payload?: { value?: unknown; index?: number };
    index?: number;
}

/**
 * Date-axis tick renderer for Recharts (`<XAxis tick={dateAxisTick(…)} />`):
 * a label on the first or last data point is anchored inwards (start / end)
 * so it never runs past the plot edge and gets clipped; others are centred.
 */
export function dateAxisTick(opts: { first?: string; last?: string; ticks: string[]; format: (value: string, index: number) => string }) {
    function DateAxisTick(props: EdgeTickProps): ReactElement {
        const value = String(props.payload?.value ?? '');
        const i = opts.ticks.indexOf(value);
        const anchor = value === opts.last ? 'end' : value === opts.first ? 'start' : 'middle';
        return (
            <text x={props.x} y={props.y} dy="0.71em" textAnchor={anchor} fill={AXIS_TICK.fill} fontSize={AXIS_TICK.fontSize}>
                {opts.format(value, i < 0 ? 0 : i)}
            </text>
        );
    }
    return DateAxisTick;
}
