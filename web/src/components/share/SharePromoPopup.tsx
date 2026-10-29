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
import { Button, buttonClasses } from '@/components/ui/Button';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

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
    ctaUrl = 'https://trafficclaw.com/?ref=share&utm_source=share-popup&utm_medium=embed&utm_campaign=viewer-conversion',
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
                    transition={{ duration: 0.18 }}
                    className="tc-root fixed inset-0 z-[100] flex items-end justify-center bg-overlay p-4 sm:items-center"
                    onClick={handleBackdrop}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="share-promo-title"
                >
                    <motion.div
                        key="modal"
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md overflow-hidden rounded-modal border border-border-subtle bg-surface-raised text-fg shadow-modal"
                    >
                        <Button
                            variant="ghost"
                            iconOnly
                            icon={X}
                            onClick={handleCloseButton}
                            aria-label="Close"
                            className="absolute top-3 right-3 z-10"
                        />

                        <div className="px-6 pt-6 pb-6">
                            <div className="mb-5 flex items-center gap-2">
                                <BrandMark size={24} />
                                <Wordmark />
                            </div>

                            <h2 id="share-promo-title" className="mb-1.5 text-heading text-fg">
                                Like this dashboard? Build yours.
                            </h2>
                            <p className="mb-4 text-body text-fg-muted">
                                60 seconds. Connect Google. Then just ask:
                            </p>

                            {/* A concrete example of asking the AI about your own numbers. */}
                            <div className="mb-6 rounded-control border border-border-subtle bg-surface-sunken p-4">
                                <div className="flex items-start gap-2.5">
                                    <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
                                    <div className="text-body-sm">
                                        <div className="text-fg">&ldquo;Why did traffic drop last week?&rdquo;</div>
                                        <div className="mt-1.5 text-fg-secondary">
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
                                className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}
                            >
                                Build mine free
                                <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
                            </a>

                            <p className="mt-3 text-center text-meta text-fg-muted">
                                Free · No credit card · 5 free AI questions
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
