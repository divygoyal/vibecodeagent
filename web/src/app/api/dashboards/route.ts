import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError, directoryFor } from '@/lib/builder/server/service';
import { createDashboard, createDashboardV1, listDashboards, propertyIdFor, StoreError, toRecord } from '@/lib/builder/server/store';
import { buildFromTemplate, templateMeta } from '@/lib/builder/templates';
import { validateDoc } from '@/lib/builder/schema';
import type { DashboardDocV2 } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

/** Compact layout preview for list thumbnails (first page, lg). */
function preview(doc: DashboardDocV2) {
    const page = doc.pages.find((p) => !p.hidden) ?? doc.pages[0];
    return (page?.layouts.lg ?? []).slice(0, 40).map((l) => {
        const w = doc.widgets[l.i];
        return { x: l.x, y: l.y, w: l.w, h: l.h, type: w?.type ?? 'text', metric: metricOf(w) };
    });
}

function metricOf(w: DashboardDocV2['widgets'][string] | undefined): string | undefined {
    if (!w) return undefined;
    switch (w.type) {
        case 'scorecard': return w.config.metric.id;
        case 'kpi-strip': return w.config.metrics[0]?.id;
        case 'timeseries': return w.config.series[0]?.metric.id;
        case 'bar': return w.config.metrics[0]?.id;
        case 'pie': return w.config.metric.id;
        case 'geo': return w.config.metric.id;
        case 'table': return w.config.columns.find((c) => c.kind === 'metric')?.ref;
        default: return undefined;
    }
}

/** GET /api/dashboards: the user's dashboards (v1 rows migrated in memory) with list previews. */
export async function GET() {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    try {
        const rows = await listDashboards(userId);
        const dashboards = rows.map((row) => {
            const rec = toRecord(row);
            const src = rec.doc.defaultSource;
            return {
                id: rec.id,
                name: rec.doc.name,
                description: rec.doc.description ?? '',
                schemaVersion: rec.schemaVersion,
                rev: rec.rev,
                site: src.type === 'site' ? src.siteId : 'All sites',
                widgetCount: Object.keys(rec.doc.widgets).length,
                pageCount: rec.doc.pages.length,
                share: { enabled: rec.share.enabled, hasPassword: rec.share.hasPassword, embed: rec.share.embed.enabled, token: rec.share.token },
                isTemplate: rec.isTemplate,
                views: rec.views,
                updatedAt: rec.updatedAt,
                createdAt: rec.createdAt,
                preview: preview(rec.doc),
                theme: rec.doc.theme.mode,
                // Round 2: the dashboard's look, so list thumbnails show its theme (absent = today's look).
                ...(rec.doc.theme.id ? { look: { id: rec.doc.theme.id, density: rec.doc.theme.density, card: rec.doc.theme.card, pattern: rec.doc.theme.pattern, font: rec.doc.theme.font, palette: rec.doc.theme.palette, brand: rec.doc.theme.brand?.color ? { color: rec.doc.theme.brand.color } : undefined } } : {}),
            };
        });
        return NextResponse.json({ dashboards }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[dashboards] list failed', err);
        return NextResponse.json({ dashboards: [], error: 'Could not load dashboards' }, { status: 502 });
    }
}

/**
 * POST /api/dashboards: create.
 * Body: { name, templateId?, siteId?, portfolio?, themeId?, doc? } (v2) or the v1 shape
 * { name, propertyId, siteUrl?, widgets, gridLayouts, theme } (migrated on the way in).
 */
export async function POST(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return jsonError(400, 'Invalid JSON');
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : 'Untitled dashboard';

    let doc: DashboardDocV2;
    let isTemplate = false;
    if (body.doc) {
        const v = validateDoc({ ...(body.doc as object), name });
        if (!v.ok) return jsonError(422, v.error);
        doc = v.value;
        isTemplate = body.isTemplate === true;
    } else if (Array.isArray(body.widgets) && typeof body.propertyId === 'string') {
        // v1 client: keep the row v1 (migrated in memory on read, saved as v2 on the first edit).
        try {
            const row = await createDashboardV1(userId, {
                name, description: typeof body.description === 'string' ? body.description : '', propertyId: body.propertyId,
                siteUrl: typeof body.siteUrl === 'string' ? body.siteUrl : '', widgets: body.widgets, gridLayouts: body.gridLayouts, theme: body.theme,
            });
            return NextResponse.json({ dashboard: toRecord(row) });
        } catch (err) {
            console.error('[dashboards] create v1 failed', err);
            return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to create dashboard');
        }
    } else {
        const templateId = typeof body.templateId === 'string' && templateMeta(body.templateId) ? body.templateId : 'blank';
        const tm = templateMeta(templateId)!;
        let defaultSource: DashboardDocV2['defaultSource'];
        if (body.portfolio === true || tm.portfolio) {
            defaultSource = { type: 'portfolio', include: 'all' };
        } else {
            const dir = await directoryFor(userId);
            const wanted = typeof body.siteId === 'string' ? body.siteId : undefined;
            const site = (wanted && dir?.byId.get(wanted)) || dir?.sites.find((s) => s.ga4 && s.gsc) || dir?.sites[0];
            if (!site) return jsonError(409, 'Connect Google first: no sites found.', { code: 'NOT_CONNECTED' });
            // Pin the assets so the dashboard keeps reading the same property and site.
            defaultSource = { type: 'site', siteId: site.siteId, ga4: site.ga4, gsc: site.gsc };
        }
        doc = buildFromTemplate(templateId, { name, defaultSource, themeId: typeof body.themeId === 'string' ? body.themeId : undefined });
    }
    try {
        const ids = propertyIdFor(doc);
        const row = await createDashboard(userId, doc, { ...ids, isTemplate });
        return NextResponse.json({ dashboard: toRecord(row) });
    } catch (err) {
        console.error('[dashboards] create failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to create dashboard');
    }
}
