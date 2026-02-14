'use client';

import { useState } from 'react';
import {
    Bot, BarChart3, Search, Plug, Zap,
    Copy, CheckCircle2, Code2
} from 'lucide-react';

const SECTIONS = [
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'bot-setup', label: 'Bot Setup', icon: Bot },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'seo', label: 'SEO Intelligence', icon: Search },
    { id: 'api', label: 'API Reference', icon: Code2 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
];

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="relative group my-4">
            <div className="absolute top-2 right-2 z-10">
                <button
                    onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="p-1.5 bg-zinc-800/80 rounded-md hover:bg-zinc-700 transition opacity-0 group-hover:opacity-100"
                >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                </button>
            </div>
            <pre className="bg-[#0a0a10] border border-white/[0.06] rounded-xl px-4 py-3 overflow-x-auto">
                <code className="text-sm text-zinc-300 font-mono">{code}</code>
            </pre>
        </div>
    );
}

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState('getting-started');

    return (
        <div className="flex gap-6 p-6 min-h-[80vh]">
            {/* Left sidebar */}
            <aside className="hidden lg:block w-56 flex-shrink-0">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Documentation</h3>
                <nav className="space-y-0.5">
                    {SECTIONS.map(s => {
                        const Icon = s.icon;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === s.id
                                    ? 'bg-emerald-400/10 text-emerald-400'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {s.label}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            {/* Content */}
            <div className="flex-1 max-w-3xl space-y-8">
                {activeSection === 'getting-started' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Getting Started</h1>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                GrowClaw is your AI-powered growth engine. Connect your Telegram bot,
                                link Google Analytics and Search Console, and let AI help you grow your online presence.
                            </p>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Quick Start</h2>
                            <div className="space-y-4">
                                <Step num={1} title="Sign up with GitHub" desc="Authenticate via GitHub to connect your repositories." />
                                <Step num={2} title="Create a Telegram Bot" desc="Message @BotFather on Telegram and create a new bot." />
                                <Step num={3} title="Enter your bot token" desc="Paste your bot token in the Bot Setup page." />
                                <Step num={4} title="Connect Google" desc="Link your Google account for Analytics and Search Console data." />
                                <Step num={5} title="Start growing" desc="Use Telegram commands to manage your site and get AI insights." />
                            </div>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-3">Prerequisites</h2>
                            <ul className="space-y-2 text-sm text-zinc-400">
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> A GitHub account</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> A Telegram account</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> A Google account with Analytics and/or Search Console</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> A website you own or manage</li>
                            </ul>
                        </div>
                    </>
                )}

                {activeSection === 'bot-setup' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Bot Setup</h1>
                            <p className="text-zinc-400 text-sm">How to create and configure your GrowClaw Telegram bot.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Creating a Bot via BotFather</h2>
                            <p className="text-sm text-zinc-400">Open Telegram and start a conversation with <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-emerald-400">@BotFather</code>.</p>
                            <CodeBlock code={`/newbot\n# Follow the prompts to name your bot\n# Copy the API token provided`} />
                            <p className="text-sm text-zinc-400">
                                Paste the token into the <strong className="text-white">Bot Setup</strong> page in your dashboard.
                                GrowClaw will provision a container and connect your bot automatically.
                            </p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Available Commands</h2>
                            <div className="space-y-2">
                                <CommandRow cmd="/status" desc="Check bot and integration status" />
                                <CommandRow cmd="/analytics" desc="Get a quick analytics summary" />
                                <CommandRow cmd="/seo" desc="Get SEO recommendations" />
                                <CommandRow cmd="/keywords" desc="List top performing keywords" />
                                <CommandRow cmd="/alert on|off" desc="Toggle real-time alerts" />
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'analytics' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
                            <p className="text-zinc-400 text-sm">Understand your Google Analytics 4 integration.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Connecting GA4</h2>
                            <p className="text-sm text-zinc-400">
                                Sign in with Google on the Bot Setup page. GrowClaw will automatically detect
                                your GA4 properties and start pulling data.
                            </p>
                            <h3 className="text-sm font-semibold text-white mt-4">Metrics tracked</h3>
                            <ul className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
                                <li>• Active users</li>
                                <li>• Sessions</li>
                                <li>• Page views</li>
                                <li>• Bounce rate</li>
                                <li>• Session duration</li>
                                <li>• Traffic sources</li>
                                <li>• Device breakdown</li>
                                <li>• Top countries</li>
                            </ul>
                        </div>
                    </>
                )}

                {activeSection === 'seo' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">SEO Intelligence</h1>
                            <p className="text-zinc-400 text-sm">AI-powered SEO insights from Google Search Console.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">AI Recommendation Types</h2>
                            <div className="space-y-3">
                                <RecType color="red" label="Content Decay" desc="Pages losing organic traffic over time" />
                                <RecType color="amber" label="Keyword Gaps" desc="Relevant keywords your competitors rank for but you don't" />
                                <RecType color="blue" label="Quick Wins" desc="Keywords on page 2 that can be pushed to page 1" />
                                <RecType color="emerald" label="CTR Optimization" desc="High-impression pages with below-average click-through rates" />
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'api' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">API Reference</h1>
                            <p className="text-zinc-400 text-sm">Access GrowClaw data programmatically.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Authentication</h2>
                            <p className="text-sm text-zinc-400">Include your API key in the header:</p>
                            <CodeBlock code={`curl -H "Authorization: Bearer grc_sk_your_key" \\\n  https://api.growclaw.com/v1/analytics`} />
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Endpoints</h2>
                            <div className="space-y-2">
                                <EndpointRow method="GET" path="/v1/analytics" desc="Retrieve analytics data" />
                                <EndpointRow method="GET" path="/v1/seo" desc="Retrieve SEO metrics and recommendations" />
                                <EndpointRow method="GET" path="/v1/status" desc="Bot and container status" />
                                <EndpointRow method="POST" path="/v1/bot/command" desc="Execute a bot command" />
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'integrations' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Integrations</h1>
                            <p className="text-zinc-400 text-sm">Connect GrowClaw with your favorite tools.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <IntegrationItem emoji="🐙" name="GitHub" desc="Sync repos, track commits, deploy" status="Available" />
                            <IntegrationItem emoji="📊" name="Google Analytics" desc="GA4 traffic and event data" status="Available" />
                            <IntegrationItem emoji="🔍" name="Search Console" desc="SEO rankings and search data" status="Available" />
                            <IntegrationItem emoji="✈️" name="Telegram" desc="Bot management and commands" status="Available" />
                            <IntegrationItem emoji="📝" name="Notion" desc="Content planning & docs" status="Coming Soon" />
                            <IntegrationItem emoji="🔔" name="Slack" desc="Team notifications" status="Coming Soon" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function Step({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
        <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-400/10 text-emerald-400 flex items-center justify-center text-sm font-bold flex-shrink-0">{num}</div>
            <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
            </div>
        </div>
    );
}

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
            <code className="text-sm text-emerald-400 bg-emerald-400/[0.06] px-2 py-0.5 rounded font-mono">{cmd}</code>
            <span className="text-xs text-zinc-500">{desc}</span>
        </div>
    );
}

function RecType({ color, label, desc }: { color: string; label: string; desc: string }) {
    const colors: Record<string, string> = { red: 'bg-red-400', amber: 'bg-amber-400', blue: 'bg-blue-400', emerald: 'bg-emerald-400' };
    return (
        <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full ${colors[color]} mt-1.5 flex-shrink-0`} />
            <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
            </div>
        </div>
    );
}

function EndpointRow({ method, path, desc }: { method: string; path: string; desc: string }) {
    const methodColor = method === 'GET' ? 'text-emerald-400 bg-emerald-400/10' : 'text-amber-400 bg-amber-400/10';
    return (
        <div className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${methodColor}`}>{method}</span>
            <code className="text-sm text-zinc-300 font-mono flex-1">{path}</code>
            <span className="text-xs text-zinc-500">{desc}</span>
        </div>
    );
}

function IntegrationItem({ emoji, name, desc, status }: { emoji: string; name: string; desc: string; status: string }) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.1] transition">
            <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{emoji}</span>
                <div>
                    <span className="text-sm font-medium text-white">{name}</span>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${status === 'Available' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                        }`}>{status}</span>
                </div>
            </div>
            <p className="text-xs text-zinc-500">{desc}</p>
        </div>
    );
}
