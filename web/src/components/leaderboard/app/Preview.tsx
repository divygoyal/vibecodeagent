'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Favicon } from '@/components/ui/Favicon';
import { Skeleton } from '@/components/ui/Skeleton';
import { BoardRowItem } from '@/components/leaderboard/BoardRows';
import { CategoryBadge, CountValue, PctDelta, VerificationBadge } from '@/components/leaderboard/shared';
import { engagementText } from '@/lib/leaderboard/format';
import { PRIVACY_SECTIONS } from '@/lib/leaderboard/constants';
import type { BoardRow, MyEntry, OpenTo, PrivacySettings, ProfilePayload, RangeKey } from '@/lib/leaderboard/types';

export interface PreviewDraft {
    startup_name: string;
    description: string;
    category: string;
    logo_url: string;
    privacy: PrivacySettings;
    open_to: OpenTo[];
}

interface PreviewResponse { profile: ProfilePayload | null; row: BoardRow | null }

/** How the profile looks to the public with the current (unsaved) form. Comes from the server's own privacy code. */
export function PreviewPanel({ entry, draft, range = '28d' }: { entry: MyEntry; draft: PreviewDraft; range?: RangeKey }) {
    const [data, setData] = useState<PreviewResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);
    const key = JSON.stringify([draft, range]);

    useEffect(() => {
        const mine = ++seq.current;
        const t = window.setTimeout(async () => {
            try {
                const res = await fetch(`/api/leaderboard/me/${entry.id}/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...draft, range }),
                });
                const json = (await res.json()) as PreviewResponse & { error?: string };
                if (mine !== seq.current) return;
                if (!res.ok) throw new Error(json.error || 'Preview unavailable');
                setData(json);
                setError(null);
            } catch (err) {
                if (mine === seq.current) setError(err instanceof Error ? err.message : 'Preview unavailable');
            }
        }, 350);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry.id, key]);

    const p = data?.profile;
    const shown = p ? PRIVACY_SECTIONS.filter((s) => draft.privacy.sections[s.key]) : [];
    return (
        <div className="flex flex-col gap-3" aria-label="Public preview">
            <div className="flex items-center justify-between">
                <h3 className="text-title-sm text-fg">Public preview</h3>
                {entry.public_path && !entry.is_paused && entry.verification.ranked ? (
                    <a href={entry.public_path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                        Open live page <ExternalLink aria-hidden size={13} />
                    </a>
                ) : null}
            </div>
            {error ? <p className="text-body-sm text-down">{error}</p> : null}
            {!data ? (
                <>
                    <Skeleton className="h-24 w-full" rounded="card" />
                    <Skeleton className="h-40 w-full" rounded="card" />
                </>
            ) : (
                <>
                    <div>
                        <p className="mb-1.5 text-meta font-medium text-fg-muted">Leaderboard row</p>
                        {data.row ? (
                            <Card padding="none" className="overflow-hidden">
                                <ul><BoardRowItem row={data.row} focus="visitors" range={range} showNew={false} /></ul>
                            </Card>
                        ) : <p className="text-body-sm text-fg-muted">No preview yet.</p>}
                    </div>
                    {p ? (
                        <div>
                            <p className="mb-1.5 text-meta font-medium text-fg-muted">Profile header</p>
                            <Card padding="sm">
                                <div className="flex items-start gap-3">
                                    <Favicon host={(p.website_url || p.name).replace(/^https?:\/\//, '').replace(/\/.*$/, '')} size={32} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-title-sm text-fg">{p.name}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <VerificationBadge v={p.verification} compact />
                                            <CategoryBadge name={p.category} />
                                        </div>
                                        {p.description ? <p className="mt-2 line-clamp-2 text-body-sm text-fg-secondary">{p.description}</p> : null}
                                    </div>
                                </div>
                                <dl className="mt-3 grid grid-cols-2 gap-2">
                                    {([
                                        ['Visitors', p.kpis?.visitors],
                                        ['Search clicks', p.kpis?.clicks],
                                        ['Pageviews', p.kpis?.pageviews],
                                        ['Impressions', p.kpis?.impressions],
                                    ] as const).map(([label, m]) => (
                                        <div key={label} className="rounded-control bg-surface-sunken p-2.5">
                                            <dt className="text-meta text-fg-muted">{label}</dt>
                                            <dd className="mt-0.5 flex items-baseline gap-1.5">
                                                {m ? <><CountValue m={m} className="text-title-sm text-fg" /><PctDelta pct={m.delta_pct} /></> : <span className="text-body-sm text-fg-faint">Hidden</span>}
                                            </dd>
                                        </div>
                                    ))}
                                    <div className="rounded-control bg-surface-sunken p-2.5">
                                        <dt className="text-meta text-fg-muted">Engagement</dt>
                                        <dd className="mt-0.5 text-title-sm text-fg">{engagementText(p.kpis?.engagement) ?? <span className="text-body-sm font-normal text-fg-faint">Hidden</span>}</dd>
                                    </div>
                                </dl>
                                <p className="mt-3 text-meta text-fg-muted">
                                    {shown.length ? <>Breakdowns shown: {shown.map((s) => s.label).join(', ')}.</> : 'No breakdowns shown (countries, sources, devices, pages, queries).'}
                                </p>
                                {p.live.enabled ? <p className="mt-1 text-meta text-fg-muted">Live visitor count is on.</p> : null}
                                {p.open_to.length ? <div className="mt-2 flex flex-wrap gap-1">{p.open_to.map((o) => <Badge key={o} variant="outline">{o}</Badge>)}</div> : null}
                            </Card>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
