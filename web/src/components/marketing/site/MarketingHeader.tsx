'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Menu } from 'lucide-react';

import { Button, Drawer } from '@/components/ui';
import { cn } from '@/lib/cn';
import { HomeThemeToggle } from '@/components/marketing/home/HomeThemeToggle';
import { BrandMark } from './BrandMark';
import { ConnectGoogleButton } from './ConnectGoogleButton';
import { HEADER_NAV, SIGN_IN_CALLBACK } from './nav';

function isActive(pathname: string, href: string): boolean {
    if (href.startsWith('/#')) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
}

function SignInButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
    const [loading, setLoading] = useState(false);
    return (
        <Button
            variant="ghost"
            loading={loading}
            className={className}
            onClick={() => {
                setLoading(true);
                onNavigate?.();
                const raw = new URLSearchParams(window.location.search).get('callbackUrl');
                const callbackUrl = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : SIGN_IN_CALLBACK;
                void signIn('google', { callbackUrl }).catch(() => setLoading(false));
            }}
        >
            Sign in
        </Button>
    );
}

/** Sticky white top bar (DESIGN 5.16): full nav from xl, a drawer menu below that. */
export function MarketingHeader() {
    const pathname = usePathname() || '/';
    const { status } = useSession();
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 4);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const signedIn = status === 'authenticated';

    return (
        <header
            className={cn(
                'sticky top-0 z-30 border-b bg-surface transition-[border-color] duration-120',
                scrolled ? 'border-border-subtle' : 'border-transparent',
            )}
        >
            <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-6">
                <BrandMark />

                <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-0.5 xl:flex">
                    {HEADER_NAV.map((link) => {
                        const active = isActive(pathname, link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'rounded-control px-2.5 py-2 text-body font-medium whitespace-nowrap transition-colors duration-120',
                                    active ? 'text-fg' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                                )}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="ml-auto flex items-center gap-2 xl:ml-0">
                    {/* Only the home page follows the visitor's theme; the rest of the marketing site stays light. */}
                    {pathname === '/' ? <HomeThemeToggle /> : null}
                    {signedIn ? null : <span className="hidden sm:block"><SignInButton /></span>}
                    <span className="hidden md:block"><ConnectGoogleButton size="md" mark /></span>
                    <span className="xl:hidden">
                        <Button variant="ghost" iconOnly icon={Menu} aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} />
                    </span>
                </div>
            </div>

            <Drawer
                open={open}
                onOpenChange={setOpen}
                title="Menu"
                className="xl:hidden"
                footer={
                    <div className="flex flex-col gap-2">
                        <ConnectGoogleButton size="lg" mark className="w-full" onNavigate={() => setOpen(false)} />
                        {signedIn ? null : <SignInButton className="w-full" onNavigate={() => setOpen(false)} />}
                    </div>
                }
            >
                <nav aria-label="Main" className="-mx-2 flex flex-col">
                    {HEADER_NAV.map((link) => {
                        const active = isActive(pathname, link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setOpen(false)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex h-12 items-center rounded-control px-3 text-body-lg font-medium',
                                    active ? 'bg-brand-soft text-brand-soft-fg' : 'text-fg hover:bg-subtle',
                                )}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                    <div className="my-2 h-px bg-border-subtle" />
                    {[
                        { label: 'About', href: '/about' },
                        { label: 'Contact', href: '/contact' },
                    ].map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="flex h-11 items-center rounded-control px-3 text-body text-fg-secondary hover:bg-subtle hover:text-fg"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
            </Drawer>
        </header>
    );
}
