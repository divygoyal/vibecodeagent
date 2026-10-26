import { getValidAccessToken, listSearchConsoleSites } from '@/lib/googleApi';
import { normalizeHost as pairingHost, siteCoversHost, siteKind } from '@/lib/sites/pairing';
import type { OwnershipOutcome, VerificationDetail, VerificationLevel } from '@/lib/leaderboard/types';

const GA_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

export type LeaderboardVerifyResult =
    | {
          ok: true;
          status: 'verified';
          expectedHost: string;
          actualHosts: string[];
          matchedHost: string;
      }
    | {
          ok: false;
          status: 'host_mismatch' | 'no_web_stream' | 'no_website_url' | 'failed';
          reason: string;
          expectedHost?: string;
          actualHosts?: string[];
      };

function normalizeHost(input: string | undefined | null): string | null {
    if (!input) return null;
    const raw = input.trim().toLowerCase();
    if (!raw) return null;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const host = new URL(withScheme).hostname.replace(/^www\./, '');
        return host || null;
    } catch {
        return null;
    }
}

function cleanPropertyId(id: string): string {
    return id.startsWith('properties/') ? id : `properties/${id.replace(/[^\d]/g, '')}`;
}

/**
 * Verify that a GA4 property reports traffic for the website the user claims.
 * Compares hosts case-insensitively with `www.` stripped. Multiple web streams
 * are allowed — match any one is enough.
 */
export async function verifyPropertyDomain(
    propertyId: string,
    websiteUrl: string,
    accessToken: string,
    refreshToken?: string,
): Promise<LeaderboardVerifyResult> {
    const expectedHost = normalizeHost(websiteUrl);
    if (!expectedHost) {
        return {
            ok: false,
            status: 'no_website_url',
            reason: 'Add a valid website URL so we can verify it matches your GA4 property.',
        };
    }

    let token: string;
    try {
        token = await getValidAccessToken(accessToken, refreshToken);
    } catch (err) {
        return {
            ok: false,
            status: 'failed',
            reason: `Could not refresh Google access token: ${err instanceof Error ? err.message : 'unknown error'}`,
            expectedHost,
        };
    }

    const url = `${GA_ADMIN_BASE}/${cleanPropertyId(propertyId)}/dataStreams`;
    let res: Response;
    try {
        res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
        });
    } catch (err) {
        return {
            ok: false,
            status: 'failed',
            reason: `GA4 Admin API request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            expectedHost,
        };
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
            ok: false,
            status: 'failed',
            reason: `GA4 Admin API returned ${res.status}: ${text.slice(0, 200)}`,
            expectedHost,
        };
    }

    type DataStream = {
        type?: string;
        webStreamData?: { defaultUri?: string };
    };
    const data = (await res.json()) as { dataStreams?: DataStream[] };
    const streams = data.dataStreams || [];

    const actualHosts = streams
        .filter((s) => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.defaultUri)
        .map((s) => normalizeHost(s.webStreamData!.defaultUri))
        .filter((h): h is string => !!h);

    if (actualHosts.length === 0) {
        return {
            ok: false,
            status: 'no_web_stream',
            reason: 'This GA4 property has no Web data stream. Pick a property that tracks a website.',
            expectedHost,
        };
    }

    const matchedHost = actualHosts.find((h) => h === expectedHost);
    if (!matchedHost) {
        return {
            ok: false,
            status: 'host_mismatch',
            reason: `GA4 property tracks ${actualHosts.join(', ')} but you entered ${expectedHost}. They must match.`,
            expectedHost,
            actualHosts,
        };
    }

    return {
        ok: true,
        status: 'verified',
        expectedHost,
        actualHosts,
        matchedHost,
    };
}

// ─── v3: Search Console ownership (PRODUCT.md 3) ─────────────────────────────

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

function googleStatus(err: unknown): number | null {
    const m = /Google API error (\d{3})/.exec(err instanceof Error ? err.message : '');
    return m ? Number(m[1]) : null;
}

function permissionName(level?: string): string {
    switch (level) {
        case 'siteRestrictedUser': return 'restricted';
        case 'siteUnverifiedUser': return 'unverified';
        default: return level || 'limited';
    }
}

export interface CheckOwnershipInput {
    websiteUrl: string;
    gaPropertyId?: string | null;
    accessToken?: string;
    refreshToken?: string;
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

/**
 * Run both checks. Search Console ownership decides the level; the GA4 data-stream
 * match is the second signal. A check that could not run (token, quota, network)
 * comes back `transient: true` so the caller keeps the stored level.
 */
export type OwnershipCheck = OwnershipOutcome & { gscSiteUrl: string | null; verifiedHost: string | null };

export async function checkOwnership(input: CheckOwnershipInput): Promise<OwnershipCheck> {
    const checkedAt = new Date().toISOString();
    const host = pairingHost(input.websiteUrl || '');
    const detail: VerificationDetail = { expected_host: host || undefined };

    const transient = (message: string): OwnershipCheck => ({
        level: 'none',
        checkedAt,
        detail: { ...detail, error: message },
        message,
        fix: ['Reconnect Google if this keeps happening, then press Re-check.'],
        transient: true,
        gscSiteUrl: null,
        verifiedHost: null,
    });

    if (!host || !host.includes('.')) {
        return {
            level: 'none', checkedAt, detail, transient: false, gscSiteUrl: null, verifiedHost: null,
            message: 'Add a valid website address so we can check it.',
            fix: ['Enter the site address (for example example.com).'],
        };
    }

    let token: string;
    try {
        token = await getValidAccessToken(input.accessToken, input.refreshToken);
    } catch (err) {
        return transient(`Could not reach Google with your saved sign-in: ${err instanceof Error ? err.message : 'unknown error'}.`);
    }

    // Search Console ownership.
    let sites: GscSiteEntry[] = [];
    try {
        sites = (await listSearchConsoleSites(token, AbortSignal.timeout(15_000))) as GscSiteEntry[];
        const cov = gscCoverage(sites, host);
        detail.gsc = {
            ok: cov.ok,
            reason: cov.reason,
            site_url: cov.site?.siteUrl ?? null,
            permission: cov.site?.permissionLevel ?? null,
            kind: cov.site ? siteKind(cov.site.siteUrl) : undefined,
        };
    } catch (err) {
        const status = googleStatus(err);
        if (status === 403 && /scope|insufficient/i.test(err instanceof Error ? err.message : '')) {
            detail.gsc = { ok: false, reason: 'no_scope', site_url: null, permission: null };
        } else {
            return transient(`Search Console did not answer${status ? ` (HTTP ${status})` : ''}. Try again in a minute.`);
        }
    }

    // GA4 data stream (second signal).
    if (input.gaPropertyId) {
        const ga = await verifyPropertyDomain(input.gaPropertyId, input.websiteUrl, input.accessToken || token, input.refreshToken);
        if (ga.ok) {
            detail.ga4 = { ok: true, reason: 'ok', hosts: ga.actualHosts };
        } else if (ga.status === 'failed') {
            // Could not read the property at all. Keep the Search Console result but note it.
            detail.ga4 = { ok: false, reason: 'api_error', hosts: [] };
        } else {
            detail.ga4 = { ok: false, reason: ga.status, hosts: ga.actualHosts || [] };
        }
    }

    const level: VerificationLevel = detail.gsc?.ok ? 'owner' : detail.ga4?.ok ? 'ga4' : 'none';
    const fix = level === 'owner' ? [] : buildFix(detail);
    let message: string;
    if (level === 'owner') {
        message = `Verified: you are an owner of ${detail.gsc?.site_url} in Search Console.`;
        if (detail.ga4 && !detail.ga4.ok) message += ' The Google Analytics property could not be matched, so the GA4 badge is off.';
    } else if (level === 'ga4') {
        message = `Google Analytics matches ${host}, but we could not confirm you own it in Search Console. Only verified owners are ranked.`;
    } else {
        message = `We could not verify ${host}. It is not listed publicly until it is verified.`;
    }
    detail.message = message;
    detail.fix = fix;

    return {
        level,
        checkedAt,
        detail,
        message,
        fix,
        transient: false,
        gscSiteUrl: detail.gsc?.site_url ?? null,
        verifiedHost: level === 'owner' ? host : null,
    };
}
