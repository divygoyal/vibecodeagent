'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { WidgetConfig } from '@/types/dashboard';

// ── Types ──

interface KPIData {
  value: number;
  previousValue?: number;
  label?: string;
}

interface KPIWidgetProps {
  config: WidgetConfig;
  data?: KPIData;
  isLoading?: boolean;
}

// ── Helpers ──

function formatValue(value: number, metric?: string): string {
  if (metric === 'bounceRate' || metric === 'engagementRate' || metric === 'ctr') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric === 'averageSessionDuration') {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}m ${s}s`;
  }
  if (metric === 'position') {
    return value.toFixed(1);
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Component ──

export default function KPIWidget({ config, data, isLoading }: KPIWidgetProps) {
  const change = useMemo(() => {
    if (!data || data.previousValue == null) return null;
    return calcChange(data.value, data.previousValue);
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col justify-center px-4 py-3 animate-pulse">
        <div className="h-3 w-16 bg-white/5 rounded mb-3" />
        <div className="h-7 w-24 bg-white/5 rounded mb-2" />
        <div className="h-3 w-12 bg-white/5 rounded" />
      </div>
    );
  }

  const displayValue = data ? formatValue(data.value, config.metric) : '--';
  const isPositionMetric = config.metric === 'position';
  // For position, lower is better so invert the color logic
  const isPositive = change !== null ? (isPositionMetric ? change < 0 : change > 0) : null;

  return (
    <div className="h-full flex flex-col justify-center px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--db-text)]/60 uppercase tracking-wider truncate mb-1">
        {config.title}
      </p>
      <p className="text-2xl sm:text-3xl font-bold text-[var(--db-text)] tabular-nums truncate">
        {displayValue}
      </p>
      {config.showComparison && change !== null && change !== 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          {isPositive ? (
            <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
          )}
          <span className={`text-[11px] font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {change > 0 ? '+' : ''}{change}%
          </span>
          <span className="text-[10px] text-[var(--db-text)]/40 ml-0.5">vs prev.</span>
        </div>
      )}
    </div>
  );
}
