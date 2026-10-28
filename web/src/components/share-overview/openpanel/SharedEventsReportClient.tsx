'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ArrowLeft, ExternalLink, MousePointerClick, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtCompact, fmtFull } from '@/lib/format';
import { Banner } from '@/components/ui/Banner';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { SHARE_CONTAINER, SharePage, ShareFooter, ShareHeader } from '@/components/share/ShareChrome';
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
    { key: 'conversions', label: 'Key events' },
    { key: 'link_out', label: 'Link out' },
];

function fetchJson<T>(url: string): Promise<T> {
    return fetch(url).then(async (response) => {
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.message || body.error || `Request failed (${response.status})`);
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
    const unsupported =
        (eventTab === 'conversions' && query.data && !query.data.supported.conversions)
        || (eventTab === 'link_out' && query.data && !query.data.supported.linkOut);

    return (
        <SharePage>
            <ShareHeader
                siteUrl={siteUrl}
                label="Shared events"
                actions={(
                    <Link href={overviewHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                        <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
                        Back to overview
                    </Link>
                )}
            />

            <main className={cn(SHARE_CONTAINER, 'py-4 md:py-6')}>
                <Card padding="none" className="overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                        <Tabs
                            variant="pills"
                            ariaLabel="Event lists"
                            value={eventTab}
                            onValueChange={(value) => setEventTab(value)}
                            items={EVENT_WIDGETS.map((tab) => ({
                                value: tab.key,
                                label: tab.label,
                                disabled:
                                    (tab.key === 'conversions' && !query.data?.supported.conversions)
                                    || (tab.key === 'link_out' && !query.data?.supported.linkOut),
                            }))}
                        />
                        <SearchInput
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            placeholder="Search events"
                            size="sm"
                            aria-label="Search events"
                        />
                    </div>

                    {eventNames.length ? (
                        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
                            <span className="text-meta text-fg-muted">Filtered to</span>
                            {eventNames.map((eventName) => (
                                <button
                                    key={eventName}
                                    type="button"
                                    onClick={() => removeEventName(eventName)}
                                    aria-label={`Remove filter ${eventName}`}
                                    className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-meta font-medium text-brand-soft-fg transition-opacity duration-120 hover:opacity-80"
                                >
                                    <span>{eventName}</span>
                                    <X aria-hidden size={12} strokeWidth={1.75} />
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <div className="min-h-[420px]">
                        {query.isLoading ? (
                            <div aria-busy className="flex flex-col gap-1 p-4">
                                {Array.from({ length: 8 }, (_, i) => (
                                    <div key={i} className="flex h-9 items-center gap-3">
                                        <Skeleton className="h-7 rounded-md" style={{ width: `${85 - i * 8}%` }} />
                                        <Skeleton className="ml-auto h-3 w-10" />
                                    </div>
                                ))}
                            </div>
                        ) : query.error ? (
                            <div className="p-4">
                                <Banner variant="danger">{query.error.message}</Banner>
                            </div>
                        ) : !filteredItems.length ? (
                            <EmptyState
                                variant="card"
                                icon={MousePointerClick}
                                title={searchQuery.trim() ? 'No events match your search' : 'No events in this period'}
                                description={unsupported
                                    ? 'This list is not available for this share.'
                                    : searchQuery.trim() ? 'Try another name.' : 'Try a longer date range on the overview.'}
                            />
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2 text-caption tracking-[0.04em] text-fg-muted uppercase">
                                    <span>Event</span>
                                    <span>Count</span>
                                </div>
                                <ul className="flex flex-col p-2">
                                    {filteredItems.map((item) => {
                                        const selected = eventNames.includes(item.name);
                                        return (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => {
                                                        setEventNames(
                                                            selected
                                                                ? eventNames.filter((value) => value !== item.name)
                                                                : [...eventNames, item.name],
                                                        );
                                                    }}
                                                    className={cn(
                                                        'group flex h-9 w-full items-center gap-3 rounded-md px-2 text-left transition-colors duration-120',
                                                        selected ? 'bg-brand-soft' : 'hover:bg-subtle/40',
                                                    )}
                                                >
                                                    <span className="relative flex h-7 min-w-0 flex-1 items-center gap-2 pl-2">
                                                        <span
                                                            aria-hidden
                                                            className="absolute inset-y-0 left-0 rounded-md heatbar-neutral"
                                                            style={{ width: `${Math.max((item.count / maxCount) * 100, 0.5)}%` }}
                                                        />
                                                        <span className={cn('relative min-w-0 truncate text-body', selected ? 'font-medium text-brand-soft-fg' : 'text-fg')}>{item.name}</span>
                                                        {eventTab === 'link_out' ? <ExternalLink aria-hidden size={12} strokeWidth={1.75} className="relative shrink-0 text-fg-muted" /> : null}
                                                    </span>
                                                    <span className="shrink-0 text-body text-fg tabular-nums" title={fmtFull(item.count)}>
                                                        {fmtCompact(item.count)}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <p className="border-t border-border-subtle px-4 py-3 text-meta text-fg-muted">
                                    Select events to filter the overview by them.
                                </p>
                            </>
                        )}
                    </div>
                </Card>
            </main>
            <ShareFooter />
        </SharePage>
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
