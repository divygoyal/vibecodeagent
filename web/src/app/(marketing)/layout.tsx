'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { ArrowRight, Menu, X } from 'lucide-react';

import GoogleAuthButton from '@/components/marketing/GoogleAuthButton';

function GoogleGMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 18 18" aria-hidden="true" className={className}>
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.16.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.33l2.57-2.57C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
    );
}

function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();
    const pathname = usePathname();

    const isHomepage = pathname === '/';
    const isPublicMentionsRoute = pathname === '/x' || pathname === '/reddit';
    const dashboardHref = pathname === '/reddit' ? '/dashboard/reddit-api' : '/dashboard/x-api';
    const resolvedDashboardHref = isPublicMentionsRoute ? dashboardHref : '/dashboard';
    const resolvedPrimaryLabel = isPublicMentionsRoute ? 'Open builder' : isHomepage ? 'Start with Google' : 'Start Free';
    const resolvedSessionLabel = isPublicMentionsRoute ? 'Open builder' : 'Dashboard';
    const publicMentionsCtaClassName =
        'inline-flex min-h-[42px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium text-zinc-100 transition hover:border-white/[0.14] hover:bg-white/[0.06]';
    const publicMentionsSignInClassName =
        'px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-white';
    const defaultCtaClassName =
        'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#14C4E1]/24 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 text-sm font-semibold text-[#031017] transition hover:brightness-105';

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 18);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    const navLinks = isPublicMentionsRoute
        ? []
        : [
            { label: 'Dashboard', href: '/#dashboard' },
            { label: 'AI Chat', href: '/#ai-chat' },
            { label: 'Globe', href: '/#globe' },
            { label: 'Mentions', href: '/#mentions' },
            { label: 'Proof', href: '/#proof' },
        ];

    return (
        <nav
            role="navigation"
            aria-label="Main navigation"
            className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
                scrolled
                    ? 'border-b border-white/[0.06] bg-[#04070d]/88 backdrop-blur-2xl'
                    : 'bg-transparent'
            }`}
        >
            <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2.5">
                    <Image src="/icon.svg" alt="TrafficClaw" width={32} height={32} className="rounded-lg" />
                    <span className="text-lg font-bold tracking-tight text-white">
                        Traffic<span className="text-[#7AD9DA]">Claw</span>
                    </span>
                </Link>

                <div className="hidden items-center gap-8 md:flex">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="text-sm text-zinc-400 transition-colors hover:text-white"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                <div className="hidden items-center gap-3 md:flex">
                    {session ? (
                        <Link
                            href={resolvedDashboardHref}
                            className={isPublicMentionsRoute ? publicMentionsCtaClassName : defaultCtaClassName}
                        >
                            {resolvedSessionLabel}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    ) : (
                        isPublicMentionsRoute ? (
                            <GoogleAuthButton
                                callbackUrl={resolvedDashboardHref}
                                className={publicMentionsCtaClassName}
                            >
                                {resolvedPrimaryLabel}
                                <ArrowRight className="h-4 w-4" />
                            </GoogleAuthButton>
                        ) : (
                            <>
                                <button
                                    onClick={() => signIn('google', { callbackUrl: resolvedDashboardHref })}
                                    className="px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
                                >
                                    Sign In
                                </button>
                                <GoogleAuthButton
                                    callbackUrl={resolvedDashboardHref}
                                    className={defaultCtaClassName}
                                >
                                    {isHomepage ? <GoogleGMark className="h-4 w-4 shrink-0" /> : null}
                                    {resolvedPrimaryLabel}
                                    <ArrowRight className="h-4 w-4" />
                                </GoogleAuthButton>
                            </>
                        )
                    )}
                </div>

                {isPublicMentionsRoute ? (
                    session ? (
                        <Link
                            href={resolvedDashboardHref}
                            className={`${publicMentionsCtaClassName} md:hidden`}
                        >
                            {resolvedSessionLabel}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    ) : (
                        <div className="flex items-center gap-1.5 md:hidden">
                            <button
                                onClick={() => signIn('google', { callbackUrl: resolvedDashboardHref })}
                                className={publicMentionsSignInClassName}
                            >
                                Sign In
                            </button>
                            <GoogleAuthButton
                                callbackUrl={resolvedDashboardHref}
                                className={publicMentionsCtaClassName}
                            >
                                {resolvedPrimaryLabel}
                                <ArrowRight className="h-4 w-4" />
                            </GoogleAuthButton>
                        </div>
                    )
                ) : (
                    <button
                        className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
                        onClick={() => setMobileOpen((open) => !open)}
                        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileOpen}
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                )}
            </div>

            {!isPublicMentionsRoute && mobileOpen ? (
                <div className="border-b border-white/[0.04] bg-[#03060c]/96 backdrop-blur-2xl md:hidden">
                    <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className="text-sm text-zinc-300 transition-colors hover:text-white"
                            >
                                {link.label}
                            </a>
                        ))}
                        {session ? (
                            <Link
                                href={resolvedDashboardHref}
                                onClick={() => setMobileOpen(false)}
                                className={`${defaultCtaClassName} mt-2 min-h-[46px] justify-center`}
                            >
                                {resolvedSessionLabel}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        setMobileOpen(false);
                                        void signIn('google', { callbackUrl: resolvedDashboardHref });
                                    }}
                                    className="text-left text-sm text-zinc-300 transition-colors hover:text-white"
                                >
                                    Sign In
                                </button>
                                <GoogleAuthButton
                                    callbackUrl={resolvedDashboardHref}
                                    onClick={() => setMobileOpen(false)}
                                    className={`${defaultCtaClassName} mt-2 min-h-[46px] justify-center`}
                                >
                                    {isHomepage ? <GoogleGMark className="h-4 w-4 shrink-0" /> : null}
                                    {resolvedPrimaryLabel}
                                    <ArrowRight className="h-4 w-4" />
                                </GoogleAuthButton>
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </nav>
    );
}

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen overflow-x-hidden bg-black text-white">
            <Navbar />
            <main id="main-content" className="overflow-x-hidden">
                {children}
            </main>
        </div>
    );
}
