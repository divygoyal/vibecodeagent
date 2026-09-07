/**
 * Suggested sponsorship pricing for a verified leaderboard entry.
 *
 * Pure module: no I/O, no imports, no clock, no randomness. Same input always
 * produces the same output, so it can be called from a server component, an
 * API route, the client bundle, or the check script in
 * `src/lib/__checks__/sponsorshipMarketplace.check.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE NUMBERS
 * ---------------------------------------------------------------------------
 * The formula is anchored to the only comparable public numbers for this exact
 * audience (small, technical, independent sites), not to invented rate cards:
 *
 *   - EthicalAds reports a real-world publisher CPM of roughly $2.50, against
 *     a gross CPM of roughly $6. That is the closest analogue we have: same
 *     kind of inventory, same kind of buyer, actually transacting.
 *   - Carbon Ads pays publishers only 60% and requires 10,000 pageviews.
 *     EthicalAds requires 50,000. Both exclude most sites on this leaderboard,
 *     which is why the floor here is deliberately much lower.
 *   - Paved (the booking marketplace this whole direction is modelled on)
 *     takes 30% and lets publishers set their own rates.
 *
 * So `effectiveCpm` is hard-clamped to $2.00-$8.00. $2.00 is roughly what a
 * weak content site actually earns per thousand impressions; $8.00 is a
 * defensible premium for a verified, engaged, tier-1-geo developer audience
 * bought direct. Anything outside that band is a number we cannot defend to a
 * buyer, so the clamp exists to stop the multipliers compounding into fiction.
 *
 * The platform take is 15% (see MARKETPLACE_PLAN.md section 12), deliberately
 * half of Paved's 30%, because at this volume the take rate is a positioning
 * decision rather than a revenue line.
 *
 * ---------------------------------------------------------------------------
 * THE FORMULA
 * ---------------------------------------------------------------------------
 *   impressions   = monthly_pageviews x SLOT_SHARE
 *   qualityMult   = engagementMult x bounceMult x durationMult
 *   effectiveCpm  = clamp(baseCpm(category) x qualityMult x geoMult, 2, 8)
 *   grossMonthly  = (impressions / 1000) x effectiveCpm
 *   suggested     = roundToBand(max(grossMonthly, MIN_MONTHLY_PRICE_CENTS))
 *
 * Every multiplier is a step function over a band, not a curve. Bands are
 * easier to argue with, easier to explain to a publisher, and do not imply
 * precision the underlying GA4 data does not have.
 */

/** Fraction of a site's monthly pageviews a single site-wide slot appears on.
 *  Not 1.0: no real placement renders on literally every page (checkout flows,
 *  error pages, app routes). 0.85 is a conservative haircut. */
export const SLOT_SHARE = 0.85;

/** Hard band on the effective CPM. See "WHY THESE NUMBERS" above. */
export const MIN_EFFECTIVE_CPM = 2.0;
export const MAX_EFFECTIVE_CPM = 8.0;

/** Below this, an invoice, an email thread and a manual placement cost more
 *  than the deal is worth. Sites under it are still listed, just priced at
 *  the floor with the implied CPM disclosed. */
export const MIN_MONTHLY_PRICE_CENTS = 2_500;

/** Under 1,000 monthly pageviews there is no inventory worth selling. This is
 *  the same order of magnitude as Mediavine Journey's 1,000-session bar, which
 *  is the lowest real bar in the display market. */
export const MIN_SELLABLE_PAGEVIEWS = 1_000;

/** TrafficClaw's cut. Paved takes 30%; 15% is a deliberate undercut. */
export const PLATFORM_FEE_PCT = 15;

/**
 * Launch discount, applied at render time and never inside the formula, so the
 * "list price" and the "what you actually pay today" number stay separable.
 *
 * Set to 0.6 (a 40% discount) rather than something more aggressive because
 * below roughly 0.6 the publisher's share falls under the ~$2.50 CPM
 * EthicalAds actually pays, at which point the offer stops being credible to
 * the publisher side even though those sites cannot join EthicalAds anyway.
 */
export const FOUNDING_RATE_MULTIPLIER = 0.6;

/** The one placement being sold during the demand test. Deliberately singular:
 *  a format taxonomy is worth inventing after someone has bought something. */
export const SLOT_LABEL = 'Site-wide sponsor slot, 30 days';

/* -------------------------------------------------------------------------- */
/* Multiplier tables                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Base CPM by the `category` values the leaderboard actually stores
 * (SaaS, E-commerce, Blog, Agency, Tool, Other). Matched case-insensitively.
 *
 * `Blog` sits at $2.50 because that is EthicalAds' measured publisher CPM for
 * content sites. Everything above it is a B2B-audience premium; `Tool` is
 * highest because a dev-tool audience is the one advertisers on this platform
 * are actually trying to reach.
 */
const CATEGORY_BASE_CPM: Record<string, number> = {
    tool: 4.5,
    saas: 4.0,
    agency: 3.5,
    'e-commerce': 3.0,
    ecommerce: 3.0,
    blog: 2.5,
    other: 3.0,
};

const DEFAULT_BASE_CPM = 3.0;

/** ISO-2 countries where an advertiser will pay a premium for the audience.
 *  Grouped by advertising market value, not by GDP. */
const GEO_TIER_1 = new Set(['US', 'CA', 'GB', 'AU', 'DE', 'CH', 'NO', 'SE', 'DK', 'NL', 'IE', 'NZ']);
const GEO_TIER_2 = new Set(['FR', 'IT', 'ES', 'AT', 'BE', 'FI', 'JP', 'SG', 'KR', 'IL', 'AE', 'HK']);
const GEO_TIER_3 = new Set(['IN', 'BR', 'ID', 'NG', 'PK', 'BD', 'VN', 'PH', 'EG', 'TR', 'MX', 'RU', 'UA']);

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** Exactly the GA4-derived fields already present on `leaderboard_entries`.
 *  Nothing here requires a new column or a new API call. */
export interface SponsorshipPricingInput {
    /** GA4 `screenPageViews` over the last 28 days. */
    monthly_pageviews: number | null | undefined;
    /** GA4 `engagementRate`, stored as a percentage (0-100). */
    engagement_rate?: number | null;
    /** GA4 `bounceRate`, stored as a percentage (0-100). */
    bounce_rate?: number | null;
    /** GA4 `averageSessionDuration` in seconds. */
    avg_session_duration?: number | null;
    /** ISO-2 top country from the daily refresh. */
    primary_country?: string | null;
    /** Leaderboard category label. */
    category?: string | null;
    /** `verified` | `host_mismatch` | `no_web_stream` | `pending` | `failed`. */
    verification_status?: string | null;
    /** Legacy verification flag; treated as equivalent to `verified`. */
    is_verified?: boolean | null;
}

/** A single named multiplier, kept in the output so the UI can show a buyer
 *  exactly why a price is what it is. Nothing is a black box. */
export interface PricingFactor {
    label: string;
    /** The input value that selected this band, pre-formatted for display. */
    detail: string;
    multiplier: number;
}

export interface SponsorshipQuote {
    /** False when there is nothing legitimately sellable. `reasons` says why. */
    sellable: boolean;
    reasons: string[];
    /** Monthly-window impressions the slot is estimated to receive. */
    estimatedImpressions: number;
    baseCpm: number;
    /** Post-multiplier, post-clamp CPM used for the arithmetic. */
    effectiveCpm: number;
    /** True when the $2-8 clamp actually bit, i.e. the multipliers wanted to
     *  leave the defensible band. Surfaced so the number is never silently
     *  massaged. */
    cpmClamped: boolean;
    factors: PricingFactor[];
    /** The headline suggested price, rounded. 0 when not sellable. */
    suggestedMonthlyCents: number;
    /** Suggested price with the founding discount applied. */
    foundingMonthlyCents: number;
    /** What the publisher receives after the platform fee, at list price. */
    publisherPayoutCents: number;
    /** Back-computed CPM of `suggestedMonthlyCents`. Diverges from
     *  `effectiveCpm` once the price floor or the rounding band bites — which
     *  is the whole reason it is returned. */
    impliedCpm: number;
    /** True when the floor pushed `impliedCpm` above MAX_EFFECTIVE_CPM. The UI
     *  must label these as floor-priced rather than market-priced. */
    floorApplied: boolean;
}

/* -------------------------------------------------------------------------- */
/* Band helpers                                                                */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function safeNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function baseCpmFor(category: string | null | undefined): { cpm: number; label: string } {
    const key = (category || '').trim().toLowerCase();
    const cpm = CATEGORY_BASE_CPM[key];
    if (cpm === undefined) {
        return { cpm: DEFAULT_BASE_CPM, label: category?.trim() || 'Uncategorised' };
    }
    return { cpm, label: category!.trim() };
}

/** Engagement rate is the single strongest quality signal GA4 gives us for
 *  free, so it carries the widest band (0.70-1.20). */
function engagementFactor(rate: number | null | undefined): PricingFactor {
    if (rate === null || rate === undefined || !Number.isFinite(rate)) {
        return { label: 'Engagement', detail: 'not reported', multiplier: 1.0 };
    }
    const pct = safeNumber(rate);
    const detail = `${pct.toFixed(0)}% engaged sessions`;
    if (pct >= 60) return { label: 'Engagement', detail, multiplier: 1.2 };
    if (pct >= 45) return { label: 'Engagement', detail, multiplier: 1.1 };
    if (pct >= 30) return { label: 'Engagement', detail, multiplier: 1.0 };
    if (pct >= 15) return { label: 'Engagement', detail, multiplier: 0.85 };
    return { label: 'Engagement', detail, multiplier: 0.7 };
}

/** Bounce rate overlaps with engagement rate, so its band is deliberately
 *  narrower (0.80-1.10) to avoid double-counting the same underlying signal. */
function bounceFactor(rate: number | null | undefined): PricingFactor {
    if (rate === null || rate === undefined || !Number.isFinite(rate) || rate === 0) {
        return { label: 'Bounce rate', detail: 'not reported', multiplier: 1.0 };
    }
    const pct = safeNumber(rate);
    const detail = `${pct.toFixed(0)}% bounce`;
    if (pct <= 30) return { label: 'Bounce rate', detail, multiplier: 1.1 };
    if (pct <= 55) return { label: 'Bounce rate', detail, multiplier: 1.0 };
    if (pct <= 75) return { label: 'Bounce rate', detail, multiplier: 0.9 };
    return { label: 'Bounce rate', detail, multiplier: 0.8 };
}

/** Time on site is what separates "someone glanced at a page" from "someone
 *  could plausibly have seen an ad". Narrow band (0.85-1.15). */
function durationFactor(seconds: number | null | undefined): PricingFactor {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds === 0) {
        return { label: 'Session length', detail: 'not reported', multiplier: 1.0 };
    }
    const s = safeNumber(seconds);
    const detail = s >= 60 ? `${Math.round(s / 60)}m ${Math.round(s % 60)}s average` : `${Math.round(s)}s average`;
    if (s >= 180) return { label: 'Session length', detail, multiplier: 1.15 };
    if (s >= 90) return { label: 'Session length', detail, multiplier: 1.05 };
    if (s >= 30) return { label: 'Session length', detail, multiplier: 1.0 };
    return { label: 'Session length', detail, multiplier: 0.85 };
}

function geoFactor(country: string | null | undefined): PricingFactor {
    const code = (country || '').trim().toUpperCase();
    if (!code) return { label: 'Top country', detail: 'not reported', multiplier: 0.9 };
    if (GEO_TIER_1.has(code)) return { label: 'Top country', detail: `${code} (tier 1)`, multiplier: 1.25 };
    if (GEO_TIER_2.has(code)) return { label: 'Top country', detail: `${code} (tier 2)`, multiplier: 1.05 };
    if (GEO_TIER_3.has(code)) return { label: 'Top country', detail: `${code} (tier 3)`, multiplier: 0.7 };
    return { label: 'Top country', detail: `${code} (unclassified)`, multiplier: 0.9 };
}

export function isEntryVerified(input: SponsorshipPricingInput): boolean {
    return input.verification_status === 'verified' || input.is_verified === true;
}

/**
 * Round to a band that looks like a price a human set. Under $100 to the
 * nearest $5, under $500 to the nearest $10, above that to the nearest $25.
 * Never rounds below the floor.
 */
export function roundPriceCents(cents: number): number {
    if (cents <= 0) return 0;
    const dollars = cents / 100;
    let rounded: number;
    if (dollars < 100) rounded = Math.round(dollars / 5) * 5;
    else if (dollars < 500) rounded = Math.round(dollars / 10) * 10;
    else rounded = Math.round(dollars / 25) * 25;
    return Math.max(rounded, MIN_MONTHLY_PRICE_CENTS / 100) * 100;
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compute a suggested 30-day sponsorship price from GA4 fields already stored
 * on the leaderboard entry.
 *
 * Returns `sellable: false` (with prices zeroed and a human-readable reason)
 * rather than throwing, so callers can render the profile either way.
 */
export function computeSponsorshipQuote(input: SponsorshipPricingInput): SponsorshipQuote {
    const pageviews = Math.max(0, Math.round(safeNumber(input.monthly_pageviews)));
    const { cpm: baseCpm, label: categoryLabel } = baseCpmFor(input.category);

    const engagement = engagementFactor(input.engagement_rate);
    const bounce = bounceFactor(input.bounce_rate);
    const duration = durationFactor(input.avg_session_duration);
    const geo = geoFactor(input.primary_country);
    const factors: PricingFactor[] = [
        { label: 'Category base CPM', detail: `${categoryLabel} · $${baseCpm.toFixed(2)}`, multiplier: 1 },
        engagement,
        bounce,
        duration,
        geo,
    ];

    const reasons: string[] = [];
    if (!isEntryVerified(input)) {
        reasons.push('Traffic is not GA4-verified yet, so there is nothing to price honestly.');
    }
    if (pageviews < MIN_SELLABLE_PAGEVIEWS) {
        reasons.push(
            `Under ${MIN_SELLABLE_PAGEVIEWS.toLocaleString('en-US')} monthly pageviews there is not enough inventory to sell.`,
        );
    }

    const rawCpm = baseCpm * engagement.multiplier * bounce.multiplier * duration.multiplier * geo.multiplier;
    const effectiveCpm = clamp(rawCpm, MIN_EFFECTIVE_CPM, MAX_EFFECTIVE_CPM);
    const cpmClamped = Math.abs(rawCpm - effectiveCpm) > 0.005;
    const estimatedImpressions = Math.round(pageviews * SLOT_SHARE);

    if (reasons.length > 0) {
        return {
            sellable: false,
            reasons,
            estimatedImpressions,
            baseCpm,
            effectiveCpm,
            cpmClamped,
            factors,
            suggestedMonthlyCents: 0,
            foundingMonthlyCents: 0,
            publisherPayoutCents: 0,
            impliedCpm: 0,
            floorApplied: false,
        };
    }

    const grossCents = Math.round((estimatedImpressions / 1000) * effectiveCpm * 100);
    const flooredCents = Math.max(grossCents, MIN_MONTHLY_PRICE_CENTS);
    const suggestedMonthlyCents = roundPriceCents(flooredCents);
    const impliedCpm =
        estimatedImpressions > 0 ? suggestedMonthlyCents / 100 / (estimatedImpressions / 1000) : 0;

    return {
        sellable: true,
        reasons: [],
        estimatedImpressions,
        baseCpm,
        effectiveCpm,
        cpmClamped,
        factors,
        suggestedMonthlyCents,
        foundingMonthlyCents: roundPriceCents(suggestedMonthlyCents * FOUNDING_RATE_MULTIPLIER),
        publisherPayoutCents: Math.round(suggestedMonthlyCents * (1 - PLATFORM_FEE_PCT / 100)),
        impliedCpm,
        floorApplied: impliedCpm > MAX_EFFECTIVE_CPM + 0.005,
    };
}

/* -------------------------------------------------------------------------- */
/* Publisher override resolution                                               */
/* -------------------------------------------------------------------------- */

/** A publisher's own pricing, from the `sponsorship_listings` table.
 *  A missing row means "use the computed price" — that is the whole contract. */
export interface PublisherListingOverride {
    /** Publisher's asking price. Null means inherit the computed price. */
    price_cents?: number | null;
    /** Publisher will not consider anything below this. Advisory to the buyer. */
    floor_cents?: number | null;
    /** Publisher has paused inventory. */
    accepting_requests?: boolean | null;
    /** Free text: "sidebar, above the fold" etc. Manual fulfilment needs it. */
    placement_note?: string | null;
}

export type PriceSource = 'publisher' | 'computed';

export interface ResolvedSponsorshipPrice extends SponsorshipQuote {
    /** The price actually shown to a buyer. */
    listPriceCents: number;
    /** Where `listPriceCents` came from. */
    priceSource: PriceSource;
    /** Publisher has paused inventory; the slot is listed but not bookable. */
    acceptingRequests: boolean;
    placementNote: string | null;
    floorCents: number | null;
}

/**
 * Layer a publisher's override on top of the computed quote.
 *
 * Resolution order is exactly: `price_cents` -> computed. There is no third
 * source and no silent fallback. `accepting_requests === false` keeps the
 * listing visible (so it still ranks and still earns backlinks) but marks it
 * unbookable, which is the behaviour that makes an unsold listing free to
 * leave up — the entire reason for choosing booking over an ad network.
 */
export function resolveSponsorshipPrice(
    input: SponsorshipPricingInput,
    override?: PublisherListingOverride | null,
): ResolvedSponsorshipPrice {
    const quote = computeSponsorshipQuote(input);
    const publisherPrice =
        override && typeof override.price_cents === 'number' && override.price_cents > 0
            ? Math.round(override.price_cents)
            : null;

    const listPriceCents = publisherPrice ?? quote.suggestedMonthlyCents;
    return {
        ...quote,
        listPriceCents,
        priceSource: publisherPrice !== null ? 'publisher' : 'computed',
        acceptingRequests: override?.accepting_requests !== false && quote.sellable,
        placementNote: override?.placement_note?.trim() || null,
        floorCents:
            override && typeof override.floor_cents === 'number' && override.floor_cents > 0
                ? Math.round(override.floor_cents)
                : null,
    };
}

/** `$1,240` — no cents, because every price here is a whole-dollar amount. */
export function formatCents(cents: number): string {
    return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
