'use client';

/**
 * Per-widget dates (round 9, BUILDER-COMPARISON row 20): "Use dashboard dates" (default), one fixed range
 * (last 7 / 28 / 90 days, this or last month, year to date), or a time shift ("the same widget one year
 * earlier"). The comparison can follow the dashboard or be set for this widget. Precedence and resolution:
 * lib/builder/widgetDates.ts, the same code the engine runs.
 */
import { Select } from '@/components/ui';
import { PRESETS } from '@/lib/builder/dates';
import { cleanOverride, MAX_SHIFT, OVERRIDE_PRESETS, SHIFT_UNITS, type DateOverride } from '@/lib/builder/widgetDates';
import type { CompareSpec, DatePresetId, DateShift, WidgetDef } from '@/lib/builder/types';
import { Choice, Field, NumberInput } from './Fields';

type Mode = 'dashboard' | 'preset' | 'shift';
type CompareChoice = 'inherit' | 'none' | 'prev' | 'yoy';

const COMPARE_SPECS: Record<Exclude<CompareChoice, 'inherit'>, CompareSpec> = { none: { mode: 'none' }, prev: { mode: 'previous_period' }, yoy: { mode: 'previous_year' } };

function compareChoiceOf(c: CompareSpec | undefined): CompareChoice {
    if (!c) return 'inherit';
    if (c.mode === 'previous_period' && c.align !== 'weekday') return 'prev';
    if (c.mode === 'previous_year' && c.align !== 'weekday') return 'yoy';
    return c.mode === 'none' ? 'none' : 'inherit';
}

export function WidgetDatesField({ widget, edit }: { widget: WidgetDef; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    const o = widget.dateOverride;
    const mode: Mode = o?.range ? 'preset' : o?.shift ? 'shift' : 'dashboard';
    const preset: DatePresetId = o?.range?.kind === 'preset' && OVERRIDE_PRESETS.includes(o.range.id) ? o.range.id : '28d';
    const shift: DateShift = o?.shift ?? { unit: 'year', amount: 1 };
    const set = (next: DateOverride | undefined, key?: string) => edit((w) => {
        const { dateOverride: _drop, ...rest } = w;
        void _drop;
        const clean = cleanOverride(next);
        return (clean ? { ...rest, dateOverride: clean } : rest) as WidgetDef;
    }, key);
    const keepCompare = o?.compare ? { compare: o.compare } : {};
    const setMode = (m: Mode) => {
        if (m === 'dashboard') set(o?.compare ? { compare: o.compare } : undefined);
        else if (m === 'preset') set({ range: { kind: 'preset', id: preset }, ...keepCompare });
        else set({ shift, ...keepCompare });
    };
    // An override that only sets a comparison still counts as "own comparison", shown under the dashboard-dates mode.
    return (
        <div className="space-y-3" data-testid="widget-dates">
            <Field label="Dates" hint={mode === 'dashboard' ? 'Follows the dashboard’s date range.' : mode === 'preset' ? 'Always shows this range, whatever the dashboard shows. A chip marks the widget.' : 'Shows the dashboard’s range moved back in time. A chip marks the widget.'}>
                <Choice<Mode> ariaLabel="Widget dates" value={mode} onChange={setMode}
                    options={[{ value: 'dashboard', label: 'Use dashboard dates' }, { value: 'preset', label: 'Fixed range' }, { value: 'shift', label: 'Time shift' }]} />
            </Field>
            {mode === 'preset' ? (
                <Choice<DatePresetId> ariaLabel="Widget date range" value={preset}
                    onChange={(id) => set({ range: { kind: 'preset', id }, ...keepCompare })}
                    options={OVERRIDE_PRESETS.map((id) => ({ value: id, label: id === 'this_year' ? 'Year to date' : PRESETS.find((p) => p.id === id)?.label ?? id }))} />
            ) : null}
            {mode === 'shift' ? (
                <div className="flex items-center gap-2">
                    <NumberInput value={shift.amount} min={1} max={MAX_SHIFT} onChange={(n) => set({ shift: { ...shift, amount: n }, ...keepCompare }, 'shift')} />
                    <Select<DateShift['unit']> size="sm" ariaLabel="Shift unit" value={shift.unit} className="min-w-0 flex-1"
                        onValueChange={(unit) => set({ shift: { ...shift, unit }, ...keepCompare })}
                        options={SHIFT_UNITS.map((u) => ({ value: u.unit, label: `${shift.amount === 1 ? u.one : u.many} earlier` }))} />
                </div>
            ) : null}
            {(
                <Field label="Comparison for this widget">
                    <Choice<CompareChoice> ariaLabel="Widget comparison" value={compareChoiceOf(o?.compare)}
                        onChange={(c) => {
                            const base: DateOverride = { ...(o?.range ? { range: o.range } : o?.shift ? { shift: o.shift } : {}) };
                            set(c === 'inherit' ? base : { ...base, compare: COMPARE_SPECS[c] });
                        }}
                        options={[{ value: 'inherit', label: mode === 'dashboard' ? 'Follow the dashboard' : 'Same rule as the dashboard' }, { value: 'prev', label: 'Previous period' }, { value: 'yoy', label: 'Same period last year' }, { value: 'none', label: 'No comparison' }]} />
                </Field>
            )}
        </div>
    );
}
