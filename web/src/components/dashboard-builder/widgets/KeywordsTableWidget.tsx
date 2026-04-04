'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { WidgetConfig } from '@/types/dashboard';

interface KeywordRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface KeywordsTableWidgetProps {
  config: WidgetConfig;
  data?: KeywordRow[];
  isLoading?: boolean;
  onInteraction?: (dimension: string, value: string) => void;
}

const COLUMNS = [
  { key: 'query', label: 'Keyword', align: 'left' as const },
  { key: 'clicks', label: 'Clicks', align: 'right' as const },
  { key: 'impressions', label: 'Impressions', align: 'right' as const },
  { key: 'ctr', label: 'CTR', align: 'right' as const },
  { key: 'position', label: 'Position', align: 'right' as const },
];

function formatVal(key: string, value: unknown): string {
  if (value == null) return '--';
  if (key === 'ctr') return `${((value as number) * 100).toFixed(1)}%`;
  if (key === 'position') return (value as number).toFixed(1);
  if (typeof value === 'number') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return value.toLocaleString();
  }
  return String(value);
}

export default function KeywordsTableWidget({ config, data, isLoading, onInteraction }: KeywordsTableWidgetProps) {
  const [sortKey, setSortKey] = useState<string>('clicks');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.query.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey as keyof KeywordRow];
      const bVal = b[sortKey as keyof KeywordRow];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, sortKey, sortDir, search]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full px-3 py-2 animate-pulse">
        <div className="h-3 w-24 bg-white/5 rounded mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 bg-white/5 rounded mb-1.5" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-3 py-2 overflow-hidden">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <p className="text-xs font-medium text-[var(--db-text)]/60 truncate">
          {config.title}
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--db-text)]/30" />
          <input
            type="text"
            placeholder="Filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-28 pl-6 pr-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-[var(--db-text)] placeholder:text-[var(--db-text)]/30 outline-none focus:border-[var(--db-primary)]/50"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`py-1.5 px-2 font-medium text-[var(--db-text)]/50 cursor-pointer hover:text-[var(--db-text)]/80 transition-colors whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((row, i) => (
              <tr
                key={i}
                className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${onInteraction ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (onInteraction && row.query) {
                    onInteraction('query', row.query);
                  }
                }}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`py-1.5 px-2 text-[var(--db-text)]/80 truncate max-w-[200px] ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {formatVal(col.key, row[col.key as keyof KeywordRow])}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-4 text-center text-[var(--db-text)]/40 text-xs">
                  {search ? 'No matching keywords' : 'No keyword data'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
