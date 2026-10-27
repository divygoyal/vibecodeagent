/**
 * Dashboard variables (round 2, C3): named values such as brand words or a list of AI sources,
 * defined once as a 'variable' control and used as {{var:name}} in widget filter values and text
 * widgets. The value lives in the control state like a filter value (URL `f.<id>`), so it reaches
 * the server through the existing pipeline; compileWidget substitutes it before planning Google
 * calls, which keeps cache keys stable per value. Viewers may change a variable only when the
 * control allows it and the share link allows filters.
 */
import type { ControlDef, ControlState, FilterClause, VariableControl } from './types';

export const VAR_PATTERN = /\{\{\s*var:([a-z0-9_]{1,32})\s*\}\}/gi;
export const MAX_VAR_LEN = 300;

export function variableControls(defs: ControlDef[] | undefined): VariableControl[] {
    return (defs ?? []).filter((c): c is VariableControl => c.type === 'variable');
}

/** A safe value for a variable: numbers parse, regexes compile and stay short, text is capped. */
export function cleanVariable(c: Pick<VariableControl, 'kind' | 'default'>, raw: string | undefined | null): string {
    const v = typeof raw === 'string' ? raw.trim().slice(0, MAX_VAR_LEN) : '';
    if (!v) return c.default;
    if (c.kind === 'number') return Number.isFinite(Number(v)) ? String(Number(v)) : c.default;
    if (c.kind === 'regex') {
        try {
            new RegExp(v);
            return v;
        } catch {
            return c.default;
        }
    }
    return v;
}

/** Current value of every variable (state wins over the default). */
export function variableValues(defs: ControlDef[] | undefined, state: Pick<ControlState, 'filters'> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of variableControls(defs)) out[c.id] = cleanVariable(c, state?.filters?.[c.id]?.[0]);
    return out;
}

export function hasVariables(text: string): boolean {
    VAR_PATTERN.lastIndex = 0;
    const r = VAR_PATTERN.test(text);
    VAR_PATTERN.lastIndex = 0;
    return r;
}

/** Replace {{var:name}}; unknown names are left as written. */
export function fillVariables(text: string, values: Record<string, string>): string {
    return text.replace(VAR_PATTERN, (m, k: string) => values[k.toLowerCase()] ?? m);
}

/** Widget filter clauses with variables filled in (clauses that end up empty are dropped). */
export function substituteFilters(filters: FilterClause[] | undefined, values: Record<string, string>): FilterClause[] | undefined {
    if (!filters?.length) return filters;
    let changed = false;
    const out: FilterClause[] = [];
    for (const f of filters) {
        if (Array.isArray(f.value)) {
            if (!f.value.some(hasVariables)) { out.push(f); continue; }
            changed = true;
            const value = f.value.map((x) => fillVariables(x, values)).filter((x) => x.length > 0);
            if (value.length) out.push({ ...f, value });
        } else {
            if (!hasVariables(f.value)) { out.push(f); continue; }
            changed = true;
            const value = fillVariables(f.value, values);
            if (value.length) out.push({ ...f, value });
        }
    }
    return changed ? out : filters;
}

/** A new variable id from a label ("Brand words" -> "brand_words"), unique in the doc. */
export function variableId(label: string, taken: string[]): string {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'var';
    let id = base;
    for (let i = 2; taken.includes(id); i++) id = `${base}_${i}`;
    return id;
}
