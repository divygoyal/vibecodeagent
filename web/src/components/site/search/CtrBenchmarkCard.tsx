'use client';

import { useMemo } from 'react';

import { fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { CtrPositionChart, type CtrPoint } from '@/components/charts/CtrPositionChart';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FindingLine } from '../Finding';
import { ctrBenchmarkFinding } from '../lib/findings';
import { expectedCtr, isLowCtr, lowCtrPotential } from '../lib/rules';
import type { GscRowsResponse } from '../lib/types';
import { LoadError } from '../SiteStates';
import { useGsc } from '../useSiteData';

const MIN_IMPRESSIONS = 20;
const MAX_POINTS = 400;

/**
 * CTR vs position benchmark (Search > Performance): every query with enough
 * impressions as a dot, the usual CTR curve, and the page-one queries that get
 * fewer clicks than results at that position normally do.
 */
export function CtrBenchmarkCard({ onOpenQuery }: { onOpenQuery: (query: string) => void }) {
    const q = useGsc<GscRowsResponse>('queries');
    const { points, under, page1 } = useMemo(() => {
        const rows = (q.data?.rows ?? []).filter((r) => r.impressions >= MIN_IMPRESSIONS && r.position >= 1 && r.position <= 20)
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, MAX_POINTS);
        const pts: CtrPoint[] = rows.map((r) => ({
            key: r.key, label: r.key, position: r.position, ctr: r.ctr, impressions: r.impressions, clicks: r.clicks,
            expected: expectedCtr(r.position), under: isLowCtr(r, 100),
        }));
        const u = rows.filter((r) => isLowCtr(r, 100)).map((r) => ({ query: r.key, position: r.position, ctr: r.ctr, expected: expectedCtr(r.position), potential: lowCtrPotential(r) }))
            .sort((a, b) => b.potential - a.potential);
        return { points: pts, under: u, page1: rows.filter((r) => r.position <= 10 && r.impressions >= 100).length };
    }, [q.data]);
    const finding = useMemo(() => (q.data ? ctrBenchmarkFinding(under, page1) : null), [q.data, under, page1]);

    return (
        <Card as="section" aria-label="CTR vs position">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h3 className="text-title-sm text-fg">CTR vs position</h3>
                    <p className="text-meta text-fg-muted">Each dot is a query (size = impressions). The dashed curve is the usual CTR at each position.</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-secondary" aria-hidden>
                    <span className="inline-flex items-center gap-1.5"><svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="var(--color-fg-muted)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>Usual CTR</span>
                    <span className="inline-flex items-center gap-1.5"><svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="var(--color-down)" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="2 3" /></svg>70% of usual</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-down opacity-80" />Below that line</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border" style={{ background: `color-mix(in oklab, ${METRICS.clicks.color} 45%, transparent)`, borderColor: METRICS.clicks.color }} />Other queries</span>
                </div>
            </div>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? (
                <div className="flex flex-col gap-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-60 w-full rounded-md" /></div>
            ) : points.length === 0 ? (
                <EmptyState variant="inline" title="Not enough query data yet" description={`Queries need ${MIN_IMPRESSIONS}+ impressions on the first two result pages to be compared.`} />
            ) : (
                <>
                    <FindingLine finding={finding} />
                    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <CtrPositionChart points={points} curve={expectedCtr} color={METRICS.clicks.color} onPointClick={onOpenQuery} height={300} />
                        <div className="min-w-0">
                            <p className="mb-1 text-meta text-fg-muted">Biggest gaps on page one</p>
                            {under.length ? (
                                <ul className="flex flex-col">
                                    {under.slice(0, 6).map((u) => (
                                        <li key={u.query} className="border-t border-border-subtle first:border-t-0">
                                            <button type="button" onClick={() => onOpenQuery(u.query)} className="flex min-h-11 w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-subtle/50">
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-body-sm text-fg" title={u.query}>{u.query}</span>
                                                    <span className="block text-meta text-fg-muted tabular-nums">pos {fmtPosition(u.position)} · CTR {fmtPercent(u.ctr)}, usually {fmtPercent(u.expected)}</span>
                                                </span>
                                                <span className="shrink-0 text-body-sm font-medium text-fg tabular-nums">+{fmtFull(u.potential)}<span className="ml-1 text-meta font-normal text-fg-muted">clicks</span></span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="py-4 text-body-sm text-fg-muted">No page-one query is far below the usual CTR. Nice.</p>}
                        </div>
                    </div>
                    <p className="mt-3 text-meta text-fg-muted">Usual CTR is an industry average by position (the same curve Opportunities uses). A big gap usually means the title or snippet loses the click, or a SERP feature sits above you.</p>
                </>
            )}
        </Card>
    );
}
