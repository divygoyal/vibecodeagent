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

/**
 * Live mini preview of a theme: the real tokens (it carries the same attributes as a themed
 * dashboard), a header rule, three cards with a number, a line and bars.
 */
export function ThemeSwatch({ id, mode, brand, className }: { id: ThemeId; mode: Mode; brand?: string; className?: string }) {
    const p = THEMES.find((t) => t.id === id) ?? THEMES[0];
    const theme: ThemeV2 = { mode, header: { show: false, logoPosition: 'left', showDates: false }, badge: { show: false }, id, density: p.density, card: p.card, pattern: p.pattern, font: p.font, palette: p.palette, brand: brand ? { color: brand } : undefined };
    // TrafficClaw has no preset attributes by design; the swatch still needs a scope for its tokens.
    const r = dashRootProps(theme, mode) ?? { attrs: { 'data-dash-theme': 'trafficclaw', 'data-theme': mode, 'data-dash-card': 'elevated' }, mode };
    const o = themeOptions(theme);
    return (
        <div aria-hidden {...r.attrs} style={r.style} className={cn('pointer-events-none flex h-full w-full flex-col gap-1.5 overflow-hidden p-2', r.className, className)}>
            <div className="flex items-center gap-1.5" style={{ borderBottom: o.id === 'executive' || o.id === 'studio' ? '2px solid var(--tc-brand)' : o.id === 'paper' ? '1px solid var(--tc-fg)' : undefined, paddingBottom: 3 }}>
                <span className="h-1.5 w-8 rounded-full" style={{ background: 'var(--tc-fg)' }} />
                <span className="ml-auto h-1.5 w-4 rounded-full" style={{ background: 'var(--tc-brand)' }} />
            </div>
            <div className="grid flex-1 grid-cols-3 gap-1.5">
                {[0, 1, 2].map((i) => (
                    <div key={i} data-dash-widget="" className="flex flex-col justify-between border p-1.5" style={{ background: 'var(--tc-surface)', borderColor: 'var(--tc-border-subtle)', boxShadow: 'var(--tc-shadow-card)' }}>
                        <span className="h-1 w-5 rounded-full" style={{ background: 'var(--tc-fg-muted)' }} />
                        <span className="h-2 w-7 rounded-sm" style={{ background: 'var(--tc-fg)' }} />
                        {i === 0 ? (
                            <svg viewBox="0 0 40 12" className="h-3 w-full"><polyline fill="none" stroke="var(--color-m-clicks)" strokeWidth={1.6} points="0,10 7,7 13,8 20,4 27,6 33,2 40,3" /></svg>
                        ) : i === 1 ? (
                            <svg viewBox="0 0 40 12" className="h-3 w-full"><polyline fill="none" stroke="var(--color-m-users)" strokeWidth={1.6} points="0,8 7,9 13,5 20,6 27,3 33,5 40,1" /></svg>
                        ) : (
                            <div className="flex h-3 items-end gap-0.5">{[5, 9, 7, 11, 6].map((h, j) => <span key={j} className="w-1.5 rounded-[1px]" style={{ height: h, background: `var(--color-cat-${j + 1})` }} />)}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
