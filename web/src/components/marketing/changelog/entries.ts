/**
 * The public changelog (/changelog) and the home page's "What's new" row.
 *
 * Written by hand from the git history: only changes a user can see, in plain
 * words, grouped by feature. Dates are real: the redesign went live on
 * trafficclaw.com on 2026-10-27 (03:46 UTC, release 4b1db9c; background sync
 * 6fdf71f the same day); earlier entries use their commit dates in UTC
 * (48e7b70/1e029eb, 95655e9, b196074, 2bd93c0/3d0dea6). Features that were
 * later removed are left out of the earlier entries. Newest release first.
 */

export interface ChangeGroup {
    /** Feature name, e.g. "Portfolio". */
    title: string;
    items: string[];
}

export interface Release {
    /** ISO date the release went live (UTC). */
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
        id: 'redesign',
        title: 'A new TrafficClaw: one screen for every site',
        summary:
            'TrafficClaw now opens on a portfolio of every site you own. Each site has its own pages for search, traffic and what to fix next, and you can ask ChatGPT or Claude about any of them.',
        groups: [
            {
                title: 'Portfolio',
                items: [
                    'Every Google Analytics 4 property and Search Console site you can see becomes a card with clicks, impressions, position, users, sessions and a sparkline, paired by domain.',
                    'A totals strip and chart for all your sites, compared with the previous period.',
                    'Sort, search, star and hide sites; switch to a table; export a CSV.',
                    'Alerts when a site drops 30% or more, or stops getting traffic.',
                    'Your sites sync in the background about every six hours, so the portfolio is ready when you open it.',
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
                    'Visitors can send offers for sponsorships, acquisitions or partnerships.',
                ],
            },
            {
                title: 'ChatGPT and Claude',
                items: [
                    'Connect ChatGPT, Claude, Cursor or VS Code to TrafficClaw and ask about your sites in plain English.',
                    'You approve each app, pick which sites it can see, and can hide your search queries from it.',
                    'It can read your portfolio, Analytics reports, realtime visitors, Search Console, period comparisons, top movers and what to fix next. It cannot change anything.',
                    'Personal API keys, an activity log, and one-click revoke for each app or all of them.',
                ],
            },
            {
                title: 'Account and settings',
                items: [
                    'Settings in tabs: Profile, Google, Appearance, Notifications, Data and privacy, and Danger zone.',
                    'Export everything we keep about you as a JSON file, or ask for your account to be deleted.',
                ],
            },
            {
                title: 'Design and phones',
                items: [
                    'A cleaner look in light and dark mode. Each metric keeps its colour everywhere (clicks blue, impressions purple, users indigo), so charts read at a glance.',
                    'Press ⌘K to jump to any site or page. On phones, a bottom tab bar and larger tap targets.',
                ],
            },
            {
                title: 'Public site',
                items: [
                    'A new home page, a live demo with sample sites (no sign-in), a simpler pricing page and refreshed free SEO tools.',
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
    {
        date: '2026-09-08',
        id: 'sponsorships',
        title: 'Sponsor slots on the leaderboard',
        summary: 'Owners of verified sites can sell their own ad placements, and buyers can see who a site reaches before asking.',
        groups: [
            {
                title: 'Leaderboard',
                items: [
                    'List your own ad slots on a verified profile: name each one, set your price, billing period and availability, and add a preview.',
                    'Buyers request a specific slot from your profile, and you track each request until it is paid.',
                    'Profiles gained an audience panel: countries, channels, devices, top pages and top search queries.',
                    'One page lists every open sponsor slot across verified sites.',
                ],
            },
        ],
    },
    {
        date: '2026-05-11',
        id: 'simpler-pricing',
        title: 'Simpler pricing',
        summary: 'Everything stays free. Paid plans now only add Ask messages.',
        groups: [
            {
                title: 'Pricing',
                items: [
                    'Every account starts with 5 free Ask messages. Growth ($19 a month) adds 50 a month and Pro ($29 a month) adds 100.',
                    'The Starter plan was retired.',
                ],
            },
        ],
    },
    {
        date: '2026-05-08',
        id: 'support',
        title: 'Support inside the app',
        summary: 'Talk to us without leaving TrafficClaw.',
        groups: [
            {
                title: 'Support',
                items: ['A Support page with one ongoing thread to the team, and a badge when we reply.'],
            },
        ],
    },
    {
        date: '2026-05-04',
        id: 'leaderboard-profiles',
        title: 'More than one site on the leaderboard',
        summary: 'List every site you run, each with its own profile.',
        groups: [
            {
                title: 'Leaderboard',
                items: [
                    'Add more than one site to the leaderboard.',
                    'Readable profile links (/leaderboard/your-site), founder and contact details, and badge snippets to embed your listing.',
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
        date: '2026-09-08',
        title: 'Sponsor slots on the leaderboard',
        text: 'Verified owners sell their own ad placements at their own price.',
        href: '/changelog#sponsorships',
    },
];
