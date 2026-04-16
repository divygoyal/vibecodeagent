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
  barColor?: string;     // custom bar color (hex/rgb), overrides default emerald
}

function withAlpha(color: string, alpha: string) {
  if (!color.startsWith('#')) return color;
  const normalized = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  return `${normalized}${alpha}`;
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
  const resolvedColor = barColor || '#34d399';

  return (
    <div
      className={`data-row group ${active ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : ''}`}
      onClick={onClick}
    >
      {/* Percentage bar behind text */}
      <div
        className="data-bar"
        style={{
          width: `${percentage * ratio}%`,
          background: `linear-gradient(90deg, ${withAlpha(resolvedColor, '38')} 0%, ${withAlpha(resolvedColor, '20')} 68%, rgba(255,255,255,0.02) 100%)`,
          boxShadow: `inset 0 0 0 1px ${withAlpha(resolvedColor, '18')}`,
        }}
      />

      {/* Content on top */}
      <div className="relative z-10 flex justify-between items-center text-xs w-full gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {barColor && !icon && (
            <span className="w-2 h-2 rounded-[2px] flex-shrink-0 shadow-[0_0_10px_currentColor]" style={{ backgroundColor: barColor, color: barColor }} />
          )}
          {icon}
          <span className="truncate text-zinc-200">{label}</span>
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="data-pct text-xs text-zinc-500 tabular-nums">
            {Math.round(percentage)}%
          </span>
          <span className="text-xs font-medium tabular-nums text-zinc-200 min-w-[32px] text-right">
            <NumberFlow value={value} format={{ notation: 'compact' }} respectMotionPreference={false} />
          </span>
        </div>
      </div>
    </div>
  );
}
