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
