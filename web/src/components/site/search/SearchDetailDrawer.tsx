'use client';

import { ExternalLink } from 'lucide-react';

import { fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Skeleton } from '@/components/ui/Skeleton';
import { countryFromIso3 } from '../lib/geo';
import { displayPage, pageRef } from '../lib/rules';
import type { GscDetailResponse } from '../lib/types';
import { AskButton, LoadError } from '../SiteStates';
import { useGsc, useSite, useSiteRange } from '../useSiteData';

const TILES: ('clicks' | 'impressions' | 'ctr' | 'position')[] = ['clicks', 'impressions', 'ctr', 'position'];

/** Query or page drawer (DESIGN 5.5): trend, related pages/queries, countries, Ask. */
export function SearchDetailDrawer({ kind, value, onClose }: { kind: 'query' | 'page'; value: string | null; onClose: () => void }) {
    const site = useSite();
    const { compareOn } = useSiteRange();
    const q = useGsc<GscDetailResponse>(value ? 'detail' : null, { extra: value ? { [kind]: value } : undefined });
    const d = q.data;
    const title = value ? (kind === 'page' ? displayPage(pageRef(value), site.siteHost) : value) : '';
    return (
        <Drawer
            open={Boolean(value)}
            onOpenChange={(o) => { if (!o) onClose(); }}
            title={<span className="[overflow-wrap:anywhere]">{title}</span>}
            subtitle={kind === 'query' ? 'Search query' : 'Page in Google Search'}
            width="wide"
            footer={value ? (
                <div className="flex flex-wrap items-center gap-2">
                    <AskButton
                        prompt={kind === 'query'
                            ? `How can ${site.siteHost ?? site.label} get more clicks for the query "${value}"?${d ? ` It has ${fmtFull(d.totals.clicks)} clicks, ${fmtFull(d.totals.impressions)} impressions and average position ${fmtPosition(d.totals.position)}.` : ''}`
                            : `How can I get more Google clicks to ${title} on ${site.siteHost ?? site.label}?${d ? ` It has ${fmtFull(d.totals.clicks)} clicks, ${fmtFull(d.totals.impressions)} impressions, CTR ${fmtPercent(d.totals.ctr)} and position ${fmtPosition(d.totals.position)}.` : ''}`}
                        site={{ ga4: site.ga4, gsc: site.gsc }}
                        label={kind === 'query' ? 'Ask AI how to grow this query' : 'Ask AI to improve this page'}
                        from="site:search"
                    />
                    {kind === 'page' ? (
                        <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body-sm text-fg-secondary hover:text-fg">Open page <ExternalLink aria-hidden size={14} /></a>
                    ) : null}
                </div>
            ) : undefined}
        >
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : !d ? (
                <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-48" /><Skeleton className="h-40" /></div>
            ) : (
                <div className="flex flex-col gap-6">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {TILES.map((k) => (
                            <div key={k} className="rounded-card border border-border-subtle p-3">
                                <dt className="flex items-center gap-1.5 text-meta text-fg-muted"><span aria-hidden className="size-2 rounded-full" style={{ background: METRICS[k].color }} />{METRICS[k].label}</dt>
                                <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-stat-sm text-fg">{k === 'ctr' ? fmtPercent(d.totals.ctr) : k === 'position' ? fmtPosition(d.totals.position) : fmtFull(d.totals[k])}</span>
                                    {compareOn && d.previous ? <MetricDelta metric={k} current={d.totals[k]} previous={d.previous[k]} /> : null}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div>
                        <p className="mb-2 text-body-sm font-medium text-fg">Clicks per day</p>
                        <TimeSeriesChart
                            data={d.series as unknown as Record<string, number | string | null>[]}
                            series={[{ metric: 'clicks', key: 'clicks', compareKey: compareOn ? 'prev_clicks' : undefined }]}
                            compareDateKey="prevDate"
                            height={200}
                            ariaLabel={`Clicks per day for ${title}`}
                        />
                    </div>
                    <div>
                        <p className="mb-2 text-body-sm font-medium text-fg">{kind === 'query' ? 'Pages ranking for this query' : 'Queries for this page'}</p>
                        <BarList
                            items={d.related.map((r) => ({ key: r.key, label: kind === 'query' ? displayPage(pageRef(r.key), site.siteHost) : r.key, text: r.key, value: r.clicks }))}
                            metric="clicks"
                            limit={8}
                            labelHeader={kind === 'query' ? 'Page' : 'Query'}
                            viewAllTitle={kind === 'query' ? 'Pages' : 'Queries'}
                            empty={<EmptyState variant="inline" title="No clicks yet" description="Impressions without clicks are not listed here." />}
                        />
                    </div>
                    <div>
                        <p className="mb-2 text-body-sm font-medium text-fg">Countries</p>
                        <BarList
                            items={d.countries.map((r) => {
                                const c = countryFromIso3(r.key);
                                return { key: r.key, label: c.name, text: c.name, value: r.clicks, icon: c.flag ? <span aria-hidden>{c.flag}</span> : undefined };
                            })}
                            metric="clicks"
                            limit={6}
                            showShare
                            labelHeader="Country"
                            empty={<EmptyState variant="inline" title="No clicks yet" />}
                        />
                    </div>
                </div>
            )}
        </Drawer>
    );
}
