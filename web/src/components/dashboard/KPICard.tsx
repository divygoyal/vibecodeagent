'use client';

import { memo } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Zap, ArrowRight, Sparkles } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export interface KPIAction {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
  change?: number;
  invertChange?: boolean;
  sparkData: { v: number }[];
  sparkColor: string;
  href: string;
  loading: boolean;
  /** Short AI-powered suggestion shown on hover */
  boostTip?: string;
  /** Actionable items the user can take */
  actions?: KPIAction[];
  /** Status context line, e.g. "32 critical issues" */
  statusLine?: string;
  /** Status severity for coloring */
  statusSeverity?: 'good' | 'warning' | 'critical';
}

function KPICardInner({
  icon: Icon, label, value, change, invertChange, sparkData, sparkColor, href, loading,
  boostTip, actions, statusLine, statusSeverity,
}: KPICardProps) {
  const positive = change !== undefined ? (invertChange ? change <= 0 : change >= 0) : true;
  const showValue = value !== undefined && value !== null;

  if (loading && !showValue) {
    return (
      <Link href={href} className="kpi-card-skeleton bg-zinc-900/60 border border-white/[0.06] rounded-2xl p-5" aria-label={`Loading ${label}`}>
        <div className="flex justify-between mb-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="w-14 h-5 rounded-full" />
        </div>
        <Skeleton className="w-28 h-8 rounded-md mb-1.5" />
        <Skeleton className="w-20 h-3.5 rounded-md mb-3" />
        <Skeleton className="w-full h-10 rounded-md opacity-30" />
      </Link>
    );
  }

  const sparkMin = sparkData.length > 0 ? Math.min(...sparkData.map(d => d.v)) : 0;
  const sparkMax = sparkData.length > 0 ? Math.max(...sparkData.map(d => d.v)) : 0;
  const numVal = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  const prev = change !== undefined && change !== 0 ? Math.round(numVal / (1 + change / 100)) : null;

  // Format value with commas
  const displayValue = showValue
    ? typeof value === 'number' ? value.toLocaleString() : value
    : '—';

  const severityColor = statusSeverity === 'critical' ? 'text-red-400' : statusSeverity === 'warning' ? 'text-amber-400' : 'text-emerald-400';
  const severityDot = statusSeverity === 'critical' ? 'bg-red-400' : statusSeverity === 'warning' ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="relative group">
      <Link
        href={href}
        className="relative block bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition-all duration-500"
        aria-label={`${label}: ${showValue ? displayValue : 'No data'}${change !== undefined ? `, ${change > 0 ? '+' : ''}${change}% change` : ''}`}
      >
        {/* Subtle gradient glow on hover — clipped to card bounds */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div
            className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-3xl"
            style={{ background: `radial-gradient(circle, ${sparkColor}15, transparent)` }}
          />
        </div>

        {/* Top row: Icon + Change badge */}
        <div className="flex items-center justify-between mb-3 relative">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 border"
            style={{
              background: `linear-gradient(135deg, ${sparkColor}12, ${sparkColor}06)`,
              borderColor: `${sparkColor}20`,
            }}
          >
            <span style={{ color: sparkColor }} className="flex items-center justify-center transition-all duration-500">
              <Icon className="w-[18px] h-[18px]" />
            </span>
          </div>
          {change !== undefined && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-sm ${
                positive
                  ? 'bg-emerald-500/[0.08] border-emerald-500/[0.15] text-emerald-400'
                  : 'bg-red-500/[0.08] border-red-500/[0.15] text-red-400'
              }`}
            >
              {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {change > 0 ? '+' : ''}{change}%
            </span>
          )}
        </div>

        {/* Value */}
        <div className="text-[26px] font-extrabold text-white mb-0.5 font-mono tracking-tight relative">
          {displayValue}
        </div>

        {/* Label + Previous */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-zinc-500 font-medium tracking-wide uppercase">{label}</span>
          {prev !== null && (
            <span className="text-[10px] text-zinc-600 font-mono">
              was {prev.toLocaleString()}
            </span>
          )}
        </div>

        {/* Status line */}
        {statusLine && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className={`w-1.5 h-1.5 rounded-full ${severityDot} animate-pulse`} />
            <span className={`text-[10px] font-medium ${severityColor}`}>{statusLine}</span>
          </div>
        )}

        {/* Sparkline */}
        {sparkData.length > 0 && (
          <div className={`h-10 -mx-1 relative ${!statusLine ? 'mt-2' : ''}`} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={sparkColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={sparkColor} fill={`url(#spark-${label})`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Quick action hint on hover */}
        <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ArrowRight className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500 font-medium">View details</span>
        </div>
      </Link>

      {/* ─── Hover Tooltip — positioned above the card ─── */}
      {showValue && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-72 px-4 py-4 rounded-xl bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)] opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-300 ease-out pointer-events-none z-50" role="tooltip">
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-[2px] rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${sparkColor}, transparent)` }}
          />

          {/* Header */}
          <div className="text-[11px] text-white font-semibold mb-3 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sparkColor }} />
            {label} Overview
          </div>

          {/* Stats grid */}
          <div className="space-y-1.5 mb-3">
            {prev !== null && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Previous period</span>
                <span className="text-[10px] text-zinc-300 font-mono font-medium">{prev.toLocaleString()}</span>
              </div>
            )}
            {sparkData.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Range</span>
                <span className="text-[10px] text-zinc-300 font-mono font-medium">{sparkMin.toLocaleString()} – {sparkMax.toLocaleString()}</span>
              </div>
            )}
            {change !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Trend</span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? '↗' : '↘'} {positive ? '+' : ''}{change}%
                </span>
              </div>
            )}
          </div>

          {/* AI Boost Tip */}
          {boostTip && (
            <div className="bg-gradient-to-r from-emerald-500/[0.06] to-cyan-500/[0.04] border border-emerald-500/[0.1] rounded-lg px-3 py-2 mb-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-emerald-300/90 leading-relaxed">{boostTip}</span>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {actions && actions.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/[0.06]">
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold mb-1.5">Quick Actions</div>
              {actions.map((action, i) => {
                const ActionIcon = action.icon || Zap;
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-zinc-400">
                    <ActionIcon className="w-3 h-3 flex-shrink-0" style={{ color: sparkColor }} />
                    <span className="truncate">{action.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0c0c14]/95" />
        </div>
      )}
    </div>
  );
}

const KPICard = memo(KPICardInner);
export default KPICard;
