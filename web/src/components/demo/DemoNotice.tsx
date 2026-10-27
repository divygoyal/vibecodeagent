'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { connectGoogleFromDemo } from './useDemoSession';

/** In place of a part of the app that only makes sense on your own account (billing, account deletion). */
export function DemoNotice({ title, children, secondary }: { title: string; children: ReactNode; secondary?: { href: string; label: string } }) {
    return (
        <Banner
            variant="info"
            title={title}
            actions={(
                <>
                    <Button variant="google" size="sm" onClick={connectGoogleFromDemo}><GoogleMark size={16} />Connect Google</Button>
                    {secondary ? <Button asChild variant="ghost" size="sm"><Link href={secondary.href}>{secondary.label}</Link></Button> : null}
                </>
            )}
        >
            {children}
        </Banner>
    );
}
