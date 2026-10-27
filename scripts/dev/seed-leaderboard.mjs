#!/usr/bin/env node
/**
 * Seed a populated public leaderboard on a dev instance (demo data mode).
 *
 *   node scripts/dev/seed-leaderboard.mjs <webPort>
 *
 * Creates 15 listings through the app's own routes (POST /api/leaderboard/me, then PATCH to
 * set category, privacy and "open to"), so the whole pipeline runs for real against the
 * demo Google generator: ownership check, GA4 + Search Console reads, daily series,
 * audience, then publish. Finally it runs the daily cron once.
 *
 * Result: 13 ranked listings across 9 categories with a mix of privacy settings (exact,
 * range, hidden), ad slots, offers in the owner's inbox, and two listings that stay
 * "Pending verification" to exercise the fix-it messages:
 *   creativeprints  GA4 matches but the site is not in Search Console
 *   quietlabs       only restricted access in Search Console
 *
 * Idempotent: listings that already exist are updated, not duplicated. Also called by
 * login.mjs for the default demo user (skip with --no-board there).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEV_HOME = process.env.TC_DEV_HOME || '/root/.trafficclaw-dev';

const ALL_SECTIONS = { countries: true, channels: true, devices: true, pages: true, queries: true };
const NO_SECTIONS = { countries: false, channels: false, devices: false, pages: false, queries: false };

// owner: which login user holds the listing (login.mjs already lists Puzzle Hub for demo2 and Search Metrics for admin).
const LISTINGS = [
    { key: 'acme', owner: 'demo', property: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example', host: 'acmeanalytics.example', name: 'Acme Analytics', category: 'SaaS',
      description: 'Product analytics for growing teams: funnels, retention and dashboards without the enterprise price.',
      open_to: ['sponsorships', 'acquisition', 'partnerships'], twitter: 'acmeanalytics',
      privacy: { metrics: { visitors: 'exact', clicks: 'exact', pageviews: 'exact', impressions: 'exact', engagement: 'exact' }, sections: ALL_SECTIONS, live: true },
      slots: [
          { name: 'Header banner', price_cents: 15000, billing_period: 'month', quantity_total: 2, quantity_taken: 1, preview_note: 'Top of every blog post, 728x90.' },
          { name: 'Newsletter mention', price_cents: 8000, billing_period: 'newsletter_send', quantity_total: 4, quantity_taken: 0, preview_note: 'One paragraph in the weekly product email.' },
      ] },
    { key: 'health', owner: 'demo', property: 'properties/412300102', gsc: 'https://www.healthinsights.example/', host: 'www.healthinsights.example', name: 'Health Insights', category: 'Blog',
      description: 'Evidence-based wellness advice reviewed by medical professionals.',
      open_to: ['acquisition'], privacy: { metrics: { visitors: 'range', clicks: 'exact', pageviews: 'hidden', impressions: 'hidden', engagement: 'range' }, sections: { ...NO_SECTIONS, countries: true, channels: true }, live: false } },
    { key: 'dataviz', owner: 'demo', property: 'properties/412300103', gsc: 'sc-domain:datavizpro.example', host: 'datavizpro.example', name: 'DataViz Pro', category: 'SaaS',
      description: 'Beautiful dashboards from any data source, built in minutes.',
      open_to: ['partnerships'], privacy: {} },
    { key: 'designstudio', owner: 'demo', property: 'properties/412300106', gsc: 'https://www.designstudio.example/', host: 'www.designstudio.example', name: 'Design Studio', category: 'Agency',
      description: 'Amsterdam brand and web studio. New site, six weeks old.', open_to: ['partnerships'], privacy: { sections: { ...NO_SECTIONS, devices: true } } },
    { key: 'splitexpenses', owner: 'demo', property: 'properties/412300107', gsc: 'sc-domain:splitexpenses.example', host: 'splitexpenses.example', name: 'Split Expenses', category: 'Mobile app',
      description: 'Share costs with friends and flatmates without the awkward maths.', open_to: ['acquisition'], privacy: {} },
    { key: 'creativeprints', owner: 'demo', property: 'properties/412300108', gsc: null, host: 'creativeprints.example', name: 'Creative Prints', category: 'E-commerce',
      description: 'Art prints and posters. Not in Search Console yet, so it stays pending.', open_to: [], privacy: {}, expectPending: true },
    { key: 'puzzle', owner: 'demo2', property: 'properties/412300104', gsc: 'https://puzzlehub.example/', host: 'puzzlehub.example', name: 'Puzzle Hub', category: 'Games',
      description: 'Daily puzzles, crosswords and brain teasers.', open_to: ['sponsorships'],
      privacy: { metrics: { visitors: 'exact', clicks: 'hidden', pageviews: 'hidden', impressions: 'hidden', engagement: 'hidden' }, sections: { ...NO_SECTIONS, devices: true, pages: true }, live: false },
      slots: [{ name: 'Sidebar tile', price_cents: 4000, billing_period: 'week', quantity_total: 1, quantity_taken: 0, preview_note: 'Right column on every puzzle page.' }] },
    { key: 'searchmetrics', owner: 'admin', property: 'properties/412300105', gsc: 'sc-domain:searchmetrics.example', host: 'searchmetrics.example', name: 'Search Metrics', category: 'Tool',
      description: 'SEO rank tracking and site audits for in-house teams.', open_to: ['sponsorships', 'partnerships'],
      privacy: { metrics: { visitors: 'exact', clicks: 'exact', pageviews: 'range', impressions: 'hidden', engagement: 'hidden' }, sections: { ...NO_SECTIONS, countries: true, queries: true }, live: false },
      slots: [{ name: 'Footer logo', price_cents: 2500, billing_period: 'month', quantity_total: 3, quantity_taken: 0 }] },
    { key: 'pixelforge', owner: 'founder', property: 'properties/412300111', gsc: 'sc-domain:pixelforge.example', host: 'pixelforge.example', name: 'PixelForge Games', category: 'Games',
      description: 'Free browser games you can play at your desk.', open_to: ['sponsorships', 'acquisition'], privacy: { sections: { ...NO_SECTIONS, countries: true, devices: true } },
      slots: [{ name: 'Game page takeover', price_cents: 30000, billing_period: 'month', quantity_total: 1, quantity_taken: 0, preview_note: 'Branded skin on one game page.' }] },
    { key: 'bytebrief', owner: 'founder', property: 'properties/412300112', gsc: 'https://bytebrief.example/', host: 'bytebrief.example', name: 'ByteBrief Newsletter', category: 'Newsletter',
      description: 'The five-minute tech newsletter read by 40,000 engineers.', open_to: ['sponsorships'],
      privacy: { metrics: { visitors: 'range', clicks: 'range', pageviews: 'hidden', impressions: 'hidden', engagement: 'hidden' }, sections: NO_SECTIONS, live: false },
      slots: [{ name: 'Primary sponsor', price_cents: 120000, billing_period: 'newsletter_send', quantity_total: 1, quantity_taken: 0 }, { name: 'Classified', price_cents: 25000, billing_period: 'newsletter_send', quantity_total: 3, quantity_taken: 1 }] },
    { key: 'shipfast', owner: 'founder', property: 'properties/412300113', gsc: 'sc-domain:shipfast.example', host: 'shipfast.example', name: 'ShipFast Templates', category: 'SaaS',
      description: 'Launch your SaaS in a weekend with production-ready templates.', open_to: ['acquisition', 'partnerships'], privacy: { sections: { ...NO_SECTIONS, channels: true } } },
    { key: 'learnloop', owner: 'founder', property: 'properties/412300114', gsc: 'sc-domain:learnloop.example', host: 'learnloop.example', name: 'LearnLoop', category: 'Education',
      description: 'Spaced repetition that actually fits a student timetable.', open_to: ['partnerships'], privacy: { sections: { ...NO_SECTIONS, countries: true, queries: true } } },
    { key: 'promptly', owner: 'founder', property: 'properties/412300115', gsc: 'sc-domain:promptly.example', host: 'promptly.example', name: 'Promptly', category: 'AI',
      description: 'Version control and evaluation for your AI prompts.', open_to: ['acquisition', 'partnerships'], privacy: {} },
    { key: 'greengrocer', owner: 'founder', property: 'properties/412300116', gsc: 'https://greengrocer.example/', host: 'greengrocer.example', name: 'Green Grocer', category: 'E-commerce',
      description: 'Organic veg boxes delivered weekly across Germany.', open_to: [], privacy: {} },
    { key: 'quietlabs', owner: 'founder', property: 'properties/412300117', gsc: 'sc-domain:quietlabs.example', host: 'quietlabs.example', name: 'Quiet Labs', category: 'SaaS',
      description: 'Focus tools for deep work. Search Console access is restricted, so it stays pending.', open_to: [], privacy: {}, expectPending: true },
];

const LOGIN_USERS = {
    demo: { sub: '100000000000000000001', name: 'Demo Owner', email: 'demo@trafficclaw.example', account: 'main', plan: 'pro' },
    demo2: { sub: '100000000000000000002', name: 'Second Demo User', email: 'demo2@trafficclaw.example', account: 'alt', plan: 'free' },
    admin: { sub: '100000000000000000009', name: 'Demo Admin', email: 'admin@trafficclaw.example', account: 'main', plan: 'pro' },
};

// Offers for the inbox (kinds must match what each listing is open to).
const OFFERS = [
    { key: 'acme', kind: 'acquisition', name: 'Priya Nair', email: 'priya@growthcapital.example', company: 'Growth Capital Partners', budget: '$250k - $400k', message: 'We acquire profitable analytics tools. Would you be open to a call next week about an acquisition?' },
    { key: 'acme', kind: 'partnership', name: 'Tom Becker', email: 'tom@segmentlike.example', company: 'Pipeline.dev', budget: '', message: 'We would like to build an integration between Pipeline and Acme and co-market it to both user bases.' },
    { key: 'acme', kind: 'sponsorship', slotName: 'Newsletter mention', name: 'Jo Marsh', email: 'jo@databrick.example', company: 'Databrick', budget: '', message: 'We would like to book the newsletter mention for the first week of next month.' },
    { key: 'searchmetrics', kind: 'partnership', name: 'Lena Fischer', email: 'lena@agencyhub.example', company: 'AgencyHub', budget: '', message: 'Interested in a referral partnership for agencies using your rank tracker.' },
    { key: 'dataviz', kind: 'partnership', name: 'Sam Ortiz', email: 'sam@chartkit.example', company: 'ChartKit', budget: '', message: 'We make chart components and think our users overlap with yours. Open to a joint webinar?' },
];

function readEnvFile(file) {
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) env[m[1]] = m[2];
    }
    return env;
}

// Several instance folders can name the same port (a stopped instance of another worktree keeps its
// instance.env), so the one whose web process is alive wins, then the newest instance.env.
function findInstance(port) {
    const found = [];
    for (const name of fs.existsSync(DEV_HOME) ? fs.readdirSync(DEV_HOME) : []) {
        const f = path.join(DEV_HOME, name, 'instance.env');
        if (!fs.existsSync(f)) continue;
        const env = readEnvFile(f);
        if (Number(env.WEB_PORT) !== port) continue;
        const dir = path.dirname(f);
        let alive = false;
        try {
            const pid = Number(fs.readFileSync(path.join(dir, 'web.pid'), 'utf8').trim());
            if (pid > 0) { process.kill(pid, 0); alive = true; }
        } catch (e) {
            alive = e?.code === 'EPERM';
        }
        found.push({ inst: { dir, ...env }, alive, mtime: fs.statSync(f).mtimeMs });
    }
    found.sort((a, b) => Number(b.alive) - Number(a.alive) || b.mtime - a.mtime);
    return found[0]?.inst ?? null;
}

async function http(method, url, { headers = {}, body, cookie } = {}) {
    const res = await fetch(url, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

export async function seedLeaderboard(port, { quiet = false } = {}) {
    const log = (...a) => { if (!quiet) console.log('[seed-leaderboard]', ...a); };
    const inst = findInstance(port);
    if (!inst) throw new Error(`no dev instance with web port ${port} in ${DEV_HOME}`);
    const secrets = readEnvFile(path.join(DEV_HOME, 'dev.env'));
    const webUrl = `http://localhost:${port}`;
    const adminHeaders = { 'X-API-Key': secrets.ADMIN_API_KEY };
    const requireWeb = createRequire(path.join(inst.REPO, 'web', 'package.json'));
    const { encode } = requireWeb('next-auth/jwt');

    async function session(userDef, founderKey) {
        const accessToken = `demo-access:${userDef.account}`;
        const refreshToken = `demo-refresh:${userDef.account}`;
        let r = await http('POST', `${inst.ADMIN_URL}/api/users`, {
            headers: adminHeaders,
            body: { provider: 'google', provider_id: userDef.sub, access_token: accessToken, refresh_token: refreshToken, email: userDef.email, github_username: userDef.name, plan: userDef.plan || 'free' },
        });
        if (!r.ok) throw new Error(`admin POST /api/users failed for ${userDef.email}: ${r.status} ${JSON.stringify(r.data)}`);
        await http('PATCH', `${inst.ADMIN_URL}/api/users/${userDef.sub}/workspace`, { headers: adminHeaders, body: { mark_setup_completed: true, mark_welcome_seen: true } });
        const jwt = await encode({
            token: {
                name: userDef.name, email: userDef.email, picture: null, sub: userDef.sub,
                primaryProvider: 'google', primarySub: userDef.sub, primaryName: userDef.name, primaryEmail: userDef.email, primaryImage: null,
                accessToken, refreshToken, googleAccountId: userDef.sub, googleAccessToken: accessToken, googleRefreshToken: refreshToken,
                provider: 'google', workspaceSetupCompleted: true,
            },
            secret: secrets.NEXTAUTH_SECRET,
            maxAge: 30 * 24 * 60 * 60,
        });
        return `next-auth.session-token=${jwt}`;
    }

    const cookies = {};
    const ownerFor = async (l) => {
        const id = l.owner === 'founder' ? `founder-${l.key}` : l.owner;
        if (!cookies[id]) {
            const def = l.owner === 'founder'
                ? { sub: `2000000000000000${String(LISTINGS.indexOf(l) + 10).padStart(5, '0')}`, name: `${l.name} founder`, email: `founder@${l.host.replace(/^www\./, '')}`, account: `founder-${l.key}`, plan: 'free' }
                : LOGIN_USERS[l.owner];
            cookies[id] = await session(def);
        }
        return cookies[id];
    };

    const entryIds = {};
    for (const l of LISTINGS) {
        const cookie = await ownerFor(l);
        let r = await http('POST', `${webUrl}/api/leaderboard/me`, {
            cookie,
            body: { ga_property_id: l.property, gsc_site_url: l.gsc || undefined, website_url: `https://${l.host.replace(/^www\./, '')}`, startup_name: l.name, description: l.description, category: l.category, founder_name: `${l.name} founder`, twitter_handle: l.twitter },
        });
        let id = r.data?.entry?.id ?? r.data?.entryId;
        if (r.status === 409) log(`${l.key}: already listed (#${id}), updating`);
        else if (!r.ok) { console.warn(`[seed-leaderboard] ${l.key}: create failed ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); continue; }
        else log(`${l.key}: created #${id}, verification ${r.data?.verification?.level}`);
        entryIds[l.key] = id;

        r = await http('PATCH', `${webUrl}/api/leaderboard/me/${id}`, {
            cookie,
            body: { startup_name: l.name, description: l.description, category: l.category, open_to: l.open_to, privacy: l.privacy, is_paused: false, founder_name: `${l.name} founder`, ...(l.twitter ? { twitter_handle: l.twitter } : {}) },
        });
        if (!r.ok) console.warn(`[seed-leaderboard] ${l.key}: update failed ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

        if (l.slots?.length) {
            r = await http('PUT', `${webUrl}/api/ad-slots`, { cookie, body: { entry_id: id, slots: l.slots } });
            if (!r.ok) console.warn(`[seed-leaderboard] ${l.key}: ad slots failed ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        }
    }

    // Offers (distinct fake client IPs so the per-IP limit does not interfere).
    let n = 0;
    for (const o of OFFERS) {
        const id = entryIds[o.key];
        if (!id) continue;
        let slotId;
        if (o.slotName) {
            const slots = await http('GET', `${inst.ADMIN_URL}/api/ad-slots/entry/${id}`, { headers: adminHeaders });
            slotId = slots.data?.slots?.find((s) => s.name === o.slotName)?.id;
        }
        // Skip when the same sender already wrote (admin caps repeats; keeps re-runs quiet).
        const r = await http('POST', `${webUrl}/api/leaderboard/${id}/inquiry`, {
            headers: { 'X-Forwarded-For': `203.0.113.${10 + n++}` },
            body: { kind: o.kind, name: o.name, email: o.email, company: o.company, budget: o.budget, message: o.message, slot_id: slotId },
        });
        if (!r.ok && r.status !== 429) console.warn(`[seed-leaderboard] offer to ${o.key} failed ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
    }

    // The daily cron once: this is the refresh path every listing takes in production.
    const cron = await http('GET', `${webUrl}/api/cron/leaderboard-refresh`, { headers: { Authorization: `Bearer ${secrets.CRON_SECRET}` } });
    log('cron:', JSON.stringify(cron.data));

    const board = await http('GET', `${webUrl}/api/leaderboard?tab=top&range=28d&page_size=50`);
    const rows = board.data?.rows || [];
    log(`board: ${rows.length} ranked, categories: ${[...new Set(rows.map((x) => x.category))].join(', ')}`);
    return { entryIds, ranked: rows.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const port = Number(process.argv[2]);
    if (!port) {
        console.error('usage: node scripts/dev/seed-leaderboard.mjs <webPort>');
        process.exit(2);
    }
    seedLeaderboard(port).catch((err) => {
        console.error(`[seed-leaderboard] ${err.message}`);
        process.exit(1);
    });
}
