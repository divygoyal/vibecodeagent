'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

/**
 * `?<name>=` as a tab value with aliases for old links (e.g. traffic `?tab=goals`
 * -> 'events'). Unknown values fall back to the first tab. Changing the tab
 * pushes a history entry and keeps every other query param (range, compare).
 */
export function useTabParam<T extends string>(tabs: readonly T[], opts: { name?: string; aliases?: Record<string, T> } = {}) {
    const name = opts.name ?? 'tab';
    const [raw, setRaw] = useQueryState(name, parseAsString.withOptions({ history: 'push', scroll: false, shallow: true }));
    const aliased = raw ? opts.aliases?.[raw] ?? raw : null;
    const value = (aliased && (tabs as readonly string[]).includes(aliased) ? aliased : tabs[0]) as T;
    const setValue = useCallback((v: T) => {
        void setRaw(v === tabs[0] ? null : v);
    }, [setRaw, tabs]);
    return [value, setValue] as const;
}

/** A plain string query param (filters, drawers): `?page=`, `?q=`. */
export function useStringParam(name: string, history: 'push' | 'replace' = 'replace') {
    return useQueryState(name, parseAsString.withOptions({ history, scroll: false, shallow: true }));
}
