import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
    AnalyticsChartConfig,
    AnalyticsLayoutConfig,
    AnalyticsPanelConfig,
    AnalyticsPanelId,
    AnalyticsViewConfig,
} from '@/types/analyticsWorkspace';

const DEFAULT_CHART: AnalyticsChartConfig = {
    primaryMetric: 'activeUsers',
    secondaryMetric: 'sessions',
    chartMode: 'combo',
    bucket: 'day',
    compareMode: false,
    smoothing: true,
    annotations: true,
};

const DEFAULT_PANELS: Record<AnalyticsPanelId, AnalyticsPanelConfig> = {
    acquisition: {
        id: 'acquisition',
        title: 'Traffic Sources',
        rowLimit: 25,
        accentTone: 'mint',
        visibleTabs: ['referrers', 'channels'],
    },
    content: {
        id: 'content',
        title: 'Top Pages',
        rowLimit: 25,
        accentTone: 'amber',
        visibleTabs: ['pages', 'entries'],
    },
    platforms: {
        id: 'platforms',
        title: 'Technology Mix',
        rowLimit: 25,
        accentTone: 'violet',
        visibleTabs: ['browsers', 'devices', 'os'],
    },
    geography: {
        id: 'geography',
        title: 'Geo Reach',
        rowLimit: 25,
        accentTone: 'mint',
        visibleTabs: ['countries', 'cities', 'languages', 'map'],
    },
    insights: {
        id: 'insights',
        title: 'Insight Cards',
        rowLimit: 3,
        accentTone: 'blue',
        visibleTabs: ['engagement', 'loyalty', 'diversity'],
    },
};

const DEFAULT_LAYOUT: AnalyticsLayoutConfig = {
    panelOrder: ['acquisition', 'content', 'platforms', 'geography', 'insights'],
    compactHeader: true,
};

function createDefaultView(): AnalyticsViewConfig {
    return {
        id: 'default-enterprise',
        name: 'Enterprise Default',
        isDefault: true,
        chart: { ...DEFAULT_CHART },
        panels: { ...DEFAULT_PANELS },
        layout: { ...DEFAULT_LAYOUT },
        updatedAt: new Date().toISOString(),
    };
}

function cloneView(view: AnalyticsViewConfig, overrides?: Partial<AnalyticsViewConfig>): AnalyticsViewConfig {
    return {
        ...view,
        ...overrides,
        chart: { ...view.chart, ...overrides?.chart },
        panels: {
            acquisition: { ...view.panels.acquisition, ...overrides?.panels?.acquisition },
            content: { ...view.panels.content, ...overrides?.panels?.content },
            platforms: { ...view.panels.platforms, ...overrides?.panels?.platforms },
            geography: { ...view.panels.geography, ...overrides?.panels?.geography },
            insights: { ...view.panels.insights, ...overrides?.panels?.insights },
        },
        layout: { ...view.layout, ...overrides?.layout },
    };
}

interface AnalyticsWorkspaceState {
    activeViewId: string;
    views: AnalyticsViewConfig[];
    setActiveView: (id: string) => void;
    updateChartConfig: (patch: Partial<AnalyticsChartConfig>) => void;
    updatePanelConfig: (panelId: AnalyticsPanelId, patch: Partial<AnalyticsPanelConfig>) => void;
    createView: (name: string) => AnalyticsViewConfig | null;
    duplicateView: (id: string) => AnalyticsViewConfig | null;
    renameView: (id: string, name: string) => void;
    deleteView: (id: string) => void;
    resetActiveView: () => void;
}

export const useAnalyticsWorkspaceStore = create<AnalyticsWorkspaceState>()(
    persist(
        (set, get) => ({
            activeViewId: 'default-enterprise',
            views: [createDefaultView()],
            setActiveView: (id) => set({ activeViewId: id }),
            updateChartConfig: (patch) =>
                set((state) => ({
                    views: state.views.map((view) =>
                        view.id === state.activeViewId
                            ? cloneView(view, {
                                chart: { ...view.chart, ...patch },
                                updatedAt: new Date().toISOString(),
                            })
                            : view,
                    ),
                })),
            updatePanelConfig: (panelId, patch) =>
                set((state) => ({
                    views: state.views.map((view) =>
                        view.id === state.activeViewId
                            ? cloneView(view, {
                                panels: {
                                    ...view.panels,
                                    [panelId]: { ...view.panels[panelId], ...patch },
                                },
                                updatedAt: new Date().toISOString(),
                            })
                            : view,
                    ),
                })),
            createView: (name) => {
                const trimmed = name.trim();
                if (!trimmed) return null;
                const active = get().views.find((view) => view.id === get().activeViewId) || createDefaultView();
                const next: AnalyticsViewConfig = cloneView(active, {
                    id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    name: trimmed,
                    isDefault: false,
                    updatedAt: new Date().toISOString(),
                });
                set((state) => ({
                    activeViewId: next.id,
                    views: [...state.views, next],
                }));
                return next;
            },
            duplicateView: (id) => {
                const source = get().views.find((view) => view.id === id);
                if (!source) return null;
                const copy = cloneView(source, {
                    id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    name: `${source.name} Copy`,
                    isDefault: false,
                    updatedAt: new Date().toISOString(),
                });
                set((state) => ({
                    activeViewId: copy.id,
                    views: [...state.views, copy],
                }));
                return copy;
            },
            renameView: (id, name) =>
                set((state) => ({
                    views: state.views.map((view) =>
                        view.id === id && !view.isDefault
                            ? { ...view, name: name.trim() || view.name, updatedAt: new Date().toISOString() }
                            : view,
                    ),
                })),
            deleteView: (id) =>
                set((state) => {
                    const nextViews = state.views.filter((view) => view.id !== id || view.isDefault);
                    return {
                        activeViewId: state.activeViewId === id ? 'default-enterprise' : state.activeViewId,
                        views: nextViews.length > 0 ? nextViews : [createDefaultView()],
                    };
                }),
            resetActiveView: () =>
                set((state) => ({
                    views: state.views.map((view) =>
                        view.id === state.activeViewId
                            ? cloneView(view.isDefault ? createDefaultView() : createDefaultView(), {
                                id: view.id,
                                name: view.name,
                                isDefault: view.isDefault,
                                updatedAt: new Date().toISOString(),
                            })
                            : view,
                    ),
                })),
        }),
        {
            name: 'trafficclaw-analytics-workspace',
            storage: createJSONStorage(() => localStorage),
            version: 1,
        },
    ),
);
