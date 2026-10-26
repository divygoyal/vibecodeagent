'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import useSWR from 'swr';

import { toast } from '@/components/ui';
import { useDateRange } from '@/components/shell/DateRangeControl';
import type { RangePreset } from '@/lib/dateRange';
import type { PortfolioRange, PortfolioResponse, PortfolioSite, SitePatch } from '@/lib/portfolio/types';
import { parseFilter, parseSort, type FilterKey, type SortKey } from '@/lib/portfolio/view';
import { patchWorkspaceWithRetry } from '@/lib/workspaceClient';
import { PortfolioView } from './PortfolioView';

class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

async function fetcher(url: string): Promise<PortfolioResponse> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new HttpError(res.status, (body as { error?: string }).error || `HTTP ${res.status}`);
    }
    return res.json();
}

const SITE_COOKIE = 'tc_site';

/** Make this site the "current" one for the per-site pages (site switcher + workspace). */
function selectSite(site: PortfolioSite) {
    try {
        document.cookie = `${SITE_COOKIE}=${encodeURIComponent(site.slug)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
        /* ignore */
    }
    void patchWorkspaceWithRetry({
        ...(site.gsc ? { selected_site_url: site.gsc.siteUrl } : { clear_site: true }),
        ...(site.ga4 ? { selected_property_id: site.ga4.property } : { clear_property: true }),
        workspace_label: site.label,
    }, { maxAttempts: 2 });
}

/** Nearest portfolio range for any app range preset. */
function toPortfolioRange(preset: RangePreset, days: number): PortfolioRange {
    if (preset === '7d' || preset === '28d' || preset === '3m' || preset === '12m') return preset;
    if (days <= 10) return '7d';
    if (days <= 45) return '28d';
    if (days <= 200) return '3m';
    return '12m';
}

function sitePatchUrl(site: PortfolioSite) {
    return `/api/portfolio/assets/${encodeURIComponent(site.key)}`;
}

/** Signed-in portfolio at /dashboard: data, polling while syncing, URL state and mutations. */
export function PortfolioPage() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    // The app-wide range (URL ?range=, saved to the workspace), mapped to what the portfolio offers.
    const dateRange = useDateRange();
    const range = toPortfolioRange(dateRange.value.preset, dateRange.resolved.days);
    const filter = parseFilter(params.get('show'));
    const sort = parseSort(params.get('sort'));
    const [syncBusy, setSyncBusy] = useState(false);

    const key = `/api/portfolio?range=${range}`;
    const { data, error, isLoading, isValidating, mutate } = useSWR<PortfolioResponse>(key, fetcher, {
        keepPreviousData: true,
        revalidateOnFocus: true,
        // Poll while a sync runs so cards fill in progressively.
        refreshInterval: (d) => (d?.syncing || d?.usersPending ? 2000 : 0),
        shouldRetryOnError: (err) => !(err instanceof HttpError && err.status === 401),
    });

    const setParam = useCallback((name: string, value: string, fallback: string) => {
        const next = new URLSearchParams(params.toString());
        if (value === fallback) next.delete(name);
        else next.set(name, value);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [params, pathname, router]);

    const patchSite = useCallback(async (site: PortfolioSite, patch: SitePatch, optimistic?: (s: PortfolioSite) => PortfolioSite) => {
        if (optimistic) {
            await mutate((d) => (d ? { ...d, sites: d.sites.map((s) => (s.key === site.key ? optimistic(s) : s)) } : d), { revalidate: false });
        }
        const res = await fetch(sitePatchUrl(site), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast.error((body as { error?: string }).error || 'Could not save the change', { duration: 8000 });
        }
        await mutate();
        return res.ok;
    }, [mutate]);

    const onToggleStar = useCallback((site: PortfolioSite) => {
        void patchSite(site, { starred: !site.starred }, (s) => ({ ...s, starred: !s.starred }));
    }, [patchSite]);

    const onToggleHidden = useCallback((site: PortfolioSite) => {
        const hide = !site.hidden;
        void patchSite(site, { hidden: hide }, (s) => ({ ...s, hidden: hide })).then((ok) => {
            if (ok && hide) {
                toast(`Hid ${site.label}`, {
                    description: 'It no longer counts in totals and alerts.',
                    duration: 8000,
                    action: { label: 'Undo', onClick: () => void patchSite(site, { hidden: false }, (s) => ({ ...s, hidden: false })) },
                });
            }
        });
    }, [patchSite]);

    const onSavePairing = useCallback(async (site: PortfolioSite, patch: SitePatch) => {
        const ok = await patchSite(site, patch);
        if (ok) toast.success('Pairing saved');
    }, [patchSite]);

    const onSyncNow = useCallback(async () => {
        setSyncBusy(true);
        try {
            const res = await fetch('/api/portfolio/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: true }),
            });
            if (res.status === 429) toast('Synced a moment ago', { description: 'Try again in a minute.' });
            else if (!res.ok) toast.error('Could not start a sync', { duration: 8000 });
            await mutate();
        } finally {
            setSyncBusy(false);
        }
    }, [mutate]);

    const errorText = error ? (error instanceof Error ? error.message : 'Something went wrong') : null;

    return (
        <PortfolioView
            data={data}
            loading={isLoading}
            refetching={Boolean(data && isValidating && data.range !== range)}
            error={errorText}
            range={range}
            onRangeChange={(r: PortfolioRange) => dateRange.setPreset(r)}
            filter={filter}
            onFilterChange={(f: FilterKey) => setParam('show', f, 'all')}
            sort={sort}
            onSortChange={(s: SortKey) => setParam('sort', s, 'clicks')}
            onOpenSite={selectSite}
            onToggleStar={onToggleStar}
            onToggleHidden={onToggleHidden}
            onSavePairing={onSavePairing}
            onSyncNow={onSyncNow}
            syncBusy={syncBusy}
            onConnectGoogle={() => void signIn('google', { callbackUrl: '/dashboard' }, { prompt: 'select_account consent' })}
            onRetry={() => void mutate()}
            exportHref={`/api/portfolio/export.csv?range=${range}`}
        />
    );
}
