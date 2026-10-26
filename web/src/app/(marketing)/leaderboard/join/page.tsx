import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { ShieldCheck, SlidersHorizontal, Link2 } from 'lucide-react';

import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { JoinSignIn } from './JoinSignIn';

export const metadata: Metadata = {
    title: 'Add your site to the leaderboard',
    robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

/** Signed in: straight to the in-app join flow. Signed out: sign in with Google first (DESIGN 4.4). */
export default async function JoinRedirectPage() {
    const session = await getServerSession(authOptions);
    if (session?.user) redirect('/dashboard/leaderboard');

    return (
        <main className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-12 sm:px-6 md:pt-16">
            <Link href="/leaderboard" className="text-body-sm text-fg-muted hover:text-fg hover:underline">← Back to the leaderboard</Link>
            <h1 className="mt-4 text-heading-lg text-fg">Add your site to the leaderboard</h1>
            <p className="mt-2 text-body-lg text-fg-secondary">Connect Google, pick a site, choose what is public. Free, with a live badge and a backlink.</p>

            <Card className="mt-8" padding="lg">
                <p className="text-title-sm text-fg">Sign in with Google to continue</p>
                <p className="mt-1 text-body text-fg-secondary">Read-only access: we use Analytics and Search Console to verify the site and never write to your Google data.</p>
                <div className="mt-5"><JoinSignIn /></div>
            </Card>

            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                    [ShieldCheck, 'Verified owner', 'Search Console ownership, checked daily'],
                    [SlidersHorizontal, 'You decide', 'Exact, a range, or hidden for every number'],
                    [Link2, 'Free backlink', 'A live badge you can embed on your site'],
                ].map(([Icon, title, sub]) => {
                    const I = Icon as typeof ShieldCheck;
                    return (
                        <li key={title as string} className="rounded-card border border-border-subtle bg-surface p-4">
                            <I aria-hidden size={18} strokeWidth={1.75} className="text-brand-text" />
                            <p className="mt-2 text-body font-semibold text-fg">{title as string}</p>
                            <p className="text-body-sm text-fg-muted">{sub as string}</p>
                        </li>
                    );
                })}
            </ul>
        </main>
    );
}
