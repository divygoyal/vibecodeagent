'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Link, Copy, Check, Share2, Eye, Trash2, Shield
} from 'lucide-react';
import { OVERVIEW_SHARE_CONFIG } from '@/lib/shareTypes';

/* ─── Types ─── */
interface ShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    seo: boolean;
    layoutMode?: 'legacy' | 'openpanel_overview' | 'umami_fork';
    shareProvider?: 'legacy' | 'openpanel_overview' | 'umami_fork';
    umamiWebsiteId?: string | null;
    umamiShareId?: string | null;
    umamiShareUrl?: string | null;
    umamiEnabledAt?: string | null;
    siteName?: string | null;
}

interface ShareItem {
    token: string;
    userId: string;
    propertyId: string;
    siteUrl: string;
    config: ShareConfig;
    views: number;
    createdAt: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    propertyId?: string;
    siteUrl?: string;
}

/* ─── Helpers ─── */
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function getShareUrl(token: string): string {
    if (typeof window === 'undefined') return `https://trafficclaw.com/share/${token}`;
    return `${window.location.origin}/share/${token}`;
}

/* ─── Component ─── */
export default function ShareDashboardModal({ open, onClose, propertyId, siteUrl }: Props) {
    const [activeShares, setActiveShares] = useState<ShareItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Data inclusion config
    const [config] = useState<ShareConfig>(OVERVIEW_SHARE_CONFIG);

    // Latest generated link
    const [latestToken, setLatestToken] = useState<string | null>(null);

    /* ─── Fetch active shares ─── */
    const fetchShares = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/share');
            if (!res.ok) throw new Error('Failed to load shares');
            const data = await res.json();
            setActiveShares(data.shares || []);
        } catch (err) {
            console.error('Fetch shares error:', err);
            setError('Failed to load active shares');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchShares();
            setLatestToken(null);
        }
    }, [open, fetchShares]);

    /* ─── Generate share link ─── */
    const handleGenerate = async () => {
        if (!propertyId) {
            setError('No analytics property selected. Connect Google Analytics first.');
            return;
        }

        setGenerating(true);
        setError(null);

        try {
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId,
                    siteUrl: siteUrl || '',
                    config,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create share link');
            }

            const data = await res.json();
            setLatestToken(data.share?.token || null);
            await fetchShares();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate link';
            setError(message);
        } finally {
            setGenerating(false);
        }
    };

    /* ─── Revoke a single share ─── */
    const handleRevoke = async (token: string) => {
        try {
            const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to revoke');
            setActiveShares((prev) => prev.filter((s) => s.token !== token));
            if (latestToken === token) setLatestToken(null);
        } catch (err) {
            console.error('Revoke error:', err);
            setError('Failed to revoke share');
        }
    };

    /* ─── Revoke all shares ─── */
    const handleRevokeAll = async () => {
        if (!activeShares.length) return;
        try {
            const res = await fetch('/api/share?all=true', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to revoke all');
            setActiveShares([]);
            setLatestToken(null);
        } catch (err) {
            console.error('Revoke all error:', err);
            setError('Failed to revoke shares');
        }
    };

    /* ─── Copy to clipboard ─── */
    const handleCopy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(getShareUrl(token));
            setCopied(token);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            setError('Failed to copy link');
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Modal */}
                    <motion.div
                        className="relative w-full max-w-lg bg-[#0a0a0f] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-emerald-500/10">
                                    <Share2 className="w-4 h-4 text-emerald-400" />
                                </div>
                                <h2 className="text-base font-semibold text-zinc-100">Share Dashboard</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                            {/* Description */}
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                Share your analytics dashboard with a public link. Anyone with the link can view your data — no login required.
                            </p>

                            {/* Latest generated link */}
                            {latestToken && (
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                                        <Link className="w-3 h-3" />
                                        Public Link
                                    </label>
                                    <div className="flex items-stretch gap-0 rounded-lg border border-white/[0.1] overflow-hidden">
                                        <div className="flex-1 px-3 py-2.5 bg-white/[0.03] text-xs text-zinc-300 font-mono truncate select-all">
                                            {getShareUrl(latestToken)}
                                        </div>
                                        <button
                                            onClick={() => handleCopy(latestToken)}
                                            className="px-3 bg-white/[0.06] hover:bg-white/[0.1] border-l border-white/[0.1] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
                                        >
                                            {copied === latestToken ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                            <span className="text-xs">{copied === latestToken ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                                    OpenPanel-Style Overview
                                </p>
                                <p className="mt-2 text-sm text-zinc-300">
                                    New links open the interaction-first shared overview. The page keeps the
                                    OpenPanel-style connected dashboard behavior while staying wired to your real
                                    TrafficClaw analytics data.
                                </p>
                            </div>

                            {/* Error message */}
                            {error && (
                                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                    {error}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Link className="w-3.5 h-3.5" />
                                    {generating ? 'Generating...' : 'Generate Link'}
                                </button>
                                {activeShares.length > 0 && (
                                    <button
                                        onClick={handleRevokeAll}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Revoke All
                                    </button>
                                )}
                            </div>

                            {/* Active shares list */}
                            {activeShares.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Shield className="w-3 h-3 text-zinc-500" />
                                        <label className="text-xs font-medium text-zinc-400">
                                            Active Shares ({activeShares.length})
                                        </label>
                                    </div>
                                    <div className="space-y-1.5">
                                        {activeShares.map((share) => (
                                            <div
                                                key={share.token}
                                                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs text-zinc-300 font-mono truncate">
                                                            {share.token.slice(0, 12)}...
                                                        </span>
                                                        <span className="text-[10px] text-zinc-600">
                                                            Created {formatDate(share.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5 shrink-0">
                                                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                                        <Eye className="w-3 h-3" />
                                                        {share.views}
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopy(share.token)}
                                                        className="p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                                                        title="Copy link"
                                                    >
                                                        {copied === share.token ? (
                                                            <Check className="w-3 h-3 text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleRevoke(share.token)}
                                                        className="p-1 rounded hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
                                                        title="Revoke"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Empty state */}
                            {!loading && activeShares.length === 0 && (
                                <div className="text-center py-3">
                                    <p className="text-xs text-zinc-600">No active shares. Generate a link to get started.</p>
                                </div>
                            )}

                            {/* Loading state */}
                            {loading && (
                                <div className="text-center py-3">
                                    <p className="text-xs text-zinc-500 animate-pulse">Loading shares...</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
