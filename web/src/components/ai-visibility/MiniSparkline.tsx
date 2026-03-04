'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
    data: number[];
    color: string;
    width?: number;
    height?: number;
}

export default function MiniSparkline({ data, color, width = 80, height = 32 }: MiniSparklineProps) {
    const chartData = data.map((value, i) => ({ v: value, i }));

    return (
        <div style={{ width, height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <defs>
                        <linearGradient id={`sparkGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.5}
                        fill={`url(#sparkGrad-${color.replace('#', '')})`}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={800}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
