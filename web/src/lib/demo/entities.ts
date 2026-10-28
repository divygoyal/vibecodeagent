/**
 * Dimension "entities" for GA4 reports. Each group (pages, traffic sources,
 * geography, devices, ...) is a list of entities. An entity carries the
 * values of every dimension in its group plus its share of traffic, so a
 * request for any combination of dimensions is answered by crossing groups.
 */

import type { DemoKind, DemoSite } from './catalog';
import { siteOrigin, slugify } from './catalog';
import { siteRates } from './series';
import { normalise, unit, zipfWeights } from './rng';

export interface Factors {
    /** Multiplies the engagement rate. */
    eng?: number;
    /** Multiplies the average session duration. */
    dur?: number;
    /** Multiplies the new-user share. */
    nu?: number;
}

export interface Entity {
    key: string;
    vals: Record<string, string>;
    /** Share of users and sessions (or reach for pages/events). */
    w: number;
    /** Share of page views. Defaults to w. */
    wPV?: number;
    /** Share of events. Defaults to wPV, then w. */
    wEv?: number;
    /** Share of key events. Defaults to w. */
    wKey?: number;
    /** Share of purchases and revenue. Defaults to wKey, then w. */
    wRev?: number;
    f?: Factors;
}

export interface Group {
    name: string;
    entities: Entity[];
}

/** Which group answers each GA4 dimension. Unknown dimensions return '(not set)'. */
export const DIMENSION_GROUP: Record<string, string> = {};
const GROUP_DIMS: Record<string, string[]> = {
    page: ['pagePath', 'pagePathPlusQueryString', 'pageTitle', 'unifiedScreenName', 'unifiedScreenClass', 'unifiedPagePathScreen', 'pageLocation', 'fullPageUrl', 'hostName', 'contentGroup', 'pagePathLevel1'],
    landing: ['landingPage', 'landingPagePlusQueryString'],
    source: ['sessionSource', 'sessionMedium', 'sessionSourceMedium', 'sessionDefaultChannelGroup', 'sessionPrimaryChannelGroup', 'sessionCampaignName', 'sessionCampaignId', 'sessionManualAdContent', 'sessionManualTerm', 'sessionSourcePlatform', 'firstUserSource', 'firstUserMedium', 'firstUserSourceMedium', 'firstUserDefaultChannelGroup', 'firstUserPrimaryChannelGroup', 'firstUserCampaignName', 'source', 'medium', 'sourceMedium', 'defaultChannelGroup', 'primaryChannelGroup', 'campaignName', 'pageReferrer', 'sessionGoogleAdsQuery'],
    geo: ['country', 'countryId', 'city', 'cityId', 'region', 'continent', 'continentId', 'subContinent'],
    device: ['deviceCategory', 'operatingSystem', 'operatingSystemVersion', 'operatingSystemWithVersion', 'browser', 'browserVersion', 'platform', 'platformDeviceCategory', 'mobileDeviceBranding', 'mobileDeviceModel', 'mobileDeviceMarketingName', 'deviceModel', 'screenResolution'],
    language: ['language', 'languageCode'],
    event: ['eventName', 'isKeyEvent', 'isConversionEvent'],
    nvr: ['newVsReturning'],
    age: ['userAgeBracket'],
    gender: ['userGender'],
    item: ['itemName', 'itemId', 'itemCategory', 'itemBrand', 'itemVariant', 'itemListName'],
    link: ['linkUrl', 'linkDomain', 'outbound', 'linkText', 'fileName', 'fileExtension'],
    search: ['searchTerm'],
    stream: ['streamId', 'streamName', 'audienceName', 'audienceId', 'appVersion'],
};
for (const [group, dims] of Object.entries(GROUP_DIMS)) {
    for (const d of dims) DIMENSION_GROUP[d] = group;
}

// ─── Geography ───

interface CountryDef {
    name: string;
    iso2: string;
    iso3: string;
    continent: string;
    sub: string;
    lang: string;
    cities: Array<[string, string]>; // [city, region]
}

export const COUNTRIES: CountryDef[] = [
    { name: 'United States', iso2: 'US', iso3: 'usa', continent: 'Americas', sub: 'Northern America', lang: 'English', cities: [['New York', 'New York'], ['San Francisco', 'California'], ['Los Angeles', 'California'], ['Chicago', 'Illinois'], ['Austin', 'Texas'], ['Seattle', 'Washington'], ['Boston', 'Massachusetts'], ['Denver', 'Colorado'], ['Atlanta', 'Georgia'], ['Miami', 'Florida']] },
    { name: 'India', iso2: 'IN', iso3: 'ind', continent: 'Asia', sub: 'Southern Asia', lang: 'English', cities: [['Bangalore', 'Karnataka'], ['Mumbai', 'Maharashtra'], ['Delhi', 'Delhi'], ['Hyderabad', 'Telangana'], ['Pune', 'Maharashtra'], ['Chennai', 'Tamil Nadu']] },
    { name: 'United Kingdom', iso2: 'GB', iso3: 'gbr', continent: 'Europe', sub: 'Northern Europe', lang: 'English', cities: [['London', 'England']] },
    { name: 'Canada', iso2: 'CA', iso3: 'can', continent: 'Americas', sub: 'Northern America', lang: 'English', cities: [['Toronto', 'Ontario'], ['Vancouver', 'British Columbia'], ['Montreal', 'Quebec']] },
    { name: 'Germany', iso2: 'DE', iso3: 'deu', continent: 'Europe', sub: 'Western Europe', lang: 'German', cities: [['Berlin', 'Berlin'], ['Munich', 'Bavaria']] },
    { name: 'Australia', iso2: 'AU', iso3: 'aus', continent: 'Oceania', sub: 'Australasia', lang: 'English', cities: [['Sydney', 'New South Wales'], ['Melbourne', 'Victoria'], ['Perth', 'Western Australia']] },
    { name: 'France', iso2: 'FR', iso3: 'fra', continent: 'Europe', sub: 'Western Europe', lang: 'French', cities: [['Paris', 'Ile-de-France']] },
    { name: 'Netherlands', iso2: 'NL', iso3: 'nld', continent: 'Europe', sub: 'Western Europe', lang: 'Dutch', cities: [['Amsterdam', 'North Holland']] },
    { name: 'Brazil', iso2: 'BR', iso3: 'bra', continent: 'Americas', sub: 'South America', lang: 'Portuguese', cities: [['São Paulo', 'State of Sao Paulo'], ['Rio de Janeiro', 'State of Rio de Janeiro']] },
    { name: 'Spain', iso2: 'ES', iso3: 'esp', continent: 'Europe', sub: 'Southern Europe', lang: 'Spanish', cities: [['Madrid', 'Community of Madrid'], ['Barcelona', 'Catalonia']] },
    { name: 'Japan', iso2: 'JP', iso3: 'jpn', continent: 'Asia', sub: 'Eastern Asia', lang: 'Japanese', cities: [['Tokyo', 'Tokyo'], ['Osaka', 'Osaka']] },
    { name: 'Singapore', iso2: 'SG', iso3: 'sgp', continent: 'Asia', sub: 'Southeast Asia', lang: 'English', cities: [['Singapore', 'Singapore']] },
    { name: 'Sweden', iso2: 'SE', iso3: 'swe', continent: 'Europe', sub: 'Northern Europe', lang: 'Swedish', cities: [['Stockholm', 'Stockholm County']] },
    { name: 'Ireland', iso2: 'IE', iso3: 'irl', continent: 'Europe', sub: 'Northern Europe', lang: 'English', cities: [['Dublin', 'County Dublin']] },
    { name: 'Poland', iso2: 'PL', iso3: 'pol', continent: 'Europe', sub: 'Eastern Europe', lang: 'Polish', cities: [['Warsaw', 'Masovian Voivodeship']] },
    { name: 'Mexico', iso2: 'MX', iso3: 'mex', continent: 'Americas', sub: 'Central America', lang: 'Spanish', cities: [['Mexico City', 'Mexico City']] },
    { name: 'Philippines', iso2: 'PH', iso3: 'phl', continent: 'Asia', sub: 'Southeast Asia', lang: 'English', cities: [['Manila', 'Metro Manila']] },
    { name: 'Nigeria', iso2: 'NG', iso3: 'nga', continent: 'Africa', sub: 'Western Africa', lang: 'English', cities: [['Lagos', 'Lagos']] },
    { name: 'South Africa', iso2: 'ZA', iso3: 'zaf', continent: 'Africa', sub: 'Southern Africa', lang: 'English', cities: [['Johannesburg', 'Gauteng'], ['Cape Town', 'Western Cape']] },
    { name: 'Italy', iso2: 'IT', iso3: 'ita', continent: 'Europe', sub: 'Southern Europe', lang: 'Italian', cities: [['Milan', 'Lombardy'], ['Rome', 'Lazio']] },
    { name: 'Switzerland', iso2: 'CH', iso3: 'che', continent: 'Europe', sub: 'Western Europe', lang: 'German', cities: [['Zurich', 'Zurich']] },
    { name: 'United Arab Emirates', iso2: 'AE', iso3: 'are', continent: 'Asia', sub: 'Western Asia', lang: 'English', cities: [['Dubai', 'Dubai']] },
    { name: 'South Korea', iso2: 'KR', iso3: 'kor', continent: 'Asia', sub: 'Eastern Asia', lang: 'Korean', cities: [['Seoul', 'Seoul']] },
    { name: 'Indonesia', iso2: 'ID', iso3: 'idn', continent: 'Asia', sub: 'Southeast Asia', lang: 'Indonesian', cities: [['Jakarta', 'Jakarta']] },
    { name: 'Pakistan', iso2: 'PK', iso3: 'pak', continent: 'Asia', sub: 'Southern Asia', lang: 'English', cities: [['Karachi', 'Sindh'], ['Lahore', 'Punjab']] },
    { name: 'Turkey', iso2: 'TR', iso3: 'tur', continent: 'Asia', sub: 'Western Asia', lang: 'Turkish', cities: [['Istanbul', 'Istanbul']] },
    { name: 'Argentina', iso2: 'AR', iso3: 'arg', continent: 'Americas', sub: 'South America', lang: 'Spanish', cities: [['Buenos Aires', 'Buenos Aires']] },
];

const AUDIENCE_SHARES: Record<DemoSite['audience'], Record<string, number>> = {
    us: { US: 46, IN: 8, GB: 8, CA: 6, DE: 4.5, AU: 3.5, FR: 2.5, NL: 2, BR: 2.5, ES: 1.5, JP: 1.2, SG: 1, SE: 1, IE: 1, PL: 1, MX: 1.2, PH: 1.2, NG: 0.8, ZA: 0.8, IT: 1.2, CH: 0.6, AE: 0.6, KR: 0.5, ID: 0.8, PK: 0.8, TR: 0.6, AR: 0.5 },
    global: { US: 24, IN: 14, GB: 7, DE: 5, BR: 5, CA: 4, FR: 4, AU: 3, JP: 3, ES: 3, MX: 2.5, ID: 2.5, PH: 2.5, IT: 2, NL: 2, PL: 2, TR: 2, PK: 2, NG: 1.5, KR: 1.5, ZA: 1, AR: 1.5, SE: 1, SG: 1, IE: 0.7, CH: 0.7, AE: 0.8 },
    eu: { DE: 20, NL: 12, GB: 12, US: 12, FR: 10, ES: 5, IT: 5, SE: 4, PL: 4, CH: 3, IE: 2, IN: 4, CA: 2, AU: 1.5, BR: 1, JP: 0.8, SG: 0.6, TR: 0.8, AE: 0.4 },
    in: { IN: 62, US: 10, AE: 5, GB: 4, SG: 3, CA: 3, AU: 2, PK: 3, DE: 1.5, ID: 1.5, PH: 1, NG: 1, ZA: 0.5 },
};

const LANG_CODES: Record<string, string> = {
    English: 'en-us', German: 'de-de', French: 'fr-fr', Dutch: 'nl-nl', Portuguese: 'pt-br', Spanish: 'es-es', Japanese: 'ja-jp',
    Swedish: 'sv-se', Polish: 'pl-pl', Italian: 'it-it', Korean: 'ko-kr', Indonesian: 'id-id', Turkish: 'tr-tr', Hindi: 'hi-in', Chinese: 'zh-cn',
};

export function countryShares(site: DemoSite): Array<{ def: CountryDef; share: number }> {
    const shares = AUDIENCE_SHARES[site.audience];
    const list = COUNTRIES.filter(c => shares[c.iso2]).map(c => ({ def: c, share: shares[c.iso2] * (0.85 + 0.3 * unit(site.key, 'cty', c.iso2)) }));
    const norm = normalise(list.map(l => l.share));
    return list.map((l, i) => ({ def: l.def, share: norm[i] })).sort((a, b) => b.share - a.share);
}

function geoGroup(site: DemoSite): Group {
    const entities: Entity[] = [];
    for (const { def, share } of countryShares(site)) {
        const cityW = zipfWeights(def.cities.length, 1.1, `${site.key}|${def.iso2}`);
        def.cities.forEach(([city, region], i) => {
            entities.push({
                key: `${def.iso2}|${city}`,
                w: share * 0.93 * cityW[i],
                vals: { country: def.name, countryId: def.iso2, city, cityId: String(1000000 + (Math.abs(hashCode(city)) % 8999999)), region, continent: def.continent, continentId: def.continent.slice(0, 3).toUpperCase(), subContinent: def.sub },
                f: { eng: 0.9 + 0.2 * unit(site.key, 'geo-eng', city), dur: 0.85 + 0.3 * unit(site.key, 'geo-dur', city) },
            });
        });
        entities.push({
            key: `${def.iso2}|(not set)`,
            w: share * 0.07,
            vals: { country: def.name, countryId: def.iso2, city: '(not set)', cityId: '(not set)', region: '(not set)', continent: def.continent, continentId: def.continent.slice(0, 3).toUpperCase(), subContinent: def.sub },
        });
    }
    return { name: 'geo', entities };
}

function languageGroup(site: DemoSite): Group {
    const byLang = new Map<string, number>();
    for (const { def, share } of countryShares(site)) {
        // Most visitors outside English-speaking countries still browse in English.
        const local = def.lang === 'English' ? 1 : 0.55;
        byLang.set(def.lang, (byLang.get(def.lang) || 0) + share * local);
        if (local < 1) byLang.set('English', (byLang.get('English') || 0) + share * (1 - local));
    }
    if (site.audience === 'in') byLang.set('Hindi', (byLang.get('Hindi') || 0) + 0.04);
    byLang.set('Chinese', (byLang.get('Chinese') || 0) + 0.008);
    const entries = [...byLang.entries()].sort((a, b) => b[1] - a[1]);
    const w = normalise(entries.map(e => e[1]));
    return {
        name: 'language',
        entities: entries.map(([lang], i) => ({ key: lang, w: w[i], vals: { language: lang, languageCode: LANG_CODES[lang] || 'en-us' } })),
    };
}

function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
}

// ─── Devices ───

const DESKTOP_SHARE: Record<DemoKind, number> = { saas: 0.72, docs: 0.86, agency: 0.6, blog: 0.34, games: 0.45, shop: 0.38, recipes: 0.24 };

function deviceGroup(site: DemoSite): Group {
    const desktop = DESKTOP_SHARE[site.kind];
    const tablet = site.kind === 'recipes' || site.kind === 'games' ? 0.06 : 0.03;
    const mobile = 1 - desktop - tablet;
    const rows: Array<[string, string, string, string, string, string, string, number, number]> = [
        // category, os, osVersion, browser, browserVersion, brand, resolution, share within category, (unused)
        ['desktop', 'Windows', '10', 'Chrome', '131.0.0.0', 'Microsoft', '1920x1080', 0.4, 0],
        ['desktop', 'Macintosh', '10.15.7', 'Chrome', '131.0.0.0', 'Apple', '1440x900', 0.22, 0],
        ['desktop', 'Macintosh', '10.15.7', 'Safari', '18.1', 'Apple', '1512x982', 0.12, 0],
        ['desktop', 'Windows', '10', 'Edge', '131.0.0.0', 'Microsoft', '1536x864', 0.12, 0],
        ['desktop', 'Windows', '10', 'Firefox', '133.0', 'Microsoft', '1920x1080', 0.05, 0],
        ['desktop', 'Linux', '(not set)', 'Firefox', '133.0', '(not set)', '2560x1440', 0.05, 0],
        ['desktop', 'Chrome OS', '15633.69.0', 'Chrome', '130.0.0.0', 'Google', '1366x768', 0.04, 0],
        ['mobile', 'iOS', '18.1.1', 'Safari', '18.1', 'Apple', '390x844', 0.47, 0],
        ['mobile', 'Android', '14', 'Chrome', '131.0.0.0', 'Samsung', '412x915', 0.22, 0],
        ['mobile', 'Android', '15', 'Chrome', '131.0.0.0', 'Google', '412x892', 0.14, 0],
        ['mobile', 'iOS', '18.1.1', 'Chrome', '131.0.6778.73', 'Apple', '393x852', 0.08, 0],
        ['mobile', 'Android', '14', 'Samsung Internet', '26.0', 'Samsung', '384x832', 0.06, 0],
        ['mobile', 'Android', '13', 'Chrome', '130.0.0.0', 'Xiaomi', '393x873', 0.03, 0],
        ['tablet', 'iOS', '18.1.1', 'Safari', '18.1', 'Apple', '820x1180', 0.75, 0],
        ['tablet', 'Android', '14', 'Chrome', '131.0.0.0', 'Samsung', '800x1280', 0.25, 0],
    ];
    const catShare: Record<string, number> = { desktop, mobile, tablet };
    const factors: Record<string, Factors> = {
        desktop: { eng: 1.06, dur: 1.18 },
        mobile: { eng: 0.92, dur: 0.72 },
        tablet: { eng: 0.97, dur: 0.88 },
    };
    return {
        name: 'device',
        entities: rows.map(([cat, os, osv, browser, bv, brand, res, share]) => ({
            key: `${cat}|${os}|${browser}|${brand}`,
            w: catShare[cat] * share,
            vals: {
                deviceCategory: cat,
                platformDeviceCategory: `web / ${cat}`,
                operatingSystem: os,
                operatingSystemVersion: osv,
                operatingSystemWithVersion: osv === '(not set)' ? os : `${os} ${osv}`,
                browser,
                browserVersion: bv,
                platform: 'web',
                mobileDeviceBranding: brand,
                mobileDeviceModel: cat === 'desktop' ? '(not set)' : brand === 'Apple' ? (cat === 'tablet' ? 'iPad' : 'iPhone') : brand === 'Google' ? 'Pixel 8' : 'Galaxy S24',
                mobileDeviceMarketingName: cat === 'desktop' ? '(not set)' : brand === 'Apple' ? (cat === 'tablet' ? 'iPad' : 'iPhone') : brand === 'Google' ? 'Pixel 8' : 'Galaxy S24',
                deviceModel: cat === 'desktop' ? (os === 'Macintosh' ? 'Macintosh' : '(not set)') : brand === 'Apple' ? 'iPhone' : 'SM-S921B',
                screenResolution: res,
            },
            f: factors[cat],
        })),
    };
}

// ─── Traffic sources ───

type SourceRow = [source: string, medium: string, channel: string, campaign: string, share: number, eng: number, conv: number];

function sourceRows(kind: DemoKind): SourceRow[] {
    const organic: SourceRow[] = [
        ['google', 'organic', 'Organic Search', '(organic)', 0.86, 1.05, 1],
        ['bing', 'organic', 'Organic Search', '(organic)', 0.07, 1.05, 1.1],
        ['duckduckgo', 'organic', 'Organic Search', '(organic)', 0.04, 1.1, 1],
        ['yahoo', 'organic', 'Organic Search', '(organic)', 0.015, 0.95, 0.8],
        ['ecosia.org', 'organic', 'Organic Search', '(organic)', 0.015, 1, 0.9],
    ];
    const direct: SourceRow[] = [['(direct)', '(none)', 'Direct', '(direct)', 1, 1.08, 1.4]];
    const referral: SourceRow[] = [
        ['chatgpt.com', 'referral', 'Referral', '(referral)', 0.3, 1.25, 1.8],
        ['perplexity.ai', 'referral', 'Referral', '(referral)', 0.09, 1.2, 1.6],
        ['gemini.google.com', 'referral', 'Referral', '(referral)', 0.05, 1.15, 1.4],
        ['claude.ai', 'referral', 'Referral', '(referral)', 0.04, 1.2, 1.7],
        ['github.com', 'referral', 'Referral', '(referral)', kind === 'saas' || kind === 'docs' ? 0.16 : 0.03, 1.1, 1.2],
        ['news.ycombinator.com', 'referral', 'Referral', '(referral)', 0.1, 0.85, 0.6],
        ['producthunt.com', 'referral', 'Referral', '(referral)', 0.06, 0.9, 1.1],
        ['medium.com', 'referral', 'Referral', '(referral)', 0.1, 0.95, 0.7],
        ['g2.com', 'referral', 'Referral', '(referral)', kind === 'saas' ? 0.08 : 0.01, 1.2, 2.2],
    ];
    const social: SourceRow[] = [
        ['reddit.com', 'referral', 'Organic Social', '(referral)', 0.3, 0.9, 0.7],
        ['linkedin.com', 'referral', 'Organic Social', '(referral)', kind === 'saas' || kind === 'agency' ? 0.28 : 0.06, 0.95, 1],
        ['t.co', 'referral', 'Organic Social', '(referral)', 0.16, 0.8, 0.6],
        ['facebook.com', 'referral', 'Organic Social', '(referral)', 0.1, 0.85, 0.8],
        ['youtube.com', 'referral', 'Organic Social', '(referral)', 0.07, 1, 0.9],
        ['pinterest.com', 'referral', 'Organic Social', '(referral)', kind === 'blog' || kind === 'shop' ? 0.35 : 0.02, 0.9, 1],
    ];
    const email: SourceRow[] = [
        ['newsletter', 'email', 'Email', 'weekly-digest', 0.7, 1.15, 1.6],
        ['mailchimp', 'email', 'Email', 'product-update', 0.3, 1.1, 1.5],
    ];
    const paidSearch: SourceRow[] = [
        ['google', 'cpc', 'Paid Search', 'brand-search', 0.55, 1, 1.9],
        ['google', 'cpc', 'Paid Search', 'generic-search', 0.35, 0.85, 1.2],
        ['bing', 'cpc', 'Paid Search', 'generic-search', 0.1, 0.85, 1.1],
    ];
    const paidSocial: SourceRow[] = [
        ['facebook', 'paid', 'Paid Social', 'holiday-sale', 0.6, 0.75, 1.1],
        ['instagram', 'paid', 'Paid Social', 'holiday-sale', 0.4, 0.7, 1],
    ];
    const unassigned: SourceRow[] = [['(not set)', '(not set)', 'Unassigned', '(not set)', 1, 0.6, 0.3]];

    const mixes: Record<DemoKind, Array<[SourceRow[], number]>> = {
        saas: [[organic, 0.42], [direct, 0.24], [referral, 0.11], [social, 0.08], [email, 0.06], [paidSearch, 0.07], [unassigned, 0.02]],
        docs: [[organic, 0.55], [direct, 0.3], [referral, 0.12], [unassigned, 0.03]],
        blog: [[organic, 0.68], [direct, 0.12], [social, 0.1], [referral, 0.05], [email, 0.03], [unassigned, 0.02]],
        games: [[direct, 0.4], [organic, 0.3], [social, 0.18], [referral, 0.1], [unassigned, 0.02]],
        shop: [[organic, 0.3], [paidSearch, 0.18], [paidSocial, 0.12], [direct, 0.17], [email, 0.1], [social, 0.08], [referral, 0.04], [unassigned, 0.01]],
        recipes: [[organic, 0.8], [social, 0.12], [direct, 0.08]],
        agency: [[direct, 0.38], [organic, 0.22], [social, 0.22], [referral, 0.16], [unassigned, 0.02]],
    };
    const out: SourceRow[] = [];
    for (const [rows, channelShare] of mixes[kind]) {
        const inner = normalise(rows.map(r => r[4]));
        rows.forEach((r, i) => out.push([r[0], r[1], r[2], r[3], channelShare * inner[i], r[5], r[6]]));
    }
    return out;
}

function sourceGroup(site: DemoSite): Group {
    const rows = sourceRows(site.kind);
    const organicTotal = rows.filter(r => r[2] === 'Organic Search').reduce((s, r) => s + r[4], 0) || 1;
    return {
        name: 'source',
        entities: rows.map(([source, medium, channel, campaign, share, eng, conv]) => {
            // Re-weight organic search to the site's configured organic share.
            const w = channel === 'Organic Search' ? (share / organicTotal) * site.organicShare : share * (1 - site.organicShare) / (1 - organicTotal || 1);
            const isReferral = medium === 'referral';
            return {
                key: `${source}|${medium}|${campaign}`,
                w,
                wKey: w * conv,
                vals: {
                    sessionSource: source, sessionMedium: medium, sessionSourceMedium: `${source} / ${medium}`,
                    sessionDefaultChannelGroup: channel, sessionPrimaryChannelGroup: channel, sessionCampaignName: campaign,
                    sessionCampaignId: campaign.startsWith('(') ? campaign : String(2000 + (Math.abs(hashCode(campaign)) % 7000)),
                    sessionManualAdContent: '(not set)', sessionManualTerm: medium === 'cpc' ? 'analytics tool' : '(not set)',
                    sessionSourcePlatform: medium === 'cpc' ? 'Google Ads' : 'Manual', sessionGoogleAdsQuery: '(not set)',
                    firstUserSource: source, firstUserMedium: medium, firstUserSourceMedium: `${source} / ${medium}`,
                    firstUserDefaultChannelGroup: channel, firstUserPrimaryChannelGroup: channel, firstUserCampaignName: campaign,
                    source, medium, sourceMedium: `${source} / ${medium}`, defaultChannelGroup: channel, primaryChannelGroup: channel, campaignName: campaign,
                    pageReferrer: isReferral ? `https://${source}/` : '',
                },
                f: { eng, dur: eng, nu: channel === 'Direct' ? 0.85 : channel === 'Email' ? 0.5 : 1.06 },
            };
        }),
    };
}

// ─── Pages ───

export interface DemoPage {
    path: string;
    title: string;
    /** Share of page views. */
    views: number;
    /** Share of entrances. */
    landing: number;
    /** Share of key events. */
    key: number;
    /** Share of purchases. */
    rev: number;
    eng: number;
    dur: number;
    section: string;
}

const pageCache = new Map<string, DemoPage[]>();

export function sitePages(site: DemoSite): DemoPage[] {
    const cached = pageCache.get(site.key);
    if (cached) return cached;
    const raw: Array<Omit<DemoPage, 'views' | 'landing' | 'key' | 'rev'> & { v: number; l: number; k: number; r: number }> = [];
    const brand = site.name;
    for (const [path, title, weight] of site.sections) {
        const isApp = path.startsWith('/app') || path === '/login';
        const isConv = /signup|welcome|thank|success|contact|download|checkout/.test(path);
        const isHome = path === '/';
        raw.push({
            path,
            title,
            v: weight,
            l: isHome ? weight * 2.4 : isApp ? weight * 0.25 : /cart|checkout/.test(path) ? weight * 0.05 : weight,
            k: isConv ? weight * 12 : path === '/pricing' ? weight * 2 : weight * 0.25,
            r: /success/.test(path) ? 50 : /checkout/.test(path) ? 5 : 0.02,
            // Each page its own engagement and length (round 5 polish: section pages all read as the site average).
            eng: isApp ? 1.2 : isHome ? 0.9 : isConv ? 1.12 : 0.86 + 0.26 * unit(site.key, 'seng', path),
            dur: isApp ? 1.6 : path.includes('pricing') ? 1.1 : isConv ? 1.3 + 0.2 * unit(site.key, 'sdur', path) : 0.82 + 0.32 * unit(site.key, 'sdur', path),
            section: path === '/' ? 'home' : path.split('/')[1] || 'home',
        });
    }
    const topicW = zipfWeights(site.topics.length, 0.95, `${site.key}|topics`);
    const topicTotal = site.sections.reduce((s, x) => s + x[2], 0) * (site.kind === 'blog' || site.kind === 'recipes' ? 2.2 : site.kind === 'shop' ? 1.1 : 0.7);
    site.topics.forEach((topic, i) => {
        const path = `${site.topicPrefix}${slugify(topic)}`;
        const v = topicTotal * topicW[i];
        raw.push({
            path,
            title: `${topic} | ${brand}`,
            v,
            l: v * 1.5,
            k: site.kind === 'shop' ? v * 1.5 : v * 0.35,
            r: site.kind === 'shop' ? v * 0.3 : 0,
            eng: 0.95 + 0.25 * unit(site.key, 'peng', path),
            dur: 0.8 + 0.6 * unit(site.key, 'pdur', path),
            section: site.topicPrefix.replace(/\//g, '') || 'pages',
        });
    });
    const views = normalise(raw.map(r => r.v));
    const landing = normalise(raw.map(r => r.l));
    const key = normalise(raw.map(r => r.k));
    const rev = normalise(raw.map(r => r.r));
    const pages = raw.map((r, i) => ({ path: r.path, title: r.title, views: views[i], landing: landing[i], key: key[i], rev: rev[i], eng: r.eng, dur: r.dur, section: r.section }));
    pageCache.set(site.key, pages);
    return pages;
}

function pageGroup(site: DemoSite): Group {
    const rates = siteRates(site);
    // A user who views one page usually views others, so per-page user reach
    // is larger than the page-view share (but never above 100 %).
    const reachMul = Math.max(1, rates.pagesPerSession * 0.7);
    const origin = `https://${site.host}`;
    return {
        name: 'page',
        entities: sitePages(site).map(p => ({
            key: p.path,
            w: Math.min(0.95, p.views * reachMul),
            wPV: p.views,
            wEv: p.views,
            wKey: p.key,
            wRev: p.rev,
            vals: {
                pagePath: p.path,
                pagePathPlusQueryString: p.path,
                pageTitle: p.title,
                unifiedScreenName: p.title,
                unifiedScreenClass: p.title,
                unifiedPagePathScreen: p.path,
                pageLocation: `${origin}${p.path}`,
                fullPageUrl: `${site.host}${p.path}`,
                hostName: site.host,
                contentGroup: '(not set)',
                pagePathLevel1: `/${p.path.split('/')[1] || ''}${p.path.split('/').length > 2 ? '/' : ''}`,
            },
            f: { eng: p.eng, dur: p.dur },
        })),
    };
}

function landingGroup(site: DemoSite): Group {
    const pages = sitePages(site);
    // Key events of sessions that START on the page: its entrances times a conversion lift (round 5 polish: the
    // page's own key-event share gave a checkout landing page 41 sessions and 249 key events).
    const lift = (path: string) => (/signup|welcome|thank|success|contact|download|checkout|cart/.test(path) ? 2.2
        : path === '/pricing' ? 1.8 : path === '/' ? 0.9 : 0.55 + 0.9 * unit(site.key, 'llift', path));
    const entities: Entity[] = pages.map(p => ({
        key: p.path,
        w: p.landing * 0.985,
        wKey: p.landing * lift(p.path),
        vals: { landingPage: p.path, landingPagePlusQueryString: p.path },
        f: { eng: p.eng, dur: p.dur },
    }));
    entities.push({ key: '(not set)', w: 0.015, wKey: 0.001, vals: { landingPage: '(not set)', landingPagePlusQueryString: '(not set)' }, f: { eng: 0.3, dur: 0.2 } });
    return { name: 'landing', entities };
}

// ─── Events ───

type EventRow = [name: string, perSession: number, reach: number, isKey: boolean];

export function siteEvents(site: DemoSite): EventRow[] {
    const r = siteRates(site);
    const rows: EventRow[] = [
        ['page_view', r.pagesPerSession, 0.99, false],
        ['session_start', 1, 1, false],
        ['user_engagement', r.engagementRate * 1.4, r.engagementRate * 1.1, false],
        ['first_visit', r.newUserShare / r.sessionsPerUser, r.newUserShare, false],
        ['scroll', r.pagesPerSession * 0.42, 0.48, false],
        ['click', 0.14, 0.11, false],
        ['form_start', 0.04, 0.035, false],
        ['file_download', 0.012, 0.01, false],
        ['view_search_results', 0.02, 0.018, false],
    ];
    const kindRows: Record<DemoKind, EventRow[]> = {
        saas: [['sign_up', r.keyEventRate * 0.7, r.keyEventRate * 0.8, true], ['generate_lead', r.keyEventRate * 0.3, r.keyEventRate * 0.35, true], ['login', 0.22, 0.14, false], ['cta_click', 0.09, 0.07, false]],
        docs: [['copy_code', 0.3, 0.2, false]],
        blog: [['newsletter_signup', r.keyEventRate, r.keyEventRate, true], ['share', 0.01, 0.009, false], ['video_start', 0.03, 0.025, false]],
        games: [['game_start', 1.9, 0.8, false], ['game_complete', 1.1, 0.6, false], ['level_up', 0.6, 0.3, false], ['sign_up', r.keyEventRate, r.keyEventRate, true], ['share', 0.05, 0.04, false]],
        shop: [['view_item', 1.6, 0.62, false], ['view_item_list', 0.9, 0.5, false], ['add_to_cart', 0.11, 0.08, false], ['begin_checkout', 0.045, 0.035, false], ['add_payment_info', 0.03, 0.025, false], ['purchase', r.purchaseRate, r.purchaseRate * 0.95, true], ['generate_lead', r.keyEventRate - r.purchaseRate, (r.keyEventRate - r.purchaseRate) * 0.9, true]],
        recipes: [['print_recipe', 0.05, 0.04, false]],
        agency: [['form_submit', r.keyEventRate, r.keyEventRate, true], ['cta_click', 0.08, 0.06, false]],
    };
    return [...rows, ...kindRows[site.kind]];
}

function eventGroup(site: DemoSite): Group {
    const rows = siteEvents(site);
    const ev = normalise(rows.map(r => r[1]));
    const keyRaw = rows.map(r => (r[3] ? r[1] : 0));
    const keySum = keyRaw.reduce((s, v) => s + v, 0) || 1;
    return {
        name: 'event',
        entities: rows.map(([name, , reach, isKey], i) => ({
            key: name,
            w: reach,
            wPV: name === 'page_view' ? 1 : 0,
            wEv: ev[i],
            wKey: keyRaw[i] / keySum,
            wRev: name === 'purchase' ? 1 : 0,
            vals: { eventName: name, isKeyEvent: String(isKey), isConversionEvent: String(isKey) },
        })),
    };
}

// ─── Small groups ───

function nvrGroup(site: DemoSite): Group {
    const ns = siteRates(site).newUserShare;
    return {
        name: 'nvr',
        entities: [
            { key: 'new', w: ns * 0.99, vals: { newVsReturning: 'new' }, f: { eng: 0.9, dur: 0.78, nu: 1 / ns } },
            { key: 'returning', w: (1 - ns) * 0.99, vals: { newVsReturning: 'returning' }, f: { eng: 1.2, dur: 1.45, nu: 0 } },
            { key: '(not set)', w: 0.01, vals: { newVsReturning: '(not set)' }, f: { nu: 0 } },
        ],
    };
}

function ageGroup(): Group {
    const rows: Array<[string, number]> = [['18-24', 0.14], ['25-34', 0.31], ['35-44', 0.22], ['45-54', 0.13], ['55-64', 0.08], ['65+', 0.05], ['unknown', 0.07]];
    return { name: 'age', entities: rows.map(([v, w]) => ({ key: v, w, vals: { userAgeBracket: v } })) };
}

function genderGroup(): Group {
    const rows: Array<[string, number]> = [['male', 0.52], ['female', 0.41], ['unknown', 0.07]];
    return { name: 'gender', entities: rows.map(([v, w]) => ({ key: v, w, vals: { userGender: v } })) };
}

function itemGroup(site: DemoSite): Group {
    if (site.kind !== 'shop') {
        return { name: 'item', entities: [{ key: '(not set)', w: 1, vals: { itemName: '(not set)', itemId: '(not set)', itemCategory: '(not set)', itemBrand: '(not set)', itemVariant: '(not set)', itemListName: '(not set)' } }] };
    }
    const w = zipfWeights(site.topics.length, 0.9, `${site.key}|items`);
    const categories = ['Wall art', 'Posters', 'Canvas', 'Custom'];
    return {
        name: 'item',
        entities: site.topics.map((t, i) => ({
            key: t,
            w: w[i],
            vals: {
                itemName: t,
                itemId: `SKU-${1000 + i}`,
                itemCategory: categories[i % categories.length],
                itemBrand: site.name,
                itemVariant: i % 3 === 0 ? 'A3' : i % 3 === 1 ? 'A2' : '50x70',
                itemListName: categories[i % categories.length],
            },
        })),
    };
}

function linkGroup(site: DemoSite): Group {
    const links: Array<[string, number]> = [
        [`https://github.com/${slugify(site.name)}`, 0.03],
        [`https://x.com/${slugify(site.name).replace(/-/g, '')}`, 0.025],
        [`https://www.linkedin.com/company/${slugify(site.name)}`, 0.02],
        [`https://www.youtube.com/@${slugify(site.name)}`, 0.012],
        ['https://apps.apple.com/app/id1234567890', site.key === 'splitexpenses' ? 0.06 : 0.005],
    ];
    const entities: Entity[] = [{ key: '(not set)', w: 1 - links.reduce((s, l) => s + l[1], 0), vals: { linkUrl: '(not set)', linkDomain: '(not set)', outbound: '(not set)', linkText: '(not set)', fileName: '(not set)', fileExtension: '(not set)' } }];
    for (const [url, w] of links) {
        const domain = new URL(url).hostname;
        entities.push({ key: url, w, vals: { linkUrl: url, linkDomain: domain, outbound: 'true', linkText: domain.replace(/^www\./, ''), fileName: '(not set)', fileExtension: '(not set)' } });
    }
    return { name: 'link', entities };
}

function searchGroup(site: DemoSite): Group {
    const terms = site.queries.slice(0, 6);
    const w = zipfWeights(terms.length, 1, `${site.key}|search`);
    return {
        name: 'search',
        entities: [
            { key: '(not set)', w: 0.94, vals: { searchTerm: '(not set)' } },
            ...terms.map((t, i) => ({ key: t, w: 0.06 * w[i], vals: { searchTerm: t } })),
        ],
    };
}

function streamGroup(site: DemoSite): Group {
    const digits = /(\d+)/.exec(site.ga?.propertyId || '')?.[1] || '0';
    return {
        name: 'stream',
        entities: [{ key: 'web', w: 1, vals: { streamId: `${digits.slice(-6)}0001`, streamName: `${site.host} – Web`, audienceName: 'All Users', audienceId: '1', appVersion: '(not set)' } }],
    };
}

const groupCache = new Map<string, Group>();

/** The entity list for a group name on a site. Unknown groups give a single '(not set)' entity. */
export function siteGroup(site: DemoSite, name: string): Group {
    const cacheKey = `${site.key}|${name}`;
    const cached = groupCache.get(cacheKey);
    if (cached) return cached;
    let g: Group;
    switch (name) {
        case 'page': g = pageGroup(site); break;
        case 'landing': g = landingGroup(site); break;
        case 'source': g = sourceGroup(site); break;
        case 'geo': g = geoGroup(site); break;
        case 'device': g = deviceGroup(site); break;
        case 'language': g = languageGroup(site); break;
        case 'event': g = eventGroup(site); break;
        case 'nvr': g = nvrGroup(site); break;
        case 'age': g = ageGroup(); break;
        case 'gender': g = genderGroup(); break;
        case 'item': g = itemGroup(site); break;
        case 'link': g = linkGroup(site); break;
        case 'search': g = searchGroup(site); break;
        case 'stream': g = streamGroup(site); break;
        default: g = { name, entities: [{ key: '(not set)', w: 1, vals: {} }] };
    }
    normaliseShares(g);
    groupCache.set(cacheKey, g);
    return g;
}

/** Make key-event and revenue shares sum to 1 within a group (when any are non-zero). */
function normaliseShares(g: Group): void {
    for (const field of ['wKey', 'wRev'] as const) {
        const values = g.entities.map(e => e[field] ?? (field === 'wRev' ? e.wKey ?? e.w : e.w));
        const sum = values.reduce((s, v) => s + v, 0);
        g.entities.forEach((e, i) => { e[field] = sum > 0 ? values[i] / sum : 0; });
    }
}

/** Absolute page URL for Search Console rows. */
export function pageUrl(site: DemoSite, path: string): string {
    return `${siteOrigin(site)}${path}`;
}
