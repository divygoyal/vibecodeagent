'use client';

import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface IndexingStatusProps {
  indexed?: number;
  errors?: number;
  excluded?: number;
  total?: number;
}

function fmtCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

/**
 * Indexing Status Card — shows page indexing health from Google Search Console.
 * Displays indexed pages, errors, and excluded pages with a simple bar breakdown.
 */
export default function IndexingStatus({ indexed = 0, errors = 0, excluded = 0, total }: IndexingStatusProps) {
  const sum = total ?? (indexed + errors + excluded);
  const hasData = sum > 0;

  const items = [
    { label: 'Indexed', value: indexed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500' },
    { label: 'Errors', value: errors, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500' },
    { label: 'Excluded', value: excluded, icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500' },
  ];

  return (
    <div className="border border-white/[0.08] bg-[#020508] p-6">
      <div className="flex items-center gap-2">
        <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
          Indexing Status
        </div>
        {errors > 0 && (
          <span className="text-[10px] font-medium text-red-400">{errors} error{errors !== 1 ? 's' : ''}</span>
        )}
      </div>

      {!hasData ? (
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] px-4 py-5">
          <div className="text-sm text-zinc-400">Indexing data will appear after Google Search Console processes your site.</div>
          <a href="/dashboard/seo" className="mt-2 inline-flex text-[12px] font-medium text-cyan-400 hover:text-cyan-300">
            View Search Console data
          </a>
        </div>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="mt-4 flex h-2 overflow-hidden bg-[#0a0f14]">
            {items.map((item) => {
              const pct = sum > 0 ? (item.value / sum) * 100 : 0;
              return pct > 0 ? (
                <div
                  key={item.label}
                  className={`h-full ${item.bg}`}
                  style={{ width: `${pct}%` }}
                />
              ) : null;
            })}
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="border border-white/[0.06] bg-[#060b0f] px-3 py-2.5 transition-all duration-200 hover:border-white/[0.12] hover:translate-y-[-1px]">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{item.label}</span>
                  </div>
                  <div className={`mt-1 font-mono text-lg font-semibold ${item.color}`}>
                    {fmtCompact(item.value)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-zinc-500">
            {fmtCompact(sum)} total pages evaluated
          </div>
        </>
      )}
    </div>
  );
}
