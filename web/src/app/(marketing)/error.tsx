'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Marketing-segment error boundary. Catches client-render crashes (most often:
 * Chrome auto-translate vs React reconciler — "Failed to execute 'removeChild'
 * on 'Node'") before they bubble to global-error.tsx, so the visitor sees a
 * recovery UI in the site's own theme instead of the bare Next.js error page.
 */
export default function MarketingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as { clarity?: (...args: unknown[]) => void }).clarity) {
            try {
                (window as { clarity?: (...args: unknown[]) => void }).clarity?.('event', 'marketing-error', { digest: error?.digest, message: error?.message });
            } catch { /* clarity not loaded yet — best-effort */ }
        }
    }, [error]);

    return (
        <div
            translate="no"
            className="flex min-h-screen items-center justify-center bg-black px-6 text-white"
        >
            <div className="max-w-md text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#14C4E1]/24 bg-[#14C4E1]/10 text-xl text-[#7AD9DA]">
                    ↻
                </div>
                <h1 className="mb-2 text-xl font-semibold tracking-[-0.01em]">Something went wrong</h1>
                <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                    TrafficClaw hit an unexpected error loading this page. Reload to try again.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-sm font-semibold text-[#031017] transition hover:brightness-105"
                    >
                        Reload
                    </button>
                    <Link
                        href="/"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.03] px-5 text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.06]"
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </div>
    );
}
