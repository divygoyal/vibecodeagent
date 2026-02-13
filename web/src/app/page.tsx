'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';

/* ─── types ─── */
type BotStatus = {
  status: string;
  health: string;
  memory_usage_mb?: number;
  plan?: string;
  telegramStatus?: string;
  botUsername?: string;
};

type GitHubData = {
  commits: Array<{
    repo: string;
    message: string;
    sha: string;
    date: string;
    branch: string;
  }>;
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    updated: string;
    url: string;
  }>;
  heatmap: number[];
  username: string;
};

/* ─── language colors ─── */
const langColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Shell: '#89e051',
};

/* ─── time ago helper ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/* ─── status steps config ─── */
const STATUS_STEPS = [
  { key: 'container', label: 'Container', activeLabel: 'Running' },
  { key: 'openclaw', label: 'OpenClaw', activeLabel: 'Ready' },
  { key: 'telegram', label: 'Telegram', activeLabel: 'Connected' },
  { key: 'live', label: 'Bot', activeLabel: 'Live' },
];

function getStatusLevel(botStatus: BotStatus | null): number {
  if (!botStatus || botStatus.status === 'not_provisioned') return -1;
  if (botStatus.status !== 'running') return 0;
  // Container is running
  if (botStatus.telegramStatus === 'error' || botStatus.telegramStatus === 'webhook_conflict') return 2;
  if (botStatus.telegramStatus === 'connected' || botStatus.health === 'healthy') return 3;
  return 2; // OpenClaw + Telegram initializing
}

/* ═══════════════════════════════════════════════════════ */
export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const [botToken, setBotToken] = useState('');
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [githubData, setGithubData] = useState<GitHubData | null>(null);
  const [githubLoading, setGithubLoading] = useState(true);

  const fetchContainerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/container');
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
        if (data.status === 'running') setSetupStatus('success');
      }
    } catch { /* silent */ }
  }, []);

  const fetchGithubData = useCallback(async () => {
    try {
      setGithubLoading(true);
      const res = await fetch('/api/github');
      if (res.ok) {
        const data = await res.json();
        setGithubData(data);
      }
    } catch { /* silent */ }
    finally { setGithubLoading(false); }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchContainerStatus();
      fetchGithubData();
      const interval = setInterval(fetchContainerStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [session, fetchContainerStatus, fetchGithubData]);

  const handleSetupBot = async () => {
    if (!botToken.trim()) { setErrorMsg('Please enter your Telegram bot token'); return; }
    setSetupStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/setup-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to setup bot');
      setSetupStatus('success');
      setBotToken('');
      // Poll status
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

  /* ─── Loading ─── */
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const isProvisioned = botStatus?.status && botStatus.status !== 'not_provisioned';
  const statusLevel = getStatusLevel(botStatus);

  /* ═══════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ─── Header ─── */}
      <header className="border-b border-zinc-800/50 px-6 py-4 backdrop-blur-sm bg-zinc-950/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="gradient-text">Vibe</span>Code
            </h1>
          </div>
          {session && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {session.user?.image && (
                  <img src={session.user.image} alt="" className="w-7 h-7 rounded-full ring-2 ring-zinc-700" />
                )}
                <span className="text-sm text-zinc-400">{session.user?.name}</span>
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!session ? (
          /* ═══ Landing Page ═══ */
          <div className="text-center pt-16">
            <div className="mb-6 fade-in">
              <span className="text-7xl">🦞</span>
            </div>
            <h2 className="text-5xl font-bold mb-4 gradient-text fade-in fade-in-delay-1">
              Your Personal AI Agent
            </h2>
            <p className="text-zinc-400 mb-10 max-w-lg mx-auto text-lg fade-in fade-in-delay-2">
              Sandboxed, token-optimized, and entirely yours.
              Connect via Telegram. Powered by Gemini.
            </p>

            <button
              onClick={() => signIn('github')}
              className="inline-flex items-center gap-3 bg-zinc-800/80 hover:bg-zinc-700/80 px-8 py-4 rounded-xl font-semibold transition-all hover:scale-[1.03] hover:shadow-lg hover:shadow-emerald-500/10 border border-zinc-700/50 fade-in fade-in-delay-3"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Sign in with GitHub
            </button>

            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-5 text-left max-w-3xl mx-auto fade-in fade-in-delay-4">
              {[
                { icon: '🔒', title: 'Sandboxed', desc: 'Runs in an isolated Docker container. Complete privacy.' },
                { icon: '⚡', title: 'Gemini 3 Pro', desc: 'Latest model with full tool access — bash, git, web.' },
                { icon: '🤖', title: 'Always On', desc: 'Proactive heartbeats, memory, and background tasks.' },
              ].map((f) => (
                <div key={f.title} className="glass-card p-5">
                  <div className="text-2xl mb-3">{f.icon}</div>
                  <h3 className="font-semibold mb-1.5 text-sm">{f.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ═══ Dashboard (logged in) ═══ */
          <div className="space-y-6">

            {/* ─── Bot Status Pipeline ─── */}
            {isProvisioned && (
              <div className="glass-card p-6 fade-in">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Bot Status</h2>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusLevel >= 3 ? 'bg-emerald-400 pulse-live' :
                      statusLevel >= 1 ? 'bg-amber-400 pulse-init' :
                        'bg-red-400 pulse-error'
                      }`} />
                    <span className={`text-xs font-medium ${statusLevel >= 3 ? 'text-emerald-400' :
                      statusLevel >= 1 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                      {statusLevel >= 3 ? 'Live' : statusLevel >= 1 ? 'Initializing' : 'Offline'}
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
                            } ${isCurrent ? 'ring-2 ring-emerald-400/30 ring-offset-2 ring-offset-zinc-950' : ''}`}>
                            {isActive ? '✓' : (i + 1)}
                          </div>
                          <span className={`text-[10px] mt-2 font-medium ${isActive ? 'text-emerald-400' : 'text-zinc-600'
                            }`}>
                            {isActive ? step.activeLabel : step.label}
                          </span>
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className={`h-[2px] flex-1 mx-1 rounded transition-all ${i < statusLevel ? 'bg-emerald-400/40' : 'bg-zinc-800'
                            }`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {botStatus?.botUsername && (
                  <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Telegram:</span>
                    <span className="text-xs text-zinc-300 font-mono">@{botStatus.botUsername}</span>
                  </div>
                )}
              </div>
            )}

            {/* ─── Setup Form (if not provisioned) ─── */}
            {(!isProvisioned || setupStatus !== 'success') && !isProvisioned && (
              <div className="glass-card p-6 fade-in fade-in-delay-1">
                <h2 className="text-lg font-semibold mb-1">Connect Your Telegram Bot</h2>
                <p className="text-zinc-500 text-sm mb-5">
                  Create a bot via <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">@BotFather</code> on Telegram, then paste the token below.
                </p>
                <div className="flex gap-3">
                  <input
                    type="password"
                    placeholder="Paste your bot token here"
                    className="flex-1 bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all placeholder:text-zinc-600"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetupBot()}
                  />
                  <button
                    onClick={handleSetupBot}
                    disabled={setupStatus === 'loading'}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-emerald-500/20 text-zinc-950"
                  >
                    {setupStatus === 'loading' ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        Connecting...
                      </span>
                    ) : 'Connect'}
                  </button>
                </div>
                {errorMsg && (
                  <p className="text-red-400 text-xs mt-3 flex items-center gap-1.5">
                    <span>⚠</span> {errorMsg}
                  </p>
                )}
              </div>
            )}

            {/* ─── GitHub Activity Section ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Contribution Heatmap */}
              <div className="lg:col-span-2 glass-card p-6 fade-in fade-in-delay-2">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                  GitHub Activity
                </h2>
                {githubLoading ? (
                  <div className="space-y-2">
                    <div className="skeleton h-28 w-full" />
                  </div>
                ) : githubData?.heatmap ? (
                  <div>
                    <div className="overflow-x-auto pb-2">
                      <div className="heatmap-grid" style={{ minWidth: '680px' }}>
                        {githubData.heatmap.map((level, i) => (
                          <div key={i} className="heatmap-cell" data-level={level} title={`${level} contributions`} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 justify-end">
                      <span className="text-[10px] text-zinc-600">Less</span>
                      {[0, 1, 2, 3, 4].map(l => (
                        <div key={l} className="heatmap-cell" data-level={l} style={{ width: 10, height: 10 }} />
                      ))}
                      <span className="text-[10px] text-zinc-600">More</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-600 text-sm">No activity data</p>
                )}
              </div>

              {/* Active Repos */}
              <div className="glass-card p-6 fade-in fade-in-delay-3">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                  Repositories
                </h2>
                {githubLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 w-full" />)}
                  </div>
                ) : githubData?.repos?.length ? (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto">
                    {githubData.repos.map((repo) => (
                      <a
                        key={repo.name}
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/60 transition-colors border border-transparent hover:border-zinc-700/50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-200 truncate">{repo.name}</span>
                          {repo.stars > 0 && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                              ★ {repo.stars}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {repo.language && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <span className="w-2 h-2 rounded-full" style={{ background: langColors[repo.language] || '#6b7280' }} />
                              {repo.language}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-600">{timeAgo(repo.updated)}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-600 text-sm">No repos found</p>
                )}
              </div>
            </div>

            {/* ─── Recent Commits ─── */}
            <div className="glass-card p-6 fade-in fade-in-delay-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                Recent Commits
              </h2>
              {githubLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-10 w-full" />)}
                </div>
              ) : githubData?.commits?.length ? (
                <div className="space-y-1">
                  {githubData.commits.map((commit, i) => (
                    <div key={`${commit.sha}-${i}`} className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800/30 transition-colors">
                      <code className="text-xs text-emerald-400 font-mono bg-emerald-400/10 px-2 py-0.5 rounded">
                        {commit.sha}
                      </code>
                      <span className="text-sm text-zinc-200 flex-1 truncate">{commit.message}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-zinc-600 font-mono">{commit.repo}</span>
                        {commit.branch && (
                          <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-mono">
                            {commit.branch}
                          </span>
                        )}
                        <span className="text-xs text-zinc-600 w-14 text-right">{timeAgo(commit.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-600 text-sm">No recent commits</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-zinc-800/30 px-6 py-4 mt-12 text-center text-xs text-zinc-600">
        Powered by <a href="https://github.com/nicepkg/openclaw" className="text-emerald-500 hover:underline">OpenClaw</a> 🦞 · Gemini 3 Pro
      </footer>
    </div>
  );
}
