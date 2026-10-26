import { NextRequest, NextResponse } from 'next/server';
import { adminStore } from '@/lib/portfolio/adminStore';
import { googleAccessFor, sessionIdentifier } from '@/lib/portfolio/auth';
import { NO_PAIR, type StoreAsset } from '@/lib/portfolio/snapshot';
import { repairPairs } from '@/lib/portfolio/sync';
import type { SitePatch } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

function decodeKey(raw: string): string {
    try {
        return raw.includes('%') ? decodeURIComponent(raw) : raw;
    } catch {
        return raw;
    }
}

/** The stored assets behind a site key ("gsc:<siteUrl>" or "ga4:properties/<id>"). */
function membersOf(assets: StoreAsset[], key: string): { gsc?: StoreAsset; ga4?: StoreAsset } | null {
    const find = (kind: 'ga4' | 'gsc', id: string | null | undefined) => (id ? assets.find((a) => a.asset_kind === kind && a.asset_id === id) : undefined);
    if (key.startsWith('gsc:')) {
        const gsc = find('gsc', key.slice(4));
        if (!gsc) return null;
        const ga4 = find('ga4', gsc.paired_with);
        return { gsc, ga4: ga4 && ga4.paired_with === gsc.asset_id ? ga4 : undefined };
    }
    if (key.startsWith('ga4:')) {
        const ga4 = find('ga4', key.slice(4));
        if (!ga4) return null;
        const gsc = find('gsc', ga4.paired_with);
        return { ga4, gsc: gsc && gsc.paired_with === ga4.asset_id ? gsc : undefined };
    }
    return null;
}

function parsePatch(body: unknown): SitePatch | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const out: SitePatch = {};
    if (typeof b.starred === 'boolean') out.starred = b.starred;
    if (typeof b.hidden === 'boolean') out.hidden = b.hidden;
    if (b.ga4Property === null || typeof b.ga4Property === 'string') out.ga4Property = b.ga4Property as string | null;
    if (b.gscSite === null || typeof b.gscSite === 'string') out.gscSite = b.gscSite as string | null;
    if (b.resetPairing === true) out.resetPairing = true;
    return Object.keys(out).length ? out : null;
}

/**
 * PATCH /api/portfolio/assets/:siteKey  { starred?, hidden?, ga4Property?, gscSite?, resetPairing? }
 * Star or hide a site (both of its assets), or override its GA4 <-> GSC pairing.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const key = decodeKey((await params).id);
    const patch = parsePatch(await req.json().catch(() => null));
    if (!patch) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

    try {
        const assets = await adminStore.getAssets(identifier);
        const site = membersOf(assets, key);
        if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        const members = [site.gsc, site.ga4].filter((a): a is StoreAsset => Boolean(a));

        if (patch.starred !== undefined || patch.hidden !== undefined) {
            for (const a of members) {
                await adminStore.patchAsset(identifier, { kind: a.asset_kind, asset_id: a.asset_id, starred: patch.starred, hidden: patch.hidden });
            }
        }

        const pairing = patch.resetPairing || patch.ga4Property !== undefined || patch.gscSite !== undefined;
        if (pairing) {
            const ga4Overrides: { id: string; value?: string; clear?: boolean }[] = [];
            if (patch.resetPairing) {
                if (site.ga4) ga4Overrides.push({ id: site.ga4.asset_id, clear: true });
                for (const a of assets) {
                    if (a.asset_kind === 'ga4' && site.gsc && a.pairing_override === site.gsc.asset_id) ga4Overrides.push({ id: a.asset_id, clear: true });
                }
            } else if (patch.ga4Property !== undefined) {
                if (!site.gsc) return NextResponse.json({ error: 'This site has no Search Console property' }, { status: 400 });
                if (patch.ga4Property === null) {
                    if (site.ga4) ga4Overrides.push({ id: site.ga4.asset_id, value: NO_PAIR });
                } else {
                    const target = assets.find((a) => a.asset_kind === 'ga4' && a.asset_id === patch.ga4Property && !a.missing);
                    if (!target) return NextResponse.json({ error: 'Unknown GA4 property' }, { status: 400 });
                    for (const a of assets) {
                        if (a.asset_kind === 'ga4' && a.asset_id !== target.asset_id && a.pairing_override === site.gsc.asset_id) ga4Overrides.push({ id: a.asset_id, clear: true });
                    }
                    ga4Overrides.push({ id: target.asset_id, value: site.gsc.asset_id });
                }
            } else if (patch.gscSite !== undefined) {
                if (!site.ga4) return NextResponse.json({ error: 'This site has no GA4 property' }, { status: 400 });
                if (patch.gscSite === null) {
                    ga4Overrides.push({ id: site.ga4.asset_id, value: NO_PAIR });
                } else {
                    const target = assets.find((a) => a.asset_kind === 'gsc' && a.asset_id === patch.gscSite && !a.missing);
                    if (!target) return NextResponse.json({ error: 'Unknown Search Console site' }, { status: 400 });
                    ga4Overrides.push({ id: site.ga4.asset_id, value: target.asset_id });
                }
            }
            for (const o of ga4Overrides) {
                await adminStore.patchAsset(identifier, o.clear
                    ? { kind: 'ga4', asset_id: o.id, clear_override: true }
                    : { kind: 'ga4', asset_id: o.id, pairing_override: o.value });
            }
            const access = await googleAccessFor(identifier, req);
            if (!access.ok) return NextResponse.json({ error: 'Google is not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
            await repairPairs(identifier, access.token);
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[portfolio] patch failed:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Could not save the change' }, { status: 502 });
    }
}
