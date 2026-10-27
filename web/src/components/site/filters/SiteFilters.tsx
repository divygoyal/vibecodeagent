'use client';

/**
 * Click-to-filter for Traffic (MVP): click a source, page, country, device ...
 * in any card and every card refetches with that GA4 filter. State lives in
 * the URL (`?country=France&source=google`), so a filtered view is linkable.
 * Outside Traffic, the same click opens Traffic with that filter.
 */
import { useRouter } from 'next/navigation';
import { parseAsString, useQueryStates } from 'nuqs';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Filter, X } from 'lucide-react';

import { channelColor } from '@/lib/metrics';
import { siteHref } from '@/components/shell/nav';
import { Button } from '@/components/ui/Button';
import { flagForName } from '../lib/geo';
import { cleanFilters, FILTER_DEFS, FILTER_KEYS, hasFilters, type FilterKey, type SiteFilters } from '../lib/filters';
import { deviceLabel, sourceInfo } from '../lib/sources';
import { SourceIcon } from '../SourceIcon';
import { SiteFiltersContext, useSite } from '../useSiteData';

const QUERY = Object.fromEntries(FILTER_KEYS.map((k) => [k, parseAsString])) as Record<FilterKey, typeof parseAsString>;

interface FilterActions {
    filters: SiteFilters;
    add: (key: FilterKey, value: string) => void;
    remove: (key: FilterKey) => void;
    clear: () => void;
}

const ActionsContext = createContext<FilterActions | null>(null);

/** URL-bound filter state. Use once per page, in SiteFilterProvider. */
function useFilterState(): FilterActions {
    const [q, setQ] = useQueryStates(QUERY, { history: 'push', shallow: true, scroll: false });
    const filters = useMemo(() => cleanFilters(q), [q]);
    const add = useCallback((key: FilterKey, value: string) => void setQ({ [key]: value } as Partial<Record<FilterKey, string>>), [setQ]);
    const remove = useCallback((key: FilterKey) => void setQ({ [key]: null } as Partial<Record<FilterKey, null>>), [setQ]);
    const clear = useCallback(() => void setQ(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) as Record<FilterKey, null>), [setQ]);
    return useMemo(() => ({ filters, add, remove, clear }), [filters, add, remove, clear]);
}

/** Wrap a page's cards: GA4 reports below pick up the filters (useGa4) and rows become filter buttons. */
export function SiteFilterProvider({ children }: { children: ReactNode }) {
    const state = useFilterState();
    return (
        <ActionsContext.Provider value={state}>
            <SiteFiltersContext.Provider value={state.filters}>{children}</SiteFiltersContext.Provider>
        </ActionsContext.Provider>
    );
}

export function useFilterActions(): FilterActions | null {
    return useContext(ActionsContext);
}

/**
 * Row click handler for a filter key: filters in place on Traffic, or opens
 * Traffic with the filter from any other site page.
 */
export function useFilterClick(): (key: FilterKey, value: string) => void {
    const actions = useContext(ActionsContext);
    const router = useRouter();
    const { host } = useSite();
    return useCallback((key: FilterKey, value: string) => {
        if (!value || value === '(not set)') return;
        if (actions) {
            actions.add(key, value);
            return;
        }
        if (host) router.push(`${siteHref(host, 'traffic')}?${new URLSearchParams({ [key]: value }).toString()}`);
    }, [actions, router, host]);
}

/** Chip text for a filter value. */
function ChipValue({ k, value }: { k: FilterKey; value: string }) {
    if (k === 'source') {
        const info = sourceInfo(value);
        return <><span className="flex size-4 items-center justify-center"><SourceIcon info={info} /></span>{info.label}</>;
    }
    if (k === 'country') {
        const flag = flagForName(value);
        return <>{flag ? <span aria-hidden className="text-[13px] leading-none">{flag}</span> : null}{value}</>;
    }
    if (k === 'channel') return <><span aria-hidden className="size-2 rounded-full" style={{ background: channelColor(value) }} />{value}</>;
    if (k === 'device') return <>{deviceLabel(value)}</>;
    return <span className="max-w-[16rem] truncate" title={value}>{value}</span>;
}

/**
 * "Filtered by: [Source is Google ×] [Country is France ×] Clear" under the
 * tabs, or a one-line hint when nothing is filtered. `applies` false: the
 * current tab ignores filters (realtime, funnels ...), say so.
 */
export function FilterBar({ applies = true, hint = true }: { applies?: boolean; hint?: boolean }) {
    const actions = useFilterActions();
    if (!actions) return null;
    const { filters, remove, clear } = actions;
    const active = FILTER_KEYS.filter((k) => filters[k]);
    if (!hasFilters(filters)) {
        if (!hint || !applies) return null;
        return (
            <p className="mb-3 flex items-center gap-1.5 text-meta text-fg-muted">
                <Filter aria-hidden size={14} strokeWidth={1.75} />
                Click a source, page, country or device in any card to filter the whole view.
            </p>
        );
    }
    return (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
            <span className="flex items-center gap-1.5 text-meta text-fg-muted">
                <Filter aria-hidden size={14} strokeWidth={1.75} />
                {applies ? 'Filtered by' : 'Filters (not used on this tab)'}
            </span>
            {active.map((k) => (
                <span key={k} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface pr-1 pl-2.5 text-body-sm text-fg shadow-card pointer-coarse:h-8">
                    <span className="text-fg-muted">{FILTER_DEFS[k].label} is</span>
                    <ChipValue k={k} value={filters[k]!} />
                    <button
                        type="button"
                        onClick={() => remove(k)}
                        aria-label={`Remove filter ${FILTER_DEFS[k].label} is ${filters[k]}`}
                        className="tap-area flex size-5 items-center justify-center rounded-full text-fg-muted hover:bg-subtle hover:text-fg"
                    >
                        <X aria-hidden size={12} strokeWidth={2} />
                    </button>
                </span>
            ))}
            {active.length > 1 ? <Button size="sm" variant="ghost" onClick={clear}>Clear all</Button> : null}
        </div>
    );
}
