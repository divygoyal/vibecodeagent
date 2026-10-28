'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseAsString, useQueryStates } from 'nuqs';

import { cn } from '@/lib/cn';
import {
    COMPARE_OPTIONS, compareSuffix, normalizeDateRange, presetDef, QUICK_PRESETS, RANGE_PRESETS, resolveWindow, toLegacyRange,
    type CompareMode, type DateRangeValue, type RangePreset, type ResolvedDateRange,
} from '@/lib/dateRange';
import { fmtDateRange, fmtMonthYear } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useWorkspace } from './workspaceContext';

const QUERY = { range: parseAsString, compare: parseAsString, from: parseAsString, to: parseAsString };

export interface DateRangeState {
    /** Canonical value: { preset, compare, from?, to? }. */
    value: DateRangeValue;
    setValue: (v: DateRangeValue) => void;
    setPreset: (p: RangePreset) => void;
    setCompare: (c: CompareMode) => void;
    /** GA4 days (complete days: ends yesterday). lib/dateRange resolveWindow, the app's one window rule. */
    resolved: ResolvedDateRange;
    /** Search Console days (ends 2 days ago, the usual GSC delay). */
    resolvedSearch: ResolvedDateRange;
    /** 'Last 28 days' */
    label: string;
    /** 'vs previous 28 days' ('' when compare is none). */
    compareLabel: string;
    /** Nearest legacy key for old APIs ('30d'). */
    legacyRange: string;
}

/**
 * The page date range (DESIGN 3.3). Lives in the URL (?range=28d&compare=prev,
 * custom: &from=2026-09-01&to=2026-09-30) so every view is linkable; falls back
 * to the range saved in the workspace, then to 3 months. Changing it saves the
 * preset to the workspace (all pages, all devices) and moves old pages along.
 *
 * Render inside <Suspense> (AppShell wraps page content already).
 */
export function useDateRange(): DateRangeState {
    const ws = useWorkspace();
    const [q, setQ] = useQueryStates(QUERY, { history: 'replace', shallow: true, scroll: false });
    const fallback = useMemo(() => normalizeDateRange({ range: ws.rangeKey }), [ws.rangeKey]);
    const value = useMemo(() => (q.range ? normalizeDateRange(q, fallback) : fallback), [q, fallback]);
    const { saveWorkspace } = ws;

    const setValue = useCallback((v: DateRangeValue) => {
        void setQ({
            range: v.preset,
            compare: v.compare,
            from: v.preset === 'custom' ? v.from ?? null : null,
            to: v.preset === 'custom' ? v.to ?? null : null,
        });
        // Custom ranges stay in the URL only; presets are remembered everywhere.
        if (v.preset !== 'custom') void saveWorkspace({ range: v.preset });
    }, [setQ, saveWorkspace]);

    return useMemo(() => {
        const now = new Date();
        return {
            value,
            setValue,
            setPreset: (p: RangePreset) => setValue({ ...value, preset: p, from: undefined, to: undefined }),
            setCompare: (c: CompareMode) => setValue({ ...value, compare: c }),
            resolved: resolveWindow(value, 'ga4', { now }),
            resolvedSearch: resolveWindow(value, 'gsc', { now }),
            label: presetDef(value.preset).label,
            compareLabel: compareSuffix(value),
            legacyRange: toLegacyRange(value.preset),
        };
    }, [value, setValue]);
}

export interface DateRangeControlProps {
    /** Hide 'Last 24 hours' (Search Console pages). */
    searchOnly?: boolean;
    /** Hide the compare section. */
    hideCompare?: boolean;
    className?: string;
}

/**
 * ( 7d | 28d | 3m ) [calendar]: the quick presets plus a popover with every
 * preset, a custom range calendar and "Compare to". Put it last (rightmost)
 * in PageHeader actions.
 */
export function DateRangeControl({ searchOnly, hideCompare, className }: DateRangeControlProps) {
    const { value, setValue, setPreset, setCompare } = useDateRange();
    const [open, setOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(value.preset === 'custom');
    const quick = (QUICK_PRESETS as RangePreset[]).includes(value.preset) ? value.preset : null;
    const triggerLabel = value.preset === 'custom' && value.from && value.to ? fmtDateRange(value.from, value.to) : presetDef(value.preset).short;

    return (
        <div className={cn('flex shrink-0 items-center gap-2', className)}>
            <SegmentedControl
                ariaLabel="Date range"
                value={quick}
                onChange={(p) => setPreset(p as RangePreset)}
                options={QUICK_PRESETS.map((p) => ({ value: p, label: presetDef(p).short }))}
            />
            <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setCustomOpen(value.preset === 'custom'); }}>
                <PopoverTrigger asChild>
                    {quick ? (
                        <Button variant="secondary" iconOnly icon={CalendarDays} aria-label="More date ranges" />
                    ) : (
                        <button
                            type="button"
                            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand-soft px-3 text-body-sm font-medium text-brand-soft-fg transition-colors duration-120 hover:brightness-95"
                        >
                            <CalendarDays aria-hidden size={16} strokeWidth={1.75} />
                            {triggerLabel}
                            <ChevronDown aria-hidden size={14} />
                        </button>
                    )}
                </PopoverTrigger>
                <PopoverContent align="end" className={cn('p-1', customOpen ? 'w-auto max-w-[calc(100vw-16px)]' : 'w-72')} aria-label="Date range">
                    <div className={cn(customOpen && 'md:flex')}>
                        <div className={cn(customOpen && 'md:w-60 md:border-r md:border-border-subtle')} role="listbox" aria-label="Presets">
                            {RANGE_PRESETS.filter((p) => !(searchOnly && p.ga4Only)).map((p) => {
                                const active = value.preset === p.value;
                                return (
                                    <button
                                        key={p.value}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        onClick={() => {
                                            if (p.value === 'custom') {
                                                setCustomOpen(true);
                                                return;
                                            }
                                            setPreset(p.value);
                                            setOpen(false);
                                        }}
                                        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body text-fg hover:bg-subtle"
                                    >
                                        <span className="flex-1">{p.label}</span>
                                        {active ? <Check aria-hidden size={16} strokeWidth={1.75} /> : null}
                                    </button>
                                );
                            })}
                            {hideCompare ? null : (
                                <>
                                    <div className="-mx-1 my-1 h-px bg-border-subtle" />
                                    <p className="px-2 pt-1.5 pb-1 text-meta font-medium text-fg-muted">Compare to</p>
                                    <div role="radiogroup" aria-label="Compare to">
                                        {COMPARE_OPTIONS.map((c) => (
                                            <button
                                                key={c.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={value.compare === c.value}
                                                onClick={() => setCompare(c.value)}
                                                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body text-fg hover:bg-subtle"
                                            >
                                                <span aria-hidden className={cn('flex size-4 items-center justify-center rounded-full border', value.compare === c.value ? 'border-brand' : 'border-border-strong')}>
                                                    {value.compare === c.value ? <span className="size-1.5 rounded-full bg-brand" /> : null}
                                                </span>
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        {customOpen ? (
                            <RangeCalendar
                                from={value.preset === 'custom' ? value.from : undefined}
                                to={value.preset === 'custom' ? value.to : undefined}
                                onApply={(from, to) => {
                                    setValue({ preset: 'custom', compare: value.compare, from, to });
                                    setOpen(false);
                                }}
                            />
                        ) : null}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

// ─── Custom range calendar ──────────────────────────────────────────────────

function isoOf(y: number, m: number, d: number) {
    return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

function MonthGrid({ year, month, from, to, hover, today, onPick, onHover }: {
    year: number; month: number; from: string | null; to: string | null; hover: string | null; today: string;
    onPick: (iso: string) => void; onHover: (iso: string | null) => void;
}) {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const end = to ?? (from && hover && hover >= from ? hover : null);
    return (
        <div className="w-[224px]">
            <p className="mb-2 text-center text-body-sm font-medium text-fg">{fmtMonthYear(first)}</p>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d} className="text-caption text-fg-muted">{d}</span>)}
                {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: daysIn }, (_, i) => {
                    const iso = isoOf(year, month, i + 1);
                    const future = iso > today;
                    const isEdge = iso === from || iso === end;
                    const inRange = from && end && iso > from && iso < end;
                    return (
                        <button
                            key={iso}
                            type="button"
                            disabled={future}
                            aria-pressed={isEdge}
                            aria-label={iso}
                            onClick={() => onPick(iso)}
                            onMouseEnter={() => onHover(iso)}
                            onMouseLeave={() => onHover(null)}
                            className={cn(
                                'mx-auto flex size-8 items-center justify-center rounded-md text-body-sm tabular-nums transition-colors duration-80',
                                future ? 'text-fg-faint' : 'text-fg hover:bg-subtle', // faint-ok: future days are disabled
                                inRange && 'rounded-none bg-brand-soft text-brand-soft-fg',
                                isEdge && 'bg-brand text-brand-fg hover:bg-brand-hover',
                            )}
                        >
                            {i + 1}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function RangeCalendar({ from: initFrom, to: initTo, onApply }: { from?: string; to?: string; onApply: (from: string, to: string) => void }) {
    const today = new Date().toISOString().slice(0, 10);
    const anchor = initTo ?? today;
    const [view, setView] = useState(() => {
        const d = new Date(`${anchor}T00:00:00Z`);
        return { y: d.getUTCFullYear(), m: d.getUTCMonth() - 1 };
    });
    const [from, setFrom] = useState<string | null>(initFrom ?? null);
    const [to, setTo] = useState<string | null>(initTo ?? null);
    const [hover, setHover] = useState<string | null>(null);
    const left = new Date(Date.UTC(view.y, view.m, 1));
    const right = new Date(Date.UTC(view.y, view.m + 1, 1));
    const shift = (n: number) => setView((v) => {
        const d = new Date(Date.UTC(v.y, v.m + n, 1));
        return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
    const pick = (iso: string) => {
        if (!from || to) {
            setFrom(iso);
            setTo(null);
        } else if (iso < from) {
            setFrom(iso);
        } else {
            setTo(iso);
        }
    };
    return (
        <div className="border-t border-border-subtle p-3 md:border-t-0">
            <div className="mb-2 flex items-center justify-between">
                <Button variant="ghost" size="sm" iconOnly icon={ChevronLeft} aria-label="Previous month" onClick={() => shift(-1)} />
                <span className="text-meta text-fg-muted">{from ? (to ? fmtDateRange(from, to) : 'Pick the end date') : 'Pick the start date'}</span>
                <Button variant="ghost" size="sm" iconOnly icon={ChevronRight} aria-label="Next month" onClick={() => shift(1)} />
            </div>
            <div className="flex gap-4">
                <MonthGrid year={left.getUTCFullYear()} month={left.getUTCMonth()} from={from} to={to} hover={hover} today={today} onPick={pick} onHover={setHover} />
                <div className="hidden md:block">
                    <MonthGrid year={right.getUTCFullYear()} month={right.getUTCMonth()} from={from} to={to} hover={hover} today={today} onPick={pick} onHover={setHover} />
                </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="primary" disabled={!from || !to} onClick={() => from && to && onApply(from, to)}>Apply</Button>
            </div>
        </div>
    );
}
