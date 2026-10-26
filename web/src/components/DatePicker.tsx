'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/cn';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

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
    { label: 'Last 365 days', value: 'all', shortcut: 'A' },
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
            start.setDate(start.getDate() - (days - 1));
            return `${fmt(start)} - ${fmt(now)}`;
        }
        case '6m': {
            const start = new Date(now);
            start.setDate(start.getDate() - 179);
            return `${fmtYear(start)} - ${fmt(now)}`;
        }
        case '12m': {
            const start = new Date(now);
            start.setDate(start.getDate() - 364);
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
        case 'all': {
            const start = new Date(now);
            start.setDate(start.getDate() - 364);
            return `${fmtYear(start)} - ${fmt(now)}`;
        }
        default:
            return '';
    }
}

export default function DatePicker({ range, setRange, compact = false, chevrons = true }: DatePickerProps) {
    const [open, setOpen] = useState(false);

    const currentIndex = PRESET_VALUES.indexOf(range);
    const canGoBack = currentIndex < PRESET_VALUES.length - 1;
    const canGoForward = currentIndex > 0;
    const dateText = getDateRangeText(range);
    const flanked = chevrons && !compact;

    // Single-letter shortcuts while the menu is open (D, E, W, T, M, Y, 6, 0, A).
    // Handled before Radix's type-ahead, which would otherwise take the key.
    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key.toUpperCase();
        const match = PRESETS.find(
            (p): p is { label: string; value: string; shortcut?: string } => 'value' in p && !!p.shortcut && p.shortcut === key,
        );
        if (match) {
            e.preventDefault();
            setRange(match.value);
            setOpen(false);
        }
    };

    // One pill of three parts when flanked by the step buttons; no conflicting utilities (cn has no merge).
    const part = 'inline-flex h-9 items-center border border-border bg-surface text-fg shadow-xs transition-colors duration-120 ease-standard hover:border-border-strong hover:bg-subtle disabled:pointer-events-none disabled:opacity-50';
    const stepClass = cn(part, 'w-9 justify-center text-fg-secondary');

    return (
        <div className={cn(compact ? 'w-full sm:w-auto' : 'inline-flex', 'items-center')}>
            {flanked ? (
                <button
                    type="button"
                    onClick={() => canGoBack && setRange(PRESET_VALUES[currentIndex + 1])}
                    disabled={!canGoBack}
                    className={cn(stepClass, 'rounded-l-control')}
                    aria-label="Previous date range"
                >
                    <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
                </button>
            ) : null}
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            part,
                            'gap-2 px-3 text-left text-body font-medium',
                            flanked ? 'border-x-0' : 'rounded-control',
                            compact ? 'w-full sm:max-w-[200px]' : 'min-w-[150px]',
                        )}
                    >
                        <CalendarDays aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate">{getRangeLabel(range)}</span>
                            {flanked && dateText ? <span className="block truncate text-meta font-normal text-fg-muted tabular-nums max-sm:hidden">{dateText}</span> : null}
                        </span>
                        {chevrons ? (
                            <ChevronDown aria-hidden size={14} strokeWidth={1.75} className={cn('shrink-0 text-fg-muted transition-transform duration-120', open && 'rotate-180')} />
                        ) : null}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[min(440px,70dvh)] min-w-[230px] overflow-y-auto" onKeyDown={onMenuKeyDown}>
                    <DropdownMenuLabel>Time window</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={range} onValueChange={setRange}>
                        {PRESETS.map((item, i) =>
                            'separator' in item ? (
                                <DropdownMenuSeparator key={`sep-${i}`} />
                            ) : (
                                <DropdownMenuRadioItem key={item.value} value={item.value} className="pr-2">
                                    <span className="flex w-full items-center justify-between gap-3 pr-6">
                                        <span>{item.label}</span>
                                        {item.shortcut ? <span className="text-meta text-fg-muted">{item.shortcut}</span> : null}
                                    </span>
                                </DropdownMenuRadioItem>
                            ),
                        )}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {flanked ? (
                <button
                    type="button"
                    onClick={() => canGoForward && setRange(PRESET_VALUES[currentIndex - 1])}
                    disabled={!canGoForward}
                    className={cn(stepClass, 'rounded-r-control')}
                    aria-label="Next date range"
                >
                    <ChevronRight aria-hidden size={16} strokeWidth={1.75} />
                </button>
            ) : null}
        </div>
    );
}
