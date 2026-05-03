export type ShareLayoutMode = 'legacy' | 'openpanel_overview' | 'umami_fork';
export type ShareProvider = ShareLayoutMode;

/* ─── Share Studio types (openpanel_overview customization) ─── */

export type ShareSectionId =
    | 'metrics'
    | 'sources'
    | 'geo'
    | 'devices'
    | 'pages'
    | 'events'
    | 'liveGeo';

export const DEFAULT_SECTION_ORDER: ShareSectionId[] = [
    'metrics',
    'sources',
    'geo',
    'devices',
    'pages',
    'events',
    'liveGeo',
];

export type ShareThemePreset = 'aurora' | 'midnight' | 'solar' | 'forest' | 'rose' | 'custom';

export interface ShareTheme {
    accentColor?: string | null;
    preset?: ShareThemePreset;
}

export interface ShareBranding {
    logoUrl?: string | null;
    companyName?: string | null;
    showWatermark?: boolean;
}

export type ShareDefaultInterval = 'auto' | 'hour' | 'day' | 'week' | 'month';

export interface ShareDefaultFilter {
    dimension: string;
    value: string;
}

export interface ShareDefaults {
    range?: string | null;
    interval?: ShareDefaultInterval;
    metricIndex?: number | null;
    filter?: ShareDefaultFilter | null;
}

export interface ShareConfig {
    traffic?: boolean;
    sources?: boolean;
    pages?: boolean;
    geo?: boolean;
    technology?: boolean;
    seo?: boolean;
    layoutMode?: ShareLayoutMode;
    shareProvider?: ShareProvider;
    umamiWebsiteId?: string | null;
    umamiShareId?: string | null;
    umamiShareUrl?: string | null;
    umamiEnabledAt?: string | null;
    siteName?: string | null;

    // Studio-customizable
    sectionOrder?: ShareSectionId[];
    sectionVisibility?: Partial<Record<ShareSectionId, boolean>>;
    theme?: ShareTheme;
    branding?: ShareBranding;
    defaults?: ShareDefaults;
}

export interface NormalizedShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    technology: boolean;
    seo: boolean;
    layoutMode: ShareLayoutMode;
    shareProvider: ShareProvider;
    umamiWebsiteId: string | null;
    umamiShareId: string | null;
    umamiShareUrl: string | null;
    umamiEnabledAt: string | null;
    siteName: string | null;

    sectionOrder: ShareSectionId[];
    sectionVisibility: Record<ShareSectionId, boolean>;
    theme: Required<Pick<ShareTheme, 'accentColor'>> & { preset: ShareThemePreset };
    branding: {
        logoUrl: string | null;
        companyName: string | null;
        showWatermark: boolean;
    };
    defaults: {
        range: string | null;
        interval: ShareDefaultInterval;
        metricIndex: number | null;
        filter: ShareDefaultFilter | null;
    };
}

export const DEFAULT_SHARE_ACCENT = '#14C4E1';

export interface ShareData {
    token: string;
    userId: string;
    propertyId: string;
    siteUrl: string;
    config: NormalizedShareConfig;
    views: number;
    createdAt: string;
}

const DEFAULT_STUDIO_FIELDS = {
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sectionVisibility: {
        metrics: true,
        sources: true,
        geo: true,
        devices: true,
        pages: true,
        events: true,
        liveGeo: true,
    } as Record<ShareSectionId, boolean>,
    theme: { accentColor: DEFAULT_SHARE_ACCENT, preset: 'aurora' as ShareThemePreset },
    branding: { logoUrl: null, companyName: null, showWatermark: true },
    defaults: { range: '30d', interval: 'auto' as ShareDefaultInterval, metricIndex: 0, filter: null },
};

export const LEGACY_SHARE_CONFIG: NormalizedShareConfig = {
    traffic: true,
    sources: true,
    pages: true,
    geo: true,
    technology: true,
    seo: false,
    layoutMode: 'legacy',
    shareProvider: 'legacy',
    umamiWebsiteId: null,
    umamiShareId: null,
    umamiShareUrl: null,
    umamiEnabledAt: null,
    siteName: null,
    ...DEFAULT_STUDIO_FIELDS,
};

export const OVERVIEW_SHARE_CONFIG: NormalizedShareConfig = {
    traffic: true,
    sources: true,
    pages: true,
    geo: true,
    technology: true,
    seo: false,
    layoutMode: 'openpanel_overview',
    shareProvider: 'openpanel_overview',
    umamiWebsiteId: null,
    umamiShareId: null,
    umamiShareUrl: null,
    umamiEnabledAt: null,
    siteName: null,
    ...DEFAULT_STUDIO_FIELDS,
};

export const UMAMI_SHARE_CONFIG: NormalizedShareConfig = {
    traffic: true,
    sources: true,
    pages: true,
    geo: true,
    technology: true,
    seo: false,
    layoutMode: 'umami_fork',
    shareProvider: 'umami_fork',
    umamiWebsiteId: null,
    umamiShareId: null,
    umamiShareUrl: null,
    umamiEnabledAt: null,
    siteName: null,
    ...DEFAULT_STUDIO_FIELDS,
};

function normalizeShareProvider(config?: ShareConfig | null): ShareProvider {
    if (config?.shareProvider === 'legacy' || config?.shareProvider === 'openpanel_overview' || config?.shareProvider === 'umami_fork') {
        return config.shareProvider;
    }

    if (config?.layoutMode === 'openpanel_overview' || config?.layoutMode === 'umami_fork') {
        return config.layoutMode;
    }

    return 'legacy';
}

function normalizeSectionOrder(input?: ShareSectionId[] | null): ShareSectionId[] {
    const allowed = new Set<ShareSectionId>(DEFAULT_SECTION_ORDER);
    const seen = new Set<ShareSectionId>();
    const out: ShareSectionId[] = [];
    if (Array.isArray(input)) {
        for (const id of input) {
            if (allowed.has(id) && !seen.has(id)) {
                out.push(id);
                seen.add(id);
            }
        }
    }
    for (const id of DEFAULT_SECTION_ORDER) {
        if (!seen.has(id)) out.push(id);
    }
    return out;
}

function normalizeSectionVisibility(
    input?: Partial<Record<ShareSectionId, boolean>> | null,
): Record<ShareSectionId, boolean> {
    return {
        metrics: input?.metrics ?? true,
        sources: input?.sources ?? true,
        geo: input?.geo ?? true,
        devices: input?.devices ?? true,
        pages: input?.pages ?? true,
        events: input?.events ?? true,
        liveGeo: input?.liveGeo ?? true,
    };
}

function isValidHexColor(value: unknown): value is string {
    return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

function normalizeTheme(input?: ShareTheme | null): NormalizedShareConfig['theme'] {
    return {
        accentColor: isValidHexColor(input?.accentColor) ? input!.accentColor! : DEFAULT_SHARE_ACCENT,
        preset:
            input?.preset === 'aurora' ||
            input?.preset === 'midnight' ||
            input?.preset === 'solar' ||
            input?.preset === 'forest' ||
            input?.preset === 'rose' ||
            input?.preset === 'custom'
                ? input.preset
                : 'aurora',
    };
}

function normalizeBranding(input?: ShareBranding | null): NormalizedShareConfig['branding'] {
    return {
        logoUrl: typeof input?.logoUrl === 'string' && input.logoUrl.length > 0 ? input.logoUrl : null,
        companyName: typeof input?.companyName === 'string' && input.companyName.length > 0 ? input.companyName : null,
        showWatermark: input?.showWatermark ?? true,
    };
}

function normalizeDefaults(input?: ShareDefaults | null): NormalizedShareConfig['defaults'] {
    const interval: ShareDefaultInterval =
        input?.interval === 'hour' || input?.interval === 'day' || input?.interval === 'week' || input?.interval === 'month'
            ? input.interval
            : 'auto';
    let metricIndex: number | null = null;
    if (typeof input?.metricIndex === 'number' && Number.isInteger(input.metricIndex) && input.metricIndex >= 0 && input.metricIndex <= 6) {
        metricIndex = input.metricIndex;
    } else if (input?.metricIndex === null) {
        metricIndex = null;
    } else if (input?.metricIndex === undefined) {
        metricIndex = 0;
    }
    return {
        range: typeof input?.range === 'string' && input.range.length > 0 ? input.range : '30d',
        interval,
        metricIndex,
        filter:
            input?.filter && typeof input.filter.dimension === 'string' && typeof input.filter.value === 'string'
                ? { dimension: input.filter.dimension, value: input.filter.value }
                : null,
    };
}

export function normalizeShareConfig(config?: ShareConfig | null): NormalizedShareConfig {
    const shareProvider = normalizeShareProvider(config);
    const hasExplicitLayout =
        config?.layoutMode === 'legacy' ||
        config?.layoutMode === 'openpanel_overview' ||
        config?.layoutMode === 'umami_fork';

    const layoutMode = hasExplicitLayout ? config!.layoutMode! : shareProvider;

    return {
        traffic: config?.traffic ?? true,
        sources: config?.sources ?? true,
        pages: config?.pages ?? true,
        geo: config?.geo ?? true,
        technology: config?.technology ?? true,
        seo: config?.seo ?? false,
        layoutMode,
        shareProvider,
        umamiWebsiteId: config?.umamiWebsiteId ?? null,
        umamiShareId: config?.umamiShareId ?? null,
        umamiShareUrl: config?.umamiShareUrl ?? null,
        umamiEnabledAt: config?.umamiEnabledAt ?? null,
        siteName: config?.siteName ?? null,
        sectionOrder: normalizeSectionOrder(config?.sectionOrder),
        sectionVisibility: normalizeSectionVisibility(config?.sectionVisibility),
        theme: normalizeTheme(config?.theme),
        branding: normalizeBranding(config?.branding),
        defaults: normalizeDefaults(config?.defaults),
    };
}
