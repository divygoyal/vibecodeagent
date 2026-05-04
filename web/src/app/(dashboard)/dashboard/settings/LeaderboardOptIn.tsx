'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Trophy, ShieldCheck, ShieldAlert, ExternalLink, ChevronDown, Loader2,
    CheckCircle2, Globe, Twitter, Copy, Check, Code2, Plus, Pencil,
    Trash2, ArrowLeft,
} from 'lucide-react';

const CATEGORIES = [
    { value: 'SaaS', label: 'SaaS' },
    { value: 'E-commerce', label: 'E-commerce' },
    { value: 'Blog', label: 'Blog / Content' },
    { value: 'Agency', label: 'Agency' },
    { value: 'Tool', label: 'Dev Tool' },
    { value: 'Other', label: 'Other' },
];

const MRR_RANGES = [
    { value: '$0-500', label: '$0 - $500' },
    { value: '$500-1K', label: '$500 - $1K' },
    { value: '$1K-5K', label: '$1K - $5K' },
    { value: '$5K-10K', label: '$5K - $10K' },
    { value: '$10K+', label: '$10K+' },
];

const LOOKING_FOR_OPTIONS = [
    { value: 'partner', label: 'Partner', emoji: '🤝' },
    { value: 'visibility', label: 'Visibility', emoji: '👀' },
    { value: 'buyer', label: 'Buyer', emoji: '💰' },
];

interface GAProperty {
    displayName: string;
    property: string;
}

interface LeaderboardEntry {
    id: number;
    is_active: boolean;
    startup_name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
    category: string | null;
    mrr_range: string | null;
    looking_for: string[];
    twitter_handle: string | null;
    ga_property_id: string | null;
    monthly_visitors: number;
    visitor_trend: number;
    is_verified: boolean;
    verification_status: string;
    verified_host: string | null;
    last_refreshed: string | null;
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; entry: LeaderboardEntry };

const EMPTY_FORM = {
    startup_name: '',
    description: '',
    website_url: '',
    logo_url: '',
    category: 'SaaS',
    mrr_range: '$0-500',
    looking_for: [] as string[],
    twitter_handle: '',
    ga_property_id: '',
};

function normalizeHost(input: string | null | undefined): string | null {
    if (!input) return null;
    try {
        const url = /^https?:\/\//i.test(input) ? input : `https://${input}`;
        return new URL(url).hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

function StatusPill({ status }: { status: string }) {
    if (status === 'verified') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Verified
            </span>
        );
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                <ShieldAlert className="h-3 w-3" /> Domain mismatch
            </span>
        );
    }
    if (status === 'failed') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                Verification failed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            Pending
        </span>
    );
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function EntryThumb({ entry }: { entry: LeaderboardEntry }) {
    const [errored, setErrored] = useState(false);
    const fallbackHost = normalizeHost(entry.website_url);
    const url = !errored
        ? entry.logo_url || (fallbackHost ? `https://www.google.com/s2/favicons?domain=${fallbackHost}&sz=128` : null)
        : null;
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={url}
                alt={entry.startup_name}
                onError={() => setErrored(true)}
                className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
            />
        );
    }
    const initial = entry.startup_name.charAt(0).toUpperCase() || '?';
    return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-sm font-bold text-black">
            {initial}
        </div>
    );
}

export default function LeaderboardOptIn() {
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<Mode>({ kind: 'list' });
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [properties, setProperties] = useState<GAProperty[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showBadgeEmbed, setShowBadgeEmbed] = useState<number | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        void refreshEntries();
        void fetchProperties();
    }, []);

    async function refreshEntries() {
        setLoading(true);
        try {
            const res = await fetch('/api/leaderboard/join', { cache: 'no-store' });
            const data = await res.json();
            setEntries(Array.isArray(data.entries) ? data.entries : []);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }

    async function fetchProperties() {
        try {
            const res = await fetch('/api/analytics?mode=list');
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) setProperties(data);
        } catch {
            // not critical
        }
    }

    function startCreate() {
        // Pre-select the first GA property the user has access to so the form
        // is one-click submittable for the common case.
        const firstProperty = properties[0]?.property || '';
        setForm({ ...EMPTY_FORM, ga_property_id: firstProperty });
        setMessage(null);
        setMode({ kind: 'create' });
    }

    function startEdit(entry: LeaderboardEntry) {
        setForm({
            startup_name: entry.startup_name || '',
            description: entry.description || '',
            website_url: entry.website_url || '',
            logo_url: entry.logo_url || '',
            category: entry.category || 'SaaS',
            mrr_range: entry.mrr_range || '$0-500',
            looking_for: entry.looking_for || [],
            twitter_handle: entry.twitter_handle || '',
            ga_property_id: entry.ga_property_id || '',
        });
        setMessage(null);
        setMode({ kind: 'edit', entry });
    }

    function backToList() {
        setMode({ kind: 'list' });
        setMessage(null);
    }

    function toggleLookingFor(value: string) {
        setForm((prev) => ({
            ...prev,
            looking_for: prev.looking_for.includes(value)
                ? prev.looking_for.filter((v) => v !== value)
                : [...prev.looking_for, value],
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.startup_name.trim()) {
            setMessage({ tone: 'err', text: 'Startup name is required.' });
            return;
        }
        if (!form.ga_property_id) {
            setMessage({ tone: 'err', text: 'Pick a Google Analytics property.' });
            return;
        }
        if (!form.website_url.trim()) {
            setMessage({ tone: 'err', text: 'Add the website URL we should match against the GA4 property.' });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            if (mode.kind === 'edit') {
                const res = await fetch('/api/leaderboard/join', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...form, entry_id: mode.entry.id }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    setMessage({ tone: 'err', text: data.error || data.detail || 'Failed to save.' });
                } else {
                    setMessage({ tone: 'ok', text: 'Listing updated.' });
                    await refreshEntries();
                    setMode({ kind: 'list' });
                }
            } else {
                const res = await fetch('/api/leaderboard/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    setMessage({ tone: 'err', text: data.error || data.detail || 'Failed to join leaderboard.' });
                } else {
                    setMessage({ tone: 'ok', text: data.verification?.status === 'verified' ? '🎉 You\'re live on the leaderboard!' : 'Listing saved — verification will retry on the daily refresh.' });
                    await refreshEntries();
                    setMode({ kind: 'list' });
                }
            }
        } catch {
            setMessage({ tone: 'err', text: 'Network error — please try again.' });
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(entry: LeaderboardEntry) {
        if (!confirm(`Remove "${entry.startup_name}" from the leaderboard?`)) return;
        setRemovingId(entry.id);
        setMessage(null);
        try {
            const res = await fetch(`/api/leaderboard/join?entry_id=${entry.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setMessage({ tone: 'err', text: data.error || data.detail || 'Failed to remove.' });
            } else {
                setMessage({ tone: 'ok', text: 'Listing removed.' });
                await refreshEntries();
            }
        } catch {
            setMessage({ tone: 'err', text: 'Network error — please try again.' });
        } finally {
            setRemovingId(null);
        }
    }

    const headerCopy = useMemo(() => {
        if (mode.kind === 'create') return { title: 'Add a verified site', subtitle: 'Each site needs its own GA4 property — we match the property\'s web stream against the host.' };
        if (mode.kind === 'edit') return { title: 'Edit listing', subtitle: 'Update the public profile or swap the connected GA4 property.' };
        return { title: 'Traffic Leaderboard', subtitle: 'Share verified GA4 traffic publicly. List as many of your sites as you like — each needs its own GA4 property.' };
    }, [mode.kind]);

    if (loading) {
        return (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading your leaderboard listings…
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-emerald-500/[0.12] bg-gradient-to-br from-emerald-500/[0.04] to-cyan-500/[0.02] p-4 sm:p-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {mode.kind !== 'list' ? (
                        <button
                            type="button"
                            onClick={backToList}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-400 transition hover:text-white"
                            aria-label="Back to listings"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                            <Trophy className="h-4 w-4 text-emerald-400" />
                        </div>
                    )}
                    <div>
                        <h2 className="text-sm font-semibold text-white">{headerCopy.title}</h2>
                        <p className="text-[10px] text-zinc-500">{headerCopy.subtitle}</p>
                    </div>
                </div>
                {mode.kind === 'list' && entries.length > 0 && (
                    <button
                        type="button"
                        onClick={startCreate}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add site
                    </button>
                )}
            </div>

            {message && (
                <div
                    className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                        message.tone === 'ok'
                            ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/15 bg-red-500/10 text-red-300'
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* List of entries */}
            {mode.kind === 'list' && (
                entries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.06] bg-black/20 p-6 text-center">
                        <p className="mx-auto max-w-sm text-sm text-zinc-400">
                            You haven&apos;t listed any sites yet. Connect a GA4 property and we&apos;ll verify it
                            against the website host — your listing goes live as soon as the match passes.
                        </p>
                        <button
                            type="button"
                            onClick={startCreate}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                            <Plus className="h-4 w-4" />
                            Add your first site
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {entries.map((entry) => (
                            <li
                                key={entry.id}
                                className="rounded-xl border border-white/[0.06] bg-black/20 p-4 transition hover:border-white/[0.1]"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <EntryThumb entry={entry} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate text-sm font-semibold text-white">
                                                    {entry.startup_name}
                                                </span>
                                                <StatusPill status={entry.verification_status} />
                                                {!entry.is_active && (
                                                    <span className="rounded-full border border-white/[0.1] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-500">
                                                        Inactive
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                                {entry.website_url && (
                                                    <span className="inline-flex items-center gap-1 truncate">
                                                        <Globe className="h-3 w-3" />
                                                        {entry.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                                    </span>
                                                )}
                                                {entry.ga_property_id && (
                                                    <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                                                        {entry.ga_property_id}
                                                    </span>
                                                )}
                                                <span className="text-zinc-400">
                                                    {formatNumber(entry.monthly_visitors)} visitors / 28d
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {entry.is_verified && (
                                            <a
                                                href={`/leaderboard/${entry.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/[0.12] hover:text-white"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                View
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setShowBadgeEmbed(showBadgeEmbed === entry.id ? null : entry.id)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/[0.12] hover:text-white"
                                        >
                                            <Code2 className="h-3 w-3" />
                                            Embed
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => startEdit(entry)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/[0.12] hover:text-white"
                                        >
                                            <Pencil className="h-3 w-3" />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(entry)}
                                            disabled={removingId === entry.id}
                                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/15 bg-red-500/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/[0.12] disabled:opacity-50"
                                        >
                                            {removingId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                {showBadgeEmbed === entry.id && (
                                    <BadgeEmbedBlock
                                        entryId={entry.id}
                                        copiedField={copiedField}
                                        onCopy={(field, value) => {
                                            navigator.clipboard.writeText(value);
                                            setCopiedField(field);
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                )
            )}

            {/* Create / edit form */}
            {(mode.kind === 'create' || mode.kind === 'edit') && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-400">Startup Name *</label>
                        <input
                            type="text"
                            value={form.startup_name}
                            onChange={(e) => setForm((p) => ({ ...p, startup_name: e.target.value }))}
                            placeholder="Acme Inc"
                            maxLength={100}
                            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-400">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            placeholder="What does your startup do? (200 chars)"
                            rows={2}
                            maxLength={200}
                            className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-400">Category</label>
                            <div className="relative">
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                                    className="w-full appearance-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-500/30 focus:outline-none"
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-400">Monthly Revenue (MRR)</label>
                            <div className="relative">
                                <select
                                    value={form.mrr_range}
                                    onChange={(e) => setForm((p) => ({ ...p, mrr_range: e.target.value }))}
                                    className="w-full appearance-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-500/30 focus:outline-none"
                                >
                                    {MRR_RANGES.map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400">
                            <ShieldCheck className="h-3 w-3 text-emerald-400" />
                            Google Analytics Property *
                        </label>
                        {properties.length > 0 ? (
                            <div className="relative">
                                <select
                                    value={form.ga_property_id}
                                    onChange={(e) => setForm((p) => ({ ...p, ga_property_id: e.target.value }))}
                                    className="w-full appearance-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-500/30 focus:outline-none"
                                >
                                    <option value="">Select a GA4 property…</option>
                                    {properties.map((p) => (
                                        <option key={p.property} value={p.property}>
                                            {p.displayName} ({p.property})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                            </div>
                        ) : (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-300">
                                No GA4 properties found. Connect Google Analytics from the Account tab first.
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400">
                                <Globe className="h-3 w-3" /> Website *
                            </label>
                            <input
                                type="text"
                                inputMode="url"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                value={form.website_url}
                                onChange={(e) => setForm((p) => ({ ...p, website_url: e.target.value }))}
                                placeholder="example.com or https://example.com"
                                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-400">
                                <Twitter className="h-3 w-3" /> X / Twitter
                            </label>
                            <input
                                type="text"
                                value={form.twitter_handle}
                                onChange={(e) => setForm((p) => ({ ...p, twitter_handle: e.target.value }))}
                                placeholder="@handle"
                                className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-400">Logo URL (optional — auto-fetched from your domain if empty)</label>
                        <input
                            type="text"
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            value={form.logo_url}
                            onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))}
                            placeholder="https://example.com/logo.png"
                            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-medium text-zinc-400">Interested In</label>
                        <div className="flex flex-wrap items-center gap-2">
                            {LOOKING_FOR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleLookingFor(opt.value)}
                                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                        form.looking_for.includes(opt.value)
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                            : 'border-white/[0.06] bg-black/20 text-zinc-500 hover:border-white/[0.1]'
                                    }`}
                                >
                                    {opt.emoji} {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={saving || !form.startup_name.trim() || !form.ga_property_id || !form.website_url.trim()}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                            {mode.kind === 'edit' ? 'Save changes' : 'Verify & list'}
                        </button>
                        <button
                            type="button"
                            onClick={backToList}
                            className="inline-flex min-h-[44px] items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-400 transition hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function BadgeEmbedBlock({
    entryId,
    copiedField,
    onCopy,
}: {
    entryId: number;
    copiedField: string | null;
    onCopy: (field: string, value: string) => void;
}) {
    const html = `<a href="https://trafficclaw.com/leaderboard/${entryId}" target="_blank" rel="noopener noreferrer">\n  <img src="https://trafficclaw.com/api/badges/${entryId}" alt="Verified on TrafficClaw" height="48" />\n</a>`;
    const md = `[![Verified on TrafficClaw](https://trafficclaw.com/api/badges/${entryId})](https://trafficclaw.com/leaderboard/${entryId})`;
    const htmlField = `html-${entryId}`;
    const mdField = `md-${entryId}`;
    return (
        <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">HTML</span>
                <button
                    type="button"
                    onClick={() => onCopy(htmlField, html)}
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-white"
                >
                    {copiedField === htmlField ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === htmlField ? 'Copied' : 'Copy HTML'}
                </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/40 p-2.5 font-mono text-[10px] leading-5 text-zinc-400">
                {html}
            </pre>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Markdown</span>
                <button
                    type="button"
                    onClick={() => onCopy(mdField, md)}
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-white"
                >
                    {copiedField === mdField ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === mdField ? 'Copied' : 'Copy Markdown'}
                </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/40 p-2.5 font-mono text-[10px] leading-5 text-zinc-400">
                {md}
            </pre>
            <div className="flex items-center gap-2">
                <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just got verified on TrafficClaw! https://trafficclaw.com/leaderboard/${entryId}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.05]"
                >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    Share on X
                </a>
                <button
                    type="button"
                    onClick={() => onCopy(`link-${entryId}`, `https://trafficclaw.com/leaderboard/${entryId}`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.05]"
                >
                    {copiedField === `link-${entryId}` ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === `link-${entryId}` ? 'Copied' : 'Copy link'}
                </button>
            </div>
        </div>
    );
}

