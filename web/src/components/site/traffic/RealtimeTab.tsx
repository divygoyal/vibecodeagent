'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import NumberFlow from '@number-flow/react';
import { Monitor, Smartphone, Tablet, Tv } from 'lucide-react';

import { fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { siteHref } from '@/components/shell/nav';
import { TabbedCard } from '../breakdown/TabbedCard';
import { deviceLabel, geoLabel } from '../lib/sources';
import type { RealtimeLiveRow, RealtimeResponse } from '../lib/types';
import { LoadError } from '../SiteStates';
import { FlagIcon } from '../SourceIcon';
import { useGa4, useSite } from '../useSiteData';

const GeoChoropleth = dynamic(() => import('@/components/charts/GeoChoropleth'), {
    ssr: false,
    loading: () => <div className="skeleton aspect-[2] w-full rounded-md" />,
});

function useRealtime(interval: number) {
    return useGa4<RealtimeResponse>('realtime', { noRange: true, swr: { refreshInterval: interval, dedupingInterval: 15_000, keepPreviousData: true } });
}

/** "● 23 users right now →" for the Traffic header (polls every 60 s). */
export function LiveCount() {
    const { host } = useSite();
    const q = useRealtime(60_000);
    if (!q.data) return null;
    return (
        <Link href={`${siteHref(host, 'traffic')}?tab=realtime`} className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-2 text-body-sm text-fg-secondary hover:bg-subtle hover:text-fg">
            <span aria-hidden className="size-2 rounded-full bg-up animate-live-dot" />
            <span className="tabular-nums">{fmtFull(q.data.activeUsers)}</span>
            {/* Phones: short label so the header's action row does not squeeze it onto three lines. */}
            <span className="sm:hidden">live</span>
            <span className="max-sm:hidden">{q.data.activeUsers === 1 ? 'user' : 'users'} right now</span>
        </Link>
    );
}

function DeviceIcon({ device }: { device: string }) {
    const d = device.toLowerCase();
    const Icon = d === 'mobile' ? Smartphone : d === 'tablet' ? Tablet : d === 'smart tv' ? Tv : Monitor;
    return <Icon aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />;
}

function ago(m: number): string {
    return m <= 0 ? 'now' : `${m} min ago`;
}

/** Aggregated GA4 realtime rows, newest first: not a visitor log (GA4 has none). */
function LiveList({ rows }: { rows: RealtimeLiveRow[] | null | undefined }) {
    if (rows === undefined) return <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>;
    if (rows === null) return <p className="py-6 text-center text-body-sm text-fg-muted">GA4 did not return recent activity for this property. The counts above still update.</p>;
    if (!rows.length) return <EmptyState variant="inline" title="Nobody on the site in the last 30 minutes" description="New activity shows up here within a minute." />;
    return (
        <ul className="flex flex-col" aria-live="polite">
            {rows.slice(0, 14).map((r, i) => {
                const place = r.city && r.city !== '(not set)' ? `${r.city}, ${geoLabel(r.country)}` : geoLabel(r.country);
                return (
                    <li key={`${r.minutesAgo}-${r.code}-${r.city}-${r.device}-${r.page}-${i}`} className="flex min-h-11 items-center gap-3 border-t border-border-subtle py-1.5 first:border-t-0">
                        <span className="flex size-5 shrink-0 items-center justify-center"><FlagIcon code={r.code} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm text-fg" title={r.page}>{r.page}</span>
                            <span className="flex items-center gap-1.5 text-meta text-fg-muted">
                                <span className="truncate">{place}</span>
                                <span aria-hidden>·</span>
                                <DeviceIcon device={r.device} />
                                <span>{deviceLabel(r.device)}</span>
                            </span>
                        </span>
                        <span className="shrink-0 text-right">
                            <span className="block text-body-sm text-fg tabular-nums">{fmtFull(r.users)} {r.users === 1 ? 'user' : 'users'}</span>
                            <span className="block text-meta text-fg-muted tabular-nums">{ago(r.minutesAgo)}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

/** Traffic > Realtime: live map, users per minute, recent activity (aggregated GA4 realtime, last 30 min). Polls every 30 s. */
export function TrafficRealtimeTab() {
    const q = useRealtime(30_000);
    const d = q.data;
    const max = Math.max(1, ...(d?.perMinute ?? [0]));
    const values = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of d?.countries ?? []) if (c.code && c.code !== '(not set)') m.set(c.code, (m.get(c.code) ?? 0) + c.users);
        return m;
    }, [d]);
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    const updated = d ? new Date(d.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
    return (
        <div className="flex flex-col gap-4">
            <Card padding="none" className="overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                    <div className="min-w-0 p-4 md:p-5 lg:border-r lg:border-border-subtle">
                        {d ? (
                            values.size ? (
                                <GeoChoropleth values={values} color={METRICS.users.color} format={fmtFull} label="Active users" markers={[...values.keys()]} aspect={2.1} showLegend={false} />
                            ) : <EmptyState variant="inline" title="No active users with a known country" description="The map lights up when people are on the site." />
                        ) : <Skeleton className="aspect-[2.1] w-full rounded-md" />}
                    </div>
                    <div className="flex min-w-0 flex-col gap-5 border-t border-border-subtle p-4 md:p-5 lg:border-t-0">
                        <div>
                            <p className="flex items-center gap-2 text-body-sm text-fg-secondary">
                                <span aria-hidden className="size-2 rounded-full bg-up animate-live-dot" /> Active users, last 30 minutes
                            </p>
                            {d ? (
                                <p className="mt-1 text-stat-xl text-fg tabular-nums" aria-live="polite">
                                    <NumberFlow value={d.activeUsers} />
                                </p>
                            ) : <Skeleton className="mt-2 h-12 w-28" />}
                            <p className="mt-1 text-meta text-fg-muted">Updates every 30 seconds{updated ? ` · last at ${updated}` : ''}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="mb-2 text-meta text-fg-muted">Users per minute</p>
                            <div className="flex h-20 items-end gap-[2px]" role="img" aria-label={d ? `Users per minute over the last 30 minutes, peak ${max}` : 'Loading'}>
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
                </div>
            </Card>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <Card as="section" aria-label="Recent activity">
                    <div className="mb-2">
                        <h3 className="text-title-sm text-fg">Recent activity</h3>
                        <p className="text-meta text-fg-muted">Last 30 minutes, newest first. GA4 reports active users in groups (minute, place, device, page), not individual visitors.</p>
                    </div>
                    <LiveList rows={d ? d.live : undefined} />
                </Card>
                <TabbedCard
                    id="realtime"
                    title="Right now"
                    tabs={[
                        {
                            value: 'pages', label: 'Pages',
                            content: <BarList items={(d?.pages ?? []).map((r) => ({ key: r.name, label: r.name, text: r.name, value: r.users }))} metric="users" valueHeader="Active users" limit={8} loading={!d} labelHeader="Page" viewAllTitle="Live pages"
                                empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />,
                        },
                        {
                            value: 'countries', label: 'Countries',
                            content: <BarList items={(d?.countries ?? []).map((r) => ({ key: `${r.code}-${r.name}`, label: geoLabel(r.name), text: geoLabel(r.name), value: r.users, icon: <FlagIcon code={r.code} /> }))} metric="users" valueHeader="Active users" limit={8} loading={!d} labelHeader="Country" viewAllTitle="Live countries"
                                empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />,
                        },
                        {
                            value: 'devices', label: 'Devices',
                            content: <BarList items={(d?.devices ?? []).map((r) => ({ key: r.name, label: deviceLabel(r.name), text: deviceLabel(r.name), value: r.users, icon: <DeviceIcon device={r.name} /> }))} metric="users" valueHeader="Active users" limit={5} loading={!d} labelHeader="Device"
                                empty={<EmptyState variant="inline" title="Nobody on the site right now" />} />,
                        },
                    ]}
                />
            </div>
        </div>
    );
}
