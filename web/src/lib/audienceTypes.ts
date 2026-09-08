/**
 * Audience intelligence for a verified leaderboard entry.
 *
 * This is the shared contract between the refresh cron (writer), the admin API
 * (storage: table `leaderboard_audience`), the public profile (reader) and the
 * sponsor index (reader). Every `share` is a percentage 0–100 of the 28-day
 * window, matching how engagement_rate / bounce_rate are already stored.
 *
 * Any section may be `null` when the source could not provide it — GA4
 * demographics are thresholded for small sites, GSC needs a matching property,
 * topics need a configured Gemini key. Readers must render nothing for a null
 * section rather than an empty state.
 *
 * Nothing in here is an input to ad-slot pricing. Publishers set their own
 * prices; this data sits beside a slot as context.
 */

export interface AudienceShare {
  name: string;
  share: number;
}

export interface AudienceCountry extends AudienceShare {
  /** ISO-3166 alpha-2 when known, e.g. "US". Absent for "Other". */
  iso2?: string;
}

export interface AudiencePage {
  path: string;
  views: number;
  share: number;
}

export interface AudienceQuery {
  query: string;
  clicks: number;
  impressions: number;
}

export interface AudienceTopic {
  /** Short label in the publisher's audience's own vocabulary, e.g. "SEO tooling". */
  label: string;
  /** Approximate share of search-driven visits, 0–100. Topics sum to ~100. */
  share: number;
  /** 2–4 real queries or paths that back the label, verbatim from the source. */
  evidence: string[];
}

export interface AudienceDemographics {
  age: AudienceShare[] | null;
  gender: AudienceShare[] | null;
}

export interface AudienceIntelligence {
  /** Top 6 countries by active users, plus an "Other" bucket when applicable. */
  countries: AudienceCountry[] | null;
  /** GA4 default channel groups — Organic Search, Direct, Referral, Organic Social, … */
  channels: AudienceShare[] | null;
  /** deviceCategory — desktop, mobile, tablet. */
  devices: AudienceShare[] | null;
  /** Top 8 page paths by views. */
  top_pages: AudiencePage[] | null;
  /** Top 5 cities by active users. */
  cities: AudienceShare[] | null;
  /** Top 20 GSC queries by clicks. null when no GSC property matched the host. */
  top_queries: AudienceQuery[] | null;
  /** 3–6 Gemini-labelled topics derived from queries + pages. null when not configured or not enough data. */
  topics: AudienceTopic[] | null;
  /** userAgeBracket / userGender. null when Google Signals is off or thresholded. */
  demographics: AudienceDemographics | null;
  /** GSC property the queries came from, e.g. "sc-domain:example.com". */
  gsc_site_url: string | null;
  /** Window the shares describe. Always "28d" today. */
  data_window: string;
  /** ISO timestamp of the last successful write. */
  refreshed_at: string | null;
}

/**
 * Wire shape the cron PUTs to /api/leaderboard/{entry_id}/audience.
 *
 * Every key is optional on purpose: the admin endpoint only writes keys that
 * are present, so a transient failure for one source omits that key and keeps
 * the previous value, while a definitive "not available" sends an explicit null.
 */
export type AudienceUpsertBody = Partial<Omit<AudienceIntelligence, "refreshed_at">>;

/** Convenience: the four labels the leaderboard list shows on a card. */
export function topicLabels(audience: Pick<AudienceIntelligence, "topics"> | null | undefined, max = 4): string[] {
  if (!audience?.topics) return [];
  return audience.topics
    .slice()
    .sort((a, b) => b.share - a.share)
    .slice(0, max)
    .map((t) => t.label);
}

/** Largest share in a list, or null. Used for "62% organic search" style headlines. */
export function leadShare<T extends AudienceShare>(items: T[] | null | undefined): T | null {
  if (!items || items.length === 0) return null;
  return items.reduce((best, cur) => (cur.share > best.share ? cur : best), items[0]);
}
