/**
 * GA4 Admin API answers for demo mode: accountSummaries, properties.get and
 * dataStreams.list (https://analyticsadmin.googleapis.com/v1beta).
 */

import type { DemoGoogleAccount, DemoSite } from './catalog';
import { findSiteByPropertyId, getDemoSite } from './catalog';
import { DemoApiError } from './ga4';
import { hashString } from './rng';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function demoAccountSummaries(account: DemoGoogleAccount): any {
    return {
        accountSummaries: account.gaAccounts.map(a => ({
            name: `accountSummaries/${a.account.split('/')[1]}`,
            account: a.account,
            displayName: a.displayName,
            propertySummaries: a.siteKeys
                .map(k => getDemoSite(k))
                .filter((s): s is DemoSite => !!s?.ga)
                .map(s => ({ property: s.ga!.propertyId, displayName: s.ga!.displayName, propertyType: 'PROPERTY_TYPE_ORDINARY', parent: a.account })),
        })),
    };
}

/** Simple list shape used by listAnalyticsProperties() and the admin plugin. */
export function demoPropertyList(account: DemoGoogleAccount): Array<{ displayName: string; property: string; parent: string }> {
    return demoAccountSummaries(account).accountSummaries.flatMap((a: any) =>
        a.propertySummaries.map((p: any) => ({ displayName: p.displayName, property: p.property, parent: p.parent })),
    );
}

function createTime(site: DemoSite): string {
    const daysAgo = site.launchedDaysAgo ?? 400 + (hashString(site.key) % 900);
    return new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace(/\.\d+Z$/, '.000Z');
}

export function demoProperty(propertyId: string): any {
    const site = findSiteByPropertyId(propertyId);
    if (!site?.ga) throw new DemoApiError(403, 'PERMISSION_DENIED', `The caller does not have permission (${propertyId}).`);
    return {
        name: site.ga.propertyId,
        propertyType: 'PROPERTY_TYPE_ORDINARY',
        createTime: createTime(site),
        updateTime: createTime(site),
        parent: site.ga.account,
        displayName: site.ga.displayName,
        industryCategory: site.kind === 'shop' ? 'SHOPPING' : site.kind === 'blog' ? 'HEALTHCARE' : site.kind === 'games' ? 'GAMES' : 'TECHNOLOGY',
        timeZone: site.ga.timeZone,
        currencyCode: site.ga.currencyCode,
        serviceLevel: 'GOOGLE_ANALYTICS_STANDARD',
        account: site.ga.account,
    };
}

export function demoDataStreams(propertyId: string): any {
    const site = findSiteByPropertyId(propertyId);
    if (!site?.ga) throw new DemoApiError(403, 'PERMISSION_DENIED', `The caller does not have permission (${propertyId}).`);
    const digits = /(\d+)/.exec(site.ga.propertyId)?.[1] || '0';
    const measurement = `G-${(hashString(site.key) >>> 0).toString(36).toUpperCase().padStart(10, 'X').slice(0, 10)}`;
    return {
        dataStreams: [
            {
                name: `${site.ga.propertyId}/dataStreams/${digits.slice(-6)}0001`,
                type: 'WEB_DATA_STREAM',
                displayName: `${site.host} – Web`,
                createTime: createTime(site),
                updateTime: createTime(site),
                webStreamData: { measurementId: measurement, firebaseAppId: '', defaultUri: `https://${site.host}` },
            },
        ],
    };
}
