/**
 * The one place that decides whether demo Google data may be served.
 *
 * Default (and always in production): demo data runs only when TC_DEMO_DATA=1 and
 * NODE_ENV is not 'production'.
 *
 * Test-machine exception: scripts/dev/worker1.sh runs a real `next build` + `next start`
 * (NODE_ENV=production) against demo data. That needs TC_ALLOW_DEMO_IN_PROD_BUILD=1 AND a
 * NEXTAUTH_URL whose host is localhost / 127.0.0.1 / [::1]. A real deployment has a public
 * NEXTAUTH_URL, so setting the flag there changes nothing; leaving it unset changes nothing either.
 */
export function demoDataAllowed(env: Record<string, string | undefined> = process.env): boolean {
    if (env.TC_DEMO_DATA !== '1') return false;
    if (env.NODE_ENV !== 'production') return true;
    if (env.TC_ALLOW_DEMO_IN_PROD_BUILD !== '1') return false;
    try {
        const host = new URL(env.NEXTAUTH_URL || '').hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
        return false;
    }
}
