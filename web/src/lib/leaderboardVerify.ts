import { getValidAccessToken } from '@/lib/googleApi';

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
