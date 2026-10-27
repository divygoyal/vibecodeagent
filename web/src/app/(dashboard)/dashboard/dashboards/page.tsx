'use client';

/** Dashboards list (DESIGN.md 5.9): cards with live wireframe thumbnails, search, visibility filter. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Copy, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button, ConfirmModal, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Pill, SearchInput, SegmentedControl, Skeleton } from '@/components/ui';
import { Thumbnail, type ThumbItem } from '@/components/dashboard-builder/Thumbnail';
import { fetchJson } from '@/components/dashboard-builder/useWidgetData';

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

            {isLoading ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" rounded="card" />)}</div>
            ) : !all.length ? (
                <EmptyState variant="page" icon={LayoutDashboard} title="No dashboards yet" description="Start from a template: Site overview, Search performance, Client report and more. Every widget can use any of your sites."
                    actions={<><Button asChild variant="primary" icon={Plus}><Link href="/dashboard/dashboards/new">New dashboard</Link></Button><Button asChild variant="secondary"><Link href="/dashboard/dashboards/new?template=site-overview">Start from a template</Link></Button></>} />
            ) : !list.length ? (
                <EmptyState variant="card" title="Nothing matches" description="Try another search or filter." />
            ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((d) => (
                        <article key={d.id} className="group relative flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card transition-[box-shadow,border-color] duration-120 hover:border-border hover:shadow-card-hover">
                            <Link href={`/dashboard/dashboards/${d.id}`} className="flex flex-col focus-visible:outline-offset-[-2px]">
                                <div className="flex aspect-[16/9] items-start justify-center overflow-hidden border-b border-border-subtle bg-surface-sunken p-4">
                                    {d.preview.length ? <Thumbnail items={d.preview} className="w-full" /> : <span className="m-auto text-body-sm text-fg-faint">Empty dashboard</span>}
                                </div>
                                <div className="flex flex-col gap-1 p-4 pb-3">
                                    <h2 className="truncate text-title-sm text-fg">{d.name}</h2>
                                    <p className="truncate text-body-sm text-fg-muted">{d.site} · edited {ago(d.updatedAt)}</p>
                                </div>
                            </Link>
                            <div className="mt-auto flex items-center gap-2 px-4 pb-4">
                                {d.isTemplate ? <Pill tone="info">Template</Pill> : d.share.enabled ? <Pill tone="brand" dot>{d.share.embed ? 'Embedded' : 'Public link'}</Pill> : <Pill>Private</Pill>}
                                {d.share.enabled ? <span className="text-meta text-fg-muted">{d.views} views</span> : null}
                                <span className="text-meta text-fg-faint">{d.widgetCount} widgets{d.pageCount > 1 ? ` · ${d.pageCount} pages` : ''}</span>
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
