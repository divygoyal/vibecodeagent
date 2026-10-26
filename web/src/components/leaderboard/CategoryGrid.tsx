import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { Favicon } from '@/components/ui/Favicon';
import { CATEGORY_LABELS, profilePath } from '@/lib/leaderboard/constants';
import type { CategoryCard } from '@/lib/leaderboard/types';
import { CountValue } from './shared';

function hostOf(url: string | null): string {
    return (url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/** The Categories tab: one card per category with its biggest sites. */
export function CategoryGrid({ cards, range }: { cards: CategoryCard[]; range: string }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
                <Card key={c.name} className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-title-sm text-fg">{CATEGORY_LABELS[c.name] ?? c.name}</h3>
                        <span className="text-meta text-fg-muted">{c.count} site{c.count === 1 ? '' : 's'}</span>
                    </div>
                    <ul className="mt-3 flex flex-col gap-2">
                        {c.top.map((t) => (
                            <li key={t.id} className="flex items-center gap-2.5">
                                <Favicon host={hostOf(t.website_url) || t.name} size={20} />
                                <Link href={profilePath(t)} className="min-w-0 flex-1 truncate text-body text-fg hover:underline">{t.name}</Link>
                                <CountValue m={t.visitors} bold={false} className="text-body-sm text-fg-secondary" />
                            </li>
                        ))}
                    </ul>
                    <Link
                        href={`/leaderboard?category=${encodeURIComponent(c.name)}${range !== '28d' ? `&range=${range}` : ''}`}
                        className="mt-4 text-body-sm font-medium text-fg-secondary hover:text-fg hover:underline"
                    >
                        See all {CATEGORY_LABELS[c.name] ?? c.name} sites →
                    </Link>
                </Card>
            ))}
        </div>
    );
}
