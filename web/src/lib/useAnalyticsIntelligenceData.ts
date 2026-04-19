'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRegistration } from '@/app/(dashboard)/dashboard/layout';
import type { AnalyticsIntelligenceData } from '@/lib/analyticsIntelligenceServer';
import { DEMO_QUERY_PARAM, DEMO_QUERY_VALUE } from '@/lib/demoWorkspace';

type FetchErrorInfo = {
    error?: string;
};

type FetchError = Error & {
    info?: FetchErrorInfo;
    status?: number;
};

const swrOptions = {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 60_000,
    keepPreviousData: true,
    errorRetryCount: 3,
    errorRetryInterval: 3_000,
};

const REGISTRATION_TIMEOUT_MS = 1_500;

async function fetcher<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as FetchErrorInfo;
        const error = new Error(body.error || `HTTP error! status: ${res.status}`) as FetchError;
        error.info = body;
        error.status = res.status;
        throw error;
    }

    return res.json() as Promise<T>;
}

function useRegisteredSWR<T>(url: string | null) {
    const { isRegistered, registrationError } = useRegistration();
    const [timedOut, setTimedOut] = useState(false);
    const [optimistic] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('tc-registered') === 'true';
        }

        return false;
    });

    useEffect(() => {
        if (isRegistered || optimistic) {
            return;
        }

        const timer = setTimeout(() => setTimedOut(true), REGISTRATION_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [isRegistered, optimistic]);

    const canFetch = isRegistered || optimistic || timedOut || Boolean(registrationError);
    return useSWR<T, FetchError>(canFetch ? url : null, fetcher, swrOptions);
}

export function useAnalyticsIntelligenceData(propertyId?: string, enabled = true, range = '30d', demoMode = false) {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    params.set('range', range);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);
    const url = (enabled && (demoMode || !!propertyId))
        ? `/api/analytics/intelligence?${params.toString()}`
        : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR<AnalyticsIntelligenceData>(url);

    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate,
    };
}
