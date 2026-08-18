'use client';
import React from 'react';

interface SparklineCellProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string; // override color
  className?: string;
}

export function SparklineCell({ data, width = 40, height = 16, color, className }: SparklineCellProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Auto color: green if trending up, red if down
  const autoColor = data[data.length - 1] >= data[0] ? '#34d399' : '#f87171';
  const strokeColor = color || autoColor;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
