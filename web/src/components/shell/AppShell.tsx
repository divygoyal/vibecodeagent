'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useAppTheme } from '@/lib/theme';
import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceIncompleteBanner from '@/components/WorkspaceIncompleteBanner';
import { Button } from '@/components/ui/Button';
import { useHideChatWidget } from '@/components/ui/useHideChatWidget';
import { BrandMark, Wordmark } from './BrandMark';
import { MobileTabBar } from './MobileTabBar';
import { PageSkeleton } from './PageSkeleton';
import { hidesMobileTabBar } from './nav';
import { ShellProvider, useShell } from './ShellContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { WorkspaceProvider } from './WorkspaceProvider';
import { useWorkspace } from './workspaceContext';

const CreditWelcome = dynamic(() => import('@/components/CreditWelcome'), { ssr: false });

function useGoShortcuts() {
    const { setSwitcherOpen, collapsed, setCollapsed } = useShell();
    useEffect(() => {
        let gAt = 0;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
            if (e.key === 'g') {
                gAt = Date.now();
                return;
            }
            if (e.key === 's' && Date.now() - gAt < 1000) {
                e.preventDefault();
                if (collapsed && window.matchMedia('(min-width: 1024px)').matches) setCollapsed(false);
                setSwitcherOpen(true);
            }
            gAt = 0;
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [setSwitcherOpen, collapsed, setCollapsed]);
}

function NavDrawer() {
    const { navOpen, setNavOpen } = useShell();
    const pathname = usePathname();
    useHideChatWidget(navOpen);
    useEffect(() => {
        setNavOpen(false);
    }, [pathname, setNavOpen]);
    return (
        <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-60 bg-overlay animate-fade-in lg:hidden" />
                <Dialog.Content
                    aria-describedby={undefined}
                    className="tc-root fixed inset-y-0 left-0 z-60 w-[86vw] max-w-[320px] bg-surface text-fg shadow-modal outline-none animate-drawer-in-left lg:hidden"
                >
                    <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                    <Dialog.Close asChild>
                        <Button variant="ghost" iconOnly icon={X} aria-label="Close navigation" className="absolute top-2.5 right-2 z-10" />
                    </Dialog.Close>
                    <Sidebar inDrawer onNavigate={() => setNavOpen(false)} />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function Welcome() {
    const { isWorkspaceLoaded, welcomeSeen, markWelcomeSeen } = useWorkspace();
    if (!isWorkspaceLoaded || welcomeSeen) return null;
    return <CreditWelcome credits={5} onDismiss={markWelcomeSeen} />;
}

function ShellBody({ children }: { children: ReactNode }) {
    const pathname = usePathname() ?? '';
    const { collapsed } = useShell();
    useAppTheme();
    useGoShortcuts();
    const noTabBar = hidesMobileTabBar(pathname);
    const isSetup = pathname.startsWith('/dashboard/setup');

    const content = (
        <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
                {!isSetup ? <WorkspaceIncompleteBanner className="mb-4" /> : null}
                {children}
            </Suspense>
        </ErrorBoundary>
    );

    // Setup is a focused layout: logo + "Exit setup", no sidebar (DESIGN 5.3).
    if (isSetup) {
        return (
            <div className="tc-root tc-app min-h-dvh bg-canvas text-fg">
                <header className="flex h-14 items-center justify-between px-4 md:px-6">
                    <Link href="/dashboard" className="flex items-center gap-2"><BrandMark size={24} /><Wordmark /></Link>
                    <Button asChild variant="ghost" size="sm"><Link href="/dashboard">Exit setup</Link></Button>
                </header>
                <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 pb-10 md:px-6">{content}</main>
            </div>
        );
    }

    return (
        <div className="tc-root tc-app flex min-h-dvh bg-canvas text-fg">
            {/* The aside is a full-height column (its surface and border run the
                whole page, also in full-page screenshots); the sidebar inside it
                sticks to the viewport and scrolls on its own. */}
            <aside
                className={cn(
                    'relative z-40 hidden shrink-0 self-stretch border-r border-border-subtle bg-surface md:block',
                    'md:w-16',
                    collapsed ? 'lg:w-16' : 'lg:w-[248px]',
                )}
            >
                <div className="sticky top-0 h-dvh overflow-hidden">
                    <div className="h-full lg:hidden"><Sidebar collapsed localSwitcher /></div>
                    <div className="hidden h-full lg:block"><Sidebar collapsed={collapsed} /></div>
                </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar />
                <main
                    id="main-content"
                    className={cn('flex-1 px-4 pt-4 md:px-6 md:pt-6 md:pb-10', noTabBar ? 'pb-6' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]')}
                >
                    <div className="mx-auto w-full max-w-[1440px]">{content}</div>
                </main>
            </div>
            <NavDrawer />
            {noTabBar ? null : <MobileTabBar />}
            <Welcome />
        </div>
    );
}

/**
 * The signed-in app frame (DESIGN 3.1): sidebar (248px, 64px rail on tablets
 * or when collapsed), sticky topbar with breadcrumb, mobile drawer + bottom tab
 * bar. Provides the workspace, the URL-state adapter and the theme.
 * Mounted by app/(dashboard)/dashboard/layout.tsx.
 */
export function AppShell({ children }: { children: ReactNode }) {
    return (
        <NuqsAdapter>
            <WorkspaceProvider>
                <ShellProvider>
                    <ShellBody>{children}</ShellBody>
                </ShellProvider>
            </WorkspaceProvider>
        </NuqsAdapter>
    );
}
