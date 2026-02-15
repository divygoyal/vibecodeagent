import useSWR from 'swr';
import { useRegistration } from '@/app/(dashboard)/dashboard/layout';

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
});

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
    return {
        botStatus: data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useGitHubData() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/github');
    return {
        commits: data?.commits || [],
        repos: data?.repos || [],
        heatmap: data?.heatmap || [],
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useAnalyticsData(section: string, propertyId?: string) {
    const query = propertyId ? `&propertyId=${propertyId}` : '';
    const url = section ? `/api/analytics?section=${section}${query}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url);
    
    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useSeoData(section: string, siteUrl?: string) {
    const query = siteUrl ? `&siteUrl=${encodeURIComponent(siteUrl)}` : '';
    const url = section ? `/api/seo?section=${section}${query}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url);
    
    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function useSiteList() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/seo?mode=list', {
        dedupingInterval: 300000 // Cache site list for 5 mins
    });
    
    return {
        sites: Array.isArray(data) ? data : [],
        isLoading,
        isError: error,
        refresh: mutate
    };
}

export function usePropertyList() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/analytics?mode=list', {
        dedupingInterval: 300000 // Cache property list for 5 mins
    });
    
    return {
        properties: Array.isArray(data) ? data : [],
        isLoading,
        isError: error,
        refresh: mutate
    };
}
