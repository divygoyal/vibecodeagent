/**
 * The public changelog (/changelog) and the home page's "What's new" row.
 *
 * Written by hand from the git history of tc/integrate since 1b62be9
 * (2026-09-09): only changes a user can see, in plain words, grouped by
 * feature. The redesign shipped to trafficclaw.com on 2026-10-27
 * (4b1db9c, then 6fdf71f the same morning). Newest release first.
 */

export interface ChangeGroup {
    /** Feature name, e.g. "Portfolio". */
    title: string;
    items: string[];
}

export interface Release {
    /** ISO date the release went live. */
    date: string;
    /** Anchor on /changelog. */
    id: string;
    title: string;
    summary: string;
    groups: ChangeGroup[];
}

export const RELEASES: Release[] = [
    {
        date: '2026-10-27',
        id: 'fresh-portfolios',
        title: 'Portfolios stay fresh on their own',
        summary: 'Two follow-ups to the redesign, shipped the same morning.',
        groups: [
            {
                title: 'Portfolio',
                items: [
                    'Your sites now sync in the background, so the portfolio is up to date when you open it. Each site refreshes about every six hours, with no setup on your side.',
                ],
            },
            {
                title: 'ChatGPT and Claude',
                items: [
                    'Connect AI is on for every account. Add the TrafficClaw server to ChatGPT, Claude, Cursor or VS Code from the Connect AI page.',
                ],
            },
            {
                title: 'Fixes',
                items: [
                    'Site pages no longer flash “We couldn’t find this site” while they load.',
                    'Buttons with icons render correctly on every page.',
                ],
            },
        ],
    },
    {
        date: '2026-10-27',
        id: 'redesign',
        title: 'A new TrafficClaw: one screen for every site',
        summary:
            'The biggest release so far. The app now opens on a portfolio of every site you own, each site has its own pages for search, traffic and what to fix next, and everything was rebuilt on one calm design system.',
        groups: [
            {
                title: 'Portfolio',
                items: [
                    'Every Google Analytics 4 property and Search Console site you can see becomes a card with clicks, impressions, position, users, sessions and a sparkline, paired by domain.',
                    'A totals strip and chart for all sites, compared with the previous period.',
                    'Sort, search, star and hide sites; switch to a table; export a CSV.',
                    'Alerts when a site drops 30% or more, or stops getting traffic.',
                    'Exact user counts for each date range (no double counting across days).',
                ],
            },
            {
                title: 'Site pages',
                items: [
                    'Overview: Analytics and Search Console side by side, with top pages, channels, queries, countries, devices and the top tasks.',
                    'Search: performance, opportunities, cannibalization, winners and losers, and indexing.',
                    'Traffic: overview, pages, sources, audience, realtime, events and goals, funnels, journeys and retention.',
                    'Pages: Analytics and Search Console joined by page, with a detail drawer for each page.',
                    'Audit: on-page checks and page speed for your site.',
                ],
            },
            {
                title: 'What to fix next',
                items: [
                    'A new Actions page ranks tasks by the extra clicks or visits they could bring: queries close to page one, pages with a low click-through rate, decaying pages, cannibalization and sudden drops.',
                    'Each task shows the numbers behind it and a suggested fix. Mark it done or dismiss it, or ask AI about it.',
                ],
            },
            {
                title: 'Dashboards',
                items: [
                    'A new dashboard builder with a template gallery and widgets for scorecards, KPI strips, time series, bars, donuts, tables, maps, text and images. Each widget can use any of your sites.',
                    'Share a read-only link, optionally with a password or an end date, or embed a dashboard on another page.',
                    'Version history with restore, a CSV download for each widget, and JSON export.',
                ],
            },
            {
                title: 'Leaderboard',
                items: [
                    'Sites rank only when the owner is verified in Search Console.',
                    'You choose how each number is shown: exact, as a range, or hidden.',
                    'New tabs: Top, Search, Rising, New, Offers and Categories.',
                    'Public profiles with charts and audience breakdowns, plus an embeddable badge.',
                    'Visitors can send offers for sponsorships, acquisitions or partnerships, and owners can list their own ad slots.',
                ],
            },
            {
                title: 'ChatGPT and Claude',
                items: [
                    'A hosted MCP server: connect ChatGPT, Claude, Cursor or VS Code and ask about your sites in plain English.',
                    'You approve each app, pick which sites it can see, and can hide your search queries from it.',
                    'Read-only tools for your portfolio, Analytics reports, realtime, Search Console, period comparisons, top movers and what to fix next.',
                    'Personal API keys, an activity log, and one-click revoke for each app or all of them.',
                ],
            },
            {
                title: 'Account and settings',
                items: [
                    'Settings in tabs: Profile, Google, Appearance, Notifications, Data and privacy, and Danger zone.',
                    'Export everything we keep about you as a JSON file, or ask for your account to be deleted.',
                    'Weekly report settings moved to Settings › Notifications.',
                ],
            },
            {
                title: 'Design and phones',
                items: [
                    'A new light design with an equally careful dark mode. Each metric keeps one colour everywhere: clicks are blue, impressions purple, users indigo.',
                    'A ⌘K command palette, a bottom tab bar on phones, and larger tap targets on touch screens.',
                ],
            },
            {
                title: 'Public site',
                items: [
                    'A new home page, a live demo with sample sites (no sign-in), a simpler pricing page and restyled free SEO tools.',
                ],
            },
            {
                title: 'Removed',
                items: [
                    'The Telegram bot, the X and Reddit pages, the 3D globe and the share studio. Old links redirect to their closest page.',
                ],
            },
        ],
    },
];

/** Three highlights for the home page's "What's new" row (newest first). */
export const HOME_HIGHLIGHTS: Array<{ date: string; title: string; text: string; href: string }> = [
    {
        date: '2026-10-27',
        title: 'What to fix next',
        text: 'Every site gets a to-do list ranked by the clicks each task could bring.',
        href: '/changelog#redesign',
    },
    {
        date: '2026-10-27',
        title: 'Ask ChatGPT or Claude',
        text: 'Connect the AI you already use to your Analytics and Search Console, read-only.',
        href: '/changelog#redesign',
    },
    {
        date: '2026-10-27',
        title: 'Background sync',
        text: 'Your portfolio refreshes on its own, about every six hours.',
        href: '/changelog#fresh-portfolios',
    },
];
