'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Gauge, PanelLeft, PanelLeftOpen, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useCredits } from '@/lib/useDashboardData';
import { Tooltip } from '@/components/ui/Tooltip';
import { BrandMark, Wordmark } from './BrandMark';
import { BOTTOM_ITEMS, GROW_ITEMS, MAIN_ITEMS, PORTFOLIO_ITEM, SITE_NAV, siteHref, type NavItem } from './nav';
import { useShell } from './ShellContext';
import { isPortfolioPath, SiteSwitcher } from './SiteSwitcher';
import { useCurrentSite } from './useCurrentSite';
import { UserMenu } from './UserMenu';
import { useDemoSession } from '@/components/demo/useDemoSession';

/** Credits per plan for the meter (same table as the old CreditsCard). */
function planMax(plan: string): number {
    return plan === 'pro' ? 300 : plan === 'growth' ? 150 : plan === 'starter' ? 50 : 20;
}

function isActive(pathname: string, item: NavItem): boolean {
    if (item.href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/portfolio';
    const prefixes = [item.href, ...(item.match ?? [])];
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface NavLinkProps {
    href?: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
    collapsed?: boolean;
    badge?: number;
    disabled?: boolean;
    onClick?: () => void;
}

function NavLink({ href, label, icon: Icon, active, collapsed, badge, disabled, onClick }: NavLinkProps) {
    const cls = cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md text-body font-medium transition-colors duration-120 ease-standard pointer-coarse:h-11',
        collapsed ? 'mx-auto w-10 justify-center' : 'mx-3 px-2',
        active ? 'bg-brand-soft text-fg' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
        disabled && 'pointer-events-none opacity-50',
    );
    const inner = (
        <>
            <Icon aria-hidden size={16} strokeWidth={1.75} className={cn('shrink-0', active ? 'text-brand-soft-fg' : 'text-fg-muted group-hover:text-fg')} />
            {collapsed ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
            {badge && badge > 0 ? (
                collapsed
                    ? <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-down ring-2 ring-surface" />
                    : <span className="rounded-full bg-down px-1.5 text-meta font-medium text-white tabular-nums">{badge > 99 ? '99+' : badge}</span>
            ) : null}
        </>
    );
    const el = href && !disabled ? (
        <Link href={href} aria-current={active ? 'page' : undefined} onClick={onClick} className={cls} aria-label={collapsed ? label : undefined}>
            {inner}
        </Link>
    ) : (
        <button type="button" onClick={onClick} disabled={disabled} className={cn(cls, 'w-[calc(100%-1.5rem)] text-left', collapsed && 'w-10')} aria-label={collapsed ? label : undefined}>
            {inner}
        </button>
    );
    return collapsed ? <Tooltip content={badge ? `${label} (${badge})` : label} side="right">{el}</Tooltip> : el;
}

function GroupLabel({ children, detail, collapsed }: { children: string; detail?: string | null; collapsed?: boolean }) {
    if (collapsed) return <div aria-hidden className="mx-auto my-3 h-px w-6 bg-border-subtle" />;
    return (
        <p className="mt-5 mb-1 flex min-w-0 items-baseline gap-1.5 px-5 text-caption text-fg-muted">
            <span className="shrink-0 tracking-[0.04em] uppercase">{children}</span>
            {detail ? <span className="min-w-0 truncate normal-case" title={detail}>· {detail}</span> : null}
        </p>
    );
}

function AiMeter({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
    const { credits, plan } = useCredits();
    if (credits === null || credits === undefined) return null;
    const max = Math.max(planMax(plan), credits);
    const pct = max > 0 ? Math.max(0, Math.min(100, (credits / max) * 100)) : 0;
    if (collapsed) {
        return <NavLink href="/dashboard/plan" label={`AI messages: ${credits} left`} icon={Gauge} collapsed onClick={onNavigate} />;
    }
    return (
        <Link href="/dashboard/plan" onClick={onNavigate} className="mx-3 block rounded-control bg-surface-sunken p-3 transition-colors duration-120 hover:bg-subtle">
            <span className="flex items-center justify-between gap-2">
                <span className="text-meta text-fg-muted">AI messages</span>
                <span className="text-meta font-medium text-brand-text">Get more</span>
            </span>
            <span className="mt-0.5 block text-body-sm font-medium text-fg tabular-nums">{credits} of {max} left</span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <span className={cn('block h-full rounded-full', credits === 0 ? 'bg-down' : pct < 20 ? 'bg-warn' : 'bg-brand')} style={{ width: `${pct}%` }} />
            </span>
        </Link>
    );
}

export interface SidebarProps {
    /** Icons only (64px rail). */
    collapsed?: boolean;
    /** Inside the mobile drawer: no collapse button, closes on navigation. */
    inDrawer?: boolean;
    onNavigate?: () => void;
    /** The site switcher keeps its own open state (copies that the `g s` shortcut must not open). */
    localSwitcher?: boolean;
}

/** App sidebar (DESIGN 3.1, 4.1). */
export function Sidebar({ collapsed = false, inDrawer = false, onNavigate, localSwitcher = false }: SidebarProps) {
    const pathname = usePathname() ?? '';
    const shell = useShell();
    const { setCollapsed } = shell;
    const local = inDrawer || localSwitcher;
    const [localOpen, setLocalOpen] = useState(false);
    const setSwitcherOpen = local ? setLocalOpen : shell.setSwitcherOpen;
    const { site, section, loading: sitesLoading } = useCurrentSite();
    const { data: unread } = useSWR<{ unread: number }>(
        '/api/support/unread-count',
        (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ unread: 0 })),
        { refreshInterval: 60_000, shouldRetryOnError: false },
    );
    const supportUnread = Math.max(0, Number(unread?.unread || 0));
    const onSitePage = pathname.startsWith('/dashboard/s/');
    // The switcher reads "All sites" only on Portfolio; there the Site links go to the last site, and say so.
    const lastSite = isPortfolioPath(pathname) && site ? site.label : null;
    // Public live demo: no AI meter or Plan (nothing to buy on the shared demo account).
    const { demo } = useDemoSession();
    const bottomItems = demo ? BOTTOM_ITEMS.filter((item) => item.href !== '/dashboard/plan') : BOTTOM_ITEMS;

    return (
        <nav aria-label="Main" className={cn('flex h-full min-h-0 flex-col', inDrawer && 'overflow-y-auto overscroll-contain')}>
            <div className={cn('group/logo flex h-14 shrink-0 items-center', collapsed ? 'justify-center px-0' : 'gap-2 px-4')}>
                <Link href="/dashboard" onClick={onNavigate} className="flex min-w-0 items-center gap-2 rounded-md" aria-label="Portfolio">
                    <BrandMark size={24} />
                    {collapsed ? null : <Wordmark />}
                </Link>
                {!inDrawer && !collapsed ? (
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        aria-label="Collapse sidebar"
                        className="ml-auto hidden size-7 items-center justify-center rounded-md text-fg-muted opacity-0 transition-opacity duration-120 group-hover/logo:opacity-100 hover:bg-subtle hover:text-fg focus-visible:opacity-100 lg:flex"
                    >
                        <PanelLeft aria-hidden size={16} />
                    </button>
                ) : null}
            </div>
            {!inDrawer && collapsed ? (
                <div className="mb-2 hidden justify-center lg:flex">
                    <Tooltip content="Expand sidebar" side="right">
                        <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg">
                            <PanelLeftOpen aria-hidden size={16} />
                        </button>
                    </Tooltip>
                </div>
            ) : null}

            <div className={cn('shrink-0', collapsed ? 'px-3' : 'mx-3')}>
                <SiteSwitcher collapsed={collapsed} onNavigate={onNavigate} {...(local ? { open: localOpen, onOpenChange: setLocalOpen } : {})} />
            </div>

            {/* Desktop: only the nav list scrolls, the switcher and the account block stay pinned.
                The phone drawer scrolls as a whole (touch-size rows leave too little room otherwise). */}
            <div className={cn('mt-3 flex-1 pb-3', !inDrawer && 'min-h-0 overflow-y-auto overscroll-contain')}>
                <NavLink {...PORTFOLIO_ITEM} active={isActive(pathname, PORTFOLIO_ITEM)} collapsed={collapsed} onClick={onNavigate} />

                {/* Everywhere but Portfolio the switcher above names the current site, so the header does not repeat it. */}
                <GroupLabel collapsed={collapsed} detail={lastSite}>{lastSite ? 'Last site' : 'Site'}</GroupLabel>
                {SITE_NAV.map((item) => (
                    <NavLink
                        key={item.section || 'overview'}
                        href={site ? siteHref(site.host, item.section) : undefined}
                        label={item.label}
                        icon={item.icon}
                        active={onSitePage && section === item.section}
                        collapsed={collapsed}
                        onClick={site ? onNavigate : () => setSwitcherOpen(true)}
                    />
                ))}
                {/* Only once the sites are known: no "Pick a site" flash that then shifts the nav (critique #13). */}
                {!site && !collapsed && !sitesLoading ? (
                    <button type="button" onClick={() => setSwitcherOpen(true)} className="mx-3 mt-1 px-2 text-meta text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                        Pick a site
                    </button>
                ) : null}

                <div className="mt-4" />
                {MAIN_ITEMS.map((item) => (
                    <NavLink key={item.href} {...item} active={isActive(pathname, item)} collapsed={collapsed} onClick={onNavigate} />
                ))}

                <GroupLabel collapsed={collapsed}>Grow</GroupLabel>
                {GROW_ITEMS.map((item) => (
                    <NavLink key={item.href} {...item} active={isActive(pathname, item)} collapsed={collapsed} onClick={onNavigate} />
                ))}
            </div>

            <div className="shrink-0 border-t border-border-subtle pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {demo ? null : <AiMeter collapsed={collapsed} onNavigate={onNavigate} />}
                <div className={cn('flex flex-col gap-0.5', !demo && 'mt-2')}>
                    {bottomItems.map((item) => (
                        <NavLink
                            key={item.href}
                            {...item}
                            active={isActive(pathname, item)}
                            collapsed={collapsed}
                            badge={item.href === '/dashboard/support' ? supportUnread : undefined}
                            onClick={onNavigate}
                        />
                    ))}
                </div>
                <div className={cn('mt-2', collapsed ? '' : 'mx-1')}>
                    <UserMenu collapsed={collapsed} onNavigate={onNavigate} />
                </div>
            </div>
        </nav>
    );
}
