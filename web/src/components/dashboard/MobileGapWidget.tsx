'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Smartphone, Monitor, ChevronDown, ChevronUp, ArrowDownUp,
  TrendingDown, TrendingUp, AlertTriangle
} from 'lucide-react';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface MobileGapData {
  query: string;
  page: string;
  mobilePosition: number;
  desktopPosition: number;
  mobileCtr: number;
  desktopCtr: number;
  mobileClicks: number;
  desktopClicks: number;
  mobileImpressions: number;
  desktopImpressions: number;
  gap: number;
  impact: number;
}

interface MobileGapWidgetProps {
  siteUrl: string | null;
}

type SortKey = 'query' | 'mobilePosition' | 'desktopPosition' | 'gap' | 'mobileCtr' | 'desktopCtr' | 'impact';
type SortDir = 'asc' | 'desc';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error: any = new Error(body.error || `HTTP error! status: ${res.status}`);
    error.info = body;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

function getImpactLevel(impact: number, allImpacts: number[]): { label: string; color: string } {
  if (allImpacts.length === 0) return { label: 'Low', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
  const sorted = [...allImpacts].sort((a, b) => b - a);
  const p20 = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;

  if (impact >= p20) return { label: 'High', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
  if (impact >= p50) return { label: 'Medium', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
  return { label: 'Low', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
}

export default function MobileGapWidget({ siteUrl }: MobileGapWidgetProps) {
  const [sortKey, setSortKey] = useState<SortKey>('impact');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { auditPage, analyzeWithAI, copyToClipboard } = useTableActions();

  const { data: response, isLoading, error } = useSWR(
    siteUrl ? `/api/seo/mobile-gap?siteUrl=${encodeURIComponent(siteUrl)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const gapData: MobileGapData[] = response?.data || [];

  const allImpacts = useMemo(() => gapData.map((d) => d.impact), [gapData]);

  const sorted = useMemo(() => {
    const arr = [...gapData];
    arr.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortKey) {
        case 'query': aVal = a.query; bVal = b.query; break;
        case 'mobilePosition': aVal = a.mobilePosition; bVal = b.mobilePosition; break;
        case 'desktopPosition': aVal = a.desktopPosition; bVal = b.desktopPosition; break;
        case 'gap': aVal = a.gap; bVal = b.gap; break;
        case 'mobileCtr': aVal = a.mobileCtr; bVal = b.mobileCtr; break;
        case 'desktopCtr': aVal = a.desktopCtr; bVal = b.desktopCtr; break;
        case 'impact': aVal = a.impact; bVal = b.impact; break;
        default: aVal = 0; bVal = 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return arr;
  }, [gapData, sortKey, sortDir]);

  const totalGaps = gapData.length;
  const avgGap = totalGaps > 0 ? Math.round((gapData.reduce((s, d) => s + d.gap, 0) / totalGaps) * 10) / 10 : 0;
  const highestImpact = gapData.length > 0 ? gapData[0]?.query : '-';

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'query' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-400" /> : <ChevronDown className="w-3 h-3 text-emerald-400" />;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mobile vs Desktop Gap</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading mobile performance data...</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="h-6 w-12 bg-white/[0.06] rounded animate-pulse mx-auto mb-2" />
              <div className="h-3 w-16 bg-white/[0.04] rounded animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error or no site
  if (error || !siteUrl) {
    return (
      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mobile vs Desktop Gap</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Compare mobile and desktop rankings</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Smartphone className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {!siteUrl ? 'Select a site to view mobile gaps' : 'Failed to load mobile gap data'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {error?.message || 'Connect Google Search Console to get started'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (gapData.length === 0) {
    return (
      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mobile vs Desktop Gap</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Compare mobile and desktop rankings</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Smartphone className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No mobile-desktop gaps detected</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Your rankings are consistent across devices</p>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mobile vs Desktop Gap</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Queries where mobile and desktop rankings diverge</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{totalGaps}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Queries with Gaps</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className={`text-lg font-bold tabular-nums ${avgGap < 0 ? 'text-red-400' : avgGap > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {avgGap > 0 ? '+' : ''}{avgGap}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Avg Gap</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-amber-400 tabular-nums truncate max-w-full" title={highestImpact}>
            {highestImpact.length > 15 ? highestImpact.slice(0, 15) + '...' : highestImpact}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Highest Impact</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {([
                ['query', 'Keyword'],
                ['mobilePosition', 'Mobile Pos.'],
                ['desktopPosition', 'Desktop Pos.'],
                ['gap', 'Gap'],
                ['mobileCtr', 'Mobile CTR'],
                ['desktopCtr', 'Desktop CTR'],
                ['impact', 'Impact'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  className="py-2.5 px-3 text-left font-semibold cursor-pointer hover:text-white transition-colors select-none"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => toggleSort(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
              <th className="py-2.5 px-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const impactLevel = getImpactLevel(d.impact, allImpacts);
              const mobileWorse = d.gap < 0;
              return (
                <tr
                  key={d.query}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3 font-medium max-w-[180px] truncate" style={{ color: 'var(--text-primary)' }}>
                    {d.query}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-blue-500/10 text-blue-400 border-blue-500/20">
                      <Smartphone className="w-3 h-3" />
                      {d.mobilePosition}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
                      <Monitor className="w-3 h-3" />
                      {d.desktopPosition}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                      mobileWorse ? 'text-red-400' : d.gap > 0 ? 'text-emerald-400' : 'text-zinc-500'
                    }`}>
                      {mobileWorse ? <TrendingDown className="w-3 h-3" /> : d.gap > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                      {d.gap > 0 ? '+' : ''}{d.gap}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {(d.mobileCtr * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {(d.desktopCtr * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${impactLevel.color}`}>
                      {impactLevel.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <TableActionMenu
                      actions={[
                        analyzeWithAI(
                          `The keyword "${d.query}" has a mobile position of ${d.mobilePosition} vs desktop position of ${d.desktopPosition} (gap: ${d.gap}). How can I optimize mobile performance for this keyword?`,
                          siteUrl || undefined
                        ),
                        auditPage(siteUrl || ''),
                        analyzeWithAI(
                          `Analyze why "${d.query}" performs differently on mobile vs desktop. Mobile CTR: ${(d.mobileCtr * 100).toFixed(1)}%, Desktop CTR: ${(d.desktopCtr * 100).toFixed(1)}%`,
                          siteUrl || undefined
                        ),
                        copyToClipboard(d.query),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
