/**
 * Loads a dashboard and its numbers for the scheduled email (round 9). Server only: reads the saved
 * dashboard as its owner, evaluates the chosen pages with the normal query engine (same cache, same
 * Google limits as opening the dashboard) and hands the results to the pure model builder.
 */
import { defaultControlState } from '../publicDoc';
import { evaluateDoc, ownerDeps } from '../server/service';
import { getDashboard, toRecord } from '../server/store';
import type { ControlState, DashboardQueryResponse, DateRangeSpec, PageDef } from '../types';
import { buildDigestModel } from './digestModel';
import { MAX_PAGES, type EmailScheduleConfig } from './schedule';
import type { DigestModel, ScheduleRow } from './types';

export function rangeSpecFor(choice: EmailScheduleConfig['range']): DateRangeSpec | null {
    return choice === '7d' ? { kind: 'preset', id: '7d' } : choice === '28d' ? { kind: 'preset', id: '28d' } : null;
}

/** The pages the schedule asks for: visible pages (all, or the chosen ones), at most MAX_PAGES. */
export function pagesFor(pages: PageDef[], choice: EmailScheduleConfig['pages']): PageDef[] {
    const visible = pages.filter((p) => !p.hidden);
    const picked = choice === 'all' ? visible : visible.filter((p) => choice.includes(p.id));
    return (picked.length ? picked : visible.slice(0, 1)).slice(0, MAX_PAGES);
}

export async function loadDigest(row: ScheduleRow, config: EmailScheduleConfig, opts: { origin: string; secret?: string | null }): Promise<DigestModel> {
    const owner = row.ownerIdentifier;
    if (!owner) throw new Error('The dashboard owner could not be found.');
    const raw = await getDashboard(owner, row.dashboardId);
    if (!raw) throw new Error('The dashboard no longer exists.');
    const rec = toRecord(raw);
    const doc = rec.doc;

    const base = defaultControlState(doc);
    const range = rangeSpecFor(config.range);
    const controls: ControlState = { ...base, date: { range: range ?? base.date.range, compare: base.date.compare } };
    const deps = ownerDeps(owner, 'owner');

    const chosen = pagesFor(doc.pages, config.pages);
    const results: Array<{ page: PageDef; res: DashboardQueryResponse }> = [];
    for (const page of chosen) {
        results.push({ page, res: await evaluateDoc(doc, { ...controls, pageId: page.id }, deps, { pageId: page.id }) });
    }

    const exp = rec.share.expiresAt ? Date.parse(rec.share.expiresAt) : NaN;
    const shared = rec.share.enabled && rec.share.token && !(Number.isFinite(exp) && exp < Date.now());
    const src = doc.defaultSource;
    const model = buildDigestModel({
        doc,
        pages: results,
        config,
        origin: opts.origin,
        shareToken: shared && rec.share.token ? rec.share.token : null,
        dashboardId: row.dashboardId,
        siteLabel: src.type === 'site' ? src.siteId : 'All sites',
        compareMode: controls.date.compare.mode === 'custom' ? 'none' : controls.date.compare.mode,
        secret: opts.secret,
    });
    // Never mail an empty report: if Google could not be read, no widget produced a tile or a chart.
    if (model.pages.length === 0) {
        const first = results.flatMap((r) => Object.values(r.res.results)).find((r) => r.status === 'error');
        throw new Error(first && first.status === 'error' ? `No data to send: ${first.message}` : 'No numbers to send: this dashboard has no scorecards or charts on the chosen pages.');
    }
    return model;
}

/** The app's public origin for links in emails (never the request's Host header). */
export function emailOrigin(env: Record<string, string | undefined> = process.env): string {
    try {
        return new URL(env.NEXTAUTH_URL || '').origin;
    } catch {
        return (env.NEXT_PUBLIC_SITE_URL || 'https://trafficclaw.com').replace(/\/+$/, '');
    }
}
