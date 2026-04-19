export const DEMO_QUERY_PARAM = 'demo';
export const DEMO_QUERY_VALUE = '1';
export const DEMO_PROPERTY_ID = '__trafficclaw_demo_property__';
export const DEMO_DOMAIN_LABEL = 'antigravity.codes';
export const DEMO_SITE_URL = 'https://antigravity.codes';

export function isDemoRequest(input: Request | URLSearchParams) {
    const searchParams = input instanceof URLSearchParams
        ? input
        : new URL(input.url).searchParams;

    return searchParams.get(DEMO_QUERY_PARAM) === DEMO_QUERY_VALUE;
}
