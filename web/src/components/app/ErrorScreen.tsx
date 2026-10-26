'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button, EmptyState } from '@/components/ui';

export type ErrorScope = 'app' | 'site' | 'marketing' | 'global';

/**
 * Records an error-boundary hit: browser console, Clarity (when loaded) and one
 * line in the server log via /api/client-error, so a crash on a phone shows up
 * next to the server error that has the same digest.
 */
export function reportClientError(scope: ErrorScope, error: Error & { digest?: string }) {
    const payload = {
        scope,
        digest: error?.digest,
        message: String(error?.message || error).slice(0, 300),
        path: typeof location !== 'undefined' ? location.pathname : '',
    };
    console.error(`[${scope}-error]${payload.digest ? ` digest=${payload.digest}` : ''}`, error);
    try {
        const w = window as { clarity?: (...args: unknown[]) => void };
        w.clarity?.('event', `${scope}-error`, { digest: payload.digest, message: payload.message });
    } catch { /* Clarity not loaded */ }
    try {
        const body = JSON.stringify(payload);
        if (!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))) {
            void fetch('/api/client-error', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
        }
    } catch { /* best effort */ }
}

/**
 * The error-boundary screen (route segments and global-error): what happened,
 * Reload (a full page load: also clears client state a browser extension or
 * auto-translate broke) and Go home. Shows the digest so a report can be matched.
 */
export function ErrorScreen({
    error,
    scope,
    homeHref = '/',
    homeLabel = 'Go home',
    description = 'This page hit an unexpected error. Reload to try again.',
}: {
    error: Error & { digest?: string };
    scope: ErrorScope;
    homeHref?: string;
    homeLabel?: string;
    description?: string;
}) {
    useEffect(() => {
        reportClientError(scope, error);
    }, [error, scope]);

    return (
        <div translate="no" role="alert" className="mx-auto flex w-full max-w-[560px] flex-col items-center px-4 py-12 md:py-20">
            <EmptyState
                variant="page"
                icon={AlertTriangle}
                title="Something went wrong"
                description={description}
                actions={
                    <>
                        <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
                            Reload
                        </Button>
                        <Button asChild variant="ghost">
                            <a href={homeHref}>{homeLabel}</a>
                        </Button>
                    </>
                }
            >
                {error?.digest ? <p className="mt-4 font-mono text-caption text-fg-faint">Error ID {error.digest}</p> : null}
            </EmptyState>
        </div>
    );
}
