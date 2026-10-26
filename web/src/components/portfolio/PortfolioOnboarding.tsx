'use client';

import { Check, LayoutGrid, RefreshCw, SearchX } from 'lucide-react';

import { Button, Card, EmptyState, GoogleMark, cardBaseClass } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { cn } from '@/lib/cn';

const FAKE = [
    [4, 6, 5, 8, 7, 9, 8, 11, 10, 13, 12, 15, 14, 17, 16, 19],
    [9, 8, 9, 7, 8, 6, 7, 6, 5, 6, 5, 4, 5, 4, 3, 4],
    [3, 3, 4, 3, 9, 4, 3, 4, 3, 3, 12, 4, 3, 4, 5, 4],
];

/** Faded, non-interactive preview of what the portfolio will look like (DESIGN 5.2). */
function GhostPreview() {
    return (
        <div aria-hidden className="pointer-events-none mt-6 grid select-none grid-cols-1 gap-4 opacity-40 md:grid-cols-2 xl:grid-cols-3">
            {FAKE.map((values, i) => (
                <div key={i} className={cn(cardBaseClass, 'flex flex-col gap-3 p-4', i > 0 && 'hidden md:flex', i > 1 && 'md:hidden xl:flex')}>
                    <div className="flex items-center gap-2">
                        <span className="size-5 rounded-[4px] bg-subtle" />
                        <span className="h-3.5 w-36 rounded bg-subtle" />
                        <span className="h-5 w-14 rounded-badge border border-border" />
                    </div>
                    <div className="flex gap-4">
                        <span className="h-4 w-24 rounded bg-subtle" />
                        <span className="h-4 w-20 rounded bg-subtle" />
                    </div>
                    <Sparkline series={[{ metric: 'clicks', values }, { metric: 'impressions', values: values.map((v, j) => v + ((j * 7) % 5)) }]} height={72} interactive={false} />
                    <div className="flex items-center gap-2">
                        <span className="h-6 w-16 rounded-full bg-subtle" />
                        <span className="h-3 w-24 rounded bg-subtle" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ConnectGoogle({ onConnect, demoHref = '/demo', reconnect }: { onConnect: () => void; demoHref?: string; reconnect?: boolean }) {
    return (
        <>
            <Card padding="lg">
                <EmptyState
                    variant="card"
                    icon={LayoutGrid}
                    title={reconnect ? 'Reconnect Google to see your sites' : 'See every site you own in one place'}
                    description={reconnect
                        ? 'Your Google access expired or was removed. Connect again and we will pick up where we left off.'
                        : 'Connect Google once. We read Search Console and Analytics (read only) and build a card for each site, with clicks, impressions, visitors and trends.'}
                    actions={(
                        <>
                            <Button variant="google" size="lg" onClick={onConnect}>
                                <GoogleMark />
                                {reconnect ? 'Reconnect Google' : 'Continue with Google'}
                            </Button>
                            {reconnect ? null : (
                                <Button asChild variant="secondary" size="lg">
                                    <a href={demoHref}>Explore the demo</a>
                                </Button>
                            )}
                        </>
                    )}
                >
                    <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-body-sm text-fg-muted">
                        {['Read-only access', 'About 30 seconds', 'Free, no card'].map((t) => (
                            <li key={t} className="inline-flex items-center gap-1.5">
                                <Check aria-hidden size={14} strokeWidth={2} className="text-up" />
                                {t}
                            </li>
                        ))}
                    </ul>
                </EmptyState>
            </Card>
            <GhostPreview />
        </>
    );
}

export function NoSitesFound({ onCheckAgain, checking }: { onCheckAgain: () => void; checking?: boolean }) {
    return (
        <>
            <Card padding="lg">
                <EmptyState
                    variant="card"
                    icon={SearchX}
                    title="We couldn't find any Search Console or Analytics properties"
                    description="The Google account you connected has no Search Console sites or GA4 properties yet, or it can't see them. Add your site in Google, then check again."
                    actions={(
                        <>
                            <Button variant="primary" icon={RefreshCw} loading={checking} onClick={onCheckAgain}>Check again</Button>
                            <Button asChild variant="secondary">
                                <a href="https://support.google.com/webmasters/answer/34592" target="_blank" rel="noopener noreferrer">How to add a property</a>
                            </Button>
                        </>
                    )}
                />
            </Card>
            <GhostPreview />
        </>
    );
}
