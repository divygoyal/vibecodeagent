import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass } from 'lucide-react';

import { MarketingFooter } from '@/components/marketing/site/MarketingFooter';
import { MarketingHeader } from '@/components/marketing/site/MarketingHeader';
import { Button, EmptyState } from '@/components/ui';

export const metadata: Metadata = {
    title: 'Page not found',
    robots: { index: false, follow: false },
};

/** Site-wide 404 in the light public shell (same frame as app/(marketing)/layout.tsx). */
export default function NotFound() {
    return (
        <div data-theme="light" className="tc-root flex min-h-dvh flex-col bg-canvas text-body-lg text-fg">
            <MarketingHeader />
            <main id="main-content" className="flex-1">
                <div className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-16 md:py-24">
                    <EmptyState
                        variant="page"
                        icon={Compass}
                        title="Page not found"
                        description="This page does not exist or has moved."
                        actions={
                            <>
                                <Button asChild variant="primary"><Link href="/">Go home</Link></Button>
                                <Button asChild variant="ghost"><Link href="/dashboard">Open the app</Link></Button>
                            </>
                        }
                    />
                </div>
            </main>
            <MarketingFooter />
        </div>
    );
}
