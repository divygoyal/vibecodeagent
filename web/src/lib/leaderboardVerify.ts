import { getValidAccessToken, listSearchConsoleSites } from '@/lib/googleApi';
import { credentialsForAsset, listLinkedGoogleConnections, loadUserInventory } from '@/lib/googleAccounts';
import { normalizeHost as pairingHost, siteKind } from '@/lib/sites/pairing';
import { buildFix, decideLevel, ga4StreamIsOwned, gscCoverage, type GscSiteEntry } from '@/lib/leaderboard/ownership';
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

function googleStatus(err: unknown): number | null {
    const m = /Google API error (\d{3})/.exec(err instanceof Error ? err.message : '');
    return m ? Number(m[1]) : null;
}

export interface CheckOwnershipInput {
    websiteUrl: string;
    gaPropertyId?: string | null;
    accessToken?: string;
    refreshToken?: string;
    /**
     * The owner (session user id). With extra Google accounts linked, Search Console sites of every
     * account count and the GA4 stream is read with the token of the account that lists the property.
     */
    userIdentifier?: string | null;
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

    // Linked Google accounts: Search Console sites of every account, GA4 through the property's account.
    const primaryCreds = { accessToken: input.accessToken, refreshToken: input.refreshToken };
    const linked = input.userIdentifier ? await listLinkedGoogleConnections(input.userIdentifier) : [];
    let gaCreds = primaryCreds;
    if (linked.length > 0 && input.gaPropertyId) {
        const c = await credentialsForAsset(input.userIdentifier!, { kind: 'ga4', id: input.gaPropertyId }, async () => primaryCreds);
        gaCreds = { accessToken: c.accessToken, refreshToken: c.refreshToken };
    }

    // Search Console ownership.
    let sites: GscSiteEntry[] = [];
    let ownerSite: GscSiteEntry | null = null;
    try {
        if (linked.length > 0) {
            const inv = await loadUserInventory(input.userIdentifier!, { primary: { ok: true, token }, linked });
            if (inv.sites.length === 0 && inv.errors.gsc) throw new Error(`Google API error ${inv.errors.gsc.status}: ${inv.errors.gsc.message}`);
            sites = inv.sites.map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel ?? '' })) as GscSiteEntry[];
        } else {
            sites = (await listSearchConsoleSites(token, AbortSignal.timeout(15_000))) as GscSiteEntry[];
        }
        const cov = gscCoverage(sites, host);
        ownerSite = cov.ok ? cov.site : null;
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
        const ga = gaCreds === primaryCreds
            ? await verifyPropertyDomain(input.gaPropertyId, input.websiteUrl, input.accessToken || token, input.refreshToken)
            : await verifyPropertyDomain(input.gaPropertyId, input.websiteUrl, gaCreds.accessToken ?? '', gaCreds.refreshToken);
        if (ga.ok) {
            detail.ga4 = { ok: true, reason: 'ok', hosts: ga.actualHosts };
        } else if (ga.status === 'failed') {
            // Could not read the property at all. Keep the Search Console result but note it.
            detail.ga4 = { ok: false, reason: 'api_error', hosts: [] };
        } else if (ga.status === 'host_mismatch' && ga4StreamIsOwned(ga.actualHosts || [], ownerSite)) {
            // The stream is for a subdomain the verified Search Console property covers.
            detail.ga4 = { ok: true, reason: 'ok', hosts: ga.actualHosts || [] };
        } else {
            detail.ga4 = { ok: false, reason: ga.status, hosts: ga.actualHosts || [] };
        }
    }

    const level: VerificationLevel = decideLevel(detail);
    const fix = level === 'owner' ? [] : buildFix(detail);
    let message: string;
    if (level === 'owner') {
        message = `Verified: you are an owner of ${detail.gsc?.site_url} in Search Console.`;
        if (detail.ga4 && !detail.ga4.ok) message += ' The Google Analytics property could not be matched, so the GA4 badge is off.';
    } else if (detail.gsc?.ok) {
        message = `You own ${detail.gsc.site_url} in Search Console, but the Google Analytics property tracks ${detail.ga4?.hosts.join(', ') || 'a different site'}, not ${host}. The numbers must come from this site's own property.`;
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
