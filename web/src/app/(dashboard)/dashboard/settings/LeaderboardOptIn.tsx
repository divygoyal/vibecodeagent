'use client';

import { useState, useEffect } from 'react';
import {
    Trophy, ShieldCheck, ExternalLink, ChevronDown, Loader2,
    CheckCircle2, XCircle, Globe, Twitter
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

export default function LeaderboardOptIn() {
    const [status, setStatus] = useState<'loading' | 'idle' | 'joined' | 'error'>('loading');
    const [saving, setSaving] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [message, setMessage] = useState('');
    const [properties, setProperties] = useState<GAProperty[]>([]);

    // Form state
    const [form, setForm] = useState({
        startup_name: '',
        description: '',
        website_url: '',
        logo_url: '',
        category: 'SaaS',
        mrr_range: '$0-500',
        looking_for: [] as string[],
        twitter_handle: '',
        ga_property_id: '',
    });

    useEffect(() => {
        fetchStatus();
        fetchProperties();
    }, []);

    async function fetchStatus() {
        try {
            const res = await fetch('/api/leaderboard/join');
            const data = await res.json();
            if (data.joined) {
                setForm({
                    startup_name: data.startup_name || '',
                    description: data.description || '',
                    website_url: data.website_url || '',
                    logo_url: data.logo_url || '',
                    category: data.category || 'SaaS',
                    mrr_range: data.mrr_range || '$0-500',
                    looking_for: data.looking_for || [],
                    twitter_handle: data.twitter_handle || '',
                    ga_property_id: data.ga_property_id || '',
                });
                setStatus(data.is_active ? 'joined' : 'idle');
            } else {
                setStatus('idle');
            }
        } catch {
            setStatus('idle');
        }
    }

    async function fetchProperties() {
        try {
            const res = await fetch('/api/analytics?mode=list');
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                setProperties(data);
                // Auto-select first property if none selected
                setForm(prev => ({
                    ...prev,
                    ga_property_id: prev.ga_property_id || data[0].property,
                }));
            }
        } catch {
            // Not critical
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.startup_name.trim()) {
            setMessage('Startup name is required');
            return;
        }

        setSaving(true);
        setMessage('');

        try {
            const res = await fetch('/api/leaderboard/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const data = await res.json();
            if (data.success) {
                setStatus('joined');
                setMessage('🎉 You\'re on the leaderboard!');
            } else {
                setMessage(data.detail || data.error || 'Failed to join leaderboard');
            }
        } catch {
            setMessage('Network error — please try again');
        } finally {
            setSaving(false);
        }
    }

    async function handleLeave() {
        if (!confirm('Are you sure you want to leave the leaderboard?')) return;

        setLeaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/leaderboard/join', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setStatus('idle');
                setForm({
                    startup_name: '',
                    description: '',
                    website_url: '',
                    logo_url: '',
                    category: 'SaaS',
                    mrr_range: '$0-500',
                    looking_for: [],
                    twitter_handle: '',
                    ga_property_id: '',
                });
                setMessage('✅ You\'ve been removed from the leaderboard');
            } else {
                setMessage(data.detail || data.error || 'Failed to leave leaderboard');
            }
        } catch {
            setMessage('Network error — please try again');
        } finally {
            setLeaving(false);
        }
    }

    function toggleLookingFor(value: string) {
        setForm(prev => ({
            ...prev,
            looking_for: prev.looking_for.includes(value)
                ? prev.looking_for.filter(v => v !== value)
                : [...prev.looking_for, value],
        }));
    }

    if (status === 'loading') {
        return (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                    <span className="text-sm text-zinc-500">Loading leaderboard status...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-emerald-500/[0.04] to-cyan-500/[0.02] border border-emerald-500/[0.12] rounded-2xl p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-white">Traffic Leaderboard</h2>
                        <p className="text-[10px] text-zinc-500">Share your verified GA4 analytics publicly</p>
                    </div>
                </div>
                {status === 'joined' && (
                    <span className="text-[10px] bg-emerald-400/10 text-emerald-400 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Listed
                    </span>
                )}
            </div>

            {/* Message */}
            {message && (
                <div className={`text-xs px-3 py-2 rounded-lg mb-4 ${
                    message.includes('🎉') || message.includes('✅')
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                        : 'bg-red-500/10 text-red-400 border border-red-500/15'
                }`}>
                    {message}
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Startup Name */}
                <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Startup Name *</label>
                    <input
                        type="text"
                        value={form.startup_name}
                        onChange={(e) => setForm(prev => ({ ...prev, startup_name: e.target.value }))}
                        placeholder="Acme Inc"
                        maxLength={100}
                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Description</label>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="What does your startup do?"
                        rows={2}
                        maxLength={200}
                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 transition resize-none"
                    />
                </div>

                {/* Category + MRR */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">Category</label>
                        <div className="relative">
                            <select
                                value={form.category}
                                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full appearance-none bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-sm text-white cursor-pointer focus:outline-none focus:border-emerald-500/30 transition"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">Monthly Revenue (MRR)</label>
                        <div className="relative">
                            <select
                                value={form.mrr_range}
                                onChange={(e) => setForm(prev => ({ ...prev, mrr_range: e.target.value }))}
                                className="w-full appearance-none bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-sm text-white cursor-pointer focus:outline-none focus:border-emerald-500/30 transition"
                            >
                                {MRR_RANGES.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* GA Property */}
                {properties.length > 0 && (
                    <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">
                            <ShieldCheck className="w-3 h-3 inline mr-1 text-emerald-400" />
                            Google Analytics Property
                        </label>
                        <div className="relative">
                            <select
                                value={form.ga_property_id}
                                onChange={(e) => setForm(prev => ({ ...prev, ga_property_id: e.target.value }))}
                                className="w-full appearance-none bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 pr-8 text-sm text-white cursor-pointer focus:outline-none focus:border-emerald-500/30 transition"
                            >
                                {properties.map(p => (
                                    <option key={p.property} value={p.property}>
                                        {p.displayName} ({p.property})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* Website + Twitter */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">
                            <Globe className="w-3 h-3 inline mr-1" /> Website
                        </label>
                        <input
                            type="url"
                            value={form.website_url}
                            onChange={(e) => setForm(prev => ({ ...prev, website_url: e.target.value }))}
                            placeholder="https://example.com"
                            className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">
                            <Twitter className="w-3 h-3 inline mr-1" /> X / Twitter
                        </label>
                        <input
                            type="text"
                            value={form.twitter_handle}
                            onChange={(e) => setForm(prev => ({ ...prev, twitter_handle: e.target.value }))}
                            placeholder="@handle"
                            className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                        />
                    </div>
                </div>

                {/* Logo URL */}
                <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Logo URL (optional)</label>
                    <input
                        type="url"
                        value={form.logo_url}
                        onChange={(e) => setForm(prev => ({ ...prev, logo_url: e.target.value }))}
                        placeholder="https://example.com/logo.png"
                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                    />
                </div>

                {/* Looking For */}
                <div>
                    <label className="text-xs font-medium text-zinc-400 mb-2 block">Interested In</label>
                    <div className="flex items-center gap-2">
                        {LOOKING_FOR_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleLookingFor(opt.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                    form.looking_for.includes(opt.value)
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-black/20 text-zinc-500 border-white/[0.06] hover:border-white/[0.1]'
                                }`}
                            >
                                {opt.emoji} {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={saving || !form.startup_name.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trophy className="w-4 h-4" />
                        )}
                        {status === 'joined' ? 'Update Listing' : 'Join Leaderboard'}
                    </button>

                    {status === 'joined' && (
                        <>
                            <a
                                href="/leaderboard"
                                target="_blank"
                                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-medium text-zinc-400 border border-white/[0.06] rounded-xl hover:text-white hover:border-white/[0.1] transition"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View Leaderboard
                            </a>
                            <button
                                type="button"
                                onClick={handleLeave}
                                disabled={leaving}
                                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-medium text-red-400 border border-red-500/[0.15] rounded-xl hover:bg-red-500/[0.08] transition disabled:opacity-50"
                            >
                                {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                Leave
                            </button>
                        </>
                    )}
                </div>
            </form>
        </div>
    );
}
