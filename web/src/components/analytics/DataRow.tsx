'use client';

import { SquareArrowOutUpRight } from 'lucide-react';
import NumberFlow from '@number-flow/react';

interface DataRowProps {
  label: string;
  value: number;
  percentage: number;    // 0-100
  maxPercentage: number; // largest percentage in the list (for bar ratio)
  icon?: React.ReactNode;
  href?: string;         // external link
  onClick?: () => void;
  active?: boolean;
  barColor?: string;     // bar colour (any CSS colour); neutral when absent
}

export default function DataRow({
  label,
  value,
  percentage,
  maxPercentage,
  icon,
  href,
  onClick,
  active,
  barColor,
}: DataRowProps) {
  const ratio = maxPercentage > 0 ? 100 / maxPercentage : 1;
  const color = barColor || 'var(--tc-fg-muted)';

  return (
    <div
      className={`group relative flex h-8 items-center rounded-md px-2 ${onClick ? 'cursor-pointer' : ''} ${active ? 'bg-subtle' : 'hover:bg-subtle'}`}
      onClick={onClick}
    >
      {/* Share bar behind the text: the row's colour at low strength, no gradient */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-400"
        style={{ width: `${percentage * ratio}%`, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
      />

      <div className="relative flex w-full items-center justify-between gap-2 text-body-sm">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {barColor && !icon && (
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: barColor }} />
          )}
          {icon}
          <span className="truncate text-fg">{label}</span>
          {href && (
            <a
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              onClick={e => e.stopPropagation()}
              className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
              aria-label={`Open ${label}`}
            >
              <SquareArrowOutUpRight className="size-3" strokeWidth={1.75} />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-meta text-fg-muted">
            {Math.round(percentage)}%
          </span>
          <span className="min-w-[32px] text-right font-medium text-fg">
            <NumberFlow value={value} format={{ notation: 'compact' }} respectMotionPreference={false} />
          </span>
        </div>
      </div>
    </div>
  );
}
