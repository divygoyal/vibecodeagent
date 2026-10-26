'use client';

import Link from 'next/link';
import NumberFlow from '@number-flow/react';

import { fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { siteHref } from '@/components/shell/nav';
import { flagForName } from '../lib/geo';
import type { RealtimeResponse } from '../lib/types';
import { LoadError } from '../SiteStates';
import { SectionCard } from '../SummaryPanels';
import { useGa4, useSite } from '../useSiteData';
import { Flag } from './OverviewTab';

function useRealtime(interval: number) {
    return useGa4<RealtimeResponse>('realtime', { noRange: true, swr: { refreshInterval: interval, dedupingInterval: 15_000, keepPreviousData: true } });
}

/** "● 23 users right now →" for the Traffic header (polls every 60 s). */
export function LiveCount() {
    const { host } = useSite();
    const q = useRealtime(60_000);
    if (!q.data) return null;
    return (
        <Link href={`${siteHref(host, 'traffic')}?tab=realtime`} className="inline-flex h-9 items-center gap-2 rounded-control px-2 text-body-sm text-fg-secondary hover:bg-subtle hover:text-fg">
            <span aria-hidden className="size-2 rounded-full bg-up animate-live-dot" />
            <span className="tabular-nums">{fmtFull(q.data.activeUsers)}</span> {q.data.activeUsers === 1 ? 'user' : 'users'} right now
        </Link>
    );
}

/** Traffic > Realtime (DESIGN 5.6): last 30 minutes, polls every 30 s. No globe. */
export function TrafficRealtimeTab() {
    const q = useRealtime(30_000);
    const d = q.data;
    const max = Math.max(1, ...(d?.perMinute ?? [0]));
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <div className="flex flex-col gap-4">
            <Card>
                <div className="flex flex-col gap-6 md:flex-row md:items-end">
                    <div className="shrink-0">
                        <p className="flex items-center gap-2 text-body-sm text-fg-secondary">
                            <span aria-hidden className="size-2 rounded-full bg-up animate-live-dot" /> Active users, last 30 minutes
                        </p>
                        {d ? (
                            <p className="mt-1 text-stat-xl text-fg tabular-nums" aria-live="polite">
                                <NumberFlow value={d.activeUsers} />
                            </p>
                        ) : <Skeleton className="mt-2 h-12 w-28" />}
                        <p className="mt-1 text-meta text-fg-muted">Updates every 30 seconds{d ? ` · last at ${new Date(d.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="mb-2 text-meta text-fg-muted">Users per minute</p>
                        <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={d ? `Users per minute over the last 30 minutes, peak ${max}` : 'Loading'}>
                            {(d?.perMinute ?? Array.from({ length: 30 }, () => 0)).map((n, i) => (
                                <Tooltip key={i} content={`${29 - i === 0 ? 'Now' : `${29 - i} min ago`}: ${n} ${n === 1 ? 'user' : 'users'}`}>
                                    <span
                                        tabIndex={-1}
                                        className="block min-w-0 flex-1 rounded-t-[3px]"
                                        style={{ height: `${d ? Math.max(2, (n / max) * 100) : 6}%`, maxWidth: 24, background: d ? METRICS.users.color : 'var(--color-subtle)' }}
                                    />
                                </Tooltip>
                            ))}
                        </div>
                        <div className="mt-1 flex justify-between text-caption text-fg-muted"><span>30 min ago</span><span>Now</span></div>
                    </div>
                </div>
            </Card>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard title="Pages being viewed" description="Active users">
                    <BarList items={(d?.pages ?? []).map((r) => ({ key: r.name, label: r.name, text: r.name, value: r.users }))} metric="users" limit={8} loading={!d} labelHeader="Page" viewAllTitle="Live pages"
                        empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />
                </SectionCard>
                <SectionCard title="Countries" description="Active users">
                    <BarList items={(d?.countries ?? []).map((r) => ({ key: r.name, label: r.name, text: r.name, value: r.users, icon: <Flag>{flagForName(r.name)}</Flag> }))} metric="users" limit={8} loading={!d} labelHeader="Country" viewAllTitle="Live countries"
                        empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />
                </SectionCard>
                <SectionCard title="Devices" description="Active users">
                    <BarList items={(d?.devices ?? []).map((r) => ({ key: r.name, label: r.name ? r.name[0].toUpperCase() + r.name.slice(1) : r.name, text: r.name, value: r.users }))} metric="users" limit={5} loading={!d} labelHeader="Device"
                        empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />
                </SectionCard>
            </div>
        </div>
    );
}
