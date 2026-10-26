'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';

import { Button, EmptyState } from '@/components/ui';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Marketing-segment error boundary. Catches client-render crashes (most often:
 * Chrome auto-translate vs React reconciler — "Failed to execute 'removeChild'
 * on 'Node'") before they bubble to global-error.tsx, so the visitor sees a
 * recovery UI inside the light marketing layout instead of the bare Next.js error page.
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
        <div translate="no" className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-16 md:py-24">
            <EmptyState
                variant="page"
                icon={RotateCcw}
                title="Something went wrong"
                description={`${BRAND_NAME} hit an unexpected error loading this page. Reload to try again.`}
                actions={
                    <>
                        <Button variant="primary" onClick={() => reset()}>Reload</Button>
                        <Button asChild variant="ghost"><Link href="/">Go home</Link></Button>
                    </>
                }
            />
        </div>
    );
}
