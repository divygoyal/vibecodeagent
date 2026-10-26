#!/usr/bin/env node
/**
 * Log a demo user into a dev instance without Google/GitHub OAuth.
 *
 *   node scripts/dev/login.mjs <webPort> [--user demo|demo2|admin] [--no-seed] [--reseed]
 *
 * 1. Upserts the user in the instance's admin DB (Google connection with demo
 *    tokens, plan, workspace with a selected GA4 property + GSC site, setup
 *    completed, welcome popup seen).
 * 2. Mints a NextAuth session JWT with the dev NEXTAUTH_SECRET, shaped like
 *    the token lib/auth.ts produces for a Google sign-in.
 * 3. Seeds sample records through the app's own API (annotations, goals,
 *    funnel, custom dashboard, share link, embed token, leaderboard entry)
 *    once per instance, and records their ids in <instance>/seed.json.
 *    For the demo user it also seeds a populated public leaderboard (15 listings,
 *    see seed-leaderboard.mjs; skip with --no-board).
 * 4. Writes a Playwright storageState to <instance>/state.json
 *    (state-demo2.json / state-admin.json for the other users).
 *
 * Users:
 *   demo   Demo Owner, plan pro, 8 GA4 properties + 10 GSC sites, workspace Acme Analytics
 *   demo2  Second Demo User, plan free, 2 properties + 2 sites, workspace Puzzle Hub
 *   admin  Demo Admin, plan pro, same data as demo; ADMIN_GITHUB_ID (for /admin) and a
 *          superadmin token in sessionStorage (for /superadmin)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const DEV_HOME = process.env.TC_DEV_HOME || '/root/.trafficclaw-dev';

const USERS = {
    demo: {
        sub: '100000000000000000001', name: 'Demo Owner', email: 'demo@trafficclaw.example', account: 'main', plan: 'pro',
        property: 'properties/412300101', site: 'sc-domain:acmeanalytics.example', label: 'Acme Analytics',
    },
    demo2: {
        sub: '100000000000000000002', name: 'Second Demo User', email: 'demo2@trafficclaw.example', account: 'alt', plan: 'free',
        property: 'properties/412300104', site: 'https://puzzlehub.example/', label: 'Puzzle Hub',
    },
    admin: {
        sub: '100000000000000000009', name: 'Demo Admin', email: 'admin@trafficclaw.example', account: 'main', plan: 'pro',
        property: 'properties/412300105', site: 'sc-domain:searchmetrics.example', label: 'Search Metrics', superadmin: true,
    },
};

function usage(msg) {
    if (msg) console.error(`login.mjs: ${msg}`);
    console.error('usage: node scripts/dev/login.mjs <webPort> [--user demo|demo2|admin] [--no-seed] [--reseed] [--no-board]');
    process.exit(2);
}

function parseArgs(argv) {
    const out = { port: null, user: 'demo', seed: true, reseed: false, board: true };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--user') out.user = argv[++i];
        else if (a.startsWith('--user=')) out.user = a.slice(7);
        else if (a === '--no-seed') out.seed = false;
        else if (a === '--reseed') out.reseed = true;
        else if (a === '--no-board') out.board = false;
        else if (/^\d+$/.test(a) && !out.port) out.port = Number(a);
        else usage(`unknown argument ${a}`);
    }
    if (!out.port) usage('missing <webPort>');
    if (!USERS[out.user]) usage(`unknown user ${out.user}`);
    return out;
}

function readEnvFile(file) {
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) env[m[1]] = m[2];
    }
    return env;
}

function findInstance(port) {
    for (const name of fs.existsSync(DEV_HOME) ? fs.readdirSync(DEV_HOME) : []) {
        const f = path.join(DEV_HOME, name, 'instance.env');
        if (!fs.existsSync(f)) continue;
        const env = readEnvFile(f);
        if (Number(env.WEB_PORT) === port) return { dir: path.dirname(f), ...env };
    }
    return null;
}

async function http(method, url, { headers = {}, body, cookie } = {}) {
    const res = await fetch(url, {
        method,
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

const isoDaysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const inst = findInstance(args.port);
    if (!inst) throw new Error(`no dev instance with web port ${args.port} in ${DEV_HOME} (run scripts/dev/up.sh first)`);
    const secrets = readEnvFile(path.join(DEV_HOME, 'dev.env'));
    const user = USERS[args.user];
    const webUrl = `http://localhost:${args.port}`;
    const adminUrl = inst.ADMIN_URL;
    const adminHeaders = { 'X-API-Key': secrets.ADMIN_API_KEY };
    const accessToken = `demo-access:${user.account}`;
    const refreshToken = `demo-refresh:${user.account}`;

    // 1. Admin DB: user + Google connection + workspace.
    let r = await http('POST', `${adminUrl}/api/users`, {
        headers: adminHeaders,
        body: { provider: 'google', provider_id: user.sub, access_token: accessToken, refresh_token: refreshToken, email: user.email, github_username: user.name, plan: user.plan },
    });
    if (!r.ok) throw new Error(`admin POST /api/users failed: ${r.status} ${JSON.stringify(r.data)}`);
    r = await http('PATCH', `${adminUrl}/api/users/${user.sub}`, { headers: adminHeaders, body: { plan: user.plan } });
    if (!r.ok) console.warn(`[login] could not set plan: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    if (user.plan === 'pro') {
        // A full monthly allowance so credit banners do not dominate screenshots.
        const credits = await http('GET', `${adminUrl}/api/users/${user.sub}/credits`, { headers: adminHeaders });
        const current = Number(credits.data?.credits ?? 0);
        if (credits.ok && current < 250) {
            await http('POST', `${adminUrl}/api/users/${user.sub}/credits/add`, { headers: adminHeaders, body: { amount: 300 - current, reason: 'dev-kit' } });
        }
    }
    r = await http('PATCH', `${adminUrl}/api/users/${user.sub}/workspace`, {
        headers: adminHeaders,
        body: { selected_property_id: user.property, selected_site_url: user.site, selected_range: '30d', workspace_label: user.label, mark_setup_completed: true, mark_welcome_seen: true },
    });
    if (!r.ok) throw new Error(`admin PATCH workspace failed: ${r.status} ${JSON.stringify(r.data)}`);

    // 2. NextAuth session JWT (same fields lib/auth.ts sets for a Google sign-in).
    const requireWeb = createRequire(path.join(inst.REPO, 'web', 'package.json'));
    const { encode } = requireWeb('next-auth/jwt');
    const maxAge = 30 * 24 * 60 * 60;
    const token = {
        name: user.name,
        email: user.email,
        picture: null,
        sub: user.sub,
        primaryProvider: 'google',
        primarySub: user.sub,
        primaryName: user.name,
        primaryEmail: user.email,
        primaryImage: null,
        accessToken,
        refreshToken,
        googleAccountId: user.sub,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
        provider: 'google',
        workspaceSetupCompleted: true,
    };
    const jwt = await encode({ token, secret: secrets.NEXTAUTH_SECRET, maxAge });
    const cookieName = 'next-auth.session-token';
    const cookieHeader = `${cookieName}=${jwt}`;

    // Check the session works.
    r = await http('GET', `${webUrl}/api/auth/session`, { cookie: cookieHeader });
    if (!r.ok || r.data?.user?.id !== user.sub) throw new Error(`session check failed: ${r.status} ${JSON.stringify(r.data)}`);

    // 3. Superadmin token (password from dev.env).
    let superadmin = null;
    if (user.superadmin) {
        r = await http('POST', `${webUrl}/api/superadmin`, { cookie: cookieHeader, body: { action: 'auth', password: secrets.SUPERADMIN_PASSWORD } });
        if (r.ok && r.data?.token) superadmin = { token: r.data.token, expiresAt: r.data.expiresAt };
        else console.warn(`[login] superadmin auth failed: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    }

    // 4. Sample records, once per instance and user.
    const seedFile = path.join(inst.dir, 'seed.json');
    const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
    if (args.seed && (args.reseed || !seed[args.user])) {
        seed[args.user] = await seedRecords(webUrl, cookieHeader, user, args.user, { url: adminUrl, headers: adminHeaders });
        fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
    }

    // 4b. A populated public leaderboard (once per instance, after the demo user's own records).
    const boardMarker = path.join(inst.dir, 'leaderboard-seeded');
    if (args.seed && args.board && args.user === 'demo' && (args.reseed || !fs.existsSync(boardMarker))) {
        try {
            const { seedLeaderboard } = await import('./seed-leaderboard.mjs');
            await seedLeaderboard(args.port, { quiet: true });
            fs.writeFileSync(boardMarker, new Date().toISOString());
        } catch (err) {
            console.warn(`[login] leaderboard seed failed: ${err.message}`);
        }
    }

    // 5. Playwright storageState.
    const expires = Math.floor(Date.now() / 1000) + maxAge;
    const cookies = ['localhost', '127.0.0.1'].map(domain => ({ name: cookieName, value: jwt, domain, path: '/', expires, httpOnly: true, secure: false, sameSite: 'Lax' }));
    const local = [
        { name: `tc-last-property:${user.sub}`, value: user.property },
        { name: `tc-last-site:${user.sub}`, value: user.site },
        { name: `tc-last-range:${user.sub}`, value: '30d' },
    ];
    const origins = [`http://localhost:${args.port}`, `http://127.0.0.1:${args.port}`];
    const state = {
        cookies,
        origins: origins.map(origin => ({ origin, localStorage: local })),
        // Not part of Playwright's format: shot.mjs / crawl.mjs copy these into sessionStorage.
        sessionStorage: superadmin
            ? origins.map(origin => ({ origin, items: [{ name: 'sa_token', value: superadmin.token }, { name: 'sa_expires', value: String(superadmin.expiresAt) }] }))
            : [],
        tcDev: { user: args.user, sub: user.sub, email: user.email, webUrl, createdAt: new Date().toISOString() },
    };
    const stateFile = path.join(inst.dir, args.user === 'demo' ? 'state.json' : `state-${args.user}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });

    console.log(JSON.stringify({ ok: true, user: args.user, sub: user.sub, state: stateFile, seed: seed[args.user] ? seedFile : null, superadmin: Boolean(superadmin) }, null, 2));
}

async function seedRecords(webUrl, cookie, user, userKey, admin) {
    const out = {};
    const call = async (label, method, p, body) => {
        const r = await http(method, `${webUrl}${p}`, { cookie, body });
        if (!r.ok) console.warn(`[login] seed ${label} failed: ${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data).slice(0, 160)}`);
        return r.ok ? r.data : null;
    };
    const propertyId = user.property;

    if (userKey === 'demo' || userKey === 'admin') {
        for (const a of [
            { date: isoDaysAgo(41), category: 'product', title: 'Launched new pricing page' },
            { date: isoDaysAgo(19), category: 'marketing', title: 'Newsletter: retention guide' },
            { date: isoDaysAgo(9), category: 'algorithm_update', title: 'Google core update rolled out' },
        ]) {
            await call('annotation', 'POST', '/api/annotations', { ...a, propertyId });
        }
        await call('goal', 'POST', '/api/analytics/goals/definitions', { propertyId, name: 'Sign-ups', description: 'sign_up events', type: 'event_count', target: 'sign_up' });
        await call('goal', 'POST', '/api/analytics/goals/definitions', { propertyId, name: 'Pricing page visits', description: 'Visits to /pricing', type: 'page_visit', target: '/pricing' });
        await call('funnel', 'POST', '/api/analytics/funnels/definitions', { propertyId, name: 'Signup funnel', description: 'Home to activated', steps: ['/', '/pricing', '/signup', '/welcome'] });

        const kpi = (id, title, metric, x) => ({ widget: { id, type: 'kpi', title, dataSource: 'ga4', metric, showComparison: true }, layout: { i: id, x, y: 0, w: 3, h: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 } });
        const parts = [
            kpi('w-seed-1', 'Users', 'totalUsers', 0),
            kpi('w-seed-2', 'Sessions', 'sessions', 3),
            kpi('w-seed-3', 'Page views', 'screenPageViews', 6),
            kpi('w-seed-4', 'Bounce rate', 'bounceRate', 9),
            { widget: { id: 'w-seed-5', type: 'area-chart', title: 'Users over time', dataSource: 'ga4', metric: 'totalUsers', dimension: 'date', chartType: 'area' }, layout: { i: 'w-seed-5', x: 0, y: 2, w: 8, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 8 } },
            { widget: { id: 'w-seed-6', type: 'donut-chart', title: 'Devices', dataSource: 'ga4', metric: 'sessions', dimension: 'deviceCategory' }, layout: { i: 'w-seed-6', x: 8, y: 2, w: 4, h: 4, minW: 3, minH: 3, maxW: 6, maxH: 6 } },
            { widget: { id: 'w-seed-7', type: 'table', title: 'Top pages', dataSource: 'ga4', metric: 'screenPageViews', dimension: 'pagePath' }, layout: { i: 'w-seed-7', x: 0, y: 6, w: 12, h: 4, minW: 4, minH: 3, maxW: 12, maxH: 10 } },
        ];
        const lg = parts.map(p => p.layout);
        const dash = await call('dashboard', 'POST', '/api/dashboards', {
            name: 'Weekly growth review',
            description: 'Seeded by scripts/dev/login.mjs',
            propertyId,
            siteUrl: user.site,
            widgets: parts.map(p => p.widget),
            gridLayouts: { lg, md: lg.map(l => ({ ...l, w: Math.min(l.w, 6), x: 0 })), sm: lg.map(l => ({ ...l, w: 12, x: 0 })) },
        });
        if (dash?.dashboard?.id !== undefined) {
            out.dashboardId = dash.dashboard.id;
            // The web route sends user_identifier in the body but the admin reads it from the
            // query string (pre-existing 422), so create the public token on the admin directly.
            const pub = await http('POST', `${admin.url}/api/custom-dashboards/${dash.dashboard.id}/share?user_identifier=${user.sub}`, { headers: admin.headers });
            if (!pub.ok) console.warn(`[login] seed dashboard share failed: ${pub.status} ${JSON.stringify(pub.data).slice(0, 160)}`);
            const pubToken = pub.data?.shareToken || pub.data?.share_token || pub.data?.token;
            if (pubToken) out.dashboardPublicToken = pubToken;
        }

        const share = await call('share', 'POST', '/api/share', { propertyId, siteUrl: user.site, config: {} });
        const shareToken = share?.token || share?.share?.token;
        if (shareToken) out.shareToken = shareToken;

        const embed = await call('embed token', 'POST', '/api/embed/tokens', { propertyId, label: 'Homepage live widget' });
        const embedToken = embed?.token || embed?.embed_token?.token || embed?.data?.token;
        if (embedToken) out.embedToken = embedToken;
    }

    const site = user.site.replace(/^sc-domain:/, 'https://').replace(/\/$/, '');
    const lb = await call('leaderboard', 'POST', '/api/leaderboard/join', {
        startup_name: user.label,
        description: `${user.label} is a demo site generated for local development.`,
        website_url: site,
        category: userKey === 'demo2' ? 'Games' : 'SaaS',
        mrr_range: '$1k-$5k',
        looking_for: ['Sponsors'],
        founder_name: user.name,
        contact_email: user.email,
        ga_property_id: propertyId,
    });
    const entry = lb?.entry || lb;
    if (entry?.id !== undefined) out.leaderboardId = entry.id;
    if (entry?.slug) out.leaderboardSlug = entry.slug;
    return out;
}

main().catch(err => {
    console.error(`[login] ${err.message}`);
    process.exit(1);
});
