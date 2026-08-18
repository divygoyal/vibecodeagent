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
                        className="w-full rounded-[14px] border border-white/[0.07] bg-[#090909] py-2.5 pl-9 pr-3 text-sm font-medium text-zinc-200 placeholder-zinc-600 transition focus:border-emerald-500/25 focus:outline-none"
                    />
                </div>
            )}

            <div className="overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#080808]">
                <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                <table className="w-full text-xs sm:text-sm">
                    <thead>
                        <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    className={`py-3 px-2 sm:px-3 text-[11px] font-medium text-zinc-500 whitespace-nowrap ${
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
                                <td colSpan={columns.length} className="py-8 text-center text-xs font-medium text-zinc-600">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            displayItems.map((item, i) => (
                                <tr
                                    key={i}
                                    className={`border-b border-white/[0.04] transition-colors last:border-b-0 ${
                                        onRowClick ? 'cursor-pointer' : ''
                                    } ${activeRow?.(item) ? 'bg-emerald-500/[0.08]' : 'hover:bg-white/[0.03]'}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map(col => (
                                        <td
                                            key={col.key}
                                            className={`px-2 py-3 sm:px-3 ${
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
            </div>

            {maxRows && filtered.length > maxRows && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[14px] border border-white/[0.06] bg-[#090909] py-2 text-[12px] font-medium text-zinc-500 transition hover:border-white/[0.1] hover:text-white"
                >
                    {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAll ? 'Show less' : `Show all ${filtered.length} rows`}
                </button>
            )}
        </div>
    );
}
