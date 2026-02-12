'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

type ContainerStatus = {
  status: string;
  health: string;
  memory_usage_mb?: number;
  plan?: string;
};

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const [botToken, setBotToken] = useState('');
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch container status when logged in
  useEffect(() => {
    if (session?.user) {
      fetchContainerStatus();
      // Poll every 30 seconds
      const interval = setInterval(fetchContainerStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const fetchContainerStatus = async () => {
    try {
      const res = await fetch('/api/container');
      if (res.ok) {
        const data = await res.json();
        setContainerStatus(data);
        if (data.status === 'running') {
          setSetupStatus('success');
        }
      }
    } catch (err) {
      console.error('Failed to fetch container status');
    }
  };

  const handleSetupBot = async () => {
    if (!botToken.trim()) {
      setErrorMsg('Please enter your Telegram bot token');
      return;
    }

    setSetupStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/setup-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to setup bot');
      }

      setSetupStatus('success');
      setBotToken(''); // Clear token for security
      fetchContainerStatus();
    } catch (err) {
      setSetupStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const handleContainerAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/container', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        // Wait a bit for container to change state
        setTimeout(fetchContainerStatus, 2000);
      }
    } catch (err) {
      console.error('Container action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Loading state
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-xl">Loading...</div>
      </div>
    );
  }

  const isProvisioned = containerStatus?.status && containerStatus.status !== 'not_provisioned';
  const isRunning = containerStatus?.status === 'running';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">Claw</span>Bot
          </h1>
          {session && (
            <button
              onClick={() => signOut()}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {!session ? (
          // Not logged in
          <div className="text-center">
            <div className="mb-8">
              <span className="text-6xl">🦞</span>
            </div>
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Your Personal AI Agent
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto text-lg">
              Powered by OpenClaw. Token-optimized, sandboxed, and entirely yours.
            </p>

            <button
              onClick={() => signIn('github')}
              className="inline-flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Sign in with GitHub
            </button>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <div className="text-2xl mb-3">🔒</div>
                <h3 className="font-semibold mb-2">Sandboxed</h3>
                <p className="text-sm text-zinc-400">Your agent runs in an isolated container. Complete privacy.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <div className="text-2xl mb-3">⚡</div>
                <h3 className="font-semibold mb-2">Token Optimized</h3>
                <p className="text-sm text-zinc-400">Aggressive caching and compaction keeps costs minimal.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <div className="text-2xl mb-3">🤖</div>
                <h3 className="font-semibold mb-2">Your Bot</h3>
                <p className="text-sm text-zinc-400">Connect via your private Telegram bot interface.</p>
              </div>
            </div>
          </div>
        ) : (
          // Logged in
          <div>
            {/* User Card */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {session.user?.image && (
                    <img
                      src={session.user.image}
                      alt="Avatar"
                      className="w-12 h-12 rounded-full"
                    />
                  )}
                  <div>
                    <p className="font-semibold">{session.user?.name}</p>
                    <p className="text-sm text-zinc-400">{session.user?.email}</p>
                  </div>
                </div>
                
                {containerStatus && isProvisioned && (
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                      <span className={`text-sm ${isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                        {containerStatus.status}
                      </span>
                    </div>
                    {containerStatus.memory_usage_mb && (
                      <p className="text-xs text-zinc-500">
                        Memory: {containerStatus.memory_usage_mb}MB
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      Plan: <span className="capitalize">{containerStatus.plan || 'free'}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Container Controls (if provisioned) */}
            {isProvisioned && (
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-8">
                <h2 className="text-lg font-semibold mb-4">Container Controls</h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleContainerAction('start')}
                    disabled={actionLoading || isRunning}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                  >
                    Start
                  </button>
                  <button
                    onClick={() => handleContainerAction('stop')}
                    disabled={actionLoading || !isRunning}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                  >
                    Stop
                  </button>
                  <button
                    onClick={() => handleContainerAction('restart')}
                    disabled={actionLoading || !isRunning}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                  >
                    Restart
                  </button>
                </div>
              </div>
            )}

            {/* Setup or Status */}
            {!isProvisioned || setupStatus !== 'success' ? (
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <h2 className="text-xl font-semibold mb-4">Connect Your Telegram Bot</h2>
                <p className="text-zinc-400 mb-6 text-sm">
                  1. Message <code className="bg-zinc-800 px-2 py-1 rounded">@BotFather</code> on Telegram<br/>
                  2. Create a new bot with <code className="bg-zinc-800 px-2 py-1 rounded">/newbot</code><br/>
                  3. Copy the token and paste it below
                </p>

                <div className="space-y-4">
                  <input
                    type="password"
                    placeholder="Paste your bot token here"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                  />

                  <button
                    onClick={handleSetupBot}
                    disabled={setupStatus === 'loading'}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-lg transition-colors"
                  >
                    {setupStatus === 'loading' ? 'Connecting...' : 'Connect Bot'}
                  </button>

                  {errorMsg && (
                    <p className="text-red-400 text-sm text-center">{errorMsg}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-900/30 border border-emerald-700 rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">🎉</div>
                <h2 className="text-xl font-semibold mb-2">Your ClawBot is Ready!</h2>
                <p className="text-zinc-300">
                  Open Telegram and send a message to your bot to start chatting.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-sm text-zinc-500">
        Powered by <a href="https://github.com/openclaw/openclaw" className="text-emerald-400 hover:underline">OpenClaw</a> 🦞
      </footer>
    </div>
  );
}
