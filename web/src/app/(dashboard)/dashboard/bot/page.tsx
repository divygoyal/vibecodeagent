'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import {
    Bot, CheckCircle2, AlertCircle, Loader2, Lock,
    MessageSquare, Github, Chrome, BarChart3, Search
} from 'lucide-react';

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
    const user = session?.user as {
        name?: string | null; email?: string | null; image?: string | null; provider?: string;
    } | undefined;

    const [botToken, setBotToken] = useState('');
    const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [providerRegistered, setProviderRegistered] = useState(false);

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

    useEffect(() => {
        if (session?.user && !providerRegistered) {
            const registerProvider = async () => {
                try {
                    const res = await fetch('/api/auth/register-provider', { method: 'POST' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.synced) {
                            setIsSyncing(true);
                            setTimeout(async () => {
                                await fetchContainerStatus();
                                setIsSyncing(false);
                            }, 5000);
                        }
                    }
                    setProviderRegistered(true);
                } catch { /* silent */ }
            };
            registerProvider();
        }
    }, [session, providerRegistered, fetchContainerStatus]);

    useEffect(() => {
        if (session?.user) {
            fetchContainerStatus();
            const interval = setInterval(fetchContainerStatus, 15000);
            return () => clearInterval(interval);
        }
    }, [session, fetchContainerStatus]);

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

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Bot Setup</h1>
                <p className="text-sm text-zinc-500">
                    Connect your Telegram bot and manage integrations.
                </p>
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
                            Auto-syncing...
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* GitHub */}
                    <IntegrationCard
                        icon={<Github className="w-5 h-5" />}
                        name="GitHub"
                        synced={botStatus?.connectedProviders?.some(c => c.provider === 'github') || false}
                        currentSession={user?.provider === 'github'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('github')}
                    />
                    {/* Google */}
                    <IntegrationCard
                        icon={<Chrome className="w-5 h-5" />}
                        name="Google"
                        synced={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        currentSession={user?.provider === 'google'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                    />
                    {/* Analytics */}
                    <IntegrationCard
                        icon={<BarChart3 className="w-5 h-5" />}
                        name="Analytics"
                        synced={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        currentSession={user?.provider === 'google'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                        dependsOn="Connect Google first"
                    />
                    {/* Search Console */}
                    <IntegrationCard
                        icon={<Search className="w-5 h-5" />}
                        name="Search Console"
                        synced={botStatus?.connectedProviders?.some(c => c.provider === 'google') || false}
                        currentSession={user?.provider === 'google'}
                        isSyncing={isSyncing}
                        onConnect={() => signIn('google')}
                        dependsOn="Connect Google first"
                    />
                </div>
            </div>
        </div>
    );
}

function IntegrationCard({
    icon, name, synced, currentSession, isSyncing, onConnect, dependsOn
}: {
    icon: React.ReactNode;
    name: string;
    synced: boolean;
    currentSession: boolean;
    isSyncing: boolean;
    onConnect: () => void;
    dependsOn?: string;
}) {
    return (
        <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${synced ? 'bg-emerald-500/[0.04] border-emerald-500/[0.15]' : 'bg-white/[0.01] border-white/[0.06]'
            }`}>
            <div className={`flex-shrink-0 ${synced ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {icon}
            </div>
            <div className="flex-1">
                <div className="font-medium text-sm text-zinc-200">{name}</div>
                <div className={`text-xs ${synced ? 'text-emerald-400' : currentSession ? 'text-amber-400' : 'text-zinc-500'
                    }`}>
                    {synced ? 'Synced ✓' :
                        (currentSession && isSyncing) ? 'Syncing...' :
                            currentSession ? 'Connected' :
                                dependsOn || 'Not connected'}
                </div>
            </div>
            {!currentSession && !synced && (
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
