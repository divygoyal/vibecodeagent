/**
 * "What to fix next": ranked tasks from signals the site pages already load
 * (cached GA4 + Search Console reports), each with the numbers that triggered
 * it, an expected impact and a suggested fix.
 */
import { fmtFull } from '@/lib/format';
import {
    displayPage, expectedCtr, isDecaying, isLowCtr, isStriking, lowCtrPotential, median, pageRef, STRIKING_TARGET, strikingPotential, strikingTitle,
} from '@/components/site/lib/rules';
import { actionId, impactFor, pct, per28, plural } from '@/components/site/lib/actionText';
import type { ActionsResponse, SiteAction } from '@/components/site/lib/types';
import { ga4Breakdown, ga4Summary } from './ga4Reports';
import { gscCannibalization, gscDecay, gscRows, gscSummary, topPageByQuery } from './gscReports';
import { addDays, daysBetween, type RangeParams } from './params';

export interface ActionsInput {
    userId: string;
    /** Search Console token (and GA4 too unless gaToken is set). */
    token: string;
    /** GA4 token when the property sits in another Google account than the Search Console site. */
    gaToken?: string;
    /** Site label for prompts ('acme.com'). */
    label: string;
    siteUrl: string | null;
    property: string | null;
    /** GSC range (ends ~2 days ago) and GA4 range (ends today). */
    search: RangeParams;
    traffic: RangeParams;
}

const pos = (n: number) => n.toFixed(1);
const ctrText = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

/** Previous period of the same length when compare is off: drops need a baseline. */
function withPrevious(r: RangeParams): RangeParams {
    if (r.cmp) return r;
    const days = daysBetween(r.cur.start, r.cur.end);
    return { cur: r.cur, cmp: { start: addDays(r.cur.start, -days), end: addDays(r.cur.start, -1) } };
}

async function searchActions(inp: ActionsInput, partial: string[]): Promise<SiteAction[]> {
    const site = inp.siteUrl!;
    const r = withPrevious(inp.search);
    const days = daysBetween(r.cur.start, r.cur.end);
    const settle = <T,>(p: Promise<T>, what: string) => p.catch(() => {
        partial.push(what);
        return null;
    });
    const [summary, queries, pages, decay, cannibal, topPage] = await Promise.all([
        settle(gscSummary(inp.userId, inp.token, site, r), 'Search Console totals'),
        settle(gscRows(inp.userId, inp.token, site, 'queries', r), 'Search Console queries'),
        settle(gscRows(inp.userId, inp.token, site, 'pages', r), 'Search Console pages'),
        settle(gscDecay(inp.userId, inp.token, site, r.cur.end), 'Search Console page history'),
        settle(gscCannibalization(inp.userId, inp.token, site, r.cur), 'Search Console query pages'),
        settle(topPageByQuery(inp.userId, inp.token, site, r.cur), 'Search Console query pages'),
    ]);
    const scale = per28(summary?.totals.clicks ?? 0, days);
    const host = inp.label;
    const show = (url: string) => displayPage(pageRef(url), host);
    const out: SiteAction[] = [];

    // Site-wide search drop.
    if (summary?.previous && summary.previous.clicks >= 50) {
        const change = (summary.totals.clicks - summary.previous.clicks) / summary.previous.clicks;
        if (change <= -0.2) {
            const lost = summary.previous.clicks - summary.totals.clicks;
            out.push({
                id: actionId('search_drop', site),
                type: 'search_drop',
                area: 'Search',
                impact: change <= -0.4 ? 'high' : 'medium',
                title: `Search clicks fell ${pct(-change)}`,
                summary: `Clicks from Google went from ${fmtFull(summary.previous.clicks)} to ${fmtFull(summary.totals.clicks)} compared with the previous period. Average position moved from ${pos(summary.previous.position)} to ${pos(summary.totals.position)}.`,
                evidence: [
                    { label: 'Clicks', value: `${fmtFull(summary.previous.clicks)} → ${fmtFull(summary.totals.clicks)}` },
                    { label: 'Impressions', value: `${fmtFull(summary.previous.impressions)} → ${fmtFull(summary.totals.impressions)}` },
                    { label: 'Avg. position', value: `${pos(summary.previous.position)} → ${pos(summary.totals.position)}` },
                ],
                expectedImpact: `Recover up to ${fmtFull(per28(lost, days))} clicks a month`,
                score: per28(lost, days) * 1.2,
                fix: [
                    'Open Winners & losers to see which queries and pages lost the most.',
                    'If impressions fell too, check Indexing for pages that dropped out of Google.',
                    'If only clicks fell, compare titles and snippets with the results now ranking above you.',
                ],
                page: null,
                query: null,
                askPrompt: `Search clicks on ${host} fell ${pct(-change)} (${fmtFull(summary.previous.clicks)} → ${fmtFull(summary.totals.clicks)}) versus the previous period. What caused it and what should I fix first?`,
            });
        }
    }

    // Decaying pages: down in each of the last three 28-day windows.
    if (decay) {
        const rows = decay.filter((d) => isDecaying(d.clicks)).map((d) => ({ ...d, lost: d.clicks[0] - d.clicks[2] }))
            .sort((a, b) => b.lost - a.lost).slice(0, 10);
        for (const d of rows) {
            const p = show(d.page);
            out.push({
                id: actionId('decay', d.page),
                type: 'decay',
                area: 'Content',
                impact: impactFor(d.lost, scale),
                title: `Refresh ${p}: clicks fell three periods in a row`,
                summary: `Clicks fell from ${fmtFull(d.clicks[0])} to ${fmtFull(d.clicks[1])} to ${fmtFull(d.clicks[2])} over the last three 28-day periods (${pct(d.lost / Math.max(1, d.clicks[0]))} down).`,
                evidence: [
                    { label: 'Clicks per 28 days', value: d.clicks.map(fmtFull).join(' → ') },
                    { label: 'Lost', value: `${fmtFull(d.lost)} clicks a month` },
                ],
                expectedImpact: `Win back up to ${fmtFull(d.lost)} clicks a month`,
                score: d.lost,
                fix: [
                    'Check which queries for this page lost position (open the page in Pages).',
                    'Update facts, dates and examples; add what the pages now outranking it cover.',
                    'Link to it from 2–3 strong pages on your site, then request indexing in Search Console.',
                ],
                page: d.page,
                query: null,
                askPrompt: `${p} on ${host} is losing Google clicks: ${d.clicks.map(fmtFull).join(' → ')} over the last three 28-day periods. How should I refresh it?`,
            });
        }
    }

    // Striking-distance queries.
    if (queries) {
        const med = median(queries.rows.filter((x) => x.impressions > 0).map((x) => x.impressions));
        const rows = queries.rows.filter((x) => isStriking(x, med))
            .map((x) => ({ x, gain: per28(strikingPotential(x), days) }))
            .filter((o) => o.gain >= 3)
            .sort((a, b) => b.gain - a.gain).slice(0, 10);
        for (const { x, gain } of rows) {
            const page = topPage?.get(x.key) ?? null;
            out.push({
                id: actionId('striking', x.key),
                type: 'striking',
                area: 'Search',
                impact: impactFor(gain, scale),
                title: strikingTitle(x.key, x.position),
                summary: `Ranks ${pos(x.position)} with ${fmtFull(x.impressions)} impressions and ${fmtFull(x.clicks)} clicks${page ? ` (${show(page)})` : ''}. A result at position ${STRIKING_TARGET} usually gets about ${ctrText(expectedCtr(STRIKING_TARGET))} of clicks.`,
                evidence: [
                    { label: 'Position', value: pos(x.position) },
                    { label: 'Impressions', value: fmtFull(x.impressions) },
                    { label: 'CTR', value: ctrText(x.ctr) },
                    ...(page ? [{ label: 'Page', value: show(page) }] : []),
                ],
                expectedImpact: `+${fmtFull(gain)} clicks a month at position ${STRIKING_TARGET}`,
                score: gain,
                fix: [
                    `Make sure the page answers "${x.key}" directly near the top, with the query in the title and H1.`,
                    'Add a section covering what the top results cover and you do not.',
                    'Add internal links to the page using the query as anchor text.',
                ],
                page,
                query: x.key,
                askPrompt: `"${x.key}" ranks ${pos(x.position)} on ${host} with ${fmtFull(x.impressions)} impressions${page ? ` (page ${show(page)})` : ''}. ${x.position < 10.5 ? 'How do I move it up into the top 5?' : 'How do I get it onto the first page and higher?'}`,
            });
        }
    }

    // Low-CTR pages (page-level fixes help every query of the page).
    if (pages) {
        const rows = pages.rows.filter((x) => isLowCtr(x, 200))
            .map((x) => ({ x, gain: per28(lowCtrPotential(x), days) }))
            .filter((o) => o.gain >= 3)
            .sort((a, b) => b.gain - a.gain).slice(0, 8);
        for (const { x, gain } of rows) {
            const p = show(x.key);
            out.push({
                id: actionId('low_ctr', x.key),
                type: 'low_ctr',
                area: 'Search',
                impact: impactFor(gain, scale),
                title: `Rewrite the title and description of ${p}`,
                summary: `Ranks ${pos(x.position)} with ${fmtFull(x.impressions)} impressions but CTR is ${ctrText(x.ctr)} (about ${ctrText(expectedCtr(x.position))} is usual at that position).`,
                evidence: [
                    { label: 'Position', value: pos(x.position) },
                    { label: 'Impressions', value: fmtFull(x.impressions) },
                    { label: 'CTR', value: `${ctrText(x.ctr)} (usual ${ctrText(expectedCtr(x.position))})` },
                ],
                expectedImpact: `+${fmtFull(gain)} clicks a month at the usual CTR`,
                score: gain,
                fix: [
                    'Lead the title with what searchers want; keep it under ~60 characters.',
                    'Write a meta description that promises a specific answer or benefit.',
                    'Check the page shows rich results it qualifies for (FAQ, reviews, breadcrumbs).',
                ],
                page: x.key,
                query: null,
                askPrompt: `${p} on ${host} has a ${ctrText(x.ctr)} CTR at position ${pos(x.position)} (${fmtFull(x.impressions)} impressions). Suggest a better title and meta description.`,
            });
        }
    }

    // Cannibalization.
    if (cannibal) {
        for (const c of cannibal.filter((x) => x.severity !== 'low' && x.totalImpressions >= 100).slice(0, 8)) {
            const lead = c.pages[0];
            const others = c.pages.slice(1, 3);
            const gain = per28(Math.round(c.totalImpressions * Math.max(0, expectedCtr(Math.max(1, c.bestPosition - 1)) - c.totalClicks / Math.max(1, c.totalImpressions))), days);
            out.push({
                id: actionId('cannibalization', c.query),
                type: 'cannibalization',
                area: 'Content',
                impact: c.severity === 'high' ? impactFor(Math.max(gain, scale * 0.02), scale) : impactFor(gain, scale),
                title: `${c.pages.length} pages compete for "${c.query}"`,
                summary: `${plural(c.pages.length, 'page')} split ${fmtFull(c.totalImpressions)} impressions: ${c.pages.slice(0, 3).map((p) => `${show(p.page)} ${pct(p.share)} (pos ${pos(p.position)})`).join(', ')}.`,
                evidence: [
                    { label: 'Impressions', value: fmtFull(c.totalImpressions) },
                    { label: 'Best position', value: pos(c.bestPosition) },
                    ...c.pages.slice(0, 3).map((p, i) => ({ label: i === 0 ? 'Main page' : 'Competing', value: `${show(p.page)} · ${pct(p.share)}` })),
                ],
                expectedImpact: gain > 0 ? `+${fmtFull(gain)} clicks a month if one page ranks` : 'Clearer ranking for this query',
                score: Math.max(gain, 1),
                fix: [
                    `Pick ${show(lead.page)} as the page for "${c.query}".`,
                    others.length ? `Point ${others.map((p) => show(p.page)).join(' and ')} at a different intent, or merge and 301-redirect them.` : 'Merge or redirect the weaker page.',
                    'Update internal links so they all point to the chosen page.',
                ],
                page: lead.page,
                query: c.query,
                askPrompt: `On ${host}, ${c.pages.length} pages compete for "${c.query}": ${c.pages.slice(0, 3).map((p) => `${show(p.page)} (pos ${pos(p.position)})`).join(', ')}. Which should I keep and what should I do with the others?`,
            });
        }
    }
    return out;
}

async function trafficActions(inp: ActionsInput, partial: string[]): Promise<SiteAction[]> {
    const property = inp.property!;
    const r = withPrevious(inp.traffic);
    const days = daysBetween(r.cur.start, r.cur.end);
    const settle = <T,>(p: Promise<T>, what: string) => p.catch(() => {
        partial.push(what);
        return null;
    });
    const [summary, channels, pages] = await Promise.all([
        settle(ga4Summary(inp.userId, inp.gaToken ?? inp.token, property, r), 'Analytics totals'),
        settle(ga4Breakdown(inp.userId, inp.gaToken ?? inp.token, property, 'channels', r), 'Analytics channels'),
        settle(ga4Breakdown(inp.userId, inp.gaToken ?? inp.token, property, 'pages', r), 'Analytics pages'),
    ]);
    const host = inp.label;
    const out: SiteAction[] = [];
    const scale = per28(summary?.totals.sessions ?? 0, days);

    if (summary) {
        // Zero traffic for 2+ full days (today is partial, so it is skipped).
        const full = summary.series.slice(0, -1);
        const tail = full.slice(-2);
        const before = full.slice(0, -2).reduce((a, p) => a + p.sessions, 0);
        if (tail.length === 2 && tail.every((p) => p.sessions === 0) && before > 20) {
            out.push({
                id: actionId('traffic_drop', `zero:${tail[0].date}`),
                type: 'traffic_drop',
                area: 'Technical',
                impact: 'high',
                title: 'No visits recorded for 2 days',
                summary: `Analytics recorded 0 sessions on ${tail.map((p) => p.date).join(' and ')} after ${fmtFull(before)} sessions earlier in the period. The tracking tag may be missing or the site may be down.`,
                evidence: tail.map((p) => ({ label: p.date, value: '0 sessions' })),
                expectedImpact: 'Restores your data (and possibly your visitors)',
                score: Math.max(scale, 1000),
                fix: [
                    'Open the site and check it loads.',
                    'Check the GA4 tag fires (GA4 > Admin > DebugView, or the Tag Assistant).',
                    'Look for a recent deploy that removed the tag or consent banner changes.',
                ],
                page: null,
                query: null,
                askPrompt: `Google Analytics shows 0 sessions on ${host} for the last 2 days. How do I find out whether the site or the tracking broke?`,
            });
        }
        const prev = summary.previous;
        if (prev && prev.sessions >= 50) {
            const change = (summary.totals.sessions - prev.sessions) / prev.sessions;
            if (change <= -0.2) {
                const lost = prev.sessions - summary.totals.sessions;
                out.push({
                    id: actionId('traffic_drop', `site:${property}`),
                    type: 'traffic_drop',
                    area: 'Traffic',
                    impact: change <= -0.4 ? 'high' : 'medium',
                    title: `Sessions fell ${pct(-change)}`,
                    summary: `Sessions went from ${fmtFull(prev.sessions)} to ${fmtFull(summary.totals.sessions)} and users from ${fmtFull(prev.users)} to ${fmtFull(summary.totals.users)} compared with the previous period.`,
                    evidence: [
                        { label: 'Sessions', value: `${fmtFull(prev.sessions)} → ${fmtFull(summary.totals.sessions)}` },
                        { label: 'Users', value: `${fmtFull(prev.users)} → ${fmtFull(summary.totals.users)}` },
                        { label: 'Key events', value: `${fmtFull(prev.conversions)} → ${fmtFull(summary.totals.conversions)}` },
                    ],
                    expectedImpact: `Recover up to ${fmtFull(per28(lost, days))} sessions a month`,
                    score: per28(lost, days),
                    fix: [
                        'See which channel fell most (Traffic > Sources).',
                        'If it is Organic Search, open Search > Winners & losers.',
                        'If it is Referral or Social, check whether a link or campaign ended.',
                    ],
                    page: null,
                    query: null,
                    askPrompt: `Sessions on ${host} fell ${pct(-change)} (${fmtFull(prev.sessions)} → ${fmtFull(summary.totals.sessions)}) versus the previous period. Which channels and pages explain it?`,
                });
            }
        }
    }

    if (channels) {
        const total = channels.rows.reduce((a, x) => a + (x.prev?.sessions ?? 0), 0);
        for (const ch of channels.rows) {
            const name = ch.dims.sessionDefaultChannelGroup;
            const cur = ch.cur.sessions ?? 0;
            const before = ch.prev?.sessions ?? 0;
            const lost = before - cur;
            if (before < 50 || lost < Math.max(30, total * 0.03) || cur > before * 0.7) continue;
            out.push({
                id: actionId('traffic_drop', `channel:${name}`),
                type: 'traffic_drop',
                area: 'Traffic',
                impact: impactFor(per28(lost, days), scale),
                title: `${name} traffic fell ${pct(lost / before)}`,
                summary: `${name} sessions went from ${fmtFull(before)} to ${fmtFull(cur)} compared with the previous period.`,
                evidence: [
                    { label: 'Sessions', value: `${fmtFull(before)} → ${fmtFull(cur)}` },
                    { label: 'Share of traffic before', value: pct(total > 0 ? before / total : 0) },
                ],
                expectedImpact: `Recover up to ${fmtFull(per28(lost, days))} sessions a month`,
                score: per28(lost, days),
                fix: name === 'Organic Search'
                    ? ['Open Search > Winners & losers to find the queries that dropped.', 'Check Indexing for pages that fell out of Google.']
                    : ['Open Traffic > Sources and filter to this channel to see which source fell.', 'Check whether a campaign, newsletter or partner link ended.'],
                page: null,
                query: null,
                askPrompt: `${name} sessions on ${host} fell from ${fmtFull(before)} to ${fmtFull(cur)}. Why might that be and what should I do?`,
            });
        }
    }

    if (pages) {
        const totalViews = pages.rows.reduce((a, x) => a + (x.prev?.screenPageViews ?? 0), 0);
        const drops = pages.rows
            .map((x) => ({ x, before: x.prev?.screenPageViews ?? 0, cur: x.cur.screenPageViews ?? 0 }))
            .filter((o) => o.before >= 100 && o.cur <= o.before * 0.6 && o.before - o.cur >= Math.max(50, totalViews * 0.01))
            .sort((a, b) => (b.before - b.cur) - (a.before - a.cur))
            .slice(0, 5);
        for (const { x, before, cur } of drops) {
            const ref = pageRef(x.dims.pagePath, x.dims.hostName);
            const p = displayPage(ref, host);
            const lost = before - cur;
            out.push({
                id: actionId('traffic_drop', `page:${ref.key}`),
                type: 'traffic_drop',
                area: 'Traffic',
                impact: impactFor(per28(lost, days) * 0.6, scale),
                title: `Views of ${p} fell ${pct(lost / before)}`,
                summary: `${p} had ${fmtFull(before)} views in the previous period and ${fmtFull(cur)} now.`,
                evidence: [
                    { label: 'Views', value: `${fmtFull(before)} → ${fmtFull(cur)}` },
                    { label: 'Users', value: `${fmtFull(x.prev?.activeUsers ?? 0)} → ${fmtFull(x.cur.activeUsers ?? 0)}` },
                ],
                expectedImpact: `Recover up to ${fmtFull(per28(lost, days))} views a month`,
                score: per28(lost, days) * 0.6,
                fix: [
                    'Open the page in Pages to see whether search clicks fell too.',
                    'Check the page still loads, and that links to it from your menu or other pages still exist.',
                ],
                page: ref.path,
                query: null,
                askPrompt: `Views of ${p} on ${host} fell from ${fmtFull(before)} to ${fmtFull(cur)}. How do I find out why?`,
            });
        }
    }
    return out;
}

export async function buildActions(inp: ActionsInput): Promise<ActionsResponse> {
    const partial: string[] = [];
    const [search, traffic] = await Promise.all([
        inp.siteUrl ? searchActions(inp, partial) : Promise.resolve([]),
        inp.property ? trafficActions(inp, partial) : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const unique = [...search, ...traffic].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    // Mix types: the n-th task of the same type ranks as if 20% smaller per step,
    // so one signal (e.g. ten striking-distance queries) doesn't fill the top.
    const nth = new Map<string, number>();
    const ranked = [...unique].sort((a, b) => b.score - a.score).map((a) => {
        const n = nth.get(a.type) ?? 0;
        nth.set(a.type, n + 1);
        return { a, adj: a.score * 0.8 ** n };
    });
    const rank = { high: 3, medium: 2, low: 1 };
    const actions = ranked
        .sort((x, y) => rank[y.a.impact] - rank[x.a.impact] || y.adj - x.adj)
        .map((x) => x.a)
        .slice(0, 60);
    const w = inp.siteUrl ? withPrevious(inp.search) : withPrevious(inp.traffic);
    return {
        actions,
        partial: [...new Set(partial)],
        window: { start: w.cur.start, end: w.cur.end, prevStart: w.cmp?.start ?? null, prevEnd: w.cmp?.end ?? null },
    };
}

