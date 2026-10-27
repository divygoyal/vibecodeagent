'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Copy, FileDown, LayoutTemplate, MonitorPlay, MoreHorizontal, Pencil, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Banner, Button, ConfirmModal, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Pill, Skeleton } from '@/components/ui';
import { DashboardView, useUrlControls } from '@/components/dashboard-builder/DashboardView';
import { DashboardBrandHeader } from '@/components/dashboard-builder/DashboardBrandHeader';
import { ShareDialog } from '@/components/dashboard-builder/ShareDialog';
import { TvFrame, tvRefreshMs } from '@/components/dashboard-builder/TvMode';
import { dashRootProps } from '@/components/dashboard-builder/theme/DashTheme';
import { fetchJson, ownerPageLoader, usePageResults } from '@/components/dashboard-builder/useWidgetData';
import { canonicalJson } from '@/lib/builder/compile';
import { presetLabel } from '@/lib/builder/dates';
import { cssToHex, exportReportPdf, hasReportKit } from '@/lib/builder/reportPdf';
import { themePreset } from '@/lib/builder/themes';
import { exportDashboardToPDF } from '@/lib/dashboardPdfExport';
import { useResolvedTheme } from '@/lib/theme';
import type { DashboardDocV2, DashboardRecord, FilterControl, ShareState } from '@/lib/builder/types';

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}

export default function DashboardViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const sp = useSearchParams();
    const { data, error, mutate } = useSWR<{ dashboard: DashboardRecord }>(`/api/dashboards/${id}`, (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const rec = data?.dashboard;

    if (error) {
        return <EmptyState variant="page" title="Dashboard not found" description="It may have been deleted." actions={<Button asChild variant="secondary"><Link href="/dashboard/dashboards">All dashboards</Link></Button>} />;
    }
    if (!rec) {
        return (
            <div className="flex flex-col gap-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-9 w-80" />
                <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" rounded="card" />)}</div>
                <Skeleton className="h-72" rounded="card" />
            </div>
        );
    }
    return <Loaded rec={rec} onRecord={(r) => mutate({ dashboard: r }, { revalidate: false })} openShare={sp.get('share') === '1'} tv={sp.get('tv') === '1'} router={router} />;
}

function Loaded({ rec, onRecord, openShare, tv, router }: { rec: DashboardRecord; onRecord: (r: DashboardRecord) => void; openShare: boolean; tv: boolean; router: ReturnType<typeof useRouter> }) {
    const doc = rec.doc;
    const appMode = useResolvedTheme();
    const ctl = useUrlControls(doc, { date: true, compare: true, filters: true });
    const [fresh, setFresh] = useState(false);
    const key = `owner:${rec.id}:${rec.rev}:${canonicalJson(ctl.state)}`;
    const page = usePageResults(key, ownerPageLoader(rec.id, ctl.state.pageId ?? doc.pages[0].id, ctl.state, fresh), tv ? tvRefreshMs(doc) : doc.settings.autoRefreshSec * 1000);
    const [share, setShare] = useState(openShare);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [wide, setWide] = useState(true);
    const exportRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const f = () => setWide(mq.matches);
        f();
        mq.addEventListener('change', f);
        return () => mq.removeEventListener('change', f);
    }, []);

    const siteLabel = doc.defaultSource.type === 'site' ? doc.defaultSource.siteId : 'All sites';
    const updatedAt = page.data ? Object.values(page.data.results).map((r) => (r.status === 'ok' ? r.fetchedAt : '')).filter(Boolean).sort()[0] : undefined;

    const saveDoc = async (next: DashboardDocV2) => {
        try {
            const r = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${rec.id}`, { method: 'PUT', headers: { 'If-Match': String(rec.rev) }, body: JSON.stringify({ doc: next }) });
            onRecord(r.dashboard);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not save');
        }
    };
    const duplicate = async (asTemplate: boolean) => {
        try {
            const r = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${rec.id}/duplicate${asTemplate ? '?asTemplate=1' : ''}`, { method: 'POST', body: JSON.stringify({}) });
            toast.success(asTemplate ? 'Saved to My templates' : 'Copy created');
            if (!asTemplate) router.push(`/dashboard/dashboards/${r.dashboard.id}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not duplicate');
        }
    };
    const exportPdf = useCallback(async () => {
        if (!exportRef.current) return;
        if (hasReportKit(doc.theme)) {
            // Client report kit: cover as its own first page, credits in the footer.
            const cs = getComputedStyle(exportRef.current);
            const tok = (name: string, fallback: string) => cssToHex(cs.getPropertyValue(name).trim(), fallback);
            toast.promise(exportReportPdf(exportRef.current, { name: doc.name, dateLabel: presetLabel(ctl.state.date.range), theme: doc.theme, background: tok('--tc-canvas', '#f6f7f9'), ink: tok('--tc-fg', '#171a20'), muted: tok('--tc-fg-muted', '#636b78') }), { loading: 'Preparing PDF…', success: 'PDF downloaded', error: 'PDF export failed' });
            return;
        }
        const bg = getComputedStyle(document.body).backgroundColor;
        const hex = (() => {
            const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
            return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#f6f7f9';
        })();
        toast.promise(exportDashboardToPDF(exportRef.current, { dashboardName: doc.name, dateRangeLabel: presetLabel(ctl.state.date.range), companyName: doc.theme.header.companyName, backgroundColor: hex }), { loading: 'Preparing PDF…', success: 'PDF downloaded', error: 'PDF export failed' });
    }, [doc, ctl.state.date.range]);
    const del = async () => {
        await fetchJson(`/api/dashboards/${rec.id}`, { method: 'DELETE' });
        toast.success('Dashboard deleted');
        router.push('/dashboard/dashboards');
    };

    const header = (
        <div className="flex flex-col gap-3">
            <Link href="/dashboard/dashboards" className="tap-area inline-flex w-fit items-center gap-1 text-body-sm text-fg-muted hover:text-fg"><ArrowLeft aria-hidden size={14} />Dashboards</Link>
            {doc.theme.cover?.enabled && (ctl.state.pageId ?? doc.pages.find((p) => !p.hidden)?.id) === doc.pages.find((p) => !p.hidden)?.id ? null : <DashboardBrandHeader doc={doc} dark={appMode === 'dark' && Boolean(doc.theme.id)} />}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="truncate text-heading text-fg">{doc.name}</h1>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
                        <span>{siteLabel}</span>
                        {updatedAt ? <span>· Updated {timeAgo(updatedAt)}</span> : null}
                        {rec.share.enabled ? <Pill tone="brand" dot>Public link</Pill> : <Pill>Private</Pill>}
                        {rec.schemaVersion === 1 ? <Pill tone="info">Older dashboard: opens in the new editor</Pill> : null}
                    </p>
                    {doc.description ? <p className="mt-1 max-w-[720px] text-body text-fg-secondary">{doc.description}</p> : null}
                </div>
                <div className="flex items-center gap-2" data-pdf-ignore="true">
                    <Button variant="ghost" size="md" icon={RefreshCw} iconOnly aria-label="Refresh data" onClick={() => { setFresh(true); void page.mutate().finally(() => setFresh(false)); }} />
                    {wide ? <Button asChild variant="secondary" icon={Pencil}><Link href={`/dashboard/dashboards/${rec.id}/edit`}>Edit</Link></Button> : null}
                    <Button variant="primary" icon={Share2} onClick={() => setShare(true)}>Share</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" iconOnly icon={MoreHorizontal} aria-label="More actions" /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem icon={Copy} onSelect={() => duplicate(false)}>Duplicate</DropdownMenuItem>
                            <DropdownMenuItem icon={LayoutTemplate} onSelect={() => duplicate(true)}>Save as my template</DropdownMenuItem>
                            <DropdownMenuItem icon={FileDown} onSelect={exportPdf}>Export PDF</DropdownMenuItem>
                            <DropdownMenuItem icon={MonitorPlay} onSelect={() => { void document.documentElement.requestFullscreen?.().catch(() => undefined); ctl.setTv(true); }}>Present (TV mode)</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem icon={Trash2} destructive onSelect={() => setConfirmDelete(true)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            {!wide ? <Banner variant="neutral">Editing works on larger screens.</Banner> : null}
        </div>
    );

    if (tv) {
        const tvMode = doc.theme.mode === 'auto' ? (themePreset(doc.theme.id).preferredMode ?? appMode) : doc.theme.mode;
        const r = dashRootProps(doc.theme, tvMode);
        return (
            <TvFrame doc={doc} pageId={ctl.state.pageId} onPage={ctl.setPage} onExit={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); ctl.setTv(false); }}
                resolved={page.data?.resolved} updatedAt={updatedAt} themeAttrs={r?.attrs ?? { 'data-theme': tvMode }} themeStyle={r?.style} themeClass={r?.className}>
                <DashboardView
                    doc={doc} mode="view" siteLabel={siteLabel} state={ctl.state} onPage={ctl.setPage} onDate={ctl.setDate} onFilter={ctl.setFilter}
                    allow={{ date: true, compare: true, filters: true }} data={page.data} loading={!page.data && !page.error} refetching={page.isValidating && Boolean(page.data)}
                    onRetry={() => void page.mutate()} options={{}} shell="inherit" tv
                />
            </TvFrame>
        );
    }

    return (
        <>
            <DashboardView
                doc={doc}
                mode="view"
                siteLabel={siteLabel}
                state={ctl.state}
                onPage={ctl.setPage}
                onDate={ctl.setDate}
                onFilter={ctl.setFilter}
                allow={{ date: true, compare: true, filters: true }}
                data={page.data}
                loading={!page.data && !page.error}
                refetching={page.isValidating && Boolean(page.data)}
                onRetry={() => void page.mutate()}
                options={{ load: (c: FilterControl, q: string) => fetchJson<{ options: Array<{ value: string; label: string }> }>(`/api/dashboards/options?dimension=${encodeURIComponent(c.dimension)}&q=${encodeURIComponent(q)}${doc.defaultSource.type === 'site' ? `&siteId=${encodeURIComponent(doc.defaultSource.siteId)}` : ''}`).then((r) => r.options) }}
                header={header}
                exportRef={exportRef}
                onChooseSource={wide ? () => router.push(`/dashboard/dashboards/${rec.id}/edit`) : undefined}
                shell="panel"
                appMode={appMode}
            />
            {page.error ? <Banner variant="danger" className="mt-4">{page.error instanceof Error ? page.error.message : 'Could not load data'}</Banner> : null}
            <ShareDialog
                open={share}
                onOpenChange={setShare}
                dashboardId={rec.id}
                doc={doc}
                share={rec.share}
                views={rec.views}
                onShareChange={(s: ShareState) => onRecord({ ...rec, share: s })}
                onDocChange={saveDoc}
            />
            <ConfirmModal open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this dashboard?" description="Its public link stops working. This cannot be undone." confirmLabel="Delete" onConfirm={del} />
        </>
    );
}
