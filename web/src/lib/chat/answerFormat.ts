/**
 * Ask answers in the app's own language (round 5, audit item 19). Pure helpers, no React:
 *
 *  - `linkAnswer`: site names and tab mentions in an answer's markdown become links into the app
 *    ("acme.com" -> /dashboard/s/acme.com, "its Search tab" -> /dashboard/s/acme.com/search).
 *  - `parseDelta`: "+882%", "−7%", "-4.5%" read as a change with a direction and a tone.
 *  - `analyzeTable`: which columns hold numbers, changes or dates, which one gets heat bars,
 *    and whether the rows form a time series worth a sparkline.
 *
 * The model's prompt is not touched: this only reads what the answer already says.
 */
import type { MetricKey } from '@/lib/metrics';

/* ─── links ─── */

export interface AnswerSite {
    /** Route key (/dashboard/s/<host>). */
    host: string;
    /** Names the answer may use for it: the host, the GA4 display name. */
    names: string[];
}

export type AnswerSection = '' | 'traffic' | 'search' | 'pages' | 'actions';

const SECTION_BY_WORD: Record<string, AnswerSection> = { Overview: '', Traffic: 'traffic', Search: 'search', Pages: 'pages', Actions: 'actions' };
const SUB_TABS: Record<'Traffic' | 'Search', Record<string, string>> = {
    Search: { performance: 'performance', opportunities: 'opportunities', cannibalization: 'cannibalization', 'winners & losers': 'movers', movers: 'movers', indexing: 'indexing' },
    Traffic: { overview: 'overview', pages: 'pages', sources: 'sources', audience: 'audience', realtime: 'realtime', 'events & goals': 'events', events: 'events', funnels: 'funnels', journeys: 'journeys', retention: 'retention' },
};

export function siteLinkHref(host: string, section: AnswerSection = '', tab?: string): string {
    return `/dashboard/s/${encodeURIComponent(host)}${section ? `/${section}` : ''}${tab ? `?tab=${tab}` : ''}`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The names worth matching: hosts (with a dot) and display names of 5+ characters, longest first. */
function nameIndex(sites: AnswerSite[]): { name: string; host: string }[] {
    const seen = new Set<string>();
    const out: { name: string; host: string }[] = [];
    for (const s of sites) {
        for (const raw of s.names) {
            const name = (raw || '').trim();
            if (!name || seen.has(name)) continue;
            if (/^ga4-\d+$/.test(name)) continue;
            if (!name.includes('.') && name.length < 5) continue;
            seen.add(name);
            out.push({ name, host: s.host });
        }
    }
    return out.sort((a, b) => b.name.length - a.name.length);
}

// Spans to leave alone inside a line: inline code, existing links/images, autolinks, HTML comments, bare URLs.
const PROTECTED = /`[^`]*`|!?\[[^\]]*\]\([^)]*\)|<[^>]+>|https?:\/\/\S+/g;
const TAB_RE = /\b(?:(?:its|the|their|your)\s+)?(Overview|Traffic|Search|Pages|Actions)(?:\s*(?:›|>|»)\s*(Performance|Opportunities|Cannibalization|Winners & losers|Movers|Indexing|Overview|Pages|Sources|Audience|Realtime|Events & goals|Events|Funnels|Journeys|Retention))?\s+(tab|page|section)\b/g;

/**
 * Turn site names and tab mentions into markdown links. A tab mention links to the site named last
 * before it in the answer ("Open its Search tab"), or to `fallbackHost` (the site Ask is about).
 * Code blocks, headings' anchors, existing links and URLs are left as they are.
 */
export function linkAnswer(md: string, sites: AnswerSite[], fallbackHost: string | null = null): string {
    if (!md) return md;
    const names = nameIndex(sites);
    if (names.length === 0 && !fallbackHost) return md;
    const nameRe = names.length
        ? new RegExp(`(?<![\\w./@-])(${names.map((n) => esc(n.name)).join('|')})(?![\\w-]|\\.[A-Za-z0-9])`, 'g')
        : null;
    const hostByName = new Map(names.map((n) => [n.name, n.host]));
    let lastHost: string | null = null;
    let inFence = false;

    const linkPlain = (text: string): string => {
        // Sites first, then tabs; remember the last site in reading order for "its … tab".
        type Hit = { start: number; end: number; out: string; host?: string };
        const hits: Hit[] = [];
        if (nameRe) {
            nameRe.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = nameRe.exec(text))) {
                const host = hostByName.get(m[1])!;
                hits.push({ start: m.index, end: m.index + m[0].length, out: `[${m[1]}](${siteLinkHref(host)})`, host });
            }
        }
        TAB_RE.lastIndex = 0;
        let t: RegExpExecArray | null;
        const tabs: { start: number; end: number; word: string; sub?: string; text: string }[] = [];
        while ((t = TAB_RE.exec(text))) {
            if (hits.some((h) => t!.index < h.end && t!.index + t![0].length > h.start)) continue;
            tabs.push({ start: t.index, end: t.index + t[0].length, word: t[1], sub: t[2], text: t[0] });
        }
        const all = [...hits, ...tabs.map((x) => ({ ...x, out: '', tab: true as const }))].sort((a, b) => a.start - b.start);
        let out = '';
        let cursor = 0;
        for (const h of all) {
            if (h.start < cursor) continue;
            out += text.slice(cursor, h.start);
            if ('tab' in h) {
                const host = lastHost ?? fallbackHost;
                const tb = h as unknown as { word: string; sub?: string; text: string };
                if (host) {
                    const section = SECTION_BY_WORD[tb.word];
                    const sub = tb.sub && (tb.word === 'Search' || tb.word === 'Traffic') ? SUB_TABS[tb.word][tb.sub.toLowerCase()] : undefined;
                    out += `[${tb.text}](${siteLinkHref(host, section, sub)})`;
                } else {
                    out += tb.text;
                }
            } else {
                out += h.out;
                lastHost = h.host ?? lastHost;
            }
            cursor = h.end;
        }
        return out + text.slice(cursor);
    };

    return md.split('\n').map((line) => {
        if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
        if (inFence) return line;
        if (/^\s*\|?\s*:?-{2,}/.test(line) && /^[\s|:-]+$/.test(line)) return line; // table separator row
        if (/^\s*<!--/.test(line)) return line;
        let out = '';
        let cursor = 0;
        PROTECTED.lastIndex = 0;
        let p: RegExpExecArray | null;
        while ((p = PROTECTED.exec(line))) {
            out += linkPlain(line.slice(cursor, p.index)) + p[0];
            cursor = p.index + p[0].length;
        }
        return out + linkPlain(line.slice(cursor));
    }).join('\n');
}

/* ─── numbers and changes ─── */

/** "1,551" "12.4K" "$1,200" "45%" "4.8" -> number; "–", "", "n/a" -> null. */
export function parseNumber(text: string): number | null {
    const s = text.trim().replace(/[−–]/g, '-').replace(/^[~≈]/, '');
    const m = /^([+-])?\s*[$€£]?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*([KkMmBb])?\s*(%|pp|pts?|s|ms)?$/.exec(s);
    if (!m) return null;
    let v = Number(`${m[2].replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`);
    const mult = m[4] ? ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[m[4].toLowerCase()] : 1;
    v *= mult;
    return m[1] === '-' ? -v : v;
}

export interface DeltaText {
    direction: 'up' | 'down' | 'flat';
    tone: 'good' | 'bad' | 'neutral';
    /** The change as the answer wrote it, with a typographic minus. */
    text: string;
    /** Position changes: what the arrow means in words ("improved 0.3", "worse by 1.6"); also the tooltip. */
    spoken?: string;
}

/**
 * A signed change: "+882%", "−7%", "-4.5%", "+3 pp", "0%". Unsigned values are not changes (except 0).
 * `bare` also accepts numbers without a unit ("+342", "−1.6"), for columns that are known to hold changes.
 */
export function parseDelta(text: string, opts: { betterDown?: boolean; neutral?: boolean; bare?: boolean; rank?: boolean } = {}): DeltaText | null {
    const s = text.trim();
    const m = /^([+\-\u2212\u2013])?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|pp|pts?)?$/.exec(s);
    if (!m) return null;
    if (!m[4] && !opts.bare) return null;
    const zero = Number(`${m[2].replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`) === 0;
    if (!m[1] && !zero) return null;
    const value = `${m[2]}${m[3] ? `.${m[3]}` : ''}`;
    if (opts.rank && !m[4]) {
        // A position change written as new minus old ("+1.6" = the number rose = the page fell). Same convention as
        // the app's MetricDelta for position: the arrow shows where the rank moved (▲ = better), green when better.
        if (zero) return { direction: 'flat', tone: 'neutral', text: value, spoken: 'no change' };
        const better = m[1] !== '+';
        return { direction: better ? 'up' : 'down', tone: better ? 'good' : 'bad', text: value, spoken: better ? `improved ${value}` : `worse by ${value}` };
    }
    const direction = zero ? 'flat' : m[1] === '+' ? 'up' : 'down';
    const good = direction === 'flat' || opts.neutral ? null : (direction === 'up') !== Boolean(opts.betterDown);
    const unit = m[4] === '%' ? '%' : m[4] ? ` ${m[4]}` : '';
    return {
        direction,
        tone: good === null ? 'neutral' : good ? 'good' : 'bad',
        text: `${direction === 'up' ? '+' : direction === 'down' ? '−' : ''}${value}${unit}`,
    };
}

/** Lower is better for these (positions, bounce, cost). */
export function betterDownFor(label: string): boolean {
    return /\b(position|pos\.?|rank|ranking|bounce|exit rate|load time|lcp|cls|inp|ttfb|cost|cpc|errors?)\b/i.test(label);
}

/** Changes in a position column ("+1.6" = the position number rose): drawn as rank moves, like the app. */
export function rankChange(label: string): boolean {
    return /\b(position|pos\.?|rank)\b/i.test(label);
}

/** The app metric a column is about, for its bar colour. */
export function metricForLabel(label: string): MetricKey | null {
    const l = label.toLowerCase();
    if (/click/.test(l)) return 'clicks';
    if (/impression/.test(l)) return 'impressions';
    if (/session/.test(l)) return 'sessions';
    if (/page ?views?|views/.test(l)) return 'pageviews';
    if (/key event|conversion/.test(l)) return 'conversions';
    if (/revenue|sales/.test(l)) return 'revenue';
    if (/user|visitor/.test(l)) return 'users';
    return null;
}

/* ─── tables ─── */

export interface TableShape {
    /** Per column: mostly numbers (right-aligned, tabular). */
    numeric: boolean[];
    /** Per column: signed changes ("vs before", "Change", or every value signed). */
    delta: boolean[];
    /** Per column: lower is better (position, bounce). */
    betterDown: boolean[];
    /** Per column: position changes (new minus old), drawn as rank moves: ▲ green = better (a lower number). */
    rankDelta: boolean[];
    /** Column that gets heat bars (a ranked count), or -1. */
    barCol: number;
    barMax: number;
    barMetric: MetricKey | null;
    /** Rows are dates or periods in the first column: a sparkline of `seriesCol` fits. */
    timeSeries: boolean;
    seriesCol: number;
}

const DATE_RE = /^(?:\d{4}-\d{2}(?:-\d{2})?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2})?(?:,?\s+\d{4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?|(?:week|wk)\s*(?:of\s+)?.+|q[1-4](?:\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/i;
const METRIC_WORD = /click|impression|user|visitor|session|view|position|rank|ctr|bounce|revenue|event|conversion|engagement|duration|time/i;
const CHANGE_HEADER = /\b(vs\.?|versus|change|chg|delta|diff|growth|trend)\b|Δ|%\s*[+±]|[+±]\s*%/i;

export function analyzeTable(header: string[], rows: string[][]): TableShape {
    const cols = header.length;
    const numeric: boolean[] = [];
    const delta: boolean[] = [];
    const betterDown: boolean[] = [];
    const rankDelta: boolean[] = [];
    for (let c = 0; c < cols; c++) {
        const cells = rows.map((r) => (r[c] ?? '').trim()).filter((v) => v && !/^[–—-]$|^n\/?a$/i.test(v));
        const nums = cells.filter((v) => parseNumber(v) !== null);
        numeric[c] = c > 0 && cells.length > 0 && nums.length / cells.length >= 0.7;
        const signed = cells.filter((v) => /^[+\-−]\s*\d/.test(v.trim()));
        delta[c] = numeric[c] && (CHANGE_HEADER.test(header[c]) || (signed.length >= 2 && signed.length / cells.length >= 0.6));
        // A bare "vs before" / "Change" is about the column before it ("Position", "vs before").
        const subject = CHANGE_HEADER.test(header[c]) && !METRIC_WORD.test(header[c]) && c > 0 ? `${header[c - 1]} ${header[c]}` : header[c];
        betterDown[c] = betterDownFor(subject);
        rankDelta[c] = rankChange(subject) && !cells.some((v) => /%/.test(v));
    }

    const timeSeries = rows.length >= 4 && rows.filter((r) => DATE_RE.test((r[0] ?? '').trim())).length >= rows.length - 1;

    // Bars: the first plain count column (not a change, a rate, a share or a position), preferring one sorted high to low.
    const candidates: number[] = [];
    for (let c = 1; c < cols; c++) {
        if (!numeric[c] || delta[c] || betterDown[c]) continue;
        if (/\b(ctr|rate|share|%|avg|average|per|position|score)\b/i.test(header[c])) continue;
        const vals = rows.map((r) => parseNumber(r[c] ?? ''));
        if (vals.some((v) => v !== null && v < 0)) continue;
        if (rows.some((r) => /%/.test(r[c] ?? ''))) continue;
        candidates.push(c);
    }
    const sortedDesc = (c: number) => {
        const v = rows.map((r) => parseNumber(r[c] ?? '')).filter((x): x is number => x !== null);
        return v.length >= 3 && v.every((x, i) => i === 0 || x <= v[i - 1]);
    };
    let barCol = -1;
    if (!timeSeries && rows.length >= 3) barCol = candidates.find(sortedDesc) ?? candidates[0] ?? -1;
    const barMax = barCol >= 0 ? Math.max(0, ...rows.map((r) => parseNumber(r[barCol] ?? '') ?? 0)) : 0;
    if (barMax <= 0) barCol = -1;
    const seriesCol = timeSeries ? candidates[0] ?? numeric.findIndex((n, c) => n && !delta[c]) : -1;

    return {
        numeric, delta, betterDown, rankDelta,
        barCol, barMax, barMetric: barCol >= 0 ? metricForLabel(header[barCol]) : null,
        timeSeries: timeSeries && seriesCol > 0, seriesCol,
    };
}
