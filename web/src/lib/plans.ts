/**
 * Plans and Ask-message allowances, client-safe (no server imports).
 *
 * The numbers mirror the two places that actually grant credits, so copy on
 * public pages never drifts from what the backend does:
 *   - admin/models.py `User.credits` default: credits every new account starts with.
 *   - app/api/webhooks/dodo/route.ts `PLANS`: credits per paid product, reset each month.
 * Change those first, then this file.
 *
 * Product IDs and the checkout URL are the same ones /dashboard/plan uses.
 */

import { getSafeRedirectUrl } from '@/lib/checkout';

/** Ask messages a new free account starts with (one time, not monthly). */
export const FREE_START_CREDITS = 5;

export type PaidPlanKey = 'growth' | 'pro';

export interface PaidPlan {
    key: PaidPlanKey;
    name: string;
    /** USD per month. */
    priceUsd: number;
    /** Ask messages per month (reset on renewal, no rollover). */
    credits: number;
    /** Dodo Payments product id (same as /dashboard/plan and the webhook). */
    productId: string;
    recommended?: boolean;
}

export const PAID_PLANS: readonly PaidPlan[] = [
    { key: 'growth', name: 'Growth', priceUsd: 19, credits: 50, productId: 'pdt_0NaLMM1bLW9wAbmxcsebm', recommended: true },
    { key: 'pro', name: 'Pro', priceUsd: 29, credits: 100, productId: 'pdt_0NaLMM4r23kncRahthuyj' },
];

/** Where checkout returns to; /dashboard/plan refreshes credits on `upgraded=true`. */
export const CHECKOUT_RETURN_PATH = '/dashboard/plan?upgraded=true';

/** The Dodo hosted checkout URL, built exactly like /dashboard/plan builds it. Browser only. */
export function dodoCheckoutUrl(productId: string, email: string): string {
    return `https://checkout.dodopayments.com/buy/${productId}?email=${encodeURIComponent(email)}&redirect_url=${encodeURIComponent(getSafeRedirectUrl(CHECKOUT_RETURN_PATH))}`;
}

/** "$0.38" per Ask message at a plan's price. */
export function pricePerMessage(plan: PaidPlan): string {
    return `$${(plan.priceUsd / plan.credits).toFixed(2)}`;
}

/** Ask messages a plan grants: per month for paid plans (Starter is legacy), once for Free. */
export function planAllowance(plan: string): number {
    if (plan === 'starter') return 50;
    return PAID_PLANS.find((p) => p.key === plan)?.credits ?? FREE_START_CREDITS;
}

export interface MessageBalance {
    /** What the plan grants (the meter's denominator). */
    allowance: number;
    /** Messages left in total (the one balance the backend keeps). */
    total: number;
    /** The part of `total` that is the plan's own allowance. */
    fromPlan: number;
    /**
     * Messages above the allowance (a grant, a referral, a seed). A renewal sets the balance back to
     * the allowance (webhook `reset_credits`), so these are used first and do not carry over.
     */
    bonus: number;
    /** Meter fill, 0-100: the plan part of the allowance. */
    pct: number;
    level: 'ok' | 'low' | 'out';
}

/**
 * Split the single credits balance into the plan allowance and bonus messages (round 5, audit item 31),
 * so the meter, the Plan page and the plan cards all say the same thing ("100 + 200 bonus").
 */
export function messageBalance(credits: number, plan: string): MessageBalance {
    const allowance = planAllowance(plan);
    const total = Math.max(0, Math.floor(credits));
    const fromPlan = Math.min(total, allowance);
    const bonus = Math.max(0, total - allowance);
    const pct = allowance > 0 ? Math.max(0, Math.min(100, (fromPlan / allowance) * 100)) : 0;
    const level = total === 0 ? 'out' : bonus === 0 && pct < 20 ? 'low' : 'ok';
    return { allowance, total, fromPlan, bonus, pct, level };
}
