import useSWR from 'swr';
import { DEMO_QUERY_PARAM, DEMO_QUERY_VALUE } from '@/lib/demoWorkspace';

async function fetcher<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error((body as { error?: string }).error || 'Analytics request failed') as Error & {
            status?: number;
            info?: unknown;
        };
        error.status = response.status;
        error.info = body;
        throw error;
    }

    return body as T;
}

export function useAnalyticsSubpageData<T>(
    path: string,
    propertyId: string,
    range: string,
    enabled = true,
    dedupingInterval = 60_000,
    demoMode = false,
) {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (range) params.set('range', range);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);

    const key = enabled && (demoMode || !!propertyId) ? `${path}?${params.toString()}` : null;
    const { data, error, isLoading, mutate } = useSWR<T>(key, fetcher, {
        revalidateOnFocus: false,
        dedupingInterval,
        keepPreviousData: true,
    });

    return {
        data,
        error,
        isLoading,
        mutate,
    };
}
