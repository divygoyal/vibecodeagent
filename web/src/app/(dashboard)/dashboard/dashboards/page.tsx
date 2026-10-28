'use client';

/** Dashboards list (DESIGN.md 5.9): cards with live wireframe thumbnails, search, visibility filter. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowRight, Copy, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button, ConfirmModal, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Pill, SearchInput, SegmentedControl, Skeleton } from '@/components/ui';
import { Thumbnail, type ThumbItem } from '@/components/dashboard-builder/Thumbnail';
import { DashThemeRoot } from '@/components/dashboard-builder/theme/DashTheme';
import { fetchJson } from '@/components/dashboard-builder/useWidgetData';
import { buildFromTemplate, defaultTheme, TEMPLATES } from '@/lib/builder/templates';
import { themePreset } from '@/lib/builder/themes';
import type { ThemeV2 } from '@/lib/builder/types';
import PREVIEWS from '@/lib/builder/templatePreviews.json';
import { useResolvedTheme } from '@/lib/theme';

interface ListItem {
    id: string;
    name: string;
    description: string;
    site: string;
    widgetCount: number;
    pageCount: number;
    share: { enabled: boolean; hasPassword: boolean; embed: boolean; token?: string | null };
    isTemplate: boolean;
    views: number;
    updatedAt: string | null;
    preview: ThumbItem[];
    /** Round 2: the dashboard's theme (absent = today's look). */
    look?: Pick<ThemeV2, 'id' | 'density' | 'card' | 'pattern' | 'font' | 'palette' | 'brand'>;
}

/** A few of the new templates, one per kind of report, for the "Start from a template" row. */
const FEATURED = ['executive-summary', 'seo-opportunities', 'ai-traffic', 'client-monthly-seo'];

function featuredThumb(id: string): { items: ThumbItem[]; theme: ThemeV2 } {
    const doc = buildFromTemplate(id, { name: 'x', defaultSource: { type: 'portfolio', include: 'all' } });
    const page = doc.pages[0];
    return {
        theme: doc.theme,
        items: page.layouts.lg.map((l) => {
            const w = doc.widgets[l.i];
            const metric = w.type === 'scorecard' || w.type === 'pie' || w.type === 'geo' ? w.config.metric.id
                : w.type === 'kpi-strip' || w.type === 'bar' || w.type === 'portfolio-grid' ? w.config.metrics[0]?.id
                    : w.type === 'timeseries' ? w.config.series[0]?.metric.id
                        : w.type === 'table' ? w.config.columns.find((c) => c.kind === 'metric')?.ref : undefined;
            return { x: l.x, y: l.y, w: l.w, h: l.h, type: w.type, metric, values: (PREVIEWS as Record<string, Record<string, number[]>>)[id]?.[l.i] };
        }),
    };
}

function TemplateStrip({ mode }: { mode: 'light' | 'dark' }) {
    const items = useMemo(() => FEATURED.map((id) => ({ meta: TEMPLATES.find((t) => t.id === id)!, ...featuredThumb(id) })).filter((x) => x.meta), []);
    return (
        <section aria-labelledby="tpl-strip" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="tpl-strip" className="text-title-sm text-fg">Start from a template</h2>
                <Link href="/dashboard/dashboards/new" className="tap-area inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">All {TEMPLATES.length} templates<ArrowRight aria-hidden size={14} /></Link>
            </div>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
                {items.map(({ meta, items: thumb, theme }) => (
                    <Link key={meta.id} href={`/dashboard/dashboards/new?template=${meta.id}`} className="group flex w-[260px] shrink-0 snap-start items-stretch overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card transition-[box-shadow,border-color] duration-120 hover:border-border hover:shadow-card-hover sm:w-auto">
                        <DashThemeRoot theme={theme} mode={mode} className="flex w-[104px] shrink-0 items-start overflow-hidden border-r border-border-subtle p-2">
                            <div className={theme.id ? 'w-full' : 'w-full'}><Thumbnail items={thumb} className="w-full" /></div>
                        </DashThemeRoot>
                        <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5">
                            <span className="truncate text-body-sm font-medium text-fg">{meta.name}</span>
                            <span className="line-clamp-2 text-meta text-fg-muted">{meta.audience ?? meta.description}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}

function CardSkeleton() {
    return (
        <div className="flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card" aria-hidden>
            <div className="aspect-[16/9] border-b border-border-subtle bg-surface-sunken p-4">
                <div className="grid h-full grid-cols-4 grid-rows-[1fr_2fr_1.4fr] gap-1.5">
                    <Skeleton className="col-span-4 h-full" /><Skeleton className="col-span-3 h-full" /><Skeleton className="h-full" /><Skeleton className="col-span-4 h-full" />
                </div>
            </div>
            <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <div className="mt-2 flex gap-2"><Skeleton className="h-5 w-16" rounded="full" /><Skeleton className="h-5 w-20" /></div>
            </div>
        </div>
    );
}

function ago(iso: string | null): string {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
}

type Filter = 'all' | 'private' | 'shared' | 'templates';

export default function DashboardsListPage() {
    const router = useRouter();
    const appMode = useResolvedTheme();
    const { data, isLoading, mutate } = useSWR<{ dashboards: ListItem[] }>('/api/dashboards', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const [q, setQ] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [toDelete, setToDelete] = useState<ListItem | null>(null);
    const all = useMemo(() => data?.dashboards ?? [], [data]);
    const list = useMemo(() => {
        const s = q.trim().toLowerCase();
        return all.filter((d) => {
            if (filter === 'templates' ? !d.isTemplate : d.isTemplate) return false;
            if (filter === 'private' && d.share.enabled) return false;
            if (filter === 'shared' && !d.share.enabled) return false;
            return !s || d.name.toLowerCase().includes(s) || d.site.toLowerCase().includes(s);
        });
    }, [all, q, filter]);
    const hasTemplates = all.some((d) => d.isTemplate);

    const duplicate = async (d: ListItem) => {
        const r = await fetchJson<{ dashboard: { id: string } }>(`/api/dashboards/${d.id}/duplicate`, { method: 'POST', body: '{}' });
        toast.success('Copy created');
        await mutate();
        router.push(`/dashboard/dashboards/${r.dashboard.id}`);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-heading text-fg">Dashboards</h1>
                    <p className="mt-1 text-body text-fg-muted">Build and share live reports. Free, unlimited.</p>
                </div>
                <Button asChild variant="primary" icon={Plus}><Link href="/dashboard/dashboards/new">New dashboard</Link></Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <SearchInput value={q} onValueChange={setQ} placeholder="Search dashboards" className="w-full sm:w-72" />
                <SegmentedControl<Filter> ariaLabel="Show" variant="neutral" value={filter} onChange={setFilter}
                    options={[{ value: 'all', label: 'All' }, { value: 'private', label: 'Private' }, { value: 'shared', label: 'Shared' }, ...(hasTemplates ? [{ value: 'templates' as const, label: 'My templates' }] : [])]} />
            </div>

            {all.length && !q && filter === 'all' ? <TemplateStrip mode={appMode} /> : null}

            {isLoading ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
            ) : !all.length ? (
                <EmptyState variant="page" icon={LayoutDashboard} title="No dashboards yet" description={`Start from one of ${TEMPLATES.length} templates: Executive summary, SEO opportunities, AI traffic, Client report and more. Every widget can use any of your sites.`}
                    actions={<><Button asChild variant="primary" icon={Plus}><Link href="/dashboard/dashboards/new">New dashboard</Link></Button><Button asChild variant="secondary"><Link href="/dashboard/dashboards/new?template=site-overview">Start from a template</Link></Button></>} />
            ) : !list.length ? (
                <EmptyState variant="card" title="Nothing matches" description="Try another search or filter." />
            ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((d) => (
                        <article key={d.id} className="group relative flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card transition-[box-shadow,border-color] duration-120 hover:border-border hover:shadow-card-hover">
                            <Link href={`/dashboard/dashboards/${d.id}`} className="flex flex-col focus-visible:outline-offset-[-2px]">
                                {d.look?.id ? (
                                    <DashThemeRoot theme={{ ...defaultTheme('light'), ...d.look }} mode={appMode} className="flex aspect-[16/9] items-start justify-center overflow-hidden border-b border-border-subtle p-4">
                                        {d.preview.length ? <Thumbnail items={d.preview} className="w-full" /> : <span className="m-auto text-body-sm text-fg-muted">Empty dashboard</span>}
                                    </DashThemeRoot>
                                ) : (
                                    <div className="flex aspect-[16/9] items-start justify-center overflow-hidden border-b border-border-subtle bg-surface-sunken p-4">
                                        {d.preview.length ? <Thumbnail items={d.preview} className="w-full" /> : <span className="m-auto text-body-sm text-fg-muted">Empty dashboard</span>}
                                    </div>
                                )}
                                <div className="flex flex-col gap-1 p-4 pb-3">
                                    <h2 className="truncate text-title-sm text-fg">{d.name}</h2>
                                    <p className="truncate text-body-sm text-fg-muted">{d.site} · edited {ago(d.updatedAt)}</p>
                                </div>
                            </Link>
                            <div className="mt-auto flex items-center gap-2 px-4 pb-4">
                                {d.isTemplate ? <Pill tone="info">Template</Pill> : d.share.enabled ? <Pill tone="brand" dot>{d.share.embed ? 'Embedded' : 'Public link'}</Pill> : <Pill>Private</Pill>}
                                {d.share.enabled ? <span className="shrink-0 whitespace-nowrap text-meta text-fg-muted">{d.views} {d.views === 1 ? 'view' : 'views'}</span> : null}
                                <span className="min-w-0 truncate whitespace-nowrap text-meta text-fg-muted" title={d.look?.id ? `${themePreset(d.look.id).name} theme` : undefined}>{d.widgetCount} widgets{d.pageCount > 1 ? ` · ${d.pageCount} pages` : ''}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label={`Actions for ${d.name}`} className="ml-auto" /></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem icon={ExternalLink} onSelect={() => router.push(`/dashboard/dashboards/${d.id}`)}>Open</DropdownMenuItem>
                                        <DropdownMenuItem icon={Pencil} onSelect={() => router.push(`/dashboard/dashboards/${d.id}/edit`)}>Edit</DropdownMenuItem>
                                        <DropdownMenuItem icon={Copy} onSelect={() => void duplicate(d)}>Duplicate</DropdownMenuItem>
                                        <DropdownMenuItem icon={Share2} onSelect={() => router.push(`/dashboard/dashboards/${d.id}?share=1`)}>Share</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem icon={Trash2} destructive onSelect={() => setToDelete(d)}>Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <ConfirmModal open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)} title={`Delete “${toDelete?.name ?? ''}”?`} description="Its public link stops working. This cannot be undone." confirmLabel="Delete"
                onConfirm={async () => { if (!toDelete) return; await fetchJson(`/api/dashboards/${toDelete.id}`, { method: 'DELETE' }); setToDelete(null); toast.success('Dashboard deleted'); await mutate(); }} />
        </div>
    );
}
