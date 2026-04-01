'use client';

import { SquareArrowOutUpRight } from 'lucide-react';

interface DataRowProps {
  label: string;
  value: number;
  percentage: number;    // 0-100
  maxPercentage: number; // largest percentage in the list (for bar ratio)
  icon?: React.ReactNode;
  href?: string;         // external link
  onClick?: () => void;
  active?: boolean;
  tone?: 'mint' | 'cyan' | 'violet' | 'amber' | 'rose' | 'blue';
  className?: string;
}

function formatCompactValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
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
  tone = 'mint',
  className = '',
}: DataRowProps) {
  const ratio = maxPercentage > 0 ? 100 / maxPercentage : 1;
  const interactive = Boolean(onClick);

  return (
    <div
      className={`data-row analytics-ranked-row group ${active ? 'is-active' : ''} ${interactive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      onClick={onClick}
      data-tone={tone}
    >
      {/* Percentage bar behind text */}
      <div
        className="data-bar"
        style={{ width: `${percentage * ratio}%` }}
      />

      {/* Content on top */}
      <div className="relative z-10 flex justify-between items-center text-xs w-full gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon}
          <span className="truncate font-semibold text-zinc-100">{label}</span>
          {href && (
            <a
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              onClick={e => e.stopPropagation()}
              className="data-link shrink-0"
            >
              <SquareArrowOutUpRight className="w-3 h-3 text-zinc-600 hover:text-zinc-300" strokeWidth={2.5} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="data-pct text-[11px] text-zinc-500 tabular-nums">
            {Math.round(percentage)}%
          </span>
          <span className="min-w-[60px] text-right text-xs font-semibold tabular-nums text-zinc-100" title={value.toLocaleString()}>
            {formatCompactValue(value)}
          </span>
        </div>
      </div>
    </div>
  );
}
