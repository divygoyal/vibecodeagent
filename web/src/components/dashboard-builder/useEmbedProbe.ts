'use client';

/**
 * Is a web embed's page allowed to be framed? (round 9) The server reads the page's X-Frame-Options and CSP
 * frame-ancestors once an hour (server/embedProbe.ts); the answer drives the "open in a new tab" fallback.
 * Owner views and the editor ask with the address; share links ask by widget id (the viewer never names an address).
 */
import useSWR from 'swr';
import type { EmbedProbe } from '@/lib/builder/embed';
import { useChartSource } from './charts/chartNotes';
import { fetchJson } from './useWidgetData';

const OPTS = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 600_000, shouldRetryOnError: false, keepPreviousData: false } as const;

export function useEmbedProbe(widgetId: string, url: string, enabled: boolean): EmbedProbe | undefined {
    const src = useChartSource();
    let key: string | null = null;
    let init: RequestInit | undefined;
    if (enabled && url) {
        if (src.kind === 'owner') key = `/api/dashboards/embed-check?${new URLSearchParams({ url }).toString()}`;
        else if (src.kind === 'public') {
            key = `/api/dashboards/public/${src.token}/embed-check?${new URLSearchParams({ w: widgetId }).toString()}`;
            init = src.unlockKey ? { headers: { Authorization: `Bearer ${src.unlockKey}` } } : undefined;
        }
    }
    const q = useSWR<EmbedProbe>(key ? ['embed-probe', key, init ? 'k' : ''] : null, () => fetchJson<EmbedProbe>(key!, init), OPTS);
    return q.data;
}
