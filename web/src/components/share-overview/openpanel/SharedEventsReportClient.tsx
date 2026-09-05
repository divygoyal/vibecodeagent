'use client';
import { BRAND_NAME } from '@/lib/brand';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ArrowLeft, ExternalLink, Search, X } from 'lucide-react';
import {
    useShareOverviewState,
    type ShareOverviewEventTab,
} from '@/components/share-overview/openpanel/useShareOverviewState';
import {
    serializeShareOverviewEventNames,
    serializeShareOverviewFilters,
} from '@/lib/shareOverviewFilters';

type TopEventsResponse = {
    events: Array<{ id: string; name: string; count: number }>;
    conversions: Array<{ id: string; name: string; count: number }>;
    linkOut: Array<{ id: string; name: string; count: number }>;
    supported: { conversions: boolean; linkOut: boolean };
};

const EVENT_WIDGETS: Array<{ key: ShareOverviewEventTab; label: string }> = [
    { key: 'events', label: 'Events' },
    { key: 'conversions', label: 'Conversions' },
    { key: 'link_out', label: 'Link out' },
];

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

function fetchJson<T>(url: string): Promise<T> {
    return fetch(url).then(async (response) => {
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }

        return response.json();
    });
}

function buildSearch({
    filters,
    events,
    extra,
}: {
    filters: ReturnType<typeof useShareOverviewState>['filters'];
    events?: string[];
    extra?: Record<string, string | undefined>;
}) {
    const search = new URLSearchParams();

    if (filters.length) {
        search.set('f', serializeShareOverviewFilters(filters));
    }

    if (events?.length) {
        search.set('events', serializeShareOverviewEventNames(events));
    }

    Object.entries(extra || {}).forEach(([key, value]) => {
        if (value) {
            search.set(key, value);
        }
    });

    return search.toString();
}

function shortNumber(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString('en-US');
}

function SharedEventsReportPage({
    token,
    siteUrl,
}: {
    token: string;
    siteUrl?: string;
}) {
    const searchParams = useSearchParams();
    const {
        range,
        startDate,
        endDate,
        filters,
        eventNames,
        eventTab,
        setEventTab,
        setEventNames,
        removeEventName,
    } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');

    const query = useQuery<TopEventsResponse, Error>({
        queryKey: ['share-overview', token, 'events-report', range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(`/api/share/${token}/overview/top-events?${buildSearch({
            filters,
            events: eventNames,
            extra: {
                range,
                start: startDate || undefined,
                end: endDate || undefined,
            },
        })}`),
    });

    const items = useMemo(() => {
        if (!query.data) {
            return [];
        }

        if (eventTab === 'conversions') {
            return query.data.conversions;
        }

        if (eventTab === 'link_out') {
            return query.data.linkOut;
        }

        return query.data.events;
    }, [eventTab, query.data]);

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) {
            return items;
        }

        const needle = searchQuery.toLowerCase();
        return items.filter((item) => item.name.toLowerCase().includes(needle));
    }, [items, searchQuery]);

    const maxCount = Math.max(...filteredItems.map((item) => item.count), 1);
    const overviewHref = `/share/${token}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

    return (
        <div className="min-h-screen bg-[#080b0e] text-zinc-100">
            <div className="border-b border-white/[0.06] bg-[#07090c]">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100">{BRAND_NAME} Shared Events</div>
                        <div className="text-xs text-zinc-500">
                            {siteUrl ? `Analytics for ${siteUrl}` : 'Share-safe event report'}
                        </div>
                    </div>
                    <Link
                        href={overviewHref}
                        className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-zinc-100"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to overview
                    </Link>
                </div>
            </div>

            <div className="mx-auto max-w-6xl p-4">
                <div className="mb-4 rounded-xl border border-white/[0.08] bg-[#0d1014]">
                    <div className="border-b border-white/[0.06] px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {EVENT_WIDGETS.map((tab) => {
                                const disabled =
                                    (tab.key === 'conversions' && !query.data?.supported.conversions)
                                    || (tab.key === 'link_out' && !query.data?.supported.linkOut);

                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setEventTab(tab.key)}
                                        className={cx(
                                            'rounded-md px-2 py-1 text-xs transition',
                                            eventTab === tab.key && disabled ? 'cursor-not-allowed border border-amber-500/20 bg-amber-500/[0.08] text-amber-200' : '',
                                            eventTab === tab.key && !disabled ? 'bg-white/[0.08] text-white' : '',
                                            eventTab !== tab.key && disabled ? 'cursor-not-allowed text-zinc-700' : '',
                                            eventTab !== tab.key && !disabled ? 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200' : '',
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-b border-white/[0.04] px-3 py-2">
                        <label className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#0b0f14] px-3 py-2 text-xs text-zinc-400">
                            <Search className="h-3.5 w-3.5" />
                            <input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search events"
                                className="w-full bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
                            />
                        </label>
                    </div>

                    {eventNames.length ? (
                        <div className="flex flex-wrap gap-2 border-b border-white/[0.04] px-3 py-2">
                            {eventNames.map((eventName) => (
                                <button
                                    key={eventName}
                                    type="button"
                                    onClick={() => removeEventName(eventName)}
                                    className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-1 text-[11px] text-emerald-100 transition hover:bg-emerald-500/[0.12]"
                                >
                                    <span>{eventName}</span>
                                    <X className="h-3 w-3 text-emerald-300/70" />
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <div className="min-h-[420px]">
                        {query.isLoading ? (
                            <div className="flex h-[420px] items-center justify-center text-sm text-zinc-500">Loading events…</div>
                        ) : query.error ? (
                            <div className="flex h-[420px] items-center justify-center px-4 text-center text-sm text-red-400/80">{query.error.message}</div>
                        ) : !filteredItems.length ? (
                            <div className="flex h-[420px] items-center justify-center text-sm text-zinc-500">No events available</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 border-b border-white/[0.04] px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                                    <div>Event</div>
                                    <div className="text-right">Count</div>
                                </div>
                                {filteredItems.map((item) => {
                                    const selected = eventNames.includes(item.name);

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                setEventNames(
                                                    selected
                                                        ? eventNames.filter((value) => value !== item.name)
                                                        : [...eventNames, item.name],
                                                );
                                            }}
                                            className={cx(
                                                'group relative grid w-full grid-cols-[minmax(0,1fr)_90px] gap-3 overflow-hidden border-b border-white/[0.04] px-4 py-2 text-left transition hover:bg-white/[0.03]',
                                                selected ? 'bg-emerald-500/[0.08]' : '',
                                            )}
                                        >
                                            <div
                                                className={cx(
                                                    'absolute left-0 top-0 h-full transition group-hover:bg-white/[0.05]',
                                                    selected ? 'bg-emerald-500/[0.18]' : 'bg-white/[0.03]',
                                                )}
                                                style={{ width: `${(item.count / maxCount) * 100}%` }}
                                            />
                                            <div className={cx('relative z-10 flex min-w-0 items-center gap-2', selected ? 'text-white' : 'text-zinc-100')}>
                                                <span className="h-2 w-2 rounded-full bg-[#3ba974]" />
                                                <span className="truncate">{item.name}</span>
                                                {eventTab === 'link_out' ? <ExternalLink className="h-3 w-3 text-zinc-500" /> : null}
                                            </div>
                                            <div className={cx('relative z-10 text-right font-mono text-xs', selected ? 'text-white' : 'text-zinc-200')}>
                                                {shortNumber(item.count)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SharedEventsReportClient({
    token,
    siteUrl,
}: {
    token: string;
    siteUrl?: string;
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            <NuqsAdapter>
                <SharedEventsReportPage token={token} siteUrl={siteUrl} />
            </NuqsAdapter>
        </QueryClientProvider>
    );
}
