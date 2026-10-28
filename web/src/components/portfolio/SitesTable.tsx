'use client';

import { useState } from 'react';
import { Download, Star } from 'lucide-react';

import { Badge, Button, EmptyState, Favicon, MetricDelta, Skeleton, Table, type TableColumn } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { fmtFull, fmtPosition } from '@/lib/format';
import type { MetricKey } from '@/lib/metrics';
import type { PortfolioSite } from '@/lib/portfolio/types';
import { SiteStatusPill } from './SiteStatusPill';
import { VariantChip, type CardView } from './SiteCard';

export interface SitesTableProps {
    sites: PortfolioSite[];
    dates: { search: string[]; traffic: string[] };
    view: CardView;
    syncing: boolean;
    usersPending?: boolean;
    onOpen?: (site: PortfolioSite) => void;
    exportHref?: string;
    empty?: React.ReactNode;
    dimmed?: boolean;
}

/** Exact value with its delta underneath (keeps the table to 8 columns). */
function ValueDelta({ metric, value, prev, has, loading }: { metric: MetricKey; value: number | null | undefined; prev: number | null | undefined; has: boolean; loading?: boolean }) {
    if (!has) return <span className="text-fg-muted">–</span>;
    if (loading) return <Skeleton className="ml-auto h-3.5 w-14" delay={0} />;
    return (
        <span className="inline-flex flex-col items-end leading-tight">
            <span>{metric === 'position' ? fmtPosition(value) : fmtFull(value)}</span>
            {prev === null || prev === undefined ? null : <MetricDelta metric={metric} current={value} previous={prev} />}
        </span>
    );
}

/** List view: sortable columns, sparkline cells, CSV export (DESIGN 5.1 / 3.13). */
export function SitesTable({ sites, dates, view, syncing, usersPending, onOpen, exportHref, empty, dimmed }: SitesTableProps) {
    const [pageSize, setPageSize] = useState(50);
    const columns: TableColumn<PortfolioSite>[] = [
        {
            key: 'site',
            header: 'Site',
            sortable: true,
            firstSortDir: 'asc',
            sortValue: (s) => s.label,
            cell: (s) => (
                <span className="flex min-w-0 items-center gap-2">
                    <Favicon host={s.host || s.label} size={16} />
                    <span className="min-w-0 max-w-[140px] truncate font-medium sm:max-w-[240px]" title={s.gsc?.siteUrl ?? s.label}>{s.label}</span>
                    {s.variant ? <VariantChip text={s.variant} /> : null}
                    <Badge className="max-sm:hidden!">{s.gsc ? (s.gsc.propertyType === 'domain' ? 'Domain' : 'Prefix') : 'GA4'}</Badge>
                    {s.starred ? <Star aria-label="Starred" size={14} strokeWidth={1.75} className="shrink-0 fill-star text-star" /> : null}
                    {s.alerts.length ? <span aria-label={s.alerts.map((a) => a.message).join(', ')} title={s.alerts.map((a) => a.message).join(', ')} className={`size-2 shrink-0 rounded-full ${s.alerts[0].severity === 'critical' ? 'bg-down' : 'bg-warn'}`} /> : null}
                </span>
            ),
        },
        {
            key: 'clicks', header: 'Clicks', align: 'right', sortable: true, sortValue: (s) => s.search?.cur.clicks,
            cell: (s) => <ValueDelta metric="clicks" value={s.search?.cur.clicks} prev={s.search?.prev?.clicks} has={Boolean(s.search)} />,
        },
        {
            key: 'impressions', header: 'Impressions', align: 'right', sortable: true, sortValue: (s) => s.search?.cur.impressions,
            cell: (s) => <ValueDelta metric="impressions" value={s.search?.cur.impressions} prev={s.search?.prev?.impressions} has={Boolean(s.search)} />,
        },
        {
            key: 'position', header: 'Position', align: 'right', sortable: true, firstSortDir: 'asc', sortValue: (s) => s.search?.cur.position ?? null,
            cell: (s) => <ValueDelta metric="position" value={s.search?.cur.position} prev={s.search?.prev ? s.search.prev.position : undefined} has={Boolean(s.search)} />,
        },
        {
            key: 'users', header: 'Users', align: 'right', sortable: true, sortValue: (s) => s.traffic?.cur.users,
            cell: (s) => <ValueDelta metric="users" value={s.traffic?.cur.users} prev={s.traffic?.prev?.users} has={Boolean(s.traffic)} loading={usersPending && !s.traffic?.cur.usersExact} />,
        },
        {
            key: 'sessions', header: 'Sessions', align: 'right', sortable: true, sortValue: (s) => s.traffic?.cur.sessions,
            cell: (s) => <ValueDelta metric="sessions" value={s.traffic?.cur.sessions} prev={s.traffic?.prev?.sessions} has={Boolean(s.traffic)} />,
        },
        {
            key: 'trend', header: 'Trend', width: 112,
            cell: (s) => {
                const traffic = view === 'traffic' ? Boolean(s.traffic) : !s.search;
                const values = traffic ? s.series.users : s.series.clicks;
                if (!values?.length) return null;
                return (
                    <div className="w-24">
                        <Sparkline series={[{ metric: traffic ? 'users' : 'clicks', values }]} dates={traffic ? dates.traffic : dates.search} height={28} interactive={false} />
                    </div>
                );
            },
        },
        {
            key: 'status', header: 'Status', sortable: true, sortValue: (s) => s.status,
            cell: (s) => <SiteStatusPill site={s} syncing={syncing} />,
        },
    ];

    return (
        <Table
            className={dimmed ? 'opacity-60 transition-opacity duration-180' : 'transition-opacity duration-180'}
            caption="All sites"
            columns={columns}
            rows={sites}
            rowKey={(s) => s.key}
            density="comfortable"
            onRowClick={onOpen}
            empty={empty ?? <EmptyState variant="inline" title="No sites" />}
            pagination={{ pageSize, pageSizes: [25, 50, 100], onPageSizeChange: setPageSize }}
            toolbar={(
                <>
                    <span className="text-body-sm text-fg-muted tabular-nums">{fmtFull(sites.length)} {sites.length === 1 ? 'site' : 'sites'}</span>
                    <span className="flex-1" />
                    {exportHref ? (
                        <Button asChild variant="secondary" size="sm" icon={Download}>
                            <a href={exportHref} download>Export CSV</a>
                        </Button>
                    ) : null}
                </>
            )}
        />
    );
}
