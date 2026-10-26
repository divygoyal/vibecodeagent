'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, LayoutDashboard, LayoutGrid, Menu, Sparkles, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { siteHref } from './nav';
import { useShell } from './ShellContext';
import { useCurrentSite } from './useCurrentSite';

function Tab({ href, label, icon: Icon, active, onClick }: { href?: string; label: string; icon: LucideIcon; active?: boolean; onClick?: () => void }) {
    const cls = cn('flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-fg' : 'text-fg-muted');
    const inner = (
        <>
            <Icon aria-hidden size={20} strokeWidth={active ? 2 : 1.75} />
            <span>{label}</span>
        </>
    );
    return href ? (
        <Link href={href} aria-current={active ? 'page' : undefined} className={cls}>{inner}</Link>
    ) : (
        <button type="button" onClick={onClick} className={cls}>{inner}</button>
    );
}

/** Bottom tab bar below 768px (DESIGN 3.1): Portfolio, Site, Ask, Dashboards, More. */
export function MobileTabBar() {
    const pathname = usePathname() ?? '';
    const { setNavOpen, setSwitcherOpen } = useShell();
    const { site } = useCurrentSite();
    return (
        <nav
            aria-label="Quick navigation"
            className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border-subtle bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
            <Tab href="/dashboard" label="Portfolio" icon={LayoutGrid} active={pathname === '/dashboard'} />
            <Tab
                href={site ? siteHref(site.host) : undefined}
                onClick={site ? undefined : () => { setNavOpen(true); setSwitcherOpen(false); }}
                label="Site"
                icon={Gauge}
                active={pathname.startsWith('/dashboard/s/')}
            />
            <Tab href="/dashboard/ask" label="Ask" icon={Sparkles} active={pathname.startsWith('/dashboard/ask')} />
            <Tab href="/dashboard/dashboards" label="Dashboards" icon={LayoutDashboard} active={pathname.startsWith('/dashboard/dashboards')} />
            <Tab label="More" icon={Menu} onClick={() => setNavOpen(true)} />
        </nav>
    );
}
