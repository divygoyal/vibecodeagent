'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { DEMO_HEADER, DEMO_READONLY_MESSAGE } from '@/lib/publicDemo/config';
import { connectGoogleFromDemo, DEMO_EXIT_HREF, useDemoSession } from './useDemoSession';

const TOAST_ID = 'tc-demo-readonly';

/** The demo's one "read-only" toast (also for places that skip the server, like the builder's autosave). */
export function notifyReadOnly() {
    toast.info('This is a read-only demo', {
        id: TOAST_ID,
        description: 'Connect Google to do this on your own sites. It is free.',
        action: { label: 'Connect Google', onClick: connectGoogleFromDemo },
        duration: 6000,
    });
}

function notifyEnded() {
    toast.info('The demo session ended', {
        id: 'tc-demo-ended',
        description: 'Reload to start a fresh one.',
        action: { label: 'Reload', onClick: () => window.location.reload() },
        duration: 10000,
    });
}

/**
 * One place for every refused demo action: the server answers 403 with `x-tc-demo: readonly`
 * (lib/publicDemo/guard.ts), and this shows one calm toast with the way out, whatever component
 * made the call. Pages that toast the server's error text themselves would repeat the same message,
 * so those toasts are folded into this one.
 */
function useDemoActionNotice(active: boolean) {
    useEffect(() => {
        if (!active) return;
        const originalFetch = window.fetch;
        const patchedFetch: typeof window.fetch = async (...args) => {
            const res = await originalFetch(...args);
            try {
                const flag = res.headers.get(DEMO_HEADER);
                if (flag === 'readonly') notifyReadOnly();
                else if (flag === 'ended') notifyEnded();
            } catch { /* opaque responses */ }
            return res;
        };
        window.fetch = patchedFetch;
        const originalError = toast.error;
        toast.error = ((message: unknown, data?: unknown) => {
            if (typeof message === 'string' && message.includes(DEMO_READONLY_MESSAGE)) {
                notifyReadOnly();
                return TOAST_ID;
            }
            return (originalError as (m: unknown, d?: unknown) => string | number)(message, data);
        }) as typeof toast.error;
        return () => {
            if (window.fetch === patchedFetch) window.fetch = originalFetch;
            toast.error = originalError;
        };
    }, [active]);
}

/**
 * Slim bar at the top of the app for the public live demo: what this is, the way in (Connect Google)
 * and the way out (Exit demo, or Back to your sites for a signed-in visitor). Renders nothing outside the demo.
 */
export function DemoBar() {
    const { demo, realSession } = useDemoSession();
    useDemoActionNotice(demo);
    if (!demo) return null;
    return (
        <div
            role="region"
            aria-label="Live demo"
            className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-brand-soft px-3 py-1.5 md:px-4 lg:px-6"
        >
            <p className="flex min-w-0 flex-1 items-center gap-2 text-body-sm text-brand-soft-fg">
                <span aria-hidden className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-40 motion-reduce:hidden" />
                    <span className="relative inline-flex size-2 rounded-full bg-brand" />
                </span>
                <span className="truncate">
                    <span className="font-medium">Live demo</span>
                    <span className="max-sm:hidden"> · sample data, read-only</span>
                </span>
            </p>
            {realSession ? (
                <Button asChild size="sm" variant="primary"><a href={DEMO_EXIT_HREF}>Back to your sites</a></Button>
            ) : (
                <>
                    <Button size="sm" variant="primary" onClick={connectGoogleFromDemo} className="shrink-0">
                        <span className="sm:hidden">Connect Google</span>
                        <span className="max-sm:hidden">Connect Google — it&apos;s free</span>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="shrink-0"><a href={DEMO_EXIT_HREF}><span className="sm:hidden">Exit</span><span className="max-sm:hidden">Exit demo</span></a></Button>
                </>
            )}
        </div>
    );
}

