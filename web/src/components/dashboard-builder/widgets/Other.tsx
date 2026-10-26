'use client';

import { useMemo, useState } from 'react';
import { useElementWidth } from '../useElementWidth';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImageOff } from 'lucide-react';

import { cn } from '@/lib/cn';
import { BarList, Sparkline } from '@/components/charts';
import { EmptyState, Favicon, MetricDelta } from '@/components/ui';
import { fmtMetricValue, metricColor, metricLabel, metricDeltaFor } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import type { GeoWidget, ImageWidget, PortfolioGridWidget, SectionWidget, TextWidget } from '@/lib/builder/types';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { plotHeight } from './Charts';
import { dsFormat, dsKey, metricBetter } from './metricUi';

const ChoroplethMap = dynamic(() => import('../charts/ChoroplethMap'), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

// ── Geo ──────────────────────────────────────────────────────────────────

export function GeoView(props: WidgetViewProps<GeoWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const id = c.metric.id;
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const values = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of frame?.rows ?? []) {
            const code = String(r['d:country'] ?? '');
            const v = r[`m:${id}`];
            if (code.length === 2 && typeof v === 'number') m.set(code, v);
        }
        return m;
    }, [frame, id]);
    const h = plotHeight(props.height, widget.showTitle !== false);
    const side = c.topList > 0 && props.bp === 'lg' && width > 520;
    const below = c.topList > 0 && !side;
    const listW = side ? Math.min(240, Math.floor(width * 0.34)) : 0;
    const mapW = Math.max(120, width - listW - (side ? 16 : 0));
    const mapH = below ? Math.max(100, h - Math.min(c.topList, 5) * 36 - 8) : h;
    const top = [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, c.topList || 0);
    const fmt = (v: number) => fmtMetricValue(id, v, { compact: true, currency: ok?.flags.currency });
    return (
        <WidgetFrame props={props}>
            <div ref={ref} className={cn('flex h-full min-w-0', side ? 'flex-row gap-4' : 'flex-col gap-2')}>
                {!frame ? null : !values.size ? (
                    <EmptyState variant="inline" title={`No ${metricLabel(id).toLowerCase()} by country in this period`} />
                ) : (
                    <>
                        {width > 0 ? <ChoroplethMap values={values} color={metricColor(id)} width={mapW} height={mapH} projection={c.projection} steps={c.scale.steps} format={fmt} label={metricLabel(id)} showLegend={c.showLegend} /> : null}
                        {top.length ? (
                            <div className="min-w-0 flex-1 overflow-hidden" style={side ? { width: listW } : undefined}>
                                <BarList items={top.map(([code, v]) => ({ key: code, label: countryName(code), text: countryName(code), value: v }))} metric={dsKey(id)} limit={below ? Math.min(top.length, 5) : top.length} formatValue={(v) => fmtMetricValue(id, v, { currency: ok?.flags.currency })} labelHeader="Country" />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </WidgetFrame>
    );
}

// ── Text, section, image ─────────────────────────────────────────────────

export function fillVars(md: string, vars: Record<string, string>): string {
    return md.replace(/\{\{\s*([a-z_:]+)\s*\}\}/gi, (m, k: string) => vars[k] ?? m);
}

const ROLE: Record<TextWidget['config']['role'], string> = {
    heading: 'text-title text-fg [&_h1]:text-heading [&_h2]:text-title [&_h3]:text-title-sm',
    subheading: 'text-title-sm text-fg-secondary',
    body: 'text-body text-fg-secondary',
    note: 'text-body-sm text-fg-muted',
    callout: 'text-body text-fg-secondary',
};

export function TextView({ widget, vars }: WidgetViewProps<TextWidget>) {
    const c = widget.config;
    const md = c.variables ? fillVars(c.markdown, vars) : c.markdown;
    return (
        <div className={cn(
            'h-full overflow-auto',
            c.role === 'callout' ? 'rounded-card border border-border-subtle bg-surface-sunken p-4' : widget.style?.background === 'surface' ? 'rounded-card border border-border-subtle bg-surface p-4 shadow-card' : 'px-1 py-1',
        )}>
            <div className={cn(
                'max-w-none space-y-2 [&_a]:text-brand-text [&_a]:underline [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_strong]:text-fg [&_ul]:list-disc',
                ROLE[c.role],
                c.align === 'center' && 'text-center',
                c.align === 'right' && 'text-right',
            )}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}
                >
                    {md}
                </ReactMarkdown>
            </div>
        </div>
    );
}

export function SectionView({ widget }: WidgetViewProps<SectionWidget>) {
    const c = widget.config;
    return (
        <div className={cn('flex h-full flex-col justify-end pb-1', c.align === 'center' && 'items-center text-center')}>
            <h2 className="text-title text-fg">{c.title}</h2>
            {c.subtitle ? <p className="text-body-sm text-fg-muted">{c.subtitle}</p> : null}
            {c.divider ? <div aria-hidden className="mt-2 h-px w-full bg-border-subtle" /> : null}
        </div>
    );
}

export function ImageView({ widget }: WidgetViewProps<ImageWidget>) {
    const c = widget.config;
    const safe = /^https:\/\//i.test(c.src);
    const radius = c.radius === 'none' ? '' : c.radius === 'sm' ? 'rounded-md' : c.radius === 'full' ? 'rounded-full' : 'rounded-card';
    const img = safe ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.src} alt={c.alt} loading="lazy" referrerPolicy="no-referrer" className={cn('h-full w-full', c.fit === 'cover' ? 'object-cover' : 'object-contain', radius)} />
    ) : (
        <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-border bg-surface-sunken text-body-sm text-fg-muted', radius)}>
            <ImageOff aria-hidden size={20} strokeWidth={1.75} />
            Add an https image URL
        </div>
    );
    return c.href && /^https:\/\//i.test(c.href) ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="block h-full">{img}</a> : <div className="h-full">{img}</div>;
}

// ── Portfolio grid ───────────────────────────────────────────────────────

export function PortfolioGridView(props: WidgetViewProps<PortfolioGridWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const sites = ok?.parts.sites;
    const spark = ok?.parts.spark;
    const c = widget.config;
    const [showAll, setShowAll] = useState(false);
    const metrics = c.metrics.map((m) => m.id);
    const first = metrics[0];
    const sorted = useMemo(() => {
        const rows = [...(sites?.rows ?? [])];
        const key = c.sort.by;
        const val = (r: Record<string, unknown>) => {
            if (key === 'name') return String(r['d:site']);
            if (key === 'change') {
                const cur = Number(r[`m:${first}`] ?? 0);
                const prev = Number(r[`m:${first}:prev`] ?? 0);
                return prev > 0 ? (cur - prev) / prev : cur > 0 ? 1 : 0;
            }
            return Number(r[`m:${key}`] ?? 0);
        };
        rows.sort((a, b) => {
            const av = val(a);
            const bv = val(b);
            const d = typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number);
            return c.sort.dir === 'asc' ? d : -d;
        });
        return rows;
    }, [sites, c.sort, first]);
    const series = useMemo(() => {
        const m = new Map<string, { dates: string[]; a: (number | null)[]; b: (number | null)[] }>();
        for (const r of spark?.rows ?? []) {
            const s = String(r['d:site']);
            const e = m.get(s) ?? { dates: [], a: [], b: [] };
            e.dates.push(String(r['d:date']));
            e.a.push(typeof r[`m:${metrics[0]}`] === 'number' ? (r[`m:${metrics[0]}`] as number) : null);
            e.b.push(metrics[1] && typeof r[`m:${metrics[1]}`] === 'number' ? (r[`m:${metrics[1]}`] as number) : null);
            m.set(s, e);
        }
        return m;
    }, [spark, metrics]);
    const shown = showAll ? sorted : sorted.slice(0, c.limit);
    const cols = c.columns === 'auto' ? (props.bp === 'sm' ? 1 : props.bp === 'md' ? 2 : 3) : c.columns;
    return (
        <WidgetFrame props={props} bodyClassName="overflow-y-auto">
            {!sites ? null : !sorted.length ? <EmptyState variant="inline" title="No sites yet" /> : (
                <>
                    <div className={cn('grid gap-3', c.show === 'compact' && 'gap-0 divide-y divide-border-subtle')} style={{ gridTemplateColumns: c.show === 'compact' ? '1fr' : `repeat(${cols}, minmax(0, 1fr))` }}>
                        {shown.map((r) => {
                            const site = String(r['d:site']);
                            const s = series.get(site);
                            const alert = c.alerts && metrics.some((id) => {
                                const d = metricDeltaFor(id, r[`m:${id}`] as number, r[`m:${id}:prev`] as number);
                                return d.state === 'change' && d.tone === 'bad' && (d.change ?? 0) <= -30 && /^(gsc:clicks|ga4:activeUsers|ga4:sessions)$/.test(id);
                            });
                            const body = (
                                <>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Favicon host={site.replace(/--\d+$/, '')} size={16} />
                                        <span className="truncate text-title-sm text-fg">{site}</span>
                                        {alert ? <span className="ml-auto shrink-0 rounded-badge bg-down-soft px-1.5 text-caption text-down">Drop</span> : null}
                                    </div>
                                    <div className={cn('mt-2 grid gap-x-3 gap-y-1', c.show === 'compact' ? 'grid-cols-4' : 'grid-cols-2')}>
                                        {metrics.map((id) => {
                                            const v = r[`m:${id}`];
                                            const pv = r[`m:${id}:prev`];
                                            return (
                                                <div key={id} className="min-w-0">
                                                    <p className="flex items-center gap-1 truncate text-caption text-fg-muted"><span aria-hidden className="size-1.5 rounded-full" style={{ background: metricColor(id) }} />{metricLabel(id)}</p>
                                                    <p className="flex items-baseline gap-1.5">
                                                        <span className="text-stat-sm text-fg">{fmtMetricValue(id, typeof v === 'number' ? v : null, { compact: true })}</span>
                                                        {typeof v === 'number' ? <MetricDelta current={v} previous={typeof pv === 'number' ? pv : null} format={dsFormat(id)} better={metricBetter(id)} /> : null}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {c.sparkline && s && c.show === 'cards' ? (
                                        <div className="mt-2"><Sparkline series={[{ metric: dsKey(metrics[0]), values: s.a, label: metricLabel(metrics[0]) }, ...(metrics[1] ? [{ metric: dsKey(metrics[1]), values: s.b, label: metricLabel(metrics[1]) }] : [])]} dates={s.dates} height={48} interactive={false} /></div>
                                    ) : null}
                                </>
                            );
                            const cls = cn('block min-w-0 text-left', c.show === 'cards' ? 'rounded-card border border-border-subtle bg-surface p-3' : 'py-2');
                            return c.onClick === 'open-site' && props.mode !== 'public' && props.mode !== 'edit'
                                ? <Link key={site} href={`/dashboard/s/${encodeURIComponent(site)}`} className={cn(cls, 'transition-colors hover:border-border')}>{body}</Link>
                                : <div key={site} className={cls}>{body}</div>;
                        })}
                    </div>
                    {sorted.length > c.limit ? (
                        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-body-sm font-medium text-brand-text hover:underline">{showAll ? 'Show fewer' : `Show all ${sorted.length} sites`}</button>
                    ) : null}
                </>
            )}
        </WidgetFrame>
    );
}

