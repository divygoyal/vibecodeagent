'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FileSearch, Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDayYear, fmtFull } from '@/lib/format';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table } from '@/components/ui/Table';
import { displayPage, pageRef } from '../lib/rules';
import type { IndexStatusPage, IndexStatusResponse, InspectResponse, SitemapRow } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { PagePath } from '../PagePath';
import { LoadError } from '../SiteStates';
import { fetchJson, useGsc, useSite } from '../useSiteData';

type Tone = 'up' | 'warn' | 'down' | 'muted';
const TONE: Record<Tone, string> = { up: 'text-up', warn: 'text-warn', down: 'text-down', muted: 'text-fg-muted' };
const DOT: Record<Tone, string> = { up: 'bg-up', warn: 'bg-warn', down: 'bg-down', muted: 'bg-fg-faint' };

/** Index status in words: URL Inspection verdicts are PASS / PARTIAL / FAIL / NEUTRAL. */
function statusOf(p: Pick<IndexStatusPage, 'status' | 'verdict'>): { label: string; tone: Tone; rank: number } {
    if (p.status === 'skipped') return { label: 'Not checked yet', tone: 'muted', rank: 5 };
    if (p.status === 'error') return { label: "Couldn't check", tone: 'muted', rank: 4 };
    switch (p.verdict) {
        case 'PASS': return { label: 'Indexed', tone: 'up', rank: 3 };
        case 'PARTIAL': return { label: 'Indexed, with issues', tone: 'warn', rank: 1 };
        case 'FAIL': return { label: 'Not indexed: error', tone: 'down', rank: 0 };
        case 'NEUTRAL': return { label: 'Not indexed', tone: 'warn', rank: 0 };
        default: return { label: 'Unknown', tone: 'muted', rank: 4 };
    }
}

const norm = (u: string | null | undefined) => (u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

/** Google kept a different URL as the canonical than the one you declared (or than the page itself). */
function otherCanonical(p: IndexStatusPage | InspectResponse): string | null {
    if (!p.googleCanonical) return null;
    const mine = p.userCanonical ?? p.url;
    return norm(p.googleCanonical) === norm(mine) ? null : p.googleCanonical;
}

function daysAgo(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null;
}

function agoText(days: number): string {
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

const lower = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').toLowerCase() : null);

/** Every field URL Inspection returns, as label / value rows. */
export function InspectionDetails({ result }: { result: InspectResponse }) {
    const s = statusOf({ status: 'ok', verdict: result.verdict });
    const other = otherCanonical(result);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn('flex items-center gap-2 text-title-sm', TONE[s.tone])}><span aria-hidden className={cn('size-2 rounded-full', DOT[s.tone])} />{s.label}</p>
                {result.link ? <a href={result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body-sm text-fg-secondary hover:text-fg">Open in Search Console <ExternalLink aria-hidden size={14} /></a> : null}
            </div>
            {other ? <Banner variant="warn">Google treats another URL as the main version of this page: {other}. Search shows that one instead.</Banner> : null}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {[
                    ['Coverage', result.coverageState],
                    ['Last crawl', result.lastCrawlTime ? fmtDayYear(result.lastCrawlTime.slice(0, 10)) : null],
                    ['Crawled as', lower(result.crawledAs)],
                    ['Indexing allowed', lower(result.indexingState)],
                    ['robots.txt', lower(result.robotsTxtState)],
                    ['Page fetch', lower(result.pageFetchState)],
                    ['Google canonical', result.googleCanonical],
                    ['Your canonical', result.userCanonical],
                    ['Rich results', result.richResultTypes.length ? result.richResultTypes.join(', ') : lower(result.richResultsVerdict)],
                ].filter(([, val]) => val).map(([k, val]) => (
                    <div key={k as string} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-dashed border-border-subtle pb-1.5">
                        <dt className="shrink-0 text-meta text-fg-muted">{k}</dt>
                        <dd className="min-w-0 truncate text-right text-body-sm text-fg" title={String(val)}>{val}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function toInspect(p: IndexStatusPage): InspectResponse {
    return {
        url: p.url, verdict: p.verdict ?? 'VERDICT_UNSPECIFIED', coverageState: p.coverageState ?? null, indexingState: p.indexingState ?? null,
        robotsTxtState: p.robotsTxtState ?? null, pageFetchState: p.pageFetchState ?? null, lastCrawlTime: p.lastCrawlTime ?? null,
        googleCanonical: p.googleCanonical ?? null, userCanonical: p.userCanonical ?? null, crawledAs: p.crawledAs ?? null,
        mobileVerdict: p.mobileVerdict ?? null, richResultsVerdict: p.richResultsVerdict ?? null, richResultTypes: p.richResultTypes ?? [], link: p.link ?? null,
    };
}

/** Index status of the top pages by clicks: one URL Inspection per page per day (round 5, audit item 29). */
function TopPagesStatus() {
    const site = useSite();
    const q = useGsc<IndexStatusResponse>('indexStatus', { swr: { dedupingInterval: 10 * 60_000 } });
    const [open, setOpen] = useState<IndexStatusPage | null>(null);
    const pages = useMemo(() => [...(q.data?.pages ?? [])].sort((a, b) => {
        const ra = statusOf(a).rank - (otherCanonical(a) ? 0.5 : 0);
        const rb = statusOf(b).rank - (otherCanonical(b) ? 0.5 : 0);
        return ra - rb || b.clicks - a.clicks;
    }), [q.data]);
    const ok = pages.filter((p) => p.status === 'ok');
    const indexed = ok.filter((p) => p.verdict === 'PASS' || p.verdict === 'PARTIAL').length;
    const notIndexed = ok.filter((p) => p.verdict === 'FAIL' || p.verdict === 'NEUTRAL').length;
    const canon = ok.filter((p) => otherCanonical(p)).length;
    const crawlAges = ok.map((p) => daysAgo(p.lastCrawlTime)).filter((d): d is number => d !== null);
    const oldest = crawlAges.length ? Math.max(...crawlAges) : null;
    const checkedAt = ok.map((p) => p.checkedAt).filter(Boolean).sort()[0] ?? null;
    const skipped = pages.filter((p) => p.status !== 'ok').length;
    const loading = q.state === 'loading';
    const show = (u: string) => displayPage(pageRef(u), site.siteHost);

    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    return (
        <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="clicks" label="Indexed" value={q.data ? indexed : null} loading={loading}
                    footer={q.data ? <span className="text-meta text-fg-muted">of {fmtFull(ok.length)} top pages checked</span> : undefined} />
                <MetricTile metric="clicks" label="Not indexed" value={q.data ? notIndexed : null} loading={loading}
                    footer={q.data ? <span className={cn('text-meta', notIndexed ? 'text-warn' : 'text-fg-muted')}>{notIndexed ? 'Not in Google results now' : 'All checked pages are in'}</span> : undefined} />
                <MetricTile metric="clicks" label="Other canonical" value={q.data ? canon : null} loading={loading}
                    footer={q.data ? <span className="text-meta text-fg-muted">Google picked another URL</span> : undefined} />
                <MetricTile metric="clicks" label="Oldest crawl" format="count" value={q.data ? oldest : null} loading={loading}
                    footer={q.data && oldest !== null ? <span className="text-meta text-fg-muted">{oldest === 1 ? 'day ago' : 'days ago'}</span> : undefined} />
            </div>
            <Table<IndexStatusPage>
                caption="Index status of your top pages"
                rows={pages}
                rowKey={(p) => p.url}
                loading={loading}
                density="comfortable"
                onRowClick={(p) => (p.status === 'ok' ? setOpen(p) : undefined)}
                toolbar={(
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-title-sm text-fg">Your top pages in Google&apos;s index</p>
                            <p className="text-meta text-fg-muted">
                                {q.data ? `Top ${fmtFull(pages.length)} of ${fmtFull(q.data.pagesWithClicks)} pages with clicks, problems first` : 'Asking Google about your top pages by clicks'}
                                {checkedAt ? ` · checked ${new Date(checkedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}, once a day` : ''}
                            </p>
                        </div>
                    </div>
                )}
                empty={<EmptyState variant="inline" title="No pages with search clicks in this period" description="Pick a longer range, or inspect a URL below." />}
                columns={[
                    {
                        key: 'page', header: 'Page', width: '38%', mobile: 'title',
                        cell: (p) => <PagePath path={show(p.url)} className="w-full font-medium text-fg" />,
                    },
                    {
                        key: 'status', header: 'Status', mobile: 'primary',
                        sortValue: (p) => statusOf(p).rank,
                        cell: (p) => {
                            const s = statusOf(p);
                            return (
                                <span className="flex min-w-0 flex-col">
                                    <span className={cn('flex items-center gap-1.5 whitespace-nowrap text-body-sm', TONE[s.tone])}><span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[s.tone])} />{s.label}</span>
                                    {p.status === 'ok' && p.verdict !== 'PASS' && p.coverageState ? <span className="truncate text-meta text-fg-muted" title={p.coverageState}>{p.coverageState}</span> : null}
                                </span>
                            );
                        },
                    },
                    {
                        key: 'canonical', header: 'Canonical', className: 'max-md:hidden', headerClassName: 'max-md:hidden',
                        cell: (p) => {
                            if (p.status !== 'ok') return <span className="text-fg-faint">–</span>;
                            const other = otherCanonical(p);
                            return other
                                ? <span className="block truncate text-body-sm text-warn" title={`Google chose ${other}`}>Google chose {show(other)}</span>
                                : <span className="text-body-sm text-fg-muted">{p.googleCanonical ? 'This page' : '–'}</span>;
                        },
                    },
                    {
                        key: 'crawl', header: 'Last crawl', align: 'right', mobileLabel: 'Crawled',
                        sortValue: (p) => daysAgo(p.lastCrawlTime) ?? -1,
                        cell: (p) => {
                            const d = daysAgo(p.lastCrawlTime);
                            return d === null ? <span className="text-fg-faint">–</span> : <span className={cn('whitespace-nowrap tabular-nums', d > 30 ? 'text-warn' : 'text-fg')} title={fmtDayYear(p.lastCrawlTime!.slice(0, 10))}>{agoText(d)}</span>;
                        },
                    },
                    {
                        key: 'clicks', header: 'Clicks', align: 'right',
                        sortValue: (p) => p.clicks,
                        cell: (p) => <span className="tabular-nums">{fmtFull(p.clicks)}</span>,
                    },
                ]}
            />
            {skipped > 0 && q.data ? (
                <p className="-mt-2 text-meta text-fg-muted">{fmtFull(skipped)} {skipped === 1 ? 'page was' : 'pages were'} not checked: Google refused or limited the inspection. They are tried again on the next load.</p>
            ) : null}
            <Drawer open={Boolean(open)} onOpenChange={(o) => { if (!o) setOpen(null); }} title={open ? show(open.url) : ''} subtitle={open ? `${fmtFull(open.clicks)} clicks in this period` : undefined}>
                {open ? <div className="p-5"><InspectionDetails result={toInspect(open)} /></div> : null}
            </Drawer>
        </>
    );
}

/** Search > Indexing: top pages' index status (daily), any URL on demand, sitemaps. */
export function IndexingTab() {
    const site = useSite();
    const sitemaps = useGsc<{ sitemaps: SitemapRow[] }>('sitemaps', { noRange: true });
    const [url, setUrl] = useState(site.homeUrl ?? '');
    const [result, setResult] = useState<InspectResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inspect = async (target: string) => {
        if (!site.gsc) return;
        setBusy(true);
        setErr(null);
        try {
            setResult(await fetchJson<InspectResponse>(`/api/site/gsc?${new URLSearchParams({ site: site.gsc, report: 'inspect', url: target })}`));
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Inspection failed');
            setResult(null);
        } finally {
            setBusy(false);
        }
    };
    const coverageHref = site.gsc ? `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(site.gsc)}` : null;
    return (
        <div className="flex flex-col gap-4">
            <TopPagesStatus />
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader title="Inspect any URL" description="What Google saw the last time it crawled the page. Runs when you ask." />
                    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void inspect(url.trim()); }}>
                        <label className="sr-only" htmlFor="inspect-url">URL</label>
                        <input id="inspect-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" inputMode="url"
                            className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-focus" />
                        <Button type="submit" variant="primary" icon={FileSearch} loading={busy} disabled={!url.trim()}>Inspect</Button>
                    </form>
                    {err ? <Banner variant="danger" className="mt-3">{err}</Banner> : null}
                    {result ? <div className="mt-4 rounded-card border border-border-subtle p-4"><InspectionDetails result={result} /></div> : null}
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
                            { key: 'path', header: 'Sitemap', width: '44%', cell: (r) => <a href={r.path} target="_blank" rel="noreferrer" className="tap-inline block truncate hover:underline" title={r.path}>{r.path.replace(/^https?:\/\//, '')}</a> },
                            { key: 'submitted', header: 'URLs', align: 'right', cell: (r) => fmtFull(r.submitted) },
                            { key: 'read', header: 'Last read', align: 'right', className: 'max-md:hidden', headerClassName: 'max-md:hidden', cell: (r) => (r.lastDownloaded ? fmtDayYear(r.lastDownloaded.slice(0, 10)) : '–') },
                            { key: 'status', header: 'Status', align: 'right', cell: (r) => (r.errors ? <span className="text-down">{fmtFull(r.errors)} errors</span> : r.warnings ? <span className="text-warn">{fmtFull(r.warnings)} warnings</span> : r.isPending ? 'Pending' : <span className="text-up">OK</span>) },
                        ]}
                    />
                )}
            </div>
            <p className="flex items-start gap-1.5 text-meta text-fg-muted">
                <Info aria-hidden size={14} className="mt-px shrink-0" />
                <span>
                    TrafficClaw asks Google&apos;s URL Inspection about your top 20 pages by clicks at most once a day (Google allows 2,000 a day per property).
                    The coverage report for every page is not in Google&apos;s API: {coverageHref ? <a href={coverageHref} target="_blank" rel="noreferrer" className="tap-inline underline hover:text-fg">open Pages in Search Console</a> : 'open Pages in Search Console'}.
                </span>
            </p>
        </div>
    );
}
