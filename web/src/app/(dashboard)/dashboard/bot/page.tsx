'use client';

import { signIn, useSession } from 'next-auth/react';
import { getSafeRedirectUrl } from '@/lib/checkout';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    CheckCircle2, AlertCircle, Loader2, Lock,
    MessageSquare, Chrome, BarChart3, Search,
    Zap, PenTool, Bug, DollarSign, Globe, Link2,
    Shield, Sparkles, Crown,
    Copy, Check, ChevronDown
} from 'lucide-react';
import { useRegistration } from '../layout';
import { useCredits } from '@/lib/useDashboardData';

type BotStatus = {
    status: string;
    health: string;
    memory_usage_mb?: number;
    plan?: string;
    telegramStatus?: string;
    botUsername?: string;
    telegramBotToken?: string;
    connectedProviders?: Array<{ provider: string; connected: boolean }>;
    error?: string;
};

type BotPageSessionUser = {
    provider?: string;
    accessToken?: string;
    googleAccessToken?: string;
    googleAccountId?: string;
};

const STATUS_STEPS = [
    { key: 'container', label: 'Container', activeLabel: 'Running' },
    { key: 'openclaw', label: 'OpenClaw', activeLabel: 'Ready' },
    { key: 'telegram', label: 'Telegram', activeLabel: 'Connected' },
    { key: 'live', label: 'Bot', activeLabel: 'Live' },
];

function ProviderConnectionCallback({ onSynced }: { onSynced: () => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handledRef = useRef(false);

    useEffect(() => {
        if (handledRef.current) return;
        const connected = searchParams.get('connected');
        if (connected !== 'github' && connected !== 'google') return;
        handledRef.current = true;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: connected }),
                });
                if (!res.ok) {
                    console.warn(`Failed to register ${connected} connection from bot page`);
                }
                if (!cancelled) {
                    onSynced();
                }
            } catch (error) {
                console.warn('Bot page provider registration failed:', error);
            } finally {
                if (!cancelled) {
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('connected');
                    const qs = params.toString();
                    router.replace(`/dashboard/bot${qs ? `?${qs}` : ''}`);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [searchParams, router, onSynced]);

    return null;
}

function getStatusLevel(botStatus: BotStatus | null): number {
    if (!botStatus || botStatus.status === 'not_provisioned') return -1;
    if (botStatus.status !== 'running') return 0;
    if (botStatus.telegramStatus === 'connected') return 3;
    if (botStatus.telegramStatus === 'error' || botStatus.telegramStatus === 'webhook_conflict') return 2;
    if (botStatus.health === 'healthy') return 1;
    return 0;
}

export default function BotPage() {
    const { data: session } = useSession();
    const { isRegistered, isRegistering } = useRegistration();

    const { plan, telegramBotEnabled } = useCredits();
    const hasProPlan = plan === 'pro' || telegramBotEnabled;

    const [botToken, setBotToken] = useState('');
    const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
    const [isSyncing] = useState(false);
    const botEngine = 'nanobot' as const;
    const [copiedUsername, setCopiedUsername] = useState(false);
    const [showAllCapabilities, setShowAllCapabilities] = useState(false);
    const sessionUser = session?.user as BotPageSessionUser | undefined;
    const hasGoogleConnection = Boolean(
        botStatus?.connectedProviders?.some(c => c.provider === 'google')
        || sessionUser?.googleAccessToken
        || sessionUser?.googleAccountId
        || (sessionUser?.provider === 'google' && sessionUser?.accessToken)
    );

    // Use refs to avoid re-creating the callback (and thus the interval) on every state change
    const botTokenRef = useRef(botToken);
    const setupStatusRef = useRef(setupStatus);
    botTokenRef.current = botToken;
    setupStatusRef.current = setupStatus;

    const fetchContainerStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/container');
            if (res.ok) {
                const data = await res.json();
                setBotStatus(data);
                if (data.status === 'running') setSetupStatus('success');
                if (data.telegramBotToken && !botTokenRef.current && setupStatusRef.current !== 'success') {
                    setBotToken(data.telegramBotToken);
                }
            }
        } catch { /* silent */ }
    }, []);

    // Fetch status when registration completes
    useEffect(() => {
        if (session?.user && isRegistered && !isRegistering) {
            fetchContainerStatus();
            const interval = setInterval(fetchContainerStatus, 15000);
            return () => clearInterval(interval);
        }
    }, [session, isRegistered, isRegistering, fetchContainerStatus]);

    const handleSetupBot = async () => {
        const tokenToUse = botToken || botStatus?.telegramBotToken;
        if (!tokenToUse?.trim()) { setErrorMsg('Please enter your Telegram bot token'); return; }
        if (!hasGoogleConnection) { setErrorMsg('Connect Google first, then save your Telegram bot.'); return; }

        setSetupStatus('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/setup-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenToUse, bot_engine: botEngine }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to setup bot');
            setSetupStatus('success');
            setBotToken('');
            let attempts = 0;
            const poll = async () => {
                await fetchContainerStatus();
                attempts++;
                if (attempts < 8) setTimeout(poll, 3000);
            };
            setTimeout(poll, 3000);
        } catch (err) {
            setSetupStatus('error');
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
        }
    };

    const isProvisioned = botStatus?.status && botStatus.status !== 'not_provisioned';
    const statusLevel = getStatusLevel(botStatus);

    const PLATFORMS = [
        { name: 'Slack', icon: '💬', color: 'bg-purple-500/10 border-purple-500/20 text-purple-400', desc: 'Get alerts, run commands, manage tasks directly from Slack channels' },
        { name: 'Stripe', icon: '💳', color: 'bg-violet-500/10 border-violet-500/20 text-violet-400', desc: 'Check revenue, refunds, subscriptions, and payment analytics' },
        { name: 'WordPress', icon: '📝', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400', desc: 'Publish posts, update pages, manage plugins, fix site issues' },
        { name: 'Shopify', icon: '🛒', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', desc: 'Track orders, manage products, check store performance' },
        { name: 'Notion', icon: '📓', color: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300', desc: 'Create docs, update databases, sync project notes' },
        { name: 'Vercel', icon: '▲', color: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-300', desc: 'Deploy, rollback, check build status, manage domains' },
        { name: 'Cloudflare', icon: '☁️', color: 'bg-orange-500/10 border-orange-500/20 text-orange-400', desc: 'Manage DNS, purge cache, check analytics, handle security' },
        { name: 'Linear', icon: '🔷', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', desc: 'Create issues, track sprints, manage project boards' },
        { name: 'Discord', icon: '🎮', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', desc: 'Moderate channels, send updates, manage community' },
        { name: 'Supabase', icon: '⚡', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', desc: 'Query databases, manage auth, check API usage' },
        { name: 'AWS', icon: '☁️', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', desc: 'Manage S3, Lambda, EC2 instances, check billing' },
        { name: 'Figma', icon: '🎨', color: 'bg-pink-500/10 border-pink-500/20 text-pink-400', desc: 'Export assets, check design updates, manage components' },
        { name: 'HubSpot', icon: '🟠', color: 'bg-orange-500/10 border-orange-500/20 text-orange-400', desc: 'Track leads, manage CRM, automate marketing workflows' },
        { name: 'Jira', icon: '📋', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400', desc: 'Manage tickets, update sprints, track bugs and stories' },
        { name: 'Mailchimp', icon: '📧', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400', desc: 'Send campaigns, manage lists, check email analytics' },
    ];

    const BOT_CAPABILITIES = [
        { icon: BarChart3, label: 'Deep Analytics Insights', desc: 'Ask "How is my traffic this week?" — get cross-dimensional analysis of users, sessions, bounce rates, and trends', color: 'text-emerald-400' },
        { icon: Search, label: 'Search Console Analysis', desc: 'Analyze search queries, CTR, positions, impressions. Spot keyword opportunities and ranking changes instantly', color: 'text-cyan-400' },
        { icon: Globe, label: 'SEO Optimization', desc: 'Get meta tag recommendations, schema markup, crawl error fixes, and ranking improvement strategies', color: 'text-violet-400' },
        { icon: Link2, label: 'Smart Internal Linking', desc: 'Automatically find and create internal links across your content for better SEO juice', color: 'text-amber-400' },
        { icon: PenTool, label: 'Content Strategy', desc: 'Generate SEO-optimized blog posts, get content ideas based on your real search data', color: 'text-blue-400' },
        { icon: Bug, label: 'Site Audit & Fixes', desc: 'Detect broken links, 404s, schema errors — get detailed analysis and fix recommendations', color: 'text-red-400' },
        { icon: Shield, label: 'Performance Monitoring', desc: 'Monitor Core Web Vitals, uptime, SSL certs, and get instant alerts on issues', color: 'text-pink-400' },
        { icon: DollarSign, label: 'Revenue & More', desc: 'Connect Stripe, Shopify, and other platforms for revenue data — secondary integrations via bot chat', color: 'text-indigo-400' },
    ];

    return (
        <div className="space-y-6 max-w-4xl">
            <Suspense fallback={null}>
                <ProviderConnectionCallback onSynced={fetchContainerStatus} />
            </Suspense>

            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Your Analytics & SEO Bot</h1>
                <p className="text-sm text-zinc-500">
                    Get deep analytics insights, SEO analysis, and actionable recommendations — all through a natural conversation with your personal bot. Connect Google Analytics & Search Console for real-time data access.
                </p>
            </div>

            {/* Bot Status Pipeline */}
            {isProvisioned && hasProPlan && (
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Bot Status</h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${statusLevel >= 3 ? 'bg-emerald-400 pulse-live' :
                                statusLevel >= 1 ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                                }`} />
                            <span className={`text-xs font-medium ${statusLevel >= 3 ? 'text-emerald-400' :
                                statusLevel >= 1 ? 'text-amber-400' : 'text-zinc-500'
                                }`}>
                                {botStatus?.status === 'running' ? (
                                    statusLevel >= 3 ? 'Live' : statusLevel >= 1 ? 'Initializing' : 'Starting...'
                                ) : 'Offline'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {STATUS_STEPS.map((step, i) => {
                            const isActive = i <= statusLevel;
                            const isCurrent = i === statusLevel;
                            return (
                                <div key={step.key} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center flex-1">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${isActive
                                            ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40'
                                            : 'bg-zinc-800/50 text-zinc-600 border border-zinc-700/50'
                                            } ${isCurrent ? 'ring-2 ring-emerald-400/30 ring-offset-2 ring-offset-black' : ''}`}>
                                            {isActive ? <CheckCircle2 className="w-4 h-4" /> : (i + 1)}
                                        </div>
                                        <span className={`text-[10px] mt-2 font-medium ${isActive ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                            {isActive ? step.activeLabel : step.label}
                                        </span>
                                    </div>
                                    {i < STATUS_STEPS.length - 1 && (
                                        <div className={`h-[2px] flex-1 mx-1 rounded transition-all ${i < statusLevel ? 'bg-emerald-400/40' : 'bg-zinc-800'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {botStatus?.botUsername && (
                        <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-xs text-zinc-500">Telegram:</span>
                            <a
                                href={`https://t.me/${botStatus.botUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors"
                            >
                                @{botStatus.botUsername}
                            </a>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`@${botStatus.botUsername}`);
                                    setCopiedUsername(true);
                                    setTimeout(() => setCopiedUsername(false), 2000);
                                }}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                                aria-label="Copy bot username"
                                title="Copy username"
                            >
                                {copiedUsername ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                        </div>
                    )}

                    {botStatus?.status === 'exited' && botStatus.error && (
                        <div className="mt-4 pt-4 border-t border-red-500/20">
                            <h3 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5" /> Start Failure Logs
                            </h3>
                            <pre className="bg-red-500/10 text-red-300 text-[10px] p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap border border-red-500/20">
                                {botStatus.error}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* Setup Form / Bot Config */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold">
                        {isProvisioned ? 'Bot Configuration' : 'Connect Your Telegram Bot'}
                    </h2>
                    {isProvisioned && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                            Connected
                        </span>
                    )}
                </div>

                {!isProvisioned ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
                        {/* Left column — Instructions + Input */}
                        <div>
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-full bg-[#229ED9] flex items-center justify-center">
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
                                </div>
                                <h3 className="text-lg font-semibold text-white">Connect Telegram</h3>
                            </div>

                            <h4 className="text-sm font-semibold text-zinc-300 mb-3">How to get your bot token?</h4>
                            <ol className="space-y-3 text-sm text-zinc-400 mb-6">
                                <li className="flex gap-3">
                                    <span className="text-emerald-400 font-bold shrink-0">1.</span>
                                    <span>Open Telegram and go to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline underline-offset-2 font-semibold hover:text-emerald-300">@BotFather</a>.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-emerald-400 font-bold shrink-0">2.</span>
                                    <span>Start a chat and type <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-200 text-xs">/newbot</code> .</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-emerald-400 font-bold shrink-0">3.</span>
                                    <span>Follow the prompts to name your bot and choose a username.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-emerald-400 font-bold shrink-0">4.</span>
                                    <span>BotFather will send you a message with your bot token. Copy the entire token (it looks like a long string of numbers and letters).</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-emerald-400 font-bold shrink-0">5.</span>
                                    <span>Paste the token in the field below and click Save &amp; Connect.</span>
                                </li>
                            </ol>

                            {!hasGoogleConnection && (
                                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                                    <div className="flex items-start gap-3">
                                        <Chrome className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-amber-100">Connect Google first</p>
                                            <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                                                The Telegram bot needs Google Analytics and Search Console OAuth before it can answer traffic questions.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => signIn('google', { callbackUrl: '/dashboard/bot?connected=google' }, { prompt: 'select_account consent' })}
                                                className="mt-3 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-200"
                                            >
                                                Connect Google
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <label className="text-sm font-medium text-zinc-400 mb-2 block">Enter bot token</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={hasProPlan ? '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz' : 'Upgrade to Pro to connect your bot'}
                                    className={`w-full bg-[#050508] border rounded-xl px-4 py-3.5 text-sm focus:outline-none transition-all placeholder:text-zinc-600 mb-4 font-mono ${hasProPlan ? 'border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30' : 'border-violet-500/[0.15] opacity-60 cursor-not-allowed'}`}
                                    value={botToken}
                                    onChange={(e) => hasProPlan && setBotToken(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && hasProPlan && hasGoogleConnection && handleSetupBot()}
                                    disabled={!hasProPlan}
                                />
                                {!hasProPlan && (
                                    <Lock className="absolute right-4 top-3.5 w-4 h-4 text-violet-400/60" />
                                )}
                            </div>

                            {hasProPlan ? (
                                <button
                                    onClick={handleSetupBot}
                                    disabled={setupStatus === 'loading' || !hasGoogleConnection}
                                    className="w-full py-3.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:opacity-90 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all text-black flex items-center justify-center gap-2"
                                >
                                    {setupStatus === 'loading' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            Save & Connect
                                            <CheckCircle2 className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            ) : (
                                <a
                                    href={`https://checkout.dodopayments.com/buy/pdt_0NaLMM4r23kncRahthuyj?email=${encodeURIComponent(session?.user?.email || '')}&redirect_url=${encodeURIComponent(getSafeRedirectUrl('/dashboard/bot'))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3.5 bg-gradient-to-r from-violet-400 to-purple-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.35)] rounded-xl text-sm font-semibold transition-all text-white flex items-center justify-center gap-2"
                                >
                                    <Crown className="w-4 h-4" />
                                    Upgrade to Pro — $29/mo
                                </a>
                            )}
                            {!hasProPlan && (
                                <p className="text-[10px] text-zinc-600 mt-2 text-center">Secure payments by Dodo Payments · Cancel anytime</p>
                            )}
                        </div>

                        {/* Right column — Phone mockup with video */}
                        <div className="flex items-start justify-center">
                            <div className="relative w-[260px]">
                                {/* Phone frame */}
                                <div className="relative bg-[#1a1a1f] rounded-[2.5rem] p-2 shadow-2xl shadow-black/50 border border-white/[0.08]">
                                    {/* Notch */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#1a1a1f] rounded-b-2xl z-10" />
                                    {/* Screen */}
                                    <div className="rounded-[2rem] overflow-hidden bg-black">
                                        <video
                                            src="/videos/demobotfather.mp4"
                                            autoPlay
                                            muted
                                            loop
                                            playsInline
                                            className="w-full h-auto"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-[#050508] p-4 rounded-xl border border-white/[0.04] mt-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-zinc-300 font-medium">Bot is ready and active 🚀</p>
                                <p className="text-xs text-zinc-500 mt-1">Token is securely stored. Integrations sync automatically.</p>
                            </div>
                            {isSyncing && (
                                <div className="flex items-center gap-2 text-xs text-amber-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Syncing...
                                </div>
                            )}
                        </div>
                        <div className="mt-3 flex items-center gap-2 bg-zinc-900/50 px-4 py-2.5 rounded-lg border border-white/[0.04]">
                            <Lock className="w-3 h-3 text-zinc-600" />
                            <span className="text-xs text-zinc-500">Token:</span>
                            <span className="text-xs text-zinc-400 font-mono tracking-wider">••••••••••••••••••••</span>
                            <span className="text-[10px] text-zinc-600 ml-auto">Locked</span>
                        </div>
                    </div>
                )}

                {errorMsg && (
                    <p className="text-red-400 text-xs mt-3 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3" /> {errorMsg}
                    </p>
                )}
            </div>

            {/* ─── What Your Bot Can Do ─── */}
            <div className="bg-gradient-to-br from-emerald-500/[0.04] to-violet-500/[0.04] border border-emerald-500/[0.12] rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Sparkles className="w-5 h-5 text-black" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">What Your Bot Can Do</h3>
                        <p className="text-[11px] text-zinc-500">Primary focus: Google Analytics & Search Console deep analysis</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(showAllCapabilities ? BOT_CAPABILITIES : BOT_CAPABILITIES.slice(0, 4)).map((cap, i) => (
                        <div key={i} className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-4 hover:border-white/[0.12] transition-all">
                            <cap.icon className={`w-5 h-5 ${cap.color} mb-2`} />
                            <h4 className="text-sm font-semibold text-white mb-1">{cap.label}</h4>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{cap.desc}</p>
                        </div>
                    ))}
                </div>
                {BOT_CAPABILITIES.length > 4 && (
                    <button
                        onClick={() => setShowAllCapabilities(!showAllCapabilities)}
                        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                        {showAllCapabilities ? 'Show less' : `Show ${BOT_CAPABILITIES.length - 4} more`}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllCapabilities ? 'rotate-180' : ''}`} />
                    </button>
                )}
                <div className="mt-4 p-4 bg-black/20 border border-white/[0.04] rounded-xl">
                    <div className="flex items-start gap-3">
                        <MessageSquare className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm text-zinc-300 font-medium mb-1">How it works</p>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                1. Connect Google (Analytics + Search Console) &nbsp;→&nbsp; 2. Connect your Telegram bot above &nbsp;→&nbsp; 3. Chat with your bot naturally.
                                Say things like <span className="text-emerald-400 font-mono">&quot;how is my traffic this week?&quot;</span>,
                                <span className="text-emerald-400 font-mono">&quot;which keywords are dropping?&quot;</span>, or
                                <span className="text-emerald-400 font-mono">&quot;analyze my top pages bounce rate&quot;</span> — your bot gives deep, data-driven insights.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Integrations ─── */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                        Integrations
                    </h2>
                    {isSyncing && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Syncing...
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Google */}
                    <IntegrationCard
                        icon={<Chrome className="w-5 h-5" />}
                        name="Google"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google', { callbackUrl: '/dashboard/bot?connected=google' }, { prompt: 'select_account consent' })}
                    />
                    {/* Analytics (depends on Google) */}
                    <IntegrationCard
                        icon={<BarChart3 className="w-5 h-5" />}
                        name="Analytics"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google', { callbackUrl: '/dashboard/bot?connected=google' }, { prompt: 'select_account consent' })}
                        dependsOn={!(botStatus?.connectedProviders?.some(c => c.provider === 'google')) ? 'Connect Google first' : undefined}
                    />
                    {/* Search Console (depends on Google) */}
                    <IntegrationCard
                        icon={<Search className="w-5 h-5" />}
                        name="Search Console"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google', { callbackUrl: '/dashboard/bot?connected=google' }, { prompt: 'select_account consent' })}
                        dependsOn={!(botStatus?.connectedProviders?.some(c => c.provider === 'google')) ? 'Connect Google first' : undefined}
                    />
                </div>
            </div>

            {/* ─── Additional Platforms (Secondary) ─── */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Additional Integrations</h2>
                        <p className="text-xs text-zinc-500 mt-1">Beyond analytics & SEO, your bot can also connect to these platforms. Just tell your bot in chat — it will guide you through each step.</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 font-semibold border border-zinc-500/20">Secondary</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
                    {PLATFORMS.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition cursor-pointer">
                            <span className="text-lg flex-shrink-0">{p.icon}</span>
                            <span className="text-xs font-medium text-zinc-400">{p.name}</span>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
                    <Zap className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Tell your bot <span className="text-zinc-400 font-mono">&quot;connect Slack&quot;</span> or <span className="text-zinc-400 font-mono">&quot;connect Stripe&quot;</span> to set up secondary integrations.</span>
                </div>
            </div>
        </div>
    );
}

function IntegrationCard({
    icon, name, connected, botRunning, isSyncing, onConnect, dependsOn
}: {
    icon: React.ReactNode;
    name: string;
    connected: boolean;
    botRunning: boolean;
    isSyncing: boolean;
    onConnect: () => void;
    dependsOn?: string;
}) {
    // Synced = connected in DB AND bot container is running (memory + env updated)
    const synced = connected && botRunning;
    // Stored = connected in DB but bot not running yet
    const stored = connected && !botRunning;

    return (
        <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${synced ? 'bg-emerald-500/[0.04] border-emerald-500/[0.15]' :
            stored ? 'bg-amber-500/[0.04] border-amber-500/[0.15]' :
                'bg-white/[0.01] border-white/[0.04]'
            }`}>
            <div className={`flex-shrink-0 ${synced ? 'text-emerald-400' : stored ? 'text-amber-400' : 'text-zinc-500'}`}>
                {icon}
            </div>
            <div className="flex-1">
                <div className="font-medium text-sm text-zinc-200">{name}</div>
                <div className={`text-xs ${synced ? 'text-emerald-400' :
                    stored ? 'text-amber-400' :
                        'text-zinc-500'
                    }`}>
                    {synced ? 'Synced ✓' :
                        (stored && isSyncing) ? 'Syncing...' :
                            stored ? 'Connected (will sync with bot)' :
                                dependsOn || 'Not connected'}
                </div>
            </div>
            {!connected && (
                <button
                    onClick={onConnect}
                    className="text-xs bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg transition-colors text-zinc-300"
                >
                    Connect
                </button>
            )}
            {synced && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
        </div>
    );
}
