'use client';

/**
 * Promo popup shown to viewers of a public /share/[token] dashboard.
 *
 * Goal: convert someone seeing a TrafficClaw-powered shared dashboard
 * (e.g. a customer's clients) into a TrafficClaw signup. Pitches the
 * product's biggest hooks — AI chat, realtime globe, branded share
 * dashboards, auto-detected SEO opportunities — and routes them to the
 * marketing home page.
 *
 * Only mounted in the share view (mode === 'share' && !isEmbeddedShare).
 * Not rendered in iframes/embeds — would feel intrusive there.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { LogoIcon } from '@/components/Logo';

interface SharePromoPopupProps {
    /** Force open immediately on mount (preview / debug). */
    initialOpen?: boolean;
    /** Auto-open after this many ms once the viewer has had a chance to
     *  engage with the dashboard. Ignored when initialOpen is true.
     *  Exit-intent (mouse leaves the top of the viewport) also triggers
     *  the popup — whichever fires first wins. */
    autoOpenDelayMs?: number;
    /** CTA destination — defaults to the marketing home page with utm so
     *  conversions from this surface are attributable in analytics. */
    ctaUrl?: string;
}

// sessionStorage flag: once the viewer dismisses (X / Esc / backdrop) OR clicks
// the CTA, suppress the popup for the rest of their tab session. Persisting
// across the tab close is too aggressive — most share-view visitors are
// one-time anyway, and a returning viewer in a fresh tab gets a fresh chance.
const DISMISS_KEY = 'tc-share-popup-dismissed';

function isAlreadyDismissed(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch { return false; }
}

function markDismissed(): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch { /* sessionStorage blocked (private mode) — non-fatal */ }
}

// Clarity event helper — Microsoft Clarity is already wired in app/layout.tsx.
// Fires impression / cta-click / dismissed events so we can measure CTR on the
// popup once it ships and iterate from real data, not gut feel.
function trackClarity(name: string, payload?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    try {
        const clarity = (window as { clarity?: (...args: unknown[]) => void }).clarity;
        clarity?.('event', name, payload);
    } catch { /* clarity not loaded — best-effort only */ }
}

export default function SharePromoPopup({
    initialOpen = false,
    autoOpenDelayMs = 0,
    ctaUrl = 'https://trafficclaw.com/?utm_source=share-popup&utm_medium=embed&utm_campaign=viewer-conversion',
}: SharePromoPopupProps) {
    const [open, setOpen] = useState(initialOpen);
    // Guard against double-firing the impression event in React StrictMode dev
    // re-runs and in production when the parent re-renders during open.
    const impressionFiredRef = useRef(false);
    // Tracks which trigger opened the popup — sent with the impression event
    // so we can compare conversion lift between timer and exit-intent paths.
    const openTriggerRef = useRef<'timer' | 'exit-intent' | 'initial' | null>(
        initialOpen ? 'initial' : null,
    );

    // Auto-open: timer OR exit-intent, whichever fires first. Both gated by
    // the session-dismissed flag so a viewer who closed the popup once isn't
    // pestered again on scroll or tab-switch.
    useEffect(() => {
        if (initialOpen || autoOpenDelayMs <= 0) return;
        if (isAlreadyDismissed()) return;

        let fired = false;
        const fire = (trigger: 'timer' | 'exit-intent') => {
            if (fired) return;
            fired = true;
            openTriggerRef.current = trigger;
            setOpen(true);
        };

        const timer = window.setTimeout(() => fire('timer'), autoOpenDelayMs);

        // Exit-intent: viewer's cursor leaves the viewport via the TOP edge
        // (clientY <= 0). That's the canonical signal for "about to switch
        // tab / close window / hit the URL bar" — i.e. about to leave. Other
        // mouse-leaves (sides, bottom) don't predict departure and are noisy
        // on multi-monitor setups, so we filter to top-only.
        // Mobile has no equivalent native signal; the timer still catches
        // mobile viewers on its own.
        const handleMouseLeave = (e: MouseEvent) => {
            if (e.clientY <= 0) fire('exit-intent');
        };
        document.documentElement.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            window.clearTimeout(timer);
            document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [initialOpen, autoOpenDelayMs]);

    // Fire impression once when the popup actually becomes visible.
    useEffect(() => {
        if (!open || impressionFiredRef.current) return;
        impressionFiredRef.current = true;
        trackClarity('share-popup-shown', { trigger: openTriggerRef.current });
    }, [open]);

    // Close on Escape — standard modal behaviour, no library needed.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                markDismissed();
                trackClarity('share-popup-dismissed', { reason: 'esc' });
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const handleBackdrop = () => {
        markDismissed();
        trackClarity('share-popup-dismissed', { reason: 'backdrop' });
        setOpen(false);
    };

    const handleCloseButton = () => {
        markDismissed();
        trackClarity('share-popup-dismissed', { reason: 'x-button' });
        setOpen(false);
    };

    const handleCtaClick = () => {
        markDismissed();
        trackClarity('share-popup-cta-clicked');
    };

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
                    onClick={handleBackdrop}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Try TrafficClaw"
                >
                    <motion.div
                        key="modal"
                        initial={{ opacity: 0, y: 14, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.97 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0d12] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]"
                    >
                        {/* Cyan glow behind the header for the premium "lit-from-within" feel */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-64 w-72 rounded-full bg-[radial-gradient(circle,_rgba(20,196,225,0.42)_0%,_transparent_70%)] blur-3xl"
                        />
                        {/* Subtle highlight border at top — emphasises the rim */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.18] to-transparent"
                        />

                        {/* X close: zinc-700 was too low-contrast against the
                            #0a0d12 background — viewers couldn't find it. Bumped
                            to zinc-500 + a subtle background pill so it reads as
                            a button without becoming a click-magnet. Esc and
                            backdrop still work as redundant exits. */}
                        <button
                            type="button"
                            onClick={handleCloseButton}
                            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-zinc-500 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.1] hover:text-zinc-100 hover:ring-white/[0.12]"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <div className="relative px-7 pb-7 pt-8">
                            <div className="mb-6 flex items-center gap-2">
                                <LogoIcon size={28} />
                                <span className="text-base font-bold tracking-tight">
                                    <span className="text-white">Traffic</span>
                                    <span className="text-[#7AD9DA]">Claw</span>
                                </span>
                            </div>

                            <h2 className="mb-2 text-[26px] font-bold leading-[1.18] tracking-tight text-white sm:text-[28px]">
                                Like this dashboard?{' '}
                                <span className="bg-gradient-to-r from-[#14C4E1] to-[#7AD9DA] bg-clip-text text-transparent">
                                    Build yours.
                                </span>
                            </h2>
                            {/* Subhead now does two jobs: tells them setup is trivial
                                (first two sentences) AND introduces the AI chat as the
                                payoff (third sentence). Without the third sentence, the
                                demo card below feels orphaned — the viewer is sold a
                                "dashboard" then surprised by a chat exchange they didn't
                                know was part of it. */}
                            <p className="mb-5 text-sm leading-relaxed text-zinc-400">
                                60 seconds. Connect Google.{' '}
                                <span className="text-zinc-200">Then just ask:</span>
                            </p>

                            {/* Visualises the AI chat with a concrete example. The
                                "Then ask it anything:" line above leads directly into
                                this exchange, so the eyebrow inside the card would
                                just repeat itself — dropped in favour of cleaner
                                question + answer layout that reads as a continuation
                                of the sentence above. */}
                            <div className="mb-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <div className="flex items-start gap-2.5">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                                    <div className="text-[13px] leading-relaxed">
                                        <div className="text-zinc-100">&ldquo;Why did traffic drop last week?&rdquo;</div>
                                        <div className="mt-1.5 text-zinc-400">
                                            <span className="text-cyan-300/70">→ </span>
                                            /blog/seo-guide lost 1,240 sessions after Aug 14.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <a
                                href={ctaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={handleCtaClick}
                                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[#14C4E1] to-[#0891B2] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_-10px_rgba(20,196,225,0.45)] transition hover:from-[#22d3ee] hover:to-[#14C4E1]"
                            >
                                <span>Build mine free</span>
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </a>

                            <p className="mt-3 text-center text-[11px] text-zinc-600">
                                Free · No credit card · 10 free AI questions
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
