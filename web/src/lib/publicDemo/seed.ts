/**
 * Server-only: makes sure the shared demo user exists in the admin DB and has something to show.
 *
 *   ensureDemoUser()   awaited by /demo (fast: two admin calls, once per process every 6 h)
 *     - user `tc-public-demo` (plan pro, no email: no welcome mail, no digests), Google connection with
 *       the demo tokens, workspace Acme Analytics with setup done and the welcome popup seen
 *   seedDemoContent()  started in the background after that (idempotent, cheap, no Google, no AI)
 *     - four sample dashboards from the builder templates (only when the user has none)
 *     - three annotations, two goals and a funnel on Acme Analytics (refreshed when they get old)
 *     - the first portfolio sync (demo generator through the shim) and two starred sites
 *
 * Everything goes to the admin API directly (X-API-Key), as the app's own routes do.
 */
import { DEMO_ACCESS_TOKEN, DEMO_REFRESH_TOKEN, DEMO_USER_ID, DEMO_USER_NAME, DEMO_WORKSPACE } from './config';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const RECHECK_MS = 6 * 60 * 60 * 1000;

type Json = Record<string, unknown>;

async function admin(method: string, path: string, body?: unknown, timeoutMs = 10_000): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(`${ADMIN_API_URL}${path}`, {
        method,
        headers: { 'X-API-Key': ADMIN_API_KEY, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

/** Items of a list answer, whatever its wrapper key. */
function listOf(data: unknown): Json[] {
    if (Array.isArray(data)) return data as Json[];
    if (data && typeof data === 'object') {
        for (const v of Object.values(data as Json)) if (Array.isArray(v)) return v as Json[];
    }
    return [];
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const uid = encodeURIComponent(DEMO_USER_ID);

async function upsertUser(): Promise<void> {
    if (!ADMIN_API_KEY) throw new Error('ADMIN_API_KEY is not set');
    let r = await admin('POST', '/api/users', {
        provider: 'google', provider_id: DEMO_USER_ID, access_token: DEMO_ACCESS_TOKEN, refresh_token: DEMO_REFRESH_TOKEN,
        github_username: DEMO_USER_NAME, plan: 'pro',
    });
    if (!r.ok) throw new Error(`admin POST /api/users ${r.status}`);
    r = await admin('PATCH', `/api/users/${uid}`, { plan: 'pro' });
    if (!r.ok) console.warn(`[public-demo] could not set the plan: ${r.status}`);
    r = await admin('PATCH', `/api/users/${uid}/workspace`, {
        selected_property_id: DEMO_WORKSPACE.property, selected_site_url: DEMO_WORKSPACE.site, selected_range: '30d',
        workspace_label: DEMO_WORKSPACE.label, mark_setup_completed: true, mark_welcome_seen: true,
    });
    if (!r.ok) throw new Error(`admin PATCH workspace ${r.status}`);
}

async function seedDashboards(): Promise<void> {
    const { createDashboard, listDashboards, propertyIdFor } = await import('@/lib/builder/server/store');
    const { buildFromTemplate } = await import('@/lib/builder/templates');
    const { directoryFor } = await import('@/lib/builder/server/service');
    if ((await listDashboards(DEMO_USER_ID)).length > 0) return;
    const dir = await directoryFor(DEMO_USER_ID);
    if (!dir) throw new Error('no site directory for the demo user');
    const site = (pred: (s: { siteId: string; ga4?: string; gsc?: string }) => boolean) => dir.sites.find(pred);
    const acme = site((s) => s.siteId === 'acmeanalytics.example') ?? dir.sites.find((s) => s.ga4 && s.gsc);
    const prints = site((s) => s.ga4 === 'properties/412300108');
    const puzzle = site((s) => s.siteId === 'puzzlehub.example');
    const plan: { template: string; name: string; source: 'portfolio' | typeof acme }[] = [
        { template: 'site-overview', name: 'Acme Analytics – weekly overview', source: acme },
        { template: 'portfolio', name: 'All sites at a glance', source: 'portfolio' },
        { template: 'search-performance', name: 'Puzzle Hub – search performance', source: puzzle ?? acme },
        { template: 'key-events-revenue', name: 'Creative Prints – revenue', source: prints ?? acme },
    ];
    // Created oldest first, so the list (newest first) opens with the overview.
    for (const p of plan.reverse()) {
        if (!p.source) continue;
        const defaultSource = p.source === 'portfolio'
            ? { type: 'portfolio' as const, include: 'all' as const }
            : { type: 'site' as const, siteId: p.source.siteId, ga4: p.source.ga4, gsc: p.source.gsc };
        const doc = buildFromTemplate(p.template, { name: p.name, defaultSource });
        await createDashboard(DEMO_USER_ID, doc, propertyIdFor(doc));
    }
}

async function seedAnnotationsGoalsFunnel(): Promise<void> {
    const property = DEMO_WORKSPACE.property;
    const anns = await admin('GET', `/api/annotations?user_identifier=${uid}&property_id=${encodeURIComponent(property)}`);
    const existing = anns.ok ? listOf(anns.data) : [];
    const newest = existing.map((a) => String(a.date ?? '')).sort().pop() ?? '';
    // Keep the markers inside the default 30-day range: recreate them once they are three weeks old.
    if (existing.length === 0 || newest < isoDaysAgo(21)) {
        for (const a of existing) {
            if (a.id !== undefined) await admin('DELETE', `/api/annotations/${encodeURIComponent(String(a.id))}?user_identifier=${uid}`);
        }
        for (const a of [
            { date: isoDaysAgo(26), category: 'product', title: 'Launched the new pricing page' },
            { date: isoDaysAgo(15), category: 'marketing', title: 'Newsletter: retention guide' },
            { date: isoDaysAgo(6), category: 'algorithm_update', title: 'Google core update rolled out' },
        ]) {
            await admin('POST', '/api/annotations', { user_identifier: DEMO_USER_ID, property_id: property, ...a });
        }
    }
    const goals = await admin('GET', `/api/analytics/goals/definitions?user_identifier=${uid}&property_id=${encodeURIComponent(property)}`);
    if (goals.ok && listOf(goals.data).length === 0) {
        for (const g of [
            { name: 'Sign-ups', description: 'sign_up events', goal_type: 'event_count', target: 'sign_up' },
            { name: 'Pricing page visits', description: 'Visits to /pricing', goal_type: 'page_visit', target: '/pricing' },
        ]) {
            await admin('POST', '/api/analytics/goals/definitions', {
                user_identifier: DEMO_USER_ID, property_id: property, name: g.name, description: g.description,
                goal_type: g.goal_type, rule_json: JSON.stringify({ target: g.target }), is_active: true,
            });
        }
    }
    const funnels = await admin('GET', `/api/analytics/funnels/definitions?user_identifier=${uid}&property_id=${encodeURIComponent(property)}`);
    if (funnels.ok && listOf(funnels.data).length === 0) {
        await admin('POST', '/api/analytics/funnels/definitions', {
            user_identifier: DEMO_USER_ID, property_id: property, name: 'Sign-up funnel', description: 'Home to activated',
            steps_json: JSON.stringify(['/', '/pricing', '/signup', '/welcome']), is_active: true,
        });
    }
}

async function seedPortfolio(): Promise<void> {
    const { adminStore } = await import('@/lib/portfolio/adminStore');
    const { startSync } = await import('@/lib/portfolio/sync');
    let assets = await adminStore.getAssets(DEMO_USER_ID).catch(() => []);
    if (assets.length === 0) {
        await startSync({ identifier: DEMO_USER_ID, accessToken: DEMO_ACCESS_TOKEN, reason: 'manual' });
        assets = await adminStore.getAssets(DEMO_USER_ID).catch(() => []);
    }
    const star = [
        ['gsc', 'sc-domain:acmeanalytics.example'], ['ga4', 'properties/412300101'],
        ['gsc', 'https://www.healthinsights.example/'], ['ga4', 'properties/412300102'],
    ] as const;
    for (const [kind, id] of star) {
        const a = assets.find((x) => x.asset_kind === kind && x.asset_id === id);
        if (a && !a.starred) await adminStore.patchAsset(DEMO_USER_ID, { kind, asset_id: id, starred: true }).catch(() => undefined);
    }
}

let seeding: Promise<void> | null = null;

/** Sample content for the demo user. Safe to call often: each part checks first and runs once at a time. */
export function seedDemoContent(): Promise<void> {
    seeding ??= (async () => {
        for (const [label, step] of [['dashboards', seedDashboards], ['annotations', seedAnnotationsGoalsFunnel], ['portfolio', seedPortfolio]] as const) {
            try {
                await step();
            } catch (err) {
                console.warn(`[public-demo] seeding ${label} failed:`, err instanceof Error ? err.message : err);
            }
        }
    })().finally(() => { seeding = null; });
    return seeding;
}

let ready: Promise<void> | null = null;
let readyAt = 0;

/** The demo user exists and is set up. Once per process (re-checked every 6 h); seeding follows in the background. */
export function ensureDemoUser(): Promise<void> {
    if (ready && Date.now() - readyAt < RECHECK_MS) return ready;
    readyAt = Date.now();
    ready = upsertUser()
        .then(() => { void seedDemoContent(); })
        .catch((err) => {
            ready = null;
            throw err;
        });
    return ready;
}
