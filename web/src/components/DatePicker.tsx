'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface DatePickerProps {
    range: string;
    setRange: (r: string) => void;
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

function getRangeLabel(range: string): string {
    const preset = PRESETS.find((p): p is { label: string; value: string } => 'value' in p && p.value === range);
    return preset ? preset.label : range;
}

/** Compute the readable date range string for the active period */
function getDateRangeText(range: string): string {
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

export default function DatePicker({ range, setRange }: DatePickerProps) {
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
            <div className="flex items-center">
                {/* Back arrow */}
                <button
                    onClick={goBack}
                    disabled={!canGoBack}
                    className="flex items-center justify-center w-8 h-8 rounded-l-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous date range"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Center dropdown trigger */}
                <button
                    onClick={() => setOpen(!open)}
                    className="flex items-center gap-1.5 h-8 px-2.5 border-y border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white transition text-[11px]"
                >
                    <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="whitespace-nowrap">{getRangeLabel(range)}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
                </button>

                {/* Forward arrow */}
                <button
                    onClick={goForward}
                    disabled={!canGoForward}
                    className="flex items-center justify-center w-8 h-8 rounded-r-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next date range"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Date range text below the picker */}
            {dateText && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 text-[9px] text-zinc-500 whitespace-nowrap pointer-events-none">
                    {dateText}
                </div>
            )}

            {/* Dropdown */}
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 min-w-[160px] max-w-[calc(100vw-2rem)] max-h-[360px] overflow-y-auto">
                        {PRESETS.map((item, i) => {
                            if ('separator' in item) {
                                return <div key={`sep-${i}`} className="border-t border-white/[0.06] my-1" />;
                            }
                            return (
                                <button
                                    key={item.value}
                                    onClick={() => { setRange(item.value); setOpen(false); }}
                                    className={`w-full text-left px-3 py-2 text-[11px] transition ${
                                        range === item.value
                                            ? 'text-emerald-400 bg-emerald-500/[0.08]'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
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
