import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import { BRAND_NAME } from '@/lib/brand';
import { Favicon } from '@/components/ui/Favicon';
import { LiveNow } from '@/components/leaderboard/ProfileClient';
import { CountValue, PctDelta, RowSpark } from '@/components/leaderboard/shared';
import { SITE_ORIGIN } from '@/lib/leaderboard/constants';
import { getEmbed, parseRange } from '@/lib/leaderboard/server';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * /embed/leaderboard/[id]: the small iframe widget. Same data as the badge and the same
 * privacy rules (the admin API's embed payload). 340 x ~168, light or dark.
 */
export default async function LeaderboardWidget({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
    const { id } = await params;
    const sp = await searchParams;
    const theme = (Array.isArray(sp.theme) ? sp.theme[0] : sp.theme) === 'dark' ? 'dark' : 'light';
    const range = parseRange(sp.range);
    const e = await getEmbed(id, range);

    return (
        <div data-theme={theme} className="tc-root flex min-h-screen items-stretch bg-transparent p-0 text-fg">
            {e ? (
                <a
                    href={`${SITE_ORIGIN}/leaderboard/${e.slug || e.id}`}
                    target="_blank"
                    rel="noopener"
                    className="tc-card flex w-full flex-col justify-between gap-3 rounded-card border border-border-subtle bg-surface p-4 shadow-card transition-colors duration-120 hover:border-border"
                >
                    <div className="flex items-start gap-3">
                        <Favicon host={(e.website_url || e.name).replace(/^https?:\/\//, '').replace(/\/.*$/, '')} size={32} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold">{e.name}</p>
                            <p className="flex items-center gap-1 text-meta font-medium text-brand-text">
                                <ShieldCheck aria-hidden size={13} strokeWidth={1.75} /> {e.verification.label}
                            </p>
                        </div>
                        {e.live_enabled ? <LiveNow idOrSlug={e.slug || String(e.id)} /> : null}
                    </div>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            {e.visitors || e.clicks ? (
                                <>
                                    <div className="flex items-baseline gap-2">
                                        <CountValue m={e.visitors ?? e.clicks} className="text-stat text-fg" />
                                        <PctDelta pct={(e.visitors ?? e.clicks)?.delta_pct} />
                                    </div>
                                    <p className="text-meta text-fg-muted">{e.visitors ? 'visitors' : 'search clicks'} · {range === '3m' ? '3 months' : range}</p>
                                </>
                            ) : (
                                <p className="text-body-sm text-fg-muted">Verified, numbers not shared</p>
                            )}
                        </div>
                        <div className="w-28 shrink-0"><RowSpark spark={e.spark} height={40} /></div>
                    </div>
                    <p className="flex items-center justify-between text-meta text-fg-muted">
                        <span>{e.rank_category && e.category ? `#${e.rank_category} in ${e.category}` : e.rank_overall ? `#${e.rank_overall} overall` : 'Verified traffic'}</span>
                        <span>{BRAND_NAME}</span>
                    </p>
                </a>
            ) : (
                <Link href={SITE_ORIGIN} className="tc-card flex w-full items-center justify-center rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-fg-muted">
                    Not listed on {BRAND_NAME}
                </Link>
            )}
        </div>
    );
}
