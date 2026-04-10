export type ShareLayoutMode = 'legacy' | 'openpanel_overview' | 'umami_fork';
export type ShareProvider = ShareLayoutMode;

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
}

export interface ShareData {
    token: string;
    userId: string;
    propertyId: string;
    siteUrl: string;
    config: NormalizedShareConfig;
    views: number;
    createdAt: string;
}

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
    };
}
