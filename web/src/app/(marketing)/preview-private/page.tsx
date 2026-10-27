import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { Button, EmptyState } from '@/components/ui';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: 'This preview is private',
    robots: { index: false, follow: false },
};

/** Where the NextAuth signIn callback sends a sign-in that is not on TC_ALLOWED_EMAILS (lib/accessAllowlist.ts). */
export default function PreviewPrivatePage() {
    return (
        <div className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-16 md:py-24">
            <EmptyState
                variant="page"
                icon={Lock}
                title="This preview is private"
                description={
                    <>
                        This copy of {BRAND_NAME} is open to invited people only, and the Google account you used is not on the list.
                        Nothing was saved and no data was read. If you should have access, ask the person who sent you the link.
                    </>
                }
                actions={
                    <>
                        <Button asChild variant="primary">
                            <Link href="/">Back to the home page</Link>
                        </Button>
                        <Button asChild variant="ghost">
                            <Link href="/contact">Contact us</Link>
                        </Button>
                    </>
                }
            />
        </div>
    );
}
