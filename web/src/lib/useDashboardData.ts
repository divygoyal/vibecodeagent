import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRegistration } from '@/app/(dashboard)/dashboard/layout';
import { useSession } from 'next-auth/react';
import { DEMO_QUERY_PARAM, DEMO_QUERY_VALUE } from '@/lib/demoWorkspace';

type FetcherErrorInfo = {
    error?: string;
    code?: string;
    [key: string]: unknown;
};

type FetcherError = Error & {
    info?: FetcherErrorInfo;
    status?: number;
};

type SessionUser = {
    googleAccessToken?: string;
    githubAccessToken?: string;
};

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as FetcherErrorInfo;
        const error = new Error(body.error || `HTTP error! status: ${res.status}`) as FetcherError;
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
const REGISTRATION_TIMEOUT = 1500; // 1.5 seconds max wait (reduced from 3s)

function useRegisteredSWR<T = any>(url: string | null, options = {}) {
    const { isRegistered, registrationError } = useRegistration();
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

    return useSWR<T, FetcherError>(key, fetcher, { ...swrOptions, ...options });
}

// Immediate SWR — bypasses the registration gate entirely.
// Used for endpoints that handle unregistered users gracefully (e.g. /api/container returns 404 → "not_provisioned").
function useImmediateSWR<T = any>(url: string | null, options = {}) {
    return useSWR<T, FetcherError>(url, fetcher, { ...swrOptions, ...options });
}

export function useContainerStatus() {
    const { data, error, isLoading, mutate } = useImmediateSWR('/api/container');
    const { data: session } = useSession();
    const appInstallationsQuery = useImmediateSWR<{ installations: { installation_id: number }[] }>(
        '/api/github-app/installations',
        { dedupingInterval: 60_000, errorRetryCount: 0 }
    );

    // Bug #5 fix: Check from admin DB providers
    const adminHasGoogle = data?.connectedProviders?.some(
        (c: { provider: string }) => c.provider === 'google'
    ) || false;
    const adminHasGithub = data?.connectedProviders?.some(
        (c: { provider: string }) => c.provider === 'github'
    ) || false;

    // Bug #5 fix: ALSO check from the current NextAuth session (JWT has the token)
    // This handles the case where admin DB hasn't synced yet
    const sessionHasGoogle = !!(session?.user as SessionUser | undefined)?.googleAccessToken;
    const sessionHasGithub = !!(session?.user as SessionUser | undefined)?.githubAccessToken;

    // Phase 2: GitHub App installations are a separate connection source
    const hasAppInstallation = (appInstallationsQuery.data?.installations?.length ?? 0) > 0;

    const hasGoogleConnection = adminHasGoogle || sessionHasGoogle;
    const hasGithubConnection = adminHasGithub || sessionHasGithub || hasAppInstallation;

    return {
        botStatus: data,
        hasGoogleConnection,
        hasGithubConnection,
        isLoading,
        isError: error,
        refresh: () => {
            mutate();
            appInstallationsQuery.mutate();
        }
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

export function useAnalyticsData(section: string, propertyId?: string, enabled = true, range = '30d', demoMode = false) {
    const params = new URLSearchParams();
    params.set('section', section);
    params.set('range', range);
    if (propertyId) params.set('propertyId', propertyId);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);
    const url = (section && enabled && (demoMode || !!propertyId)) ? `/api/analytics?${params.toString()}` : null;
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

export function useSeoData(section: string, siteUrl?: string, enabled = true, range = '30d', demoMode = false) {
    const params = new URLSearchParams();
    params.set('section', section);
    if (siteUrl) params.set('siteUrl', siteUrl);
    if (range) params.set('range', range);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);
    const url = (section && enabled && (demoMode || !!siteUrl)) ? `/api/seo?${params.toString()}` : null;
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

export function useGoalsData(propertyId?: string, enabled = true, range = '30d', demoMode = false) {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (range) params.set('range', range);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);
    const url = (enabled && (demoMode || !!propertyId)) ? `/api/analytics/goals?${params.toString()}` : null;
    const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
        dedupingInterval: 300000,
        errorRetryCount: 1,
    });

    return {
        data,
        isLoading,
        isError: error,
        refresh: mutate,
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
        // True once a fetch has resolved at least once. Distinct from
        // !isLoading: with a null SWR key (registration still pending)
        // isLoading is false while nothing has ever loaded — and the
        // stale-workspace guard must not treat that as "loaded but missing".
        hasLoaded: data !== undefined,
        isLoading,
        isError: Boolean(error),
        error,
        refresh: mutate
    };
}

export function useRealtimeData(propertyId?: string, enabled = true, demoMode = false) {
    const params = new URLSearchParams();
    if (propertyId) params.set('property', propertyId);
    if (demoMode) params.set(DEMO_QUERY_PARAM, DEMO_QUERY_VALUE);
    const url = (enabled && (demoMode || !!propertyId)) ? `/api/analytics/realtime?${params.toString()}` : null;
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
        // See useSiteList: distinguishes "fetched" from "never requested".
        hasLoaded: data !== undefined,
        isLoading,
        isError: Boolean(error),
        error,
        refresh: mutate
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
        plan: (data?.plan as string) ?? 'free',
        telegramBotEnabled: data?.telegram_bot_enabled ?? false,
        subscriptionEnd: data?.subscription_end ?? null,
        subscriptionId: data?.subscription_id ?? null,
        subscriptionCancelled: data?.subscription_cancelled ?? false,
        isLoading,
        isError: error,
        refresh: mutate,
    };
}

export function useOpportunitiesData(siteUrl: string | null, timeframe: string = '28d') {
  const url = siteUrl
    ? `/api/seo/opportunities?siteUrl=${encodeURIComponent(siteUrl)}&timeframe=${timeframe}`
    : null;
  return useRegisteredSWR<{ queries: unknown[]; comparisonQueries: unknown[] }>(url);
}

export function useKeywordDetail(siteUrl: string | null, keyword: string | null) {
  const url = siteUrl && keyword
    ? `/api/seo/keyword-detail?siteUrl=${encodeURIComponent(siteUrl)}&keyword=${encodeURIComponent(keyword)}`
    : null;
  return useRegisteredSWR<{ pages: unknown[]; trend: unknown[] }>(url);
}

export function usePageDetail(siteUrl: string | null, pageUrl: string | null) {
  const url = siteUrl && pageUrl
    ? `/api/seo/page-detail?siteUrl=${encodeURIComponent(siteUrl)}&pageUrl=${encodeURIComponent(pageUrl)}`
    : null;
  return useRegisteredSWR<{ keywords: unknown[]; devices: unknown[] }>(url);
}

export function useMobileGapData(siteUrl: string | null) {
  const url = siteUrl
    ? `/api/seo/mobile-gap?siteUrl=${encodeURIComponent(siteUrl)}`
    : null;
  return useRegisteredSWR<{ data: unknown[] }>(url);
}

export function useCannibalizationData(siteUrl: string | null) {
  const url = siteUrl
    ? `/api/seo/cannibalization?siteUrl=${encodeURIComponent(siteUrl)}`
    : null;
  return useRegisteredSWR<{
    cannibalized: Array<{
      query: string;
      pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
      totalClicks: number;
      totalImpressions: number;
      bestPosition: number;
      severity: 'high' | 'medium' | 'low';
    }>;
  }>(url);
}

export function useWinnersLosersData(siteUrl: string | null, timeframe: string = '28d') {
  const url = siteUrl
    ? `/api/seo/winners-losers?siteUrl=${encodeURIComponent(siteUrl)}&timeframe=${timeframe}`
    : null;
  type Movement = {
    query: string;
    clicksCurrent: number;
    clicksPrevious: number;
    clicksDelta: number;
    clicksDeltaPct: number;
    positionCurrent: number;
    positionPrevious: number;
    positionDelta: number;
    impressionsCurrent: number;
  };
  return useRegisteredSWR<{
    winners: Movement[];
    losers: Movement[];
    new: Movement[];
    lost: Movement[];
  }>(url);
}

export type SiteRepoLink = {
  site_url: string;
  repo_full_name: string;
  base_path: string | null;
  branch: string | null;
  confirmed: boolean;
  updated_at?: string;
};

export function useSiteRepoLinks() {
  const { data, error, isLoading, mutate } = useRegisteredSWR<{ links: SiteRepoLink[] }>(
    '/api/site-repo-links',
    { dedupingInterval: 60000 }
  );
  return {
    links: data?.links || [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

export type GithubRepoLite = {
  full_name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  stars: number;
  open_issues: number;
  default_branch: string;
  updated_at: string;
  pushed_at: string;
};

/**
 * Repo list for the picker. Prefers the GitHub App installation source (Phase 2 —
 * selective per-repo access) and falls back to the legacy OAuth-token source.
 */
export function useGithubRepos(enabled = true) {
  const appQuery = useImmediateSWR<{ installed: boolean; repos: GithubRepoLite[] }>(
    enabled ? '/api/github-app/repositories' : null,
    { dedupingInterval: 300_000, errorRetryCount: 0 }
  );
  const useApp = !!appQuery.data?.installed;

  const oauthQuery = useImmediateSWR<{ repos: GithubRepoLite[]; code?: string }>(
    enabled && !useApp ? '/api/github/repos' : null,
    { dedupingInterval: 600_000, errorRetryCount: 0 }
  );

  const data = useApp ? appQuery.data : oauthQuery.data;
  const repos = data?.repos || [];
  const notConnected = !useApp && (oauthQuery.data as { code?: string } | undefined)?.code === 'GITHUB_NOT_CONNECTED';

  return {
    repos,
    notConnected,
    source: useApp ? ('github_app' as const) : ('oauth' as const),
    isLoading: useApp ? appQuery.isLoading : oauthQuery.isLoading,
    isError: useApp ? appQuery.error : oauthQuery.error,
    refresh: () => {
      appQuery.mutate();
      oauthQuery.mutate();
    },
  };
}

export type GithubAppInstallation = {
  installation_id: number;
  account_login: string;
  account_type: string;
  repository_selection: string;
  repo_count: number;
  installed_at?: string;
};

export function useGithubAppInstallations(enabled = true) {
  const { data, error, isLoading, mutate } = useImmediateSWR<{ installations: GithubAppInstallation[] }>(
    enabled ? '/api/github-app/installations' : null,
    { dedupingInterval: 60_000, errorRetryCount: 0 }
  );
  return {
    installations: data?.installations || [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}
