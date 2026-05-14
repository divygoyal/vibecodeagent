'use client';

import { useEffect, useMemo, useState } from 'react';
import { Github, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    detectIntent,
    dismissProvider as persistDismiss,
    isDismissed as readDismissed,
    type IntentProvider,
} from '@/lib/connectorIntent';

interface ConnectorIntentNudgeProps {
    /** Live chat-input text — the nudge keyword-matches against this. */
    input: string;
    /** Connection state from the parent. ga4/gsc both ride on Google OAuth, so
     *  we expose a unified `google` flag and derive the provider-level
     *  "connected" check below. */
    githubConnected: boolean;
    googleConnected: boolean;
    /** Suppress the nudge while assistant is streaming or when GA4 access is
     *  locked (a different, bigger ask). */
    disabled?: boolean;
    /** Parent opens the existing ConnectorCard popover for that provider. */
    onConnect: (provider: IntentProvider) => void;
}

const PROVIDER_LABEL: Record<IntentProvider, string> = {
    github: 'GitHub',
    ga4: 'Google Analytics',
    gsc: 'Search Console',
};

const PROVIDER_BLURB: Record<IntentProvider, string> = {
    github: 'to use your repo as context',
    ga4: 'for full GA4 traffic data',
    gsc: 'for keyword & ranking data',
};

function ProviderGlyph({ provider }: { provider: IntentProvider }) {
    if (provider === 'github') {
        return <Github className="h-3.5 w-3.5" />;
    }
    if (provider === 'ga4') {
        return (
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <rect x="4" y="11" width="4" height="9" rx="1.5" fill="#F9AB00" />
                <rect x="10" y="7" width="4" height="13" rx="1.5" fill="#F9AB00" opacity="0.85" />
                <rect x="16" y="3" width="4" height="17" rx="1.5" fill="#E37400" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="14.5" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="m16 15.5 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

/**
 * Slim contextual pill that surfaces above the chat input when the user is
 * typing about something a connector would unlock — and that connector isn't
 * already connected. Built for the post-first-message state where the
 * empty-state connector strip is no longer visible.
 *
 * Lifecycle:
 *   - 250ms debounce on input changes so the nudge doesn't flicker per keystroke
 *   - Only renders if (a) the top-scoring provider isn't connected and
 *                     (b) the user hasn't dismissed it this session
 *   - Dismissal is per-provider, per-session (sessionStorage); a different
 *     provider's nudge can still appear later in the same chat
 *   - `disabled` suppresses entirely (used while assistant is streaming and
 *     during GA4 lock state)
 */
export function ConnectorIntentNudge({
    input,
    githubConnected,
    googleConnected,
    disabled = false,
    onConnect,
}: ConnectorIntentNudgeProps) {
    // Debounce the input — recompute detection ~250ms after typing pauses.
    const [debounced, setDebounced] = useState(input);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(input), 250);
        return () => clearTimeout(t);
    }, [input]);

    // Re-read sessionStorage on mount so SSR-then-hydrate doesn't flash an
    // already-dismissed nudge. We do this once per provider in a single state
    // bag and merge in client-side dismissals via setDismissed.
    const [dismissedTick, setDismissedTick] = useState(0);

    const intent = useMemo(() => detectIntent(debounced), [debounced]);

    const isConnected = (p: IntentProvider): boolean => {
        if (p === 'github') return githubConnected;
        return googleConnected; // ga4 + gsc both ride Google OAuth
    };

    // Visible iff: there IS a detected intent, that provider is not connected,
    // not dismissed, and the parent hasn't disabled us. dismissedTick is read
    // here so React re-renders after a dismiss without us tracking state
    // explicitly per provider.
    const visibleProvider: IntentProvider | null = (() => {
        if (disabled || !intent) return null;
        if (isConnected(intent.provider)) return null;
        // referencing dismissedTick so React tracks the dependency
        if (dismissedTick !== undefined && readDismissed(intent.provider)) return null;
        return intent.provider;
    })();

    const handleDismiss = () => {
        if (!visibleProvider) return;
        persistDismiss(visibleProvider);
        setDismissedTick(t => t + 1);
    };

    return (
        <AnimatePresence mode="wait">
            {visibleProvider && (
                <motion.div
                    key={visibleProvider}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-[#0d1117]/95 px-4 py-2.5 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                            <ProviderGlyph provider={visibleProvider} />
                        </span>
                        <span className="truncate text-[13px] text-zinc-200">
                            Connect <strong className="font-semibold text-white">{PROVIDER_LABEL[visibleProvider]}</strong>{' '}
                            <span className="text-zinc-500">{PROVIDER_BLURB[visibleProvider]}</span>
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => onConnect(visibleProvider)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#22d3ee] px-3.5 py-1.5 text-[12px] font-semibold text-[#06141a] shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_2px_8px_rgba(34,211,238,0.30)] transition-all hover:brightness-110"
                            data-testid={`connector-intent-nudge-connect-${visibleProvider}`}
                        >
                            Connect {PROVIDER_LABEL[visibleProvider]}
                        </button>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            aria-label="Dismiss"
                            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                            data-testid={`connector-intent-nudge-dismiss-${visibleProvider}`}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
