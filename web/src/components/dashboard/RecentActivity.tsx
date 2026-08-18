'use client';

import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Search,
  FileText,
} from 'lucide-react';
import type { AlertItem } from '@/lib/alertEngine';

interface RecentActivityProps {
  alerts: AlertItem[];
  maxItems?: number;
}

function timeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const typeIconMap: Record<string, typeof TrendingUp> = {
  traffic_drop: TrendingDown,
  traffic_spike: TrendingUp,
  ranking_loss: TrendingDown,
  ranking_gain: TrendingUp,
  content_decay: FileText,
  ctr_problem: Search,
  opportunity: Zap,
  new_keyword: Search,
  position_change: TrendingUp,
};

const severityStyles: Record<string, { icon: string; border: string; bg: string }> = {
  critical: { icon: 'text-red-400', border: 'border-l-red-500', bg: 'bg-red-500/[0.06]' },
  warning: { icon: 'text-amber-400', border: 'border-l-amber-500', bg: 'bg-amber-500/[0.06]' },
  info: { icon: 'text-cyan-400', border: 'border-l-cyan-500', bg: 'bg-cyan-500/[0.06]' },
  success: { icon: 'text-emerald-400', border: 'border-l-emerald-500', bg: 'bg-emerald-500/[0.06]' },
};

function categoryHref(category: string) {
  switch (category) {
    case 'traffic': return '/dashboard/analytics';
    case 'content': return '/dashboard/audit';
    case 'rankings': return '/dashboard/seo';
    case 'opportunities': return '/dashboard/seo';
    default: return '/dashboard';
  }
}

/**
 * Recent Activity Feed — shows the last 5-7 events (alerts, position changes, etc.)
 * Each event has an icon, timestamp, short description, and a link to the relevant page.
 */
export default function RecentActivity({ alerts, maxItems = 6 }: RecentActivityProps) {
  const items = alerts.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <div className="border border-white/[0.08] bg-[#020508] p-6">
        <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
          Recent Activity
        </div>
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] px-4 py-5 text-sm text-zinc-400">
          Activity events will appear here as your data accumulates.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.08] bg-[#020508] p-6">
      <div className="inline-flex border border-white/[0.1] bg-[#070c10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
        Recent Activity
      </div>
      <div className="mt-4 space-y-1">
        {items.map((item) => {
          const Icon = typeIconMap[item.type] || AlertTriangle;
          const style = severityStyles[item.severity] || severityStyles.info;
          const href = categoryHref(item.category);

          return (
            <Link
              key={item.id}
              href={href}
              className={`group/ai flex items-start gap-3 border border-white/[0.04] border-l-[3px] ${style.border} px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.03] hover:translate-x-0.5 active:scale-[0.99]`}
            >
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center transition-transform duration-200 group-hover/ai:scale-110 ${style.bg}`}>
                {item.severity === 'success' ? (
                  <CheckCircle2 className={`h-3.5 w-3.5 ${style.icon}`} />
                ) : (
                  <Icon className={`h-3.5 w-3.5 ${style.icon}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-zinc-200">{item.title}</div>
                {item.metric && (
                  <div className="mt-0.5 text-[11px] text-zinc-500">{item.metric}</div>
                )}
              </div>
              <div className="shrink-0 text-[10px] text-zinc-600">{timeAgo(item.timestamp)}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
