'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Plus, ShieldCheck, SlidersHorizontal, Link2, Trophy } from 'lucide-react';

import { Banner } from '@/components/ui/Banner';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Favicon } from '@/components/ui/Favicon';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toaster';
import { PageHeader } from '@/components/shell/PageHeader';
import { cn } from '@/lib/cn';
import type { MyEntry, SiteChoice } from '@/lib/leaderboard/types';
import { EntryEditor, type FirstCheck } from './EntryEditor';
import { SitePicker } from './SitePicker';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json() as Promise<{ entries: MyEntry[] }>);

function JoinHero({ onStart }: { onStart: () => void }) {
    return (
        <Card padding="lg" className="flex flex-col items-start gap-6">
            <div>
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg"><Trophy aria-hidden size={20} strokeWidth={1.75} /></span>
                <h2 className="text-heading text-fg">Get on the verified leaderboard</h2>
                <p className="mt-1 max-w-[560px] text-body-lg text-fg-secondary">Show real traffic on a public profile, rank against other verified sites, and let sponsors and buyers find you. Free.</p>
            </div>
            <ul className="grid w-full gap-3 grid-cols-1 sm:grid-cols-3">
                {[
                    [ShieldCheck, 'Verified owner', 'We check Search Console ownership daily, so the numbers can be trusted.'],
                    [SlidersHorizontal, 'You choose what is public', 'Exact, a range, or hidden for every number. Countries and queries stay off until you turn them on.'],
                    [Link2, 'Free backlink and badge', 'A live badge and widget for your own site, plus offers from sponsors and buyers.'],
                ].map(([Icon, title, sub]) => {
                    const I = Icon as typeof ShieldCheck;
                    return (
                        <li key={title as string} className="rounded-control border border-border-subtle p-4">
                            <I aria-hidden size={18} strokeWidth={1.75} className="text-brand-text" />
                            <p className="mt-2 text-body font-semibold text-fg">{title as string}</p>
                            <p className="mt-0.5 text-body-sm text-fg-muted">{sub as string}</p>
                        </li>
                    );
                })}
            </ul>
            <Button variant="primary" size="lg" onClick={onStart}>Join the leaderboard</Button>
        </Card>
    );
}

export default function MyLeaderboard({ origin }: { origin: string }) {
    const { data, isLoading, mutate } = useSWR('/api/leaderboard/me', fetcher, { revalidateOnFocus: false });
    const entries = useMemo(() => data?.entries ?? [], [data]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [creating, setCreating] = useState<string | null>(null);
    const [firstCheck, setFirstCheck] = useState<FirstCheck | null>(null);

    // Select the first listing once they load.
    useEffect(() => {
        if (selectedId === null && entries.length > 0) setSelectedId(entries[0].id);
        if (selectedId !== null && entries.length > 0 && !entries.some((e) => e.id === selectedId)) setSelectedId(entries[0].id);
    }, [entries, selectedId]);

    const selected = entries.find((e) => e.id === selectedId) ?? null;
    const refresh = useCallback(async () => { await mutate(); }, [mutate]);

    async function pick(site: SiteChoice) {
        if (!site.ga4) return;
        setCreating(site.key);
        try {
            const res = await fetch('/api/leaderboard/me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ga_property_id: site.ga4.property,
                    gsc_site_url: site.gsc?.siteUrl,
                    website_url: `https://${site.host}`,
                    startup_name: site.ga4.displayName && !/^properties\//.test(site.ga4.displayName) ? site.ga4.displayName.split(/\s[–-]\s/)[0] : site.host,
                }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string; entryId?: number; entry?: MyEntry; verification?: FirstCheck };
            if (res.status === 409 && body.entryId) { setSelectedId(body.entryId); setAdding(false); await refresh(); return; }
            if (!res.ok || !body.entry) throw new Error(body.error || 'Could not start the listing.');
            setFirstCheck(body.verification ?? null);
            await refresh();
            setSelectedId(body.entry.id);
            setAdding(false);
            if (body.verification?.level === 'owner') toast.success('Ownership verified. Review your profile, then publish.');
            else toast.message('Draft created', { description: 'Ownership is not verified yet. Follow the steps below.' });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not start the listing.');
        } finally {
            setCreating(null);
        }
    }

    const showPicker = adding || (!isLoading && entries.length === 0);
    const [heroDismissed, setHeroDismissed] = useState(false);

    return (
        <>
            <PageHeader
                title="Leaderboard"
                subtitle="Show verified traffic on a public profile. Free backlink included."
                actions={
                    selected && selected.verification.ranked && !selected.is_paused ? (
                        <Link href={selected.public_path} target="_blank" className={buttonClasses({ variant: 'secondary', size: 'md' })}>View public profile ↗</Link>
                    ) : undefined
                }
            />

            {isLoading ? (
                <div className="flex flex-col gap-4"><Skeleton className="h-16 w-full" rounded="card" /><Skeleton className="h-72 w-full" rounded="card" /></div>
            ) : entries.length === 0 && !heroDismissed ? (
                <JoinHero onStart={() => { setHeroDismissed(true); setAdding(true); }} />
            ) : (
                <div className="flex flex-col gap-5">
                    {entries.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="My profiles">
                            {entries.map((e) => (
                                <button
                                    key={e.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={e.id === selectedId && !adding}
                                    onClick={() => { setSelectedId(e.id); setAdding(false); setFirstCheck(null); }}
                                    className={cn(
                                        'flex h-9 items-center gap-2 rounded-full border px-3 text-body font-medium transition-colors duration-120',
                                        e.id === selectedId && !adding ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface text-fg-secondary hover:border-border-strong hover:text-fg',
                                    )}
                                >
                                    <Favicon host={(e.website_url || e.startup_name).replace(/^https?:\/\//, '')} size={16} />
                                    <span className="max-w-[160px] truncate">{e.startup_name}</span>
                                    {e.inquiries.new > 0 ? <span className="rounded-full bg-up px-1.5 text-caption text-white">{e.inquiries.new}</span> : null}
                                </button>
                            ))}
                            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding((a) => !a)}>Add a site</Button>
                        </div>
                    ) : null}

                    {showPicker ? (
                        <section aria-label="Choose a site" className="flex flex-col gap-3">
                            <div>
                                <h2 className="text-title text-fg">Choose a site</h2>
                                <p className="text-body text-fg-secondary">Sites from your Google account, paired by hostname. We check ownership in Search Console first; nothing is public until you publish.</p>
                            </div>
                            {creating ? <Banner variant="info" title="Checking ownership and reading your numbers">This takes a few seconds. We use read-only access.</Banner> : null}
                            <SitePicker onPick={pick} creating={creating} onOpenExisting={(id) => { setSelectedId(id); setAdding(false); }} />
                        </section>
                    ) : selected ? (
                        <EntryEditor
                            key={selected.id}
                            entry={selected}
                            origin={origin}
                            firstCheck={firstCheck}
                            onChanged={refresh}
                            onDeleted={async () => { setSelectedId(null); await refresh(); }}
                        />
                    ) : null}
                </div>
            )}
        </>
    );
}
