/**
 * Web embed widget (round 9): an https page shown in a sandboxed iframe. Isomorphic and dependency free except
 * for the brand host: the editor, the viewer, the schema, the server probe and the tests import from here.
 *
 * There is no allowlist: the owner may embed any https page. What keeps that safe:
 * - https only, no user name or password, no IP addresses or internal host names, never this app's own hosts
 *   (a page on our own origin with allow-scripts + allow-same-origin would escape the sandbox);
 * - the iframe is sandboxed (no top navigation, no modals, no downloads, no pointer lock, no payment, no popups
 *   without the sandbox) with referrerpolicy no-referrer and an empty `allow` list;
 * - our own CSP lists `frame-src https:` only on the dashboard routes that render this widget (next.config.ts);
 * - share links and embeds show it only when the owner set showOnPublic (publicDoc removes it otherwise);
 * - a server probe reads X-Frame-Options and CSP frame-ancestors so a page that refuses to be framed gets a clear
 *   message and an "Open in a new tab" button instead of a blank box (server/embedProbe.ts).
 */
import { SITE_HOST } from '@/lib/brand';
import type { DashboardDocV2, EmbedConfig, EmbedWidget } from './types';

export const EMBED_HEIGHT_MIN = 120;
export const EMBED_HEIGHT_MAX = 2000;
export const EMBED_MAX_PER_DASHBOARD = 10;

/** What the framed page may do. No allow-top-navigation, allow-modals, allow-downloads, allow-presentation. */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
export const EMBED_REFERRER_POLICY = 'no-referrer';

/** Hosts of this app: never embedded (see the header comment). The viewer's own host is added at render time. */
export function selfHosts(extra: Array<string | undefined> = []): string[] {
    return [...new Set([SITE_HOST, 'trafficclaw.com', 'aitraffic.dev', ...extra].filter((h): h is string => Boolean(h)).map((h) => h.toLowerCase()))];
}

const INTERNAL_SUFFIX = /\.(localhost|local|internal|lan|home|home\.arpa|intranet|corp|private)$/i;

const isIpLiteral = (host: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':') || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host);

/** Null when the address is fine to embed, otherwise one plain sentence for the owner. */
export function embedUrlProblem(raw: string, opts: { selfHosts?: string[] } = {}): string | null {
    const v = (raw ?? '').trim();
    if (!v) return 'Add an https address.';
    if (v.length > 2000) return 'That address is too long.';
    let u: URL;
    try {
        u = new URL(v);
    } catch {
        return 'That does not look like a web address.';
    }
    if (u.protocol !== 'https:') return 'Use an https:// address. Pages without https cannot be embedded.';
    if (u.username || u.password) return 'Remove the user name and password from the address.';
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return 'That does not look like a web address.';
    if (isIpLiteral(host)) return 'Use a host name, not an IP address.';
    if (host === 'localhost' || !host.includes('.') || INTERNAL_SUFFIX.test(host)) return 'Only public web pages can be embedded.';
    for (const own of opts.selfHosts ?? selfHosts()) {
        if (host === own || host.endsWith(`.${own}`)) return 'This page cannot embed itself. Use the dashboard itself, or another site.';
    }
    return null;
}

/** The canonical address (what the iframe loads), or null when it is not embeddable. */
export function normalizeEmbedUrl(raw: string, opts: { selfHosts?: string[] } = {}): string | null {
    if (embedUrlProblem(raw, opts)) return null;
    return new URL(raw.trim()).href;
}

export function embedHost(raw: string): string {
    try {
        return new URL(raw.trim()).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

export function defaultEmbedConfig(): EmbedConfig {
    return { url: '', title: 'Embedded page', scroll: true };
}

/** A config as the viewer renders it. */
export function normalizeEmbedConfig(raw: Partial<EmbedConfig> | undefined): EmbedConfig {
    const d = defaultEmbedConfig();
    const h = raw?.heightPx;
    return {
        url: typeof raw?.url === 'string' ? raw.url.trim() : d.url,
        title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 200) : d.title,
        scroll: raw?.scroll === false ? false : true,
        ...(typeof h === 'number' && Number.isFinite(h) ? { heightPx: Math.min(EMBED_HEIGHT_MAX, Math.max(EMBED_HEIGHT_MIN, Math.round(h))) } : {}),
        ...(raw?.showOnPublic ? { showOnPublic: true } : {}),
    };
}

/**
 * The web embed a public request may ask about: a web embed on a page the share shows, that the owner opted in to
 * show on share links.
 */
export function publicEmbedWidget(doc: Pick<DashboardDocV2, 'widgets' | 'pages'>, widgetId: string): EmbedWidget | null {
    const w = doc.widgets[widgetId];
    if (!w || w.type !== 'embed' || !w.config.showOnPublic) return null;
    return doc.pages.some((p) => !p.hidden && p.layouts.lg.some((l) => l.i === widgetId)) ? w : null;
}

// ── Layout: the "height" setting ─────────────────────────────────────────

/** Grid rows (48 px each, 16 px gap) a card needs to show `px` pixels of page. */
export function rowsForPixels(px: number, chromePx = 0): number {
    return Math.max(3, Math.ceil((px + chromePx + 16) / 48));
}

/**
 * Sets the page height of an embed and resizes its card to fit (every layout of the page it sits on), so the
 * height setting does what it says. Pure: returns a new doc.
 */
export function fitEmbedHeight(doc: DashboardDocV2, widgetId: string, px: number): DashboardDocV2 {
    const w = doc.widgets[widgetId];
    if (!w || w.type !== 'embed') return doc;
    const heightPx = Math.min(EMBED_HEIGHT_MAX, Math.max(EMBED_HEIGHT_MIN, Math.round(px)));
    const chrome = w.showTitle === false ? 0 : 36;
    const h = Math.min(40, rowsForPixels(heightPx, chrome + (w.style?.padding === 'none' || !w.style?.padding ? 0 : 32)));
    const fit = <T extends { i: string; h: number }>(l?: T[]) => l?.map((x) => (x.i === widgetId ? { ...x, h } : x));
    return {
        ...doc,
        widgets: { ...doc.widgets, [widgetId]: { ...w, config: { ...w.config, heightPx } } as EmbedWidget },
        pages: doc.pages.map((p) => (p.layouts.lg.some((l) => l.i === widgetId) ? { ...p, layouts: { lg: fit(p.layouts.lg)!, md: fit(p.layouts.md), sm: p.layouts.sm } } : p)),
    };
}

// ── X-Frame-Options and frame-ancestors ──────────────────────────────────

export interface FrameVerdict {
    blocked: boolean;
    /** Plain text for the viewer ("X-Frame-Options: SAMEORIGIN"). */
    reason?: string;
}

function hostMatches(source: string, host: string): boolean {
    let s = source.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:(\d+|\*)$/, '');
    if (!s) return false;
    if (s.startsWith('*.')) {
        s = s.slice(2);
        return host.endsWith(`.${s}`);
    }
    return host === s;
}

/** Whether one frame-ancestors source list lets a page on any of `appHosts` frame the document. */
function ancestorsAllow(sources: string[], appHosts: string[]): boolean {
    const list = sources.map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return false;
    if (list.includes("'none'")) return false;
    if (list.includes('*') || list.includes('https:')) return true;
    return list.some((s) => appHosts.some((h) => hostMatches(s, h)));
}

/**
 * Reads the two headers that make a browser refuse to show a page in a frame. `headers` are response headers with
 * lower case names (several CSP headers arrive comma separated); `appHosts` are the hosts of the page that will
 * frame it (this app). A page with neither header can be framed.
 */
export function frameVerdict(headers: Record<string, string | undefined>, appHosts: string[]): FrameVerdict {
    const hosts = appHosts.map((h) => h.toLowerCase());
    const xfo = (headers['x-frame-options'] ?? '').toLowerCase();
    if (xfo) {
        const tokens = xfo.split(',').map((t) => t.trim());
        if (tokens.some((t) => t === 'deny' || t === 'sameorigin' || t.startsWith('allow-from'))) {
            return { blocked: true, reason: `X-Frame-Options: ${(headers['x-frame-options'] ?? '').split(',')[0].trim().toUpperCase()}` };
        }
    }
    const csp = headers['content-security-policy'];
    if (csp) {
        for (const policy of csp.split(',')) {
            const directive = policy.split(';').map((d) => d.trim()).find((d) => /^frame-ancestors(\s|$)/i.test(d));
            if (!directive) continue;
            const sources = directive.split(/\s+/).slice(1);
            if (!ancestorsAllow(sources, hosts)) return { blocked: true, reason: `Content-Security-Policy: frame-ancestors ${sources.join(' ') || "'none'"}`.slice(0, 160) };
        }
    }
    return { blocked: false };
}

export type EmbedProbe =
    | { status: 'ok' }
    | { status: 'blocked'; reason: string }
    /** The address does not answer at all (no such host, connection refused, invalid certificate): the browser would show its own error page. */
    | { status: 'unreachable'; reason: string }
    | { status: 'unknown' };

/** How long a framed page may take to load once it is on screen before the card gives up and says so. */
export const EMBED_LOAD_TIMEOUT_MS = 20_000;

/** Why a card shows the "cannot be shown here" panel instead of the page. */
export type EmbedFailure = 'blocked' | 'unreachable' | 'timeout' | 'error';

/** What a viewer can do about it. */
export function embedBlockedMessage(host: string): string {
    return `${host || 'This site'} does not allow other sites to show its pages. Open it in a new tab instead.`;
}

/** One plain sentence per way a framed page can fail (the "cannot be shown here" panel). */
export function embedFailureMessage(host: string, kind: EmbedFailure): string {
    const site = host || 'This site';
    switch (kind) {
        case 'blocked': return embedBlockedMessage(host);
        case 'unreachable': return `${site} could not be reached from here. Check the address, or open it in a new tab.`;
        case 'timeout': return `${site} took too long to load. It may be down or slow. Try again, or open it in a new tab.`;
        default: return `${site} did not load. Try again, or open it in a new tab.`;
    }
}

/** The failure a probe answer means, or null when the page may be tried. */
export function probeFailure(probe: EmbedProbe | undefined): { kind: 'blocked' | 'unreachable'; reason: string } | null {
    if (probe?.status === 'blocked') return { kind: 'blocked', reason: probe.reason };
    if (probe?.status === 'unreachable') return { kind: 'unreachable', reason: probe.reason };
    return null;
}

/**
 * The line every framed page carries, so a page on a share link can't pass as ours. Only the host is shortened (by
 * the view, with an ellipsis); the rest is never cut.
 */
export function embedDisclosure(brand: string): string {
    return `not part of ${brand}`;
}
