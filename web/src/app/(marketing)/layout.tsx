'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import Image from 'next/image';
import { Menu, X, Tag, Copy, Check } from 'lucide-react';

function DiscountBanner() {
    const [dismissed, setDismissed] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && sessionStorage.getItem('discount-banner-dismissed')) {
            setDismissed(true);
        }
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem('discount-banner-dismissed', 'true');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText('NEWBEE20');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (dismissed) return null;

    return (
        <div className="relative z-[60] bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-500 text-black">
            <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium">
                <Tag className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">New here? Get <strong>20% off</strong> your first month!</span>
                <span className="sm:hidden"><strong>20% off</strong> for new users!</span>
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/20 hover:bg-black/30 transition-colors font-mono font-bold text-xs tracking-wider cursor-pointer"
                >
                    NEWBEE20
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                <Link href="/pricing" className="hidden sm:inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline font-semibold text-xs">
                    View plans →
                </Link>
                <button
                    onClick={handleDismiss}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/10 transition-colors cursor-pointer"
                    aria-label="Dismiss banner"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    const navLinks = [
        { label: 'AI Demo', href: '/#ai-demo' },
        { label: 'Features', href: '/features' },
        { label: 'Pricing', href: '/pricing' },
    ];

    return (
        <motion.nav
            role="navigation"
            aria-label="Main navigation"
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                ? 'bg-black/80 backdrop-blur-xl border-b border-white/[0.04]'
                : 'bg-transparent'
                }`}
        >
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5 group">
                    <Image src="/icon.svg" alt="TrafficClaw" width={32} height={32} className="rounded-lg" />
                    <span className="text-lg font-bold text-white tracking-tight">
                        Traffic<span className="text-emerald-400">Claw</span>
                    </span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="text-sm text-zinc-400 hover:text-white transition-colors duration-200"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                {/* CTA */}
                <div className="hidden md:flex items-center gap-3">
                    {session ? (
                        <Link
                            href="/dashboard"
                            className="px-4 py-2 text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-lg hover:opacity-90 transition-opacity"
                        >
                            Dashboard →
                        </Link>
                    ) : (
                        <>
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="px-4 py-2 text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-lg hover:opacity-90 transition-opacity"
                            >
                                Start Free
                            </button>
                        </>
                    )}
                </div>

                {/* Mobile toggle */}
                <button
                    className="md:hidden text-zinc-400 p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Mobile menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-black/95 backdrop-blur-xl border-b border-white/[0.04]"
                    >
                        <div className="px-6 py-4 flex flex-col gap-4">
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                                className="mt-2 px-4 py-2.5 text-sm font-medium text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-lg text-center"
                            >
                                Start Free
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black text-white overflow-x-hidden">
            <DiscountBanner />
            <Navbar />
            <main id="main-content">
                {children}
            </main>
        </div>
    );
}
