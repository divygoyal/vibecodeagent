/**
 * Budget allocation across multiple verified sites.
 *
 * Pure module: no I/O, no clock, no randomness, deterministic tie-breaking.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SELECTION PROBLEM, NOT A SPLIT
 * ---------------------------------------------------------------------------
 * The obvious implementation of "spread $1,000 across sites" is proportional:
 * give each site a share of the budget weighted by its traffic. That is wrong
 * here, and shipping it would produce quotes nobody can fulfil.
 *
 * A sponsorship in this marketplace is one whole 30-day slot on one site at
 * one price. You cannot buy 40% of it. The publisher places one creative by
 * hand. So allocation is: pick the subset of sites whose combined price fits
 * the budget. That is a 0/1 knapsack.
 *
 * Exact knapsack is unnecessary and actively undesirable — the advertiser has
 * to understand and edit the result, so the ordering needs to be explainable.
 * We use a greedy pass on impressions-per-dollar, then a top-up pass that
 * fills leftover budget with the largest still-affordable site. That is within
 * a few percent of optimal on realistic inputs and, more importantly, the
 * answer to "why is this site in my plan?" is always one sentence.
 *
 * ---------------------------------------------------------------------------
 * WHAT "REACH" MEANS HERE, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------
 * Totals are summed across sites. Audiences overlap — the same developer reads
 * several of these sites — so summed visitors is an upper bound on unique
 * reach, not a measurement. Callers must label it as estimated. We cannot
 * deduplicate without cross-site identity, which this platform deliberately
 * does not have.
 */

export type AllocationStrategy = 'reach' | 'spread';

/** One candidate site. Prices and metrics come from `sponsorshipPricing.ts`;
 *  this module never computes a price itself. */
export interface AllocationCandidate {
    entryId: number;
    name: string;
    /** Bare host, for display. */
    domain: string | null;
    slug: string | null;
    category: string | null;
    primaryCountry: string | null;
    /** The resolved list price — publisher override or computed. */
    priceCents: number;
    /** Estimated slot impressions over the 30-day window. */
    estimatedImpressions: number;
    /** GA4 monthly active users. Used for the headline reach number. */
    monthlyVisitors: number;
    /** False when the publisher has paused, or nothing is sellable. */
    acceptingRequests: boolean;
}

export interface AllocationOptions {
    budgetCents: number;
    candidates: AllocationCandidate[];
    /** `reach` maximises impressions per dollar. `spread` maximises the number
     *  of distinct sites, which is what someone buying logo placements wants. */
    strategy?: AllocationStrategy;
    /** Cap on how many sites end up in the plan. 0 or undefined means no cap. */
    maxSites?: number;
    /** Always include these if the budget allows, before the greedy pass. */
    pinnedIds?: readonly number[];
    /** Never include these. Set by the "remove" button in the UI. */
    excludedIds?: readonly number[];
}

export interface AllocationLine extends AllocationCandidate {
    /** Impressions per dollar spent — the greedy sort key. */
    efficiency: number;
    /** Why this line is or is not in the plan. Shown verbatim in the UI. */
    note: string;
    pinned: boolean;
}

export interface AllocationPlan {
    selected: AllocationLine[];
    /** Affordable-but-not-chosen and unaffordable candidates, each with a note. */
    skipped: AllocationLine[];
    totalCostCents: number;
    remainingCents: number;
    /** Sum of per-site impressions. Upper bound: audiences overlap. */
    totalImpressions: number;
    /** Sum of per-site monthly visitors. Upper bound for the same reason. */
    totalVisitors: number;
    /** Blended CPM of the whole plan. The single most useful sanity number:
     *  if this is above ~$8 the plan is expensive for what it delivers. */
    blendedCpm: number;
    /** Share of the budget actually deployed, 0-100. */
    utilisationPct: number;
    /** True when pinned sites alone cost more than the budget. The UI must say
     *  so rather than silently dropping a site the user explicitly asked for. */
    pinnedOverBudget: boolean;
}

function toLine(c: AllocationCandidate, note: string, pinned: boolean): AllocationLine {
    return {
        ...c,
        efficiency: c.priceCents > 0 ? c.estimatedImpressions / (c.priceCents / 100) : 0,
        note,
        pinned,
    };
}

/**
 * Deterministic comparator. Ties are broken all the way down to `entryId` so
 * the same inputs always yield the same plan — otherwise the UI would reshuffle
 * on every keystroke of the budget field.
 */
function compareForStrategy(strategy: AllocationStrategy) {
    return (a: AllocationLine, b: AllocationLine): number => {
        if (strategy === 'spread') {
            // Cheapest first: more distinct placements per dollar of budget.
            if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
            if (a.estimatedImpressions !== b.estimatedImpressions) {
                return b.estimatedImpressions - a.estimatedImpressions;
            }
            return a.entryId - b.entryId;
        }
        // 'reach': best impressions-per-dollar first.
        if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
        if (b.estimatedImpressions !== a.estimatedImpressions) {
            return b.estimatedImpressions - a.estimatedImpressions;
        }
        return a.entryId - b.entryId;
    };
}

/**
 * Propose an allocation of `budgetCents` across `candidates`.
 *
 * Order of operations:
 *   1. Drop excluded, unpriced and paused candidates (each gets a note).
 *   2. Take pinned candidates in strategy order, while they fit.
 *   3. Greedy pass in strategy order, while each fits and maxSites allows.
 *   4. Top-up pass: largest-impression site that still fits the remainder.
 *
 * Always returns a plan. An empty budget yields an empty `selected` list and
 * every candidate in `skipped` with a reason, which is a legitimate UI state.
 */
export function allocateBudget(options: AllocationOptions): AllocationPlan {
    const strategy = options.strategy ?? 'reach';
    const budgetCents = Math.max(0, Math.round(options.budgetCents || 0));
    const maxSites = options.maxSites && options.maxSites > 0 ? options.maxSites : Number.MAX_SAFE_INTEGER;
    const pinned = new Set(options.pinnedIds ?? []);
    const excluded = new Set(options.excludedIds ?? []);

    const skipped: AllocationLine[] = [];
    const eligible: AllocationLine[] = [];

    for (const c of options.candidates) {
        if (excluded.has(c.entryId)) {
            skipped.push(toLine(c, 'Removed from this plan', pinned.has(c.entryId)));
            continue;
        }
        if (!c.acceptingRequests) {
            skipped.push(toLine(c, 'Publisher is not accepting requests right now', false));
            continue;
        }
        if (!(c.priceCents > 0)) {
            skipped.push(toLine(c, 'No verified price available', false));
            continue;
        }
        eligible.push(toLine(c, '', pinned.has(c.entryId)));
    }

    const comparator = compareForStrategy(strategy);
    const pinnedLines = eligible.filter((l) => l.pinned).sort(comparator);
    const freeLines = eligible.filter((l) => !l.pinned).sort(comparator);

    const selected: AllocationLine[] = [];
    let spent = 0;
    let pinnedOverBudget = false;

    for (const line of pinnedLines) {
        if (spent + line.priceCents <= budgetCents && selected.length < maxSites) {
            selected.push({ ...line, note: 'Added by you' });
            spent += line.priceCents;
        } else {
            pinnedOverBudget = true;
            skipped.push({ ...line, note: 'You added this, but it does not fit the budget' });
        }
    }

    const leftovers: AllocationLine[] = [];
    for (const line of freeLines) {
        if (selected.length >= maxSites) {
            leftovers.push({ ...line, note: `Over the ${maxSites}-site limit` });
            continue;
        }
        if (spent + line.priceCents <= budgetCents) {
            selected.push({
                ...line,
                note:
                    strategy === 'spread'
                        ? 'Cheapest remaining placement'
                        : `${Math.round(line.efficiency).toLocaleString('en-US')} impressions per $1`,
            });
            spent += line.priceCents;
        } else {
            leftovers.push(line);
        }
    }

    // Top-up: the greedy pass can leave a gap that a single bigger site fills.
    // Sorted by impressions so the top-up buys the most reach the remainder can
    // afford, and by entryId so it stays deterministic.
    const remainderSorted = [...leftovers].sort(
        (a, b) => b.estimatedImpressions - a.estimatedImpressions || a.entryId - b.entryId,
    );
    const toppedUpIds = new Set<number>();
    for (const line of remainderSorted) {
        if (selected.length >= maxSites) break;
        if (line.note.startsWith('Over the')) continue;
        if (spent + line.priceCents <= budgetCents) {
            selected.push({ ...line, note: 'Fills the leftover budget' });
            spent += line.priceCents;
            toppedUpIds.add(line.entryId);
        }
    }

    for (const line of leftovers) {
        if (toppedUpIds.has(line.entryId)) continue;
        const shortfall = Math.max(1, Math.round((line.priceCents - (budgetCents - spent)) / 100));
        skipped.push({ ...line, note: line.note || `Needs $${shortfall.toLocaleString('en-US')} more budget` });
    }

    const totalImpressions = selected.reduce((t, l) => t + l.estimatedImpressions, 0);
    const totalVisitors = selected.reduce((t, l) => t + l.monthlyVisitors, 0);

    return {
        selected,
        skipped,
        totalCostCents: spent,
        remainingCents: Math.max(0, budgetCents - spent),
        totalImpressions,
        totalVisitors,
        blendedCpm: totalImpressions > 0 ? spent / 100 / (totalImpressions / 1000) : 0,
        utilisationPct: budgetCents > 0 ? Math.round((spent / budgetCents) * 100) : 0,
        pinnedOverBudget,
    };
}

/* -------------------------------------------------------------------------- */
/* Targeting filters                                                           */
/* -------------------------------------------------------------------------- */

export interface TargetingFilter {
    /** Category labels to keep. Empty means all. */
    categories?: readonly string[];
    /** ISO-2 country codes to keep. Empty means all. */
    countries?: readonly string[];
    minMonthlyVisitors?: number;
    maxPriceCents?: number;
}

/**
 * Apply targeting before allocation. Kept separate and pure so the UI can show
 * "142 verified sites -> 18 match your targeting -> 6 fit your budget", which
 * is the sequence a buyer needs to see to trust the plan.
 */
export function applyTargeting(
    candidates: readonly AllocationCandidate[],
    filter: TargetingFilter,
): AllocationCandidate[] {
    const cats = new Set((filter.categories ?? []).map((c) => c.toLowerCase()));
    const countries = new Set((filter.countries ?? []).map((c) => c.toUpperCase()));
    return candidates.filter((c) => {
        if (cats.size > 0 && !cats.has((c.category || '').toLowerCase())) return false;
        if (countries.size > 0 && !countries.has((c.primaryCountry || '').toUpperCase())) return false;
        if (filter.minMonthlyVisitors && c.monthlyVisitors < filter.minMonthlyVisitors) return false;
        if (filter.maxPriceCents && c.priceCents > filter.maxPriceCents) return false;
        return true;
    });
}
