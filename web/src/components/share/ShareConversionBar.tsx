'use client';

/**
 * Slim conversion bar shown at the top of public /share/[token] dashboards.
 *
 * Goal: convert viewers of a TrafficClaw-powered shared dashboard into
 * signups. The SharePromoPopup is the active interrupt (fires after 20s
 * or on exit-intent); this bar is the passive ambient surface — visible
 * on landing, captures users who would otherwise leave before the popup
 * has a chance to fire.
 *
 * Lives in normal document flow at the top of the page (not sticky):
 *  - Visible on initial render — caught even by bouncers
 *  - Scrolls out of view as the viewer engages with the dashboard
 *  - Returns on scroll-up if they revisit the top
 *
 * Suppressed for: customer iframes (?embed=true) and our own marketing-
 * site iframes (?_b=<sig> via shareWatermark HMAC). Both gates are
 * enforced by the caller in page.tsx.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

interface ShareConversionBarProps {
    /** CTA destination — defaults to marketing home with UTM so this surface is attributable. */
    ctaUrl?: string;
}

// sessionStorage flag: dismissals scoped to this tab session. A returning
// viewer in a fresh tab gets a fresh chance — consistent with SharePromoPopup.
const DISMISS_KEY = 'tc-share-cta-bar-dismissed';

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
    } catch { /* private mode — non-fatal */ }
}

function trackClarity(name: string, payload?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    try {
        const clarity = (window as { clarity?: (...args: unknown[]) => void }).clarity;
        clarity?.('event', name, payload);
    } catch { /* clarity not loaded — best-effort only */ }
}

export default function ShareConversionBar({
    ctaUrl = 'https://trafficclaw.com/?utm_source=share-bar&utm_medium=embed&utm_campaign=viewer-conversion',
}: ShareConversionBarProps) {
    // Render visible by default so SSR delivers a non-empty bar; the client
    // immediately hides it on mount if the viewer already dismissed it this
    // session. Brief flash on dismissed-returning-viewer is acceptable and
    // matches SharePromoPopup behaviour.
    const [visible, setVisible] = useState(true);
    const impressionFiredRef = useRef(false);

    useEffect(() => {
        if (isAlreadyDismissed()) {
            setVisible(false);
            return;
        }
        if (impressionFiredRef.current) return;
        impressionFiredRef.current = true;
        trackClarity('share-cta-bar-shown');
    }, []);

    if (!visible) return null;

    const handleCtaClick = () => {
        markDismissed();
        trackClarity('share-cta-bar-clicked');
        // Don't manually setVisible(false) — link is target=_blank and the
        // viewer remains on the page. Marking dismissed prevents the bar
        // from re-appearing on a soft navigation back.
    };

    const handleDismiss = () => {
        markDismissed();
        trackClarity('share-cta-bar-dismissed');
        setVisible(false);
    };

    return (
        <div className="relative w-full border-b border-white/[0.06] bg-gradient-to-r from-[#0a0d12] via-[#0d1218] to-[#0a0d12]">
            {/* Subtle cyan accent line at top — visually anchors as TrafficClaw branding without shouting */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#14C4E1]/40 to-transparent"
            />
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
                <div className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-300">
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-[#7AD9DA]" />
                    <span className="truncate">
                        Like this dashboard?{' '}
                        <span className="hidden text-zinc-500 sm:inline">Built on TrafficClaw — </span>
                        <span className="font-medium text-white">build yours free.</span>
                    </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                    <a
                        href={ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleCtaClick}
                        className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#14C4E1] to-[#0891B2] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(20,196,225,0.5)] transition hover:from-[#22d3ee] hover:to-[#14C4E1]"
                    >
                        <span>Try free</span>
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </a>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        aria-label="Dismiss"
                        className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
