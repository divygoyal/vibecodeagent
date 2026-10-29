/**
 * "Made with TrafficClaw": the small footer link on public dashboards (/view), share pages (/share) and embeds.
 * Pure helpers (no React) so the link and the switch can be tested.
 */
import { SITE_URL } from '@/lib/brand';

export type MadeWithKind = 'share' | 'embed' | 'view';

/**
 * Where the link goes. ?ref=<kind> is the attribution key (lib/growth/attribution.ts keeps it through sign-up);
 * the utm_* trio makes GA4 report the visit as source "trafficclaw-<kind>" without any setup.
 */
export function madeWithUrl(kind: MadeWithKind, origin: string = SITE_URL): string {
    const q = new URLSearchParams({ ref: kind, utm_source: 'trafficclaw', utm_medium: 'made-with', utm_campaign: kind });
    return `${origin.replace(/\/$/, '')}/?${q.toString()}`;
}

/**
 * Whether a public dashboard shows the footer. On by default; the owner can switch it off in the share dialog
 * (share.badge) or in Appearance (theme.badge.show). Either switch off hides it. Free either way.
 */
export function madeWithVisible(shareBadge: boolean | null | undefined, themeBadgeShow: boolean | null | undefined): boolean {
    return shareBadge !== false && themeBadgeShow !== false;
}

/** /share pages: the share config's branding.showWatermark switch (default on). */
export function shareMadeWithVisible(branding: { showWatermark?: boolean } | null | undefined): boolean {
    return branding?.showWatermark !== false;
}
