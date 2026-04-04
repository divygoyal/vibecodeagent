'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { WidgetConfig } from '@/types/dashboard';

interface TableWidgetProps {
  config: WidgetConfig;
  data?: Array<Record<string, unknown>>;
  columns?: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  isLoading?: boolean;
}

export default function TableWidget({ config, data, columns: columnsProp, isLoading }: TableWidgetProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Auto-generate columns from first data row if not provided
  const columns = useMemo(() => {
    if (columnsProp?.length) return columnsProp;
    if (!data?.length) return [];
    return Object.keys(data[0]).map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
      align: typeof data[0][key] === 'number' ? 'right' as const : 'left' as const,
    }));
  }, [columnsProp, data]);

  const sortedData = useMemo(() => {
    if (!data) return [];
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDir]);

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

  if (!sortedData.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-[var(--db-text)]/40">No data available</p>
      </div>
    );
  }

  function formatCell(value: unknown): string {
    if (value == null) return '--';
    if (typeof value === 'number') {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
      if (value % 1 !== 0) return value.toFixed(2);
      return value.toLocaleString();
    }
    return String(value);
  }

  return (
    <div className="h-full flex flex-col px-3 py-2 overflow-hidden">
      <p className="text-xs font-medium text-[var(--db-text)]/60 mb-2 truncate flex-shrink-0">
        {config.title}
      </p>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => (
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
            {sortedData.slice(0, 50).map((row, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-1.5 px-2 text-[var(--db-text)]/80 truncate max-w-[200px] ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {formatCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
