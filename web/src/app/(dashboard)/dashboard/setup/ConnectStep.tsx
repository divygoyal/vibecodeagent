'use client';

import Link from 'next/link';
import { BarChart3, Search, ShieldCheck } from 'lucide-react';

import { Button, GoogleMark } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const POINTS = [
    { icon: Search, text: 'See your Search Console data' },
    { icon: BarChart3, text: 'See your Google Analytics data' },
    { icon: ShieldCheck, text: 'Read only: we never change anything in Google' },
] as const;

/** Step 1 (DESIGN 5.3): connect Google, in plain words. */
export function ConnectStep({ onConnect, onDemo, demoLoading, error }: {
    onConnect: () => void;
    onDemo: () => void;
    demoLoading: boolean;
    error: string | null;
}) {
    return (
        <Card padding="lg" as="section" aria-labelledby="connect-title">
            <h1 id="connect-title" className="text-heading text-fg">Connect Google</h1>
            <p className="mt-2 text-body-lg text-fg-muted">
                Connect once and we build a card for every site you can open in Search Console or Analytics, with clicks, visitors and trends.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
                {POINTS.map((p) => {
                    const Icon = p.icon;
                    return (
                        <li key={p.text} className="flex items-center gap-3 text-body text-fg-secondary">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                                <Icon aria-hidden size={16} strokeWidth={1.75} />
                            </span>
                            {p.text}
                        </li>
                    );
                })}
            </ul>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Button variant="google" size="xl" onClick={onConnect} className="justify-center"><GoogleMark />Continue with Google</Button>
                <Button variant="ghost" size="lg" onClick={onDemo} loading={demoLoading}>Explore with demo data</Button>
            </div>
            {error ? <p role="alert" className="mt-3 text-body-sm text-down">{error}</p> : null}
            <p className="mt-5 text-meta text-fg-muted">
                About 30 seconds. Free, no card. Read our <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">privacy policy</Link>.
            </p>
        </Card>
    );
}
