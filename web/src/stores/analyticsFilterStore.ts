import { create } from 'zustand';

export interface DashboardFilters {
    country: string[];
    device: string[];
    channel: string[];
    page: string[];
    referrer: string[];
    browser: string[];
    os: string[];
}

export interface FilterRule {
    parameter: string;
    type: 'equals' | 'not_equals' | 'contains' | 'not_contains';
    value: string;
}

interface FilterState {
    filters: DashboardFilters;
    advancedFilters: FilterRule[];
    compareMode: boolean;
    setFilter: (dimension: keyof DashboardFilters, values: string[]) => void;
    toggleFilter: (dimension: keyof DashboardFilters, value: string, multi?: boolean) => void;
    removeFilterValue: (dimension: keyof DashboardFilters, value: string) => void;
    clearFilter: (dimension: keyof DashboardFilters) => void;
    clearAll: () => void;
    setCompareMode: (on: boolean) => void;
    activeFilterCount: () => number;
    hasFilter: (dimension: keyof DashboardFilters, value: string) => boolean;
    addAdvancedFilter: (filter: FilterRule) => void;
    removeAdvancedFilter: (index: number) => void;
    updateAdvancedFilter: (index: number, filter: FilterRule) => void;
    clearAdvancedFilters: () => void;
}

const EMPTY_FILTERS: DashboardFilters = {
    country: [],
    device: [],
    channel: [],
    page: [],
    referrer: [],
    browser: [],
    os: [],
};

export const useFilterStore = create<FilterState>((set, get) => ({
    filters: { ...EMPTY_FILTERS },
    advancedFilters: [],
    compareMode: false,

    setFilter: (dimension, values) =>
        set(state => ({
            filters: { ...state.filters, [dimension]: values },
        })),

    toggleFilter: (dimension, value, multi = false) =>
        set(state => {
            const current = state.filters[dimension];
            const exists = current.includes(value);
            let next: string[];

            if (multi) {
                // Shift+click: add/remove from multi-select
                next = exists ? current.filter(v => v !== value) : [...current, value];
            } else {
                // Normal click: toggle single
                next = exists && current.length === 1 ? [] : [value];
            }

            return { filters: { ...state.filters, [dimension]: next } };
        }),

    removeFilterValue: (dimension, value) =>
        set(state => ({
            filters: {
                ...state.filters,
                [dimension]: state.filters[dimension].filter(v => v !== value),
            },
        })),

    clearFilter: (dimension) =>
        set(state => ({
            filters: { ...state.filters, [dimension]: [] },
        })),

    clearAll: () => set({ filters: { ...EMPTY_FILTERS }, advancedFilters: [] }),

    setCompareMode: (on) => set({ compareMode: on }),

    activeFilterCount: () => {
        const f = get().filters;
        const simpleCount = Object.values(f).reduce((sum, arr) => sum + (arr.length > 0 ? 1 : 0), 0);
        return simpleCount + get().advancedFilters.length;
    },

    hasFilter: (dimension, value) => {
        return get().filters[dimension].includes(value);
    },

    addAdvancedFilter: (filter) =>
        set(state => ({
            advancedFilters: [...state.advancedFilters, filter],
        })),

    removeAdvancedFilter: (index) =>
        set(state => ({
            advancedFilters: state.advancedFilters.filter((_, i) => i !== index),
        })),

    updateAdvancedFilter: (index, filter) =>
        set(state => ({
            advancedFilters: state.advancedFilters.map((f, i) => (i === index ? filter : f)),
        })),

    clearAdvancedFilters: () => set({ advancedFilters: [] }),
}));

// Helper: check if a data row passes current filters (simple + advanced)
export function passesFilters(
    filters: DashboardFilters,
    row: Record<string, string | undefined>,
    advancedFilters: FilterRule[] = []
): boolean {
    // Simple dimension filters (backward compatible)
    if (filters.country.length > 0 && row.country && !filters.country.includes(row.country)) return false;
    if (filters.device.length > 0 && row.device && !filters.device.includes(row.device)) return false;
    if (filters.channel.length > 0 && row.channel && !filters.channel.includes(row.channel)) return false;
    if (filters.page.length > 0 && row.page && !filters.page.includes(row.page)) return false;
    if (filters.referrer.length > 0 && row.referrer && !filters.referrer.includes(row.referrer)) return false;
    if (filters.browser.length > 0 && row.browser && !filters.browser.includes(row.browser)) return false;
    if (filters.os.length > 0 && row.os && !filters.os.includes(row.os)) return false;

    // Advanced filters
    for (const rule of advancedFilters) {
        const fieldValue = row[rule.parameter];
        if (fieldValue === undefined) continue;
        const val = fieldValue.toLowerCase();
        const ruleVal = rule.value.toLowerCase();

        switch (rule.type) {
            case 'equals':
                if (val !== ruleVal) return false;
                break;
            case 'not_equals':
                if (val === ruleVal) return false;
                break;
            case 'contains':
                if (!val.includes(ruleVal)) return false;
                break;
            case 'not_contains':
                if (val.includes(ruleVal)) return false;
                break;
        }
    }

    return true;
}
