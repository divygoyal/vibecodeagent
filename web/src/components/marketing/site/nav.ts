/** Marketing navigation (DESIGN 4.4). One list feeds the header, the mobile menu and the footer. */

export interface NavLink {
    label: string;
    href: string;
}

export const HEADER_NAV: NavLink[] = [
    { label: 'Demo', href: '/demo' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Connect AI', href: '/ai' },
    { label: 'Free tools', href: '/tools' },
    { label: 'Pricing', href: '/pricing' },
];

export const FOOTER_COLUMNS: Array<{ title: string; links: NavLink[] }> = [
    {
        title: 'Product',
        links: [
            { label: 'Portfolio', href: '/#product' },
            { label: 'Dashboards', href: '/#dashboards' },
            { label: 'Live demo', href: '/demo' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Changelog', href: '/changelog' },
        ],
    },
    {
        title: 'Leaderboard',
        links: [
            { label: 'Verified leaderboard', href: '/leaderboard' },
            { label: 'Add your site', href: '/leaderboard/join' },
            { label: 'Advertise', href: '/leaderboard/advertise' },
        ],
    },
    {
        title: 'Resources',
        links: [
            { label: 'Connect AI (ChatGPT & Claude)', href: '/ai' },
            { label: 'Free SEO tools', href: '/tools' },
            { label: 'llms.txt', href: '/llms.txt' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About', href: '/about' },
            { label: 'Contact', href: '/contact' },
            { label: 'Security & data', href: '/security' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
        ],
    },
];

/** Where a fresh Google sign-in lands. /dashboard decides between setup and the portfolio. */
export const SIGN_IN_CALLBACK = '/dashboard';

/** Only same-site relative paths are allowed as a post-sign-in destination. */
export function safeCallbackUrl(raw: string | null | undefined, fallback = SIGN_IN_CALLBACK): string {
    if (!raw) return fallback;
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
    return raw;
}
