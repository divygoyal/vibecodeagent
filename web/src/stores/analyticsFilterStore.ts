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

interface FilterState {
    filters: DashboardFilters;
    compareMode: boolean;
    setFilter: (dimension: keyof DashboardFilters, values: string[]) => void;
    toggleFilter: (dimension: keyof DashboardFilters, value: string, multi?: boolean) => void;
    clearFilter: (dimension: keyof DashboardFilters) => void;
    clearAll: () => void;
    setCompareMode: (on: boolean) => void;
    activeFilterCount: () => number;
    hasFilter: (dimension: keyof DashboardFilters, value: string) => boolean;
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

    clearFilter: (dimension) =>
        set(state => ({
            filters: { ...state.filters, [dimension]: [] },
        })),

    clearAll: () => set({ filters: { ...EMPTY_FILTERS } }),

    setCompareMode: (on) => set({ compareMode: on }),

    activeFilterCount: () => {
        const f = get().filters;
        return Object.values(f).reduce((sum, arr) => sum + (arr.length > 0 ? 1 : 0), 0);
    },

    hasFilter: (dimension, value) => {
        return get().filters[dimension].includes(value);
    },
}));

// Helper: check if a data row passes current filters
export function passesFilters(
    filters: DashboardFilters,
    row: { country?: string; device?: string; channel?: string; page?: string; referrer?: string; browser?: string; os?: string }
): boolean {
    if (filters.country.length > 0 && row.country && !filters.country.includes(row.country)) return false;
    if (filters.device.length > 0 && row.device && !filters.device.includes(row.device)) return false;
    if (filters.channel.length > 0 && row.channel && !filters.channel.includes(row.channel)) return false;
    if (filters.page.length > 0 && row.page && !filters.page.includes(row.page)) return false;
    if (filters.referrer.length > 0 && row.referrer && !filters.referrer.includes(row.referrer)) return false;
    if (filters.browser.length > 0 && row.browser && !filters.browser.includes(row.browser)) return false;
    if (filters.os.length > 0 && row.os && !filters.os.includes(row.os)) return false;
    return true;
}
