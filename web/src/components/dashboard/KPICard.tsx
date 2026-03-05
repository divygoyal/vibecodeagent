'use client';

import { memo } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
  change?: number;
  invertChange?: boolean;
  sparkData: { v: number }[];
  sparkColor: string;
  href: string;
  loading: boolean;
}

function KPICardInner({
  icon: Icon, label, value, change, invertChange, sparkData, sparkColor, href, loading
}: KPICardProps) {
  const positive = change !== undefined ? (invertChange ? change <= 0 : change >= 0) : true;
  const showValue = value !== undefined && value !== null;

  if (loading && !showValue) {
    return (
      <Link href={href} className="bg-zinc-900/50 border border-white/[0.04] rounded-2xl p-4" aria-label={`Loading ${label}`}>
        <div className="flex justify-between mb-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-12 h-4 rounded-full" />
        </div>
        <Skeleton className="w-24 h-7 rounded-md mb-1" />
        <Skeleton className="w-16 h-3 rounded-md mb-2" />
        <Skeleton className="w-full h-8 rounded-md opacity-30" />
      </Link>
    );
  }

  const sparkMin = sparkData.length > 0 ? Math.min(...sparkData.map(d => d.v)) : 0;
  const sparkMax = sparkData.length > 0 ? Math.max(...sparkData.map(d => d.v)) : 0;
  const numVal = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  const prev = change !== undefined && change !== 0 ? Math.round(numVal / (1 + change / 100)) : null;

  return (
    <Link href={href} className="relative bg-zinc-900/50 border border-white/[0.04] rounded-2xl p-4 hover:border-white/[0.1] hover:bg-white/[0.02] hover:shadow-[0_0_30px_rgba(255,255,255,0.02)] transition-all duration-300 group" aria-label={`${label}: ${showValue ? value?.toLocaleString() : 'No data'}${change !== undefined ? `, ${change > 0 ? '+' : ''}${change}% change` : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-emerald-500/20 group-hover:to-cyan-500/20 group-hover:shadow-[0_0_12px_rgba(52,211,153,0.15)] transition-all duration-300">
          <Icon className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 transition-colors duration-300" />
        </div>
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`} aria-label={`${change > 0 ? '+' : ''}${change}% change`}>
            {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>

      <div className="text-xl font-bold text-white mb-0.5 font-mono">
        {showValue ? value?.toLocaleString() : '—'}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-zinc-500 font-medium tracking-wide uppercase">{label}</span>
        {prev !== null && <span className="text-[9px] text-zinc-600 font-mono">was {prev.toLocaleString()}</span>}
      </div>

      {sparkData.length > 0 && (
        <div className="h-8" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparkColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={sparkColor} fill={`url(#spark-${label})`} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hover tooltip */}
      {showValue && (
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-52 px-4 py-3 rounded-xl bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)] opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-300 ease-out pointer-events-none z-50" role="tooltip">
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-[2px] rounded-full ${positive ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent' : 'bg-gradient-to-r from-transparent via-red-400 to-transparent'}`} />
          <div className="text-[11px] text-white font-semibold mb-2 flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${positive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {label}
          </div>
          <div className="space-y-1.5">
            {prev !== null && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Previous</span>
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
              <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-white/[0.06]">
                <span className="text-[10px] text-zinc-500">Trend</span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? '↗' : '↘'} {positive ? '+' : ''}{change}%
                </span>
              </div>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0c0c14]/95" />
        </div>
      )}
    </Link>
  );
}

const KPICard = memo(KPICardInner);
export default KPICard;
