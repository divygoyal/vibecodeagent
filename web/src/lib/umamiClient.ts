import { randomUUID } from 'crypto';
import type { ShareOverviewFilter } from '@/lib/shareOverviewFilters';

const UMAMI_BASE_URL = (process.env.UMAMI_BASE_URL || '').replace(/\/+$/, '');
const UMAMI_ADMIN_API_KEY = process.env.UMAMI_ADMIN_API_KEY || process.env.UMAMI_API_KEY || '';
const UMAMI_BEARER_TOKEN = process.env.UMAMI_BEARER_TOKEN || '';
const UMAMI_SHARE_BASE_URL = (process.env.UMAMI_SHARE_BASE_URL || UMAMI_BASE_URL).replace(/\/+$/, '');

type UmamiPagePoint = {
    x: string;
    y: number;
};

type UmamiMetricRow = {
    x: string;
    y: number;
};

type UmamiMetricExpandedRow = {
    name: string;
    pageviews: number;
    visitors: number;
    visits: number;
    bounces: number;
    totaltime: number;
};

type UmamiRealtimeResponse = {
    countries?: Record<string, number>;
    urls?: Record<string, number>;
    referrers?: Record<string, number>;
    series?: {
        views?: UmamiPagePoint[];
        visitors?: UmamiPagePoint[];
    };
    totals?: {
        views?: number;
        visitors?: number;
        events?: number;
        countries?: number;
    };
    timestamp?: number;
};

type UmamiWebsite = {
    id: string;
    name: string;
    domain: string;
    shareId?: string | null;
};

type UmamiWebsitesResponse = {
    data?: UmamiWebsite[];
};

type UmamiStatsResponse = {
    pageviews: number;
    visitors: number;
    visits: number;
    bounces: number;
    totaltime: number;
    comparison?: {
        pageviews?: number;
        visitors?: number;
        visits?: number;
        bounces?: number;
        totaltime?: number;
    };
};

export type UmamiProvisioningResult = {
    configured: boolean;
    websiteId: string | null;
    shareId: string | null;
    shareUrl: string | null;
    enabledAt: string | null;
    siteName: string | null;
    message?: string;
};

export type UmamiStatsInput = {
    websiteId: string;
    startAt: number;
    endAt: number;
    filters?: ShareOverviewFilter[];
};

function getUmamiHeaders() {
    const headers: Record<string, string> = {
        Accept: 'application/json',
    };

    if (UMAMI_ADMIN_API_KEY) {
        headers['x-umami-api-key'] = UMAMI_ADMIN_API_KEY;
    } else if (UMAMI_BEARER_TOKEN) {
        headers.Authorization = `Bearer ${UMAMI_BEARER_TOKEN}`;
    }

    return headers;
}

function buildUrl(path: string, params?: URLSearchParams) {
    if (!UMAMI_BASE_URL) {
        return path;
    }

    const url = new URL(`${UMAMI_BASE_URL}${path}`);
    if (params) {
        params.forEach((value, key) => {
            url.searchParams.set(key, value);
        });
    }
    return url.toString();
}

async function umamiFetch<T>(path: string, init?: RequestInit, params?: URLSearchParams): Promise<T> {
    if (!isUmamiConfigured()) {
        throw new Error('Umami is not configured');
    }

    const headers = new Headers(getUmamiHeaders());
    if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => {
            headers.set(key, value);
        });
    }

    const response = await fetch(buildUrl(path, params), {
        ...init,
        headers,
        cache: 'no-store',
    });

    if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(`Umami API ${response.status}: ${message}`);
    }

    return response.json() as Promise<T>;
}

function ensureProtocol(siteUrl: string) {
    return /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
}

function extractDomain(siteUrl?: string | null) {
    if (!siteUrl) {
        return null;
    }

    try {
        return new URL(ensureProtocol(siteUrl)).hostname.replace(/^www\./i, '');
    } catch {
        return null;
    }
}

function buildSiteName(siteUrl: string | null | undefined, propertyId: string) {
    const domain = extractDomain(siteUrl);
    return domain || propertyId.replace(/^properties\//, 'Property ');
}

function buildShareUrl(shareId?: string | null) {
    if (!shareId || !UMAMI_SHARE_BASE_URL) {
        return null;
    }

    return `${UMAMI_SHARE_BASE_URL}/share/${shareId}`;
}

function buildDefaultShareId(token: string) {
    return `trafficclaw-${token}`;
}

function applyUmamiFilters(params: URLSearchParams, filters?: ShareOverviewFilter[]) {
    filters?.forEach((filter) => {
        const value = filter.value[0];
        if (!value) {
            return;
        }

        switch (filter.name) {
            case 'referrer_name':
            case 'referrer':
                params.set('referrer', value);
                break;
            case 'device':
                params.set('device', value);
                break;
            case 'browser':
                params.set('browser', value);
                break;
            case 'os':
                params.set('os', value);
                break;
            case 'country':
                params.set('country', value);
                break;
            case 'region':
                params.set('region', value);
                break;
            case 'city':
                params.set('city', value);
                break;
            case 'path':
            case 'entry_path':
            case 'exit_path':
                params.set('path', value);
                break;
            default:
                break;
        }
    });
}

export function isUmamiConfigured() {
    return Boolean(UMAMI_BASE_URL && (UMAMI_ADMIN_API_KEY || UMAMI_BEARER_TOKEN));
}

export async function ensureUmamiWebsiteProvisioned(input: {
    token: string;
    propertyId: string;
    siteUrl?: string | null;
    existingWebsiteId?: string | null;
    existingShareId?: string | null;
}) : Promise<UmamiProvisioningResult> {
    const siteName = buildSiteName(input.siteUrl, input.propertyId);
    const domain = extractDomain(input.siteUrl);

    if (!isUmamiConfigured()) {
        return {
            configured: false,
            websiteId: input.existingWebsiteId ?? null,
            shareId: input.existingShareId ?? null,
            shareUrl: buildShareUrl(input.existingShareId),
            enabledAt: null,
            siteName,
            message: 'Umami environment variables are not configured yet.',
        };
    }

    if (!domain) {
        return {
            configured: true,
            websiteId: input.existingWebsiteId ?? null,
            shareId: input.existingShareId ?? null,
            shareUrl: buildShareUrl(input.existingShareId),
            enabledAt: null,
            siteName,
            message: 'Site URL is missing, so Umami website provisioning was skipped.',
        };
    }

    let website: UmamiWebsite | null = null;

    if (input.existingWebsiteId) {
        website = await umamiFetch<UmamiWebsite>(`/api/websites/${input.existingWebsiteId}`);
    } else {
        const searchParams = new URLSearchParams({
            search: domain,
            pageSize: '100',
        });
        const websites = await umamiFetch<UmamiWebsitesResponse>('/api/websites', undefined, searchParams);
        website = (websites.data || []).find((item) => item.domain === domain) || null;
    }

    const nextShareId = website?.shareId || input.existingShareId || buildDefaultShareId(input.token) || randomUUID();

    if (!website) {
        website = await umamiFetch<UmamiWebsite>('/api/websites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: siteName,
                domain,
                shareId: nextShareId,
            }),
        });
    } else if (website.shareId !== nextShareId || website.name !== siteName || website.domain !== domain) {
        website = await umamiFetch<UmamiWebsite>(`/api/websites/${website.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: siteName,
                domain,
                shareId: nextShareId,
            }),
        });
    }

    return {
        configured: true,
        websiteId: website.id,
        shareId: website.shareId || nextShareId,
        shareUrl: buildShareUrl(website.shareId || nextShareId),
        enabledAt: new Date().toISOString(),
        siteName: website.name || siteName,
    };
}

export async function fetchUmamiStats(input: UmamiStatsInput) {
    const params = new URLSearchParams({
        startAt: `${input.startAt}`,
        endAt: `${input.endAt}`,
    });
    applyUmamiFilters(params, input.filters);
    return umamiFetch<UmamiStatsResponse>(`/api/websites/${input.websiteId}/stats`, undefined, params);
}

export async function fetchUmamiPageviews(input: UmamiStatsInput & { unit: 'hour' | 'day' | 'month' | 'year' }) {
    const params = new URLSearchParams({
        startAt: `${input.startAt}`,
        endAt: `${input.endAt}`,
        unit: input.unit,
    });
    applyUmamiFilters(params, input.filters);

    return umamiFetch<{
        pageviews?: UmamiPagePoint[];
        sessions?: UmamiPagePoint[];
    }>(`/api/websites/${input.websiteId}/pageviews`, undefined, params);
}

type UmamiMetricType = 'path' | 'referrer' | 'device' | 'country' | 'region' | 'city' | 'browser' | 'os';

export async function fetchUmamiMetrics(input: UmamiStatsInput & {
    type: UmamiMetricType;
    limit?: number;
    expanded: true;
}): Promise<UmamiMetricExpandedRow[]>;
export async function fetchUmamiMetrics(input: UmamiStatsInput & {
    type: UmamiMetricType;
    limit?: number;
    expanded?: false;
}): Promise<UmamiMetricRow[]>;
export async function fetchUmamiMetrics(input: UmamiStatsInput & {
    type: UmamiMetricType;
    limit?: number;
    expanded?: boolean;
}) {
    const params = new URLSearchParams({
        startAt: `${input.startAt}`,
        endAt: `${input.endAt}`,
        type: input.type,
        limit: `${input.limit || 10}`,
    });
    applyUmamiFilters(params, input.filters);

    if (input.expanded) {
        return umamiFetch<UmamiMetricExpandedRow[]>(
            `/api/websites/${input.websiteId}/metrics/expanded`,
            undefined,
            params,
        );
    }

    return umamiFetch<UmamiMetricRow[]>(
        `/api/websites/${input.websiteId}/metrics`,
        undefined,
        params,
    );
}

export async function fetchUmamiRealtime(websiteId: string) {
    return umamiFetch<UmamiRealtimeResponse>(`/api/realtime/${websiteId}`);
}

export async function fetchUmamiActiveVisitors(websiteId: string) {
    return umamiFetch<{ visitors: number }>(`/api/websites/${websiteId}/active`);
}
