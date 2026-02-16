import useSWR from 'swr';
import { useRegistration } from '@/app/(dashboard)/dashboard/layout';

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error: any = new Error(body.error || `HTTP error! status: ${res.status}`);
        error.info = body;
        error.status = res.status;
        throw error;
    }
    return res.json();
};

// Options to prevent aggressive re-fetching but allow retries on error
const swrOptions = {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000, // Reduced from 60000 to allow faster recovery
    keepPreviousData: true,
    errorRetryCount: 3, // Retry failed requests
    errorRetryInterval: 3000, // Wait 3s between retries
};

// Hook that waits for registration before enabling the SWR key
function useRegisteredSWR(url: string | null, options = {}) {
    const { isRegistered, isRegistering } = useRegistration();
    
    // Only fetch if registered and URL is provided
    const key = isRegistered && !isRegistering ? url : null;
    
    return useSWR(key, fetcher, { ...swrOptions, ...options });
}

export function useContainerStatus() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/container');

    // Derive Google connection status from connectedProviders
    const hasGoogleConnection = data?.connectedProviders?.some(
        (c: { provider: string }) => c.provider === 'google'
    ) || false;

    return {
        botStatus: data,
        hasGoogleConnection,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useGitHubData() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/github', {
        errorRetryCount: 0, // Don't retry 400s — they won't self-resolve
    });
    
    // Detect connection state from the preserved error body
    const errorCode = error?.info?.code;
    const isNotConnected = errorCode === 'GITHUB_NOT_CONNECTED';
    const hasGitHubConnection = !isNotConnected && !error;
    
    return {
        commits: data?.commits || [],
        repos: data?.repos || [],
        heatmap: data?.heatmap || [],
        isLoading,
        isError: error,
        hasGitHubConnection,
        refresh: mutate
    };
}

export function useAnalyticsData(section: string, propertyId?: string, enabled = true) {
    const query = propertyId ? `&propertyId=${propertyId}` : '';
    const url = (section && enabled) ? `/api/analytics?section=${section}${query}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 60000,
    });
    
    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useSeoData(section: string, siteUrl?: string, enabled = true) {
    const query = siteUrl ? `&siteUrl=${encodeURIComponent(siteUrl)}` : '';
    const url = (section && enabled) ? `/api/seo?section=${section}${query}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 60000,
    });
    
    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useInsights(enabled = true) {
    const { data, error, isLoading } = useRegisteredSWR(
        enabled ? '/api/insights' : null,
        { dedupingInterval: 300000, errorRetryCount: 1 }
    );
    
    return {
        insights: data?.insights || [],
        isLoading,
        isError: error,
    };
}

export function useSiteList(enabled = true) {
    const { data, error, isLoading, mutate } = useRegisteredSWR(
        enabled ? '/api/seo?mode=list' : null,
        { dedupingInterval: 300000 }
    );
    
    return {
        sites: Array.isArray(data) ? data : [],
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function usePropertyList(enabled = true) {
    const { data, error, isLoading, mutate } = useRegisteredSWR(
        enabled ? '/api/analytics?mode=list' : null,
        { dedupingInterval: 300000 }
    );
    
    return {
        properties: Array.isArray(data) ? data : [],
        isLoading,
        isError: error,
        refresh: mutate
    };
}
