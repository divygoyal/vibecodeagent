import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Options to prevent aggressive re-fetching
const swrOptions = {
    revalidateOnFocus: false, // Don't fetch when window gets focus
    revalidateOnReconnect: false, // Don't fetch on network reconnect
    dedupingInterval: 60000, // Dedup requests within 1 minute
    keepPreviousData: true, // Show old data while fetching new
};

export function useContainerStatus() {
    const { data, error, isLoading } = useSWR('/api/container', fetcher, swrOptions);
    return {
        botStatus: data,
        isLoading,
        isError: error
    };
}

export function useGitHubData() {
    const { data, error, isLoading } = useSWR('/api/github', fetcher, swrOptions);
    return {
        commits: data?.commits || [],
        repos: data?.repos || [],
        heatmap: data?.heatmap || [],
        isLoading,
        isError: error
    };
}

export function useAnalyticsData(section: string, propertyId?: string) {
    const query = propertyId ? `&propertyId=${propertyId}` : '';
    const { data, error, isLoading } = useSWR(
        `/api/analytics?section=${section}${query}`,
        fetcher,
        swrOptions
    );
    return {
        data,
        isLoading,
        isError: error
    };
}

export function useSeoData(section: string, siteUrl?: string) {
    const query = siteUrl ? `&siteUrl=${encodeURIComponent(siteUrl)}` : '';
    const { data, error, isLoading } = useSWR(
        `/api/seo?section=${section}${query}`,
        fetcher,
        swrOptions
    );
    return {
        data,
        isLoading,
        isError: error
    };
}

export function useSiteList() {
    const { data, error, isLoading } = useSWR('/api/seo?mode=list', fetcher, {
        ...swrOptions,
        dedupingInterval: 300000 // Cache site list for 5 mins
    });
    return {
        sites: Array.isArray(data) ? data : [],
        isLoading,
        isError: error
    };
}

export function usePropertyList() {
    const { data, error, isLoading } = useSWR('/api/analytics?mode=list', fetcher, {
        ...swrOptions,
        dedupingInterval: 300000 // Cache property list for 5 mins
    });
    return {
        properties: Array.isArray(data) ? data : [],
        isLoading,
        isError: error
    };
}
