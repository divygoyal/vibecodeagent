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

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, X } from 'lucide-react';

import { Button, buttonClasses } from '@/components/ui/Button';
import { BrandMark } from '@/components/shell/BrandMark';

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

const subscribeNever = () => () => {};

function trackClarity(name: string, payload?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    try {
        const clarity = (window as { clarity?: (...args: unknown[]) => void }).clarity;
        clarity?.('event', name, payload);
    } catch { /* clarity not loaded — best-effort only */ }
}

export default function ShareConversionBar({
    ctaUrl = 'https://trafficclaw.com/?ref=share&utm_source=share-bar&utm_medium=embed&utm_campaign=viewer-conversion',
}: ShareConversionBarProps) {
    // The server renders the bar; the browser hides it when the viewer already
    // dismissed it this session (read from sessionStorage, no effect needed).
    const dismissedEarlier = useSyncExternalStore(subscribeNever, isAlreadyDismissed, () => false);
    const [dismissedNow, setDismissedNow] = useState(false);
    const impressionFiredRef = useRef(false);

    useEffect(() => {
        if (dismissedEarlier || impressionFiredRef.current) return;
        impressionFiredRef.current = true;
        trackClarity('share-cta-bar-shown');
    }, [dismissedEarlier]);

    if (dismissedEarlier || dismissedNow) return null;

    const handleCtaClick = () => {
        markDismissed();
        trackClarity('share-cta-bar-clicked');
        // Don't hide the bar here: the link is target=_blank and the
        // viewer remains on the page. Marking dismissed prevents the bar
        // from re-appearing on a soft navigation back.
    };

    const handleDismiss = () => {
        markDismissed();
        trackClarity('share-cta-bar-dismissed');
        setDismissedNow(true);
    };

    return (
        <div className="tc-root w-full border-b border-border-subtle bg-surface">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 md:px-6">
                <div className="flex min-w-0 items-center gap-2 text-body-sm text-fg-secondary">
                    <BrandMark size={16} />
                    <span className="truncate">
                        Like this dashboard?{' '}
                        <span className="text-fg-muted max-sm:hidden">Built on TrafficClaw. </span>
                        <span className="font-medium text-fg">Build yours free.</span>
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <a
                        href={ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleCtaClick}
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                    >
                        Try free
                        <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </a>
                    <Button variant="ghost" size="sm" iconOnly icon={X} onClick={handleDismiss} aria-label="Dismiss" />
                </div>
            </div>
        </div>
    );
}
