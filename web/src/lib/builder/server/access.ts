/**
 * Access helpers for the dashboard routes: the signed-in user, the owner's Google token,
 * unlock keys for password-protected shares, and small in-memory rate limits.
 * Server only.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { accessForAsset, listLinkedGoogleConnections } from '@/lib/googleAccounts';
import { clientKey as requestClientKey } from '@/lib/clientIp';
import { b64urlDecode, b64urlEncode, drillChain, MAX_DRILL_VALUE, type DrillResolver } from '../drill';
import type { ControlDef, ControlState, DashboardDocV2, DashboardQueryResponse, SiteControl } from '../types';
import type { ResolvedSite, SiteDirectory } from './sources';

export async function sessionUserId(): Promise<string | null> {
    const session = (await getServerSession(authOptions)) as { user?: { id?: string } } | null;
    const id = session?.user?.id;
    return typeof id === 'string' && id ? id : null;
}

/** The user's Google access token (stored refresh token), or null when not connected. */
export async function googleTokenFor(userIdentifier: string): Promise<string | null> {
    const tokens = await fetchGoogleTokensFromDb(userIdentifier);
    if (!tokens) return null;
    try {
        return await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch {
        return null;
    }
}

/**
 * Token for one asset of the user when extra Google accounts are linked: the account that lists it.
 * Null without linked accounts (the engine then uses googleTokenFor's token for everything).
 */
export async function googleTokenForAsset(userIdentifier: string, asset: { kind: 'ga4' | 'gsc'; id: string }): Promise<string | null> {
    if ((await listLinkedGoogleConnections(userIdentifier)).length === 0) return null;
    const access = await accessForAsset(userIdentifier, asset, async () => (await fetchGoogleTokensFromDb(userIdentifier)) ?? {});
    return access.ok ? access.token : null;
}

// ── unlock keys (24 h, HMAC with the app secret) ─────────────────────────

const UNLOCK_TTL_MS = 24 * 3600_000;

function secret(): string {
    return process.env.NEXTAUTH_SECRET || process.env.SHARE_WATERMARK_SECRET || 'dev-only-dashboard-unlock-secret';
}

function sign(token: string, exp: number): string {
    return createHmac('sha256', secret()).update(`dash-unlock|${token}|${exp}`).digest('base64url');
}

export function makeUnlockKey(token: string, now = Date.now()): { key: string; expiresAt: number } {
    const exp = now + UNLOCK_TTL_MS;
    return { key: `${exp}.${sign(token, exp)}`, expiresAt: exp };
}

export function checkUnlockKey(token: string, key: string | null | undefined, now = Date.now()): boolean {
    if (!key) return false;
    const [expRaw, sig] = key.split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < now || !sig) return false;
    const want = Buffer.from(sign(token, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
}

export function unlockCookieName(token: string): string {
    return `tc_dash_${token.slice(0, 12)}`;
}

/** Unlock key from `Authorization: Bearer <key>` (embeds) or the HttpOnly cookie (top-level pages). */
export function unlockKeyFrom(req: Request, token: string): string | null {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    const cookie = req.headers.get('cookie') ?? '';
    const name = unlockCookieName(token);
    for (const part of cookie.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

// ── rate limits ──────────────────────────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
        if (buckets.size > 20_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    b.count++;
    return b.count > limit;
}

/** Rate-limit key of the caller (lib/clientIp.ts). */
export function clientIp(req: Request): string {
    return requestClientKey(req.headers);
}

/** Hash of token + IP, sent to the admin for its own password rate limit (no raw IPs stored). */
export function clientKey(req: Request, token: string): string {
    return createHash('sha256').update(`${token}|${clientIp(req)}`).digest('hex').slice(0, 24);
}

// ── site switcher (round 7) ──────────────────────────────────────────────
//
// Every request that carries a site pick is checked here against the dashboard OWNER's own site directory
// (their Google inventory), never against anything the client sends: a pick outside the control's allowed
// list, or a site the owner cannot read (another user's site), is dropped and the widget falls back to the
// dashboard's default site. Public share links and embeds never see site ids: each allowed site gets an
// opaque key (HMAC of the share token and the site id) that only this server can map back.

/** Sites a site control offers, in the owner's directory order ('all' = every site the owner can read). */
export function allowedSites(control: SiteControl, dir: Pick<SiteDirectory, 'sites'>): ResolvedSite[] {
    if (control.options === 'all') return dir.sites;
    const want = new Set(Array.isArray(control.options) ? control.options : []);
    return dir.sites.filter((s) => want.has(s.siteId));
}

/** Opaque key of one site option on one share link (stable while the token and site exist). */
export function siteOptionKey(shareToken: string, controlId: string, siteId: string): string {
    return createHmac('sha256', secret()).update(`dash-site|${shareToken}|${controlId}|${siteId}`).digest('base64url').slice(0, 12);
}

/** Public options of a site control: opaque key + label. Empty unless the owner lets share viewers switch. */
export function publicSiteChoices(control: SiteControl, dir: Pick<SiteDirectory, 'sites'> | null, shareToken: string): Array<{ key: string; label: string; siteId: string }> {
    if (!control.viewerCanChange || !dir) return [];
    return allowedSites(control, dir).slice(0, 500).map((s) => ({ key: siteOptionKey(shareToken, control.id, s.siteId), label: s.label, siteId: s.siteId }));
}

/**
 * Owner requests (saved and inline editor queries): keep only picks of existing site controls that are in
 * the control's list and in the owner's own directory. Returns the cleaned state (no `site` when empty).
 */
export function checkSitePicks(controlDefs: ControlDef[], controls: ControlState, dir: Pick<SiteDirectory, 'sites' | 'byId'> | null): ControlState {
    if (!controls.site || !Object.keys(controls.site).length) return controls;
    const site: Record<string, string> = {};
    for (const c of controlDefs) {
        if (c.type !== 'site') continue;
        const pick = controls.site[c.id];
        if (typeof pick !== 'string' || !pick || !dir?.byId.has(pick)) continue;
        if (allowedSites(c, dir).some((s) => s.siteId === pick)) site[c.id] = pick;
    }
    const { site: _drop, ...rest } = controls;
    void _drop;
    return Object.keys(site).length ? { ...rest, site } : rest;
}

/**
 * Public requests: `picks` holds opaque keys from the URL (s.<controlId>). Each key maps to a site id only
 * when the control lets viewers switch and the key belongs to one of its allowed sites on this share.
 */
export function sitePicksFromKeys(controlDefs: ControlDef[], picks: Record<string, string>, dir: Pick<SiteDirectory, 'sites'> | null, shareToken: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of controlDefs) {
        if (c.type !== 'site' || !c.viewerCanChange) continue;
        const key = picks[c.id];
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{12}$/.test(key)) continue;
        const hit = publicSiteChoices(c, dir, shareToken).find((o) => o.key === key);
        if (hit) out[c.id] = hit.siteId;
    }
    return out;
}

// ── drill down on public links (round 8) ─────────────────────────────────
//
// A drill value reaches the server as text the viewer's browser sends, so a public link never takes it raw:
// the server issues a signed key with every drillable row (HMAC of the share token, the widget, the level, the
// values above it and the value itself) and accepts only keys it can verify. A forged or edited key is
// ignored, a value the viewer was not shown cannot be asked for, and one share link's keys mean nothing on
// another. The dimension of every level is never in the key or the URL: it comes from the widget's own list.

const KEY_MAC_LEN = 16;
const MAX_DRILL_KEY_ROWS = 500;

function drillMac(shareToken: string, widgetId: string, level: number, parents: string[], value: string): string {
    return createHmac('sha256', secret()).update(`dash-drill|${shareToken}|${widgetId}|${level}|${parents.join('\u0001')}|${value}`).digest('base64url').slice(0, KEY_MAC_LEN);
}

/** The signed key of one drill value: base64url(value) + '.' + MAC. */
export function drillKey(shareToken: string, widgetId: string, level: number, parents: string[], value: string): string {
    return `${b64urlEncode(value)}.${drillMac(shareToken, widgetId, level, parents, value)}`;
}

/** The value inside a key for this share, widget, level and parents, or null when the key is not ours. */
export function drillValueFromKey(shareToken: string, widgetId: string, level: number, parents: string[], key: string): string | null {
    const i = key.lastIndexOf('.');
    if (i <= 0 || key.length > 300) return null;
    const value = b64urlDecode(key.slice(0, i));
    if (!value || value.length > MAX_DRILL_VALUE || value === '(other)') return null;
    const want = Buffer.from(drillMac(shareToken, widgetId, level, parents, value));
    const got = Buffer.from(key.slice(i + 1));
    return want.length === got.length && timingSafeEqual(want, got) ? value : null;
}

/** The resolver a public request passes to publicControlsFromQuery (verifies every key of d.<widgetId>). */
export function drillResolver(shareToken: string): DrillResolver {
    return (widgetId, level, raw, parents) => drillValueFromKey(shareToken, widgetId, level, parents, raw);
}

/**
 * Public responses: add the signed keys of the values a drillable widget shows right now, as
 * `parts.rows.drillKeys` (value -> key), so the viewer can drill without ever sending a raw value.
 * `controls.drill` holds the verified values of this request.
 */
export function attachDrillKeys(res: DashboardQueryResponse, doc: Pick<DashboardDocV2, 'widgets'>, controls: ControlState, shareToken: string): DashboardQueryResponse {
    for (const [id, result] of Object.entries(res.results)) {
        const original = doc.widgets[id];
        const chain = original ? drillChain(original) : null;
        if (!original || !chain) continue;
        const path = controls.drill?.[id] ?? [];
        const depth = Math.min(path.length, chain.length - 1);
        if (depth >= chain.length - 1) continue;
        const ok = result.status === 'ok' ? result : result.stale;
        const frame = ok?.parts.rows;
        if (!frame) continue;
        const dim = chain[depth];
        const col = `d:${dim}`;
        const keys: Record<string, string> = {};
        for (const row of frame.rows.slice(0, MAX_DRILL_KEY_ROWS)) {
            const v = row[col];
            if (typeof v !== 'string' || !v || v.length > MAX_DRILL_VALUE || v === '(other)' || row.__other) continue;
            keys[v] = drillKey(shareToken, id, depth, path.slice(0, depth), v);
        }
        if (Object.keys(keys).length) frame.drillKeys = keys;
    }
    return res;
}
