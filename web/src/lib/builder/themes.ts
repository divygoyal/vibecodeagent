/**
 * Dashboard themes (round 2, builder-templates-themes.md part B). Isomorphic and dependency free.
 *
 * A theme is one of eight named presets plus five independent options (density, card, pattern,
 * font, palette) and an optional brand colour. Everything is optional in the document: a doc
 * without `theme.id` (or with the defaults) renders exactly as before, with no wrapper attributes
 * at all, so today's dashboards keep every pixel. Picking a preset snapshots its option defaults
 * into the doc, so a later change to this registry never restyles an old dashboard.
 */
import type { ThemeV2 } from './types';

export type ThemeId = 'trafficclaw' | 'executive' | 'analyst' | 'midnight' | 'paper' | 'sunrise' | 'studio' | 'contrast';
export type ThemeDensity = 'compact' | 'comfortable' | 'airy';
export type ThemeCard = 'elevated' | 'outlined' | 'flat' | 'ruled' | 'glass';
export type ThemePattern = 'none' | 'dots' | 'grid' | 'glow';
export type ThemeFont = 'geist' | 'system' | 'serif-headings' | 'mono-numbers';
export type ThemePalette = 'standard' | 'contrast';
export type Mode = 'light' | 'dark';

export const THEME_IDS: ThemeId[] = ['trafficclaw', 'executive', 'analyst', 'midnight', 'paper', 'sunrise', 'studio', 'contrast'];
export const DENSITIES: ThemeDensity[] = ['compact', 'comfortable', 'airy'];
export const CARDS: ThemeCard[] = ['elevated', 'outlined', 'flat', 'ruled', 'glass'];
export const PATTERNS: ThemePattern[] = ['none', 'dots', 'grid', 'glow'];
export const FONTS: ThemeFont[] = ['geist', 'system', 'serif-headings', 'mono-numbers'];
export const PALETTES: ThemePalette[] = ['standard', 'contrast'];

/** Colours for the picker swatch (the real tokens live in dashboard-themes.css). */
interface Swatch { canvas: string; surface: string; border: string; brand: string; fg: string; muted: string; line: string; line2: string }

export interface ThemePreset {
    id: ThemeId;
    name: string;
    blurb: string;
    bestFor: string;
    /** Modes the theme supports. Paper is light only. */
    modes: Mode[];
    /** Mode used when the viewer has no preference (Midnight is dark first). */
    preferredMode?: Mode;
    density: ThemeDensity;
    card: ThemeCard;
    pattern: ThemePattern;
    font: ThemeFont;
    palette: ThemePalette;
    swatch: Record<Mode, Swatch>;
}

const STD_LINES = { line: '#4f46e5', line2: '#0891b2' };

export const THEMES: ThemePreset[] = [
    {
        id: 'trafficclaw', name: 'TrafficClaw', blurb: 'Today’s look: pine, cool gray, soft cards.', bestFor: 'Everything, internal dashboards',
        modes: ['light', 'dark'], density: 'comfortable', card: 'elevated', pattern: 'none', font: 'geist', palette: 'standard',
        swatch: {
            light: { canvas: '#f6f7f9', surface: '#ffffff', border: '#e7eaee', brand: '#0e4b39', fg: '#171a20', muted: '#636b78', ...STD_LINES },
            dark: { canvas: '#0b0c0f', surface: '#15171c', border: '#23272e', brand: '#78d3b1', fg: '#edeff2', muted: '#858d98', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'executive', name: 'Executive', blurb: 'Navy accent, quiet cards, bigger numbers, serif headlines.', bestFor: 'Owners, boards, monthly summaries',
        modes: ['light', 'dark'], density: 'airy', card: 'outlined', pattern: 'none', font: 'serif-headings', palette: 'standard',
        swatch: {
            light: { canvas: '#f3f4f6', surface: '#ffffff', border: '#d3d8de', brand: '#1d3557', fg: '#101828', muted: '#566170', ...STD_LINES },
            dark: { canvas: '#0c111b', surface: '#141b29', border: '#2a3750', brand: '#8fb4e8', fg: '#eaeef5', muted: '#8d99ab', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'analyst', name: 'Analyst', blurb: 'Electric blue, tight cards, small titles, grid paper.', bestFor: 'SEO specialists, big tables',
        modes: ['light', 'dark'], density: 'compact', card: 'outlined', pattern: 'grid', font: 'geist', palette: 'standard',
        swatch: {
            light: { canvas: '#eceff3', surface: '#ffffff', border: '#d2d7de', brand: '#1e4fd8', fg: '#14171c', muted: '#5b6472', ...STD_LINES },
            dark: { canvas: '#0a0b0e', surface: '#12141a', border: '#2a2f3a', brand: '#7aa7ff', fg: '#e9ecf1', muted: '#8a929e', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'midnight', name: 'Midnight', blurb: 'Near-black canvas, cyan glow, very large numbers.', bestFor: 'TV wallboards, ops rooms',
        modes: ['dark', 'light'], preferredMode: 'dark', density: 'airy', card: 'glass', pattern: 'glow', font: 'geist', palette: 'standard',
        swatch: {
            light: { canvas: '#edf2f7', surface: '#ffffff', border: '#cdd6e0', brand: '#0b6ea8', fg: '#0f1722', muted: '#566273', ...STD_LINES },
            dark: { canvas: '#05070b', surface: '#0d1117', border: '#263041', brand: '#5ac8fa', fg: '#e8edf5', muted: '#8b97aa', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'paper', name: 'Paper', blurb: 'White, hairline rules, serif headlines, prints in grey.', bestFor: 'PDF and print',
        modes: ['light'], density: 'comfortable', card: 'ruled', pattern: 'none', font: 'serif-headings', palette: 'contrast',
        swatch: {
            light: { canvas: '#ffffff', surface: '#ffffff', border: '#9aa3af', brand: '#0d3a2c', fg: '#111111', muted: '#575e69', line: '#3964e1', line2: '#9f4965' },
            dark: { canvas: '#ffffff', surface: '#ffffff', border: '#9aa3af', brand: '#0d3a2c', fg: '#111111', muted: '#575e69', line: '#3964e1', line2: '#9f4965' },
        },
    },
    {
        id: 'sunrise', name: 'Sunrise', blurb: 'Warm cream, terracotta accent, round soft cards.', bestFor: 'Local businesses, blogs',
        modes: ['light', 'dark'], density: 'airy', card: 'elevated', pattern: 'glow', font: 'geist', palette: 'standard',
        swatch: {
            light: { canvas: '#fbf7f0', surface: '#fffdf9', border: '#e0d5c1', brand: '#a8401a', fg: '#231f1a', muted: '#665c50', ...STD_LINES },
            dark: { canvas: '#17120d', surface: '#201a14', border: '#41362a', brand: '#f0a47c', fg: '#f3ece1', muted: '#a1957f', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'studio', name: 'Studio', blurb: 'Neutral zinc so your brand colour leads.', bestFor: 'Agencies, white-label client reports',
        modes: ['light', 'dark'], density: 'comfortable', card: 'outlined', pattern: 'none', font: 'geist', palette: 'standard',
        swatch: {
            light: { canvas: '#f7f7f8', surface: '#ffffff', border: '#d4d4d8', brand: '#3b4cca', fg: '#18181b', muted: '#5f5f69', ...STD_LINES },
            dark: { canvas: '#09090b', surface: '#131316', border: '#2e2e35', brand: '#9aa6ff', fg: '#fafafa', muted: '#8e8e98', line: '#8b85ff', line2: '#22b8d6' },
        },
    },
    {
        id: 'contrast', name: 'High contrast', blurb: 'Black on white, strong borders, thick lines.', bestFor: 'Accessibility, projectors',
        modes: ['light', 'dark'], density: 'comfortable', card: 'outlined', pattern: 'none', font: 'system', palette: 'contrast',
        swatch: {
            light: { canvas: '#ffffff', surface: '#ffffff', border: '#3b4350', brand: '#0a3a8a', fg: '#000000', muted: '#3b4350', line: '#3964e1', line2: '#9f4965' },
            dark: { canvas: '#000000', surface: '#0a0a0b', border: '#b4bcc8', brand: '#9cc2ff', fg: '#ffffff', muted: '#c2cad6', line: '#229adf', line2: '#b068a6' },
        },
    },
];

export const DEFAULT_THEME_ID: ThemeId = 'trafficclaw';

export function isThemeId(v: unknown): v is ThemeId {
    return typeof v === 'string' && (THEME_IDS as string[]).includes(v);
}

export function themePreset(id: string | undefined): ThemePreset {
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The options in force (stored values win, then the preset's defaults). */
export function themeOptions(theme: Pick<ThemeV2, 'id' | 'density' | 'card' | 'pattern' | 'font' | 'palette'>) {
    const p = themePreset(theme.id);
    return {
        id: p.id,
        density: theme.density ?? p.density,
        card: theme.card ?? p.card,
        pattern: theme.pattern ?? p.pattern,
        font: theme.font ?? p.font,
        palette: theme.palette ?? p.palette,
    };
}

/**
 * True when the dashboard looks exactly like before round 2: no preset (or TrafficClaw), every
 * option at its default and no brand colour. Such dashboards render with no theme wrapper.
 */
export function isDefaultLook(theme: ThemeV2): boolean {
    const o = themeOptions(theme);
    return o.id === 'trafficclaw' && o.density === 'comfortable' && o.card === 'elevated' && o.pattern === 'none' && o.font === 'geist' && o.palette === 'standard' && !theme.brand?.color;
}

/** Choose a preset: writes its option defaults into the theme (snapshot on pick). */
export function applyThemePreset(theme: ThemeV2, id: ThemeId): ThemeV2 {
    const p = themePreset(id);
    const next: ThemeV2 = { ...theme, density: p.density, card: p.card, pattern: p.pattern, font: p.font, palette: p.palette };
    if (id === 'trafficclaw') {
        // Back to today's look: drop the fields so the doc is byte-for-byte a default doc again.
        delete next.id;
        delete next.density;
        delete next.card;
        delete next.pattern;
        delete next.font;
        delete next.palette;
        return next;
    }
    next.id = id;
    if (p.modes.length === 1) next.mode = p.modes[0];
    return next;
}

/** The mode a themed dashboard renders in, given the mode the page asks for. */
export function themeMode(theme: Pick<ThemeV2, 'id'>, wanted: Mode): Mode {
    const p = themePreset(theme.id);
    return p.modes.includes(wanted) ? wanted : p.modes[0];
}

/** Grid row height and gap per density (stored layouts are in grid units). */
export function densityPx(d: ThemeDensity | undefined): { row: number; gap: number } {
    if (d === 'compact') return { row: 28, gap: 12 };
    if (d === 'airy') return { row: 36, gap: 20 };
    return { row: 32, gap: 16 };
}

/**
 * Attributes for the themed dashboard root, or null for the default look (no wrapper attributes,
 * so the DOM and every pixel stay as before).
 */
export function dashThemeAttrs(theme: ThemeV2, mode: Mode): Record<string, string> | null {
    if (isDefaultLook(theme)) return null;
    const o = themeOptions(theme);
    return {
        'data-dash-theme': o.id,
        'data-theme': themeMode(theme, mode),
        'data-dash-density': o.density,
        'data-dash-card': o.card,
        'data-dash-pattern': o.pattern,
        'data-dash-font': o.font,
        'data-dash-palette': o.palette,
    };
}

/** Client report preset (white-label kit): Studio, header on, badge off, cover on. */
export function clientReportTheme(theme: ThemeV2): ThemeV2 {
    const t = applyThemePreset(theme, 'studio');
    return {
        ...t,
        header: { ...t.header, show: true },
        badge: { show: false },
        cover: { layout: 'left', title: '{{name}}', subtitle: '{{date_range}}', ...(t.cover ?? {}), enabled: true },
    };
}
