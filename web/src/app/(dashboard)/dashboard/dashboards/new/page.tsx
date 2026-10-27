'use client';

/**
 * Template gallery (BUILDER.md 11.1 and 12, round 2): Blank + 24 templates + My templates.
 * Search, categories with counts, "New" badges, wireframe thumbnails drawn from each template's
 * own layout and demo-data shapes, shown in the template's suggested theme. Picking one asks
 * for the site, the name and the theme.
 */
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { Badge, Banner, Button, EmptyState, Modal, SearchInput, Select } from '@/components/ui';
import { Thumbnail, type ThumbItem } from '@/components/dashboard-builder/Thumbnail';
import { DashThemeRoot } from '@/components/dashboard-builder/theme/DashTheme';
import { fetchJson } from '@/components/dashboard-builder/useWidgetData';
import { BLANK_TEMPLATE, TEMPLATES, buildFromTemplate, type TemplateCategory, type TemplateMeta } from '@/lib/builder/templates';
import { applyThemePreset, isThemeId, themePreset, THEMES, type ThemeId } from '@/lib/builder/themes';
import type { DashboardRecord, ThemeV2 } from '@/lib/builder/types';
import PREVIEWS from '@/lib/builder/templatePreviews.json';
import type { SiteOption } from '@/components/dashboard-builder/editor/Fields';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { useResolvedTheme } from '@/lib/theme';

type Cat = 'All' | 'New' | TemplateCategory | 'My templates';
const CATEGORY_ORDER: TemplateCategory[] = ['Overview', 'Search', 'Traffic', 'Content', 'AI', 'Ecommerce', 'Local', 'Leads', 'Reporting', 'Portfolio', 'Display'];

function thumbFor(id: string): { items: ThumbItem[]; pages: number; theme: ThemeV2 } {
    const doc = buildFromTemplate(id, { name: 'x', defaultSource: { type: 'portfolio', include: 'all' } });
    const page = doc.pages[0];
    const items = page.layouts.lg.map((l) => {
        const w = doc.widgets[l.i];
        const metric = w.type === 'scorecard' || w.type === 'pie' || w.type === 'geo' ? w.config.metric.id
            : w.type === 'kpi-strip' || w.type === 'bar' || w.type === 'portfolio-grid' ? w.config.metrics[0]?.id
                : w.type === 'timeseries' ? w.config.series[0]?.metric.id
                    : w.type === 'table' ? w.config.columns.find((c) => c.kind === 'metric')?.ref : undefined;
        return { x: l.x, y: l.y, w: l.w, h: l.h, type: w.type, metric, values: (PREVIEWS as Record<string, Record<string, number[]>>)[id]?.[l.i] };
    });
    return { items, pages: doc.pages.length, theme: doc.theme };
}

const NEED_LABEL = { gsc: 'Search Console', ga4: 'Analytics' } as const;

function TemplateCard({ id, title, description, audience, needs, onPick, thumb, chip, isNew, pages, theme, mode }: {
    id: string; title: string; description: string; audience?: string; needs: string[]; onPick: () => void; thumb: ThumbItem[]; chip?: string; isNew?: boolean; pages?: number; theme?: ThemeV2; mode: 'light' | 'dark';
}) {
    const themeName = theme?.id ? themePreset(theme.id).name : null;
    const art = thumb.length ? <Thumbnail items={thumb} className="w-full" /> : <span className="m-auto flex size-12 items-center justify-center rounded-card border border-dashed border-border-strong text-fg-muted"><Plus aria-hidden size={20} /></span>;
    return (
        <button type="button" onClick={onPick} className="group flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface text-left shadow-card transition-[box-shadow,border-color,transform] duration-120 hover:-translate-y-px hover:border-border hover:shadow-card-hover" data-template={id}>
            {theme && theme.id ? (
                <DashThemeRoot theme={theme} mode={mode} className="flex aspect-[16/10] items-start justify-center overflow-hidden border-b border-border-subtle p-4">{art}</DashThemeRoot>
            ) : (
                <div className="flex aspect-[16/10] items-start justify-center overflow-hidden border-b border-border-subtle bg-surface-sunken p-4">{art}</div>
            )}
            <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="flex items-center gap-2">
                    <h2 className="min-w-0 truncate text-title-sm text-fg">{title}</h2>
                    {isNew ? <Badge variant="brand" className="shrink-0">New</Badge> : null}
                </div>
                <p className="text-body-sm text-fg-muted">{description}</p>
                {audience ? <p className="text-meta text-fg-secondary">For {audience.charAt(0).toLowerCase()}{audience.slice(1)}</p> : null}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {chip ? <Badge variant="neutral">{chip}</Badge> : null}
                    {needs.map((n) => <Badge key={n} variant="outline">{n}</Badge>)}
                    {pages && pages > 1 ? <Badge variant="outline">{pages} pages</Badge> : null}
                    {themeName ? <Badge variant="neutral">{themeName} theme</Badge> : null}
                </div>
            </div>
        </button>
    );
}

export default function NewDashboardPage() {
    return <Suspense fallback={null}><Gallery /></Suspense>;
}

interface Mine { id: string; name: string; description: string; isTemplate: boolean; preview: ThumbItem[] }

function matches(t: TemplateMeta, q: string): boolean {
    if (!q) return true;
    const hay = `${t.name} ${t.description} ${t.audience ?? ''} ${t.category}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
}

function Gallery() {
    const router = useRouter();
    const sp = useSearchParams();
    const mode = useResolvedTheme();
    const [cat, setCat] = useState<Cat>('All');
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState<{ tpl?: TemplateMeta; mine?: Mine } | null>(() => {
        const t = sp.get('template');
        const meta = t ? TEMPLATES.find((x) => x.id === t) : undefined;
        return meta ? { tpl: meta } : null;
    });
    const [name, setName] = useState('');
    const [siteId, setSiteId] = useState<string | undefined>(undefined);
    const [themeChoice, setThemeChoice] = useState<ThemeId | null>(null);
    const [busy, setBusy] = useState(false);
    const { data: sitesData } = useSWR<{ connected: boolean; sites: SiteOption[] }>('/api/dashboards/sites', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const { data: mineData } = useSWR<{ dashboards: Mine[] }>('/api/dashboards', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const sites = sitesData?.sites ?? [];
    const mine = (mineData?.dashboards ?? []).filter((d) => d.isTemplate);
    const thumbs = useMemo(() => Object.fromEntries([BLANK_TEMPLATE, ...TEMPLATES].map((t) => [t.id, thumbFor(t.id)])), []);
    const needle = q.trim().toLowerCase();
    const searched = TEMPLATES.filter((t) => matches(t, needle));
    const counts = useMemo(() => {
        const c: Record<string, number> = { All: searched.length, New: searched.filter((t) => t.isNew).length, 'My templates': mine.length };
        for (const t of searched) c[t.category] = (c[t.category] ?? 0) + 1;
        return c;
    }, [searched, mine.length]);
    const cats: Cat[] = ['All', 'New', ...CATEGORY_ORDER.filter((x) => counts[x]), ...(mine.length ? ['My templates' as const] : [])];
    const shown = cat === 'All' ? searched : cat === 'New' ? searched.filter((t) => t.isNew) : cat === 'My templates' ? [] : searched.filter((t) => t.category === cat);
    const portfolio = Boolean(picked?.tpl?.portfolio);
    const current = useCurrentSite().site;
    const currentOption = current ? sites.find((s) => (current.gscSiteUrl && s.gsc === current.gscSiteUrl) || (current.ga4PropertyId && s.ga4 === current.ga4PropertyId)) : undefined;
    const site = sites.find((s) => s.siteId === siteId) ?? currentOption ?? sites.find((s) => s.ga4 && s.gsc) ?? sites[0];
    const missing = picked?.tpl && site ? picked.tpl.needs.filter((n) => (n === 'ga4' ? !site.ga4 : !site.gsc)) : [];
    const suggested: ThemeId = (picked?.tpl?.themeId && isThemeId(picked.tpl.themeId) ? picked.tpl.themeId : 'trafficclaw');
    const themeId = themeChoice ?? suggested;

    const pick = (p: { tpl?: TemplateMeta; mine?: Mine }) => { setThemeChoice(null); setPicked(p); };

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
                id = (await fetchJson<{ dashboard: DashboardRecord }>('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: finalName, templateId: picked.tpl!.id, siteId: portfolio ? undefined : site?.siteId, portfolio, ...(themeChoice ? { themeId: themeChoice } : {}) }) })).dashboard.id;
            }
            router.push(`/dashboard/dashboards/${id}/edit`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not create the dashboard');
            setBusy(false);
        }
    };

    const pickedThumb = picked?.tpl ? thumbs[picked.tpl.id] : undefined;
    const previewTheme = pickedThumb ? applyThemePreset(pickedThumb.theme, themeId) : undefined;

    return (
        <div className="flex flex-col gap-6">
            <div>
                <Link href="/dashboard/dashboards" className="tap-area inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-fg"><ArrowLeft aria-hidden size={14} />Dashboards</Link>
                <h1 className="mt-2 text-heading text-fg">New dashboard</h1>
                <p className="mt-1 max-w-[720px] text-body text-fg-muted">Pick a starting point: {TEMPLATES.length} templates for search, traffic, AI visits, shops, local businesses and client reports. You can change every widget and the theme later.</p>
            </div>
            <div className="flex flex-col gap-3">
                <SearchInput value={q} onValueChange={setQ} placeholder="Search templates (SEO, AI, client report…)" className="w-full sm:w-96" />
                <div role="tablist" aria-label="Template categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                    {cats.map((c) => (
                        <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
                            className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-body-sm font-medium transition-colors', cat === c ? 'bg-brand text-brand-fg' : 'bg-subtle text-fg-secondary hover:text-fg')}>
                            {c}
                            <span className={cn('text-caption tabular-nums', cat === c ? 'text-brand-fg/80' : 'text-fg-muted')}>{counts[c] ?? 0}</span>
                        </button>
                    ))}
                </div>
            </div>
            {!shown.length && cat !== 'My templates' && !(cat === 'All' && !needle) ? (
                <EmptyState variant="card" title="No template matches" description={`Nothing for “${q}”. Try “search”, “AI” or “report”, or start from Blank.`} actions={<Button variant="secondary" onClick={() => { setQ(''); setCat('All'); }}>Show all templates</Button>} />
            ) : null}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {cat === 'All' && !needle ? <TemplateCard id="blank" title="Blank" description="Start from an empty page." needs={[]} thumb={[]} mode={mode} onPick={() => pick({ tpl: BLANK_TEMPLATE })} /> : null}
                {shown.map((t) => (
                    <TemplateCard key={t.id} id={t.id} title={t.name} description={t.description} audience={t.audience} isNew={t.isNew} pages={thumbs[t.id].pages} theme={thumbs[t.id].theme} mode={mode}
                        chip={t.portfolio ? 'All sites' : undefined} needs={t.portfolio ? [] : t.needs.map((n) => NEED_LABEL[n])} thumb={thumbs[t.id].items} onPick={() => pick({ tpl: t })} />
                ))}
                {(cat === 'My templates' || (cat === 'All' && !needle)) ? mine.map((m) => (
                    <TemplateCard key={m.id} id={m.id} title={m.name} description={m.description || 'Your template'} chip="My template" needs={[]} thumb={m.preview} mode={mode} onPick={() => pick({ mine: m })} />
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
                    {picked?.tpl && picked.tpl.id !== 'blank' && pickedThumb && previewTheme ? (
                        <div className="space-y-1.5">
                            <p className="text-body-sm font-medium text-fg">Theme</p>
                            <div className="flex items-stretch gap-3">
                                <DashThemeRoot theme={previewTheme} mode={mode} className="flex w-40 shrink-0 items-start overflow-hidden rounded-control border border-border-subtle p-2">
                                    {previewTheme.id ? <Thumbnail items={pickedThumb.items} className="w-full" /> : <div className="w-full rounded-md bg-surface-sunken p-2"><Thumbnail items={pickedThumb.items} className="w-full" /></div>}
                                </DashThemeRoot>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Select ariaLabel="Theme" value={themeId} onValueChange={(v) => setThemeChoice(v as ThemeId)} className="w-full"
                                        options={THEMES.map((t) => ({ value: t.id, label: `${t.name}${t.id === suggested ? ' (suggested)' : ''}${t.id === 'trafficclaw' ? ', today’s look' : ''}` }))} />
                                    <p className="text-meta text-fg-muted">{themePreset(themeId).blurb} Change it any time in Dashboard settings.</p>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}
