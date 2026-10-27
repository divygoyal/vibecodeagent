/**
 * Route list shared by crawl.mjs and check-mobile.mjs: every page route under
 * web/src/app (route groups removed), with dynamic segments filled from the
 * instance's seed.json (written by login.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEV_HOME = process.env.TC_DEV_HOME || '/root/.trafficclaw-dev';

export function readEnvFile(file) {
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) env[m[1]] = m[2];
    }
    return env;
}

/** The dev instance (scripts/dev/up.sh) serving `port`: { dir, REPO, WEB_PORT, ADMIN_URL, … }. */
export function findInstance(port) {
    for (const name of fs.existsSync(DEV_HOME) ? fs.readdirSync(DEV_HOME) : []) {
        const f = path.join(DEV_HOME, name, 'instance.env');
        if (fs.existsSync(f) && Number(readEnvFile(f).WEB_PORT) === port) return { dir: path.dirname(f), ...readEnvFile(f) };
    }
    return null;
}

/** All page routes under web/src/app, with route groups removed. */
export function discoverRoutes(appDir) {
    const routes = [];
    const walk = (dir, segs) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (entry.name === 'api' && segs.length === 0) continue;
                if (entry.name.startsWith('_')) continue;
                const seg = /^\(.*\)$/.test(entry.name) ? null : entry.name;
                walk(path.join(dir, entry.name), seg ? [...segs, seg] : segs);
            } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
                routes.push('/' + segs.join('/'));
            }
        }
    };
    walk(appDir, []);
    return [...new Set(routes)].sort();
}

/**
 * A concrete path for a route pattern. `seed` is <instance>/seed.json, `user`
 * the login user, `host` the site for /dashboard/s/[host] pages.
 */
export function fillRoute(route, seed, { user = 'demo', host = 'acmeanalytics.example' } = {}) {
    const s = seed.demo || seed[user] || {};
    const fills = {
        '/dashboard/dashboards/[id]': s.dashboardId,
        '/dashboard/dashboards/[id]/edit': s.dashboardId,
        '/dashboard/share/[token]': s.shareToken,
        '/share/[token]': s.shareToken,
        '/share/[token]/events': s.shareToken,
        '/view/[token]': s.dashboardPublicToken,
        '/embed/d/[token]': s.dashboardPublicToken,
        '/leaderboard/[id]': s.leaderboardSlug || s.leaderboardId,
        '/embed/leaderboard/[id]': s.leaderboardSlug || s.leaderboardId,
        '/embed/[siteId]': s.embedToken ? `demo?token=${s.embedToken}` : null,
        '/demo/[slug]': 'acme',
    };
    if (route in fills) {
        const v = fills[route];
        if (v === undefined || v === null) return route.replace(/\[[^\]]+\]/g, 'missing-seed');
        if (route === '/embed/[siteId]') return `/embed/${v}`;
        return route.replace(/\[[^\]]+\]/, encodeURIComponent(String(v)));
    }
    // Site pages: one demo site (--host, default acmeanalytics.example: GA4 + Search Console).
    if (route.startsWith('/dashboard/s/[host]')) return route.replace('[host]', encodeURIComponent(host));
    return route.replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'demo-token');
}

export const routeSlug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '')).slice(0, 120);

export function memAvailableMb() {
    try {
        const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
        return m ? Math.floor(Number(m[1]) / 1024) : Infinity;
    } catch { return Infinity; }
}
