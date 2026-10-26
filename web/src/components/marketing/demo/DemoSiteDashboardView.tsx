'use client';

import { useMemo, useState } from 'react';

import { Badge, KpiStrip, type KpiItem } from '@/components/ui';
import { BarList, ChartCard, Donut, TimeSeriesChart } from '@/components/charts';
import { fmtDateRange } from '@/lib/format';
import { channelColor, deviceColor, fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { SiteIcon } from '../site/SiteIcon';
import type { DemoSiteDashboard } from './types';

const TRAFFIC_KEYS: MetricKey[] = ['users', 'sessions', 'pageviews'];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A read-only sample dashboard for one demo site, built from the same components as the app. */
export function DemoSiteDashboardView({ dashboard }: { dashboard: DemoSiteDashboard }) {
    const { site, traffic, search } = dashboard;
    const [selected, setSelected] = useState<MetricKey>(search ? 'clicks' : 'users');

    const items: KpiItem[] = [];
    if (search) {
        items.push(
            { metric: 'clicks', value: search.totals.cur.clicks, previous: search.totals.prev?.clicks },
            { metric: 'impressions', value: search.totals.cur.impressions, previous: search.totals.prev?.impressions },
            { metric: 'position', value: search.totals.cur.position, previous: search.totals.prev?.position },
        );
    }
    if (traffic) {
        items.push(
            { metric: 'users', value: traffic.totals.cur.users, previous: traffic.totals.prev?.users },
            { metric: 'sessions', value: traffic.totals.cur.sessions, previous: traffic.totals.prev?.sessions },
            { metric: 'pageviews', value: traffic.totals.cur.pageviews, previous: traffic.totals.prev?.pageviews },
        );
    }

    const chart = useMemo(() => {
        // Position is an impression-weighted average, shown as a number (PositionNote), not a per-day line.
        if ((selected === 'clicks' || selected === 'impressions') && search) {
            const cur = selected === 'clicks' ? search.clicks : search.impressions;
            const prev = selected === 'clicks' ? search.prevClicks : search.prevImpressions;
            return { window: search.window, rows: search.dates.map((date, i) => ({ date, value: cur[i], prev: prev[i], prevDate: search.prevDates[i] })) };
        }
        if (TRAFFIC_KEYS.includes(selected) && traffic) {
            const cur = selected === 'users' ? traffic.users : selected === 'sessions' ? traffic.sessions : traffic.pageviews;
            const prev = selected === 'users' ? traffic.prevUsers : selected === 'sessions' ? traffic.prevSessions : traffic.prevPageviews;
            return { window: traffic.window, rows: traffic.dates.map((date, i) => ({ date, value: cur[i], prev: prev[i], prevDate: traffic.prevDates[i] })) };
        }
        return null;
    }, [selected, search, traffic]);

    const window = traffic?.window ?? search?.window;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <SiteIcon host={site.host} size={24} />
                        <h1 className="min-w-0 truncate text-heading text-fg">{site.label}</h1>
                        {site.gsc ? <Badge>{site.gsc.propertyType === 'domain' ? 'Domain' : 'Prefix'}</Badge> : null}
                        {site.ga4 ? <Badge>GA4</Badge> : null}
                    </div>
                    <p className="mt-1 text-body-sm text-fg-muted">
                        Sample dashboard · {site.name}
                        {window ? ` · ${fmtDateRange(window.curStart, window.curEnd)} vs previous 28 days` : ''}
                    </p>
                </div>
            </div>

            {items.length ? (
                <KpiStrip items={items} selected={selected} onSelect={setSelected} comparisonLabel="previous 28 days" ariaLabel="Site metrics">
                    {chart && selected !== 'position' ? (
                        <TimeSeriesChart
                            data={chart.rows}
                            series={[{ metric: selected, key: 'value', compareKey: 'prev' }]}
                            compareDateKey="prevDate"
                            height={260}
                            ariaLabel={`${METRICS[selected].label} per day${chart.window ? `, ${fmtDateRange(chart.window.curStart, chart.window.curEnd)}` : ''}`}
                        />
                    ) : (
                        <PositionNote search={search} />
                    )}
                </KpiStrip>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                {search ? (
                    <ChartCard title="Top search queries" subtitle="Search Console · clicks" height="compact">
                        <BarList
                            metric="clicks"
                            labelHeader="Query"
                            valueHeader="Clicks"
                            items={search.queries.map((q) => ({ key: q.query, label: q.query, text: q.query, value: q.clicks }))}
                        />
                    </ChartCard>
                ) : null}
                {traffic ? (
                    <ChartCard title="Top pages" subtitle="Analytics · pageviews" height="compact">
                        <BarList
                            metric="pageviews"
                            labelHeader="Page"
                            valueHeader="Pageviews"
                            items={traffic.pages.map((p) => ({ key: p.name, label: p.name, text: p.name, value: p.value }))}
                        />
                    </ChartCard>
                ) : search ? (
                    <ChartCard title="Top pages from search" subtitle="Search Console · clicks" height="compact">
                        <BarList
                            metric="clicks"
                            labelHeader="Page"
                            valueHeader="Clicks"
                            items={search.pages.map((p) => ({ key: p.name, label: p.name, text: p.name, value: p.value }))}
                        />
                    </ChartCard>
                ) : null}
                {traffic ? (
                    <ChartCard title="Channels" subtitle="Sessions by default channel group" height="compact">
                        <Donut
                            centerLabel="Sessions"
                            items={traffic.channels.map((c) => ({ key: c.name, label: c.name, value: c.value, color: channelColor(c.name) }))}
                        />
                    </ChartCard>
                ) : null}
                {traffic ? (
                    <ChartCard title="Devices" subtitle="Sessions by device" height="compact">
                        <Donut
                            centerLabel="Sessions"
                            items={traffic.devices.map((d) => ({ key: d.name, label: cap(d.name), value: d.value, color: deviceColor(d.name) }))}
                        />
                    </ChartCard>
                ) : null}
                {traffic ? (
                    <ChartCard title="Countries" subtitle="Analytics · users" height="compact" className="lg:col-span-2">
                        <BarList
                            metric="users"
                            showShare
                            labelHeader="Country"
                            valueHeader="Users"
                            items={traffic.countries.map((c) => ({ key: c.name, label: c.name, text: c.name, value: c.value }))}
                        />
                    </ChartCard>
                ) : null}
            </div>
        </div>
    );
}

function PositionNote({ search }: { search: DemoSiteDashboard['search'] }) {
    if (!search) return null;
    const cur = search.totals.cur.position;
    const prev = search.totals.prev?.position;
    return (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-stat-lg text-fg">{fmtMetric('position', cur)}</p>
            <p className="text-body-sm text-fg-muted">
                Average position, weighted by impressions{prev ? ` (was ${fmtMetric('position', prev)})` : ''}. Lower is better.
            </p>
        </div>
    );
}
