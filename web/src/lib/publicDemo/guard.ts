/**
 * Read-only guard for the public demo: what each API route may do for a demo request.
 *
 * Allowlist, not denylist: a route or method that is not listed here is DENIED. Every route under
 * src/app/api must have an entry for each method it exports; tests/publicDemoGuard.test.mjs fails
 * when a new route (or method) appears without a decision, so nobody forgets.
 *
 * Decisions:
 *   allow   the demo user's session is projected and the route runs (reads, builder queries, sync of demo data)
 *   deny    403 { error: DEMO_READONLY_MESSAGE, demo: true } with header x-tc-demo: readonly; the app toasts it
 *   noop    200 with a canned body and nothing done: background writes the UI makes on its own
 *           (provider registration, workspace preference saves) that must not change the shared demo user
 *   public  the request passes through with the visitor's ORIGINAL cookies (public pages and endpoints:
 *           shared dashboards, embeds, the public leaderboard, favicons, webhooks); the demo identity never reaches them
 *
 * Denied on purpose: anything that writes the shared demo user's data, account/billing/plan, Google
 * link/disconnect, MCP / API keys / connectors, leaderboard join and publish, share links, emails,
 * cron, admin and superadmin, and every route that calls a model (Ask, Gemini, Vertex).
 * Pure module: safe for the edge runtime and node tests.
 */

export type DemoDecision = 'allow' | 'deny' | 'noop' | 'public';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type MethodPolicy = Partial<Record<Method | '*', DemoDecision>>;

interface RouteRule {
    /** Route as in src/app/api, e.g. '/api/dashboards/[id]/widget-data'. */
    route: string;
    methods: MethodPolicy;
    /** Body for noop answers (default { ok: true }). */
    noopBody?: Record<string, unknown>;
}

const R = (route: string, methods: MethodPolicy, noopBody?: Record<string, unknown>): RouteRule => ({ route, methods, noopBody });
const READ: MethodPolicy = { GET: 'allow' };
const DENY_ALL: MethodPolicy = { '*': 'deny' };
const PUBLIC_ALL: MethodPolicy = { '*': 'public' };

export const DEMO_API_RULES: RouteRule[] = [
    // ── Our own demo endpoints ──
    R('/api/demo/start', PUBLIC_ALL),
    R('/api/demo/exit', PUBLIC_ALL),
    R('/api/demo/ask', { GET: 'allow' }),

    // ── Auth (middleware answers /api/auth/session itself and handles the rest of [...nextauth]) ──
    R('/api/auth/[...nextauth]', { GET: 'public', POST: 'public' }),
    R('/api/auth/register-provider', { POST: 'noop' }, { synced: true, registered: true, demo: true }),
    R('/api/auth/callback/github-app', DENY_ALL),
    R('/api/auth/github-app/install', DENY_ALL),

    // ── Portfolio, sites, inventory ──
    R('/api/portfolio', READ),
    R('/api/portfolio/pairs', READ),
    R('/api/portfolio/export.csv', READ),
    // Sync only reads the demo generator (no Google, no money) and keeps the shared snapshot fresh.
    R('/api/portfolio/sync', { POST: 'allow' }),
    R('/api/portfolio/assets/[id]', { PATCH: 'deny' }),
    R('/api/sites/directory', READ),
    R('/api/connections', READ),
    R('/api/google/connections', READ),
    R('/api/google/connections/[id]', { DELETE: 'deny' }),
    R('/api/google/link/start', DENY_ALL),
    R('/api/google/link/callback', DENY_ALL),
    R('/api/user/workspace', { GET: 'allow', PATCH: 'noop' }, { ok: true, demo: true }),
    R('/api/credits', READ),
    R('/api/weekly-digests', READ),

    // ── Site pages: traffic, search, pages, actions, audit ──
    R('/api/site/ga4', READ),
    R('/api/site/gsc', READ),
    R('/api/site/actions', READ),
    R('/api/site/actions/state', { GET: 'allow', POST: 'deny' }),
    // GET = cached audit, POST = fresh audit; *.example gets the demo report (no fetch), any other URL is refused
    // for the demo user inside the route (site/audit/route.ts demoRefused).
    R('/api/site/audit', { GET: 'allow', POST: 'allow' }),
    R('/api/site-repo-links', { GET: 'allow', POST: 'deny' }),
    R('/api/analytics', READ),
    R('/api/analytics/events', READ),
    R('/api/analytics/funnels', READ),
    R('/api/analytics/funnels/definitions', { GET: 'allow', POST: 'deny' }),
    R('/api/analytics/funnels/definitions/[id]', { PUT: 'deny', DELETE: 'deny' }),
    R('/api/analytics/goals', READ),
    R('/api/analytics/goals/definitions', { GET: 'allow', POST: 'deny' }),
    R('/api/analytics/goals/definitions/[id]', { PUT: 'deny', DELETE: 'deny' }),
    R('/api/analytics/intelligence', READ),
    R('/api/analytics/journeys', READ),
    R('/api/analytics/overview/live-visitors', READ),
    R('/api/analytics/overview/live', READ),
    R('/api/analytics/overview/stats', READ),
    R('/api/analytics/overview/top-generic-series', READ),
    R('/api/analytics/overview/top-generic', READ),
    R('/api/analytics/overview/top-pages', READ),
    R('/api/analytics/pages', READ),
    R('/api/analytics/performance', READ),
    R('/api/analytics/properties', READ),
    R('/api/analytics/realtime', READ),
    R('/api/analytics/retention', READ),
    R('/api/analytics/sessions', READ),
    R('/api/annotations', { GET: 'allow', POST: 'deny', PUT: 'deny', DELETE: 'deny' }),
    R('/api/seo', READ),
    R('/api/seo/sites', READ),
    R('/api/seo/cannibalization', READ),
    R('/api/seo/keyword-detail', READ),
    R('/api/seo/mobile-gap', READ),
    R('/api/seo/opportunities', READ),
    R('/api/seo/page-detail', READ),
    R('/api/seo/winners-losers', READ),
    // Fetch any URL the caller names (PageSpeed with our key, page HTML); no demo screen uses them. Denied so an
    // anonymous visitor can never make the server fetch arbitrary pages.
    R('/api/seo/psi', DENY_ALL),
    R('/api/seo/schema-audit', DENY_ALL),
    R('/api/insights', READ),
    R('/api/alerts', { GET: 'allow', POST: 'noop' }, { success: true, demo: true }),
    R('/api/audit', { POST: 'deny' }),

    // ── Dashboards (builder) ──
    R('/api/dashboards', { GET: 'allow', POST: 'deny' }),
    R('/api/dashboards/options', READ),
    R('/api/dashboards/sites', READ),
    // The builder's widget queries are POSTs but only read (demo generator).
    R('/api/dashboards/query', { POST: 'allow' }),
    R('/api/dashboards/[id]', { GET: 'allow', PUT: 'deny', DELETE: 'deny' }),
    R('/api/dashboards/[id]/widget-data', READ),
    R('/api/dashboards/notes', READ),
    R('/api/dashboards/[id]/versions', READ),
    R('/api/dashboards/[id]/duplicate', DENY_ALL),
    R('/api/dashboards/[id]/share', DENY_ALL),
    R('/api/dashboards/[id]/share/rotate', DENY_ALL),
    R('/api/dashboards/public/[token]', PUBLIC_ALL),
    R('/api/dashboards/public/[token]/query', PUBLIC_ALL),
    R('/api/dashboards/public/[token]/widget-data', PUBLIC_ALL),
    R('/api/dashboards/public/[token]/notes', PUBLIC_ALL),
    R('/api/dashboards/public/[token]/unlock', PUBLIC_ALL),
    R('/api/dashboards/public/[token]/copy', PUBLIC_ALL),

    // ── Sharing and embeds: owner actions denied, public viewers untouched ──
    R('/api/share', { GET: 'allow', POST: 'deny', PATCH: 'deny', DELETE: 'deny' }),
    R('/api/share/[token]/logo', DENY_ALL),
    R('/api/share/[token]/data', PUBLIC_ALL),
    R('/api/share/[token]/overview/journey', PUBLIC_ALL),
    R('/api/share/[token]/overview/live-visitors', PUBLIC_ALL),
    R('/api/share/[token]/overview/live', PUBLIC_ALL),
    R('/api/share/[token]/overview/map', PUBLIC_ALL),
    R('/api/share/[token]/overview/meta', PUBLIC_ALL),
    R('/api/share/[token]/overview/stats', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-conversions', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-events', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-generic-series', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-generic', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-link-out', PUBLIC_ALL),
    R('/api/share/[token]/overview/top-pages', PUBLIC_ALL),
    R('/api/share/[token]/umami/dashboard', PUBLIC_ALL),
    R('/api/share/[token]/umami/realtime', PUBLIC_ALL),
    R('/api/embed/realtime', PUBLIC_ALL),
    R('/api/embed/tokens', { GET: 'allow', POST: 'deny', DELETE: 'deny' }),

    // ── Leaderboard: the public board stays public; the demo user never joins or publishes ──
    R('/api/leaderboard', PUBLIC_ALL),
    R('/api/leaderboard/[id]', PUBLIC_ALL),
    R('/api/leaderboard/[id]/live', PUBLIC_ALL),
    R('/api/leaderboard/[id]/inquiry', PUBLIC_ALL),
    R('/api/leaderboard/join', { GET: 'allow', POST: 'deny', PUT: 'deny', DELETE: 'deny' }),
    R('/api/leaderboard/me', { GET: 'allow', POST: 'deny' }),
    R('/api/leaderboard/me/sites', READ),
    R('/api/leaderboard/me/inbox', READ),
    R('/api/leaderboard/me/inbox/[source]/[id]', { PATCH: 'deny' }),
    R('/api/leaderboard/me/[entryId]', { PATCH: 'deny', DELETE: 'deny' }),
    R('/api/leaderboard/me/[entryId]/preview', DENY_ALL),
    R('/api/leaderboard/me/[entryId]/recheck', DENY_ALL),
    R('/api/ad-slots', { GET: 'allow', PUT: 'deny' }),
    R('/api/ad-slots/requests', { GET: 'allow', POST: 'deny' }),
    R('/api/ad-slots/requests/[id]', { PATCH: 'deny' }),
    R('/api/sponsor-inventory', PUBLIC_ALL),
    R('/api/badges/[id]', PUBLIC_ALL),

    // ── Connect AI (MCP): reading the page is fine, no keys or grants ──
    R('/api/ai-connections', READ),
    R('/api/ai-connections/activity', READ),
    R('/api/ai-connections/keys', { GET: 'allow', POST: 'deny' }),
    R('/api/ai-connections/keys/[id]', DENY_ALL),
    R('/api/ai-connections/[id]', DENY_ALL),
    R('/api/ai-connections/revoke-all', DENY_ALL),
    R('/api/aitraffic/authorize', DENY_ALL),
    R('/api/aitraffic/exchange', DENY_ALL),
    R('/api/aitraffic/resources', DENY_ALL),

    // ── AI (money): never for the demo; Ask shows canned sample answers from /api/demo/ask ──
    R('/api/ai-chat', DENY_ALL),
    R('/api/ai-chat/interrupt', DENY_ALL),
    R('/api/ai-chat/status', READ),
    R('/api/chat-store', { GET: 'allow', POST: 'deny', PATCH: 'deny', DELETE: 'deny' }),
    R('/api/chart-annotations', DENY_ALL),
    R('/api/audit/synthesize', DENY_ALL),
    R('/api/keyword-research', DENY_ALL),
    R('/api/domain-overview', DENY_ALL),
    R('/api/report/generate', DENY_ALL),
    R('/api/report/user-generate', DENY_ALL),

    // ── GitHub (the demo user has none) ──
    R('/api/github', READ),
    R('/api/github/repos', READ),
    R('/api/github-app/installations', READ),
    R('/api/github-app/repositories', READ),
    R('/api/github-app/disconnect', DENY_ALL),

    // ── Account, billing, support, provisioning ──
    R('/api/subscription/cancel', DENY_ALL),
    R('/api/provision', DENY_ALL),
    R('/api/setup-bot', DENY_ALL),
    R('/api/support/messages', { GET: 'allow', POST: 'deny' }),
    R('/api/support/messages/read', { PATCH: 'noop' }),
    R('/api/support/unread-count', READ),

    // ── Operators only ──
    R('/api/admin', DENY_ALL),
    R('/api/superadmin', DENY_ALL),
    R('/api/superadmin/announce-ad-slots', DENY_ALL),
    R('/api/cron/daily-alerts', DENY_ALL),
    R('/api/cron/leaderboard-refresh', DENY_ALL),
    R('/api/cron/portfolio-sync', DENY_ALL),
    R('/api/cron/weekly-digest', DENY_ALL),

    // ── Public site endpoints (marketing pages, webhooks): untouched ──
    R('/api/contact', PUBLIC_ALL),
    R('/api/client-error', PUBLIC_ALL),
    R('/api/favicon', PUBLIC_ALL),
    R('/api/tools', PUBLIC_ALL),
    R('/api/webhooks/dodo', PUBLIC_ALL),
];

interface CompiledRule extends RouteRule {
    re: RegExp;
    /** Static segments count first (so /api/dashboards/query beats /api/dashboards/[id]). */
    score: number;
}

function compile(rule: RouteRule): CompiledRule {
    const segs = rule.route.split('/').filter(Boolean);
    let score = 0;
    const re = segs.map((s) => {
        if (/^\[\.\.\..+\]$/.test(s)) return '(?:/.+)';
        if (/^\[.+\]$/.test(s)) return '/[^/]+';
        score += 1;
        return `/${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    }).join('');
    return { ...rule, re: new RegExp(`^${re}/?$`), score: score * 10 - (rule.route.includes('[...') ? 1 : 0) };
}

const COMPILED: CompiledRule[] = DEMO_API_RULES.map(compile);

/** The rule for an API path, or null when none matches. */
export function demoApiRule(pathname: string): RouteRule | null {
    let best: CompiledRule | null = null;
    for (const r of COMPILED) {
        if (r.re.test(pathname) && (!best || r.score > best.score)) best = r;
    }
    return best;
}

/** What a demo request to this API path and method may do. Unknown route or method: deny. */
export function demoApiDecision(pathname: string, method: string): { decision: DemoDecision; noopBody?: Record<string, unknown> } {
    const rule = demoApiRule(pathname);
    if (!rule) return { decision: 'deny' };
    const m = method.toUpperCase();
    // HEAD and OPTIONS follow GET (no side effects in Next route handlers).
    const key = (m === 'HEAD' || m === 'OPTIONS' ? 'GET' : m) as Method;
    const decision = rule.methods[key] ?? rule.methods['*'] ?? 'deny';
    return decision === 'noop' ? { decision, noopBody: rule.noopBody ?? { ok: true, demo: true } } : { decision };
}
