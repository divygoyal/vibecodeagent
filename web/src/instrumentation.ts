/**
 * Next.js instrumentation hook. Runs once when the server starts.
 *
 * Production: starts the portfolio sync scheduler (lib/portfolio/scheduledSync;
 * off with TC_PORTFOLIO_SCHEDULER=0) and the daily leaderboard refresh
 * (lib/leaderboard/scheduledRefresh; off with TC_LEADERBOARD_SCHEDULER=0).
 *
 * Demo data mode (local development only): with TC_DEMO_DATA=1 every Google
 * data request is answered by src/lib/demo instead of the network. See
 * scripts/dev/README.md. It refuses to run when NODE_ENV is 'production'.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    // Keep portfolios fresh without an external cron (production only).
    if (process.env.NODE_ENV === 'production' && process.env.TC_PORTFOLIO_SCHEDULER !== '0' && process.env.TC_DEMO_DATA !== '1') {
        const { startPortfolioScheduler } = await import('./lib/portfolio/scheduledSync');
        startPortfolioScheduler();
    }
    // Keep the public leaderboard fresh without an external cron (production only).
    if (process.env.NODE_ENV === 'production' && process.env.TC_LEADERBOARD_SCHEDULER !== '0' && process.env.TC_DEMO_DATA !== '1') {
        const { startLeaderboardScheduler } = await import('./lib/leaderboard/scheduledRefresh');
        if (startLeaderboardScheduler()) console.log('[leaderboard-scheduler] started: daily refresh, first check a few minutes after boot');
    }
    if (process.env.TC_DEMO_DATA !== '1') return;
    if (process.env.NODE_ENV === 'production') {
        console.warn('[demo-data] TC_DEMO_DATA=1 ignored: demo data is only allowed outside production.');
        return;
    }
    const { installDemoGoogleFetch } = await import('./lib/demo/fetchShim');
    installDemoGoogleFetch();
}
