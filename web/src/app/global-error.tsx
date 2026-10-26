'use client';

import './globals.css';

import { ErrorScreen } from '@/components/app/ErrorScreen';
import { BrandMark } from '@/components/marketing/site/BrandMark';

/**
 * Root error boundary: Next.js renders it (with its own <html>) when an error
 * escapes every route segment's error.tsx, e.g. in the root layout. Same screen
 * as the segment boundaries, on the light canvas with the brand mark.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="en" data-theme="light">
            <body translate="no" className="tc-root min-h-dvh bg-canvas text-fg antialiased">
                <div className="mx-auto flex h-16 max-w-[1200px] items-center px-4 md:px-6">
                    <BrandMark />
                </div>
                <main className="flex flex-1 flex-col items-center">
                    <ErrorScreen error={error} scope="global" />
                </main>
            </body>
        </html>
    );
}
