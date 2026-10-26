'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Gauge, Info, Play, XCircle } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtFull } from '@/lib/format';
import type { AuditIssue, AuditReport } from '@/lib/siteAudit';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { siteHref } from '@/components/shell/nav';
import { SiteHeader } from '../SiteHeader';
import { AskButton } from '../SiteStates';
import { fetchJson, FetchError, useSite } from '../useSiteData';
import { useStringParam } from '../useTabParam';

const SEV: Record<AuditIssue['severity'], { label: string; icon: typeof Info; tone: string; badge: 'down' | 'warn' | 'info' | 'up' }> = {
    critical: { label: 'Critical', icon: XCircle, tone: 'text-down', badge: 'down' },
    warning: { label: 'Warning', icon: AlertTriangle, tone: 'text-warn', badge: 'warn' },
    info: { label: 'Note', icon: Info, tone: 'text-info', badge: 'info' },
    passed: { label: 'Passed', icon: CheckCircle2, tone: 'text-up', badge: 'up' },
};

function normalize(u: string): string {
    const t = u.trim();
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Audit (restyled /dashboard/audit): on-page SEO checks for one URL, plus field speed data. */
export function AuditPage() {
    const site = useSite();
    const [urlParam, setUrlParam] = useStringParam('url');
    const target = urlParam ? normalize(urlParam) : site.homeUrl;
    const [input, setInput] = useState(urlParam ?? site.homeUrl ?? '');
    const [running, setRunning] = useState(false);
    const key = target ? `/api/site/audit?url=${encodeURIComponent(target)}` : null;
    const q = useSWR<AuditReport, FetchError>(key, fetchJson, { revalidateOnFocus: false, shouldRetryOnError: false });
    const [filter, setFilter] = useState<'issues' | 'all'>('issues');

    const run = async () => {
        const u = input.trim();
        if (!u) return;
        const next = normalize(u);
        setRunning(true);
        try {
            const report = await fetchJson<AuditReport>('/api/site/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: next }) });
            if (next !== target) void setUrlParam(next === site.homeUrl ? null : next);
            await q.mutate(report, { revalidate: false });
        } catch (e) {
            await q.mutate(undefined, { revalidate: false });
            if (next !== target) void setUrlParam(next);
            else await q.mutate();
            if (e instanceof Error) console.warn('audit failed', e.message);
        } finally {
            setRunning(false);
        }
    };

    const r = q.data;
    const groups = useMemo(() => {
        const issues = (r?.issues ?? []).filter((i) => filter === 'all' || i.severity !== 'passed');
        const order = { critical: 0, warning: 1, info: 2, passed: 3 };
        const map = new Map<string, AuditIssue[]>();
        for (const i of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
            map.set(i.category, [...(map.get(i.category) ?? []), i]);
        }
        return [...map.entries()];
    }, [r, filter]);

    return (
        <div className="flex flex-col">
            <SiteHeader section="Audit" noRange backHref={siteHref(site.host, 'actions')} source="On-page SEO checks, fetched live from your site" />
            <Card className="mb-4">
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
                    <label htmlFor="audit-url" className="sr-only">Page to audit</label>
                    <input id="audit-url" value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://your-site.com" inputMode="url"
                        className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-focus" />
                    <Button type="submit" variant="primary" icon={Play} loading={running} disabled={!input.trim()}>{r ? 'Run a fresh audit' : 'Audit page'}</Button>
                </form>
                <p className="mt-2 text-meta text-fg-muted">Checks titles, meta tags, headings, links, images, structured data and response time. Results are kept for 6 hours.</p>
            </Card>

            {!target ? (
                <Card padding="none"><EmptyState variant="card" icon={Gauge} title="Enter a page to audit" description="This site has no Search Console address, so type the URL of a page you want checked." /></Card>
            ) : q.error && !r ? (
                <Banner variant="danger" title="The audit couldn't run" actions={<Button size="sm" onClick={() => void run()}>Try again</Button>}>{q.error.message}</Banner>
            ) : !r ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Skeleton className="h-40 rounded-card" /><Skeleton className="h-40 rounded-card lg:col-span-2" /><Skeleton className="h-64 rounded-card lg:col-span-3" /></div>
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <Card className="flex flex-col items-start gap-2">
                            <p className="text-body-sm text-fg-secondary">Audit score</p>
                            <p className="text-stat-xl text-fg tabular-nums">{r.score}<span className="text-title text-fg-muted">/100</span></p>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" role="img" aria-label={`Score ${r.score} out of 100`}>
                                <span className={cn('block h-full rounded-full', r.score >= 80 ? 'bg-up' : r.score >= 50 ? 'bg-warn' : 'bg-down')} style={{ width: `${r.score}%` }} />
                            </div>
                            <p className="text-meta text-fg-muted [overflow-wrap:anywhere]">{r.url} · checked {new Date(r.fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        </Card>
                        <Card className="lg:col-span-2">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {(['critical', 'warning', 'info', 'passed'] as const).map((s) => {
                                    const Icon = SEV[s].icon;
                                    return (
                                        <div key={s} className="rounded-card border border-border-subtle p-3">
                                            <p className="flex items-center gap-1.5 text-meta text-fg-muted"><Icon aria-hidden size={14} className={SEV[s].tone} />{SEV[s].label}</p>
                                            <p className="mt-1 text-stat text-fg">{fmtFull(s === 'passed' ? Math.max(r.summary.passed, r.issues.filter((i) => i.severity === 'passed').length) : r.issues.filter((i) => i.severity === s).length)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                {[
                                    ['Status', String(r.statusCode)],
                                    ['Response time', `${fmtFull(r.responseTime)} ms`],
                                    ['Page size', `${fmtFull(Math.round(r.meta.pageSize / 1024))} KB`],
                                    ['Words', fmtFull(r.meta.wordCount)],
                                    ['Headings', `${r.meta.headings.h1} H1 · ${r.meta.headings.h2} H2 · ${r.meta.headings.h3} H3`],
                                    ['Images without alt', `${fmtFull(r.meta.images.withoutAlt)} of ${fmtFull(r.meta.images.total)}`],
                                    ['Links', `${fmtFull(r.meta.links.internal)} internal · ${fmtFull(r.meta.links.external)} external`],
                                    ['Scripts / stylesheets', `${fmtFull(r.meta.scripts)} / ${fmtFull(r.meta.stylesheets)}`],
                                ].map(([k, val]) => (
                                    <div key={k} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-dashed border-border-subtle pb-1.5">
                                        <dt className="shrink-0 text-meta text-fg-muted">{k}</dt>
                                        <dd className="min-w-0 truncate text-right text-body-sm text-fg tabular-nums">{val}</dd>
                                    </div>
                                ))}
                            </dl>
                            {r.meta.title || r.meta.description ? (
                                <div className="mt-4 rounded-card bg-surface-sunken p-3">
                                    <p className="text-meta text-fg-muted">How it may look in Google</p>
                                    <p className="mt-1 truncate text-body text-info">{r.meta.title || '(no title)'}</p>
                                    <p className="line-clamp-2 text-body-sm text-fg-secondary">{r.meta.description || '(no meta description)'}</p>
                                </div>
                            ) : null}
                        </Card>
                    </div>

                    <Card padding="none" className="overflow-hidden">
                        <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0 md:p-5 md:pb-0">
                            <CardHeader title="Checks" description="Grouped by area, most serious first" className="mb-0" />
                            <div className="flex flex-wrap items-center gap-2">
                                <SegmentedControl ariaLabel="Checks shown" size="sm" variant="neutral" value={filter} onChange={setFilter} options={[{ value: 'issues', label: 'Issues' }, { value: 'all', label: 'All checks' }]} />
                                <AskButton size="sm" label="Ask AI for a fix plan" from="site:audit" site={{ ga4: site.ga4, gsc: site.gsc }}
                                    prompt={`My site audit of ${r.url} scored ${r.score}/100 with ${r.summary.critical} critical issues and ${r.summary.warning} warnings: ${r.issues.filter((i) => i.severity === 'critical' || i.severity === 'warning').slice(0, 8).map((i) => i.title).join('; ')}. Give me a prioritised fix plan.`} />
                            </div>
                        </div>
                        {groups.length === 0 ? (
                            <EmptyState variant="inline" icon={CheckCircle2} title="No issues found" description="Every check passed." />
                        ) : (
                            <div className="divide-y divide-border-subtle">
                                {groups.map(([cat, items]) => (
                                    <section key={cat} className="p-4 md:p-5">
                                        <h3 className="mb-2 text-body-sm font-semibold text-fg">{cat}</h3>
                                        <ul className="flex flex-col gap-2">
                                            {items.map((i) => {
                                                const S = SEV[i.severity];
                                                return (
                                                    <li key={i.id} className="flex items-start gap-3">
                                                        <S.icon aria-hidden size={16} className={cn('mt-0.5 shrink-0', S.tone)} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-fg">
                                                                {i.title}
                                                                <Badge variant={S.badge}>{S.label}</Badge>
                                                                {i.value ? <span className="text-meta font-normal text-fg-muted [overflow-wrap:anywhere]">{i.value}</span> : null}
                                                            </p>
                                                            <p className="mt-0.5 text-body-sm text-fg-secondary">{i.description}</p>
                                                            {i.recommendation && i.severity !== 'passed' ? <p className="mt-1 text-body-sm text-fg"><span className="text-fg-muted">Fix: </span>{i.recommendation}</p> : null}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </Card>
                    <SpeedCard origin={r.url} />
                </div>
            )}
        </div>
    );
}

interface PerfResponse {
    overview: Record<'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb', { value: number; rating: 'good' | 'needs-improvement' | 'poor' }>;
    byDevice: { device: string; lcp: number; inp: number; cls: number; score: number }[];
    score: number;
}

const VITALS: { key: keyof PerfResponse['overview']; label: string; fmt: (v: number) => string }[] = [
    { key: 'lcp', label: 'Largest Contentful Paint', fmt: (v) => `${v.toFixed(1)} s` },
    { key: 'inp', label: 'Interaction to Next Paint', fmt: (v) => `${Math.round(v)} ms` },
    { key: 'cls', label: 'Cumulative Layout Shift', fmt: (v) => v.toFixed(2) },
    { key: 'fcp', label: 'First Contentful Paint', fmt: (v) => `${v.toFixed(1)} s` },
    { key: 'ttfb', label: 'Time to First Byte', fmt: (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`) },
];
const RATING = { good: { label: 'Good', variant: 'up' as const }, 'needs-improvement': { label: 'Needs work', variant: 'warn' as const }, poor: { label: 'Poor', variant: 'down' as const } };

/** Core Web Vitals from real Chrome users (CrUX), the old Analytics "Performance" sub-page. */
function SpeedCard({ origin }: { origin: string }) {
    const q = useSWR<PerfResponse, FetchError>(`/api/analytics/performance?${new URLSearchParams({ siteUrl: origin })}`, fetchJson, { revalidateOnFocus: false, shouldRetryOnError: false });
    return (
        <Card>
            <CardHeader title="Speed (Core Web Vitals)" description="Real visits from Chrome users over the last 28 days (Chrome UX Report)" />
            {q.error ? (
                <EmptyState variant="inline" icon={Gauge} title="No field speed data for this site" description={q.error.status === 503 ? 'Chrome only publishes speed data for sites with enough visits, or the speed service is not set up here.' : q.error.message} />
            ) : !q.data ? <Skeleton className="h-28" /> : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {VITALS.map((v) => {
                            const m = q.data!.overview[v.key];
                            return (
                                <div key={v.key} className="rounded-card border border-border-subtle p-3">
                                    <p className="text-meta text-fg-muted">{v.label}</p>
                                    <p className="mt-1 flex items-baseline gap-2"><span className="text-stat-sm text-fg">{v.fmt(m.value)}</span><Badge variant={RATING[m.rating].variant}>{RATING[m.rating].label}</Badge></p>
                                </div>
                            );
                        })}
                    </div>
                    {q.data.byDevice.length ? (
                        <p className="mt-3 text-meta text-fg-muted">By device: {q.data.byDevice.map((d) => `${d.device} LCP ${d.lcp.toFixed(1)} s, INP ${Math.round(d.inp)} ms`).join(' · ')}. Speed score {q.data.score}/100 (higher is better).</p>
                    ) : null}
                </>
            )}
        </Card>
    );
}
