'use client';

/**
 * Template gallery (BUILDER.md 11.1 and 12): Blank + 8 templates + My templates, wireframe
 * thumbnails generated from each template's own layout, family chips, then site and name.
 */
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { Badge, Banner, Button, Modal, Select } from '@/components/ui';
import { Thumbnail, type ThumbItem } from '@/components/dashboard-builder/Thumbnail';
import { fetchJson } from '@/components/dashboard-builder/useWidgetData';
import { BLANK_TEMPLATE, TEMPLATES, buildFromTemplate, type TemplateCategory, type TemplateMeta } from '@/lib/builder/templates';
import type { DashboardRecord } from '@/lib/builder/types';
import PREVIEWS from '@/lib/builder/templatePreviews.json';
import type { SiteOption } from '@/components/dashboard-builder/editor/Fields';
import { useCurrentSite } from '@/components/shell/useCurrentSite';

const CATEGORIES: Array<'All' | TemplateCategory | 'My templates'> = ['All', 'Overview', 'Search', 'Traffic', 'Content', 'Portfolio', 'Reporting', 'My templates'];

function thumbFor(id: string): ThumbItem[] {
    const doc = buildFromTemplate(id, { name: 'x', defaultSource: { type: 'portfolio', include: 'all' } });
    const page = doc.pages[0];
    return page.layouts.lg.map((l) => {
        const w = doc.widgets[l.i];
        const metric = w.type === 'scorecard' || w.type === 'pie' || w.type === 'geo' ? w.config.metric.id
            : w.type === 'kpi-strip' || w.type === 'bar' || w.type === 'portfolio-grid' ? w.config.metrics[0]?.id
                : w.type === 'timeseries' ? w.config.series[0]?.metric.id
                    : w.type === 'table' ? w.config.columns.find((c) => c.kind === 'metric')?.ref : undefined;
        return { x: l.x, y: l.y, w: l.w, h: l.h, type: w.type, metric, values: (PREVIEWS as Record<string, Record<string, number[]>>)[id]?.[l.i] };
    });
}

const NEED_LABEL = { gsc: 'Search Console', ga4: 'Analytics' } as const;

function TemplateCard({ id, title, description, needs, onPick, thumb, chip }: { id: string; title: string; description: string; needs: string[]; onPick: () => void; thumb: ThumbItem[]; chip?: string }) {
    return (
        <button type="button" onClick={onPick} className="group flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface text-left shadow-card transition-[box-shadow,border-color,transform] duration-120 hover:-translate-y-px hover:border-border hover:shadow-card-hover" data-template={id}>
            <div className="flex aspect-[16/10] items-start justify-center overflow-hidden border-b border-border-subtle bg-surface-sunken p-4">
                {thumb.length ? <Thumbnail items={thumb} className="w-full" /> : <span className="m-auto flex size-12 items-center justify-center rounded-card border border-dashed border-border-strong text-fg-muted"><Plus aria-hidden size={20} /></span>}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-4">
                <h2 className="text-title-sm text-fg">{title}</h2>
                <p className="text-body-sm text-fg-muted">{description}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {chip ? <Badge variant="neutral">{chip}</Badge> : null}
                    {needs.map((n) => <Badge key={n} variant="outline">{n}</Badge>)}
                </div>
            </div>
        </button>
    );
}

export default function NewDashboardPage() {
    return <Suspense fallback={null}><Gallery /></Suspense>;
}

interface Mine { id: string; name: string; description: string; isTemplate: boolean; preview: ThumbItem[] }

function Gallery() {
    const router = useRouter();
    const sp = useSearchParams();
    const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All');
    const [picked, setPicked] = useState<{ tpl?: TemplateMeta; mine?: Mine } | null>(() => {
        const t = sp.get('template');
        const meta = t ? TEMPLATES.find((x) => x.id === t) : undefined;
        return meta ? { tpl: meta } : null;
    });
    const [name, setName] = useState('');
    const [siteId, setSiteId] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const { data: sitesData } = useSWR<{ connected: boolean; sites: SiteOption[] }>('/api/dashboards/sites', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const { data: mineData } = useSWR<{ dashboards: Mine[] }>('/api/dashboards', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const sites = sitesData?.sites ?? [];
    const mine = (mineData?.dashboards ?? []).filter((d) => d.isTemplate);
    const thumbs = useMemo(() => Object.fromEntries([BLANK_TEMPLATE, ...TEMPLATES].map((t) => [t.id, thumbFor(t.id)])), []);
    const shown = cat === 'All' ? TEMPLATES : cat === 'My templates' ? [] : TEMPLATES.filter((t) => t.category === cat);
    const portfolio = Boolean(picked?.tpl?.portfolio);
    // Default: the site the user is on (switcher / last site page), then a fully paired site.
    const current = useCurrentSite().site;
    const currentOption = current ? sites.find((s) => (current.gscSiteUrl && s.gsc === current.gscSiteUrl) || (current.ga4PropertyId && s.ga4 === current.ga4PropertyId)) : undefined;
    const site = sites.find((s) => s.siteId === siteId) ?? currentOption ?? sites.find((s) => s.ga4 && s.gsc) ?? sites[0];
    const missing = picked?.tpl && site ? picked.tpl.needs.filter((n) => (n === 'ga4' ? !site.ga4 : !site.gsc)) : [];

    const create = async () => {
        if (!picked) return;
        setBusy(true);
        try {
            let id: string;
            const finalName = name.trim() || picked.tpl?.name || picked.mine?.name || 'Untitled dashboard';
            if (picked.mine) {
                const rec = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${picked.mine.id}`);
                const doc = { ...rec.dashboard.doc, name: finalName, defaultSource: rec.dashboard.doc.defaultSource.type === 'portfolio' || !site ? rec.dashboard.doc.defaultSource : { type: 'site' as const, siteId: site.siteId, ga4: site.ga4 ?? undefined, gsc: site.gsc ?? undefined }, meta: { createdFrom: `my-template:${picked.mine.id}` } };
                id = (await fetchJson<{ dashboard: DashboardRecord }>('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: finalName, doc }) })).dashboard.id;
            } else {
                id = (await fetchJson<{ dashboard: DashboardRecord }>('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: finalName, templateId: picked.tpl!.id, siteId: portfolio ? undefined : site?.siteId, portfolio }) })).dashboard.id;
            }
            router.push(`/dashboard/dashboards/${id}/edit`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not create the dashboard');
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <Link href="/dashboard/dashboards" className="tap-area inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-fg"><ArrowLeft aria-hidden size={14} />Dashboards</Link>
                <h1 className="mt-2 text-heading text-fg">New dashboard</h1>
                <p className="mt-1 text-body text-fg-muted">Pick a starting point. You can change every widget, and each widget can read any of your sites.</p>
            </div>
            <div role="tablist" aria-label="Template categories" className="flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c !== 'My templates' || mine.length).map((c) => (
                    <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={cn('h-8 rounded-full px-3 text-body-sm font-medium transition-colors', cat === c ? 'bg-brand text-brand-fg' : 'bg-subtle text-fg-secondary hover:text-fg')}>{c}</button>
                ))}
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {cat === 'All' ? <TemplateCard id="blank" title="Blank" description="Start from an empty page." needs={[]} thumb={[]} onPick={() => setPicked({ tpl: BLANK_TEMPLATE })} /> : null}
                {shown.map((t) => (
                    <TemplateCard key={t.id} id={t.id} title={t.name} description={t.description} chip={t.portfolio ? 'All sites' : undefined} needs={t.portfolio ? [] : t.needs.map((n) => NEED_LABEL[n])} thumb={thumbs[t.id]} onPick={() => setPicked({ tpl: t })} />
                ))}
                {(cat === 'My templates' || cat === 'All') ? mine.map((m) => (
                    <TemplateCard key={m.id} id={m.id} title={m.name} description={m.description || 'Your template'} chip="My template" needs={[]} thumb={m.preview} onPick={() => setPicked({ mine: m })} />
                )) : null}
            </div>

            <Modal open={Boolean(picked)} onOpenChange={(o) => !o && setPicked(null)} title={picked?.tpl?.name ?? picked?.mine?.name ?? ''} description={picked?.tpl?.description} size="md"
                footer={<><Button variant="ghost" onClick={() => setPicked(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create} disabled={!portfolio && sitesData?.connected === false}>Create dashboard</Button></>}>
                <div className="space-y-4">
                    {portfolio ? (
                        <p className="text-body text-fg-secondary">This dashboard covers <strong className="text-fg">all your sites</strong>.</p>
                    ) : sitesData?.connected === false ? (
                        <Banner variant="warn" title="Connect Google first" actions={<Button asChild size="sm" variant="secondary"><Link href="/dashboard/settings">Connect Google</Link></Button>}>We need your Search Console or Analytics access to fill the widgets.</Banner>
                    ) : (
                        <div className="space-y-1.5">
                            <p className="text-body-sm font-medium text-fg">Site</p>
                            <Select ariaLabel="Site" value={site?.siteId} onValueChange={setSiteId} placeholder="Loading sites…" className="w-full"
                                options={sites.map((s) => ({ value: s.siteId, label: `${s.label}${s.ga4 && s.gsc ? '' : s.gsc ? ' · Search Console only' : ' · Analytics only'}` }))} />
                            {missing.length ? <p className="text-meta text-fg-muted">{missing.map((m) => NEED_LABEL[m]).join(' and ')} is not linked for this site; those widgets will show how to link it.</p> : null}
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <label htmlFor="dash-name" className="text-body-sm font-medium text-fg">Name</label>
                        <input id="dash-name" value={name} placeholder={picked?.tpl?.name ?? picked?.mine?.name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} className="h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg" />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
