// useWidgetData — SWR hook for fetching widget data in custom dashboards
// Supports both authenticated (editor) and public (view) modes.

'use client';

import useSWR from 'swr';
import type { DateRange } from '@/types/dashboard';

// ── Fetcher ──────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error: Error & { info?: unknown; status?: number } = new Error(
      (body as { error?: string }).error || `HTTP error! status: ${res.status}`,
    );
    error.info = body;
    error.status = res.status;
    throw error;
  }
  return res.json();
};

// ── SWR Options ──────────────────────────────────────────────

const baseOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30_000,   // Data doesn't change fast; 30s dedup
  keepPreviousData: true,
  errorRetryCount: 2,
  errorRetryInterval: 5_000,
};

// ── Hook: Authenticated Dashboard Data ───────────────────────

interface UseWidgetDataOptions {
  dashboardId: string | null;
  range?: DateRange;
  enabled?: boolean;
}

/**
 * Fetch widget data for an authenticated dashboard editor/preview.
 * Calls GET /api/dashboards/[id]/widget-data?range=30d
 */
export function useWidgetData({ dashboardId, range = '30d', enabled = true }: UseWidgetDataOptions) {
  const key = dashboardId && enabled
    ? `/api/dashboards/${dashboardId}/widget-data?range=${range}`
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    widgetData: Record<string, any>;
    fetchedAt: string;
  }>(key, fetcher, baseOptions);

  return {
    widgetData: data?.widgetData ?? null,
    fetchedAt: data?.fetchedAt ?? null,
    error,
    isLoading,
    isValidating,
    refresh: mutate,
  };
}

// ── Hook: Public Dashboard Data ──────────────────────────────

interface UsePublicWidgetDataOptions {
  shareToken: string | null;
  range?: DateRange;
  enabled?: boolean;
  refreshInterval?: number;
}

/**
 * Fetch widget data for a public (shared) dashboard view.
 * Calls GET /api/dashboards/public/[token]/widget-data?range=30d
 */
export function usePublicWidgetData({
  shareToken,
  range = '30d',
  enabled = true,
  refreshInterval,
}: UsePublicWidgetDataOptions) {
  const key = shareToken && enabled
    ? `/api/dashboards/public/${shareToken}/widget-data?range=${range}`
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    widgetData: Record<string, any>;
    fetchedAt: string;
  }>(key, fetcher, {
    ...baseOptions,
    refreshInterval: refreshInterval ?? 0,
  });

  return {
    widgetData: data?.widgetData ?? null,
    fetchedAt: data?.fetchedAt ?? null,
    error,
    isLoading,
    isValidating,
    refresh: mutate,
  };
}
