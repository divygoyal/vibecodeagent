'use client';

/**
 * Share dialog (BUILDER.md 11.7, DESIGN.md 5.10): Link | Embed | Appearance.
 * Public link with optional password and expiry, viewer permissions, "allow copies", reset link,
 * preview as viewer; iframe embed with auto-height listener; logo, company name and badge.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, KeyRound, MonitorPlay, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Banner, Button, Checkbox, Modal, SegmentedControl, Select, Switch, Tabs } from '@/components/ui';
import { applyThemePreset, clientReportTheme, themeOptions } from '@/lib/builder/themes';
import type { DashboardDocV2, ShareState } from '@/lib/builder/types';
import { useResolvedTheme } from '@/lib/theme';
import { BrandColorInput, ThemeGallery } from './theme/AppearanceSettings';
import { fetchJson } from './useWidgetData';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dashboardId: string;
    doc: DashboardDocV2;
    share: ShareState;
    views?: number;
    onShareChange: (share: ShareState) => void;
    /** Save appearance changes (theme header/badge) into the doc. */
    onDocChange: (doc: DashboardDocV2) => void;
}

const EXPIRY = [
    { value: 'never', label: 'Never expires' },
    { value: '7', label: 'Expires in 7 days' },
    { value: '30', label: 'Expires in 30 days' },
    { value: '90', label: 'Expires in 90 days' },
] as const;

function CopyField({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex items-stretch gap-2">
            <input readOnly aria-label={label} value={value} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface-sunken px-3 font-mono text-meta text-fg" />
            <Button variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(value); toast.success('Copied'); }}>Copy</Button>
        </div>
    );
}

export function ShareDialog({ open, onOpenChange, dashboardId, doc, share, views, onShareChange, onDocChange }: Props) {
    const [tab, setTab] = useState<'link' | 'embed' | 'appearance'>('link');
    const [busy, setBusy] = useState(false);
    const [pw, setPw] = useState('');
    const [pwOpen, setPwOpen] = useState(false);
    const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('light');
    const [embedHeight, setEmbedHeight] = useState('800');
    const appMode = useResolvedTheme();
    const [company, setCompany] = useState(doc.theme.header.companyName ?? '');
    const [logo, setLogo] = useState(doc.theme.header.logoUrl ?? '');
    useEffect(() => {
        setCompany(doc.theme.header.companyName ?? '');
        setLogo(doc.theme.header.logoUrl ?? '');
    }, [doc.theme.header.companyName, doc.theme.header.logoUrl]);

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://trafficclaw.com';
    const link = share.token ? `${origin}/view/${share.token}` : '';
    const embedUrl = share.token ? `${origin}/embed/d/${share.token}?theme=${embedTheme}` : '';
    const snippet = useMemo(() => [
        `<iframe id="tc-dashboard" src="${embedUrl}" width="100%" height="${embedHeight}" style="border:0" loading="lazy" title="${doc.name.replace(/"/g, '')}"></iframe>`,
        '<script>',
        "window.addEventListener('message', function (e) {",
        "  if (!e.data || e.data.type !== 'tc:dimensions') return;",
        "  var f = document.getElementById('tc-dashboard');",
        "  if (f && e.source === f.contentWindow) f.style.height = e.data.height + 'px';",
        '});',
        '</script>',
    ].join('\n'), [embedUrl, embedHeight, doc.name]);
    const portfolioSites = doc.defaultSource.type === 'portfolio' || Object.values(doc.widgets).some((w) => w.source?.type === 'portfolio');

    const call = async (fn: () => Promise<{ share?: ShareState }>, ok?: string) => {
        setBusy(true);
        try {
            const r = await fn();
            if (r.share) onShareChange(r.share);
            if (ok) toast.success(ok);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };
    const put = (body: Record<string, unknown>, ok?: string) => call(() => fetchJson(`/api/dashboards/${dashboardId}/share`, { method: 'PUT', body: JSON.stringify(body) }), ok);
    const togglePublic = (on: boolean) => call(async () => {
        if (on) return fetchJson<{ share: ShareState }>(`/api/dashboards/${dashboardId}/share`, { method: 'POST' });
        await fetchJson(`/api/dashboards/${dashboardId}/share`, { method: 'DELETE' });
        return { share: { ...share, enabled: false, token: null } };
    }, on ? 'Public link is on' : 'Sharing turned off');

    const expiryValue = share.expiresAt ? String(Math.max(1, Math.round((Date.parse(share.expiresAt) - Date.now()) / 86_400_000))) : 'never';
    const expirySelect = EXPIRY.some((e) => e.value === expiryValue) ? expiryValue : share.expiresAt ? 'custom' : 'never';

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Share dashboard" description={doc.name} size="lg">
            <Tabs variant="pills" ariaLabel="Share options" value={tab} onValueChange={(v) => setTab(v as typeof tab)} items={[{ value: 'link', label: 'Link' }, { value: 'embed', label: 'Embed' }, { value: 'appearance', label: 'Appearance' }]} className="mb-4" />

            {tab === 'link' ? (
                <div className="space-y-4">
                    <Switch checked={share.enabled} onCheckedChange={togglePublic} disabled={busy} label="Public link" description="Anyone with the link can view. Data stays live (cached up to 10 minutes)." />
                    {share.enabled && share.token ? (
                        <>
                            <CopyField value={link} label="Public link" />
                            {portfolioSites ? <Banner variant="warn">This dashboard shows several sites. Viewers will see their names.</Banner> : null}
                            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <p className="text-body-sm font-medium text-fg">Expiry</p>
                                    <Select
                                        ariaLabel="Expiry"
                                        value={expirySelect === 'custom' ? undefined : expirySelect}
                                        placeholder={share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}` : undefined}
                                        onValueChange={(v) => put({ expiresAt: v === 'never' ? '' : new Date(Date.now() + Number(v) * 86_400_000).toISOString() }, 'Expiry saved')}
                                        options={EXPIRY.map((e) => ({ value: e.value, label: e.label }))}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-body-sm font-medium text-fg">Password</p>
                                    {share.hasPassword && !pwOpen ? (
                                        <div className="flex gap-2">
                                            <Button variant="secondary" icon={KeyRound} onClick={() => setPwOpen(true)}>Change</Button>
                                            <Button variant="ghost" onClick={() => put({ password: '' }, 'Password removed')}>Remove</Button>
                                        </div>
                                    ) : pwOpen || !share.hasPassword ? (
                                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pw.length >= 6) { void put({ password: pw }, 'Password set').then(() => { setPw(''); setPwOpen(false); }); } }}>
                                            <input type="password" aria-label="Password" placeholder="At least 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-body text-fg" />
                                            <Button type="submit" variant="secondary" disabled={pw.length < 6 || busy}>Set</Button>
                                        </form>
                                    ) : null}
                                    <p className="text-meta text-fg-muted">Viewers type it once; access lasts 24 hours.</p>
                                </div>
                            </div>
                            <fieldset className="space-y-2">
                                <legend className="mb-1 text-body-sm font-medium text-fg">Viewers can change</legend>
                                <div className="flex flex-wrap gap-4">
                                    <Checkbox checked={share.viewerControls.date} onCheckedChange={(v) => put({ viewerControls: { date: v } })} label="Date range" />
                                    <Checkbox checked={share.viewerControls.compare} onCheckedChange={(v) => put({ viewerControls: { compare: v } })} label="Comparison" />
                                    <Checkbox checked={share.viewerControls.filters} onCheckedChange={(v) => put({ viewerControls: { filters: v } })} label="Filters" />
                                </div>
                            </fieldset>
                            <Switch checked={share.allowCopy} onCheckedChange={(v) => put({ allowCopy: v })} label="Allow viewers to copy this dashboard" description="Signed-in viewers can use it as a template for their own site. Your data is never copied." />
                            <Switch checked={Boolean(doc.settings.shareNotes)} onCheckedChange={(v) => onDocChange({ ...doc, settings: { ...doc.settings, shareNotes: v || undefined } })} label="Show my chart notes" description="Notes you add to your site charts show on this link’s time series. Off: viewers see Google update markers only." />
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                                <p className="text-meta text-fg-muted">{views ?? 0} view{views === 1 ? '' : 's'}</p>
                                <div className="flex gap-2">
                                    <Button variant="ghost" icon={RotateCcw} disabled={busy} onClick={() => call(() => fetchJson(`/api/dashboards/${dashboardId}/share/rotate`, { method: 'POST' }), 'New link created. The old link no longer works.')}>Reset link</Button>
                                    <Button asChild variant="secondary" icon={ExternalLink}><a href={`/view/${share.token}?preview=1`} target="_blank" rel="noopener noreferrer">Preview as viewer</a></Button>
                                </div>
                            </div>
                            <div className="space-y-1.5 border-t border-border-subtle pt-3">
                                <p className="flex items-center gap-1.5 text-body-sm font-medium text-fg"><MonitorPlay aria-hidden size={14} />TV link</p>
                                <CopyField value={`${link}?tv=1`} label="TV link" />
                                <p className="text-meta text-fg-muted">Full screen for an office screen: no buttons, pages rotate, data refreshes on its own.</p>
                            </div>
                        </>
                    ) : null}
                </div>
            ) : null}

            {tab === 'embed' ? (
                <div className="space-y-4">
                    {!share.enabled ? <Banner variant="info">Turn on the public link first.</Banner> : (
                        <>
                            <Switch checked={share.embed.enabled} onCheckedChange={(v) => put({ embedEnabled: v }, v ? 'Embedding on' : 'Embedding off')} label="Allow embedding" description="Show this dashboard inside another website with an iframe." />
                            <div className="flex flex-wrap items-center gap-3">
                                <SegmentedControl ariaLabel="Embed theme" variant="neutral" size="sm" value={embedTheme} onChange={setEmbedTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
                                <label className="flex items-center gap-2 text-body-sm text-fg-secondary">Height <input aria-label="Embed height" value={embedHeight} onChange={(e) => setEmbedHeight(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-body-sm text-fg" /> px</label>
                            </div>
                            {share.embed.enabled ? (
                                <>
                                    <textarea readOnly aria-label="Embed code" value={snippet} rows={8} className="w-full rounded-control border border-border bg-surface-sunken p-3 font-mono text-meta text-fg" onFocus={(e) => e.currentTarget.select()} />
                                    <div className="flex justify-end"><Button variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(snippet); toast.success('Embed code copied'); }}>Copy code</Button></div>
                                    <p className="text-meta text-fg-muted">The embed resizes itself with the 6-line listener above. A password-protected embed asks once per browser tab.</p>
                                    {/* Live preview at 50% (DESIGN 5.10). */}
                                    <div>
                                        <p className="mb-1.5 text-body-sm font-medium text-fg">Preview</p>
                                        <div className="h-[260px] overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
                                            <iframe title="Embed preview" src={embedUrl} loading="lazy" className="pointer-events-none h-[520px] w-[200%] origin-top-left scale-50 border-0" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="text-body-sm text-fg-muted">Turn on “Allow embedding” to get the embed code and a preview.</p>
                            )}
                        </>
                    )}
                </div>
            ) : null}

            {tab === 'appearance' ? (
                <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-body-sm font-medium text-fg">Theme</p>
                        <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => { onDocChange({ ...doc, theme: clientReportTheme(doc.theme) }); toast.success('Client report look applied'); }}>Client report preset</Button>
                    </div>
                    <ThemeGallery compact value={themeOptions(doc.theme).id} mode={appMode} brand={doc.theme.brand?.color} onPick={(id) => onDocChange({ ...doc, theme: applyThemePreset(doc.theme, id) })} />
                    <p className="text-meta text-fg-muted">The dashboard behind this window updates as you pick. Shared links and embeds use the same theme.</p>
                </div>
                <div className="space-y-1.5">
                    <p className="text-body-sm font-medium text-fg">Brand colour</p>
                    <BrandColorInput value={doc.theme.brand?.color} onChange={(c) => { const brand = { ...(doc.theme.brand ?? {}), color: c }; if (!c) delete brand.color; onDocChange({ ...doc, theme: { ...doc.theme, brand: Object.keys(brand).length ? brand : undefined } }); }} />
                </div>
                <Switch checked={Boolean(doc.theme.cover?.enabled)} onCheckedChange={(v) => onDocChange({ ...doc, theme: { ...doc.theme, cover: { layout: 'left', title: '{{name}}', subtitle: '{{date_range}}', ...(doc.theme.cover ?? {}), enabled: v } } })} label="Cover page" description="A title page above page one and on the first PDF page. Edit the text in Dashboard settings." />
                <form className="space-y-4 border-t border-border-subtle pt-4" onSubmit={(e) => {
                    e.preventDefault();
                    const logoOk = !logo || /^https:\/\//i.test(logo);
                    if (!logoOk) { toast.error('Logo must be an https URL'); return; }
                    onDocChange({ ...doc, theme: { ...doc.theme, header: { ...doc.theme.header, show: Boolean(company || logo) || doc.theme.header.show, companyName: company || undefined, logoUrl: logo || undefined } } });
                    toast.success('Appearance saved');
                }}>
                    <label className="block space-y-1.5"><span className="text-body-sm font-medium text-fg">Company name</span>
                        <input value={company} onChange={(e) => setCompany(e.target.value.slice(0, 120))} className="h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg" />
                    </label>
                    <label className="block space-y-1.5"><span className="text-body-sm font-medium text-fg">Logo URL (https)</span>
                        <input value={logo} onChange={(e) => setLogo(e.target.value.trim())} placeholder="https://…/logo.png" className="h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg" />
                    </label>
                    <Switch checked={doc.theme.badge.show} onCheckedChange={(v) => { onDocChange({ ...doc, theme: { ...doc.theme, badge: { show: v } } }); void put({ badge: v }); }} label="Show “Made with TrafficClaw”" description="Free either way." />
                    <p className="text-meta text-fg-muted">Metric colours stay the same in every theme so they mean the same everywhere.</p>
                    <div className="flex justify-end"><Button type="submit" variant="primary">Save</Button></div>
                </form>
                </div>
            ) : null}
        </Modal>
    );
}
