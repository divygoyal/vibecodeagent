'use client';

import { useState, useMemo } from 'react';
import {
  Skull, Ghost, Eye, AlertTriangle, ChevronDown, ChevronUp,
  Trash2, ArrowRightLeft, Wand2
} from 'lucide-react';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface PageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ZombiePageMonitorProps {
  data: PageData[];
}

type Diagnosis = 'zombie' | 'ghost' | 'phantom';
type SortKey = 'page' | 'impressions' | 'diagnosis' | 'action';
type SortDir = 'asc' | 'desc';

interface ZombiePage {
  page: string;
  impressions: number;
  position: number;
  ctr: number;
  diagnosis: Diagnosis;
  recommendation: string;
}

const diagnosisConfig: Record<Diagnosis, { label: string; color: string; bg: string; icon: any; order: number }> = {
  zombie: { label: 'Zombie', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: Skull, order: 1 },
  ghost: { label: 'Ghost', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: Ghost, order: 2 },
  phantom: { label: 'Phantom', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: Eye, order: 3 },
};

const recommendations: Record<Diagnosis, string> = {
  zombie: 'Consider removing or noindexing',
  ghost: 'Redirect to stronger page',
  phantom: 'Optimize title & meta for CTR',
};

function classify(page: PageData): Diagnosis | null {
  if (page.clicks !== 0) return null;
  if (page.impressions < 20) return 'zombie';
  if (page.impressions < 100) return 'ghost';
  return 'phantom';
}

function truncateUrl(url: string, max = 50): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length <= max) return path;
    return path.slice(0, max - 3) + '...';
  } catch {
    if (url.length <= max) return url;
    return url.slice(0, max - 3) + '...';
  }
}

export default function ZombiePageMonitor({ data }: ZombiePageMonitorProps) {
  const [sortKey, setSortKey] = useState<SortKey>('impressions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [diagnosisFilter, setDiagnosisFilter] = useState<Diagnosis | 'all'>('all');

  const { auditPage, analyzeWithAI, copyToClipboard, openExternal } = useTableActions();

  const zombiePages = useMemo(() => {
    const results: ZombiePage[] = [];
    for (const page of data) {
      const diagnosis = classify(page);
      if (!diagnosis) continue;
      results.push({
        page: page.page,
        impressions: page.impressions,
        position: page.position,
        ctr: page.ctr,
        diagnosis,
        recommendation: recommendations[diagnosis],
      });
    }
    return results;
  }, [data]);

  const filtered = useMemo(() => {
    const arr = diagnosisFilter === 'all'
      ? [...zombiePages]
      : zombiePages.filter((z) => z.diagnosis === diagnosisFilter);

    arr.sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      switch (sortKey) {
        case 'page': aVal = a.page; bVal = b.page; break;
        case 'impressions': aVal = a.impressions; bVal = b.impressions; break;
        case 'diagnosis': aVal = diagnosisConfig[a.diagnosis].order; bVal = diagnosisConfig[b.diagnosis].order; break;
        case 'action': aVal = a.recommendation; bVal = b.recommendation; break;
        default: aVal = 0; bVal = 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return arr;
  }, [zombiePages, diagnosisFilter, sortKey, sortDir]);

  const zombieCount = zombiePages.filter((z) => z.diagnosis === 'zombie').length;
  const ghostCount = zombiePages.filter((z) => z.diagnosis === 'ghost').length;
  const phantomCount = zombiePages.filter((z) => z.diagnosis === 'phantom').length;
  const totalWaste = zombiePages.reduce((s, z) => s + z.impressions, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'page' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-emerald-400" /> : <ChevronDown className="w-3 h-3 text-emerald-400" />;
  };

  if (zombiePages.length === 0) {
    return (
      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-purple-500/20 border border-red-500/20 flex items-center justify-center">
            <Skull className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Zombie Page Monitor</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pages consuming crawl budget with zero clicks</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Skull className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No zombie pages found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>All your pages are generating clicks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-purple-500/20 border border-red-500/20 flex items-center justify-center">
          <Skull className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Zombie Page Monitor</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pages consuming crawl budget with zero clicks</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {([
          { label: 'Zombies', count: zombieCount, color: 'text-red-400', diagnosis: 'zombie' as Diagnosis },
          { label: 'Ghosts', count: ghostCount, color: 'text-amber-400', diagnosis: 'ghost' as Diagnosis },
          { label: 'Phantoms', count: phantomCount, color: 'text-purple-400', diagnosis: 'phantom' as Diagnosis },
          { label: 'Wasted Impr.', count: totalWaste, color: 'text-zinc-300', diagnosis: null },
        ]).map((stat) => (
          <button
            key={stat.label}
            onClick={() => {
              if (stat.diagnosis) {
                setDiagnosisFilter(diagnosisFilter === stat.diagnosis ? 'all' : stat.diagnosis);
              }
            }}
            className={`bg-white/[0.03] border rounded-xl p-3 text-center transition-all ${
              stat.diagnosis && diagnosisFilter === stat.diagnosis
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-white/[0.06] hover:border-white/[0.1]'
            } ${stat.diagnosis ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.count.toLocaleString()}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {([
                ['page', 'URL'],
                ['impressions', 'Impressions'],
                ['diagnosis', 'Diagnosis'],
                ['action', 'Recommended Action'],
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
              <th className="py-2.5 px-3 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Waste</th>
              <th className="py-2.5 px-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((z) => {
              const dConf = diagnosisConfig[z.diagnosis];
              const DiagIcon = dConf.icon;
              return (
                <tr
                  key={z.page}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3 max-w-[220px]">
                    <span className="font-medium truncate block" style={{ color: 'var(--text-primary)' }} title={z.page}>
                      {truncateUrl(z.page)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {z.impressions.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${dConf.bg}`}>
                      <DiagIcon className={`w-3 h-3 ${dConf.color}`} />
                      <span className={dConf.color}>{dConf.label}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {z.recommendation}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-red-400 font-semibold tabular-nums">{z.impressions.toLocaleString()}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <TableActionMenu
                      actions={[
                        auditPage(z.page),
                        analyzeWithAI(
                          `This page "${z.page}" is a ${z.diagnosis} page with ${z.impressions} impressions but 0 clicks. Diagnosis: ${z.recommendation}. What should I do?`
                        ),
                        copyToClipboard(z.page),
                        openExternal(z.page),
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
