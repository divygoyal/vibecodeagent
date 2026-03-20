'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ChevronUp,
  Sparkles, Copy, ScanSearch, RefreshCw, Minus, Plus, Star
} from 'lucide-react';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SilentDecayMonitorProps {
  queries: QueryData[];
  comparisonQueries: QueryData[];
  siteUrl: string;
}

type Status = 'winner' | 'loser' | 'stable' | 'new' | 'lost';
type Metric = 'clicks' | 'impressions';
type SortKey = 'query' | 'current' | 'previous' | 'change' | 'status';
type SortDir = 'asc' | 'desc';

const statusConfig: Record<Status, { label: string; color: string; bg: string; icon: any; order: number }> = {
  winner: { label: 'Winner', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: TrendingUp, order: 5 },
  loser: { label: 'Loser', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: TrendingDown, order: 4 },
  stable: { label: 'Stable', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', icon: Minus, order: 1 },
  new: { label: 'New', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Plus, order: 3 },
  lost: { label: 'Lost', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: Star, order: 2 },
};

const TIMEFRAMES = [
  { value: '7d', label: '7 days' },
  { value: '28d', label: '28 days' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
];

export default function SilentDecayMonitor({ queries, comparisonQueries, siteUrl }: SilentDecayMonitorProps) {
  const [metric, setMetric] = useState<Metric>('clicks');
  const [threshold, setThreshold] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');

  const { auditPage, analyzeWithAI, trackKeyword, copyToClipboard } = useTableActions();

  // Build a lookup for comparison data
  const compMap = useMemo(() => {
    const map = new Map<string, QueryData>();
    for (const q of comparisonQueries) {
      map.set(q.query, q);
    }
    return map;
  }, [comparisonQueries]);

  const currentSet = useMemo(() => new Set(queries.map((q) => q.query)), [queries]);

  const decayData = useMemo(() => {
    const results: {
      query: string;
      current: number;
      previous: number;
      change: number;
      status: Status;
    }[] = [];

    // Current queries
    for (const q of queries) {
      const comp = compMap.get(q.query);
      const currentVal = metric === 'clicks' ? q.clicks : q.impressions;

      if (!comp) {
        results.push({ query: q.query, current: currentVal, previous: 0, change: 100, status: 'new' });
        continue;
      }

      const previousVal = metric === 'clicks' ? comp.clicks : comp.impressions;
      const change = previousVal > 0 ? ((currentVal - previousVal) / previousVal) * 100 : currentVal > 0 ? 100 : 0;
      let status: Status = 'stable';
      if (change > threshold) status = 'winner';
      else if (change < -threshold) status = 'loser';

      results.push({ query: q.query, current: currentVal, previous: previousVal, change: Math.round(change * 10) / 10, status });
    }

    // Lost queries (in comparison but not current)
    for (const q of comparisonQueries) {
      if (!currentSet.has(q.query)) {
        const previousVal = metric === 'clicks' ? q.clicks : q.impressions;
        results.push({ query: q.query, current: 0, previous: previousVal, change: -100, status: 'lost' });
      }
    }

    return results;
  }, [queries, comparisonQueries, compMap, currentSet, metric, threshold]);

  const filtered = useMemo(() => {
    const arr = statusFilter === 'all' ? decayData : decayData.filter((d) => d.status === statusFilter);
    arr.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortKey) {
        case 'query': aVal = a.query; bVal = b.query; break;
        case 'current': aVal = a.current; bVal = b.current; break;
        case 'previous': aVal = a.previous; bVal = b.previous; break;
        case 'change': aVal = a.change; bVal = b.change; break;
        case 'status': aVal = statusConfig[a.status].order; bVal = statusConfig[b.status].order; break;
        default: aVal = 0; bVal = 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return arr;
  }, [decayData, statusFilter, sortKey, sortDir]);

  const winnersCount = decayData.filter((d) => d.status === 'winner').length;
  const losersCount = decayData.filter((d) => d.status === 'loser').length;
  const newCount = decayData.filter((d) => d.status === 'new').length;
  const lostCount = decayData.filter((d) => d.status === 'lost').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'change' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-400" /> : <ChevronDown className="w-3 h-3 text-emerald-400" />;
  };

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Silent Decay Monitor</h3>
            <p className="text-xs text-zinc-500">Track keyword performance changes</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Metric toggle */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
          {(['clicks', 'impressions'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                metric === m ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Threshold slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Threshold</span>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-20 h-1 accent-emerald-400"
          />
          <span className="text-xs text-zinc-300 tabular-nums font-medium w-8">{threshold}%</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {([
          { label: 'Winners', count: winnersCount, color: 'text-emerald-400', status: 'winner' as Status },
          { label: 'Losers', count: losersCount, color: 'text-red-400', status: 'loser' as Status },
          { label: 'New', count: newCount, color: 'text-blue-400', status: 'new' as Status },
          { label: 'Lost', count: lostCount, color: 'text-purple-400', status: 'lost' as Status },
        ]).map((stat) => (
          <button
            key={stat.label}
            onClick={() => setStatusFilter(statusFilter === stat.status ? 'all' : stat.status)}
            className={`bg-white/[0.03] border rounded-xl p-3 text-center transition-all ${
              statusFilter === stat.status ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/[0.06] hover:border-white/[0.1]'
            }`}
          >
            <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.count}</p>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {([
                ['query', 'Keyword'],
                ['current', 'Current'],
                ['previous', 'Previous'],
                ['change', 'Change'],
                ['status', 'Status'],
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-zinc-500 text-sm">
                  No keywords match the current filters
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const sConf = statusConfig[d.status];
                const StatusIcon = sConf.icon;
                return (
                  <tr
                    key={d.query}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-2.5 px-3 text-zinc-300 font-medium max-w-[200px] truncate">{d.query}</td>
                    <td className="py-2.5 px-3 text-zinc-300 tabular-nums">{d.current.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-zinc-500 tabular-nums">{d.previous.toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                        d.change > 0 ? 'text-emerald-400' : d.change < 0 ? 'text-red-400' : 'text-zinc-500'
                      }`}>
                        {d.change > 0 ? <TrendingUp className="w-3 h-3" /> : d.change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {d.change > 0 ? '+' : ''}{d.change}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sConf.bg}`}>
                        <StatusIcon className={`w-3 h-3 ${sConf.color}`} />
                        <span className={sConf.color}>{sConf.label}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <TableActionMenu
                        actions={[
                          analyzeWithAI(
                            d.status === 'loser' || d.status === 'lost'
                              ? `The keyword "${d.query}" has declined by ${Math.abs(d.change)}% in ${metric}. What could be causing this decay and how can I recover?`
                              : `Analyze the performance of "${d.query}" which changed by ${d.change}% in ${metric}.`,
                            siteUrl
                          ),
                          auditPage(siteUrl),
                          trackKeyword(d.query),
                          copyToClipboard(d.query),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
