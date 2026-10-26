/**
 * Wire types for the verified-traffic leaderboard (tc/leaderboard).
 *
 * Everything under "public" is exactly what the admin API's privacy layer
 * (admin/leaderboard_core.py) lets a stranger see: a count metric is either exact
 * or a band, never both; a hidden metric/section is absent (null / missing key).
 * UI code must treat absence as "not shared" and never try to derive it.
 */

export type RangeKey = '7d' | '28d' | '3m';
export type VisMode = 'exact' | 'range' | 'hidden';
export type VerificationLevel = 'owner' | 'ga4' | 'none';
export type OpenTo = 'sponsorships' | 'acquisition' | 'partnerships';
export type BoardTab = 'top' | 'search' | 'rising' | 'new' | 'offers' | 'categories';
export type PrivacyMetric = 'visitors' | 'clicks' | 'pageviews' | 'impressions' | 'engagement';
export type PrivacySection = 'countries' | 'channels' | 'devices' | 'pages' | 'queries';

/** A count the owner shares. Exact carries the number, range only the band. */
export type CountMetric =
    | { mode: 'exact'; value: number; delta_pct: number | null }
    | { mode: 'range'; label: string; delta_pct: number | null };

export type EngagementMetric =
    | { mode: 'exact'; rate: number; bounce_rate: number | null; avg_session_seconds: number | null }
    | { mode: 'range'; label: string };

export interface VerificationPublic {
    level: VerificationLevel;
    /** "Verified owner (Search Console)" | "GA4 connected" | "Pending verification" */
    label: string;
    /** GA4 data-stream check also passed (second signal). */
    ga4_connected: boolean;
    ranked: boolean;
    checked_at: string | null;
}

export interface SparkData {
    metric: 'visitors' | 'clicks';
    /** exact: real values; range: 0-100 shape only. */
    mode: 'exact' | 'range';
    values: Array<number | null>;
}

export interface BoardRow {
    /** 1-based rank for ranked tabs (top, search, rising); null elsewhere. */
    rank: number | null;
    id: number;
    slug: string | null;
    name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    country: string | null;
    verification: VerificationPublic;
    open_to: OpenTo[];
    visitors: CountMetric | null;
    clicks: CountMetric | null;
    ad_slot_count: number;
    /** Lowest price the publisher typed (cents). Never computed. */
    min_slot_price_cents: number | null;
    topic_labels: string[];
    created_at: string | null;
    /** Joined within the last 30 days. */
    is_new: boolean;
    last_refreshed: string | null;
    spark: SparkData | null;
}

export interface SponsoredCard {
    slot: { id: number; name: string; price_cents: number; billing_period: string; quantity_open: number };
    site: { id: number; slug: string | null; name: string; logo_url: string | null; category: string | null; visitors: CountMetric | null };
}

export interface CategoryCard {
    name: string;
    count: number;
    top: Array<{ id: number; slug: string | null; name: string; logo_url: string | null; website_url: string | null; visitors: CountMetric | null }>;
}

export interface BoardResponse {
    tab: BoardTab;
    range: RangeKey;
    focus: 'visitors' | 'clicks';
    rows: BoardRow[];
    total: number;
    page: number;
    pageSize: number;
    categories: Array<{ name: string; count: number }>;
    category_cards?: CategoryCard[];
    sponsored: SponsoredCard[];
    open_slot_total: number;
    updated_at: string | null;
}

export interface SeriesPoint { d: string; v: number | null }
export interface PublicSeries { mode: 'exact' | 'range'; points: SeriesPoint[] }

export interface ShareItem { name: string; share: number; iso2?: string }
export interface PagesItem { path: string; share: number; views?: number }
export interface QueryItem { query: string; clicks?: number; impressions?: number }

export interface PublicSlot {
    id: number;
    entry_id: number;
    name: string;
    price_cents: number;
    billing_period: string;
    quantity_total: number;
    quantity_taken: number;
    quantity_open: number;
    preview_image_url: string | null;
    preview_note: string | null;
}

export interface ProfilePayload {
    id: number;
    slug: string | null;
    name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    country: string | null;
    twitter_handle: string | null;
    founder_name: string | null;
    verification: VerificationPublic;
    /** What this site is open to (includes sponsorships when it sells ad slots). */
    open_to: OpenTo[];
    range: RangeKey;
    created_at: string | null;
    preview: boolean;
    status: 'ranked' | 'pending';
    kpis: {
        visitors: CountMetric | null;
        clicks: CountMetric | null;
        pageviews: CountMetric | null;
        impressions: CountMetric | null;
        engagement: EngagementMetric | null;
    } | null;
    series: { visitors: PublicSeries | null; clicks: PublicSeries | null } | null;
    growth: {
        visitors_delta_pct: number | null;
        clicks_delta_pct: number | null;
        rank_overall: number | null;
        rank_overall_total: number | null;
        rank_category: number | null;
        rank_category_total: number | null;
        best_day: { date: string; value?: number } | null;
        days_listed: number | null;
    } | null;
    breakdowns: {
        countries?: ShareItem[];
        channels?: ShareItem[];
        devices?: ShareItem[];
        pages?: PagesItem[];
        queries?: QueryItem[];
    };
    topic_labels?: string[];
    ad_slots: PublicSlot[];
    live: { enabled: boolean };
    similar: Array<{ id: number; slug: string | null; name: string; logo_url: string | null; category: string | null; visitors: CountMetric | null }>;
    updated_at: string | null;
}

export interface EmbedPayload {
    id: number;
    slug: string | null;
    name: string;
    logo_url: string | null;
    website_url: string | null;
    category: string | null;
    verification: VerificationPublic;
    range: RangeKey;
    visitors: CountMetric | null;
    clicks: CountMetric | null;
    spark: SparkData | null;
    rank_overall: number | null;
    rank_category: number | null;
    live_enabled: boolean;
    updated_at: string | null;
}

// ─── owner side ─────────────────────────────────────────────────────────────

export interface PrivacySettings {
    v: 1;
    metrics: Record<PrivacyMetric, VisMode>;
    sections: Record<PrivacySection, boolean>;
    live: boolean;
}

export interface VerificationDetail {
    expected_host?: string;
    gsc?: { ok: boolean; reason: string; site_url: string | null; permission: string | null; kind?: 'domain' | 'prefix' };
    ga4?: { ok: boolean; reason: string; hosts: string[] };
    message?: string;
    fix?: string[];
    error?: string;
    error_at?: string;
    manual?: boolean;
}

export interface OwnerStat {
    visitors: number | null;
    visitors_prev: number | null;
    pageviews: number | null;
    pageviews_prev: number | null;
    clicks: number | null;
    clicks_prev: number | null;
    impressions: number | null;
    impressions_prev: number | null;
    engagement_rate: number | null;
    bounce_rate: number | null;
    avg_session_duration: number | null;
}

export interface MyEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    mrr_range: string | null;
    twitter_handle: string | null;
    founder_name: string | null;
    contact_email: string | null;
    ga_property_id: string | null;
    gsc_site_url: string | null;
    is_active: boolean;
    is_paused: boolean;
    created_at: string | null;
    last_refreshed: string | null;
    primary_country: string | null;
    verification: VerificationPublic & { grace: boolean; manual: boolean; detail: VerificationDetail };
    /** True until the owner saves privacy settings once: the page still shows what it showed before v3. */
    legacy_privacy: boolean;
    privacy: PrivacySettings;
    open_to: OpenTo[];
    stats: Record<RangeKey, OwnerStat>;
    rank: { rank: number | null; total: number | null };
    ad_slots: PublicSlot[];
    inquiries: { total: number; new: number };
    public_path: string;
}

export interface InboxItem {
    source: 'inquiry' | 'slot_request';
    id: number;
    entry_id: number;
    site_name: string | null;
    kind: 'sponsorship' | 'acquisition' | 'partnership';
    name: string | null;
    email: string;
    company: string | null;
    budget: string | null;
    message: string | null;
    status: string;
    created_at: string | null;
    slot_request: {
        id: number;
        slot_name_at_request: string | null;
        price_cents_at_request: number;
        billing_period_at_request: string | null;
        status: string;
    } | null;
}

export interface SiteChoice {
    key: string;
    host: string;
    ga4: { property: string; displayName: string } | null;
    gsc: { siteUrl: string; permissionLevel?: string; kind: 'domain' | 'prefix' } | null;
    /** Already on the leaderboard (entry id). */
    listedAs: number | null;
    /** A GA4 property is required (visitors); a GSC site proves ownership. */
    canJoin: boolean;
    note?: string;
}

/** Result of a verification check as returned to the owner. */
export interface OwnershipOutcome {
    level: VerificationLevel;
    checkedAt: string;
    detail: VerificationDetail;
    message: string;
    fix: string[];
    /** The check could not run (token, quota, network). The stored level did not change. */
    transient: boolean;
}
