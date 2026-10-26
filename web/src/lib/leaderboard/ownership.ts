/**
 * Pure ownership rules for the leaderboard (no Google calls, so they are unit tested:
 * web/tests/leaderboard.test.mjs).
 */
import { siteCoversHost, siteKind } from '@/lib/sites/pairing';
import type { VerificationDetail } from './types';

const GSC_OWNER_LEVELS = new Set(['siteOwner', 'siteFullUser']);

export interface GscSiteEntry {
    siteUrl: string;
    permissionLevel?: string;
}

export interface GscCoverage {
    ok: boolean;
    reason: 'ok' | 'not_in_search_console' | 'restricted_access';
    site: GscSiteEntry | null;
}

/**
 * Does the Google account own the host in Search Console? Pure: callers pass the
 * `sites.list` result. A domain property (`sc-domain:`) covers the host and its
 * subdomains; a URL-prefix property counts when its host equals the claimed host
 * (www ignored). Only `siteOwner` / `siteFullUser` prove ownership.
 */
export function gscCoverage(sites: GscSiteEntry[], host: string): GscCoverage {
    const covering = sites.filter((s) => s.siteUrl && siteCoversHost(s.siteUrl, host));
    if (covering.length === 0) return { ok: false, reason: 'not_in_search_console', site: null };
    const owners = covering.filter((s) => GSC_OWNER_LEVELS.has(s.permissionLevel || ''));
    if (owners.length === 0) {
        return { ok: false, reason: 'restricted_access', site: covering[0] };
    }
    // Domain property first (covers subdomains and protocol variants), then the shortest URL.
    owners.sort((a, b) => {
        const ka = siteKind(a.siteUrl) === 'domain' ? 0 : 1;
        const kb = siteKind(b.siteUrl) === 'domain' ? 0 : 1;
        return ka - kb || a.siteUrl.length - b.siteUrl.length;
    });
    return { ok: true, reason: 'ok', site: owners[0] };
}


function permissionName(level?: string): string {
    switch (level) {
        case 'siteRestrictedUser': return 'restricted';
        case 'siteUnverifiedUser': return 'unverified';
        default: return level || 'limited';
    }
}

export function buildFix(detail: VerificationDetail): string[] {
    const host = detail.expected_host || 'your domain';
    const steps: string[] = [];
    const gsc = detail.gsc;
    if (gsc && !gsc.ok) {
        if (gsc.reason === 'not_in_search_console') {
            steps.push(
                `Add ${host} to Google Search Console (search.google.com/search-console). A Domain property covers every subdomain.`,
                'Verify it with the same Google account you signed in to TrafficClaw with.',
            );
        } else if (gsc.reason === 'restricted_access') {
            steps.push(
                `You only have ${permissionName(gsc.permission || undefined)} access to ${gsc.site_url}.`,
                'Ask an owner to make you a Full user or Owner (Search Console > Settings > Users and permissions), or verify the property yourself.',
            );
        } else if (gsc.reason === 'no_scope') {
            steps.push('Sign out and sign in with Google again, and allow read-only Search Console access.');
        }
    }
    const ga4 = detail.ga4;
    if (ga4 && !ga4.ok) {
        if (ga4.reason === 'host_mismatch') {
            steps.push(`This GA4 property tracks ${ga4.hosts.join(', ')}, not ${host}. Pick the GA4 property that tracks ${host}.`);
        } else if (ga4.reason === 'no_web_stream') {
            steps.push('This GA4 property has no web data stream. Pick a property that tracks a website.');
        }
    }
    if (steps.length > 0) steps.push('Then press Re-check.');
    return steps;
}

