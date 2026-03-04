import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRegistration } from '@/app/(dashboard)/dashboard/layout';
import { useSession } from 'next-auth/react';

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

// Bug #4/#6 fix: Hook that waits for registration but has a timeout fallback
// so data fetching isn't permanently blocked if registration is slow or fails.
const REGISTRATION_TIMEOUT = 3000; // 3 seconds max wait (reduced from 5s)

function useRegisteredSWR(url: string | null, options = {}) {
    const { isRegistered, isRegistering, registrationError } = useRegistration();
    const [timedOut, setTimedOut] = useState(false);

    // Optimistic: if sessionStorage says we're registered from a previous page load,
    // start fetching immediately without waiting for the registration POST to complete.
    const [optimistic] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('tc-registered') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (isRegistered || optimistic) return; // Already registered or optimistic, no need for timeout
        const timer = setTimeout(() => setTimedOut(true), REGISTRATION_TIMEOUT);
        return () => clearTimeout(timer);
    }, [isRegistered, optimistic]);

    // Allow fetching if:
    // - Registered normally, OR
    // - Optimistically using cached registration flag (returning user), OR
    // - Registration timed out (admin DB is slow but JWT tokens are still valid), OR
    // - Registration failed with error (proceed in degraded mode)
    const canFetch = isRegistered || optimistic || timedOut || !!registrationError;
    const key = canFetch ? url : null;

    return useSWR(key, fetcher, { ...swrOptions, ...options });
}

export function useContainerStatus() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/container');
    const { data: session } = useSession();

    // Bug #5 fix: Check from admin DB providers
    const adminHasGoogle = data?.connectedProviders?.some(
        (c: { provider: string }) => c.provider === 'google'
    ) || false;

    // Bug #5 fix: ALSO check from the current NextAuth session (JWT has the token)
    // This handles the case where admin DB hasn't synced yet
    const sessionHasGoogle = !!(session?.user as any)?.googleAccessToken;

    const hasGoogleConnection = adminHasGoogle || sessionHasGoogle;

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

export function useAnalyticsData(section: string, propertyId?: string, enabled = true, range = '30d') {
    const query = propertyId ? `&propertyId=${propertyId}` : '';
    const url = (section && enabled) ? `/api/analytics?section=${section}${query}&range=${range}` : null;
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

export function useInsights(siteUrl?: string, propertyId?: string, enabled = true) {
    const params = new URLSearchParams();
    if (siteUrl) params.set('siteUrl', siteUrl);
    if (propertyId) params.set('propertyId', propertyId);
    const qs = params.toString();
    const url = enabled ? `/api/insights${qs ? `?${qs}` : ''}` : null;

    const { data, error, isLoading } = useRegisteredSWR(url, {
        dedupingInterval: 600000, // 10 min — insights change slowly
        errorRetryCount: 1,
    });

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

export function useRealtimeData(propertyId?: string, enabled = true) {
    const url = (propertyId && enabled) ? `/api/analytics/realtime?property=${propertyId}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 10000,
        refreshInterval: 15000, // Auto-refresh every 15s for real-time feel
    });

    return {
        data,
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

export function useAIVisibility(siteUrl?: string, enabled = true) {
    const url = (siteUrl && enabled) ? `/api/ai-visibility?siteUrl=${encodeURIComponent(siteUrl)}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 1800000, // 30 min
        errorRetryCount: 1,
    });

    return {
        data,
        geoScore: data?.geoScore ?? null,
        isLoading,
        isError: error,
        refresh: mutate,
    };
}

export function useAlerts(siteUrl?: string, enabled = true) {
    const url = (siteUrl && enabled) ? `/api/alerts?siteUrl=${encodeURIComponent(siteUrl)}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 600000, // 10 min
        errorRetryCount: 1,
    });

    return {
        alerts: data?.alerts || [],
        alertCount: data?.alertCount ?? 0,
        isLoading,
        isError: error,
        refresh: mutate,
    };
}

export function useCredits() {
    const { data, error, isLoading, mutate } = useRegisteredSWR('/api/credits', {
        dedupingInterval: 30000,
        refreshInterval: 30000,
    });

    return {
        credits: data?.credits ?? null,
        isLoading,
        isError: error,
        refresh: mutate,
    };
}
