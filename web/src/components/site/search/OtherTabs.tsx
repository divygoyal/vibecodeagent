'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileSearch, Info, Search as SearchIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDayYear, fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { useDateRange } from '@/components/shell/DateRangeControl';
import { BreakdownTable } from '../BreakdownTable';
import { per28 } from '../lib/actionText';
import { displayPage, emptyMoversLine, expectedCtr, moverGroups, pageRef, STRIKING_TARGET, type MoverKind } from '../lib/rules';
import type { CannibalizedQuery, GscRow, GscRowsResponse, InspectResponse, OpportunitiesResponse, OpportunityRow, SitemapRow } from '../lib/types';
import { AskButton, LoadError } from '../SiteStates';
import { downloadCsv, fetchJson, useGsc, useSite, useSiteRange } from '../useSiteData';
import { useStringParam } from '../useTabParam';
import { SearchDetailDrawer } from './SearchDetailDrawer';

// ─── Opportunities ──────────────────────────────────────────────────────────

/** Search > Opportunities: striking distance and low CTR, with the page that ranks. */
/**
 * "rows: 3 queries, 1 page": the Low CTR card counts pages and queries, while Performance's "Low CTR" chip
 * counts queries, so the card names both parts and its query count matches the chip (round 4 polish).
 */
function lowCtrSplit(rows: OpportunityRow[]): string {
    const queries = rows.filter((r) => r.target === 'query').length;
    const pages = rows.length - queries;
    const part = (n: number, one: string, many: string) => `${fmtFull(n)} ${n === 1 ? one : many}`;
    if (!pages) return queries === 1 ? 'query' : 'queries';
    if (!queries) return pages === 1 ? 'page' : 'pages';
    return `rows: ${part(queries, 'query', 'queries')}, ${part(pages, 'page', 'pages')}`;
}

export function OpportunitiesTab() {
    const site = useSite();
    const { searchDays } = useSiteRange();
    const q = useGsc<OpportunitiesResponse>('opportunities');
    const [kind, setKind] = useState<'striking' | 'low_ctr'>('striking');
    const [detail, setDetail] = useStringParam('detail', 'push');
    const rows = kind === 'striking' ? q.data?.striking ?? [] : q.data?.lowCtr ?? [];
    const label = (r: OpportunityRow) => (r.target === 'page' ? displayPage(pageRef(r.key), site.siteHost) : r.key);
    // A month = 28 days, as on Actions ("+7,681 clicks a month"), whatever the range.
    const monthly = (r: OpportunityRow) => per28(r.potentialClicks, searchDays);
    const sum = (list: OpportunityRow[]) => list.reduce((a, r) => a + monthly(r), 0);
    const target = fmtPercent(expectedCtr(STRIKING_TARGET), { tile: true });
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Card padding="sm">
                    <p className="text-body-sm font-medium text-fg">Striking distance</p>
                    <p className="mt-0.5 text-meta text-fg-muted">Queries at position 8–20 with more impressions than your median query{q.data ? ` (${fmtFull(Math.round(q.data.medianImpressions))})` : ''}. A result at #{STRIKING_TARGET} usually gets about {target} of clicks, so a small push pays off.</p>
                    {q.data ? <p className="mt-2 text-stat-sm text-fg">{fmtFull(q.data.striking.length)} <span className="text-body-sm font-normal text-fg-muted">queries · +{fmtFull(sum(q.data.striking))} clicks a month at #{STRIKING_TARGET}</span></p> : <Skeleton className="mt-2 h-6 w-40" />}
                </Card>
                <Card padding="sm">
                    <p className="text-body-sm font-medium text-fg">Low CTR</p>
                    <p className="mt-0.5 text-meta text-fg-muted">Pages and queries on page one with a CTR under 70% of what that position usually gets. Usually a title or snippet problem.</p>
                    {q.data ? <p className="mt-2 text-stat-sm text-fg">{fmtFull(q.data.lowCtr.length)} <span className="text-body-sm font-normal text-fg-muted">{lowCtrSplit(q.data.lowCtr)} · +{fmtFull(sum(q.data.lowCtr))} clicks a month at the usual CTR</span></p> : <Skeleton className="mt-2 h-6 w-40" />}
                </Card>
            </div>
            <BreakdownTable<OpportunityRow>
                caption={kind === 'striking' ? 'Striking distance queries' : 'Low CTR pages and queries'}
                rows={rows}
                rowKey={(r) => `${r.target}:${r.key}`}
                loading={q.state === 'loading'}
                label={{
                    header: kind === 'striking' ? 'Query' : 'Page or query',
                    text: label,
                    cell: (r) => (
                        <span className="flex min-w-0 flex-col">
                            <span className="truncate" title={r.key}>{r.target === 'page' ? <Badge className="mr-1.5">Page</Badge> : null}{label(r)}</span>
                            {r.target === 'query' && r.page ? <span className="truncate text-meta text-fg-muted" title={r.page}>{displayPage(pageRef(r.page), site.siteHost)}</span> : null}
                        </span>
                    ),
                }}
                heat={{ metric: 'impressions', value: (r) => r.impressions }}
                twoLine
                defaultSort="gain"
                exportName={kind === 'striking' ? 'striking-distance' : 'low-ctr'}
                searchPlaceholder="Search"
                onRowClick={(r) => void setDetail(`${r.target === 'page' ? 'p' : 'q'}:${r.key}`)}
                toolbarExtra={<SegmentedControl ariaLabel="Opportunity type" size="sm" variant="neutral" value={kind} onChange={setKind} options={[{ value: 'striking', label: 'Striking distance' }, { value: 'low_ctr', label: 'Low CTR' }]} />}
                empty={<EmptyState variant="inline" icon={CheckCircle2} title={kind === 'striking' ? 'No striking-distance queries' : 'No low-CTR pages'} description="Nothing stands out for this period." />}
                columns={[
                    { key: 'pos', header: 'Position', format: 'position', better: 'down', value: (r) => r.position },
                    { key: 'impr', header: 'Impr.', value: (r) => r.impressions, hideOnMobile: true },
                    { key: 'ctr', header: 'CTR', format: 'percent', value: (r) => r.ctr, hideOnMobile: true },
                    // Striking: the target CTR is the same on every row (the #5 rate), so it is in the card text, not a column.
                    ...(kind === 'low_ctr' ? [{ key: 'exp', header: 'Usual CTR', format: 'percent' as const, value: (r: OpportunityRow) => r.expectedCtr, hideOnMobile: true }] : []),
                    { key: 'gain', header: kind === 'striking' ? `Extra clicks/mo at #${STRIKING_TARGET}` : 'Extra clicks/mo', value: monthly },
                ]}
            />
            <SearchDetailDrawer kind={detail?.startsWith('p:') ? 'page' : 'query'} value={detail ? detail.slice(2) : null} onClose={() => void setDetail(null)} />
        </div>
    );
}

// ─── Cannibalization ──────────────────────────────────────────────────────

const SEVERITY = { high: { label: 'High', variant: 'warn' as const }, medium: { label: 'Medium', variant: 'info' as const }, low: { label: 'Low', variant: 'neutral' as const } };

/** Search > Cannibalization: queries where 2+ of your pages split impressions. */
export function CannibalizationTab() {
    const site = useSite();
    const q = useGsc<{ cannibalized: CannibalizedQuery[] }>('cannibalization');
    const [level, setLevel] = useState<'all' | 'high'>('all');
    const list = (q.data?.cannibalized ?? []).filter((c) => level === 'all' || c.severity === 'high');
    const [limit, setLimit] = useState(20);
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-2xl text-body-sm text-fg-muted">Queries where several of your pages show up and none clearly wins. Google splits impressions between them, so each ranks lower than one strong page would.</p>
                <div className="flex items-center gap-2">
                    <SegmentedControl ariaLabel="Severity" size="sm" variant="neutral" value={level} onChange={setLevel} options={[{ value: 'all', label: 'All' }, { value: 'high', label: 'High only' }]} />
                    <Button size="sm" variant="ghost" disabled={!list.length} onClick={() => downloadCsv('cannibalization.csv', ['Query', 'Severity', 'Page', 'Impressions', 'Clicks', 'Position', 'Share'],
                        list.flatMap((c) => c.pages.map((p) => [c.query, c.severity, p.page, p.impressions, p.clicks, p.position.toFixed(1), p.share.toFixed(3)])))}>Export</Button>
                </div>
            </div>
            {q.state === 'loading' ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div> : list.length === 0 ? (
                <Card padding="none"><EmptyState variant="card" icon={CheckCircle2} title="No cannibalization found" description="Each query has one clear page. Nice." /></Card>
            ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {list.slice(0, limit).map((c) => (
                        <Card key={c.query} padding="none" as="article" className="overflow-hidden">
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="text-title-sm text-fg [overflow-wrap:anywhere]">&ldquo;{c.query}&rdquo;</h3>
                                        <p className="mt-0.5 text-meta text-fg-muted">{c.pages.length} pages · {fmtFull(c.totalImpressions)} impressions · {fmtFull(c.totalClicks)} clicks · best position {fmtPosition(c.bestPosition)}</p>
                                    </div>
                                    <Badge variant={SEVERITY[c.severity].variant}>{SEVERITY[c.severity].label}</Badge>
                                </div>
                                <ul className="mt-3 flex flex-col gap-1.5">
                                    {c.pages.map((p) => (
                                        <li key={p.page} className="relative overflow-hidden rounded-md bg-surface-sunken">
                                            <span aria-hidden className="absolute inset-y-0 left-0 heatbar-impressions" style={{ width: `${Math.max(1, p.share * 100)}%` }} />
                                            <span className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-body-sm">
                                                <span className="min-w-0 truncate text-fg" title={p.page}>{displayPage(pageRef(p.page), site.siteHost)}</span>
                                                <span className="shrink-0 text-fg-secondary tabular-nums">{fmtPercent(p.share, { tile: true })} · pos {fmtPosition(p.position)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex items-center gap-2 border-t border-border-subtle bg-surface-sunken/60 px-4 py-2">
                                <AskButton size="sm" variant="ghost" from="seo:cannibalization" label="Ask AI which page to keep"
                                    prompt={`On ${site.siteHost ?? site.label}, ${c.pages.length} pages compete for "${c.query}": ${c.pages.slice(0, 4).map((p) => `${displayPage(pageRef(p.page), site.siteHost)} (${fmtPercent(p.share, { tile: true })} of impressions, position ${fmtPosition(p.position)})`).join(', ')}. Which page should I keep and what should I do with the others?`}
                                    site={{ ga4: site.ga4, gsc: site.gsc }} />
                            </div>
                        </Card>
                    ))}
                </div>
            )}
            {list.length > limit ? <Button variant="secondary" className="self-center" onClick={() => setLimit((n) => n + 20)}>Show more ({fmtFull(list.length - limit)} left)</Button> : null}
        </div>
    );
}

// ─── Winners & losers ─────────────────────────────────────────────────────

const MOVERS: { kind: MoverKind; title: string; sub: string }[] = [
    { kind: 'winner', title: 'Winners', sub: '+5 clicks and +20% or more' },
    { kind: 'loser', title: 'Losers', sub: '−5 clicks and −20% or more' },
    { kind: 'new', title: 'New', sub: 'No clicks before, 5+ now' },
    { kind: 'lost', title: 'Lost', sub: '5+ clicks before, none now' },
];

/** Search > Winners & losers: biggest movers vs the comparison period. Empty groups fold into one quiet line. */
export function MoversTab() {
    const site = useSite();
    const dr = useDateRange();
    const [dim, setDim] = useState<'queries' | 'pages'>('queries');
    const q = useGsc<GscRowsResponse>(dr.value.compare === 'none' ? null : dim);
    const [detail, setDetail] = useStringParam('detail', 'push');
    const groups = useMemo(() => moverGroups([...(q.data?.rows ?? []), ...(q.data?.lost ?? [])]), [q.data]);
    if (dr.value.compare === 'none') {
        return (
            <Card padding="none">
                <EmptyState variant="card" title="Turn on a comparison" description="Winners and losers compare this period with an earlier one."
                    actions={<Button variant="primary" onClick={() => dr.setCompare('prev')}>Compare with previous period</Button>} />
            </Card>
        );
    }
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    const label = (r: GscRow) => (dim === 'pages' ? displayPage(pageRef(r.key), site.siteHost) : r.key);
    const loading = q.state === 'loading';
    const shown = loading ? MOVERS.slice(0, 2) : MOVERS.filter((m) => groups[m.kind].length > 0);
    const empty = loading ? [] : MOVERS.filter((m) => groups[m.kind].length === 0);
    const noun = dim === 'pages' ? 'pages' : 'queries';
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm text-fg-muted">Clicks now versus {dr.compareLabel.replace(/^vs /, '')}.</p>
                <SegmentedControl ariaLabel="Movers by" size="sm" variant="neutral" value={dim} onChange={setDim} options={[{ value: 'queries', label: 'Queries' }, { value: 'pages', label: 'Pages' }]} />
            </div>
            {shown.length === 0 ? (
                <Card padding="none">
                    <EmptyState variant="card" icon={CheckCircle2} title={`No big movers among your ${noun}`} description={`No ${noun} gained or lost 5+ clicks and 20%, and none appeared or disappeared, in this period.`} />
                </Card>
            ) : (
                <div className={cn('grid grid-cols-1 gap-4', shown.length > 1 && 'lg:grid-cols-2')}>
                    {shown.map((m, i) => (
                        <Card key={m.kind} padding="none" className={cn('overflow-hidden', shown.length === 3 && i === 2 && 'lg:col-span-2')}>
                            <div className="p-4 pb-0"><CardHeader title={`${m.title}${q.data ? ` · ${fmtFull(groups[m.kind].length)}` : ''}`} description={m.sub} /></div>
                            <Table<GscRow>
                                card={false}
                                density="compact"
                                caption={`${m.title} ${dim}`}
                                loading={loading}
                                rows={groups[m.kind]}
                                rowKey={(r) => r.key}
                                pagination={{ pageSize: 10 }}
                                onRowClick={(r) => void setDetail(`${dim === 'pages' ? 'p' : 'q'}:${r.key}`)}
                                empty={<EmptyState variant="inline" title="None in this period" />}
                                columns={[
                                    { key: 'label', header: dim === 'pages' ? 'Page' : 'Query', width: '50%', cell: (r) => <span title={r.key}>{label(r)}</span> },
                                    { key: 'clicks', header: 'Clicks', align: 'right', cell: (r) => <span className="whitespace-nowrap">{fmtFull(r.prev?.clicks ?? 0)} → {fmtFull(r.clicks)}</span> },
                                    { key: 'delta', header: 'Δ', mobileLabel: 'Change', align: 'right', cell: (r) => <MetricDelta metric="clicks" current={r.clicks} previous={r.prev?.clicks ?? 0} /> },
                                    {
                                        key: 'pos', header: 'Position', align: 'right', className: 'max-md:hidden', headerClassName: 'max-md:hidden',
                                        cell: (r) => (r.prev && r.prev.impressions && r.impressions
                                            ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{fmtPosition(r.position)}<MetricDelta metric="position" current={r.position} previous={r.prev.position} /></span>
                                            : r.impressions ? fmtPosition(r.position) : '–'),
                                    },
                                ]}
                            />
                        </Card>
                    ))}
                </div>
            )}
            {shown.length > 0 && empty.length > 0 ? (
                <p className="flex items-start gap-2 text-body-sm text-fg-muted">
                    <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
                    <span title={empty.map((m) => `${m.title}: ${m.sub}`).join('\n')}>{emptyMoversLine(empty.map((m) => m.kind), noun)}</span>
                </p>
            ) : null}
            <SearchDetailDrawer kind={detail?.startsWith('p:') ? 'page' : 'query'} value={detail ? detail.slice(2) : null} onClose={() => void setDetail(null)} />
        </div>
    );
}

// ─── Indexing ─────────────────────────────────────────────────────────────

const VERDICT: Record<string, { label: string; tone: string }> = {
    PASS: { label: 'Indexed', tone: 'text-up' },
    PARTIAL: { label: 'Indexed with issues', tone: 'text-warn' },
    FAIL: { label: 'Not indexed', tone: 'text-down' },
    NEUTRAL: { label: 'Excluded', tone: 'text-fg-muted' },
};

/** Search > Indexing: sitemaps and URL inspection (on demand: the API allows 2,000 a day). */
export function IndexingTab() {
    const site = useSite();
    const sitemaps = useGsc<{ sitemaps: SitemapRow[] }>('sitemaps', { noRange: true });
    const pages = useGsc<GscRowsResponse>('pages');
    const [url, setUrl] = useState(site.homeUrl ?? '');
    const [result, setResult] = useState<InspectResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inspect = async (target: string) => {
        if (!site.gsc) return;
        setUrl(target);
        setBusy(true);
        setErr(null);
        try {
            const r = await fetchJson<InspectResponse>(`/api/site/gsc?${new URLSearchParams({ site: site.gsc, report: 'inspect', url: target })}`);
            setResult(r);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Inspection failed');
            setResult(null);
        } finally {
            setBusy(false);
        }
    };
    const v = result ? VERDICT[result.verdict] ?? { label: result.verdict, tone: 'text-fg-muted' } : null;
    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader title="Inspect a URL" description="What Google saw the last time it crawled the page. Runs only when you ask (Google allows 2,000 a day)." />
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void inspect(url.trim()); }}>
                    <label className="sr-only" htmlFor="inspect-url">URL</label>
                    <input id="inspect-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" inputMode="url"
                        className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-focus" />
                    <Button type="submit" variant="primary" icon={FileSearch} loading={busy} disabled={!url.trim()}>Inspect</Button>
                </form>
                {err ? <Banner variant="danger" className="mt-3">{err}</Banner> : null}
                {result && v ? (
                    <div className="mt-4 rounded-card border border-border-subtle p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className={cn('text-title-sm', v.tone)}>{v.label}</p>
                            {result.link ? <a href={result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body-sm text-fg-secondary hover:text-fg">Open in Search Console <ExternalLink aria-hidden size={14} /></a> : null}
                        </div>
                        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                            {[
                                ['Coverage', result.coverageState],
                                ['Last crawl', result.lastCrawlTime ? fmtDayYear(result.lastCrawlTime.slice(0, 10)) : null],
                                ['Crawled as', result.crawledAs?.replace(/_/g, ' ').toLowerCase()],
                                ['Indexing allowed', result.indexingState?.replace(/_/g, ' ').toLowerCase()],
                                ['robots.txt', result.robotsTxtState?.replace(/_/g, ' ').toLowerCase()],
                                ['Page fetch', result.pageFetchState?.replace(/_/g, ' ').toLowerCase()],
                                ['Google canonical', result.googleCanonical],
                                ['Your canonical', result.userCanonical],
                                ['Rich results', result.richResultTypes.length ? result.richResultTypes.join(', ') : result.richResultsVerdict ? result.richResultsVerdict.toLowerCase() : null],
                            ].filter(([, val]) => val).map(([k, val]) => (
                                <div key={k as string} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-dashed border-border-subtle pb-1.5">
                                    <dt className="shrink-0 text-meta text-fg-muted">{k}</dt>
                                    <dd className="min-w-0 truncate text-right text-body-sm text-fg" title={String(val)}>{val}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                ) : null}
                {pages.data?.rows.length ? (
                    <div className="mt-4">
                        <p className="mb-2 text-meta text-fg-muted">Top pages by clicks: inspect one</p>
                        <div className="flex flex-wrap gap-1.5">
                            {pages.data.rows.slice(0, 8).map((r) => (
                                <button key={r.key} type="button" onClick={() => void inspect(r.key)}
                                    className="inline-flex h-7 max-w-full items-center gap-1 truncate rounded-full border border-border-subtle bg-surface px-3 text-body-sm text-fg-secondary hover:bg-subtle">
                                    <SearchIcon aria-hidden size={12} className="shrink-0" />
                                    <span className="truncate">{displayPage(pageRef(r.key), site.siteHost)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
            </Card>
            {sitemaps.state === 'error' ? <LoadError error={sitemaps.error} onRetry={sitemaps.mutate} /> : (
                <Table<SitemapRow>
                    caption="Sitemaps"
                    rows={sitemaps.data?.sitemaps ?? []}
                    rowKey={(r) => r.path}
                    loading={sitemaps.state === 'loading'}
                    toolbar={<div><p className="text-title-sm text-fg">Sitemaps</p><p className="text-meta text-fg-muted">Submitted in Search Console</p></div>}
                    empty={<EmptyState variant="inline" title="No sitemaps submitted" description="Submit your sitemap in Search Console so Google finds new pages faster." />}
                    columns={[
                        { key: 'path', header: 'Sitemap', width: '44%', cell: (r) => <a href={r.path} target="_blank" rel="noreferrer" className="tap-inline hover:underline" title={r.path}>{r.path.replace(/^https?:\/\//, '')}</a> },
                        { key: 'submitted', header: 'URLs', align: 'right', cell: (r) => fmtFull(r.submitted) },
                        { key: 'read', header: 'Last read', align: 'right', className: 'max-md:hidden', headerClassName: 'max-md:hidden', cell: (r) => (r.lastDownloaded ? fmtDayYear(r.lastDownloaded.slice(0, 10)) : '–') },
                        { key: 'status', header: 'Status', align: 'right', cell: (r) => (r.errors ? <span className="text-down">{fmtFull(r.errors)} errors</span> : r.warnings ? <span className="text-warn">{fmtFull(r.warnings)} warnings</span> : r.isPending ? 'Pending' : <span className="text-up">OK</span>) },
                    ]}
                />
            )}
            <p className="text-meta text-fg-muted">
                For the full coverage report, open Pages in Search Console. Google doesn&apos;t share it through the API.
            </p>
        </div>
    );
}
