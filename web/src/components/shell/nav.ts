import {
    BookOpen, CreditCard, FileText, Gauge, LayoutDashboard, LayoutGrid, LifeBuoy, ListChecks, Plug, Search, Settings, Sparkles, Trophy, Users,
    type LucideIcon,
} from 'lucide-react';

/** Site sections under /dashboard/s/[host] (DESIGN 4.1, 4.3). '' is the overview. */
export type SiteSection = '' | 'traffic' | 'search' | 'pages' | 'actions';

export interface SiteNavItem {
    section: SiteSection;
    label: string;
    icon: LucideIcon;
}

export const SITE_NAV: SiteNavItem[] = [
    { section: '', label: 'Overview', icon: Gauge },
    { section: 'traffic', label: 'Traffic', icon: Users },
    { section: 'search', label: 'Search', icon: Search },
    { section: 'pages', label: 'Pages', icon: FileText },
    { section: 'actions', label: 'Actions', icon: ListChecks },
];

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    /** Extra path prefixes that mark this item active. */
    match?: string[];
}

export const PORTFOLIO_ITEM: NavItem = { href: '/dashboard', label: 'Portfolio', icon: LayoutGrid };
export const MAIN_ITEMS: NavItem[] = [
    { href: '/dashboard/dashboards', label: 'Dashboards', icon: LayoutDashboard },
    { href: '/dashboard/ask', label: 'Ask', icon: Sparkles, match: ['/dashboard/ai-chat'] },
];
export const GROW_ITEMS: NavItem[] = [
    { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/dashboard/connect-ai', label: 'Connect AI', icon: Plug },
];
export const BOTTOM_ITEMS: NavItem[] = [
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    { href: '/dashboard/plan', label: 'Plan', icon: CreditCard },
    { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
    { href: '/dashboard/docs', label: 'Docs', icon: BookOpen },
];

/** Breadcrumb / document titles for app routes that are not site pages. */
export const ROUTE_TITLES: [prefix: string, title: string][] = [
    ['/dashboard/dashboards', 'Dashboards'],
    ['/dashboard/ask', 'Ask'],
    ['/dashboard/ai-chat', 'Ask'],
    ['/dashboard/leaderboard', 'Leaderboard'],
    ['/dashboard/connect-ai', 'Connect AI'],
    ['/dashboard/settings', 'Settings'],
    ['/dashboard/plan', 'Plan'],
    ['/dashboard/support', 'Support'],
    ['/dashboard/docs', 'Docs'],
    ['/dashboard/setup', 'Setup'],
    ['/dashboard/styleguide', 'Styleguide'],
    ['/dashboard/analytics', 'Traffic'],
    ['/dashboard/seo', 'Search'],
    ['/dashboard/audit', 'Actions'],
    ['/dashboard/weekly', 'Weekly'],
];

export function routeTitle(pathname: string): string | null {
    for (const [prefix, title] of ROUTE_TITLES) {
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
    }
    return null;
}

/**
 * Pages that still use the old dark styling. AppShell wraps their content in
 * <LegacyFrame> (data-theme="dark" + the old black background) so they keep
 * rendering correctly inside the new light shell.
 *
 * WHEN YOU MIGRATE A PAGE TO THE TOKENS, DELETE ITS PREFIX HERE.
 * (/dashboard/s/** pages wrap their own legacy content; see app/(dashboard)/dashboard/s.)
 */
export const LEGACY_ROUTE_PREFIXES: string[] = [
    '/dashboard/dashboards',
    '/dashboard/support',
    '/dashboard/docs',
    '/dashboard/leaderboard',
    '/dashboard/setup',
    '/dashboard/weekly',
    '/dashboard/analytics',
    '/dashboard/seo',
    '/dashboard/audit',
];

export function isLegacyRoute(pathname: string): boolean {
    return LEGACY_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Routes where the mobile tab bar is hidden (own composer, full-screen editor, focused setup). */
export function hidesMobileTabBar(pathname: string): boolean {
    return pathname === '/dashboard/ask' || pathname.startsWith('/dashboard/ask/') || pathname === '/dashboard/ai-chat'
        || /^\/dashboard\/dashboards\/[^/]+(\/edit)?$/.test(pathname)
        || pathname.startsWith('/dashboard/setup');
}

/** Href for a site section: /dashboard/s/acme.com/search */
export function siteHref(host: string, section: SiteSection = ''): string {
    return `/dashboard/s/${encodeURIComponent(host)}${section ? `/${section}` : ''}`;
}

/** Parse /dashboard/s/<host>/<section> */
export function parseSitePath(pathname: string): { host: string; section: SiteSection } | null {
    const m = /^\/dashboard\/s\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
    if (!m) return null;
    const section = (m[2] ?? '') as SiteSection;
    return { host: decodeURIComponent(m[1]), section: SITE_NAV.some((s) => s.section === section) ? section : '' };
}
