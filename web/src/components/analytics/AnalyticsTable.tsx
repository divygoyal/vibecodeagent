'use client';

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

// ─── Generic sortable, searchable table ───

interface Column<T> {
    key: string;
    label: string;
    width?: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    render: (item: T, index: number) => React.ReactNode;
    getValue?: (item: T) => number | string;
}

interface AnalyticsTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchKey?: (item: T) => string;
    searchPlaceholder?: string;
    defaultSort?: { key: string; dir: 'asc' | 'desc' };
    maxRows?: number;
    showSearch?: boolean;
    onRowClick?: (item: T) => void;
    activeRow?: (item: T) => boolean;
    emptyMessage?: string;
}

export default function AnalyticsTable<T>({
    data,
    columns,
    searchKey,
    searchPlaceholder = 'Search...',
    defaultSort,
    maxRows,
    showSearch = true,
    onRowClick,
    activeRow,
    emptyMessage = 'No data available',
}: AnalyticsTableProps<T>) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort || null);
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(() => {
        let items = [...data];
        if (search && searchKey) {
            const q = search.toLowerCase();
            items = items.filter(item => searchKey(item).toLowerCase().includes(q));
        }
        if (sort) {
            const col = columns.find(c => c.key === sort.key);
            if (col?.getValue) {
                items.sort((a, b) => {
                    const va = col.getValue!(a);
                    const vb = col.getValue!(b);
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return sort.dir === 'asc' ? va - vb : vb - va;
                    }
                    return sort.dir === 'asc'
                        ? String(va).localeCompare(String(vb))
                        : String(vb).localeCompare(String(va));
                });
            }
        }
        return items;
    }, [data, search, sort, searchKey, columns]);

    const displayItems = maxRows && !showAll ? filtered.slice(0, maxRows) : filtered;

    const toggleSort = (key: string) => {
        const col = columns.find(c => c.key === key);
        if (!col?.sortable) return;
        setSort(prev => {
            if (prev?.key === key) {
                return prev.dir === 'desc' ? { key, dir: 'asc' } : null;
            }
            return { key, dir: 'desc' };
        });
    };

    return (
        <div>
            {showSearch && searchKey && (
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                    />
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-white/[0.06]">
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    className={`py-2.5 px-3 font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                    } ${col.sortable ? 'cursor-pointer hover:text-zinc-300 select-none' : ''}`}
                                    style={col.width ? { width: col.width } : undefined}
                                    onClick={() => col.sortable && toggleSort(col.key)}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.label}
                                        {col.sortable && sort?.key === col.key && (
                                            sort.dir === 'desc'
                                                ? <ChevronDown className="w-3 h-3" />
                                                : <ChevronUp className="w-3 h-3" />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayItems.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-8 text-center text-zinc-600 text-xs">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            displayItems.map((item, i) => (
                                <tr
                                    key={i}
                                    className={`border-b border-white/[0.03] transition-colors ${
                                        onRowClick ? 'cursor-pointer' : ''
                                    } ${activeRow?.(item) ? 'bg-emerald-500/[0.06]' : 'hover:bg-white/[0.02]'}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map(col => (
                                        <td
                                            key={col.key}
                                            className={`py-2.5 px-3 ${
                                                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                            }`}
                                        >
                                            {col.render(item, i)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {maxRows && filtered.length > maxRows && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="mt-3 w-full py-2 text-[11px] text-zinc-500 hover:text-white bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.04] transition flex items-center justify-center gap-1"
                >
                    {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAll ? 'Show less' : `Show all ${filtered.length} rows`}
                </button>
            )}
        </div>
    );
}
