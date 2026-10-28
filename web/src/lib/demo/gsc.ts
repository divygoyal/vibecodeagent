/**
 * Search Console answers from the demo generator: sites.list,
 * searchAnalytics.query (any of date/query/page/country/device/
 * searchAppearance, filters, row limits), sitemaps and URL inspection.
 * Shapes follow https://www.googleapis.com/webmasters/v3 and
 * https://searchconsole.googleapis.com/v1.
 */

import type { DemoGoogleAccount, DemoSite } from './catalog';
import { findSiteBySiteUrl, getDemoSite, getDemoSites, siteOrigin } from './catalog';
import { DEMO_HISTORY_DAYS, dayToIso, isoToDay, todayIndex } from './dates';
import { countryShares, sitePages } from './entities';
import { DemoApiError } from './ga4';
import { fastNoise, hashString, mix32, normalise, rngFor, unit, zipfWeights } from './rng';
import { dailySeries } from './series';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Expected click-through rate for an average result at a position. */
export function ctrForPosition(pos: number): number {
    const table = [0.28, 0.16, 0.11, 0.08, 0.06, 0.045, 0.035, 0.028, 0.023, 0.019];
    if (pos <= 1) return table[0];
    if (pos <= 10) {
        const i = Math.floor(pos) - 1;
        const frac = pos - Math.floor(pos);
        return table[i] + (table[Math.min(9, i + 1)] - table[i]) * frac;
    }
    if (pos <= 20) return 0.019 - (pos - 10) * 0.0013;
    if (pos <= 50) return 0.006 - (pos - 20) * 0.00017;
    return 0.0005;
}

interface Pair {
    id: number;
    query: string | null; // null = anonymised query
    page: string;         // absolute URL
    w: number;
    pos0: number;
    trend: number;        // positions per 100 days (positive = used to rank worse)
    shiftAt: number;      // days ago of a recent ranking step
    shiftDelta: number;   // rank before the step minus rank after it
    ctrMul: number;
    mobileGap: number;
    brand: boolean;
}

interface SiteModel {
    pairs: Pair[];
    expectedCtr: number;
}

const MODIFIERS: Record<DemoSite['kind'], string[]> = {
    saas: ['{q}', 'best {q}', '{q} tool', '{q} software', 'free {q}', '{q} examples', '{q} template', 'what is {q}', '{q} for startups', '{q} pricing'],
    docs: ['{q}', '{q} example', '{q} docs', 'how to {q}', '{q} tutorial'],
    blog: ['{q}', 'best {q}', '{q} chart', '{q} benefits', 'how to {q}', '{q} tips', '{q} guide', 'what is {q}', '{q} for women', '{q} for beginners'],
    games: ['{q}', '{q} online', 'free {q}', 'play {q}', '{q} printable', '{q} daily', '{q} hard', '{q} unblocked'],
    recipes: ['{q}', 'easy {q}', 'best {q}', 'healthy {q}', 'vegan {q}', 'quick {q}', '{q} without eggs', 'homemade {q}'],
    agency: ['{q}', 'best {q}', '{q} near me', '{q} cost'],
    shop: ['{q}', 'cheap {q}', 'buy {q}', '{q} online', 'custom {q}'],
};

const modelCache = new Map<string, SiteModel>();

function words(s: string): string[] {
    return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function siteModel(site: DemoSite): SiteModel {
    const cached = modelCache.get(site.key);
    if (cached) return cached;
    const rng = rngFor(site.key, 'gsc-model');

    // Pages that can rank, with their search share.
    const members = [site, ...(site.gscIncludes || []).map(k => getDemoSite(k)).filter((s): s is DemoSite => !!s)];
    const pages: Array<{ url: string; title: string; path: string; share: number }> = [];
    members.forEach((m, mi) => {
        const origin = mi === 0 ? siteOrigin(site).replace(/^sc-domain:/, '') : `https://${m.host}`;
        for (const p of sitePages(m)) {
            if (/^\/(app|cart|checkout|welcome)/.test(p.path)) continue;
            pages.push({ url: `${origin}${p.path === '/' ? '/' : p.path}`, title: p.title, path: p.path, share: p.landing * (mi === 0 ? 1 : 0.45) });
        }
    });
    const pageShares = normalise(pages.map(p => p.share));

    // Queries: brand terms plus modifier variants of the seed phrases and topic titles.
    const brand = site.name.toLowerCase().replace(/\s*\(.*\)\s*/, '');
    const hostStem = site.host.replace(/^www\./, '').split('.')[0];
    const brandQueries = [brand, hostStem];
    if (site.kind === 'saas' || site.kind === 'docs') brandQueries.push(`${brand} login`, `${brand} pricing`, `${brand} reviews`);
    if (site.kind === 'agency') brandQueries.push(`${brand} reviews`);
    if (site.kind === 'games') brandQueries.push(`${brand} sudoku`, `${brand} daily`);
    if (site.kind === 'recipes' || site.kind === 'blog') brandQueries.push(`${brand} ${site.topics[0].toLowerCase().split(' ').slice(0, 2).join(' ')}`);
    brandQueries.push(...(site.competitors || []).map(c => `${brand} vs ${c}`));
    const modifiers = MODIFIERS[site.kind];
    const nonBrand = new Set<string>();
    site.queries.forEach((q, qi) => {
        const count = 2 + Math.floor(unit(site.key, 'nq', qi) * 4);
        for (let i = 0; i < count; i++) {
            const mod = modifiers[(qi * 3 + i * 7 + Math.floor(unit(site.key, 'mod', qi, i) * modifiers.length)) % modifiers.length];
            nonBrand.add(i === 0 ? q : mod.replace('{q}', q));
        }
    });
    site.topics.forEach(t => nonBrand.add(t.toLowerCase().replace(/[–—:|]/g, ' ').replace(/\s+/g, ' ').trim()));
    for (const c of site.competitors || []) nonBrand.add(`${c} alternative`);

    const pickPage = (q: string): Array<{ idx: number; score: number }> => {
        const qw = new Set(words(q));
        return pages
            .map((p, idx) => {
                const pw = words(`${p.title} ${p.path}`);
                let score = 0;
                for (const w of pw) if (qw.has(w)) score += 1;
                return { idx, score: score + pageShares[idx] * 0.5 };
            })
            .sort((a, b) => b.score - a.score);
    };

    const pairs: Pair[] = [];
    let id = 0;
    const established = site.shape !== 'new' && site.shape !== 'nearZero';
    // Share of impressions from brand searches (brand CTR is high, so their click share is larger).
    const brandTotal = !established ? 0.12 : site.kind === 'saas' || site.kind === 'docs' ? 0.035 : 0.012;
    const brandW = zipfWeights(brandQueries.length, 1.3, `${site.key}|brand`);
    brandQueries.forEach((q, i) => {
        const pageIdx = q.endsWith('login') ? pages.findIndex(p => p.path === '/login')
            : q.endsWith('pricing') ? pages.findIndex(p => p.path === '/pricing')
            : q.includes(' vs ') ? pages.findIndex(p => p.path === `/compare/${q.split(' vs ')[1].replace(/\s+/g, '-')}`)
            : 0;
        pairs.push({
            id: id++, query: q, page: pages[Math.max(0, pageIdx)].url, w: brandTotal * brandW[i] * 0.68,
            pos0: 1 + rng() * 0.8, trend: 0, shiftAt: 999, shiftDelta: 0, ctrMul: 1.9, mobileGap: 0, brand: true,
        });
    });

    const nbList = [...nonBrand];
    const nbW = zipfWeights(nbList.length, 0.9, `${site.key}|nb`);
    const trendBias = site.shape === 'declining' ? -0.6 : site.shape === 'growing' || site.shape === 'new' ? 0.6 : 0;
    nbList.forEach((q, i) => {
        const ranked = pickPage(q);
        const best = ranked[0];
        const u = rng();
        let pos0 = 1.4 + 38 * Math.pow(u, 1.8);
        if (i < 4) pos0 += 3 + rng() * 5; // head terms are competitive
        const base: Omit<Pair, 'id' | 'page' | 'w'> = {
            query: q,
            pos0,
            trend: trendBias + (rng() * 2 - 1) * 1.1,
            shiftAt: rng() < 0.28 ? 8 + Math.floor(rng() * 30) : 999,
            shiftDelta: (rng() * 2 - 1) * 7,
            ctrMul: 0.7 + rng() * 0.6,
            mobileGap: 0,
            brand: false,
        };
        const w = (1 - brandTotal) * nbW[i] * 0.68;
        const second = ranked[1];
        if (second && second.score >= 1 && rng() < 0.12) {
            // Two pages compete for the same query (cannibalisation).
            pairs.push({ ...base, id: id++, page: pages[best.idx].url, w: w * 0.6 });
            pairs.push({ ...base, id: id++, page: pages[second.idx].url, w: w * 0.4, pos0: pos0 + 1.5 + rng() * 5 });
        } else {
            pairs.push({ ...base, id: id++, page: pages[best.idx].url, w });
        }
    });

    // Anonymised queries: about a third of impressions, spread over pages.
    pages.forEach((p, i) => {
        pairs.push({
            id: id++, query: null, page: p.url, w: 0.32 * pageShares[i],
            pos0: p.path === '/' ? 2.5 + rng() * 5 : 6 + rng() * 22, trend: trendBias * 0.5, shiftAt: 999, shiftDelta: 0, ctrMul: 0.8, mobileGap: 0, brand: false,
        });
    });

    // Some pages rank worse on mobile.
    const gapPages = new Set(pages.filter((_, i) => unit(site.key, 'mgap', i) < 0.2).map(p => p.url));
    for (const pr of pairs) {
        pr.mobileGap = gapPages.has(pr.page) ? 2 + unit(site.key, 'gap', pr.page) * 4 : (unit(site.key, 'gap2', pr.id) - 0.5);
    }

    const expectedCtr = pairs.reduce((s, p) => s + p.w * ctrForPosition(p.pos0) * p.ctrMul, 0) / (pairs.reduce((s, p) => s + p.w, 0) || 1);
    const model = { pairs, expectedCtr };
    modelCache.set(site.key, model);
    return model;
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

/**
 * Where a URL stands in Google's index in the demo (URL Inspection), consistent with searchAnalytics (round 7, audit
 * item 6). A page that ranks (it has search rows) is indexed, except a few that Google dropped `crawlDaysAgo` days
 * ago: their rows stop that day, so they had clicks earlier in a 28-day window and none since, like a real drop. A
 * page with no search rows can be "Crawled" or "Discovered - currently not indexed" (never crawled, no clicks).
 */
const rankingCache = new Map<string, Map<string, string>>();

function indexState(site: DemoSite, rawUrl: string): { state: 'indexed' | 'dropped' | 'crawled' | 'discovered'; crawlDaysAgo: number } {
    let ranking = rankingCache.get(site.key);
    if (!ranking) {
        ranking = new Map(siteModel(site).pairs.map((p) => [trimSlash(p.page), p.page]));
        rankingCache.set(site.key, ranking);
    }
    // A ranking page is looked up as its search rows spell it (with or without the trailing slash typed).
    const url = ranking.get(trimSlash(rawUrl)) ?? rawUrl;
    const r = unit(site.key, 'inspect', url);
    const crawlDaysAgo = 1 + Math.floor(unit(site.key, 'crawl', url) * 20);
    // The home page is always indexed (a site whose home page is not in Google is a different demo story).
    if (trimSlash(url) === siteOrigin(site)) return { state: 'indexed', crawlDaysAgo };
    if (ranking.has(trimSlash(url))) return { state: r >= 0.93 ? 'dropped' : 'indexed', crawlDaysAgo };
    const indexed = site.shape === 'new' ? r < 0.6 : r < 0.9;
    return { state: indexed ? 'indexed' : r >= 0.93 ? 'crawled' : 'discovered', crawlDaysAgo };
}

const DEVICES: Array<{ name: string; share: (s: DemoSite) => number; off: number; ctr: number }> = [
    { name: 'DESKTOP', share: s => (s.kind === 'saas' || s.kind === 'docs' ? 0.62 : s.kind === 'agency' ? 0.5 : 0.36), off: -0.3, ctr: 1.05 },
    { name: 'MOBILE', share: s => (s.kind === 'saas' || s.kind === 'docs' ? 0.36 : s.kind === 'agency' ? 0.47 : 0.6), off: 0.4, ctr: 0.93 },
    { name: 'TABLET', share: () => 0.025, off: 0.2, ctr: 0.95 },
];

const SEARCH_TYPE_SCALE: Record<string, { impr: number; ctr: number }> = {
    web: { impr: 1, ctr: 1 },
    image: { impr: 0.12, ctr: 0.3 },
    video: { impr: 0.02, ctr: 0.6 },
    news: { impr: 0.01, ctr: 1.2 },
    googleNews: { impr: 0.005, ctr: 1.2 },
    discover: { impr: 0.06, ctr: 0.9 },
};

const APPEARANCES: Record<DemoSite['kind'], Array<[string, number]>> = {
    saas: [['REVIEW_SNIPPET', 0.03], ['VIDEO', 0.02], ['SITELINKS', 0.08]],
    docs: [['SITELINKS', 0.12]],
    blog: [['REVIEW_SNIPPET', 0.02], ['VIDEO', 0.04], ['TRANSLATED_RESULT', 0.01]],
    games: [['VIDEO', 0.03], ['SITELINKS', 0.05]],
    recipes: [['RECIPE_FEATURE', 0.35], ['RECIPE_RICH_SNIPPET', 0.25], ['VIDEO', 0.06]],
    agency: [['SITELINKS', 0.05]],
    shop: [['PRODUCT_SNIPPETS', 0.3], ['MERCHANT_LISTINGS', 0.2]],
};

function matchGsc(value: string, operator: string, expression: string): boolean {
    const v = value.toLowerCase();
    const e = String(expression ?? '').toLowerCase();
    switch (operator) {
        case 'notEquals': return v !== e;
        case 'contains': return v.includes(e);
        case 'notContains': return !v.includes(e);
        case 'includingRegex': try { return new RegExp(expression).test(value); } catch { return false; }
        case 'excludingRegex': try { return !new RegExp(expression).test(value); } catch { return false; }
        default: return v === e;
    }
}

export interface GscQueryRequest {
    startDate?: string;
    endDate?: string;
    dimensions?: string[];
    type?: string;
    searchType?: string;
    dimensionFilterGroups?: Array<{ groupType?: string; filters?: Array<{ dimension: string; operator?: string; expression: string }> }>;
    aggregationType?: string;
    rowLimit?: number;
    startRow?: number;
    dataState?: string;
}

/** searchAnalytics.query */
export function demoSearchAnalytics(siteUrl: string, request: GscQueryRequest, opts: { now?: number } = {}): any {
    const site = findSiteBySiteUrl(siteUrl);
    if (!site || !site.gsc) {
        throw new DemoApiError(403, 'PERMISSION_DENIED', `User does not have sufficient permission for site '${siteUrl}'. See also: https://support.google.com/webmasters/answer/2451999.`);
    }
    const today = todayIndex(opts.now);
    const start = isoToDay(request.startDate || '');
    const end = isoToDay(request.endDate || '');
    if (start === null || end === null) {
        throw new DemoApiError(400, 'INVALID_ARGUMENT', 'startDate and endDate must be YYYY-MM-DD.');
    }
    const dims = (request.dimensions || []).map(d => String(d));
    const filters = (request.dimensionFilterGroups || []).flatMap(g => g.filters || []);
    const filterDims = new Set(filters.map(f => f.dimension));
    const searchType = SEARCH_TYPE_SCALE[request.type || request.searchType || 'web'] || SEARCH_TYPE_SCALE.web;
    const fresh = request.dataState === 'all' || request.dataState === 'hourly_all';
    const lastDay = today - (fresh ? 1 : 2);
    const windowStart = today - DEMO_HISTORY_DAYS + 1;
    const s = Math.max(start, windowStart);
    const e = Math.min(end, lastDay);

    const model = siteModel(site);
    const { start: seriesStart, values } = dailySeries(site, today);
    const clickScale = site.ga ? site.organicShare * 1.05 : 1;
    const siteSeed = hashString(site.key);

    const useCountry = dims.includes('country') || filterDims.has('country');
    const countries = useCountry
        ? countryShares(site).map(c => ({ code: c.def.iso3, share: c.share, off: c.def.lang === 'English' ? (unit(site.key, 'coff', c.def.iso3) - 0.5) : 1 + unit(site.key, 'coff', c.def.iso3) * 2 }))
        : [{ code: '', share: 1, off: 0 }];
    const useAppearance = dims.includes('searchAppearance') || filterDims.has('searchAppearance');
    const appearances = useAppearance ? APPEARANCES[site.kind].map(([name, share]) => ({ name, share })) : [{ name: '', share: 1 }];
    const devices = DEVICES.map(d => ({ name: d.name, share: d.share(site), off: d.off, ctr: d.ctr }));
    const devNorm = devices.reduce((sum, d) => sum + d.share, 0);

    const queryUsed = dims.includes('query') || filterDims.has('query');
    const pairs = model.pairs.filter(p => !(queryUsed && p.query === null));

    const passes = (vals: Record<string, string>) => filters.every(f => vals[f.dimension] === undefined || matchGsc(vals[f.dimension], f.operator || 'equals', f.expression));

    // Every key (the requested dimensions other than date) gets whole clicks and impressions per day, rounded the
    // same way in every report shape (round 7): a report over the range is the sum of its days, so a one-report total
    // and the sum of a by-date report agree to the click, as in Search Console. The rounding is stochastic (seeded by
    // site, row and day) so long-tail rows keep their expected volume instead of rounding to zero every day.
    interface KeyAcc { keys: string[]; seed: number; clicks: number; impressions: number; rawImpr: number; posW: number }
    interface Combo { pair: (typeof pairs)[number]; k: number; share: number; posOff: number; ctrMul: number; last: number }
    const dated = dims.includes('date');
    // The rounding seed names the row by every dimension it fixes (requested, or pinned by an equals filter), so
    // "page X" rounds the same in a by-page report and in a by-date report filtered to page X.
    const fixedDims = [...new Set([...dims.filter(d => d !== 'date'), ...filters.filter(f => (f.operator || 'equals') === 'equals').map(f => f.dimension)])].sort();
    const keyIndex = new Map<string, number>();
    const keyAccs: KeyAcc[] = [];
    const combos: Combo[] = [];
    // Pages Google dropped (indexState): no rows from the day of the crawl that left them out.
    // The site's daily total stays the designed series: the other pages share what a dropped page no longer gets
    // (dayScale), so a drop moves clicks between pages, not the site's headline numbers.
    const dropDay = new Map<string, number>();
    const pageW = new Map<string, number>();
    for (const p of model.pairs) pageW.set(p.page, (pageW.get(p.page) ?? 0) + p.w);
    for (const page of pageW.keys()) {
        const st = indexState(site, page);
        if (st.state === 'dropped') dropDay.set(page, today - st.crawlDaysAgo);
    }
    const totalW = [...pageW.values()].reduce((a, w) => a + w, 0);
    const dayScale = (day: number) => {
        let gone = 0;
        for (const [page, d] of dropDay) if (day >= d) gone += pageW.get(page) ?? 0;
        return gone > 0 && gone < totalW ? totalW / (totalW - gone) : 1;
    };
    const scales = new Map<number, number>();
    for (let day = s; day <= e; day++) scales.set(day, dayScale(day));

    for (const pair of pairs) {
        // Filters on query/page apply before the day loop.
        if (!passes({ query: pair.query ?? '', page: pair.page })) continue;
        const last = Math.min(e, (dropDay.get(pair.page) ?? Infinity) - 1);
        for (const dev of devices) {
            if (!passes({ device: dev.name })) continue;
            for (const ctry of countries) {
                if (useCountry && !passes({ country: ctry.code })) continue;
                for (const app of appearances) {
                    if (useAppearance && !passes({ searchAppearance: app.name })) continue;
                    const keyVals: Record<string, string> = { query: pair.query ?? '', page: pair.page, device: dev.name, country: ctry.code, searchAppearance: app.name };
                    const nonDateKey = dims.filter(d => d !== 'date').map(d => keyVals[d]).join('\u0001');
                    let k = keyIndex.get(nonDateKey);
                    if (k === undefined) {
                        k = keyAccs.length;
                        keyIndex.set(nonDateKey, k);
                        keyAccs.push({ keys: dims.map(d => (d === 'date' ? '' : keyVals[d])), seed: hashString(`${site.key}\u0003${fixedDims.map(d => `${d}=${keyVals[d] ?? ''}`).join('\u0001')}`), clicks: 0, impressions: 0, rawImpr: 0, posW: 0 });
                    }
                    combos.push({
                        pair, k, last,
                        share: pair.w * (dev.share / devNorm) * ctry.share * app.share * searchType.impr,
                        posOff: dev.off + (dev.name === 'MOBILE' ? pair.mobileGap : 0) + ctry.off,
                        ctrMul: pair.ctrMul * dev.ctr * searchType.ctr,
                    });
                }
            }
        }
    }

    const rows: KeyAcc[] = [];
    const dayClicks = new Float64Array(keyAccs.length);
    const dayImpr = new Float64Array(keyAccs.length);
    const dayPosW = new Float64Array(keyAccs.length);
    const touched: number[] = [];
    const whole = (x: number, seed: number, day: number, salt: number) => Math.floor(x + mix32(seed + salt, day) / 4294967296);
    for (let day = s; day <= e; day++) {
        const target = values[day - seriesStart] * clickScale * (scales.get(day) ?? 1);
        if (target <= 0) continue;
        const daysAgo = today - day;
        for (const c of combos) {
            if (day > c.last) continue;
            const pair = c.pair;
            const impr = (target / model.expectedCtr) * c.share * fastNoise(0.3, siteSeed + pair.id, day);
            if (impr <= 0) continue;
            let pos = pair.pos0 + pair.trend * (daysAgo / 100) + (daysAgo >= pair.shiftAt ? pair.shiftDelta : 0) + c.posOff;
            pos += (fastNoise(1, siteSeed ^ pair.id, day * 31) - 1) * 0.6;
            pos = Math.max(1, Math.min(100, pos));
            const clicks = impr * Math.min(0.95, ctrForPosition(pos) * c.ctrMul);
            if (dayImpr[c.k] === 0) touched.push(c.k);
            dayClicks[c.k] += clicks;
            dayImpr[c.k] += impr;
            dayPosW[c.k] += pos * impr;
        }
        for (const k of touched) {
            const acc = keyAccs[k];
            const impressions = whole(dayImpr[k], acc.seed, day, 0);
            const clicks = Math.min(impressions, whole(dayClicks[k], acc.seed, day, 0x9e3779b9));
            if (dated) {
                rows.push({ ...acc, keys: acc.keys.map((v, i) => (dims[i] === 'date' ? dayToIso(day) : v)), clicks, impressions, rawImpr: dayImpr[k], posW: dayPosW[k] });
            } else {
                acc.clicks += clicks;
                acc.impressions += impressions;
                acc.rawImpr += dayImpr[k];
                acc.posW += dayPosW[k];
            }
            dayClicks[k] = 0;
            dayImpr[k] = 0;
            dayPosW[k] = 0;
        }
        touched.length = 0;
    }
    if (!dated) rows.push(...keyAccs.filter(a => a.rawImpr > 0));

    let out = rows
        .map(r => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.impressions > 0 ? r.clicks / r.impressions : 0, position: r.rawImpr > 0 ? r.posW / r.rawImpr : 0 }))
        .filter(r => r.impressions > 0);
    if (dims.includes('date')) {
        const di = dims.indexOf('date');
        out.sort((a, b) => (a.keys[di] < b.keys[di] ? -1 : a.keys[di] > b.keys[di] ? 1 : b.clicks - a.clicks));
    } else {
        out.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    }
    const startRow = Math.max(0, Number(request.startRow) || 0);
    const rowLimit = Math.min(25_000, Math.max(1, Number(request.rowLimit) || 1000));
    out = out.slice(startRow, startRow + rowLimit);

    const byPage = dims.includes('page') || filterDims.has('page') || request.aggregationType === 'byPage';
    const response: any = { responseAggregationType: byPage ? 'byPage' : 'byProperty' };
    if (out.length) {
        response.rows = out.map(r => {
            const row: any = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: Number(r.position.toFixed(6)) };
            if (dims.length) row.keys = r.keys;
            return row;
        });
    }
    return response;
}

/** sites.list */
export function demoListSites(account: DemoGoogleAccount): any {
    return {
        siteEntry: account.gscSiteKeys
            .map(k => getDemoSite(k))
            .filter((s): s is DemoSite => !!s && !!s.gsc)
            .map(s => ({ siteUrl: s.gsc!.siteUrl, permissionLevel: s.gsc!.permissionLevel })),
    };
}

/** sites.get */
export function demoGetSite(siteUrl: string): any {
    const site = findSiteBySiteUrl(siteUrl);
    if (!site?.gsc) throw new DemoApiError(403, 'PERMISSION_DENIED', `No access to ${siteUrl}`);
    return { siteUrl: site.gsc.siteUrl, permissionLevel: site.gsc.permissionLevel };
}

/** sitemaps.list */
export function demoSitemaps(siteUrl: string, opts: { now?: number } = {}): any {
    const site = findSiteBySiteUrl(siteUrl);
    if (!site?.gsc) throw new DemoApiError(403, 'PERMISSION_DENIED', `No access to ${siteUrl}`);
    const today = todayIndex(opts.now);
    const origin = siteOrigin(site);
    const pages = sitePages(site).length;
    const iso = (daysAgo: number) => `${dayToIso(today - daysAgo)}T06:${String(10 + (hashString(site.key) % 40)).padStart(2, '0')}:00.000Z`;
    if (site.shape === 'nearZero') return {};
    return {
        sitemap: [
            {
                path: `${origin}/sitemap.xml`,
                lastSubmitted: iso(site.launchedDaysAgo ?? 120),
                isPending: false,
                isSitemapsIndex: false,
                type: 'sitemap',
                lastDownloaded: iso(1),
                warnings: site.shape === 'declining' ? '3' : '0',
                errors: '0',
                contents: [{ type: 'web', submitted: String(pages), indexed: String(Math.max(1, pages - (site.shape === 'new' ? 4 : 1))) }],
            },
        ],
    };
}

/** urlInspection.index.inspect */
export function demoUrlInspection(body: { inspectionUrl?: string; siteUrl?: string; languageCode?: string }, opts: { now?: number } = {}): any {
    const site = findSiteBySiteUrl(body.siteUrl || '');
    if (!site?.gsc) throw new DemoApiError(403, 'PERMISSION_DENIED', `You do not own this site, or the inspected URL is not part of this property.`);
    const url = String(body.inspectionUrl || siteOrigin(site) + '/');
    const st = indexState(site, url);
    const today = todayIndex(opts.now);
    const indexed = st.state === 'indexed';
    const crawlTime = `${dayToIso(today - st.crawlDaysAgo)}T${String(3 + (hashString(url) % 18)).padStart(2, '0')}:14:52Z`;
    const origin = siteOrigin(site);
    return {
        inspectionResult: {
            inspectionResultLink: `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(site.gsc.siteUrl)}&id=${hashString(url).toString(16)}`,
            indexStatusResult: indexed
                ? {
                    verdict: 'PASS',
                    coverageState: 'Submitted and indexed',
                    robotsTxtState: 'ALLOWED',
                    indexingState: 'INDEXING_ALLOWED',
                    lastCrawlTime: crawlTime,
                    pageFetchState: 'SUCCESSFUL',
                    googleCanonical: url,
                    userCanonical: url,
                    sitemap: [`${origin}/sitemap.xml`],
                    referringUrls: [`${origin}/`],
                    crawledAs: 'MOBILE',
                }
                // A page that fell out (or never got in) was crawled (Google reports when); "Discovered" pages never were.
                : st.state !== 'discovered' ? {
                    verdict: 'NEUTRAL',
                    coverageState: 'Crawled - currently not indexed',
                    robotsTxtState: 'ALLOWED',
                    indexingState: 'INDEXING_ALLOWED',
                    lastCrawlTime: crawlTime,
                    pageFetchState: 'SUCCESSFUL',
                    sitemap: [`${origin}/sitemap.xml`],
                    referringUrls: [],
                    crawledAs: 'MOBILE',
                } : {
                    verdict: 'NEUTRAL',
                    coverageState: 'Discovered - currently not indexed',
                    robotsTxtState: 'ALLOWED',
                    indexingState: 'INDEXING_ALLOWED',
                    pageFetchState: 'PAGE_FETCH_STATE_UNSPECIFIED',
                    sitemap: [`${origin}/sitemap.xml`],
                    referringUrls: [],
                    crawledAs: 'MOBILE',
                },
            mobileUsabilityResult: { verdict: indexed ? 'PASS' : 'VERDICT_UNSPECIFIED' },
            richResultsResult: site.kind === 'recipes'
                ? { verdict: 'PASS', detectedItems: [{ richResultType: 'Recipes', items: [{ name: 'Recipe', issues: [] }] }] }
                : undefined,
        },
    };
}

/** All GSC sites in the demo catalogue (for tooling). */
export function demoAllSiteUrls(): string[] {
    return getDemoSites().filter(s => s.gsc).map(s => s.gsc!.siteUrl);
}
