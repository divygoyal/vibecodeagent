/**
 * Glue between routes and the engine: evaluate a page of a saved dashboard, resolve source
 * labels for public docs, list the user's sites for pickers. Server only.
 */
import { NextResponse } from 'next/server';
import { normalizeHost } from '@/lib/sites/pairing';
import type { ControlState, DashboardDocV2, DashboardQueryResponse, SourceRef, WidgetDef } from '../types';
import { evaluateWidgets, type EngineDeps } from './engine';
import { loadSiteDirectory, sourceLabel, type SiteDirectory } from './sources';
import { googleTokenFor, googleTokenForAsset } from './access';

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Widgets of one page (default: the first visible page), or an explicit subset. */
export function pageWidgets(doc: DashboardDocV2, pageId?: string, widgetIds?: string[]): Array<{ widget: WidgetDef; pageId: string }> {
    const pages = doc.pages.filter((p) => !p.hidden || pageId === p.id);
    if (widgetIds?.length) {
        const want = new Set(widgetIds);
        const out: Array<{ widget: WidgetDef; pageId: string }> = [];
        for (const p of doc.pages) for (const l of p.layouts.lg) if (want.has(l.i) && doc.widgets[l.i]) out.push({ widget: doc.widgets[l.i], pageId: p.id });
        return out;
    }
    const page = pages.find((p) => p.id === pageId) ?? pages[0];
    if (!page) return [];
    return page.layouts.lg.filter((l) => doc.widgets[l.i]).map((l) => ({ widget: doc.widgets[l.i], pageId: page.id }));
}

export function evaluateDoc(
    doc: DashboardDocV2,
    controls: ControlState,
    deps: EngineDeps,
    sel: { pageId?: string; widgetIds?: string[] } = {},
): Promise<DashboardQueryResponse> {
    return evaluateWidgets({
        widgets: pageWidgets(doc, sel.pageId ?? controls.pageId, sel.widgetIds),
        defaultSource: doc.defaultSource,
        controlDefs: doc.controls,
        controls,
        timezone: doc.settings.timezone,
    }, deps);
}

export function ownerDeps(userIdentifier: string, mode: 'owner' | 'public', fresh = false): EngineDeps {
    let tokenPromise: Promise<string | null> | null = null;
    return {
        userId: userIdentifier,
        mode,
        fresh: mode === 'owner' && fresh,
        getToken: () => (tokenPromise ??= googleTokenFor(userIdentifier)),
        getTokenFor: (asset) => googleTokenForAsset(userIdentifier, asset),
    };
}

/** Owner's site directory, or null when Google is not connected. */
export async function directoryFor(userIdentifier: string): Promise<SiteDirectory | null> {
    const token = await googleTokenFor(userIdentifier);
    if (!token) return null;
    try {
        return await loadSiteDirectory(userIdentifier, token);
    } catch {
        return null;
    }
}

/** A label for a source that never reveals ids: host names, GA4 display names or "All sites". */
export function safeLabeler(dir: SiteDirectory | null): (s: SourceRef) => string {
    return (s) => {
        if (s.type === 'site') {
            const known = dir?.byId.get(s.siteId);
            if (known) return known.gsc ? known.label : known.ga4Name ?? 'Analytics property';
            if (s.siteId.startsWith('ga4-')) return 'Analytics property';
            if (s.gsc) return normalizeHost(s.gsc);
            return s.siteId;
        }
        return sourceLabel(s, dir);
    };
}
