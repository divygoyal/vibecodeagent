'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Select } from './Select';

/**
 * A day picker in the app's own look (round 9 polish: the browser's mm/dd/yyyy inputs are gone). A field that shows
 * "Oct 14, 2026" and opens a one-month calendar; the year is a Select, the month has arrows, the arrow keys move
 * between days, days outside `min` / `max` are disabled. Values are 'YYYY-MM-DD' (calendar days, UTC, like the rest
 * of the builder). No library.
 */
export interface DateFieldProps {
    /** 'YYYY-MM-DD' or '' for nothing picked. */
    value: string;
    onChange: (iso: string) => void;
    /** Earliest and latest pickable day ('YYYY-MM-DD'). */
    min?: string;
    max?: string;
    ariaLabel: string;
    placeholder?: string;
    className?: string;
    /** Optional second line in the calendar ("Pick the day the comparison starts"). */
    hint?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDay = (iso: string, n: number) => isoOf(new Date(utc(iso).getTime() + n * DAY_MS));

/** "Oct 14, 2026". */
export function dayLabel(iso: string): string {
    if (!ISO.test(iso)) return '';
    return utc(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "October 14, 2026": the accessible name of a day button. */
function dayName(iso: string): string {
    return utc(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function DateField({ value, onChange, min, max, ariaLabel, placeholder = 'Pick a day', className, hint }: DateFieldProps) {
    const [open, setOpen] = useState(false);
    const valid = ISO.test(value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={valid ? `${ariaLabel}: ${dayName(value)}` : ariaLabel}
                    className={cn(
                        'tc-control inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-left text-body-sm transition-colors duration-120 hover:border-border-strong data-[state=open]:border-border-strong',
                        valid ? 'text-fg' : 'text-fg-muted',
                        className,
                    )}
                >
                    <CalendarDays aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                    <span className="min-w-0 truncate">{valid ? dayLabel(value) : placeholder}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[272px] p-3" aria-label={ariaLabel}>
                <MonthCalendar value={valid ? value : ''} min={min} max={max} hint={hint} onPick={(iso) => { onChange(iso); setOpen(false); }} />
            </PopoverContent>
        </Popover>
    );
}

function MonthCalendar({ value, min, max, hint, onPick }: { value: string; min?: string; max?: string; hint?: string; onPick: (iso: string) => void }) {
    const today = isoOf(new Date());
    const start = value || (max && max < today ? max : today);
    const [view, setView] = useState(() => ({ y: utc(start).getUTCFullYear(), m: utc(start).getUTCMonth() }));
    const [focus, setFocus] = useState(start);
    const grid = useRef<HTMLDivElement>(null);
    const moved = useRef(false);

    const first = new Date(Date.UTC(view.y, view.m, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const outside = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
    const minYear = min ? utc(min).getUTCFullYear() : new Date().getUTCFullYear() - 10;
    const maxYear = max ? utc(max).getUTCFullYear() : new Date().getUTCFullYear();
    const years = useMemo(() => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(maxYear - i)), [minYear, maxYear]);
    if (!years.includes(String(view.y))) years.push(String(view.y));

    const showMonth = (iso: string) => setView({ y: utc(iso).getUTCFullYear(), m: utc(iso).getUTCMonth() });
    const step = (n: number) => {
        const d = new Date(Date.UTC(view.y, view.m + n, 1));
        setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    };
    const monthIso = (y: number, m: number) => isoOf(new Date(Date.UTC(y, m, 1)));
    const prevOff = Boolean(min && monthIso(view.y, view.m) <= min.slice(0, 7) + '-01');
    const nextOff = Boolean(max && monthIso(view.y, view.m + 1) > max);

    // Keyboard moves focus inside the grid; the focused day is the only tab stop (roving tabindex).
    useEffect(() => {
        if (!moved.current) return;
        grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus({ preventScroll: true });
    }, [focus, view]);

    const onKey = (e: React.KeyboardEvent) => {
        const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
        if (!delta) return;
        e.preventDefault();
        let next = addDay(focus, delta);
        if (min && next < min) next = min;
        if (max && next > max) next = max;
        moved.current = true;
        setFocus(next);
        showMonth(next);
    };

    // The focus stop must be a day of the shown month.
    const stop = focus.slice(0, 7) === `${view.y}-${String(view.m + 1).padStart(2, '0')}` ? focus : monthIso(view.y, view.m);

    return (
        <div>
            <div className="mb-2 flex items-center gap-1">
                <Button variant="ghost" size="sm" iconOnly icon={ChevronLeft} aria-label="Previous month" disabled={prevOff} onClick={() => step(-1)} />
                <span className="min-w-0 flex-1 text-center text-body-sm font-medium text-fg">{MONTHS[view.m]}</span>
                <Select<string> size="sm" ariaLabel="Year" className="w-[76px]! min-w-0! px-2!" contentClassName="max-h-56" value={String(view.y)} onValueChange={(y) => setView((v) => ({ ...v, y: Number(y) }))} options={years.map((y) => ({ value: y, label: y }))} />
                <Button variant="ghost" size="sm" iconOnly icon={ChevronRight} aria-label="Next month" disabled={nextOff} onClick={() => step(1)} />
            </div>
            <div ref={grid} role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onKey} className="grid grid-cols-7 gap-y-0.5 text-center">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d} role="columnheader" className="text-caption text-fg-muted">{d}</span>)}
                {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: daysIn }, (_, i) => {
                    const iso = monthIso(view.y, view.m).slice(0, 8) + String(i + 1).padStart(2, '0');
                    const disabled = outside(iso);
                    const on = iso === value;
                    return (
                        <button
                            key={iso}
                            type="button"
                            role="gridcell"
                            data-iso={iso}
                            disabled={disabled}
                            aria-selected={on}
                            aria-label={dayName(iso)}
                            aria-current={iso === today ? 'date' : undefined}
                            tabIndex={iso === stop ? 0 : -1}
                            onClick={() => onPick(iso)}
                            onFocus={() => setFocus(iso)}
                            className={cn(
                                'mx-auto flex size-8 items-center justify-center rounded-md text-body-sm tabular-nums transition-colors duration-80',
                                disabled ? 'text-fg-faint' : 'text-fg hover:bg-subtle', // faint-ok: out-of-range days are disabled
                                iso === today && !on && 'font-semibold text-brand-text',
                                on && 'bg-brand text-brand-fg hover:bg-brand-hover',
                            )}
                        >
                            {i + 1}
                        </button>
                    );
                })}
            </div>
            {hint ? <p className="mt-2 text-meta text-fg-muted">{hint}</p> : null}
        </div>
    );
}
