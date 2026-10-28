/**
 * Traffic › Journeys flows (round 5, audit item 18), pure so they can be tested: GA4 channel -> landing page ->
 * next page or key event, and Search Console query -> page. Small flows fold into "Other …" nodes so a flow chart
 * stays readable (at most ~7 nodes per column).
 */
import type { JourneysResponse, SearchFlowResponse } from './types';

export type FlowNodeKind = 'channel' | 'landing' | 'next' | 'key' | 'nokey' | 'end' | 'query' | 'other';

export interface FlowNode {
    id: string;
    col: number;
    /** Raw value: channel name, page path, query. */
    name: string;
    kind: FlowNodeKind;
    value: number;
}

export interface FlowLink {
    source: string;
    target: string;
    value: number;
}

export interface Flow {
    nodes: FlowNode[];
    links: FlowLink[];
    /** Sessions (GA4) or clicks (Search Console) the flow starts with. */
    total: number;
}

export type JourneyMode = 'next' | 'key';

export const OTHER = '__other';

function topKeys(totals: Map<string, number>, n: number): Set<string> {
    const sorted = [...totals].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    // Folding a single leftover into "Other" hides a name for nothing: show it instead.
    return new Set(sorted.slice(0, sorted.length === n + 1 ? n + 1 : n).map(([k]) => k));
}

function add<K>(m: Map<K, number>, k: K, v: number) {
    m.set(k, (m.get(k) ?? 0) + v);
}

function linksFrom(m: Map<string, number>): FlowLink[] {
    return [...m].map(([k, value]) => {
        const [source, target] = k.split('\u0001');
        return { source, target, value };
    }).filter((l) => l.value > 0);
}

/** Nodes of a column in display order: biggest first, "Other" and end states last. */
function columnNodes(col: number, totals: Map<string, number>, kindOf: (name: string) => FlowNodeKind, prefix: string): FlowNode[] {
    const rank = (k: FlowNodeKind) => (k === 'other' ? 1 : k === 'end' || k === 'nokey' ? 2 : 0);
    return [...totals].filter(([, v]) => v > 0)
        .map(([name, value]) => ({ id: `${prefix}${name}`, col, name, kind: kindOf(name), value }))
        .sort((a, b) => rank(a.kind) - rank(b.kind) || b.value - a.value);
}

/**
 * GA4: channel -> landing page -> (next page | key event). Sessions on the first two columns. In 'next' mode the
 * third column is page views opened from the landing page in sessions that started there, plus "No next page"
 * for the sessions with none recorded (left, or stayed on the page). In 'key' mode it splits each landing page's
 * sessions into those with a key event and those without (GA4 session key event rate).
 */
export function buildJourneyFlow(data: JourneysResponse, mode: JourneyMode, opts: { channels?: number; landings?: number; next?: number } = {}): Flow {
    const nCh = opts.channels ?? 5;
    const nLa = opts.landings ?? 6;
    const nNx = opts.next ?? 6;
    const chTotals = new Map<string, number>();
    const laTotals = new Map<string, number>();
    for (const e of data.entries) {
        add(chTotals, e.channel, e.sessions);
        add(laTotals, e.landing, e.sessions);
    }
    const chKeep = topKeys(chTotals, nCh);
    const laKeep = topKeys(laTotals, nLa);
    const ch = (c: string) => (chKeep.has(c) ? c : OTHER);
    const la = (l: string) => (laKeep.has(l) ? l : OTHER);

    const col0 = new Map<string, number>();
    const col1 = new Map<string, number>();
    const l01 = new Map<string, number>();
    const keyBy = new Map<string, number>();
    for (const e of data.entries) {
        add(col0, ch(e.channel), e.sessions);
        add(col1, la(e.landing), e.sessions);
        add(l01, `c:${ch(e.channel)}\u0001l:${la(e.landing)}`, e.sessions);
        add(keyBy, la(e.landing), e.keySessions);
    }

    const col2 = new Map<string, number>();
    const l12 = new Map<string, number>();
    const END = mode === 'key' ? '__nokey' : '__end';
    if (mode === 'key') {
        for (const [l, sessions] of col1) {
            const key = Math.min(sessions, keyBy.get(l) ?? 0);
            add(l12, `l:${l}\u0001o:__key`, key);
            add(l12, `l:${l}\u0001o:${END}`, sessions - key);
            add(col2, '__key', key);
            add(col2, END, sessions - key);
        }
    } else {
        const nxTotals = new Map<string, number>();
        for (const n of data.next) add(nxTotals, n.next, n.views);
        const nxKeep = topKeys(nxTotals, nNx);
        const nx = (p: string) => (nxKeep.has(p) ? p : OTHER);
        const out = new Map<string, number>();
        for (const n of data.next) {
            const l = la(n.landing);
            if (!col1.has(l)) continue;
            add(l12, `l:${l}\u0001o:${nx(n.next)}`, n.views);
            add(col2, nx(n.next), n.views);
            add(out, l, n.views);
        }
        for (const [l, sessions] of col1) {
            const rest = Math.max(0, sessions - (out.get(l) ?? 0));
            add(l12, `l:${l}\u0001o:${END}`, rest);
            add(col2, END, rest);
        }
    }

    const nodes = [
        ...columnNodes(0, col0, (n) => (n === OTHER ? 'other' : 'channel'), 'c:'),
        ...columnNodes(1, col1, (n) => (n === OTHER ? 'other' : 'landing'), 'l:'),
        ...columnNodes(2, col2, (n) => (n === OTHER ? 'other' : n === '__key' ? 'key' : n === '__nokey' ? 'nokey' : n === '__end' ? 'end' : 'next'), 'o:'),
    ];
    const total = [...col0.values()].reduce((a, b) => a + b, 0);
    return { nodes, links: [...linksFrom(l01), ...linksFrom(l12)], total };
}

/** Share of landing sessions with a recorded next page (0-1), null without referrer data. */
export function continuationRate(data: JourneysResponse): number | null {
    if (!data.next.length) return null;
    const sessions = data.entries.reduce((a, e) => a + e.sessions, 0);
    const views = data.next.reduce((a, n) => a + n.views, 0);
    return sessions > 0 ? Math.min(1, views / sessions) : null;
}

/** Search Console: query -> page, clicks. */
export function buildSearchFlow(data: SearchFlowResponse, opts: { queries?: number; pages?: number } = {}): Flow {
    const qTotals = new Map<string, number>();
    const pTotals = new Map<string, number>();
    for (const r of data.rows) {
        add(qTotals, r.query, r.clicks);
        add(pTotals, r.page, r.clicks);
    }
    const qKeep = topKeys(qTotals, opts.queries ?? 7);
    const pKeep = topKeys(pTotals, opts.pages ?? 6);
    const col0 = new Map<string, number>();
    const col1 = new Map<string, number>();
    const l01 = new Map<string, number>();
    for (const r of data.rows) {
        const q = qKeep.has(r.query) ? r.query : OTHER;
        const p = pKeep.has(r.page) ? r.page : OTHER;
        add(col0, q, r.clicks);
        add(col1, p, r.clicks);
        add(l01, `q:${q}\u0001p:${p}`, r.clicks);
    }
    return {
        nodes: [
            ...columnNodes(0, col0, (n) => (n === OTHER ? 'other' : 'query'), 'q:'),
            ...columnNodes(1, col1, (n) => (n === OTHER ? 'other' : 'landing'), 'p:'),
        ],
        links: linksFrom(l01),
        total: [...col0.values()].reduce((a, b) => a + b, 0),
    };
}

/** For each landing page: its top next pages with their share of the landing page's sessions. */
export function nextPagesByLanding(data: JourneysResponse, n = 3): Map<string, { next: string; share: number }[]> {
    const sessions = new Map<string, number>();
    for (const e of data.entries) add(sessions, e.landing, e.sessions);
    const by = new Map<string, { next: string; views: number }[]>();
    for (const x of data.next) {
        const list = by.get(x.landing) ?? [];
        list.push({ next: x.next, views: x.views });
        by.set(x.landing, list);
    }
    const out = new Map<string, { next: string; share: number }[]>();
    for (const [l, list] of by) {
        const s = sessions.get(l) ?? 0;
        if (!s) continue;
        out.set(l, list.sort((a, b) => b.views - a.views).slice(0, n).map((x) => ({ next: x.next, share: Math.min(1, x.views / s) })));
    }
    return out;
}
