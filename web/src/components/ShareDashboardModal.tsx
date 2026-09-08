'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Link, Copy, Check, Share2, Eye, Trash2, Shield, Code2
} from 'lucide-react';
import { OVERVIEW_SHARE_CONFIG } from '@/lib/shareTypes';
import { BRAND_NAME } from '@/lib/brand';

/* ─── Types ─── */
interface ShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    technology?: boolean;
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

function getEmbedUrl(token: string): string {
    return `${getShareUrl(token)}?embed=true`;
}

function getEmbedIframeCode(token: string): string {
    return `<iframe src="${getEmbedUrl(token)}" width="100%" height="1200" style="border:none;border-radius:16px;max-width:100%;" loading="lazy"></iframe>`;
}

function upsertShareItem(shares: ShareItem[], incoming: ShareItem): ShareItem[] {
    const next = [incoming, ...shares.filter((share) => share.token !== incoming.token)];
    next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return next;
}

/* ─── Component ─── */
export default function ShareDashboardModal({ open, onClose, propertyId, siteUrl }: Props) {
    const [activeShares, setActiveShares] = useState<ShareItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshingShares, setRefreshingShares] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedToken, setSelectedToken] = useState<string | null>(null);

    const [config] = useState<ShareConfig>(OVERVIEW_SHARE_CONFIG);

    /* ─── Fetch active shares ─── */
    const fetchShares = useCallback(async (options?: { background?: boolean }) => {
        if (options?.background) {
            setRefreshingShares(true);
        } else {
            setLoading(true);
            setError(null);
        }
        try {
            const res = await fetch('/api/share');
            if (!res.ok) throw new Error('Failed to load shares');
            const data = await res.json();
            setActiveShares(data.shares || []);
        } catch (err) {
            console.error('Fetch shares error:', err);
            if (!options?.background) {
                setError('Failed to load active shares');
            }
        } finally {
            if (options?.background) {
                setRefreshingShares(false);
            } else {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchShares();
            setSelectedToken(null);
        }
    }, [open, fetchShares]);

    useEffect(() => {
        setSelectedToken((current) => {
            if (current && activeShares.some((share) => share.token === current)) {
                return current;
            }

            return activeShares[0]?.token ?? null;
        });
    }, [activeShares]);

    const selectedShare = useMemo(
        () => activeShares.find((share) => share.token === selectedToken) ?? null,
        [activeShares, selectedToken],
    );

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
            const createdShare = data.share as ShareItem | undefined;
            if (createdShare?.token) {
                setSelectedToken(createdShare.token);
                setActiveShares((prev) => upsertShareItem(prev, createdShare));
            }

            void fetchShares({ background: true });
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
        } catch (err) {
            console.error('Revoke all error:', err);
            setError('Failed to revoke shares');
        }
    };

    /* ─── Copy to clipboard ─── */
    const handleCopyValue = useCallback(async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch {
            setError('Failed to copy');
        }
    }, []);

    const handleCopyLink = useCallback((token: string) => {
        return handleCopyValue(`link:${token}`, getShareUrl(token));
    }, [handleCopyValue]);

    const handleCopyEmbedUrl = useCallback((token: string) => {
        return handleCopyValue(`embed-url:${token}`, getEmbedUrl(token));
    }, [handleCopyValue]);

    const handleCopyIframe = useCallback((token: string) => {
        return handleCopyValue(`iframe:${token}`, getEmbedIframeCode(token));
    }, [handleCopyValue]);

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
                                Share your analytics dashboard with a public link or embed it in another site. Anyone with the tokenized URL can view the shared data without logging in.
                            </p>

                            {selectedShare ? (
                                <div className="space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                                                Selected Share
                                            </div>
                                            <div className="mt-1 text-sm text-zinc-200">
                                                Created {formatDate(selectedShare.createdAt)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Eye className="h-3 w-3" />
                                                {selectedShare.views} views
                                            </span>
                                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                                                Active
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                                            <Link className="w-3 h-3" />
                                            Public Link
                                        </label>
                                        <div className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-white/[0.1]">
                                            <div className="flex-1 truncate bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-zinc-300 select-all">
                                                {getShareUrl(selectedShare.token)}
                                            </div>
                                            <button
                                                onClick={() => handleCopyLink(selectedShare.token)}
                                                className="flex items-center gap-1.5 border-l border-white/[0.1] bg-white/[0.06] px-3 text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200"
                                            >
                                                {copiedKey === `link:${selectedShare.token}` ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                                <span className="text-xs">{copiedKey === `link:${selectedShare.token}` ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                                            <Code2 className="w-3 h-3" />
                                            Embed URL
                                        </label>
                                        <div className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-white/[0.1]">
                                            <div className="flex-1 truncate bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-zinc-300 select-all">
                                                {getEmbedUrl(selectedShare.token)}
                                            </div>
                                            <button
                                                onClick={() => handleCopyEmbedUrl(selectedShare.token)}
                                                className="flex items-center gap-1.5 border-l border-white/[0.1] bg-white/[0.06] px-3 text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200"
                                            >
                                                {copiedKey === `embed-url:${selectedShare.token}` ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                                <span className="text-xs">{copiedKey === `embed-url:${selectedShare.token}` ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        </div>
                                        <p className="text-[11px] leading-5 text-zinc-500">
                                            Use the raw embed URL if you prefer to wire the iframe into your own layout or CMS component.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                                                <Code2 className="w-3 h-3" />
                                                Iframe Snippet
                                            </label>
                                            <button
                                                onClick={() => handleCopyIframe(selectedShare.token)}
                                                className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                                            >
                                                {copiedKey === `iframe:${selectedShare.token}` ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                                {copiedKey === `iframe:${selectedShare.token}` ? 'Copied' : 'Copy code'}
                                            </button>
                                        </div>
                                        <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-[11px] leading-5 text-cyan-300/80 whitespace-pre-wrap break-all">
                                            {getEmbedIframeCode(selectedShare.token)}
                                        </pre>
                                        <p className="text-[11px] leading-5 text-zinc-500">
                                            This default iframe uses a taller mobile-friendly height so stacked cards still have room to breathe on smaller screens.
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                                    OpenPanel-Style Overview
                                </p>
                                <p className="mt-2 text-sm text-zinc-300">
                                    New links open the interaction-first shared overview. The page keeps the
                                    OpenPanel-style connected dashboard behavior while staying wired to your real
                                    {BRAND_NAME} analytics data.
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
                                        {refreshingShares && (
                                            <span className="text-[10px] text-zinc-500 animate-pulse">
                                                Refreshing...
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {activeShares.map((share) => (
                                            <div
                                                key={share.token}
                                                onClick={() => setSelectedToken(share.token)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setSelectedToken(share.token);
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                                    selectedShare?.token === share.token
                                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                                                }`}
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
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void handleCopyLink(share.token);
                                                        }}
                                                        className="p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                                                        title="Copy link"
                                                    >
                                                        {copiedKey === `link:${share.token}` ? (
                                                            <Check className="w-3 h-3 text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void handleRevoke(share.token);
                                                        }}
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
                            {loading && activeShares.length === 0 && (
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
