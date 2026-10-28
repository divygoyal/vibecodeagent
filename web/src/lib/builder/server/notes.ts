/**
 * Chart notes for builder time series (round 7). The notes are the site pages' notes (admin
 * /api/annotations, the same rows ChartExtras reads and writes): this only finds which scope a
 * widget source maps to and reads the owner's notes for it. Server only.
 */
import { annotationMode, noteScopeOf, notesForScopes, notesSourceOf, showsNotes, type StoredNote } from '../chartMarks';
import { publicControlsFromQuery } from '../publicDoc';
import type { ControlState, DashboardDocV2, SourceRef, TimeSeriesWidget } from '../types';
import { sitePicksFromKeys } from './access';
import { pageWidgets } from './service';
import { resolvePortfolio, resolveSiteRef, type SiteDirectory } from './sources';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Note scopes for a source. A site: its scope (null when the site has no Google property we can
 * name, then only global notes apply). A portfolio: the scopes of its sites.
 */
export function noteScopesFor(src: Exclude<SourceRef, { type: 'default' }>, dir: SiteDirectory | null): { scope: string | null; scopes: string[] } {
    if (src.type === 'portfolio') {
        const sites = dir ? resolvePortfolio(src, dir) : [];
        return { scope: null, scopes: [...new Set(sites.map((s) => noteScopeOf(s)).filter((s): s is string => Boolean(s)))] };
    }
    const site = dir ? resolveSiteRef(src, dir) : null;
    const scope = noteScopeOf(site ?? { ga4: src.ga4 ? (src.ga4.startsWith('properties/') ? src.ga4 : `properties/${src.ga4.replace(/\D/g, '')}`) : null, gsc: src.gsc });
    return { scope, scopes: scope ? [scope] : [] };
}

/** The owner's notes between two days (inclusive) for a site scope, or for several scopes. */
export async function ownerNotes(userIdentifier: string, scopes: string[], range: { start: string; end: string }): Promise<StoredNote[]> {
    const params = new URLSearchParams({ user_identifier: userIdentifier, start_date: range.start, end_date: range.end });
    // One scope: admin returns that scope plus global notes. Several (portfolio): read all, keep ours.
    if (scopes.length === 1) params.set('property_id', scopes[0]);
    const res = await fetch(`${ADMIN_API_URL}/api/annotations?${params.toString()}`, {
        headers: { 'X-API-Key': ADMIN_API_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`annotations ${res.status}`);
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    const notes = rows.filter((r): r is StoredNote => Boolean(r) && typeof r === 'object' && typeof (r as StoredNote).date === 'string' && typeof (r as StoredNote).title === 'string');
    return scopes.length === 1 ? notes : notesForScopes(notes, scopes);
}

/**
 * Share links: the time series of one page whose notes a viewer may read, each with the source it
 * shows. Nothing unless the owner switched "Show my chart notes" on. The viewer state is read exactly
 * like /api/dashboards/public/[token]/query reads it: only the controls the owner allows, and a site
 * pick (s.<controlId>) only as an opaque key of one of the control's allowed sites on this share,
 * when viewers may switch (sitePicksFromKeys); anything else falls back to the control's default or
 * the dashboard's default site, so notes always belong to the site whose data the chart plots.
 */
export function publicNoteTargets(
    doc: DashboardDocV2,
    share: { viewerControls: { date: boolean; compare: boolean; filters: boolean } },
    q: URLSearchParams,
    dir: Pick<SiteDirectory, 'sites'> | null,
    shareToken: string,
): { controls: ControlState; targets: Array<{ widget: TimeSeriesWidget; src: Exclude<SourceRef, { type: 'default' }> }> } {
    const controls = publicControlsFromQuery(q, doc, share, (picks) => sitePicksFromKeys(doc.controls, picks, dir, shareToken));
    if (!doc.settings.shareNotes) return { controls, targets: [] };
    const targets = pageWidgets(doc, controls.pageId)
        .filter((x): x is { widget: TimeSeriesWidget; pageId: string } => x.widget.type === 'timeseries' && showsNotes(annotationMode(x.widget.config.annotations)))
        .flatMap(({ widget, pageId }) => {
            const src = notesSourceOf(widget, doc.defaultSource, { controlDefs: doc.controls, controls, pageId });
            return src.type === 'default' ? [] : [{ widget, src }];
        });
    return { controls, targets };
}
