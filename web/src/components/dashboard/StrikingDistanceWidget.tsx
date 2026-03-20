'use client';

import { useState, useMemo } from 'react';
import {
  Target, TrendingUp, ArrowUp, Zap, ChevronDown, ChevronUp,
  Search, Sparkles, FileText, Copy
} from 'lucide-react';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface StrikingDistanceWidgetProps {
  queries: QueryData[];
  siteUrl: string;
}

type SortKey = 'query' | 'position' | 'clicks' | 'impressions' | 'potential' | 'priority';
type SortDir = 'asc' | 'desc';

const CTR_AT_5 = 0.095;

function getPriority(impressions: number): { label: string; color: string; order: number } {
  if (impressions >= 500) return { label: 'High', color: 'bg-red-500/10 text-red-400 border-red-500/20', order: 3 };
  if (impressions >= 100) return { label: 'Medium', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', order: 2 };
  return { label: 'Low', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', order: 1 };
}

export default function StrikingDistanceWidget({ queries, siteUrl }: StrikingDistanceWidgetProps) {
  const [sortKey, setSortKey] = useState<SortKey>('potential');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { auditPage, analyzeWithAI, trackKeyword, generateContent, copyToClipboard } = useTableActions();

  const strikingDistance = useMemo(() => {
    return queries
      .filter((q) => q.position >= 11 && q.position <= 20)
      .map((q) => ({
        ...q,
        potential: Math.round(q.impressions * CTR_AT_5),
        priority: getPriority(q.impressions),
      }));
  }, [queries]);

  const sorted = useMemo(() => {
    const arr = [...strikingDistance];
    arr.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortKey) {
        case 'query': aVal = a.query; bVal = b.query; break;
        case 'position': aVal = a.position; bVal = b.position; break;
        case 'clicks': aVal = a.clicks; bVal = b.clicks; break;
        case 'impressions': aVal = a.impressions; bVal = b.impressions; break;
        case 'potential': aVal = a.potential; bVal = b.potential; break;
        case 'priority': aVal = a.priority.order; bVal = b.priority.order; break;
        default: aVal = 0; bVal = 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return arr;
  }, [strikingDistance, sortKey, sortDir]);

  const totalPotential = strikingDistance.reduce((s, q) => s + q.potential, 0);
  const highPriority = strikingDistance.filter((q) => q.priority.label === 'High').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-400" /> : <ChevronDown className="w-3 h-3 text-emerald-400" />;
  };

  if (strikingDistance.length === 0) {
    return (
      <div className="premium-card rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Striking Distance Keywords</h3>
            <p className="text-xs text-zinc-500">Positions 11-20 with promotion potential</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Target className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No striking distance keywords found</p>
          <p className="text-xs text-zinc-600 mt-1">Keywords ranking at positions 11-20 will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
          <Target className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Striking Distance Keywords</h3>
          <p className="text-xs text-zinc-500">Positions 11-20 — push these to page 1</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-white tabular-nums">{strikingDistance.length}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Keywords Found</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-400 tabular-nums">{totalPotential.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Potential Clicks</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-amber-400 tabular-nums">{highPriority}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">High Priority</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {([
                ['query', 'Keyword'],
                ['position', 'Position'],
                ['clicks', 'Clicks'],
                ['impressions', 'Impressions'],
                ['potential', 'If #5'],
                ['priority', 'Priority'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  className="py-2.5 px-3 text-left font-semibold text-zinc-400 cursor-pointer hover:text-white transition-colors select-none"
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
            {sorted.map((q, i) => (
              <tr
                key={q.query}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-2.5 px-3 text-zinc-300 font-medium max-w-[200px] truncate">{q.query}</td>
                <td className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1 text-zinc-300 tabular-nums font-medium">
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                    {q.position.toFixed(1)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{q.clicks.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{q.impressions.toLocaleString()}</td>
                <td className="py-2.5 px-3">
                  <span className="text-emerald-400 font-semibold tabular-nums">+{q.potential.toLocaleString()}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${q.priority.color}`}>
                    {q.priority.label}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <TableActionMenu
                    actions={[
                      auditPage(siteUrl),
                      analyzeWithAI(`Analyze the keyword "${q.query}" which is at position ${q.position.toFixed(1)} with ${q.impressions} impressions. How can I push it to page 1?`, siteUrl),
                      trackKeyword(q.query),
                      generateContent(q.query),
                      copyToClipboard(q.query),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
