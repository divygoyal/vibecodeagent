'use client';

import { useEffect } from 'react';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Root-level error boundary. Next.js renders this when an error escapes every
 * route-segment error.tsx, replacing the default "Application error: a client-side
 * exception has occurred" screen.
 *
 * Common cause: Chrome's auto-translate mutates the DOM (wraps text nodes in
 * <font> elements), then React's reconciler can't find nodes it expects and
 * throws "Failed to execute 'removeChild' on 'Node'". The reset() call below
 * re-renders the segment from scratch, which typically clears the bad state.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as { clarity?: (...args: unknown[]) => void }).clarity) {
            try {
                (window as { clarity?: (...args: unknown[]) => void }).clarity?.('event', 'global-error', { digest: error?.digest, message: error?.message });
            } catch { /* clarity not loaded yet — best-effort only */ }
        }
    }, [error]);

    return (
        <html lang="en">
            <body
                translate="no"
                style={{
                    margin: 0,
                    minHeight: '100vh',
                    background: '#000',
                    color: '#fff',
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                }}
            >
                <div style={{ maxWidth: '420px', textAlign: 'center' }}>
                    <div
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'rgba(20,196,225,0.12)',
                            border: '1px solid rgba(20,196,225,0.24)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px',
                            fontSize: '22px',
                        }}
                    >
                        ↻
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                        Something went wrong
                    </h1>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '0 0 24px' }}>
                        {BRAND_NAME} hit an unexpected error. Reload the page to continue.
                    </p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{
                            background: 'linear-gradient(135deg,#14C4E1 0%,#7AD9DA 100%)',
                            color: '#031017',
                            border: 'none',
                            borderRadius: '999px',
                            padding: '12px 24px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Reload
                    </button>
                </div>
            </body>
        </html>
    );
}
