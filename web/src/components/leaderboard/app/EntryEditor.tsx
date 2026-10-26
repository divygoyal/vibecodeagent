'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmModal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toaster';
import { fmtDay, fmtFull } from '@/lib/format';
import { CATEGORIES, CATEGORY_LABELS, OPEN_TO_OPTIONS } from '@/lib/leaderboard/constants';
import { timeAgo } from '@/lib/leaderboard/format';
import type { MyEntry, OpenTo, PrivacySettings } from '@/lib/leaderboard/types';
import { VerificationBadge } from '../shared';
import { EmbedCard } from '../ProfileClient';
import { InboxPanel, useInbox } from './InboxPanel';
import { PreviewPanel } from './Preview';
import { useIsMobile } from '@/lib/useIsMobile';
import { PrivacyForm } from './PrivacyForm';
import { SlotsEditor } from './SlotsEditor';

const FIELD = 'tc-control w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint transition-[border-color,box-shadow] duration-120 hover:border-border-strong focus:border-focus focus:ring-2 focus:ring-focus/25 focus:outline-none';

interface Draft {
    startup_name: string;
    description: string;
    category: string;
    founder_name: string;
    twitter_handle: string;
    contact_email: string;
    logo_url: string;
    open_to: OpenTo[];
    privacy: PrivacySettings;
}

function draftFrom(e: MyEntry): Draft {
    const autoLogo = /google\.com\/s2\/favicons/.test(e.logo_url || '');
    return {
        startup_name: e.startup_name || '',
        description: e.description || '',
        category: e.category || 'Other',
        founder_name: e.founder_name || '',
        twitter_handle: e.twitter_handle || '',
        contact_email: e.contact_email || '',
        logo_url: autoLogo ? '' : e.logo_url || '',
        open_to: e.open_to,
        privacy: e.privacy,
    };
}

type TabKey = 'profile' | 'privacy' | 'offers' | 'slots' | 'embed';

export interface FirstCheck { level: string; message: string; fix: string[]; transient?: boolean }

export function EntryEditor({ entry, origin, firstCheck, onChanged, onDeleted }: {
    entry: MyEntry;
    /** Absolute public origin (server-side NEXTAUTH_URL); used in copied links and snippets. */
    origin: string;
    firstCheck: FirstCheck | null;
    onChanged: () => Promise<unknown> | void;
    onDeleted: () => void;
}) {
    const [tab, setTab] = useState<TabKey>('profile');
    const [draft, setDraft] = useState<Draft>(() => draftFrom(entry));
    const [saving, setSaving] = useState(false);
    const [rechecking, setRechecking] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const inbox = useInbox();

    // Reset the form when another listing is opened or the saved copy changes.
    const baseKey = useMemo(() => JSON.stringify(draftFrom(entry)), [entry]);
    useEffect(() => { setDraft(JSON.parse(baseKey) as Draft); }, [baseKey, entry.id]);
    const dirty = JSON.stringify(draft) !== baseKey;

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

    async function save() {
        setSaving(true);
        try {
            const res = await fetch(`/api/leaderboard/me/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(data.error || 'Could not save.');
            await onChanged();
            toast.success('Saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save.');
        } finally {
            setSaving(false);
        }
    }

    async function setPaused(paused: boolean) {
        setToggling(true);
        try {
            const res = await fetch(`/api/leaderboard/me/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_paused: paused }) });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not update.');
            await onChanged();
            toast.success(paused ? 'Listing paused. It is hidden from the public.' : entry.verification.ranked ? 'Published. Your profile is live.' : 'Published. You go live as soon as ownership is verified.');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update.');
        } finally {
            setToggling(false);
        }
    }

    async function recheck() {
        setRechecking(true);
        try {
            const res = await fetch(`/api/leaderboard/me/${entry.id}/recheck`, { method: 'POST' });
            const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; verification?: { level: string; message: string; transient: boolean } };
            if (!res.ok) throw new Error(data.error || 'Could not re-check.');
            await onChanged();
            if (data.verification?.transient) toast.error(data.verification.message);
            else if (data.verification?.level === 'owner') toast.success('Verified: you are an owner in Search Console.');
            else toast.message('Not verified yet', { description: data.verification?.message });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not re-check.');
        } finally {
            setRechecking(false);
        }
    }

    async function remove() {
        setDeleting(true);
        try {
            const res = await fetch(`/api/leaderboard/me/${entry.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not delete.');
            toast.success('Profile deleted');
            setConfirmDelete(false);
            onDeleted();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not delete.');
        } finally {
            setDeleting(false);
        }
    }

    const v = entry.verification;
    const live = !entry.is_paused && v.ranked && entry.is_active;
    const status = !entry.is_active
        ? { tone: 'neutral' as const, label: 'Removed' }
        : entry.is_paused
            ? { tone: 'neutral' as const, label: 'Not published' }
            : v.ranked
                ? { tone: 'up' as const, label: 'Listed' }
                : { tone: 'warn' as const, label: 'Pending verification' };
    const detail = v.detail;
    const newOffers = (inbox.data?.items ?? []).filter((i) => i.entry_id === entry.id && i.status === 'new').length;
    const publicUrl = `${origin}${entry.public_path}`;
    const showPreview = tab === 'profile' || tab === 'privacy';
    const isPhone = useIsMobile();
    const previewDraft = { startup_name: draft.startup_name, description: draft.description, category: draft.category, logo_url: draft.logo_url, privacy: draft.privacy, open_to: draft.open_to };

    return (
        <div className="flex flex-col gap-4">
            {/* Status */}
            <Card padding="sm" className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-1 basis-72 flex-wrap items-center gap-2">
                    <Pill tone={status.tone} dot>{status.label}</Pill>
                    {live && entry.rank.rank ? <span className="text-body text-fg-secondary">#{entry.rank.rank} of {entry.rank.total}</span> : null}
                    <VerificationBadge v={v} compact />
                    <span className="text-body-sm text-fg-muted">
                        {v.checked_at ? `checked ${timeAgo(v.checked_at)}` : v.grace ? 'not re-checked yet' : 'not checked yet'}
                        {entry.last_refreshed ? ` · numbers ${timeAgo(entry.last_refreshed)}` : ''}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" icon={Copy} onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); toast.success('Link copied'); } catch { toast.error('Could not copy'); } }}>Copy link</Button>
                    {live ? (
                        <Button asChild size="sm" variant="secondary" trailingIcon={ExternalLink}><a href={entry.public_path} target="_blank" rel="noopener noreferrer">View public page</a></Button>
                    ) : null}
                    {entry.is_paused ? (
                        <Button size="sm" variant="primary" icon={Play} loading={toggling} onClick={() => void setPaused(false)}>Publish</Button>
                    ) : (
                        <Button size="sm" variant="secondary" icon={Pause} loading={toggling} onClick={() => void setPaused(true)}>Pause listing</Button>
                    )}
                </div>
            </Card>

            {/* Verification */}
            {v.level !== 'owner' || firstCheck ? (
                <Banner
                    variant={v.level === 'owner' ? 'success' : v.level === 'ga4' ? 'warn' : 'warn'}
                    title={v.level === 'owner' ? 'Ownership verified' : 'Pending verification: you are not ranked yet'}
                    actions={<Button size="sm" variant="secondary" icon={RefreshCw} loading={rechecking} onClick={recheck}>Re-check</Button>}
                >
                    <p>{detail.message || firstCheck?.message || 'We could not verify this site yet.'}</p>
                    {detail.error ? <p className="mt-1 text-down">Last check could not finish: {detail.error}</p> : null}
                    {(detail.fix?.length ? detail.fix : firstCheck?.fix)?.length && v.level !== 'owner' ? (
                        <ol className="mt-2 list-decimal space-y-1 pl-5">
                            {(detail.fix?.length ? detail.fix : firstCheck?.fix ?? []).map((s) => <li key={s}>{s}</li>)}
                        </ol>
                    ) : null}
                </Banner>
            ) : (
                <Card padding="sm" className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <CheckCircle2 aria-hidden size={18} className="text-up" />
                    <div className="min-w-0 flex-1 basis-72 text-body text-fg-secondary">
                        <span className="font-medium text-fg">Verified owner</span> of {detail.gsc?.site_url ?? entry.gsc_site_url} in Search Console ({detail.gsc?.permission === 'siteFullUser' ? 'full user' : 'owner'}).
                        {v.ga4_connected ? ' The GA4 data stream matches this domain.' : ''}
                        <span className="text-fg-muted"> Checked {v.checked_at ? fmtDay(v.checked_at.slice(0, 10)) : 'daily'}.</span>
                    </div>
                    <Button size="sm" variant="secondary" icon={RefreshCw} loading={rechecking} onClick={recheck}>Re-check</Button>
                </Card>
            )}

            <Tabs
                ariaLabel="Profile settings"
                value={tab}
                onValueChange={setTab}
                items={[
                    { value: 'profile', label: 'Profile' },
                    { value: 'privacy', label: 'Privacy' },
                    { value: 'offers', label: 'Offers', count: newOffers > 0 ? `${newOffers} new` : entry.inquiries.total || undefined },
                    { value: 'slots', label: 'Ad slots', count: entry.ad_slots.length || undefined },
                    { value: 'embed', label: 'Badge and widget' },
                ]}
            />

            <div className={cn('grid grid-cols-1 gap-6', showPreview && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
                <div className="flex min-w-0 flex-col gap-4">
                    {tab === 'profile' ? (
                        <>
                            <Card>
                                <CardHeader title="Profile" description="What visitors read about this site." />
                                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                                    <label className="sm:col-span-2">
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">Name</span>
                                        <input className={cn(FIELD, 'h-9')} value={draft.startup_name} maxLength={100} onChange={(e) => set('startup_name', e.target.value)} />
                                    </label>
                                    <label className="sm:col-span-2">
                                        <span className="mb-1 flex justify-between text-body-sm font-medium text-fg-secondary">Tagline <span className="font-normal text-fg-faint tabular-nums">{draft.description.length}/200</span></span>
                                        <textarea className={cn(FIELD, 'py-2')} rows={2} maxLength={200} value={draft.description} placeholder="One line on what the site is and who it is for" onChange={(e) => set('description', e.target.value)} />
                                    </label>
                                    <div>
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">Category</span>
                                        <Select ariaLabel="Category" value={draft.category} onValueChange={(c) => set('category', c)} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))} />
                                    </div>
                                    <label>
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">Logo URL <span className="font-normal text-fg-faint">(optional, defaults to the site icon)</span></span>
                                        <input className={cn(FIELD, 'h-9')} inputMode="url" autoCapitalize="none" spellCheck={false} value={draft.logo_url} placeholder="https://" onChange={(e) => set('logo_url', e.target.value)} />
                                    </label>
                                    <label>
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">Founder</span>
                                        <input className={cn(FIELD, 'h-9')} value={draft.founder_name} maxLength={100} onChange={(e) => set('founder_name', e.target.value)} />
                                    </label>
                                    <label>
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">X handle</span>
                                        <input className={cn(FIELD, 'h-9')} value={draft.twitter_handle} maxLength={60} placeholder="handle" autoCapitalize="none" onChange={(e) => set('twitter_handle', e.target.value)} />
                                    </label>
                                    <label className="sm:col-span-2">
                                        <span className="mb-1 block text-body-sm font-medium text-fg-secondary">Email for offers</span>
                                        <input className={cn(FIELD, 'h-9')} type="email" value={draft.contact_email} placeholder="you@example.com" onChange={(e) => set('contact_email', e.target.value)} />
                                        <span className="mt-1 block text-meta text-fg-muted">Never shown publicly. Offers are emailed here and always appear in the Offers tab.</span>
                                    </label>
                                </div>
                            </Card>
                            <Card>
                                <CardHeader title="Open to" description="Shows an “Open to” block and an offer form on your profile. Pick only what you want to hear about." />
                                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                                    {OPEN_TO_OPTIONS.map((o) => {
                                        const on = draft.open_to.includes(o.value);
                                        return (
                                            <div key={o.value} className={cn('rounded-control border p-3 transition-colors duration-120', on ? 'border-brand/40 bg-brand-soft' : 'border-border-subtle')}>
                                                <Checkbox
                                                    checked={on}
                                                    onCheckedChange={(c) => set('open_to', c ? [...draft.open_to, o.value] : draft.open_to.filter((x) => x !== o.value))}
                                                    label={o.label}
                                                    description={o.hint}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                            <Card>
                                <CardHeader title="Danger zone" />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="max-w-[460px] text-body-sm text-fg-muted">Deleting removes this profile, its history, offers and ad slots for good. To hide it for a while, pause the listing instead.</p>
                                    <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete profile</Button>
                                </div>
                            </Card>
                        </>
                    ) : null}

                    {tab === 'privacy' ? (
                        <PrivacyForm value={draft.privacy} onChange={(p) => set('privacy', p)} legacy={entry.legacy_privacy} />
                    ) : null}

                    {tab === 'offers' ? <InboxPanel entryId={entry.id} /> : null}
                    {tab === 'slots' ? <SlotsEditor key={entry.id} entryId={entry.id} initial={entry.ad_slots} onSaved={() => void onChanged()} /> : null}
                    {tab === 'embed' ? (
                        v.ranked ? (
                            <EmbedCard origin={origin} slug={entry.slug || String(entry.id)} id={entry.id} name={entry.startup_name} liveEnabled={entry.privacy.live} />
                        ) : (
                            <Banner variant="info" title="Available once you are verified">The badge and widget show your verified status, so they switch on when ownership is confirmed.</Banner>
                        )
                    ) : null}
                </div>

                {showPreview ? (
                    isPhone ? (
                        // Phones: the preview sits under the form, collapsed (DESIGN 5.12).
                        <details className="group min-w-0 rounded-card border border-border-subtle bg-surface p-4">
                            <summary className="flex cursor-pointer list-none items-center justify-between pointer-coarse:min-h-11 text-title-sm text-fg">
                                Preview
                                <span className="text-body-sm text-fg-muted group-open:hidden">Show</span>
                                <span className="hidden text-body-sm text-fg-muted group-open:inline">Hide</span>
                            </summary>
                            <div className="mt-3">
                                <PreviewPanel entry={entry} draft={previewDraft} />
                            </div>
                        </details>
                    ) : (
                        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
                            <PreviewPanel entry={entry} draft={previewDraft} />
                        </aside>
                    )
                ) : null}
            </div>

            {dirty && (tab === 'profile' || tab === 'privacy') ? (
                <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-raised p-3 shadow-popover">
                    <p className="text-body text-fg-secondary">You have unsaved changes.</p>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => setDraft(JSON.parse(baseKey) as Draft)}>Discard</Button>
                        <Button variant="primary" loading={saving} onClick={save}>Save changes</Button>
                    </div>
                </div>
            ) : null}

            <ConfirmModal
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={`Delete ${entry.startup_name}?`}
                description={`This removes the profile, its history and ${fmtFull(entry.inquiries.total)} offer${entry.inquiries.total === 1 ? '' : 's'} permanently. You can list the site again later.`}
                confirmLabel="Delete profile"
                loading={deleting}
                onConfirm={remove}
            />
        </div>
    );
}
