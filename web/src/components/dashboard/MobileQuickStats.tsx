'use client';

import { Users, MousePointer, Eye, Hash } from 'lucide-react';

function fmtCompact(value?: number | string) {
  if (value === undefined || value === null) return '0';
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(numeric)) return '0';
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return numeric.toLocaleString();
}

interface MobileQuickStatsProps {
  totalUsers?: number;
  totalPageViews?: number;
  totalClicks?: number;
  avgPosition?: number | string;
}

/**
 * Sticky compact KPI bar visible only on mobile (< lg breakpoint).
 * 48px tall, translucent backdrop-blur, shows 4 key metrics at a glance.
 */
export default function MobileQuickStats({
  totalUsers,
  totalPageViews,
  totalClicks,
  avgPosition,
}: MobileQuickStatsProps) {
  const stats = [
    { icon: Users, label: 'Users', value: fmtCompact(totalUsers) },
    { icon: Eye, label: 'Views', value: fmtCompact(totalPageViews) },
    { icon: MousePointer, label: 'Clicks', value: fmtCompact(totalClicks) },
    { icon: Hash, label: 'Pos', value: avgPosition ? parseFloat(String(avgPosition)).toFixed(1) : '—' },
  ];

  return (
    <div className="sticky top-0 z-30 flex h-12 items-center border-b border-white/[0.06] bg-[#010203]/80 backdrop-blur-xl lg:hidden">
      <div className="grid w-full grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center justify-center gap-1.5 px-1">
              <Icon className="h-3 w-3 shrink-0 text-zinc-500" />
              <div className="min-w-0 text-center">
                <div className="truncate font-mono text-[13px] font-semibold leading-tight text-white">
                  {stat.value}
                </div>
                <div className="truncate text-[8px] uppercase tracking-[0.12em] text-zinc-500">
                  {stat.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
