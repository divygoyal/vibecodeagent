'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface DatePickerProps {
    range: string;
    setRange: (r: string) => void;
    compact?: boolean;
    /** When false, render only the calendar + label pill — no prev/next
     *  chevrons flanking it, no chevron-down inside, no date subtitle.
     *  Used by the share-overview iframe for the OpenPanel-style minimal
     *  look. Defaults to true so the internal dashboard's date picker
     *  keeps its quick-nav chevrons. */
    chevrons?: boolean;
}

// Each preset can carry a single-letter shortcut that's both displayed on
// the right of the dropdown row and registered for keyboard activation
// while the dropdown is open. Mirrors OpenPanel's "Time window" UX.
type PresetItem =
    | { label: string; value: string; shortcut?: string }
    | { separator: true };

const PRESETS: PresetItem[] = [
    { label: 'Today', value: 'today', shortcut: 'D' },
    { label: 'Yesterday', value: 'yesterday', shortcut: 'E' },
    { separator: true },
    { label: 'Last 7 days', value: '7d', shortcut: 'W' },
    { label: 'Last 14 days', value: '14d' },
    { label: 'Last 30 days', value: '30d', shortcut: 'T' },
    { label: 'Last 60 days', value: '60d' },
    { label: 'Last 90 days', value: '90d' },
    { separator: true },
    { label: 'This week', value: 'this_week' },
    { label: 'Last week', value: 'last_week' },
    { label: 'This month', value: 'this_month', shortcut: 'M' },
    { label: 'Last month', value: 'last_month' },
    { label: 'This year', value: 'this_year', shortcut: 'Y' },
    { label: 'Last year', value: 'last_year' },
    { separator: true },
    { label: 'Last 6 months', value: '6m', shortcut: '6' },
    { label: 'Last 12 months', value: '12m', shortcut: '0' },
    { label: 'All time', value: 'all', shortcut: 'A' },
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

export default function DatePicker({ range, setRange, compact = false, chevrons = true }: DatePickerProps) {
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

    // Keyboard handlers for the open dropdown:
    //   Escape       — close
    //   D/E/W/T/M/Y/6/0/A — jump to that preset and close (OpenPanel-style)
    // We only listen while the dropdown is open so single-letter keys don't
    // hijack typing elsewhere on the page.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                return;
            }
            // Bail if focused inside a text input — never steal letter keys
            // from a user typing.
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            const key = e.key.toUpperCase();
            const match = PRESETS.find(
                (p): p is { label: string; value: string; shortcut?: string } =>
                    'value' in p && !!p.shortcut && p.shortcut === key,
            );
            if (match) {
                e.preventDefault();
                setRange(match.value);
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, setRange]);

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

    // Main button corner-radius depends on whether the chevron buttons
    // flank it: with chevrons we round only the inner edges so the three
    // buttons read as a single pill; without, the main button is fully
    // rounded on all sides.
    const mainButtonClass = chevrons
        ? `dashboard-hover-action flex h-10 border border-white/[0.1] bg-[#0b1015]/95 text-zinc-400 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-zinc-100 ${
              compact
                  ? 'w-full items-center justify-between gap-2 rounded-[14px] px-3 sm:max-w-[180px]'
                  : 'min-w-[170px] items-center gap-2 border-x-0 px-3.5 text-left'
          }`
        : `dashboard-hover-action flex h-10 items-center gap-2 rounded-[14px] border border-white/[0.1] bg-[#0b1015]/95 px-3 text-zinc-400 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-zinc-100 ${
              compact ? 'w-full justify-between sm:max-w-[180px]' : 'text-left'
          }`;

    return (
        <div className="relative" ref={containerRef}>
            <div className={compact ? 'w-full' : 'inline-flex items-center'}>
                {chevrons && !compact && (
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
                    className={mainButtonClass}
                    data-variant="ghost"
                >
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-zinc-100">
                            {getRangeLabel(range)}
                        </div>
                        {chevrons && !compact && dateText ? (
                            <div className="truncate text-[10px] text-zinc-500">
                                {dateText}
                            </div>
                        ) : null}
                    </div>
                    {chevrons ? (
                        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    ) : null}
                </button>

                {chevrons && !compact && (
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
                    <div className="absolute left-0 z-50 mt-2 max-h-[440px] min-w-[230px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0b1015]/98 p-1.5 shadow-[0_28px_56px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                        <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Time window
                        </div>
                        {PRESETS.map((item, i) => {
                            if ('separator' in item) {
                                return <div key={`sep-${i}`} className="my-1.5 border-t border-white/[0.06]" />;
                            }
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => { setRange(item.value); setOpen(false); }}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] transition ${
                                        range === item.value
                                            ? 'border border-cyan-400/20 bg-cyan-400/[0.12] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                            : 'border border-transparent text-zinc-300 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white'
                                    }`}
                                >
                                    <span>{item.label}</span>
                                    {item.shortcut ? (
                                        <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                                            {item.shortcut}
                                        </span>
                                    ) : null}
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
        <div className="px-3 pt-2 pb-0.5">
            <label className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Date Range</label>
            <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-1.5 pb-1 pr-2">
                    {PRESETS.map((item) => {
                        if ('separator' in item) return null;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => setRange(item.value)}
                                className={`min-h-[32px] shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                                    range === item.value
                                        ? 'border-emerald-500/[0.15] bg-emerald-500/[0.1] text-emerald-400'
                                        : 'border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]'
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
