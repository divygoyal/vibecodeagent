'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, Search, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { AlertsBell } from './AlertsBell';
import { CommandPalette, openCommandPalette } from './CommandPalette';
import { parseSitePath, routeTitle, SITE_NAV, siteHref } from './nav';
import { useShell } from './ShellContext';
import { useCurrentSite } from './useCurrentSite';

interface Crumb {
    label: string;
    href?: string;
}

function useCrumbs(): Crumb[] {
    const pathname = usePathname() ?? '';
    const { crumbTitle } = useShell();
    const { site } = useCurrentSite();
    const crumbs: Crumb[] = [{ label: 'Portfolio', href: '/dashboard' }];
    const sp = parseSitePath(pathname);
    if (sp) {
        const label = site?.label ?? sp.host;
        const section = SITE_NAV.find((s) => s.section === sp.section);
        crumbs.push({ label, href: sp.section ? siteHref(sp.host) : undefined });
        if (sp.section && section) crumbs.push({ label: section.label });
    } else if (pathname !== '/dashboard') {
        const title = routeTitle(pathname);
        if (title) crumbs.push({ label: title, href: crumbTitle ? pathname.split('/').slice(0, 3).join('/') : undefined });
    }
    if (crumbTitle) crumbs.push({ label: crumbTitle });
    return crumbs;
}

/** Sticky topbar: menu (mobile/tablet), breadcrumb, search, Ask AI, alerts (DESIGN 3.1). */
export function Topbar() {
    const pathname = usePathname() ?? '';
    const { setNavOpen, pageAsk } = useShell();
    const crumbs = useCrumbs();
    const [scrolled, setScrolled] = useState(false);
    const onAsk = pathname.startsWith('/dashboard/ask') || pathname.startsWith('/dashboard/ai-chat');

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 4);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            className={cn(
                'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-canvas/85 px-2 backdrop-blur-md md:px-4 lg:px-6',
                scrolled ? 'border-border-subtle' : 'border-transparent',
            )}
        >
            <Button variant="ghost" iconOnly icon={Menu} aria-label="Open navigation" onClick={() => setNavOpen(true)} className="size-11 md:hidden" />
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-1.5 text-body-sm">
                    {crumbs.map((c, i) => {
                        const last = i === crumbs.length - 1;
                        return (
                            <li key={`${c.label}-${i}`} className={cn('flex min-w-0 items-center gap-1.5', !last && 'max-md:hidden')}>
                                {i > 0 ? <span aria-hidden className="text-fg-faint max-md:hidden">/</span> : null}
                                {c.href && !last ? (
                                    <Link href={c.href} className="truncate text-fg-muted hover:text-fg">{c.label}</Link>
                                ) : (
                                    <span aria-current={last ? 'page' : undefined} className={cn('truncate', last ? 'font-medium text-fg' : 'text-fg-muted')}>{c.label}</span>
                                )}
                            </li>
                        );
                    })}
                </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-1 md:gap-2">
                <Tooltip content="Search ⌘K">
                    <Button variant="ghost" iconOnly icon={Search} aria-label="Search" onClick={openCommandPalette} />
                </Tooltip>
                {/* One Ask AI per screen: pages whose header has its own (site pages) hide this one. */}
                {onAsk || pageAsk ? null : (
                    <Button asChild variant="secondary" size="sm" icon={Sparkles} className="max-sm:hidden">
                        <Link href="/dashboard/ask">Ask AI</Link>
                    </Button>
                )}
                <AlertsBell />
            </div>
            <CommandPalette />
        </header>
    );
}
