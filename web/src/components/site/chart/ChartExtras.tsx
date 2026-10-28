'use client';

/**
 * Chart extras for the site pages: day / week / month switch, the ◀ ▶ period
 * stepper, and chart markers (Google ranking updates + the user's own notes,
 * stored by /api/annotations).
 */
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Diamond, Plus, StickyNote, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { lastCompleteDay } from '@/lib/dateRange';
import { fmtDateRange, fmtDay } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/components/ui/Toaster';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDateRange } from '@/components/shell/DateRangeControl';
import { GOOGLE_UPDATES_SOURCE, googleUpdatesIn, type GoogleUpdate } from '../lib/googleUpdates';
import { allowedIntervals, effectiveInterval, isInterval, snapToBucket, type Interval } from '../lib/intervals';
import { fetchJson, useJson, useSite } from '../useSiteData';

// ─── Interval ──────────────────────────────────────────────────────────────

/** `?interval=week` (shared by every chart on the page), limited to what the range allows. */
export function useInterval(days: number): { interval: Interval; set: (i: Interval) => void; allowed: Interval[] } {
    const [raw, setRaw] = useQueryState('interval', parseAsString.withOptions({ history: 'replace', shallow: true, scroll: false }));
    const requested = isInterval(raw) ? raw : 'day';
    return {
        interval: effectiveInterval(requested, days),
        set: (i: Interval) => void setRaw(i === 'day' ? null : i),
        allowed: allowedIntervals(days),
    };
}

export function IntervalSwitch({ days, className }: { days: number; className?: string }) {
    const { interval, set, allowed } = useInterval(days);
    return (
        <SegmentedControl<Interval>
            ariaLabel="Chart interval"
            size="sm"
            variant="neutral"
            value={interval}
            onChange={set}
            // Phones: the card header has no room; day is the default there.
            className={cn('max-sm:hidden', className)}
            options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week', disabled: !allowed.includes('week') },
                { value: 'month', label: 'Month', disabled: !allowed.includes('month') },
            ]}
        />
    );
}

export const INTERVAL_NOUN: Record<Interval, string> = { day: 'day', week: 'week', month: 'month' };

// ─── Period stepper ────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** ◀ ▶: move the whole range back or forward by its own length (becomes a custom range). */
export function PeriodStepper({ search }: { search?: boolean }) {
    const dr = useDateRange();
    const r = search ? dr.resolvedSearch : dr.resolved;
    const lastDay = lastCompleteDay(search ? 'gsc' : 'ga4');
    const go = (dir: -1 | 1) => {
        let from = shift(r.start, dir * r.days);
        let to = shift(r.end, dir * r.days);
        if (to > lastDay) {
            to = lastDay;
            from = shift(to, -(r.days - 1));
        }
        dr.setValue({ preset: 'custom', compare: dr.value.compare, from, to });
    };
    const atEnd = r.end >= lastDay;
    const prevLabel = `${fmtDateRange(shift(r.start, -r.days), shift(r.end, -r.days))}`;
    return (
        <div className="flex shrink-0 items-center max-sm:hidden" role="group" aria-label="Step through periods">
            <Tooltip content={`Previous period: ${prevLabel}`}>
                <Button variant="ghost" size="md" iconOnly icon={ChevronLeft} aria-label={`Previous period, ${prevLabel}`} onClick={() => go(-1)} />
            </Tooltip>
            <Tooltip content={atEnd ? 'Already at the latest data' : 'Next period'} >
                <Button variant="ghost" size="md" iconOnly icon={ChevronRight} aria-label="Next period" onClick={() => go(1)} disabled={atEnd} />
            </Tooltip>
        </div>
    );
}

// ─── Markers: Google updates + your notes ─────────────────────────────────

export interface UserNote {
    id: number;
    date: string;
    title: string;
    description?: string | null;
    category?: string;
    property_id?: string | null;
}

export interface ChartMarker {
    key: string;
    /** Day of the event. */
    date: string;
    /** Row date it is drawn on (bucket start for weeks / months). */
    at: string;
    label: string;
    kind: 'google' | 'note';
    detail: string;
    noteId?: number;
}

/** Notes scope: the GA4 property, else the Search Console site (null = all sites). */
function useNoteScope(): string | null {
    const { ga4, gsc } = useSite();
    const scope = ga4 ?? gsc;
    return scope && scope.length <= 100 ? scope : null;
}

function notesKey(scope: string | null, start: string, end: string) {
    const p = new URLSearchParams({ startDate: start, endDate: end });
    if (scope) p.set('propertyId', scope);
    return `/api/annotations?${p.toString()}`;
}

/**
 * Markers for a chart showing `dates` (row dates, daily or bucket starts)
 * from `start` to `end`. Google updates are drawn on their rollout start.
 */
export function useChartMarkers(dates: string[], start: string, end: string, opts: { google?: boolean } = {}) {
    const scope = useNoteScope();
    const key = start && end ? notesKey(scope, start, end) : null;
    const notes = useJson<UserNote[]>(key, { revalidateOnFocus: false, dedupingInterval: 60_000, errorRetryCount: 0 });
    const markers = useMemo(() => {
        const out: ChartMarker[] = [];
        if (!dates.length) return out;
        if (opts.google !== false) {
            for (const u of googleUpdatesIn(start, end)) {
                const at = snapToBucket(u.start, dates);
                if (at) out.push({ key: `g-${u.start}-${u.name}`, date: u.start, at, label: u.name, kind: 'google', detail: googleDetail(u) });
            }
        }
        for (const n of Array.isArray(notes.data) ? notes.data : []) {
            if (n.date < start || n.date > end) continue;
            const at = snapToBucket(n.date, dates);
            if (at) out.push({ key: `n-${n.id}`, date: n.date, at, label: n.title, kind: 'note', detail: n.description || 'Your note', noteId: n.id });
        }
        return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }, [dates, start, end, notes.data, opts.google]);
    return { markers, notesKey: key, scope, mutateNotes: notes.mutate, notesFailed: notes.state === 'error' };
}

function googleDetail(u: GoogleUpdate): string {
    return `Google ${u.kind === 'core' ? 'core' : u.kind === 'spam' ? 'spam' : 'ranking'} update, rolled out ${fmtDateRange(u.start, u.end)}. Source: Google Search Status Dashboard.`;
}

/** TimeSeriesChart annotations: one per row date (labels joined). */
export function toAnnotations(markers: ChartMarker[]): { date: string; label: string }[] {
    const by = new Map<string, string[]>();
    for (const m of markers) by.set(m.at, [...(by.get(m.at) ?? []), m.label]);
    return [...by].map(([date, labels]) => ({ date, label: labels.join(' · ') }));
}

/**
 * The key under a chart: what each dashed marker is, plus "Add note".
 * Google updates carry a diamond, your notes a note icon.
 */
export function ChartMarkers({ markers, start, end, notesKey, scope, onChanged, notesFailed }: {
    markers: ChartMarker[];
    start: string;
    end: string;
    notesKey: string | null;
    scope: string | null;
    onChanged: () => void;
    notesFailed?: boolean;
}) {
    return (
        <div className={cn('mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5', markers.length ? 'border-t border-border-subtle pt-3' : 'justify-end')}>
            {markers.length ? <span className="mr-0.5 text-meta text-fg-muted">Markers</span> : null}
            {markers.map((m) => (
                <Tooltip key={m.key} content={<span className="block max-w-xs">{m.detail}</span>}>
                    <button
                        type="button"
                        className="inline-flex h-6 max-w-[18rem] items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2 text-meta text-fg-secondary hover:bg-subtle pointer-coarse:h-8"
                    >
                        {m.kind === 'google'
                            ? <Diamond aria-hidden size={10} strokeWidth={2} className="shrink-0 fill-warn text-warn" />
                            : <StickyNote aria-hidden size={12} strokeWidth={1.75} className="shrink-0 text-brand-text" />}
                        <span className="tabular-nums text-fg-muted">{fmtDay(m.date)}</span>
                        <span className="truncate">{m.label}</span>
                    </button>
                </Tooltip>
            ))}
            <NotesPopover start={start} end={end} notesKey={notesKey} scope={scope} notes={markers.filter((m) => m.kind === 'note')} onChanged={onChanged} failed={notesFailed} />
        </div>
    );
}

function NotesPopover({ start, end, scope, notes, onChanged, failed }: {
    start: string; end: string; notesKey: string | null; scope: string | null; notes: ChartMarker[]; onChanged: () => void; failed?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState(end);
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const save = async () => {
        const t = title.trim();
        if (!t || !date) return;
        setBusy(true);
        try {
            await fetchJson('/api/annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, title: t.slice(0, 200), category: 'custom', ...(scope ? { propertyId: scope } : {}) }),
            });
            setTitle('');
            setOpen(false);
            onChanged();
            toast('Note added to the charts');
        } catch {
            toast.error("Couldn't save the note. Try again in a moment.");
        } finally {
            setBusy(false);
        }
    };
    const remove = async (id?: number) => {
        if (!id) return;
        try {
            await fetchJson(`/api/annotations?id=${id}`, { method: 'DELETE' });
            onChanged();
            toast('Note deleted');
        } catch {
            toast.error("Couldn't delete the note.");
        }
    };
    const field = 'h-9 w-full rounded-control border border-border-subtle bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-brand';
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDate(end); }}>
            <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" icon={Plus} className="h-6 px-2 pointer-coarse:h-8">Add note</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-4" aria-label="Chart notes">
                <p className="text-body-sm font-medium text-fg">Add a note to your charts</p>
                <p className="mt-0.5 text-meta text-fg-muted">A launch, a campaign, a site change. It shows on the Traffic and Search charts of this site.</p>
                <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                    <label className="text-meta text-fg-secondary" htmlFor="note-date">Date</label>
                    <input id="note-date" type="date" className={field} value={date} min={start} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
                    <label className="text-meta text-fg-secondary" htmlFor="note-title">What happened</label>
                    <input id="note-title" className={field} value={title} maxLength={200} placeholder="Launched the new pricing page" onChange={(e) => setTitle(e.target.value)} />
                    <div className="mt-1 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!title.trim()}>Add note</Button>
                    </div>
                </form>
                {failed ? <p className="mt-3 text-meta text-down">Your notes could not load right now.</p> : null}
                {notes.length ? (
                    <div className="mt-4 border-t border-border-subtle pt-3">
                        <p className="mb-1.5 text-meta text-fg-muted">Your notes in this period</p>
                        <ul className="flex flex-col gap-1">
                            {notes.map((n) => (
                                <li key={n.key} className="flex items-center gap-2 text-body-sm">
                                    <span className="w-12 shrink-0 text-meta text-fg-muted tabular-nums">{fmtDay(n.date)}</span>
                                    <span className="min-w-0 flex-1 truncate text-fg">{n.label}</span>
                                    <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete note ${n.label}`} onClick={() => void remove(n.noteId)} />
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                <p className={cn('mt-3 text-caption text-fg-muted')}>
                    Google updates come from the <a className="underline" href={GOOGLE_UPDATES_SOURCE} target="_blank" rel="noreferrer">Search Status Dashboard</a>.
                </p>
            </PopoverContent>
        </Popover>
    );
}
