/**
 * Assertion suite for the two pure marketplace modules.
 *
 * There is no test runner in this repo (see AGENTS.md — `next build` is the
 * quality gate), so this follows the existing `src/services/chat/__eval__/run.ts`
 * pattern: a plain script run through tsx.
 *
 *     npm run check:pricing
 *
 * Exits non-zero on the first failure. Every case here is a claim the pricing
 * page makes to a publisher or a buyer, so a failure means the product is
 * lying, not just that a test is red.
 */

import {
    MAX_EFFECTIVE_CPM,
    MIN_EFFECTIVE_CPM,
    MIN_MONTHLY_PRICE_CENTS,
    MIN_SELLABLE_PAGEVIEWS,
    PLATFORM_FEE_PCT,
    computeSponsorshipQuote,
    resolveSponsorshipPrice,
} from '../sponsorshipPricing';
import { allocateBudget, applyTargeting, type AllocationCandidate } from '../sponsorshipAllocation';

let failures = 0;
let checks = 0;

function ok(label: string, condition: boolean, detail?: string) {
    checks += 1;
    if (condition) {
        console.log(`  pass  ${label}`);
    } else {
        failures += 1;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function eq(label: string, actual: unknown, expected: unknown) {
    ok(label, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipPricing — verification gate');
/* -------------------------------------------------------------------------- */

const unverified = computeSponsorshipQuote({
    monthly_pageviews: 80_000,
    engagement_rate: 55,
    verification_status: 'host_mismatch',
});
ok('host_mismatch is not sellable', !unverified.sellable);
eq('host_mismatch price is zero', unverified.suggestedMonthlyCents, 0);
ok('host_mismatch explains itself', unverified.reasons.length > 0);

const legacyVerified = computeSponsorshipQuote({
    monthly_pageviews: 20_000,
    is_verified: true,
    verification_status: null,
    category: 'SaaS',
});
ok('legacy is_verified=true is still sellable', legacyVerified.sellable);

const tooSmall = computeSponsorshipQuote({
    monthly_pageviews: MIN_SELLABLE_PAGEVIEWS - 1,
    verification_status: 'verified',
});
ok('under the pageview bar is not sellable', !tooSmall.sellable);

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipPricing — CPM stays inside the defensible band');
/* -------------------------------------------------------------------------- */

// Worst plausible site: cheap category, dead engagement, tier-3 geo. The
// multipliers want to take this to ~$1.10; the clamp must hold it at $2.00.
const weak = computeSponsorshipQuote({
    monthly_pageviews: 100_000,
    engagement_rate: 12,
    bounce_rate: 85,
    avg_session_duration: 15,
    primary_country: 'IN',
    category: 'Blog',
    verification_status: 'verified',
});
eq('weak site clamps up to the CPM floor', weak.effectiveCpm, MIN_EFFECTIVE_CPM);
ok('weak site records that the clamp bit', weak.cpmClamped);

// Best plausible site: dev tool, high engagement, long sessions, US.
const strong = computeSponsorshipQuote({
    monthly_pageviews: 40_000,
    engagement_rate: 68,
    bounce_rate: 24,
    avg_session_duration: 210,
    primary_country: 'US',
    category: 'Tool',
    verification_status: 'verified',
});
eq('strong site clamps down to the CPM ceiling', strong.effectiveCpm, MAX_EFFECTIVE_CPM);

// Sweep the whole realistic input space and assert the invariant directly.
const categories = ['Tool', 'SaaS', 'Agency', 'E-commerce', 'Blog', 'Other', null];
const countries = ['US', 'GB', 'DE', 'FR', 'JP', 'IN', 'BR', 'ZZ', null];
let sweepCount = 0;
let bandViolations = 0;
let floorPriced = 0;
for (const category of categories) {
    for (const primary_country of countries) {
        for (const engagement_rate of [5, 20, 35, 50, 65, 90]) {
            for (const monthly_pageviews of [1_000, 5_000, 25_000, 120_000, 600_000]) {
                const q = computeSponsorshipQuote({
                    monthly_pageviews,
                    engagement_rate,
                    bounce_rate: 100 - engagement_rate,
                    avg_session_duration: engagement_rate * 3,
                    primary_country,
                    category,
                    verification_status: 'verified',
                });
                sweepCount += 1;
                if (q.effectiveCpm < MIN_EFFECTIVE_CPM - 1e-9 || q.effectiveCpm > MAX_EFFECTIVE_CPM + 1e-9) {
                    bandViolations += 1;
                }
                if (q.floorApplied) floorPriced += 1;
                // Implied CPM may exceed the band only when the $25 price floor
                // is what set the price — and the quote must say so.
                if (q.impliedCpm > MAX_EFFECTIVE_CPM + 0.01 && !q.floorApplied) {
                    bandViolations += 1;
                }
            }
        }
    }
}
eq(`effectiveCpm inside $${MIN_EFFECTIVE_CPM}-$${MAX_EFFECTIVE_CPM} across ${sweepCount} combinations`, bandViolations, 0);
ok(
    `floor-priced quotes are flagged (${floorPriced} of ${sweepCount} hit the $${MIN_MONTHLY_PRICE_CENTS / 100} floor)`,
    floorPriced > 0,
);

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipPricing — arithmetic, floors and rounding');
/* -------------------------------------------------------------------------- */

// 12,000 pv x 0.85 = 10,200 impressions. SaaS $4.00 base, engagement 42% (1.0),
// bounce 58% (0.9), 75s (1.0), US (1.25) => $4.50 CPM => $45.90 => rounds to $45.
const worked = computeSponsorshipQuote({
    monthly_pageviews: 12_000,
    engagement_rate: 42,
    bounce_rate: 58,
    avg_session_duration: 75,
    primary_country: 'US',
    category: 'SaaS',
    verification_status: 'verified',
});
eq('worked example: impressions', worked.estimatedImpressions, 10_200);
eq('worked example: effective CPM', Number(worked.effectiveCpm.toFixed(2)), 4.5);
eq('worked example: suggested price', worked.suggestedMonthlyCents, 4_500);
eq(
    'worked example: publisher payout is list minus the platform fee',
    worked.publisherPayoutCents,
    Math.round(4_500 * (1 - PLATFORM_FEE_PCT / 100)),
);
ok('worked example: founding price is below list', worked.foundingMonthlyCents < worked.suggestedMonthlyCents);

const tiny = computeSponsorshipQuote({
    monthly_pageviews: 3_000,
    engagement_rate: 50,
    bounce_rate: 45,
    avg_session_duration: 100,
    primary_country: 'GB',
    category: 'Tool',
    verification_status: 'verified',
});
eq('small site is priced at the $25 floor', tiny.suggestedMonthlyCents, MIN_MONTHLY_PRICE_CENTS);
ok('small site discloses that the floor pushed its CPM up', tiny.floorApplied);
ok('small site implied CPM is above the band', tiny.impliedCpm > MAX_EFFECTIVE_CPM);

ok('prices are whole dollars', [weak, strong, worked, tiny].every((q) => q.suggestedMonthlyCents % 100 === 0));
ok(
    'prices under $100 land on a $5 boundary',
    [worked, tiny].every((q) => q.suggestedMonthlyCents >= 10_000 || q.suggestedMonthlyCents % 500 === 0),
);

// Monotonicity: more pageviews must never cost less, all else equal.
let monotonic = true;
let previous = -1;
for (const pv of [1_000, 2_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000]) {
    const price = computeSponsorshipQuote({
        monthly_pageviews: pv,
        engagement_rate: 45,
        bounce_rate: 50,
        avg_session_duration: 90,
        primary_country: 'US',
        category: 'SaaS',
        verification_status: 'verified',
    }).suggestedMonthlyCents;
    if (price < previous) monotonic = false;
    previous = price;
}
ok('price is monotonic in pageviews', monotonic);

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipPricing — publisher override resolution');
/* -------------------------------------------------------------------------- */

const entry = {
    monthly_pageviews: 60_000,
    engagement_rate: 55,
    bounce_rate: 40,
    avg_session_duration: 140,
    primary_country: 'US',
    category: 'Tool',
    verification_status: 'verified',
};

const noRow = resolveSponsorshipPrice(entry, null);
eq('missing listing row falls back to the computed price', noRow.priceSource, 'computed');
eq('missing listing row uses the suggestion verbatim', noRow.listPriceCents, noRow.suggestedMonthlyCents);
ok('missing listing row is bookable', noRow.acceptingRequests);

const overridden = resolveSponsorshipPrice(entry, { price_cents: 99_900 });
eq('publisher price wins', overridden.listPriceCents, 99_900);
eq('publisher price is labelled as such', overridden.priceSource, 'publisher');
eq('the computed suggestion is still returned alongside', overridden.suggestedMonthlyCents, noRow.suggestedMonthlyCents);

const nullPrice = resolveSponsorshipPrice(entry, { price_cents: null, accepting_requests: true });
eq('null price_cents inherits the computed price', nullPrice.priceSource, 'computed');

const paused = resolveSponsorshipPrice(entry, { accepting_requests: false });
ok('paused publisher is not bookable', !paused.acceptingRequests);
ok('paused publisher still has a visible price', paused.listPriceCents > 0);

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipAllocation — budget selection');
/* -------------------------------------------------------------------------- */

function candidate(
    entryId: number,
    priceCents: number,
    estimatedImpressions: number,
    extra: Partial<AllocationCandidate> = {},
): AllocationCandidate {
    return {
        entryId,
        name: `Site ${entryId}`,
        domain: `site${entryId}.com`,
        slug: `site-${entryId}`,
        category: 'Tool',
        primaryCountry: 'US',
        priceCents,
        estimatedImpressions,
        monthlyVisitors: Math.round(estimatedImpressions / 2.5),
        acceptingRequests: true,
        ...extra,
    };
}

const pool: AllocationCandidate[] = [
    candidate(1, 20_000, 40_000), //  2,000 impressions per $1... (per dollar: 200)
    candidate(2, 10_000, 30_000), // better efficiency
    candidate(3, 5_000, 8_000),
    candidate(4, 45_000, 60_000),
    candidate(5, 2_500, 3_000),
    candidate(6, 30_000, 25_000, { acceptingRequests: false }),
];

const plan = allocateBudget({ budgetCents: 40_000, candidates: pool });
ok('plan never exceeds the budget', plan.totalCostCents <= 40_000);
ok('paused publisher is excluded', !plan.selected.some((l) => l.entryId === 6));
ok('paused exclusion is explained', plan.skipped.some((l) => l.entryId === 6 && l.note.includes('not accepting')));
ok('most efficient site is picked first', plan.selected[0].entryId === 2);
ok('every selected line carries a reason', plan.selected.every((l) => l.note.length > 0));
ok('every skipped line carries a reason', plan.skipped.every((l) => l.note.length > 0));
ok('totals match the selected lines', plan.totalCostCents === plan.selected.reduce((t, l) => t + l.priceCents, 0));
ok(
    'reach total matches the selected lines',
    plan.totalImpressions === plan.selected.reduce((t, l) => t + l.estimatedImpressions, 0),
);
ok('utilisation is high on a well-fitting budget', plan.utilisationPct >= 90, `got ${plan.utilisationPct}%`);
ok('blended CPM is a real number', plan.blendedCpm > 0 && Number.isFinite(plan.blendedCpm));

const emptyBudget = allocateBudget({ budgetCents: 0, candidates: pool });
eq('zero budget selects nothing', emptyBudget.selected.length, 0);
eq('zero budget spends nothing', emptyBudget.totalCostCents, 0);
eq('zero budget still reports every candidate', emptyBudget.skipped.length, pool.length);

const capped = allocateBudget({ budgetCents: 1_000_000, candidates: pool, maxSites: 2 });
eq('maxSites is honoured', capped.selected.length, 2);

const spread = allocateBudget({ budgetCents: 40_000, candidates: pool, strategy: 'spread' });
ok(
    'spread strategy buys at least as many placements as reach strategy',
    spread.selected.length >= plan.selected.length,
    `spread=${spread.selected.length} reach=${plan.selected.length}`,
);

const pinnedPlan = allocateBudget({ budgetCents: 50_000, candidates: pool, pinnedIds: [4] });
ok('pinned site is included', pinnedPlan.selected.some((l) => l.entryId === 4));
ok('pinned site is labelled as user-added', pinnedPlan.selected.find((l) => l.entryId === 4)?.note === 'Added by you');

const pinnedTooBig = allocateBudget({ budgetCents: 1_000, candidates: pool, pinnedIds: [4] });
ok('unaffordable pinned site sets the over-budget flag', pinnedTooBig.pinnedOverBudget);
ok('unaffordable pinned site is not silently included', !pinnedTooBig.selected.some((l) => l.entryId === 4));

const withoutOne = allocateBudget({ budgetCents: 40_000, candidates: pool, excludedIds: [2] });
ok('excluded site is dropped', !withoutOne.selected.some((l) => l.entryId === 2));
ok('exclusion is explained', withoutOne.skipped.some((l) => l.entryId === 2 && l.note === 'Removed from this plan'));

// Determinism: identical inputs must produce an identical plan, or the UI
// reshuffles under the user's cursor.
const runA = allocateBudget({ budgetCents: 37_500, candidates: pool });
const runB = allocateBudget({ budgetCents: 37_500, candidates: [...pool].reverse() });
eq(
    'plan is order-independent and deterministic',
    runA.selected.map((l) => l.entryId).join(','),
    runB.selected.map((l) => l.entryId).join(','),
);

/* -------------------------------------------------------------------------- */
console.log('\nsponsorshipAllocation — targeting');
/* -------------------------------------------------------------------------- */

const mixed: AllocationCandidate[] = [
    candidate(10, 5_000, 10_000, { category: 'Blog', primaryCountry: 'IN', monthlyVisitors: 4_000 }),
    candidate(11, 8_000, 20_000, { category: 'Tool', primaryCountry: 'US', monthlyVisitors: 9_000 }),
    candidate(12, 60_000, 90_000, { category: 'SaaS', primaryCountry: 'US', monthlyVisitors: 40_000 }),
];

eq('empty filter keeps everything', applyTargeting(mixed, {}).length, 3);
eq('category filter is case-insensitive', applyTargeting(mixed, { categories: ['tool'] }).length, 1);
eq('country filter works', applyTargeting(mixed, { countries: ['US'] }).length, 2);
eq('minimum visitors filter works', applyTargeting(mixed, { minMonthlyVisitors: 10_000 }).length, 1);
eq('max price filter works', applyTargeting(mixed, { maxPriceCents: 10_000 }).length, 2);
eq(
    'filters compose',
    applyTargeting(mixed, { countries: ['US'], maxPriceCents: 10_000 }).length,
    1,
);

/* -------------------------------------------------------------------------- */
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
