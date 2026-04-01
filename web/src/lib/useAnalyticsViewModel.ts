'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { DashboardFilters, FilterRule } from '@/stores/analyticsFilterStore';
import type {
    AnalyticsQueryDescriptor,
    AnalyticsViewConfig,
    AnalyticsViewState,
} from '@/types/analyticsWorkspace';

const FALLBACK_STORAGE_KEY = 'trafficclaw:analytics:explore:fallback';
const URL_VIEW_ID_KEY = 'view';
const URL_VIEW_STATE_KEY = 'viewState';

function encodeState(state: AnalyticsViewState): string {
    return encodeURIComponent(btoa(JSON.stringify(state)));
}

function decodeState(value: string | null): AnalyticsViewState | null {
    if (!value) return null;
    try {
        return JSON.parse(atob(decodeURIComponent(value))) as AnalyticsViewState;
    } catch {
        return null;
    }
}

export function buildViewState(params: {
    descriptor: AnalyticsQueryDescriptor;
    selectedRows: string[];
    filters: DashboardFilters;
    advancedFilters: FilterRule[];
}): AnalyticsViewState {
    const descriptor = params.descriptor;
    return {
        descriptor,
        metricSlots: descriptor.metrics,
        compareMode: descriptor.compareMode || (descriptor.compare ? 'previousPeriod' : 'off'),
        bucket: descriptor.bucket || 'day',
        chartType: descriptor.visualization || 'combo',
        secondaryMetric: descriptor.secondaryMetric || null,
        selectedRows: params.selectedRows,
        filterSet: {
            simple: params.filters,
            advanced: params.advancedFilters,
        },
    };
}

export function useAnalyticsViewModel({
    propertyId,
    fallbackDescriptor,
}: {
    propertyId: string;
    fallbackDescriptor: AnalyticsQueryDescriptor;
}) {
    const [views, setViews] = useState<AnalyticsViewConfig[]>([]);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);
    const [hydratedState, setHydratedState] = useState<AnalyticsViewState | null>(null);
    const [isLoadingViews, setIsLoadingViews] = useState(false);
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const activeView = useMemo(() => views.find((view) => view.id === activeViewId) || null, [views, activeViewId]);

    const setUrl = useCallback((payload: { viewId?: string | null; state?: AnalyticsViewState | null }) => {
        const next = new URLSearchParams(searchParams.toString());
        if (payload.viewId) next.set(URL_VIEW_ID_KEY, payload.viewId);
        else next.delete(URL_VIEW_ID_KEY);

        if (payload.state) next.set(URL_VIEW_STATE_KEY, encodeState(payload.state));
        else next.delete(URL_VIEW_STATE_KEY);

        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    const loadViews = useCallback(async () => {
        if (!propertyId) return;
        setIsLoadingViews(true);
        try {
            const response = await fetch(`/api/analytics/views?propertyId=${encodeURIComponent(propertyId)}`);
            if (!response.ok) throw new Error('Failed to load views');
            const json = await response.json() as { views: AnalyticsViewConfig[] };
            setViews(json.views || []);
        } catch {
            setViews([]);
        } finally {
            setIsLoadingViews(false);
        }
    }, [propertyId]);

    useEffect(() => {
        void loadViews();
    }, [loadViews]);

    useEffect(() => {
        const urlState = decodeState(searchParams.get(URL_VIEW_STATE_KEY));
        const urlViewId = searchParams.get(URL_VIEW_ID_KEY);
        const localFallback = (() => {
            if (typeof window === 'undefined') return null;
            try {
                const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
                return raw ? (JSON.parse(raw) as AnalyticsViewState) : null;
            } catch {
                return null;
            }
        })();

        if (urlState) {
            setHydratedState(urlState);
            return;
        }

        if (urlViewId) {
            const matched = views.find((view) => view.id === urlViewId);
            if (matched?.state) {
                setActiveViewId(matched.id);
                setHydratedState(matched.state);
                return;
            }
        }

        const defaultView = views.find((view) => view.isDefault);
        if (defaultView?.state) {
            setActiveViewId(defaultView.id);
            setHydratedState(defaultView.state);
            return;
        }

        if (localFallback) {
            setHydratedState(localFallback);
            return;
        }

        setHydratedState(buildViewState({
            descriptor: fallbackDescriptor,
            selectedRows: fallbackDescriptor.plotRows || [],
            filters: { country: [], device: [], channel: [], page: [], referrer: [], browser: [], os: [] },
            advancedFilters: [],
        }));
    }, [searchParams, views, fallbackDescriptor]);

    const persistFallback = useCallback((state: AnalyticsViewState) => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(state));
    }, []);

    const createView = useCallback(async (name: string, state: AnalyticsViewState) => {
        const response = await fetch(`/api/analytics/views?propertyId=${encodeURIComponent(propertyId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, state }),
        });
        if (!response.ok) throw new Error('Failed to create view');
        const json = await response.json() as { view: AnalyticsViewConfig; views: AnalyticsViewConfig[] };
        setViews(json.views || []);
        setActiveViewId(json.view.id);
        setUrl({ viewId: json.view.id });
        persistFallback(state);
        return json.view;
    }, [propertyId, persistFallback, setUrl]);

    const updateView = useCallback(async (id: string, patch: Partial<AnalyticsViewConfig>) => {
        const response = await fetch(`/api/analytics/views?propertyId=${encodeURIComponent(propertyId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...patch }),
        });
        if (!response.ok) throw new Error('Failed to update view');
        const json = await response.json() as { view: AnalyticsViewConfig; views: AnalyticsViewConfig[] };
        setViews(json.views || []);
        return json.view;
    }, [propertyId]);

    const deleteView = useCallback(async (id: string) => {
        const response = await fetch(`/api/analytics/views?propertyId=${encodeURIComponent(propertyId)}&id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete view');
        const json = await response.json() as { views: AnalyticsViewConfig[] };
        setViews(json.views || []);
        if (activeViewId === id) {
            setActiveViewId(null);
            setUrl({ viewId: null });
        }
    }, [propertyId, activeViewId, setUrl]);

    return {
        views,
        activeView,
        activeViewId,
        hydratedState,
        isLoadingViews,
        setActiveViewId,
        setUrl,
        loadViews,
        persistFallback,
        createView,
        updateView,
        deleteView,
    };
}
