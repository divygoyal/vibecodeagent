'use client';

import { Link2, Share2 } from 'lucide-react';

import { Card, StatCard } from '@/components/ui';
import { BarList, Donut } from '@/components/charts';
import { channelColor } from '@/lib/metrics';
import type { DemoSiteDashboard } from '../demo/types';
import { BrowserFrame } from '../site/Section';

/** A small dashboard rendered with the real widgets and sample data (home "Dashboards" visual). */
export function DashboardPreview({ dashboard }: { dashboard: DemoSiteDashboard }) {
    const { site, traffic, search } = dashboard;
    return (
        <BrowserFrame url={`trafficclaw.com/dashboard/dashboards/weekly-overview`} bodyClassName="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-title-sm text-fg">Weekly overview</p>
                    <p className="truncate text-meta text-fg-muted">{site.label} · last 28 days · sample data</p>
                </div>
                <div aria-hidden className="flex items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-body-sm font-medium text-fg shadow-xs">
                        <Link2 size={14} strokeWidth={1.75} /> Public link
                    </span>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand px-3 text-body-sm font-medium text-brand-fg">
                        <Share2 size={14} strokeWidth={1.75} /> Share
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {traffic ? (
                    <StatCard
                        metric="users"
                        value={traffic.totals.cur.users}
                        previous={traffic.totals.prev?.users}
                        comparisonLabel="previous 28 days"
                        sparkline={traffic.users}
                        sparklineDates={traffic.dates}
                    />
                ) : null}
                {search ? (
                    <StatCard
                        metric="clicks"
                        value={search.totals.cur.clicks}
                        previous={search.totals.prev?.clicks}
                        comparisonLabel="previous 28 days"
                        sparkline={search.clicks}
                        sparklineDates={search.dates}
                    />
                ) : null}
                {search ? (
                    <Card padding="sm">
                        <p className="mb-2 text-body-sm font-medium text-fg-secondary">Top search queries</p>
                        <BarList metric="clicks" limit={5} items={search.queries.map((q) => ({ key: q.query, label: q.query, text: q.query, value: q.clicks }))} />
                    </Card>
                ) : null}
                {traffic ? (
                    <Card padding="sm">
                        <p className="mb-2 text-body-sm font-medium text-fg-secondary">Channels</p>
                        <Donut size={120} legend="bottom" centerLabel="Sessions" maxSlices={5} items={traffic.channels.map((c) => ({ key: c.name, label: c.name, value: c.value, color: channelColor(c.name) }))} />
                    </Card>
                ) : null}
            </div>
        </BrowserFrame>
    );
}
