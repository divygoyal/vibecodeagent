'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { ArrowRight, Menu, X } from 'lucide-react';

import { MARKETING_SIGN_IN_URL } from '@/components/marketing/home/content';

function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 18);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    const navLinks = [
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
                            href="/dashboard"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#14C4E1]/24 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 text-sm font-semibold text-[#031017] transition hover:brightness-105"
                        >
                            Dashboard
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    ) : (
                        <>
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
                            >
                                Sign In
                            </button>
                            <Link
                                href={MARKETING_SIGN_IN_URL}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#14C4E1]/24 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 text-sm font-semibold text-[#031017] transition hover:brightness-105"
                            >
                                Start Free
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </>
                    )}
                </div>

                <button
                    className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
                    onClick={() => setMobileOpen((open) => !open)}
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
            </div>

            {mobileOpen ? (
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
                        <Link
                            href={MARKETING_SIGN_IN_URL}
                            onClick={() => setMobileOpen(false)}
                            className="mt-2 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-[#14C4E1]/24 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-4 text-sm font-semibold text-[#031017]"
                        >
                            Start Free
                            <ArrowRight className="h-4 w-4" />
                        </Link>
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
