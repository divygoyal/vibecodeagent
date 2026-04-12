'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface DatePickerProps {
    range: string;
    setRange: (r: string) => void;
    compact?: boolean;
}

type PresetItem = { label: string; value: string } | { separator: true };

const PRESETS: PresetItem[] = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { separator: true },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 14 days', value: '14d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 60 days', value: '60d' },
    { label: 'Last 90 days', value: '90d' },
    { separator: true },
    { label: 'This week', value: 'this_week' },
    { label: 'Last week', value: 'last_week' },
    { label: 'This month', value: 'this_month' },
    { label: 'Last month', value: 'last_month' },
    { label: 'This year', value: 'this_year' },
    { label: 'Last year', value: 'last_year' },
    { separator: true },
    { label: 'Last 6 months', value: '6m' },
    { label: 'Last 12 months', value: '12m' },
    { label: 'All time', value: 'all' },
];

// Ordered list of navigable preset values (excludes separators)
const PRESET_VALUES = PRESETS.filter((p): p is { label: string; value: string } => 'value' in p).map(p => p.value);

export function getRangeLabel(range: string): string {
    const preset = PRESETS.find((p): p is { label: string; value: string } => 'value' in p && p.value === range);
    return preset ? preset.label : range;
}

/** Compute the readable date range string for the active period */
export function getDateRangeText(range: string): string {
    const now = new Date();
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fmtYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    switch (range) {
        case 'today':
            return fmt(now);
        case 'yesterday': {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            return fmt(d);
        }
        case '7d':
        case '14d':
        case '30d':
        case '60d':
        case '90d': {
            const days = parseInt(range);
            const start = new Date(now);
            start.setDate(start.getDate() - days);
            return `${fmt(start)} - ${fmt(now)}`;
        }
        case '6m': {
            const start = new Date(now);
            start.setMonth(start.getMonth() - 6);
            return `${fmtYear(start)} - ${fmt(now)}`;
        }
        case '12m': {
            const start = new Date(now);
            start.setFullYear(start.getFullYear() - 1);
            return `${fmtYear(start)} - ${fmt(now)}`;
        }
        case 'this_week': {
            const start = new Date(now);
            start.setDate(start.getDate() - start.getDay());
            return `${fmt(start)} - ${fmt(now)}`;
        }
        case 'last_week': {
            const end = new Date(now);
            end.setDate(end.getDate() - end.getDay() - 1);
            const start = new Date(end);
            start.setDate(start.getDate() - 6);
            return `${fmt(start)} - ${fmt(end)}`;
        }
        case 'this_month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return `${fmt(start)} - ${fmt(now)}`;
        }
        case 'last_month': {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return `${fmt(start)} - ${fmt(end)}`;
        }
        case 'this_year': {
            const start = new Date(now.getFullYear(), 0, 1);
            return `${fmtYear(start)} - ${fmt(now)}`;
        }
        case 'last_year': {
            const start = new Date(now.getFullYear() - 1, 0, 1);
            const end = new Date(now.getFullYear() - 1, 11, 31);
            return `${fmtYear(start)} - ${fmtYear(end)}`;
        }
        case 'all':
            return 'All time';
        default:
            return '';
    }
}

export default function DatePicker({ range, setRange, compact = false }: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const currentIndex = PRESET_VALUES.indexOf(range);
    const canGoBack = currentIndex < PRESET_VALUES.length - 1;
    const canGoForward = currentIndex > 0;

    const goBack = () => {
        if (canGoBack) {
            setRange(PRESET_VALUES[currentIndex + 1]);
        }
    };

    const goForward = () => {
        if (canGoForward) {
            setRange(PRESET_VALUES[currentIndex - 1]);
        }
    };

    const dateText = getDateRangeText(range);

    return (
        <div className="relative" ref={containerRef}>
            <div className={compact ? 'w-full' : 'inline-flex items-center'}>
                {!compact && (
                    <button
                        type="button"
                        onClick={goBack}
                        disabled={!canGoBack}
                        className="dashboard-hover-action flex h-10 w-10 items-center justify-center rounded-l-[14px] border border-r-0 border-white/[0.1] bg-[#0b1015]/95 text-zinc-400 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Previous date range"
                        data-variant="ghost"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className={`dashboard-hover-action flex border border-white/[0.1] bg-[#0b1015]/95 text-zinc-400 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-zinc-100 ${
                        compact
                            ? 'h-10 w-full items-center justify-between gap-2 rounded-[14px] px-3 sm:max-w-[180px]'
                            : 'h-10 min-w-[170px] items-center gap-2 border-x-0 px-3.5 text-left'
                    }`}
                    data-variant="ghost"
                >
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className={`truncate font-medium text-zinc-100 ${compact ? 'text-[12px]' : 'text-[12px]'}`}>
                            {getRangeLabel(range)}
                        </div>
                        {!compact && dateText ? (
                            <div className="truncate text-[10px] text-zinc-500">
                                {dateText}
                            </div>
                        ) : null}
                    </div>
                    <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {!compact && (
                    <button
                        type="button"
                        onClick={goForward}
                        disabled={!canGoForward}
                        className="dashboard-hover-action flex h-10 w-10 items-center justify-center rounded-r-[14px] border border-l-0 border-white/[0.1] bg-[#0b1015]/95 text-zinc-400 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Next date range"
                        data-variant="ghost"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 max-h-[360px] min-w-[190px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0b1015]/98 p-1.5 shadow-[0_28px_56px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                        {PRESETS.map((item, i) => {
                            if ('separator' in item) {
                                return <div key={`sep-${i}`} className="my-1.5 border-t border-white/[0.06]" />;
                            }
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => { setRange(item.value); setOpen(false); }}
                                    className={`w-full rounded-xl px-3 py-2.5 text-left text-[11px] transition ${
                                        range === item.value
                                            ? 'border border-cyan-400/20 bg-cyan-400/[0.12] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                            : 'border border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

/** Mobile-friendly date picker rendered as pill buttons */
export function MobileDatePicker({ range, setRange }: DatePickerProps) {
    return (
        <div className="px-3 pt-2 pb-1">
            <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1 mb-1.5 block">Date Range</label>
            <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((item) => {
                    if ('separator' in item) return null;
                    return (
                        <button
                            key={item.value}
                            onClick={() => setRange(item.value)}
                            className={`px-2.5 py-1.5 text-[11px] rounded-lg border transition min-h-[32px] ${
                                range === item.value
                                    ? 'text-emerald-400 bg-emerald-500/[0.1] border-emerald-500/[0.15]'
                                    : 'text-zinc-400 bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                            }`}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
