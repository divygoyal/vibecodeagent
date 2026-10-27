import type { BoardTab, OpenTo, PrivacyMetric, PrivacySection, RangeKey } from './types';

export const RANGES: ReadonlyArray<{ value: RangeKey; label: string; days: number }> = [
    { value: '7d', label: '7d', days: 7 },
    { value: '28d', label: '28d', days: 28 },
    { value: '3m', label: '3m', days: 90 },
];
export const DEFAULT_RANGE: RangeKey = '28d';

export const RANGE_NAMES: Record<RangeKey, string> = { '7d': 'last 7 days', '28d': 'last 28 days', '3m': 'last 3 months' };
export const RANGE_PREV_NAMES: Record<RangeKey, string> = { '7d': 'previous 7 days', '28d': 'previous 28 days', '3m': 'previous 3 months' };

export const TABS: ReadonlyArray<{ value: BoardTab; label: string; blurb: string }> = [
    { value: 'top', label: 'Top', blurb: 'Ranked by visitors (Google Analytics)' },
    { value: 'search', label: 'Top search', blurb: 'Ranked by Google search clicks (Search Console)' },
    { value: 'rising', label: 'Rising', blurb: 'Biggest visitor growth vs the previous period' },
    { value: 'new', label: 'New', blurb: 'Recently joined, verified sites' },
    { value: 'offers', label: 'Open to offers', blurb: 'Sites open to sponsorships, acquisition offers or partnerships' },
    { value: 'categories', label: 'Categories', blurb: 'Browse by what the site is' },
];

export const CATEGORIES = [
    'SaaS', 'AI', 'E-commerce', 'Blog', 'Newsletter', 'Agency', 'Tool', 'Games', 'Mobile app', 'Education', 'Other',
] as const;

export const CATEGORY_LABELS: Record<string, string> = { Blog: 'Blog / Content', Tool: 'Dev tool' };

export const OPEN_TO_OPTIONS: ReadonlyArray<{ value: OpenTo; label: string; short: string; kind: 'sponsorship' | 'acquisition' | 'partnership'; hint: string }> = [
    { value: 'sponsorships', label: 'Sponsorships', short: 'Sponsorships', kind: 'sponsorship', hint: 'Ads, newsletter mentions, sponsored posts' },
    { value: 'acquisition', label: 'Acquisition offers', short: 'Acquisition', kind: 'acquisition', hint: 'Someone wants to buy the site' },
    { value: 'partnerships', label: 'Partnerships', short: 'Partnerships', kind: 'partnership', hint: 'Integrations, co-marketing, collaborations' },
];

export const PRIVACY_METRICS: ReadonlyArray<{ key: PrivacyMetric; label: string; hint: string; source: 'GA4' | 'GSC' }> = [
    { key: 'visitors', label: 'Visitors', hint: 'Unique visitors in the range. Used to rank you in Top and Rising.', source: 'GA4' },
    { key: 'clicks', label: 'Search clicks', hint: 'Google search clicks. Used to rank you in Top search.', source: 'GSC' },
    { key: 'pageviews', label: 'Pageviews', hint: 'Total pages viewed.', source: 'GA4' },
    { key: 'impressions', label: 'Search impressions', hint: 'How often you appeared in Google results.', source: 'GSC' },
    { key: 'engagement', label: 'Engagement', hint: 'Engagement rate, bounce rate and session length.', source: 'GA4' },
];

export const PRIVACY_SECTIONS: ReadonlyArray<{ key: PrivacySection; label: string; hint: string }> = [
    { key: 'countries', label: 'Top countries', hint: 'Share of visitors by country.' },
    { key: 'channels', label: 'Traffic sources', hint: 'Organic search, direct, referral, social.' },
    { key: 'devices', label: 'Devices', hint: 'Desktop, mobile and tablet split.' },
    { key: 'pages', label: 'Top pages', hint: 'Your most visited page paths.' },
    { key: 'queries', label: 'Top search queries', hint: 'The Google queries that bring clicks.' },
];

export const MRR_RANGES = ['$0-500', '$500-1K', '$1K-5K', '$5K-10K', '$10K+'] as const;

export const SITE_ORIGIN = (process.env.NEXTAUTH_URL || 'https://trafficclaw.com').replace(/\/$/, '');

export function profilePath(row: { slug: string | null; id: number }): string {
    return `/leaderboard/${row.slug || row.id}`;
}

export function faviconUrl(host: string | null | undefined, size = 64): string | null {
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
