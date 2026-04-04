export type TrafficSourceIcon = 'link' | 'google' | 'x' | 'referral';

export interface TrafficSourceRow {
    source?: string;
    users?: number;
}

export interface TrafficSourceBreakdownItem {
    icon: TrafficSourceIcon;
    label: string;
    count: number;
}

const DIRECT_LABELS = new Set([
    '(direct)',
    '(direct) / (none)',
    'direct',
    'direct / (none)',
]);

const UNKNOWN_LABELS = new Set([
    '',
    '(not set)',
    '(none)',
    'not set',
    'unknown',
]);

export function normalizeTrafficSourceLabel(value: unknown): string {
    const raw = String(value ?? '').trim();
    const lower = raw.toLowerCase();

    if (DIRECT_LABELS.has(lower)) return 'Direct';
    if (UNKNOWN_LABELS.has(lower)) return 'Unknown source';

    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

export function getTrafficSourceIcon(label: string): TrafficSourceIcon {
    const lower = label.toLowerCase();

    if (lower === 'direct' || lower === 'unknown source') return 'link';

    if ([
        'google',
        'bing',
        'duckduckgo',
        'yahoo',
        'baidu',
        'yandex',
        'organic',
        'search',
    ].some((token) => lower.includes(token))) {
        return 'google';
    }

    if ([
        'twitter',
        'x.com',
        't.co',
        'facebook',
        'instagram',
        'linkedin',
        'reddit',
        'social',
        'youtube',
        'tiktok',
        'pinterest',
    ].some((token) => lower.includes(token))) {
        return 'x';
    }

    return 'referral';
}

export function buildTrafficSourceBreakdown(
    rows: TrafficSourceRow[] | null | undefined,
    fallbackCount = 0,
): TrafficSourceBreakdownItem[] {
    const merged = new Map<string, number>();

    if (Array.isArray(rows)) {
        rows.forEach((row) => {
            const label = normalizeTrafficSourceLabel(row?.source);
            const count = Math.max(0, Number(row?.users) || 0);
            if (!label || count <= 0) return;
            merged.set(label, (merged.get(label) || 0) + count);
        });
    }

    if (merged.size === 0 && fallbackCount > 0) {
        merged.set('Unknown source', fallbackCount);
    }

    return [...merged.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({
            icon: getTrafficSourceIcon(label),
            label,
            count,
        }));
}
