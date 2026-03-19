'use client';

import { useState, useMemo, Fragment } from 'react';
import {
  Zap, ChevronDown, ChevronUp, ChevronRight, AlertTriangle,
  Search, Sparkles, Copy, ScanSearch
} from 'lucide-react';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface QueryPageData {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface CtrOptimizationLabProps {
  queryPages: QueryPageData[];
  siteUrl: string;
}

const CTR_BENCHMARKS: Record<number, number> = {
  1: 0.317, 2: 0.247, 3: 0.187, 4: 0.136, 5: 0.095,
  6: 0.062, 7: 0.042, 8: 0.031, 9: 0.024, 10: 0.019,
};

type Priority = 'critical' | 'high' | 'medium' | 'good';

function getCtrPriority(actualCtr: number, expectedCtr: number): Priority {
  if (expectedCtr === 0) return 'good';
  const ratio = actualCtr / expectedCtr;
  if (ratio < 0.5) return 'critical';
  if (ratio < 0.75) return 'high';
  if (ratio < 0.9) return 'medium';
  return 'good';
}

const priorityConfig: Record<Priority, { label: string; color: string; bg: string; order: number }> = {
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', order: 4 },
  high: { label: 'High', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', order: 3 },
  medium: { label: 'Medium', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', order: 2 },
  good: { label: 'Good', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', order: 1 },
};

type SortKey = 'page' | 'missedClicks' | 'priority' | 'queries';
type SortDir = 'asc' | 'desc';

export default function CtrOptimizationLab({ queryPages, siteUrl }: CtrOptimizationLabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('missedClicks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const { auditPage, analyzeWithAI, copyToClipboard } = useTableActions();

  // Only consider queries on page 1 (positions 1-10)
  const ctrData = useMemo(() => {
    return queryPages
      .filter((q) => q.position >= 1 && q.position <= 10)
      .map((q) => {
        const positionBucket = Math.max(1, Math.min(10, Math.round(q.position)));
        const expectedCtr = CTR_BENCHMARKS[positionBucket] || 0;
        const missedClicks = Math.round(q.impressions * Math.max(0, expectedCtr - q.ctr));
        const priority = getCtrPriority(q.ctr, expectedCtr);
        return { ...q, expectedCtr, missedClicks, priority };
      })
      .filter((q) => q.priority !== 'good');
  }, [queryPages]);

  // Group by page
  const pageGroups = useMemo(() => {
    const grouped = new Map<string, typeof ctrData>();
    for (const item of ctrData) {
      const existing = grouped.get(item.page) || [];
      existing.push(item);
      grouped.set(item.page, existing);
    }

    const pages = Array.from(grouped.entries()).map(([page, items]) => {
      const totalMissedClicks = items.reduce((s, i) => s + i.missedClicks, 0);
      const worstPriority = items.reduce((worst, i) => {
        const iOrder = priorityConfig[i.priority].order;
        const wOrder = priorityConfig[worst].order;
        return iOrder > wOrder ? i.priority : worst;
      }, 'good' as Priority);
      return { page, queries: items, totalMissedClicks, priority: worstPriority };
    });

    pages.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortKey) {
        case 'page': aVal = a.page; bVal = b.page; break;
        case 'missedClicks': aVal = a.totalMissedClicks; bVal = b.totalMissedClicks; break;
        case 'priority': aVal = priorityConfig[a.priority].order; bVal = priorityConfig[b.priority].order; break;
        case 'queries': aVal = a.queries.length; bVal = b.queries.length; break;
        default: aVal = 0; bVal = 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });

    return pages;
  }, [ctrData, sortKey, sortDir]);

  const totalMissed = ctrData.reduce((s, q) => s + q.missedClicks, 0);
  const criticalCount = ctrData.filter((q) => q.priority === 'critical').length;
  const highCount = ctrData.filter((q) => q.priority === 'high').length;
  const mediumCount = ctrData.filter((q) => q.priority === 'medium').length;

  const toggleExpand = (page: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

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

  if (ctrData.length === 0) {
    return (
      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">CTR Optimization Lab</h3>
            <p className="text-xs text-zinc-500">Find underperforming titles and descriptions</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Zap className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 font-medium">All keywords performing at benchmark</p>
          <p className="text-xs text-zinc-600 mt-1">No CTR optimization opportunities detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">CTR Optimization Lab</h3>
          <p className="text-xs text-zinc-500">Keywords with CTR below position benchmark</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-white tabular-nums">{totalMissed.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Missed Clicks</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-red-400 tabular-nums">{criticalCount}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Critical</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-amber-400 tabular-nums">{highCount}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">High</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-400 tabular-nums">{mediumCount}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Medium</p>
        </div>
      </div>

      {/* Grouped table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="py-2.5 px-3 w-6" />
              {([
                ['page', 'Page'],
                ['queries', 'Queries'],
                ['missedClicks', 'Missed Clicks'],
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
            {pageGroups.map((group) => {
              const isExpanded = expandedPages.has(group.page);
              const pConf = priorityConfig[group.priority];
              return (
                <Fragment key={group.page}>
                  <tr
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => toggleExpand(group.page)}
                  >
                    <td className="py-2.5 px-3">
                      <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300 font-medium max-w-[280px] truncate">
                      {group.page.replace(/^https?:\/\/[^/]+/, '')}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{group.queries.length}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-red-400 font-semibold tabular-nums">{group.totalMissedClicks.toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${pConf.bg}`}>
                        <span className={pConf.color}>{pConf.label}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <TableActionMenu
                        actions={[
                          analyzeWithAI(`Optimize the title and meta description for ${group.page} to improve CTR. It's missing ${group.totalMissedClicks} clicks.`, siteUrl),
                          auditPage(group.page),
                          copyToClipboard(group.page),
                        ]}
                      />
                    </td>
                  </tr>
                  {isExpanded && group.queries.map((q) => {
                    const qConf = priorityConfig[q.priority];
                    const barWidth = q.expectedCtr > 0 ? Math.min(100, (q.ctr / q.expectedCtr) * 100) : 100;
                    return (
                      <tr
                        key={`${group.page}-${q.query}`}
                        className="border-b border-white/[0.02] bg-white/[0.01]"
                      >
                        <td className="py-2 px-3" />
                        <td className="py-2 px-3 pl-8 text-zinc-400 max-w-[250px] truncate">{q.query}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-[5px] bg-white/[0.04] rounded-full overflow-hidden min-w-[60px] max-w-[100px]">
                              <div
                                className={`h-full rounded-full ${barWidth < 50 ? 'bg-red-500/60' : barWidth < 75 ? 'bg-amber-500/60' : barWidth < 90 ? 'bg-blue-500/60' : 'bg-emerald-500/60'}`}
                                style={{ width: `${barWidth}%`, transition: 'width 0.4s ease' }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
                              {(q.ctr * 100).toFixed(1)}% / {(q.expectedCtr * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-zinc-500 tabular-nums">-{q.missedClicks.toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold border ${qConf.bg}`}>
                            <span className={qConf.color}>{qConf.label}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <TableActionMenu
                            actions={[
                              analyzeWithAI(`The keyword "${q.query}" on page ${q.page} has a CTR of ${(q.ctr * 100).toFixed(1)}% but the benchmark for position ${Math.round(q.position)} is ${(q.expectedCtr * 100).toFixed(1)}%. How can I improve the title and meta description?`, siteUrl),
                              copyToClipboard(q.query),
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

