'use client';

/**
 * Appearance (round 2): theme gallery with live mini previews, the five theme options, the
 * white-label client kit (brand colour, logos, prepared for/by, footer) and the cover page.
 * Used by the editor's Dashboard settings and the Share dialog. Every change calls onChange
 * with a new ThemeV2; the dashboard behind re-renders at once (live preview).
 */
import { useState } from 'react';
import { Check, Palette, RotateCcw, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, Select, Switch } from '@/components/ui';
import { contrast, isHexColor } from '@/lib/builder/brand';
import { applyThemePreset, clientReportTheme, themeOptions, themePreset, THEMES, type Mode, type ThemeCard, type ThemeDensity, type ThemeFont, type ThemeId, type ThemePattern } from '@/lib/builder/themes';
import type { ThemeV2 } from '@/lib/builder/types';
import { ThemeSwatch } from './DashTheme';

const DENSITY_OPTS: Array<{ value: ThemeDensity; label: string }> = [{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'airy', label: 'Airy' }];
const CARD_OPTS: Array<{ value: ThemeCard; label: string }> = [{ value: 'elevated', label: 'Soft shadow' }, { value: 'outlined', label: 'Outlined' }, { value: 'flat', label: 'Flat' }, { value: 'ruled', label: 'Ruled (print)' }, { value: 'glass', label: 'Glass' }];
const PATTERN_OPTS: Array<{ value: ThemePattern; label: string }> = [{ value: 'none', label: 'Plain' }, { value: 'dots', label: 'Dots' }, { value: 'grid', label: 'Grid paper' }, { value: 'glow', label: 'Glow' }];
const FONT_OPTS: Array<{ value: ThemeFont; label: string }> = [{ value: 'geist', label: 'Geist' }, { value: 'system', label: 'System' }, { value: 'serif-headings', label: 'Serif headings' }, { value: 'mono-numbers', label: 'Mono numbers' }];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <p className="text-body-sm font-medium text-fg">{label}</p>
            {children}
            {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
        </div>
    );
}

function Text({ value, onChange, placeholder, label, max = 120 }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; max?: number }) {
    return <input aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.slice(0, max))} className="h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint" />;
}

/** Keeps a local draft while typing, commits valid https URLs (or empty). */
function UrlInput({ value, onCommit, label }: { value: string | undefined; onCommit: (v: string | undefined) => void; label: string }) {
    const [draft, setDraft] = useState(value ?? '');
    // Follow outside changes (undo, preset) without an effect: adjust state while rendering.
    const [synced, setSynced] = useState(value);
    if (value !== synced) { setSynced(value); setDraft(value ?? ''); }
    const bad = Boolean(draft) && !/^https:\/\/\S+$/i.test(draft);
    return (
        <div className="space-y-1">
            <input aria-label={label} value={draft} placeholder="https://…" onChange={(e) => { const v = e.target.value.trim(); setDraft(v); if (!v) onCommit(undefined); else if (/^https:\/\/\S+$/i.test(v)) onCommit(v.slice(0, 2000)); }}
                className={cn('h-9 w-full rounded-control border bg-surface px-3 text-body text-fg placeholder:text-fg-faint', bad ? 'border-down' : 'border-border')} />
            {bad ? <p className="text-meta text-down">Use an https:// address.</p> : null}
        </div>
    );
}

export function ThemeGallery({ value, mode, onPick, brand, compact }: { value: ThemeId; mode: Mode; onPick: (id: ThemeId) => void; brand?: string; compact?: boolean }) {
    return (
        <div role="radiogroup" aria-label="Theme" className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
            {THEMES.map((t) => {
                const on = t.id === value;
                // Each card shows the theme's signature look: Midnight is dark first (as in the New dashboard gallery).
                const m: Mode = t.preferredMode ?? (t.modes.includes(mode) ? mode : t.modes[0]);
                return (
                    <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(t.id)} title={`${t.name}: ${t.blurb}`}
                        className={cn('group relative flex flex-col overflow-hidden rounded-control border text-left transition-[border-color,box-shadow] duration-120',
                            on ? 'border-brand ring-2 ring-brand/30' : 'border-border-subtle hover:border-border-strong')}>
                        <div className="h-[76px] w-full"><ThemeSwatch id={t.id} mode={m} brand={t.id === 'studio' ? brand : undefined} /></div>
                        <div className="flex items-center gap-1 border-t border-border-subtle bg-surface px-2 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">{t.name}</span>
                            {on ? <Check aria-hidden size={14} className="shrink-0 text-brand-text" /> : null}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export function BrandColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
    const [draft, setDraft] = useState(value ?? '');
    const [synced, setSynced] = useState(value);
    if (value !== synced) { setSynced(value); setDraft(value ?? ''); }
    const ok = isHexColor(draft);
    const onWhite = ok ? contrast(draft, '#ffffff') : 0;
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <label className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-control border border-border" style={{ background: ok ? draft : undefined }}>
                    {!ok ? <Palette aria-hidden size={16} className="text-fg-muted" /> : null}
                    <input type="color" aria-label="Pick a brand colour" value={ok ? draft : '#3b4cca'} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
                <input aria-label="Brand colour (hex)" value={draft} placeholder="#3b4cca" maxLength={7}
                    onChange={(e) => { const v = e.target.value.trim(); setDraft(v); if (!v) onChange(undefined); else if (isHexColor(v)) onChange(v.toLowerCase()); }}
                    className={cn('h-9 w-28 rounded-control border bg-surface px-3 font-mono text-meta text-fg', draft && !ok ? 'border-down' : 'border-border')} />
                {value ? <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onChange(undefined)}>Reset</Button> : null}
            </div>
            <p className="text-meta text-fg-muted">{ok ? (onWhite < 3 ? 'Light colour: buttons and links use a darker shade of it so text stays readable.' : 'Buttons, links, the header rule and the cover use this colour, adjusted for contrast.') : 'One colour; we derive readable shades for light and dark.'}</p>
        </div>
    );
}

/**
 * The full Appearance section (editor). `onChange` receives the next theme.
 */
export function AppearanceSettings({ theme, mode, onChange, pages }: { theme: ThemeV2; mode: Mode; onChange: (t: ThemeV2) => void; pages: number }) {
    const o = themeOptions(theme);
    const preset = themePreset(o.id);
    const set = (patch: Partial<ThemeV2>) => onChange({ ...theme, ...patch });
    const brand = theme.brand ?? {};
    const cover = theme.cover;
    const setBrand = (patch: Partial<NonNullable<ThemeV2['brand']>>) => {
        const next = { ...brand, ...patch };
        for (const k of Object.keys(next) as Array<keyof typeof next>) if (next[k] === undefined || next[k] === '') delete next[k];
        set({ brand: Object.keys(next).length ? next : undefined });
    };
    const setCover = (patch: Partial<NonNullable<ThemeV2['cover']>>) => set({ cover: { enabled: false, layout: 'left', ...(cover ?? {}), ...patch } });
    return (
        <div className="space-y-4">
            <Row label="Theme" hint={`${preset.name}: ${preset.blurb} Best for ${preset.bestFor.toLowerCase()}.${preset.preferredMode && preset.preferredMode !== mode && preset.modes.includes(mode) ? ` In ${mode} mode it switches to its ${mode} colours.` : ''}`}>
                <ThemeGallery value={o.id} mode={mode} brand={brand.color} onPick={(id) => onChange(applyThemePreset(theme, id))} />
            </Row>
            <details className="group rounded-control border border-border-subtle">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-body-sm font-medium text-fg">Customize the theme<span className="text-caption text-fg-muted group-open:hidden">Density, cards, background, font</span></summary>
                <div className="space-y-3 border-t border-border-subtle p-3">
                    <Row label="Density"><Select size="sm" ariaLabel="Density" value={o.density} onValueChange={(v) => set({ density: v as ThemeDensity, id: theme.id ?? 'trafficclaw' })} options={DENSITY_OPTS} className="w-full" /></Row>
                    <Row label="Cards"><Select size="sm" ariaLabel="Card style" value={o.card} onValueChange={(v) => set({ card: v as ThemeCard, id: theme.id ?? 'trafficclaw' })} options={CARD_OPTS} className="w-full" /></Row>
                    <Row label="Background"><Select size="sm" ariaLabel="Background pattern" value={o.pattern} onValueChange={(v) => set({ pattern: v as ThemePattern, id: theme.id ?? 'trafficclaw' })} options={PATTERN_OPTS} className="w-full" /></Row>
                    <Row label="Font"><Select size="sm" ariaLabel="Font" value={o.font} onValueChange={(v) => set({ font: v as ThemeFont, id: theme.id ?? 'trafficclaw' })} options={FONT_OPTS} className="w-full" /></Row>
                    <p className="text-meta text-fg-muted">Metric colours stay the same in every theme, so clicks look like clicks everywhere. High contrast and Paper use their own tested sets.</p>
                </div>
            </details>

            <div className="space-y-3 rounded-control border border-border-subtle p-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-body-sm font-semibold text-fg">Client branding</p>
                    <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => onChange(clientReportTheme(theme))}>Client report preset</Button>
                </div>
                <Row label="Brand colour"><BrandColorInput value={brand.color} onChange={(c) => setBrand({ color: c })} /></Row>
                <Switch size="sm" checked={theme.header.show} onCheckedChange={(v) => set({ header: { ...theme.header, show: v } })} label="Header with logo and company name" />
                <Row label="Company name"><Text label="Company name" value={theme.header.companyName ?? ''} onChange={(v) => set({ header: { ...theme.header, companyName: v || undefined } })} /></Row>
                <Row label="Logo URL" hint="https only. A PNG or SVG with a transparent background looks best."><UrlInput label="Logo URL" value={theme.header.logoUrl} onCommit={(v) => set({ header: { ...theme.header, logoUrl: v } })} /></Row>
                <Row label="Logo for dark backgrounds (optional)"><UrlInput label="Logo for dark backgrounds" value={brand.logoDarkUrl} onCommit={(v) => setBrand({ logoDarkUrl: v })} /></Row>
                <div className="grid grid-cols-2 gap-2">
                    <Row label="Prepared for"><Text label="Prepared for" value={brand.preparedFor ?? ''} max={80} placeholder="Client name" onChange={(v) => setBrand({ preparedFor: v || undefined })} /></Row>
                    <Row label="Prepared by"><Text label="Prepared by" value={brand.preparedBy ?? ''} max={80} placeholder="Your agency" onChange={(v) => setBrand({ preparedBy: v || undefined })} /></Row>
                </div>
                <Row label="Footer note"><Text label="Footer note" value={brand.footer ?? ''} max={160} placeholder="Questions? hello@agency.com" onChange={(v) => setBrand({ footer: v || undefined })} /></Row>
                <Switch size="sm" checked={theme.badge.show} onCheckedChange={(v) => set({ badge: { show: v } })} label="Show “Made with TrafficClaw”" description="Free either way. The client report preset turns it off." />
            </div>

            <div className="space-y-3 rounded-control border border-border-subtle p-3">
                <Switch size="sm" checked={Boolean(cover?.enabled)} onCheckedChange={(v) => setCover({ enabled: v, title: cover?.title ?? '{{name}}', subtitle: cover?.subtitle ?? '{{date_range}}' })} label="Cover page" description={pages >= 3 ? 'Shown above the first page, with a contents list, and as the first PDF page.' : 'Shown above the first page and as the first PDF page.'} />
                {cover?.enabled ? (
                    <>
                        <Row label="Layout"><Select size="sm" ariaLabel="Cover layout" value={cover.layout} onValueChange={(v) => setCover({ layout: v as 'left' | 'center' | 'split' })} options={[{ value: 'left', label: 'Left aligned' }, { value: 'center', label: 'Centred' }, { value: 'split', label: 'Split with image' }]} className="w-full" /></Row>
                        <Row label="Title" hint="Use {{name}}, {{site}} and {{date_range}}."><Text label="Cover title" value={cover.title ?? ''} onChange={(v) => setCover({ title: v || undefined })} /></Row>
                        <Row label="Subtitle"><Text label="Cover subtitle" value={cover.subtitle ?? ''} onChange={(v) => setCover({ subtitle: v || undefined })} /></Row>
                        {cover.layout === 'split' ? <Row label="Image URL" hint="https only. Without an image the brand colour fills that side."><UrlInput label="Cover image URL" value={cover.imageUrl} onCommit={(v) => setCover({ imageUrl: v })} /></Row> : null}
                        <Switch size="sm" checked={Boolean(cover.showKpis)} onCheckedChange={(v) => setCover({ showKpis: v })} label="Key numbers on the cover" description="The first KPI strip of page one." />
                    </>
                ) : null}
            </div>
        </div>
    );
}
