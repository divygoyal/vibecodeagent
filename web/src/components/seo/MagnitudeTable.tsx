'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

export interface MagnitudeColumn<T> {
    key: string;
    label: string;
    width?: string; // e.g. "84px"
    align?: 'left' | 'right';
    render: (row: T, index: number) => ReactNode;
    getValue?: (row: T) => number | string;
    sortable?: boolean;
}

interface MagnitudeTableProps<T> {
    rows: T[];
    columns: MagnitudeColumn<T>[];
    /** Function returning the value to use for the relative magnitude bar (typically the primary metric). */
    getMagnitude: (row: T) => number;
    /** Function returning the searchable string (used by the integrated search input). */
    searchKey?: (row: T) => string;
    searchPlaceholder?: string;
    showSearch?: boolean;
    onRowClick?: (row: T) => void;
    activeRow?: (row: T) => boolean;
    emptyMessage?: string;
    maxRows?: number;
    barColor?: string; // default emerald-500/[0.10]
    defaultSort?: { key: string; dir: 'asc' | 'desc' };
}

export default function MagnitudeTable<T>({
    rows,
    columns,
    getMagnitude,
    searchKey,
    searchPlaceholder = 'Search...',
    showSearch = true,
    onRowClick,
    activeRow,
    emptyMessage = 'No data yet',
    maxRows,
    barColor = 'rgba(52, 211, 153, 0.07)',
    defaultSort,
}: MagnitudeTableProps<T>) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort || null);
    const [showAll, setShowAll] = useState(false);

    const filtered = useMemo(() => {
        let items = [...rows];
        if (search && searchKey) {
            const q = search.toLowerCase();
            items = items.filter(r => searchKey(r).toLowerCase().includes(q));
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
    }, [rows, search, sort, searchKey, columns]);

    const display = maxRows && !showAll ? filtered.slice(0, maxRows) : filtered;
    const maxMagnitude = Math.max(...display.map(getMagnitude), 1);

    const gridTemplate = ['minmax(0,1fr)', ...columns.slice(1).map(c => c.width || '84px')].join(' ');

    function toggleSort(key: string) {
        const col = columns.find(c => c.key === key);
        if (!col?.sortable) return;
        setSort(prev => {
            if (prev?.key === key) {
                return prev.dir === 'desc' ? { key, dir: 'asc' } : null;
            }
            return { key, dir: 'desc' };
        });
    }

    return (
        <div>
            {showSearch && searchKey ? (
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" aria-hidden />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full rounded-[14px] border border-white/[0.07] bg-[#090909] py-2.5 pl-9 pr-3 text-sm font-medium text-zinc-200 placeholder-zinc-600 transition focus:border-emerald-500/30 focus:outline-none"
                    />
                </div>
            ) : null}

            <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0a0b0e]">
                {/* Header */}
                <div
                    className="hidden md:grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[11px] font-medium text-zinc-500"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    {columns.map(col => (
                        <button
                            key={col.key}
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            disabled={!col.sortable}
                            className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''} ${col.sortable ? 'cursor-pointer hover:text-zinc-200' : 'cursor-default'} transition`}
                        >
                            <span className="truncate">{col.label}</span>
                            {col.sortable && sort?.key === col.key ? (
                                sort.dir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                            ) : null}
                        </button>
                    ))}
                </div>

                {/* Mobile header (compact) */}
                <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-zinc-500 md:hidden">
                    <span>{columns[0]?.label}</span>
                    <span className="text-right">{columns[1]?.label}</span>
                </div>

                <div>
                    {display.length === 0 ? (
                        <div className="px-4 py-10 text-center text-[12px] text-zinc-500">{emptyMessage}</div>
                    ) : (
                        display.map((row, i) => {
                            const isActive = activeRow?.(row) ?? false;
                            const mag = getMagnitude(row);
                            const widthPct = (mag / maxMagnitude) * 100;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => onRowClick?.(row)}
                                    disabled={!onRowClick}
                                    className={`group relative grid w-full items-center gap-3 overflow-hidden border-b border-white/[0.04] px-3 py-2 text-left text-[13px] transition last:border-b-0 grid-cols-[var(--cols-mobile)] md:grid-cols-[var(--cols-desktop)] md:px-4 md:py-0 md:h-9 ${
                                        isActive ? 'bg-emerald-500/[0.06]' : 'hover:bg-white/[0.025]'
                                    } ${onRowClick ? 'cursor-pointer' : 'cursor-default'}`}
                                    style={{
                                        ['--cols-mobile' as string]: 'minmax(0,1fr) 104px',
                                        ['--cols-desktop' as string]: gridTemplate,
                                    }}
                                >
                                    {/* Magnitude bar */}
                                    <div
                                        className="pointer-events-none absolute left-0 top-[1px] bottom-[1px] rounded-r-[2px] transition-[width]"
                                        style={{
                                            width: `${widthPct}%`,
                                            background: barColor,
                                        }}
                                        aria-hidden
                                    />

                                    {/* Label cell — desktop AND mobile */}
                                    <div className="relative z-10 min-w-0">
                                        {columns[0].render(row, i)}
                                    </div>

                                    {/* Mobile: stacked primary + secondary on the right */}
                                    <div className="relative z-10 flex flex-col items-end text-right md:hidden">
                                        <span className="font-mono text-[12px] leading-none text-zinc-100">
                                            {columns[1]?.render(row, i)}
                                        </span>
                                        {columns[2] ? (
                                            <span className="mt-0.5 font-mono text-[10px] leading-none text-zinc-500">
                                                {columns[2].label}: {columns[2].render(row, i)}
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* Desktop: per-column cells */}
                                    {columns.slice(1).map(col => (
                                        <div
                                            key={col.key}
                                            className={`relative z-10 hidden font-mono text-[13px] leading-none md:block ${col.align === 'right' ? 'text-right' : ''} text-zinc-200`}
                                        >
                                            {col.render(row, i)}
                                        </div>
                                    ))}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {maxRows && filtered.length > maxRows ? (
                <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[14px] border border-white/[0.06] bg-[#090909] py-2 text-[12px] font-medium text-zinc-500 transition hover:border-white/[0.1] hover:text-white"
                >
                    {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAll ? 'Show less' : `Show all ${filtered.length} rows`}
                </button>
            ) : null}
        </div>
    );
}
