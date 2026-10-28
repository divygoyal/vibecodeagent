/**
 * Ask in the public demo: no model calls. Four suggested questions with answers written from the
 * demo generator's numbers at request time (the same data the demo's pages show), so they stay
 * true day by day. Pure apart from Date.now(); memoised per UTC day.
 */
import { demoRunReport } from '@/lib/demo/ga4';
import { ctrForPosition, demoSearchAnalytics } from '@/lib/demo/gsc';
import { buildDemoPortfolio } from '@/lib/portfolio/demo';
import type { PortfolioSite } from '@/lib/portfolio/types';
import { DEMO_ACCOUNT_KEY } from './config';

export interface DemoAskSample {
    id: string;
    question: string;
    /** Markdown, rendered by the Ask page's normal answer renderer. */
    answer: string;
}

const ACME_GSC = 'sc-domain:acmeanalytics.example';
const ACME_GA4 = 'properties/412300101';

const nf = new Intl.NumberFormat('en-US');
const n = (v: number) => nf.format(Math.round(v));
const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
const isoDaysAgo = (d: number, now: number) => new Date(now - d * 86_400_000).toISOString().slice(0, 10);

function change(cur: number, prev: number | null | undefined): number | null {
    if (prev === null || prev === undefined || prev <= 0) return null;
    return cur / prev - 1;
}

function movers(now: number): string {
    const p = buildDemoPortfolio({ range: '28d', now, account: DEMO_ACCOUNT_KEY });
    const rows = p.sites
        .map((s: PortfolioSite) => {
            const clicks = s.search?.cur.clicks ?? null;
            const users = s.traffic?.cur.users ?? null;
            const dc = s.search ? change(s.search.cur.clicks, s.search.prev?.clicks) : null;
            const du = s.traffic ? change(s.traffic.cur.users, s.traffic.prev?.users) : null;
            return { s, clicks, users, dc, du, score: du ?? dc ?? 0 };
        })
        .filter((r) => (r.users ?? 0) + (r.clicks ?? 0) >= 50);
    const up = [...rows].sort((a, b) => b.score - a.score).slice(0, 3);
    const down = [...rows].sort((a, b) => a.score - b.score).filter((r) => r.score < 0).slice(0, 2);
    const line = (r: (typeof rows)[number]) =>
        `| ${r.s.label} | ${r.users !== null ? n(r.users) : '–'} | ${r.du !== null ? signed(r.du) : '–'} | ${r.clicks !== null ? n(r.clicks) : '–'} | ${r.dc !== null ? signed(r.dc) : '–'} |`;
    const head = '| Site | Users (28 days) | vs before | Search clicks | vs before |\n|---|---:|---:|---:|---:|';
    const best = up[0];
    const worst = down[0];
    return [
        best ? `**${best.s.label}** grew the most: ${best.du !== null ? `${signed(best.du)} users` : `${signed(best.dc ?? 0)} search clicks`} compared with the 28 days before.` : 'Here is how your sites moved.',
        '',
        '**Growing**',
        '',
        head,
        ...up.map(line),
        ...(down.length ? ['', '**Falling**', '', head, ...down.map(line)] : []),
        '',
        worst ? `Worth a look: **${worst.s.label}** is down ${signed(worst.score).replace('−', '')}. Open its Search tab to see which queries lost clicks.` : '',
    ].join('\n').trim();
}

function topQueries(now: number): string {
    const end = isoDaysAgo(2, now);
    const start = isoDaysAgo(29, now);
    const res = demoSearchAnalytics(ACME_GSC, { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 250 }, { now });
    const rows = ((res.rows ?? []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[])
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 6);
    const total = ((res.rows ?? []) as { clicks: number }[]).reduce((sum, r) => sum + r.clicks, 0);
    const top = rows[0];
    return [
        top ? `Your top query on **acmeanalytics.example** is **"${top.keys[0]}"** with ${n(top.clicks)} clicks in the last 28 days (average position ${top.position.toFixed(1)}).` : 'No search queries yet.',
        '',
        '| Query | Clicks | Impressions | CTR | Position |',
        '|---|---:|---:|---:|---:|',
        ...rows.map((r) => `| ${r.keys[0]} | ${n(r.clicks)} | ${n(r.impressions)} | ${pct(r.ctr, 1)} | ${r.position.toFixed(1)} |`),
        '',
        total && rows.length ? `These six queries bring ${pct(rows.reduce((s, r) => s + r.clicks, 0) / total)} of the site's search clicks.` : '',
    ].join('\n').trim();
}

function channels(now: number): string {
    const res = demoRunReport(ACME_GA4, {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }, { now }) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
    const rows = (res.rows ?? []).map((r) => ({ name: r.dimensionValues[0]?.value ?? '(other)', sessions: Number(r.metricValues[0]?.value ?? 0), events: Number(r.metricValues[1]?.value ?? 0) }))
        .filter((r) => r.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions);
    const total = rows.reduce((s, r) => s + r.sessions, 0) || 1;
    const top = rows.slice(0, 6);
    const best = [...rows].filter((r) => r.sessions >= total * 0.03).sort((a, b) => b.events / b.sessions - a.events / a.sessions)[0];
    return [
        top[0] ? `Most visits to **Acme Analytics** come from **${top[0].name}** (${pct(top[0].sessions / total)} of ${n(total)} sessions in the last 28 days).` : 'No sessions yet.',
        '',
        '| Channel | Sessions | Share | Key events |',
        '|---|---:|---:|---:|',
        ...top.map((r) => `| ${r.name} | ${n(r.sessions)} | ${pct(r.sessions / total)} | ${n(r.events)} |`),
        '',
        best ? `**${best.name}** converts best: ${pct(best.events / best.sessions, 1)} of its sessions end in a key event.` : '',
    ].join('\n').trim();
}

function quickWins(now: number): string {
    const end = isoDaysAgo(2, now);
    const start = isoDaysAgo(29, now);
    const res = demoSearchAnalytics(ACME_GSC, { startDate: start, endDate: end, dimensions: ['page'], rowLimit: 500 }, { now });
    const rows = ((res.rows ?? []) as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[])
        .filter((r) => r.position >= 4 && r.position <= 15 && r.impressions >= 200)
        .map((r) => ({ ...r, gain: Math.max(0, r.impressions * ctrForPosition(3) - r.clicks) }))
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 5);
    // Acme's domain property also covers docs.acmeanalytics.example: name the host when it is not the main one.
    const path = (u: string) => {
        try {
            const url = new URL(u);
            return url.hostname.replace(/^www\./, '') === 'acmeanalytics.example' ? url.pathname || '/' : `${url.hostname}${url.pathname}`;
        } catch {
            return u;
        }
    };
    const extra = rows.reduce((s, r) => s + r.gain, 0);
    return [
        rows.length
            ? `Start with pages that already rank on page one or two but get few clicks. Moving these five into the top three could bring about **${n(extra)} more clicks** a month.`
            : 'No page sits just outside the top results right now.',
        '',
        '| Page | Impressions | Position | CTR | Possible extra clicks |',
        '|---|---:|---:|---:|---:|',
        ...rows.map((r) => `| ${path(r.keys[0])} | ${n(r.impressions)} | ${r.position.toFixed(1)} | ${pct(r.ctr, 1)} | ${n(r.gain)} |`),
        '',
        rows[0] ? `First: **${path(rows[0].keys[0])}**. Rewrite its title and description around the query it ranks for, and link to it from your top pages.` : '',
    ].join('\n').trim();
}

const QUESTIONS: { id: string; question: string; build: (now: number) => string }[] = [
    { id: 'movers', question: 'Which of my sites grew the most this month?', build: movers },
    { id: 'queries', question: 'What are the top search queries for Acme Analytics?', build: topQueries },
    { id: 'channels', question: 'Where does Acme Analytics traffic come from?', build: channels },
    { id: 'quick-wins', question: 'Which pages should I improve first?', build: quickWins },
];

let memo: { day: string; samples: DemoAskSample[] } | null = null;

/** The demo's suggested questions with their sample answers (same numbers all day). */
export function demoAskSamples(now: number = Date.now()): DemoAskSample[] {
    const day = new Date(now).toISOString().slice(0, 10);
    if (memo?.day === day) return memo.samples;
    const samples = QUESTIONS.map((q) => {
        let answer: string;
        try {
            answer = q.build(now);
        } catch (err) {
            console.warn(`[public-demo] sample answer ${q.id} failed:`, err instanceof Error ? err.message : err);
            answer = 'This sample answer is not available right now.';
        }
        return { id: q.id, question: q.question, answer };
    });
    memo = { day, samples };
    return samples;
}
