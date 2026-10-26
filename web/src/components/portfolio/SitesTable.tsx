'use client';

import { useState } from 'react';
import { Download, Star } from 'lucide-react';

import { Badge, Button, EmptyState, Favicon, MetricDelta, Table, type TableColumn } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { fmtFull, fmtPosition } from '@/lib/format';
import { headlineChange } from '@/lib/portfolio/view';
import type { PortfolioSite } from '@/lib/portfolio/types';
import { SiteStatusPill } from './SiteStatusPill';
import type { CardView } from './SiteCard';

export interface SitesTableProps {
    sites: PortfolioSite[];
    dates: { search: string[]; traffic: string[] };
    view: CardView;
    syncing: boolean;
    onOpen?: (site: PortfolioSite) => void;
    exportHref?: string;
    empty?: React.ReactNode;
    dimmed?: boolean;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '–' : fmtFull(v));

/** List view: sortable columns, sparkline cells, CSV export (DESIGN 5.1 / 3.13). */
export function SitesTable({ sites, dates, view, syncing, onOpen, exportHref, empty, dimmed }: SitesTableProps) {
    const [pageSize, setPageSize] = useState(50);
    const columns: TableColumn<PortfolioSite>[] = [
        {
            key: 'site',
            header: 'Site',
            sortable: true,
            firstSortDir: 'asc',
            sortValue: (s) => s.label,
            width: '26%',
            cell: (s) => (
                <span className="flex min-w-0 items-center gap-2">
                    <Favicon host={s.host || s.label} size={16} />
                    <span className="min-w-0 truncate font-medium" title={s.label}>{s.label}</span>
                    <Badge className="hidden sm:inline-flex">{s.gsc ? (s.gsc.propertyType === 'domain' ? 'Domain' : 'Prefix') : 'GA4'}</Badge>
                    {s.starred ? <Star aria-label="Starred" size={14} strokeWidth={1.75} className="shrink-0 fill-star text-star" /> : null}
                    {s.alerts.length ? <span aria-label={s.alerts.map((a) => a.message).join(', ')} title={s.alerts.map((a) => a.message).join(', ')} className={`size-2 shrink-0 rounded-full ${s.alerts[0].severity === 'critical' ? 'bg-down' : 'bg-warn'}`} /> : null}
                </span>
            ),
        },
        {
            key: 'clicks', header: 'Clicks', align: 'right', sortable: true, sortValue: (s) => s.search?.cur.clicks,
            cell: (s) => num(s.search?.cur.clicks),
        },
        {
            key: 'clicksD', header: 'Δ', align: 'right', sortable: true, sortValue: (s) => headlineChange(s),
            cell: (s) => (s.search?.prev ? <MetricDelta metric="clicks" current={s.search.cur.clicks} previous={s.search.prev.clicks} /> : null),
        },
        {
            key: 'impressions', header: 'Impressions', align: 'right', sortable: true, sortValue: (s) => s.search?.cur.impressions,
            cell: (s) => num(s.search?.cur.impressions),
        },
        {
            key: 'imprD', header: 'Δ', align: 'right',
            cell: (s) => (s.search?.prev ? <MetricDelta metric="impressions" current={s.search.cur.impressions} previous={s.search.prev.impressions} /> : null),
        },
        {
            key: 'position', header: 'Position', align: 'right', sortable: true, firstSortDir: 'asc', sortValue: (s) => s.search?.cur.position ?? null,
            cell: (s) => (s.search ? fmtPosition(s.search.cur.position) : '–'),
        },
        {
            key: 'posD', header: 'Δ', align: 'right',
            cell: (s) => (s.search?.prev ? <MetricDelta metric="position" current={s.search.cur.position} previous={s.search.prev.position} /> : null),
        },
        {
            key: 'users', header: 'Users', align: 'right', sortable: true, sortValue: (s) => s.traffic?.cur.users,
            cell: (s) => num(s.traffic?.cur.users),
        },
        {
            key: 'usersD', header: 'Δ', align: 'right',
            cell: (s) => (s.traffic?.prev ? <MetricDelta metric="users" current={s.traffic.cur.users} previous={s.traffic.prev.users} /> : null),
        },
        {
            key: 'sessions', header: 'Sessions', align: 'right', sortable: true, sortValue: (s) => s.traffic?.cur.sessions,
            cell: (s) => num(s.traffic?.cur.sessions),
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
