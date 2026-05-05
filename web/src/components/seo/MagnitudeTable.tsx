'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Search } from 'lucide-react';

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
    /**
     * Function returning the value for the in-row magnitude bar.
     * Defaults to the first numeric `getValue` after the label column.
     */
    getMagnitude?: (row: T) => number;
    /** Function returning the searchable string (used by the integrated search input). */
    searchKey?: (row: T) => string;
    searchPlaceholder?: string;
    showSearch?: boolean;
    onRowClick?: (row: T) => void;
    activeRow?: (row: T) => boolean;
    emptyMessage?: string;
    maxRows?: number;
    defaultSort?: { key: string; dir: 'asc' | 'desc' };
    /** Optional footer label (e.g. "View all queries"). When clicked, expands to show all rows. */
    viewAllLabel?: string;
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
    defaultSort,
    viewAllLabel,
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

    // Compute magnitude bar widths. Default = first numeric column after the label.
    const magFn = useMemo<((row: T) => number) | null>(() => {
        if (getMagnitude) return getMagnitude;
        const numericCol = columns.slice(1).find(c => c.getValue);
        if (!numericCol?.getValue) return null;
        return (row: T) => {
            const v = numericCol.getValue!(row);
            return typeof v === 'number' ? v : 0;
        };
    }, [columns, getMagnitude]);

    const maxMagnitude = magFn ? Math.max(...display.map(magFn), 1) : 1;

    const isSingleColumn = columns.length <= 1;
    const gridTemplate = isSingleColumn
        ? 'minmax(0,1fr)'
        : ['minmax(0,1fr)', ...columns.slice(1).map(c => c.width || '88px')].join(' ');
    const mobileGridTemplate = isSingleColumn ? 'minmax(0,1fr)' : 'minmax(0,1fr) 104px';

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
                        className="w-full rounded-[10px] border border-white/[0.06] bg-[#0a0b0e] py-2.5 pl-9 pr-3 text-[13px] font-medium text-zinc-200 placeholder-zinc-600 transition focus:border-blue-500/30 focus:outline-none"
                    />
                </div>
            ) : null}

            <div className="overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0a0b0e]">
                {/* Desktop header */}
                <div
                    className="hidden md:grid gap-3 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[12px] font-medium text-zinc-400"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    {columns.map(col => {
                        const isActiveSort = sort?.key === col.key;
                        return (
                            <button
                                key={col.key}
                                type="button"
                                onClick={() => toggleSort(col.key)}
                                disabled={!col.sortable}
                                className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''} ${col.sortable ? 'cursor-pointer hover:text-zinc-200' : 'cursor-default'} transition`}
                            >
                                <span className="truncate">{col.label}</span>
                                {col.sortable ? (
                                    isActiveSort ? (
                                        sort.dir === 'desc' ? <ChevronDown className="h-3 w-3 text-zinc-300" /> : <ChevronUp className="h-3 w-3 text-zinc-300" />
                                    ) : (
                                        <ChevronDown className="h-3 w-3 text-zinc-600" />
                                    )
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                {/* Mobile header */}
                <div className={`grid gap-2 border-b border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] font-medium text-zinc-400 md:hidden ${isSingleColumn ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_104px]'}`}>
                    <span>{columns[0]?.label}</span>
                    {!isSingleColumn ? <span className="text-right">{columns[1]?.label}</span> : null}
                </div>

                <div>
                    {display.length === 0 ? (
                        <div className="px-4 py-10 text-center text-[12px] text-zinc-500">{emptyMessage}</div>
                    ) : (
                        display.map((row, i) => {
                            const isActive = activeRow?.(row) ?? false;
                            const widthPct = magFn ? Math.max((magFn(row) / maxMagnitude) * 100, 0) : 0;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => onRowClick?.(row)}
                                    disabled={!onRowClick}
                                    className={`group relative grid h-auto min-h-[44px] w-full items-center gap-3 overflow-hidden border-b border-white/[0.07] px-3 py-1.5 text-left transition last:border-b-0 grid-cols-[var(--cols-mobile)] md:grid-cols-[var(--cols-desktop)] md:h-9 md:min-h-9 md:px-4 md:py-0 ${
                                        isActive ? 'bg-cyan-500/[0.10] before:pointer-events-none before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-cyan-400' : ''
                                    } ${onRowClick ? 'cursor-pointer' : 'cursor-default'}`}
                                    style={{
                                        ['--cols-mobile' as string]: mobileGridTemplate,
                                        ['--cols-desktop' as string]: gridTemplate,
                                    }}
                                >
                                    {/* Magnitude bar — subtle by default, brightens on hover */}
                                    {magFn && widthPct > 0 ? (
                                        <div
                                            className={`pointer-events-none absolute left-0 top-[1px] bottom-[1px] rounded-r-[2px] transition ${
                                                isActive
                                                    ? 'bg-cyan-500/[0.16]'
                                                    : 'bg-white/[0.035] group-hover:bg-cyan-500/[0.10]'
                                            }`}
                                            style={{ width: `${widthPct}%` }}
                                            aria-hidden
                                        />
                                    ) : null}

                                    {/* Label cell */}
                                    <div className="relative z-10 min-w-0">
                                        {columns[0].render(row, i)}
                                    </div>

                                    {/* Mobile: stacked primary + secondary (skipped when single-column) */}
                                    {!isSingleColumn ? (
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
                                    ) : null}

                                    {/* Desktop: per-column cells */}
                                    {columns.slice(1).map(col => (
                                        <div
                                            key={col.key}
                                            className={`relative z-10 hidden font-mono text-[13px] leading-none md:block ${col.align === 'right' ? 'text-right' : ''} ${isActive ? 'text-white' : 'text-zinc-200'}`}
                                        >
                                            {col.render(row, i)}
                                        </div>
                                    ))}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer: View all */}
                {viewAllLabel && maxRows && filtered.length > maxRows ? (
                    <button
                        type="button"
                        onClick={() => setShowAll(!showAll)}
                        className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.04] bg-transparent py-2.5 text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.02] hover:text-zinc-200"
                    >
                        {showAll ? <ChevronUp className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                        {showAll ? 'Show less' : `${viewAllLabel} (${filtered.length})`}
                    </button>
                ) : null}
            </div>

            {/* Standalone show-all (no viewAllLabel) — keeps API back-compat */}
            {!viewAllLabel && maxRows && filtered.length > maxRows ? (
                <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-[10px] border border-white/[0.06] bg-[#0a0b0e] py-2 text-[12px] font-medium text-zinc-500 transition hover:border-white/[0.1] hover:text-white"
                >
                    {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAll ? 'Show less' : `Show all ${filtered.length} rows`}
                </button>
            ) : null}
        </div>
    );
}
