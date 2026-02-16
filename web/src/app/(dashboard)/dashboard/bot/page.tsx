'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import {
    Bot, CheckCircle2, AlertCircle, Loader2, Lock,
    MessageSquare, Github, Chrome, BarChart3, Search,
    Zap, PenTool, Bug, DollarSign, Globe, Link2,
    FileText, Shield, Sparkles, ArrowRight, ExternalLink
} from 'lucide-react';
import { useRegistration } from '../layout';

/* ─── types ─── */
type BotStatus = {
    status: string;
    health: string;
    memory_usage_mb?: number;
    plan?: string;
    telegramStatus?: string;
    botUsername?: string;
    telegramBotToken?: string;
    connectedProviders?: Array<{ provider: string; connected: boolean }>;
};

const STATUS_STEPS = [
    { key: 'container', label: 'Container', activeLabel: 'Running' },
    { key: 'openclaw', label: 'OpenClaw', activeLabel: 'Ready' },
    { key: 'telegram', label: 'Telegram', activeLabel: 'Connected' },
    { key: 'live', label: 'Bot', activeLabel: 'Live' },
];

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
    const user = session?.user as {
        name?: string | null; email?: string | null; image?: string | null; provider?: string;
    } | undefined;

    const [botToken, setBotToken] = useState('');
    const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const fetchContainerStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/container');
            if (res.ok) {
                const data = await res.json();
                setBotStatus(data);
                if (data.status === 'running') setSetupStatus('success');
                if (data.telegramBotToken && !botToken && setupStatus !== 'success') {
                    setBotToken(data.telegramBotToken);
                }
            }
        } catch { /* silent */ }
    }, [botToken, setupStatus]);

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

        setSetupStatus('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/setup-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenToUse }),
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
        { icon: PenTool, label: 'Write Articles', desc: 'Generate SEO-optimized blog posts, landing pages, and content directly on your site', color: 'text-emerald-400' },
        { icon: Bug, label: 'Fix Critical Bugs', desc: 'Detect and auto-fix broken links, 404s, schema errors, and code issues on your website', color: 'text-red-400' },
        { icon: DollarSign, label: 'Check Revenue', desc: 'Ask "What\'s today\'s revenue?" and get instant Stripe/Shopify sales data', color: 'text-violet-400' },
        { icon: Globe, label: 'SEO Optimization', desc: 'Auto-optimize meta tags, generate schema markup, fix crawl errors, improve rankings', color: 'text-cyan-400' },
        { icon: Link2, label: 'Smart Internal Linking', desc: 'Automatically find and create internal links across your content for better SEO', color: 'text-amber-400' },
        { icon: Shield, label: 'Security Monitoring', desc: 'Monitor uptime, SSL certs, security headers, and get instant alerts', color: 'text-pink-400' },
        { icon: FileText, label: 'Content Management', desc: 'Update WordPress pages, publish drafts, schedule posts — all via chat', color: 'text-blue-400' },
        { icon: BarChart3, label: 'Analytics Reports', desc: 'Get daily/weekly reports on traffic, conversions, and performance trends', color: 'text-indigo-400' },
    ];

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Your Personal Bot</h1>
                <p className="text-sm text-zinc-500">
                    Connect platforms, automate tasks, and let your AI assistant handle everything — from writing articles to fixing bugs to checking revenue.
                </p>
            </div>

            {/* ─── What Your Bot Can Do ─── */}
            <div className="bg-gradient-to-br from-emerald-500/[0.04] to-violet-500/[0.04] border border-emerald-500/[0.12] rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Sparkles className="w-5 h-5 text-black" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">What Your Bot Can Do</h3>
                        <p className="text-[11px] text-zinc-500">Just chat with your bot — it handles everything automatically</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {BOT_CAPABILITIES.map((cap, i) => (
                        <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all">
                            <cap.icon className={`w-5 h-5 ${cap.color} mb-2`} />
                            <h4 className="text-sm font-semibold text-white mb-1">{cap.label}</h4>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{cap.desc}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 p-4 bg-black/20 border border-white/[0.06] rounded-xl">
                    <div className="flex items-start gap-3">
                        <MessageSquare className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm text-zinc-300 font-medium mb-1">How it works</p>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                1. Connect your Telegram bot below &nbsp;→&nbsp; 2. Link the platforms you use &nbsp;→&nbsp; 3. Chat with your bot naturally.
                                Say things like <span className="text-emerald-400 font-mono">&quot;publish a blog about SEO tips&quot;</span>,
                                <span className="text-emerald-400 font-mono">&quot;what&apos;s today&apos;s Stripe revenue?&quot;</span>, or
                                <span className="text-emerald-400 font-mono">&quot;fix the broken links on my site&quot;</span> — your bot will handle it end-to-end.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bot Status Pipeline */}
            {isProvisioned && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Bot Status</h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${statusLevel >= 3 ? 'bg-emerald-400 animate-pulse' :
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
                                            } ${isCurrent ? 'ring-2 ring-emerald-400/30 ring-offset-2 ring-offset-[#09090b]' : ''}`}>
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
                        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-xs text-zinc-500">Telegram:</span>
                            <span className="text-xs text-zinc-300 font-mono">@{botStatus.botUsername}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Setup Form / Bot Config */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
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
                    <>
                        <p className="text-zinc-500 text-sm mb-5">
                            Create a bot via <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">@BotFather</code> on Telegram, then paste the token below.
                        </p>
                        <div className="flex gap-3">
                            <input
                                type="password"
                                placeholder="Paste your bot token here"
                                className="flex-1 bg-[#0c0c10] border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all placeholder:text-zinc-600"
                                value={botToken}
                                onChange={(e) => setBotToken(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSetupBot()}
                            />
                            <button
                                onClick={handleSetupBot}
                                disabled={setupStatus === 'loading'}
                                className="px-6 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:opacity-90 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all text-black"
                            >
                                {setupStatus === 'loading' ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Connecting...
                                    </span>
                                ) : 'Connect'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="bg-[#0c0c10] p-4 rounded-xl border border-white/[0.06] mt-3">
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
                        <div className="mt-3 flex items-center gap-2 bg-zinc-900/50 px-4 py-2.5 rounded-lg border border-white/[0.06]">
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

            {/* ─── Integrations ─── */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
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
                    {/* GitHub */}
                    <IntegrationCard
                        icon={<Github className="w-5 h-5" />}
                        name="GitHub"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'github') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('github')}
                    />
                    {/* Google */}
                    <IntegrationCard
                        icon={<Chrome className="w-5 h-5" />}
                        name="Google"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                    />
                    {/* Analytics (depends on Google) */}
                    <IntegrationCard
                        icon={<BarChart3 className="w-5 h-5" />}
                        name="Analytics"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                        dependsOn={!(botStatus?.connectedProviders?.some(c => c.provider === 'google')) ? 'Connect Google first' : undefined}
                    />
                    {/* Search Console (depends on Google) */}
                    <IntegrationCard
                        icon={<Search className="w-5 h-5" />}
                        name="Search Console"
                        connected={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        botRunning={botStatus?.status === 'running'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                        dependsOn={!(botStatus?.connectedProviders?.some(c => c.provider === 'google')) ? 'Connect Google first' : undefined}
                    />
                </div>
            </div>

            {/* ─── Connect More Platforms ─── */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Connect Any Platform</h2>
                        <p className="text-xs text-zinc-500 mt-1">Your bot connects to these platforms. Just follow the steps your bot gives you in chat — it will auto-configure everything.</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">15 Platforms</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {PLATFORMS.map((p, i) => (
                        <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border transition-all hover:bg-white/[0.02] cursor-pointer ${p.color}`}>
                            <span className="text-xl flex-shrink-0 mt-0.5">{p.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white">{p.name}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{p.desc}</p>
                            </div>
                            <span className="text-[10px] text-zinc-600 whitespace-nowrap flex-shrink-0 mt-1">via Bot</span>
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tell your bot <span className="text-emerald-400 font-mono">&quot;connect Slack&quot;</span> or <span className="text-emerald-400 font-mono">&quot;connect Stripe&quot;</span> and it will guide you through each step automatically.</span>
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
            'bg-white/[0.01] border-white/[0.06]'
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
