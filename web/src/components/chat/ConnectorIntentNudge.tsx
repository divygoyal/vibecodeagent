'use client';

import { useSyncExternalStore } from 'react';
import { Github, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    dismissProvider as persistDismiss,
    isDismissed as readDismissed,
} from '@/lib/connectorIntent';

// Module-level pub/sub so a dismiss action in one mounted nudge re-renders
// any siblings (e.g. if we mount the nudge in multiple places later). Empty
// today; useSyncExternalStore handles the SSR/client mismatch via the
// server-snapshot fn below.
const dismissListeners = new Set<() => void>();
function subscribeDismiss(cb: () => void) {
    dismissListeners.add(cb);
    return () => { dismissListeners.delete(cb); };
}
function notifyDismissed() {
    dismissListeners.forEach(cb => cb());
}

interface ConnectorIntentNudgeProps {
    /** Whether GitHub is currently connected. The nudge stays up whenever this
     *  is false (and the user hasn't dismissed it this session). */
    githubConnected: boolean;
    /** Fires the GitHub OAuth flow (parent handles the actual redirect). */
    onConnect: () => void;
}

/**
 * Persistent nudge above the chat input that prompts the user to connect
 * GitHub whenever GitHub isn't connected. Previously this was keyword-driven
 * ("only nudge when they type 'repo' or 'commit'") — that hid the prompt
 * from users who'd benefit but weren't using the trigger words. GitHub
 * connection materially improves answers across all question types, so the
 * nudge now always shows until the user either (a) connects, or (b)
 * dismisses for the session.
 *
 * Visibility is intentionally NOT gated on isLoading / streaming state —
 * the user explicitly wanted "always till github is connected" and hiding
 * the prompt while the AI is generating a code-blind answer is exactly the
 * moment they'd most want to fix it.
 *
 * Dismissal uses sessionStorage (per-tab, per-session), so a refresh brings
 * it back. The persistent right rail / mobile drawer still let users connect
 * after a dismiss.
 */
export function ConnectorIntentNudge({
    githubConnected,
    onConnect,
}: ConnectorIntentNudgeProps) {
    // SSR/client mismatch was the bug behind "nudge never appears": reading
    // sessionStorage inside render flipped between false (server) and the
    // real value (client) and tripped React error #418, unmounting the
    // component. useSyncExternalStore is React's correct API for external
    // store reads — the third arg (server snapshot) gives a stable SSR value
    // ("false" = not dismissed) and the client snapshot reads the actual
    // sessionStorage after hydrate. No mismatch, no error.
    const dismissed = useSyncExternalStore(
        subscribeDismiss,
        () => readDismissed('github'),
        () => false,
    );

    const visible = !githubConnected && !dismissed;

    const handleDismiss = () => {
        persistDismiss('github');
        notifyDismissed();
    };

    return (
        <AnimatePresence mode="wait">
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-[#0d1117]/95 px-3.5 py-3 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/40 text-white"
                            style={{ boxShadow: 'inset 2px 0 0 rgba(34,211,238,0.45)' }}
                        >
                            <Github className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-white">GitHub not connected</div>
                            <div className="text-[12px] leading-snug text-zinc-400">
                                See the exact code, commit, or change causing the issue.
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={onConnect}
                            className="inline-flex items-center rounded-full border border-cyan-400/50 px-4 py-1.5 text-[12px] font-semibold text-white transition-all hover:border-cyan-400/70 hover:bg-cyan-400/10"
                            data-testid="connector-nudge-connect-github"
                        >
                            Connect
                        </button>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            aria-label="Dismiss"
                            className="rounded-full border border-white/[0.1] p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                            data-testid="connector-nudge-dismiss-github"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
