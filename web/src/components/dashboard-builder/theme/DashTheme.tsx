'use client';

/**
 * Themed dashboard root (round 2). `dashRootProps` returns the attributes, brand style and font
 * class for a dashboard's root element, or null for the default look: callers spread nothing
 * then, so a dashboard without a theme keeps today's DOM and pixels.
 */
import './dashboard-themes.css';

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { brandStyle } from '@/lib/builder/brand';
import { dashThemeAttrs, themeOptions, THEMES, type Mode, type ThemeId } from '@/lib/builder/themes';
import type { ThemeV2 } from '@/lib/builder/types';
import { sourceSerif } from './fonts';

export interface DashRoot {
    attrs: Record<string, string>;
    style?: CSSProperties;
    className?: string;
    mode: Mode;
}

export function dashRootProps(theme: ThemeV2, mode: Mode): DashRoot | null {
    const attrs = dashThemeAttrs(theme, mode);
    if (!attrs) return null;
    const m = attrs['data-theme'] as Mode;
    const style = brandStyle(theme.brand?.color, attrs['data-dash-theme'], m) as CSSProperties | undefined;
    const className = attrs['data-dash-font'] === 'serif-headings' ? sourceSerif.variable : undefined;
    return { attrs, style, className, mode: m };
}

/** A wrapper element with the theme applied (no wrapper at all for the default look). */
export function DashThemeRoot({ theme, mode, className, style, children, extra }: { theme: ThemeV2; mode: Mode; className?: string; style?: CSSProperties; children: ReactNode; extra?: Record<string, string> }) {
    const r = dashRootProps(theme, mode);
    if (!r) return <>{children}</>;
    return <div {...r.attrs} {...extra} style={{ ...r.style, ...style }} className={cn(r.className, className)}>{children}</div>;
}

/** Chart strokes per theme, as in dashboard-themes.css section 5 (scaled to the thumbnail). */
const SWATCH_STROKE: Partial<Record<ThemeId, number>> = { analyst: 1.1, contrast: 2.2, midnight: 1.9, paper: 1.1 };

/**
 * Live mini dashboard of a theme (round 5, audit #22): drawn from that theme's own tokens, so every
 * card shows its real canvas and pattern, card style (shadow, outline, rule, glass, accent bar),
 * heading and number fonts, number size, accent colour, density and chart palette. It carries the
 * same attributes as a themed dashboard plus `data-dash-swatch`, which scales radii, patterns and the
 * glow down to thumbnail size (dashboard-themes.css section 9). Midnight is shown in its dark
 * first look (like the New dashboard gallery).
 */
export function ThemeSwatch({ id, mode, brand, className }: { id: ThemeId; mode: Mode; brand?: string; className?: string }) {
    const p = THEMES.find((t) => t.id === id) ?? THEMES[0];
    const theme: ThemeV2 = { mode, header: { show: false, logoPosition: 'left', showDates: false }, badge: { show: false }, id, density: p.density, card: p.card, pattern: p.pattern, font: p.font, palette: p.palette, brand: brand ? { color: brand } : undefined };
    // TrafficClaw has no preset attributes by design; the swatch still needs a scope for its tokens.
    const r = dashRootProps(theme, mode) ?? { attrs: { 'data-dash-theme': 'trafficclaw', 'data-theme': mode, 'data-dash-card': 'elevated', 'data-dash-density': 'comfortable', 'data-dash-pattern': 'none', 'data-dash-font': 'geist', 'data-dash-palette': 'standard' }, mode };
    const o = themeOptions(theme);
    const gap = o.density === 'compact' ? 3 : o.density === 'airy' ? 6 : 4;
    const stroke = SWATCH_STROKE[o.id] ?? 1.5;
    const contrastPalette = o.palette === 'contrast';
    const card = 'flex min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card';
    return (
        <div aria-hidden data-dash-swatch="" {...r.attrs} style={{ ...r.style, gap, padding: gap + 3 }} className={cn('pointer-events-none flex h-full w-full flex-col overflow-hidden', r.className, className)}>
            <div data-dash-header="" className="flex shrink-0 items-center gap-1.5" style={{ paddingBottom: 3 }}>
                <span className="text-[11px] font-semibold leading-none" style={{ color: 'var(--tc-fg)', fontFamily: 'var(--tc-dash-font-heading, inherit)' }}>Aa</span>
                <span className="h-1 w-6 rounded-full" style={{ background: 'var(--tc-fg-muted)', opacity: 0.6 }} />
                <span className="ml-auto h-2 w-5 rounded-[3px]" style={{ background: 'var(--tc-brand)' }} />
            </div>
            <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '1fr 1.45fr', gap }}>
                <div data-dash-widget="" className={cn(card, 'justify-between p-1')}>
                    <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: 'var(--tc-m-clicks)' }} />
                    <span data-swatch-num="" className="truncate font-semibold leading-none tabular-nums" style={{ color: 'var(--tc-fg)' }}>8.2K</span>
                    <span className="flex items-center gap-0.5 text-[7px] font-medium leading-none" style={{ color: 'var(--tc-up)' }}>
                        <svg viewBox="0 0 6 5" className="size-[5px]"><path d="M3 0 6 5H0z" fill="currentColor" /></svg>8%
                    </span>
                </div>
                <div data-dash-widget="" className={cn(card, 'p-1')}>
                    <svg viewBox="0 0 60 26" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                        {o.id === 'executive' ? null : [7, 14, 21].map((y) => <line key={y} x1="0" x2="60" y1={y} y2={y} stroke="var(--tc-chart-grid)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
                        {o.id === 'paper' ? null : <polygon points="0,20 10,15 20,17 30,9 40,12 50,5 60,7 60,26 0,26" fill="var(--color-m-clicks)" style={{ fillOpacity: 'calc(var(--tc-chart-fill-top, 10%) * 2)' }} />}
                        <polyline fill="none" stroke="var(--color-m-users)" strokeWidth={stroke * 0.8} strokeDasharray={contrastPalette ? '3 2' : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" points="0,23 10,21 20,22 30,18 40,19 50,15 60,16" />
                        <polyline fill="none" stroke="var(--color-m-clicks)" strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinejoin="round" points="0,20 10,15 20,17 30,9 40,12 50,5 60,7" />
                    </svg>
                </div>
            </div>
        </div>
    );
}
