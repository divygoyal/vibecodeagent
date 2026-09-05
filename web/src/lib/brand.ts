/**
 * Brand configuration — one codebase, two storefronts.
 *
 * - Production (trafficclaw.com) builds with no extra env: everything
 *   defaults to TrafficClaw, byte-for-byte the old behavior.
 * - The AItraffic cloud clone builds with:
 *     NEXT_PUBLIC_BRAND_NAME=AItraffic
 *     NEXT_PUBLIC_SITE_URL=https://cloud.aitraffic.dev
 *     NEXT_PUBLIC_LOGO_SRC=/logo-aitraffic.svg
 *     NEXT_PUBLIC_LOGO_LIGHT_SRC=/logo-light-aitraffic.svg

import { BRAND_NAME } from '@/lib/brand';
 *
 * Rule: user-visible copy uses BRAND_NAME / SITE_URL. Functional
 * identifiers (API paths, env names, container names, OAuth, DB values,
 * trafficclaw.com links inside prod-only code paths) stay untouched.
 */
export const BRAND_NAME =
    process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'TrafficClaw';

export const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://trafficclaw.com';

export const SITE_HOST = (() => {
    try {
        return new URL(SITE_URL).hostname;
    } catch {
        return 'trafficclaw.com';
    }
})();

export const LOGO_SRC =
    process.env.NEXT_PUBLIC_LOGO_SRC?.trim() || '/logo.svg';

export const LOGO_LIGHT_SRC =
    process.env.NEXT_PUBLIC_LOGO_LIGHT_SRC?.trim() || '/logo-light.svg';

export function isDefaultBrand(): boolean {
    return BRAND_NAME === 'TrafficClaw';
}
