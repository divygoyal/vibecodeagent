'use client';

import { Suspense, useState, useRef, useEffect, useCallback, useMemo, memo, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Globe, ChevronDown, Loader2, ArrowUp, ArrowRight, RotateCcw, Sparkles, Lock, Github, X, Plug
} from 'lucide-react';
import { useContainerStatus, usePropertyList, useAnalyticsData, useSeoData, useSiteRepoLinks, useGithubRepos, type SiteRepoLink, type GithubRepoLite } from '@/lib/useDashboardData';
import { findBestRepoMatch } from '@/lib/githubApi';
import { useRegistration } from '../layout';
import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { buildAnalyticsContext, buildSeoContext, buildSnapshot } from '@/lib/chatUtils';
import { useChatStore, persistMessage, getOrCreateThreadId, type ChatMessage } from '@/stores/chatStore';
import { ReasoningTrace, narrateToolStart, narrateToolResult, type TraceLine } from '@/components/chat/ReasoningTrace';
import { ConnectorIntentNudge } from '@/components/chat/ConnectorIntentNudge';

type DashboardSiteOption = {
    siteUrl: string;
};

type DashboardPropertyOption = {
    displayName?: string;
    propertyId?: string;
    property?: string;
};

/** Quick-prompt chips — single source of truth for the empty-state hero
 *  chips AND the chat-active footer chips. Same 8 emoji-prefixed prompts
 *  the floating chat widget shows so the visual language stays consistent. */
const QUICK_PROMPTS: readonly string[] = [
    '🎯 What is the ONE thing I should do today to grow?',
    '🚨 Why did my traffic drop?',
    '💰 Which pages are money pits? (high impressions, low clicks)',
    '📈 Keywords on page 2 I can push to page 1',
    '📝 Give me 5 blog post ideas based on my data',
    '📊 Grade my SEO (A-F)',
    '⚡ Are my Core Web Vitals hurting my rankings?',
    '🔮 Growth opportunities I am missing',
] as const;

type ConnectorName = 'github' | 'wordpress' | 'vercel' | 'ga4' | 'gsc';

const CONNECTOR_LABELS: Record<ConnectorName, string> = {
    github: 'GitHub',
    wordpress: 'WordPress',
    vercel: 'Vercel',
    ga4: 'Google Analytics',
    gsc: 'Search Console',
};

const CONNECTOR_DESCRIPTIONS: Record<ConnectorName, string> = {
    github: 'Read your repos, recent commits, PRs, issues, and CI runs so the AI can correlate code changes with traffic events.',
    wordpress: 'Read posts, drafts, and plugins. Correlate publish dates with ranking changes.',
    vercel: 'Correlate deploys, build failures, and edge logs with traffic events.',
    ga4: 'Read GA4 sessions, events, and conversions to power deep traffic diagnostics.',
    gsc: 'Read Google Search Console queries, pages, and impressions for SEO analysis.',
};

const COMING_SOON: ReadonlySet<ConnectorName> = new Set<ConnectorName>(['wordpress', 'vercel']);

// Provider used when initiating OAuth from a connector orb. ga4/gsc both come from Google.
function nativeProviderFor(name: ConnectorName): 'github' | 'google' | null {
    if (COMING_SOON.has(name)) return null;
    if (name === 'github') return 'github';
    return 'google';
}

function ConnectorIcon({ name, className = 'h-4 w-4' }: { name: ConnectorName; className?: string }) {
    switch (name) {
        case 'github':
            return <Github className={className} />;
        case 'wordpress':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M3 12a9 9 0 0 0 5.2 8.15L4.6 9.65A8.96 8.96 0 0 0 3 12Z" fill="currentColor" />
                    <path d="M19.6 7.7a8.96 8.96 0 0 1 .9 8.7l-3.6-9.85a4 4 0 0 1 2.7 1.15Z" fill="currentColor" opacity="0.85" />
                    <path d="M11 4.4 14 13l-1.7 5.4a9 9 0 0 0 5.6-2.1L13.4 4.5l-2.4-.1Z" fill="currentColor" opacity="0.7" />
                </svg>
            );
        case 'vercel':
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M12 3 22 20H2L12 3Z" />
                </svg>
            );
        case 'ga4':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <rect x="4" y="11" width="4" height="9" rx="1.5" fill="#F9AB00" />
                    <rect x="10" y="7" width="4" height="13" rx="1.5" fill="#F9AB00" opacity="0.85" />
                    <rect x="16" y="3" width="4" height="17" rx="1.5" fill="#E37400" />
                </svg>
            );
        case 'gsc':
            return (
                <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
                    <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="14.5" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m16 15.5 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            );
    }
}

/* ─────────────────────────────────────────────────────────────────────
 *  Cosmic background — twinkling stars + shooting stars (Grok-vibe)
 * ───────────────────────────────────────────────────────────────────── */

type Star = { id: number; x: number; y: number; size: number; opMin: number; opMax: number; dur: number; delay: number };

const StarField = memo(function StarField() {
    // Generated client-side to avoid SSR hydration mismatch from Math.random().
    const [stars, setStars] = useState<Star[]>([]);
    useEffect(() => {
        setStars(
            Array.from({ length: 110 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 1.6 + 0.4,
                opMin: Math.random() * 0.15 + 0.05,
                opMax: Math.random() * 0.55 + 0.4,
                dur: Math.random() * 4 + 3,
                delay: Math.random() * 6,
            })),
        );
    }, []);

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {stars.map((s) => (
                <span
                    key={s.id}
                    className="tc-star"
                    style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        ['--tw-opacity-min' as any]: s.opMin,
                        ['--tw-opacity-max' as any]: s.opMax,
                        ['--twinkle-dur' as any]: `${s.dur}s`,
                        ['--twinkle-delay' as any]: `${s.delay}s`,
                    } as CSSProperties}
                />
            ))}
        </div>
    );
});

/* ─────────────────────────────────────────────────────────────────────
 *  ConnectorPill — horizontal pill (logo + name + status dot)
 *  Used in the new top-of-hero row. Replaces the vertical rail orbs.
 * ───────────────────────────────────────────────────────────────────── */
function ConnectorPill({ name, connected, isOpen, onClick }: { name: ConnectorName; connected: boolean; isOpen: boolean; onClick: () => void }) {
    const tooltip = `${CONNECTOR_LABELS[name]} · ${connected ? 'Connected · click to manage' : 'Click to connect'}`;
    const active = isOpen;
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            title={tooltip}
            aria-label={tooltip}
            aria-expanded={isOpen}
            data-testid={`connector-pill-${name}`}
            style={{ pointerEvents: 'auto' }}
            className={`group relative z-20 inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full border px-3.5 transition-all duration-150
                ${active
                    ? 'border-cyan-400/50 bg-[#0e1218] shadow-[0_0_0_3px_rgba(34,211,238,0.15)]'
                    : 'border-white/[0.10] bg-[#0a0d12] hover:border-cyan-400/30 hover:bg-[#11161d] hover:scale-[1.03] active:scale-[0.98]'}`}
        >
            <span className="pointer-events-none relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-[#141a23] to-[#06090d] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <ConnectorIcon name={name} className="h-4 w-4 text-white" />
            </span>
            <span className="pointer-events-none text-[13px] font-medium text-zinc-100">{CONNECTOR_LABELS[name]}</span>
            <span
                aria-hidden
                className={`pointer-events-none ml-1 h-2 w-2 shrink-0 rounded-full ${
                    connected
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85),0_0_14px_rgba(52,211,153,0.35)]'
                        : 'bg-zinc-700'
                }`}
            />
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  ConnectorOrb — globe-on-hover sphere with click-to-open card
 *  (legacy — kept for any code that still references it; new layout uses ConnectorPill)
 * ───────────────────────────────────────────────────────────────────── */
function ConnectorOrb({ name, connected, isOpen, onClick }: { name: ConnectorName; connected: boolean; isOpen: boolean; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    const tooltip = `${CONNECTOR_LABELS[name]} · click for details`;
    const active = hovered || isOpen;
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            title={tooltip}
            aria-label={tooltip}
            aria-expanded={isOpen}
            style={{ perspective: 800 }}
            className="relative inline-flex h-12 w-12 items-center justify-center outline-none"
        >
            {/* Always-on faint glow — signals interactivity at a glance */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full opacity-50"
                style={{
                    background:
                        'radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 65%)',
                    filter: 'blur(8px)',
                }}
            />

            {/* Atmospheric glow ring — brightens on hover/open */}
            <motion.span
                aria-hidden
                animate={{ opacity: active ? 1 : 0, scale: active ? 1.7 : 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                    background:
                        'radial-gradient(circle, rgba(34,211,238,0.55) 0%, rgba(122,217,218,0.22) 38%, transparent 72%)',
                    filter: 'blur(12px)',
                }}
            />

            {/* Outer wrapper handles scale */}
            <motion.span
                animate={{ scale: active ? 1.28 : 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative inline-flex h-12 w-12 items-center justify-center"
            >
                {/* Inner sphere — continuous rotateY while hovered */}
                <motion.span
                    animate={hovered ? { rotateY: 360 } : { rotateY: 0 }}
                    transition={
                        hovered
                            ? { duration: 3.2, repeat: Infinity, ease: 'linear' }
                            : { duration: 0.6, ease: 'easeOut' }
                    }
                    style={{ transformStyle: 'preserve-3d' }}
                    className="relative inline-flex h-12 w-12 items-center justify-center rounded-full
                               border border-white/[0.12] bg-gradient-to-b from-[#141a23] to-[#06090d]
                               shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-2px_4px_rgba(0,0,0,0.55),0_6px_16px_rgba(0,0,0,0.5)]"
                >
                    <ConnectorIcon name={name} className={`h-[18px] w-[18px] ${connected ? 'text-zinc-100' : 'text-zinc-400'}`} />
                    {/* Sphere lighting — top-left highlight */}
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full"
                        style={{
                            background:
                                'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18) 0%, transparent 50%)',
                        }}
                    />
                </motion.span>

                {/* Status dot — sits outside the rotating sphere so it stays steady */}
                <span
                    aria-hidden
                    className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black ${
                        connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]' : 'bg-zinc-700'
                    }`}
                />
            </motion.span>

            {/* Hover label — slides in to the right of the orb; hides while the click-card is open */}
            <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: hovered && !isOpen ? 1 : 0, x: hovered && !isOpen ? 0 : -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                style={{ y: '-50%' }}
                className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 whitespace-nowrap rounded-md border border-white/[0.08] bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-zinc-100 shadow-[0_8px_20px_rgba(0,0,0,0.55)]"
            >
                {CONNECTOR_LABELS[name]}
            </motion.span>
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  ConnectorCard — popover next to the orb with native Connect button
 * ───────────────────────────────────────────────────────────────────── */
function ConnectorCard({ name, connected, onClose, onDisconnected, placement = 'right' }: { name: ConnectorName; connected: boolean; onClose: () => void; onDisconnected?: (provider?: 'github' | 'google', connected?: boolean) => void; placement?: 'right' | 'below' | 'left' }) {
    const isComingSoon = COMING_SOON.has(name);
    const targetProvider = nativeProviderFor(name);
    const [disconnecting, setDisconnecting] = useState(false);
    const [connecting, setConnecting] = useState(false);

    // Warm TLS to github.com the moment the card opens — by the time the user
    // hits Connect, the handshake is already done so the redirect lands faster.
    useEffect(() => {
        if (connected || isComingSoon || targetProvider !== 'github') return;
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = 'https://github.com';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, [connected, isComingSoon, targetProvider]);

    // Google still uses signIn() (NextAuth client). GitHub App uses a native
    // anchor below — JS-triggered window.location.href was racing against
    // React re-renders and producing "click did nothing" cases.
    const handleGoogleConnect = () => {
        if (connecting) return;
        setConnecting(true);
        const callbackUrl = `/dashboard/ai-chat?connected=google`;
        void signIn('google', { callbackUrl }, { prompt: 'select_account consent' });
    };

    const handleDisconnect = async () => {
        if (name !== 'github') return;
        if (disconnecting) return;
        setDisconnecting(true);
        try {
            const res = await fetch('/api/github-app/disconnect', { method: 'POST' });
            if (res.ok) {
                toast.success('GitHub disconnected. To fully revoke access, also uninstall on github.com/settings/installations.');
                onDisconnected?.('github', false);
                onClose();
            } else {
                toast.error('Failed to disconnect GitHub.');
            }
        } catch {
            toast.error('Failed to disconnect GitHub.');
        } finally {
            setDisconnecting(false);
        }
    };

    const statusBadge = connected
        ? { label: 'Connected', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' }
        : isComingSoon
            ? { label: 'Coming soon', className: 'bg-zinc-800 text-zinc-400 border-white/[0.06]' }
            : { label: 'Not connected', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };

    const positionClass = placement === 'right'
        ? 'left-16 top-1/2 -translate-y-1/2'
        : placement === 'left'
            ? 'right-[calc(100%+10px)] top-1/2 -translate-y-1/2'
            : 'left-1/2 top-[calc(100%+10px)] -translate-x-1/2';
    const initialOffset = placement === 'right'
        ? { x: -12, y: '-50%' as const }
        : placement === 'left'
            ? { x: 12, y: '-50%' as const }
            : { x: '-50%' as const, y: -12 };
    const animateOffset = placement === 'right' || placement === 'left'
        ? { x: 0, y: '-50%' as const }
        : { x: '-50%' as const, y: 0 };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97, ...initialOffset }}
            animate={{ opacity: 1, scale: 1, ...animateOffset }}
            exit={{ opacity: 0, scale: 0.97, ...initialOffset }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label={`${CONNECTOR_LABELS[name]} connection`}
            className={`absolute z-30 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-white/[0.10] bg-[#0d1117]/98
                       p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur ${positionClass}`}
        >
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0a0d12]">
                    <ConnectorIcon name={name} className="h-4 w-4 text-zinc-100" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold text-white">{CONNECTOR_LABELS[name]}</span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="-mr-1 -mt-0.5 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{CONNECTOR_DESCRIPTIONS[name]}</p>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge.className}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : isComingSoon ? 'bg-zinc-600' : 'bg-amber-400'}`} />
                    {statusBadge.label}
                </span>
                {connected ? (
                    name === 'github' ? (
                        <button
                            type="button"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                    ) : (
                        <Link
                            href="/dashboard/settings"
                            className="text-[12px] font-medium text-zinc-300 transition-colors hover:text-white"
                        >
                            Manage →
                        </Link>
                    )
                ) : isComingSoon ? (
                    <button
                        type="button"
                        disabled
                        className="cursor-not-allowed rounded-full bg-zinc-800 px-3 py-1.5 text-[12px] font-medium text-zinc-500"
                    >
                        Coming soon
                    </button>
                ) : targetProvider === 'github' ? (
                    // Native anchor → browser starts navigation IMMEDIATELY on click,
                    // not after a React event-loop turn. setConnecting flips the label
                    // synchronously so the user sees instant feedback while the
                    // server-side route + GitHub redirect resolves.
                    <a
                        href="/api/auth/github-app/install"
                        onClick={() => setConnecting(true)}
                        aria-disabled={connecting}
                        className={`inline-flex items-center gap-1.5 rounded-full bg-[#22d3ee] px-3.5 py-1.5 text-[12px] font-semibold text-[#06141a]
                                   shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_2px_8px_rgba(34,211,238,0.30)]
                                   transition-all hover:brightness-110 ${connecting ? 'pointer-events-none opacity-80' : ''}`}
                    >
                        {connecting ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Opening GitHub…
                            </>
                        ) : (
                            <>Connect GitHub</>
                        )}
                    </a>
                ) : (
                    <button
                        type="button"
                        onClick={handleGoogleConnect}
                        disabled={connecting}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#22d3ee] px-3.5 py-1.5 text-[12px] font-semibold text-[#06141a]
                                   shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_2px_8px_rgba(34,211,238,0.30)]
                                   transition-all hover:brightness-110 disabled:opacity-80 disabled:cursor-not-allowed"
                    >
                        {connecting ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Connecting…
                            </>
                        ) : (
                            <>Connect {CONNECTOR_LABELS[name]}</>
                        )}
                    </button>
                )}
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  RepoPicker — dropdown pill paired with the site picker
 * ───────────────────────────────────────────────────────────────────── */
function RepoPicker({
    innerRef, open, onToggle, selectedRepo, isAuto, repos, githubNotConnected, hasGithubConnection, onPick,
}: {
    innerRef: React.RefObject<HTMLDivElement | null>;
    open: boolean;
    onToggle: () => void;
    selectedRepo: string | null;
    isAuto: boolean;
    repos: readonly GithubRepoLite[];
    githubNotConnected: boolean;
    hasGithubConnection: boolean;
    onPick: (full: string) => void;
}) {
    const repoLabel = selectedRepo ? selectedRepo.split('/').pop() : 'Link repo';
    const disabled = !hasGithubConnection || githubNotConnected;

    return (
        <div className="relative" ref={innerRef}>
            <button
                type="button"
                onClick={onToggle}
                disabled={disabled}
                title={disabled ? 'Connect GitHub from the orb rail to pick a repo' : selectedRepo || 'Pick a repo'}
                className={`inline-flex h-9 items-center gap-2 rounded-full border bg-transparent px-3 text-[12px] transition-colors
                    ${disabled
                        ? 'border-white/[0.05] text-zinc-600 cursor-not-allowed'
                        : 'border-white/[0.08] text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-zinc-100'}`}
            >
                <Github className={`h-3.5 w-3.5 ${disabled ? 'text-zinc-600' : 'text-zinc-400'}`} />
                <span className="max-w-[120px] truncate">{repoLabel}</span>
                {isAuto && selectedRepo && (
                    <span className="rounded-full bg-cyan-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-cyan-300">
                        auto
                    </span>
                )}
                {!disabled && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
            </button>
            {open && !disabled && (
                <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[300px] w-[320px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c0f14] py-1 shadow-2xl shadow-black/70">
                    {repos.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-zinc-500">No repos found.</div>
                    ) : (
                        repos.map((r) => {
                            const active = r.full_name === selectedRepo;
                            return (
                                <button
                                    key={r.full_name}
                                    onClick={() => onPick(r.full_name)}
                                    className={`block w-full truncate px-4 py-2.5 text-left text-xs transition-colors ${
                                        active ? 'bg-cyan-500/[0.10] text-cyan-300' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                                    }`}
                                    title={r.description || r.full_name}
                                >
                                    <span className="font-medium">{r.full_name.split('/').pop()}</span>
                                    <span className="ml-2 text-[10px] text-zinc-600">{r.full_name.split('/')[0]}</span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  ProviderConnectionCallback — handles ?connected=... after OAuth redirect
 *  Lives in its own component so useSearchParams is isolated under <Suspense>.
 * ───────────────────────────────────────────────────────────────────── */
function ProviderConnectionCallback({ onConnected }: { onConnected: (provider?: 'github' | 'google', connected?: boolean) => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    // One-shot guards — prevent re-firing toasts when searchParams or onConnected
    // identity changes mid-render, or when React enters a recovery loop after an
    // unrelated hydration error.
    const handledOAuthRef = useRef(false);
    const handledInstallRef = useRef(false);

    // Handle ?connected=github|google (legacy NextAuth OAuth callback path).
    useEffect(() => {
        if (handledOAuthRef.current) return;
        const connected = searchParams.get('connected');
        if (connected !== 'github' && connected !== 'google') return;
        handledOAuthRef.current = true;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: connected }),
                });
                if (!cancelled) {
                    if (res.ok) {
                        toast.success(connected === 'github' ? 'GitHub connected' : 'Google connected');
                        onConnected(connected, true);
                    } else {
                        toast.error(`Failed to register ${connected} connection.`);
                    }
                }
            } catch {
                if (!cancelled) toast.error(`Failed to register ${connected} connection.`);
            } finally {
                if (!cancelled) {
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('connected');
                    const qs = params.toString();
                    router.replace(`/dashboard/ai-chat${qs ? `?${qs}` : ''}`);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, router, onConnected]);

    // Handle ?installed=ok|error|invalid_state|... (Phase 2 GitHub App install callback).
    useEffect(() => {
        if (handledInstallRef.current) return;
        const installed = searchParams.get('installed');
        if (!installed) return;
        handledInstallRef.current = true;

        if (installed === 'ok') {
            toast.success('GitHub App installed');
            onConnected('github', true);
        } else if (installed === 'invalid_state') {
            toast.error('Install link expired — please retry from Settings.');
        } else if (installed === 'admin_failed' || installed === 'admin_misconfigured') {
            const why = searchParams.get('why');
            toast.error(why ? `Install failed: ${why}` : 'Server failed to record the install.');
        } else {
            toast.error('GitHub App install failed.');
        }
        const params = new URLSearchParams(searchParams.toString());
        params.delete('installed');
        params.delete('action');
        params.delete('why');
        const qs = params.toString();
        router.replace(`/dashboard/ai-chat${qs ? `?${qs}` : ''}`);
    }, [searchParams, router, onConnected]);

    return null;
}

/**
 * AutoPromptFromQuery — when the page is opened with ?q=<text>
 * (e.g. from an alert in the bell, or from a report-email "Run AI
 * investigation" CTA), auto-send the question once and scrub the URL.
 * Suspense-isolated like ProviderConnectionCallback.
 *
 * Workspace switch: callers can pass &property=<id>&site=<url> alongside
 * ?q to force the chat into a specific workspace before firing the
 * question. This is critical for report-email CTAs — the email is about
 * property A, the user might currently be on workspace B; without the
 * switch, the AI would answer using B's data and confuse everyone.
 * On switch we surface a toast so the user knows what happened.
 */
function AutoPromptFromQuery({ onPrompt }: { onPrompt: (q: string, opts?: { fromTag?: string }) => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const {
        selectedProperty,
        selectedSite,
        saveWorkspace,
        isWorkspaceLoaded,
    } = useRegistration();
    const firedRef = useRef(false);

    useEffect(() => {
        if (firedRef.current) return;
        // Wait for the saved workspace to load — otherwise selectedProperty/Site
        // are still '' and we'd unconditionally trigger a switch on every load.
        if (!isWorkspaceLoaded) return;
        const q = searchParams.get('q');
        if (!q || !q.trim()) return;
        firedRef.current = true;

        const reqProperty = (searchParams.get('property') || '').trim();
        const reqSite = (searchParams.get('site') || '').trim();
        // __from carries the SEO-surface tag (e.g. "seo:cannibalization") so the
        // chat backend can force the right tool to fire first. Stripped from
        // the URL alongside q/property/site to keep refresh idempotent.
        const reqFromTag = (searchParams.get('__from') || '').trim() || undefined;
        const needSwitch =
            (reqProperty && reqProperty !== selectedProperty) ||
            (reqSite && reqSite !== selectedSite);

        // Scrub everything we just consumed so a refresh / back nav doesn't re-fire.
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        params.delete('property');
        params.delete('site');
        params.delete('__from');
        const qs = params.toString();
        router.replace(`/dashboard/ai-chat${qs ? `?${qs}` : ''}`);

        const labelFromSite = (s: string) =>
            s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

        // Pre-flight validation: confirm the property/site from the email
        // are still in the user's GA4 + GSC inventory. Catches the case where
        // the admin sent a report for property X but the user has since
        // revoked Google permission or removed it from their account.
        // Without this, saveWorkspace blindly persists a stale ID and the
        // first chat tool fails with a confusing 403 / "no data" answer.
        const validateInventory = async (): Promise<{ propertyOk: boolean; siteOk: boolean }> => {
            try {
                const [propRes, siteRes] = await Promise.all([
                    fetch('/api/analytics/properties', {
                        cache: 'no-store',
                        signal: AbortSignal.timeout(5_000),
                    }),
                    fetch('/api/seo/sites', {
                        cache: 'no-store',
                        signal: AbortSignal.timeout(5_000),
                    }),
                ]);
                const propJson = propRes.ok ? await propRes.json() : null;
                const siteJson = siteRes.ok ? await siteRes.json() : null;
                const properties: unknown[] = Array.isArray(propJson?.properties) ? propJson.properties : [];
                const sites: unknown[] = Array.isArray(siteJson?.sites) ? siteJson.sites : [];
                const propertyIds = properties
                    .map((p) => (p as { property?: string }).property)
                    .filter((x): x is string => typeof x === 'string' && x.length > 0);
                const siteUrls = sites
                    .map((s) => (s as { siteUrl?: string }).siteUrl)
                    .filter((x): x is string => typeof x === 'string' && x.length > 0);
                return {
                    propertyOk: !reqProperty || propertyIds.includes(reqProperty),
                    siteOk: !reqSite || siteUrls.includes(reqSite),
                };
            } catch {
                // Inventory fetch failed — fail-open and let saveWorkspace try
                // anyway. Worse case: the chat tools surface a 403/no-data
                // error like they would without this guard.
                return { propertyOk: true, siteOk: true };
            }
        };

        const fire = async () => {
            if (needSwitch && reqProperty && reqSite) {
                const { propertyOk, siteOk } = await validateInventory();
                if (!propertyOk || !siteOk) {
                    toast.warning(
                        `${labelFromSite(reqSite)} is no longer available — answering with your current workspace instead.`,
                    );
                } else {
                    try {
                        const ok = await saveWorkspace({ property: reqProperty, site: reqSite });
                        if (ok) {
                            toast.info(`Switched workspace to ${labelFromSite(reqSite)}`);
                        }
                    } catch {
                        /* best-effort — fall through to fire onPrompt anyway */
                    }
                }
            }
            // Tiny delay so the scroll/layout settles + dataReady + workspace
            // context propagates to the chat tools that read selectedProperty.
            setTimeout(() => onPrompt(q, { fromTag: reqFromTag }), 350);
        };
        void fire();
    }, [searchParams, router, onPrompt, saveWorkspace, selectedProperty, selectedSite, isWorkspaceLoaded]);
    return null;
}

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Searching your data',
    run_ga4_report: 'Querying analytics',
    run_page_audit: 'Running audit',
    fetch_page_html: 'Reading the page',
    calculate_revenue_impact: 'Calculating revenue',
    generate_content_strategy: 'Building strategy',
    analyze_keyword_clusters: 'Clustering keywords',
    compare_time_periods: 'Comparing periods',
    find_cannibalization: 'Checking cannibalization',
    suggest_internal_links: 'Finding links',
    generate_meta_tags: 'Generating tags',
    run_realtime_report: 'Checking live visitors',
    get_custom_dimensions: 'Loading custom tracking',
    list_user_repos: 'Listing GitHub repos',
    get_repo_health: 'Checking repo health',
    search_repo_code: 'Searching code',
    get_recent_commits: 'Reading recent commits',
    get_pull_requests: 'Reviewing pull requests',
    get_repo_issues: 'Checking GitHub issues',
    get_workflow_runs: 'Checking CI runs',
    get_file_contents: 'Reading file from GitHub',
};

/* ─── Thinking Indicator (Gemini-style) ─── */
const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const label = activeTool ? TOOL_LABELS[activeTool] || 'Working...' : 'Thinking';
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="relative flex items-center justify-center w-6 h-6">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                <Sparkles className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-sm text-zinc-500 animate-pulse">{label}</span>
        </div>
    );
});

export default function AIChat() {
    const {
        selectedSite,
        selectedProperty: workspaceProperty,
        workspaceLabel,
        hasGa4Properties,
        propertyInventoryLoading,
    } = useRegistration();
    const { hasGoogleConnection, hasGithubConnection, refresh: refreshContainer } = useContainerStatus();
    const { data: session } = useSession();
    const firstName = useMemo(() => session?.user?.name?.trim().split(/\s+/)[0] ?? '', [session?.user?.name]);

    // timeOfDay must be computed CLIENT-SIDE only — `new Date().getHours()` returns
    // the server's UTC hour during SSR and the client's local hour after hydration.
    // If they differ ("morning" vs "evening"), React throws hydration error #418
    // → recovery loop → error #185 → blank page. Defer to useEffect after mount.
    const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
    useEffect(() => {
        const h = new Date().getHours();
        setTimeOfDay(h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
    }, []);

    // Optimistic per-orb status — declared early so the connectors useMemo below can read its derived values.
    const [optimisticOverride, setOptimisticOverride] = useState<{ github?: boolean; google?: boolean }>({});

    // Effective connection state = SWR truth || optimistic override (until SWR catches up).
    const effectiveGithub = optimisticOverride.github !== undefined ? optimisticOverride.github : hasGithubConnection;
    const effectiveGoogle = optimisticOverride.google !== undefined ? optimisticOverride.google : hasGoogleConnection;
    const connectors: { name: ConnectorName; connected: boolean }[] = useMemo(() => ([
        { name: 'github', connected: effectiveGithub },
        { name: 'wordpress', connected: false },
        { name: 'vercel', connected: false },
        { name: 'ga4', connected: effectiveGoogle },
        { name: 'gsc', connected: effectiveGoogle },
    ]), [effectiveGithub, effectiveGoogle]);
    const connectedCount = useMemo(() => connectors.filter(c => c.connected).length, [connectors]);

    // Connector card — open one at a time, close on outside click.
    const [openConnector, setOpenConnector] = useState<ConnectorName | null>(null);
    const desktopRailRef = useRef<HTMLDivElement>(null);
    const mobileRailRef = useRef<HTMLDivElement>(null);
    // Persistent side rail (right of chat) — its card pops to the LEFT and
    // lives in the rail's DOM subtree, so its ref also needs to participate
    // in the outside-click check or clicking the card itself would close it.
    const sideRailRef = useRef<HTMLElement>(null);
    // Mobile-only: opens a right-side slide-in sheet with the same connector
    // list as the desktop rail. We skip the card popover here (sheet width
    // doesn't fit one cleanly) — tapping a not-connected pill fires OAuth
    // directly.
    const [mobileSourcesOpen, setMobileSourcesOpen] = useState(false);
    useEffect(() => {
        if (!openConnector) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inDesktop = desktopRailRef.current?.contains(target);
            const inMobile = mobileRailRef.current?.contains(target);
            const inSideRail = sideRailRef.current?.contains(target);
            if (!inDesktop && !inMobile && !inSideRail) {
                setOpenConnector(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openConnector]);

    // Auto-clear optimistic flag once SWR confirms the same value (or after 8s ceiling).
    useEffect(() => {
        if (optimisticOverride.github !== undefined && hasGithubConnection === optimisticOverride.github) {
            setOptimisticOverride(prev => ({ ...prev, github: undefined }));
        }
        if (optimisticOverride.google !== undefined && hasGoogleConnection === optimisticOverride.google) {
            setOptimisticOverride(prev => ({ ...prev, google: undefined }));
        }
    }, [hasGithubConnection, hasGoogleConnection, optimisticOverride.github, optimisticOverride.google]);

    useEffect(() => {
        if (optimisticOverride.github === undefined && optimisticOverride.google === undefined) return;
        const t = setTimeout(() => setOptimisticOverride({}), 8000);
        return () => clearTimeout(t);
    }, [optimisticOverride.github, optimisticOverride.google]);

    const handleProviderConnected = useCallback((provider?: 'github' | 'google', connected: boolean = true) => {
        if (provider === 'github') {
            setOptimisticOverride(prev => ({ ...prev, github: connected }));
        } else if (provider === 'google') {
            setOptimisticOverride(prev => ({ ...prev, google: connected }));
        }
        refreshContainer();
        setOpenConnector(null);
    }, [refreshContainer]);

    // Triggered when the user clicks "Connect GitHub" in the persistent nudge
    // above the bottom input. Skips the ConnectorCard popover (no room for it
    // above a bottom-fixed input) and fires the same OAuth flow ConnectorCard
    // uses internally for GitHub.
    const handleNudgeConnect = useCallback(() => {
        window.location.href = '/api/auth/github-app/install';
    }, []);
    const { properties: ga4Properties } = usePropertyList(hasGoogleConnection);

    const normalizedProperties = useMemo(
        () => (Array.isArray(ga4Properties) ? (ga4Properties as DashboardPropertyOption[]) : []),
        [ga4Properties],
    );

    const { messages, setMessages, clearChat: storeClearChat } = useChatStore();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTool, setActiveTool] = useState<string | undefined>();
    // B5-polish: Claude-style live reasoning trace — replaces the static
    // "Thinking" label with a growing list of italic narration lines.
    const [traceLines, setTraceLines] = useState<TraceLine[]>([]);
    const traceCounterRef = useRef(0);
    const pushTraceLine = useCallback((text: string) => {
        const id = `tl-${++traceCounterRef.current}-${Date.now()}`;
        setTraceLines(prev => [...prev, { id, text }]);
    }, []);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Repo picker (paired with site picker — answers "which repo backs this site")
    const { links: siteRepoLinks, refresh: refreshSiteRepoLinks } = useSiteRepoLinks();
    const { repos: githubRepos, notConnected: githubNotConnected } = useGithubRepos(hasGithubConnection);
    const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
    const [repoIsAuto, setRepoIsAuto] = useState(false);
    const [repoOpen, setRepoOpen] = useState(false);
    const repoDropdownRef = useRef<HTMLDivElement>(null);

    // Match GA4 property to selected site.
    // Priority: (1) workspace's explicitly-paired property, (2) fuzzy name match against
    // the GSC site domain, (3) first available property. Honoring (1) prevents the
    // "No GA4 property matches this site" failure when the user's GA4 display name
    // doesn't share tokens with the GSC domain (e.g., "bhagwadgeeta" ↔ "bhagavadgitaexplained.com").
    const matchedProperty = useMemo(() => {
        if (normalizedProperties.length === 0) return undefined;
        // Priority 1: explicit workspace pairing
        if (workspaceProperty) {
            const explicit = normalizedProperties.find((property) => property.property === workspaceProperty);
            if (explicit) return explicit;
        }
        // Priority 2: fuzzy name match
        if (selectedSite) {
            const domain = selectedSite.replace('sc-domain:', '').replace('https://', '').replace('/', '');
            const domainRoot = domain.split('.')[0];
            const fuzzy =
                normalizedProperties.find((property) => property.displayName?.toLowerCase().includes(domain.toLowerCase())) ||
                normalizedProperties.find((property) => (property.propertyId || property.property || '').toLowerCase().includes(domainRoot.toLowerCase())) ||
                normalizedProperties.find((property) => property.displayName?.toLowerCase().includes(domainRoot.toLowerCase()));
            if (fuzzy) return fuzzy;
        }
        // Priority 3: first available
        return normalizedProperties[0];
    }, [normalizedProperties, selectedSite, workspaceProperty]);

    const { data: analyticsData } = useAnalyticsData('all', matchedProperty?.property, hasGoogleConnection && !!selectedSite);
    const { data: seoData } = useSeoData('all', selectedSite, hasGoogleConnection && !!selectedSite);
    const dataReady = !!(analyticsData || seoData) || !hasGoogleConnection;
    const snapshot = useMemo(() => buildSnapshot(analyticsData, seoData), [analyticsData, seoData]);
    const showGa4LockedState = !propertyInventoryLoading && !hasGa4Properties;

    // Refs for stable callbacks
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const analyticsRef = useRef(analyticsData);
    analyticsRef.current = analyticsData;
    const seoRef = useRef(seoData);
    seoRef.current = seoData;
    const selectedSiteRef = useRef(selectedSite);
    selectedSiteRef.current = selectedSite;

    // Stream batching
    const streamBufferRef = useRef('');
    const rafIdRef = useRef<number | null>(null);

    const flushStreamBuffer = useCallback(() => {
        rafIdRef.current = null;
        const buffered = streamBufferRef.current;
        if (!buffered) return;
        streamBufferRef.current = '';
        setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + buffered };
            return updated;
        });
    }, [setMessages]);

    const appendStreamText = useCallback((text: string) => {
        streamBufferRef.current += text;
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(flushStreamBuffer);
        }
    }, [flushStreamBuffer]);

    useEffect(() => {
        return () => { if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current); };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!repoOpen) return;
        const handler = (e: MouseEvent) => {
            if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) setRepoOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [repoOpen]);

    // Auto-resolve the linked repo when the user changes site:
    //  1. Saved (confirmed or auto) link in DB → use it as-is
    //  2. Else fuzzy-match the user's repos by domain token overlap → mark `auto`
    //  3. Else clear (user can pick from dropdown)
    useEffect(() => {
        if (!selectedSite) {
            setSelectedRepo(null);
            setRepoIsAuto(false);
            return;
        }
        const saved = siteRepoLinks.find((l: SiteRepoLink) => l.site_url === selectedSite);
        if (saved) {
            setSelectedRepo(saved.repo_full_name);
            setRepoIsAuto(!saved.confirmed);
            return;
        }
        if (githubRepos.length > 0) {
            const match = findBestRepoMatch(githubRepos, selectedSite);
            if (match) {
                setSelectedRepo(match.repo.full_name);
                setRepoIsAuto(true);
                return;
            }
        }
        setSelectedRepo(null);
        setRepoIsAuto(false);
    }, [selectedSite, siteRepoLinks, githubRepos]);

    const pickRepo = useCallback(async (repoFullName: string) => {
        setSelectedRepo(repoFullName);
        setRepoIsAuto(false);
        setRepoOpen(false);
        if (!selectedSite) return;
        try {
            const res = await fetch('/api/site-repo-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_url: selectedSite, repo_full_name: repoFullName, confirmed: true }),
            });
            if (res.ok) refreshSiteRepoLinks();
        } catch { /* swallow — UI is still updated */ }
    }, [selectedSite, refreshSiteRepoLinks]);

    const sendMessage = useCallback(async (text?: string, options?: { mode?: string; fromTag?: string }) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        const currentAnalytics = analyticsRef.current;
        const currentSeo = seoRef.current;
        const currentMessages = messagesRef.current;
        const currentSite = selectedSiteRef.current;

        const userMessage: ChatMessage = { role: 'user', content: messageText, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date().toISOString(), tools: [] }]);
        setTraceLines([]); // reset trace per-turn
        setInput('');
        setIsLoading(true);
        setActiveTool(undefined);

        // Persist the user turn (fire-and-forget). Mirrors AIChatbot.tsx.
        // Failure is non-fatal — the chat continues; the user message just
        // won't appear in admin DB. Title only set on the first message of
        // a thread so the row doesn't get re-titled mid-conversation.
        const turnStartedAt = Date.now();
        const isFirstUserTurn = currentMessages.filter(m => m.role === 'user').length === 0;
        void persistMessage(
            { role: 'user', content: messageText },
            isFirstUserTurn ? { title: messageText.slice(0, 80), site_url: currentSite || undefined } : undefined,
        );

        try {
            const abortController = new AbortController();
            const ttfbTimeout = setTimeout(() => abortController.abort(), 30000);

            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    message: messageText,
                    selectedSite: currentSite,
                    selectedRepo: selectedRepo,
                    repoIsAuto: repoIsAuto,
                    // Snapshot is sent on EVERY turn (was: first-message-only).
                    // The KPI-only shrinkage saved tokens but caused multi-turn
                    // diagnostic conversations to forget the keyword + page lists,
                    // pushing the AI back to generic answers. Full snapshot stays
                    // grounded. The shared helpers already cap row counts so
                    // payload growth is bounded.
                    analyticsContext: currentAnalytics ? buildAnalyticsContext(currentAnalytics) : null,
                    seoContext: currentSeo ? buildSeoContext(currentSeo) : null,
                    history: currentMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                    mode: options?.mode,
                    fromTag: options?.fromTag ?? null,
                }),
            });
            clearTimeout(ttfbTimeout);

            if (!res.ok) {
                if (res.status === 402 || res.status === 409) {
                    const errorData = await res.json().catch(() => ({}));
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: errorData.response || (res.status === 402
                                ? "You've run out of messages. Get more credits to continue."
                                : 'AI Chat is unavailable because this account does not have any Google Analytics property connected yet.')
                        };
                        return updated;
                    });
                    setIsLoading(false);
                    return;
                }
                throw new Error('Failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'text') {
                            appendStreamText(data.content);
                        } else if (data.type === 'planning') {
                            pushTraceLine('Planning the approach…');
                        } else if (data.type === 'plan_proposed') {
                            if (data.plan?.summary) pushTraceLine(data.plan.summary);
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.plan = data.plan;
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'critic_verdict') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.critic = {
                                    score: data.score,
                                    groundedness: data.groundedness,
                                    completeness: data.completeness,
                                    format: data.format,
                                    notes: data.notes,
                                };
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_start') {
                            setActiveTool(data.name);
                            pushTraceLine(narrateToolStart(data.name));
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = [...(last.tools || []), { name: data.name, args: data.args }];
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'tool_result') {
                            setActiveTool(undefined);
                            pushTraceLine(narrateToolResult(data.name, data.result));
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = { ...updated[updated.length - 1] };
                                last.tools = (last.tools || []).map(t =>
                                    t.name === data.name && !t.result ? { ...t, result: data.result || 'Done', structuredData: data.structuredData } : t
                                );
                                updated[updated.length - 1] = last;
                                return updated;
                            });
                        } else if (data.type === 'error') {
                            appendStreamText(`\n\n**Error:** ${data.message}`);
                        }
                    } catch { /* skip */ }
                }
            }

            if (streamBufferRef.current) {
                if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
                flushStreamBuffer();
            }

            // Persist the completed assistant turn + capture its DB message_id
            // so the feedback widget (👍/👎) on this message can submit against
            // a real row. Best-effort: if the persist fails, the widget simply
            // doesn't render for this message (gated on message.id presence).
            try {
                const latest = messagesRef.current[messagesRef.current.length - 1];
                if (latest?.role === 'assistant' && latest.content) {
                    const persisted = await persistMessage({
                        role: 'assistant',
                        content: latest.content,
                        tools: latest.tools,
                        latency_ms: Date.now() - turnStartedAt,
                    });
                    if (persisted?.id) {
                        setMessages(prev => {
                            const next = [...prev];
                            const lastIdx = next.length - 1;
                            if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
                                next[lastIdx] = { ...next[lastIdx], id: persisted.id };
                            }
                            return next;
                        });
                    }
                }
            } catch { /* persistence is best-effort */ }
        } catch (err: unknown) {
            const isTimeout =
                (err instanceof DOMException && err.name === 'AbortError') ||
                (err instanceof Error && err.name === 'AbortError');
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                        ...last,
                        content: (last.content || '') + (isTimeout
                            ? '\n\n**Request timed out.** Try a simpler question or try again.'
                            : '\n\n**Connection lost.** Please try again.'),
                    };
                    return updated;
                }
                return prev;
            });
        } finally {
            setIsLoading(false);
            setActiveTool(undefined);
        }
    }, [appendStreamText, flushStreamBuffer, input, isLoading, setMessages]);

    const clearChat = useCallback(() => { storeClearChat(); }, [storeClearChat]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };

    const siteLabel = workspaceLabel
        || (selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : '')
        || 'Select workspace';
    const lastMsg = messages[messages.length - 1];
    const showEmpty = messages.length === 0;

    // Previously the GA4-locked state took over the whole page with an
    // empty-state card. The user prefers the chat UI stays visible — just
    // gate input behind a top alert. We compute one boolean and use it
    // (a) to render the banner below, (b) to OR into all input disabled
    // states so the user can't actually send a message.
    const isGa4Locked = showGa4LockedState;

    return (
        <div className="flex h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] bg-black">
        <div className="flex flex-1 min-w-0 flex-col">

            {/* ── GA4-required alert banner (replaces the old full-page lock) ── */}
            {isGa4Locked && (
                <div className="flex-shrink-0 px-4 sm:px-6 pt-3">
                    <div className="max-w-[760px] mx-auto flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
                        <Lock className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 text-[12.5px] text-amber-100/90 leading-relaxed">
                            <span className="font-semibold text-amber-200">Connect a GA4 property to use chat.</span>{' '}
                            This account has no Google Analytics property connected yet, so chat input is paused.{' '}
                            <Link href="/dashboard/setup" className="underline font-semibold hover:text-amber-50">
                                Pick a workspace →
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Messages / Empty State ── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                {showEmpty ? (
                    <div className="relative min-h-full overflow-hidden bg-black">
                        {/* OAuth callback handler — runs after signIn() redirects back to ?connected=... */}
                        <Suspense fallback={null}>
                            <AutoPromptFromQuery onPrompt={(q, opts) => sendMessage(q, opts)} />
                        </Suspense>
                        <Suspense fallback={null}>
                            <ProviderConnectionCallback onConnected={handleProviderConnected} />
                        </Suspense>

                        {/* Cosmic background: stars + shooting stars */}
                        <StarField />

                        {/* Breathing radial halos — focal weight at the input area */}
                        <div aria-hidden className="pointer-events-none absolute inset-0">
                            <div className="tc-breathe absolute left-1/2 top-[52%] h-[560px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,217,218,0.10),transparent_65%)] blur-3xl" />
                            <div className="tc-breathe absolute left-1/2 top-[52%] h-[300px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.08),transparent_70%)] blur-2xl" style={{ animationDelay: '2.5s' }} />
                        </div>

                        {/* Earth-horizon atmospheric glow — brand teal/cyan at the bottom */}
                        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] overflow-hidden">
                            <div
                                className="absolute -bottom-[260px] left-1/2 h-[520px] w-[180%] -translate-x-1/2 rounded-[50%] blur-3xl"
                                style={{
                                    background:
                                        'radial-gradient(ellipse at center top, rgba(34,211,238,0.28) 0%, rgba(122,217,218,0.16) 28%, rgba(34,211,238,0.06) 55%, transparent 75%)',
                                }}
                            />
                            {/* Thin horizon accent line — subtle planet-curve hint */}
                            <div
                                className="absolute bottom-0 left-1/2 h-[2px] w-[70%] -translate-x-1/2 rounded-full opacity-60"
                                style={{
                                    background:
                                        'linear-gradient(90deg, transparent 0%, rgba(122,217,218,0.45) 50%, transparent 100%)',
                                    filter: 'blur(1.5px)',
                                }}
                            />
                        </div>

                        {/* Foreground: single-column layout — connectors strip + hero stack */}
                        <div className="relative z-10 flex min-h-full flex-col">

                        {/* Centered hero — connectors strip + headline + input + suggestions */}
                        <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-10 sm:px-8 md:pt-12 md:pb-16">

                        {/* Connectors strip — horizontal pills row at top of hero */}
                        <div ref={desktopRailRef} className="relative z-20 mb-10 flex w-full max-w-5xl flex-col items-center gap-3.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                                {connectedCount} of {connectors.length} sources connected
                            </div>
                            <div ref={mobileRailRef} className="relative z-20 flex w-full flex-wrap items-center justify-center gap-2.5 px-2">
                                {connectors.map((c) => (
                                    <ConnectorPill
                                        key={c.name}
                                        name={c.name}
                                        connected={c.connected}
                                        isOpen={openConnector === c.name}
                                        onClick={() => setOpenConnector(prev => prev === c.name ? null : c.name)}
                                    />
                                ))}
                                {/* Card rendered ONCE at row level — centered below the whole pills row
                                    so leftmost/rightmost pills don't push it off-screen. */}
                                <AnimatePresence>
                                    {openConnector && (() => {
                                        const active = connectors.find(c => c.name === openConnector);
                                        if (!active) return null;
                                        return (
                                            <ConnectorCard
                                                placement="below"
                                                name={active.name}
                                                connected={active.connected}
                                                onClose={() => setOpenConnector(null)}
                                                onDisconnected={handleProviderConnected}
                                            />
                                        );
                                    })()}
                                </AnimatePresence>
                            </div>
                        </div>
                            <div className="text-center">
                                {firstName && timeOfDay && (
                                    <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                                        Good {timeOfDay}, {firstName}
                                    </div>
                                )}
                                <h1 className="bg-[linear-gradient(180deg,#ffffff_0%,#cbd5e1_100%)] bg-clip-text text-[34px] font-semibold tracking-tight text-transparent sm:text-[44px]">
                                    How can I help today?
                                </h1>
                            </div>

                            {/* The hero input — elevated + slow-rotating conic halo for energy */}
                            <div className="relative mt-10 w-full max-w-3xl">
                                {/* Slow-rotating conic gradient — focal energy in brand cyan/teal */}
                                <div aria-hidden className="pointer-events-none absolute -inset-3 overflow-hidden rounded-[28px]">
                                    <div
                                        className="tc-spin-slow absolute inset-0 rounded-[28px] opacity-70 blur-2xl"
                                        style={{
                                            background:
                                                'conic-gradient(from 0deg, rgba(34,211,238,0.24) 0%, transparent 28%, rgba(122,217,218,0.22) 55%, transparent 82%, rgba(34,211,238,0.24) 100%)',
                                        }}
                                    />
                                </div>

                                <div
                                    className="relative rounded-2xl border border-white/[0.08] bg-[#0d1117]
                                               shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.5)]
                                               transition-[border-color,box-shadow] duration-200
                                               focus-within:border-[#7AD9DA]/55
                                               focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.5),0_0_0_4px_rgba(122,217,218,0.10)]"
                                >
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask anything about your traffic…"
                                        disabled={isLoading || !dataReady || isGa4Locked}
                                        rows={1}
                                        className="w-full resize-none bg-transparent px-6 pt-5 pb-3 text-[15.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 caret-cyan-400 outline-none max-h-44 disabled:opacity-40"
                                    />
                                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                        {/* Workspace pill — read-only display + click-through to /dashboard/setup.
                                            The workspace is the single source of truth; this surface no longer
                                            mutates it. To switch site/property, the user goes to setup. */}
                                        <Link
                                            href="/dashboard/setup"
                                            title="Switch workspace"
                                            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-transparent px-3 text-[12px] text-zinc-300 transition-colors hover:border-[#14C4E1]/30 hover:bg-white/[0.04] hover:text-zinc-100"
                                        >
                                            <Globe className="h-3.5 w-3.5 text-zinc-400" />
                                            <span className="max-w-[140px] truncate">{siteLabel}</span>
                                            <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                                        </Link>
                                        <RepoPicker
                                            innerRef={repoDropdownRef}
                                            open={repoOpen}
                                            onToggle={() => setRepoOpen((v) => !v)}
                                            selectedRepo={selectedRepo}
                                            isAuto={repoIsAuto}
                                            repos={githubRepos}
                                            githubNotConnected={githubNotConnected}
                                            hasGithubConnection={hasGithubConnection}
                                            onPick={pickRepo}
                                        />
                                        </div>
                                        <button
                                            onClick={() => sendMessage()}
                                            disabled={!input.trim() || isLoading || !dataReady || isGa4Locked}
                                            aria-label="Send"
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22d3ee] text-[#06141a]
                                                       shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_2px_10px_rgba(34,211,238,0.30)]
                                                       transition-all enabled:hover:brightness-105
                                                       disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                                        >
                                            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Suggestion buttons — same 8-prompt set as the chat
                                shortcut / floating widget (single source of truth =
                                QUICK_PROMPTS). Was 4 plain pills, now 8 emoji-prefixed
                                pills matching the rest of the product. */}
                            <div className="mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2 px-4">
                                {QUICK_PROMPTS.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => sendMessage(prompt)}
                                        disabled={isLoading || !dataReady || isGa4Locked}
                                        className="rounded-full border border-white/[0.08] bg-[#0a0d12]/60 px-4 py-2 text-[13px] text-zinc-300
                                                   shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]
                                                   transition-all hover:border-white/[0.16] hover:bg-[#0e1218] hover:text-zinc-100
                                                   disabled:opacity-40"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>

                            {!dataReady && hasGoogleConnection && (
                                <div className="mt-8 flex items-center gap-2 text-xs text-zinc-500">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Loading your analytics and search data…
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                ) : (
                    /* ══════ Chat messages: Grok-style full-width ══════ */
                    <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-8">
                        {messages.map((msg, i) => {
                            if (msg.role === 'assistant' && !msg.content && !(msg.tools && msg.tools.length > 0)) return null;
                            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;

                            return msg.role === 'user' ? (
                                /* ── User message: right-aligned pill ── */
                                <div key={i} className="flex justify-end mb-8">
                                    <div className="max-w-[80%] bg-[#1a1a1a] text-white text-[15px] rounded-3xl px-5 py-3 leading-relaxed">
                                        {msg.content}
                                    </div>
                                </div>
                            ) : (
                                /* ── Assistant message: full-width, no bubble ── */
                                <div key={i} className="mb-10">
                                    <ChatMessageRenderer
                                        content={msg.content}
                                        tools={msg.tools}
                                        isStreaming={isLastAssistant && isLoading}
                                        snapshot={snapshot}
                                        onSuggestionClick={(s) => sendMessage(s)}
                                        messageId={msg.id}
                                        threadId={typeof window !== 'undefined' ? getOrCreateThreadId() : undefined}
                                    />
                                </div>
                            );
                        })}

                        {isLoading && !lastMsg?.content && (
                            <ReasoningTrace lines={traceLines} active={isLoading} />
                        )}
                        {/* Legacy fallback if you ever want the old static label back: */}
                        {false && isLoading && (!lastMsg?.content || activeTool) && (
                            <ThinkingIndicator activeTool={activeTool} />
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* ── Bottom input (only when chatting) ── */}
            {!showEmpty && (
                <div
                    className="flex-shrink-0 bg-black px-4 sm:px-6 pt-2"
                    style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
                >
                    <div className="max-w-[760px] mx-auto">
                        {/* Persistent GitHub-connect nudge — stays up whenever GitHub
                            isn't connected (and the user hasn't dismissed it this
                            session). Drives the highest-leverage connection without
                            waiting for the user to type repo-specific keywords. */}
                        <ConnectorIntentNudge
                            githubConnected={effectiveGithub}
                            onConnect={handleNudgeConnect}
                        />
                        {/* On mobile we stack textarea + actions vertically so the
                            typing area always gets full width. On sm+ they sit on
                            one row in the original layout. */}
                        <div className="flex flex-col sm:flex-row sm:items-center bg-[#1a1a1a] rounded-2xl px-3 sm:px-5 py-3 gap-2 sm:gap-0 border border-transparent focus-within:border-white/[0.08] focus-within:bg-[#1e1e1e] transition-all">
                            <textarea
                                value={input}
                                onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                                onKeyDown={handleKeyDown}
                                placeholder={isGa4Locked ? 'Connect a GA4 property to start chatting…' : 'Ask about traffic, pages, channels, or conversions'}
                                disabled={isLoading || isGa4Locked}
                                rows={1}
                                className="w-full sm:flex-1 bg-transparent text-[15px] text-white placeholder-zinc-600 outline-none resize-none max-h-40 leading-relaxed px-1 sm:px-0"
                            />
                            <div className="flex items-center gap-2 sm:ml-3 flex-shrink-0 justify-end flex-wrap">
                                {/* Workspace pill — read-only display + click-through to /dashboard/setup. */}
                                <Link
                                    href="/dashboard/setup"
                                    title="Switch workspace"
                                    className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700/80 rounded-full px-3 py-1.5 transition-colors"
                                >
                                    <Globe className="w-3 h-3" />
                                    <span className="max-w-[80px] truncate">{siteLabel}</span>
                                </Link>
                                {/* Mobile-only Sources trigger — desktop has the persistent
                                    right rail; mobile gets a small status pill that opens
                                    the slide-in sheet. */}
                                <button
                                    type="button"
                                    onClick={() => setMobileSourcesOpen(true)}
                                    title="Sources"
                                    aria-label="Open connector sources"
                                    className="lg:hidden inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700/80 rounded-full px-3 py-1.5 transition-colors"
                                >
                                    <Plug className="w-3 h-3" />
                                    <span>Sources</span>
                                    <span className="font-mono font-semibold tabular-nums text-zinc-200">{connectedCount}/{connectors.length}</span>
                                </button>
                                <RepoPicker
                                    innerRef={repoDropdownRef}
                                    open={repoOpen}
                                    onToggle={() => setRepoOpen((v) => !v)}
                                    selectedRepo={selectedRepo}
                                    isAuto={repoIsAuto}
                                    repos={githubRepos}
                                    githubNotConnected={githubNotConnected}
                                    hasGithubConnection={hasGithubConnection}
                                    onPick={pickRepo}
                                />
                                {messages.length > 0 && (
                                    <button onClick={clearChat} className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors" title="New chat" aria-label="New chat">
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || isLoading || isGa4Locked}
                                    className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-white enabled:text-black text-zinc-500 transition-all enabled:hover:bg-zinc-200"
                                    aria-label="Send message"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>

        {/* ── Persistent right connector rail ──
            Always visible across empty + active states so users can check
            connection status / connect new sources at any time. Hidden below
            the lg breakpoint (mobile keeps the empty-state strip + intent
            nudge). The card popover pops to the LEFT (placement="left") into
            the chat content area. */}
        <aside
            ref={sideRailRef}
            className="relative hidden lg:flex flex-shrink-0 w-64 flex-col border-l border-white/[0.06] bg-[#0a0d12]"
            aria-label="Connector sources"
        >
            <div className="border-b border-white/[0.06] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Sources
                </div>
                <div className="mt-1.5 text-[12px] text-zinc-400">
                    <span className="font-semibold text-zinc-200">{connectedCount}</span>
                    <span className="text-zinc-500"> of {connectors.length} connected</span>
                </div>
            </div>
            <div className="flex flex-col gap-2 p-3">
                {connectors.map((c) => (
                    <ConnectorPill
                        key={c.name}
                        name={c.name}
                        connected={c.connected}
                        isOpen={openConnector === c.name}
                        onClick={() => setOpenConnector(prev => prev === c.name ? null : c.name)}
                    />
                ))}
            </div>
            <AnimatePresence>
                {openConnector && (() => {
                    const active = connectors.find(c => c.name === openConnector);
                    if (!active) return null;
                    return (
                        <ConnectorCard
                            placement="left"
                            name={active.name}
                            connected={active.connected}
                            onClose={() => setOpenConnector(null)}
                            onDisconnected={handleProviderConnected}
                        />
                    );
                })()}
            </AnimatePresence>
        </aside>

        {/* ── Mobile-only connector sheet — slides in from the right ──
            Triggered by the "Sources" pill in the bottom input row. Tapping
            an un-connected pill fires OAuth directly (no card popover —
            doesn't fit cleanly in a 280px sheet). Connected/coming-soon pills
            are no-ops here; users can manage from /dashboard/settings. */}
        <AnimatePresence>
            {mobileSourcesOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <motion.button
                        type="button"
                        aria-label="Close sources"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => setMobileSourcesOpen(false)}
                        className="absolute inset-0 w-full bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        role="dialog"
                        aria-label="Connector sources"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-y-0 right-0 flex w-[280px] max-w-[85vw] flex-col border-l border-white/[0.06] bg-[#0a0d12] shadow-2xl"
                        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <div className="flex items-start justify-between border-b border-white/[0.06] px-4 py-3">
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                                    Sources
                                </div>
                                <div className="mt-1.5 text-[12px] text-zinc-400">
                                    <span className="font-semibold text-zinc-200">{connectedCount}</span>
                                    <span className="text-zinc-500"> of {connectors.length} connected</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMobileSourcesOpen(false)}
                                aria-label="Close"
                                className="-mr-1 rounded-md p-2 text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                            {connectors.map((c) => {
                                const isComingSoon = COMING_SOON.has(c.name);
                                const handleTap = () => {
                                    if (c.connected || isComingSoon) {
                                        // No-op for already-connected or coming-soon pills on
                                        // mobile. Disconnect lives in /dashboard/settings.
                                        return;
                                    }
                                    setMobileSourcesOpen(false);
                                    const target = nativeProviderFor(c.name);
                                    if (target === 'github') {
                                        window.location.href = '/api/auth/github-app/install';
                                        return;
                                    }
                                    if (target === 'google') {
                                        void signIn(
                                            'google',
                                            { callbackUrl: '/dashboard/ai-chat?connected=google' },
                                            { prompt: 'select_account consent' },
                                        );
                                    }
                                };
                                return (
                                    <ConnectorPill
                                        key={c.name}
                                        name={c.name}
                                        connected={c.connected}
                                        isOpen={false}
                                        onClick={handleTap}
                                    />
                                );
                            })}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        </div>
    );
}
