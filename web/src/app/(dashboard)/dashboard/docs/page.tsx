'use client';

import { useState } from 'react';
import {
    Bot, BarChart3, Search, Plug, Zap, Crown,
    Copy, CheckCircle2, Code2, MessageSquare, Coins
} from 'lucide-react';

const SECTIONS = [
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'ai-chat', label: 'AI Chat Analyst', icon: MessageSquare },
    { id: 'plans', label: 'Plans & Credits', icon: Coins },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'seo', label: 'SEO Intelligence', icon: Search },
    { id: 'bot-setup', label: 'Telegram Bot', icon: Bot },
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
                                TrafficClaw is your AI-powered SEO & analytics platform. Connect Google Analytics and Search Console,
                                get AI-driven verdicts on your data, and optionally connect a Telegram bot for on-the-go insights.
                            </p>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Quick Start</h2>
                            <div className="space-y-4">
                                <Step num={1} title="Sign in with GitHub or Google" desc="Create your account in seconds using OAuth." />
                                <Step num={2} title="Connect Google" desc="Link your Google account to pull Analytics (GA4) and Search Console data." />
                                <Step num={3} title="Explore your dashboard" desc="View traffic trends, SEO metrics, AI insights, and site audits." />
                                <Step num={4} title="Chat with AI Analyst" desc="Ask questions about your data — get verdicts backed by real numbers." />
                                <Step num={5} title="Upgrade for more" desc="Free accounts get 10 AI messages. Upgrade for 50-300 credits/month + Telegram bot." />
                            </div>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-3">What You Get for Free</h2>
                            <ul className="space-y-2 text-sm text-zinc-400">
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Full SEO & analytics dashboard</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> 10 free AI chat messages to start</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Site audit reports</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> AI content tools (schema, blog, keywords)</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> AI visibility tracking & AEO optimization</li>
                            </ul>
                        </div>
                    </>
                )}

                {activeSection === 'ai-chat' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">AI Chat Analyst</h1>
                            <p className="text-zinc-400 text-sm">Your personal SEO & analytics AI that gives verdicts, not just advice.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">How It Works</h2>
                            <p className="text-sm text-zinc-400">
                                The AI Analyst has access to your live Google Analytics and Search Console data.
                                It uses function calling to query your data in real-time and delivers data-backed verdicts.
                            </p>
                            <div className="space-y-3">
                                <FeatureItem label="Live data context" desc="Your GA4 and GSC metrics are injected into every conversation" />
                                <FeatureItem label="Tool calling" desc="The AI can run search performance queries, analytics breakdowns, page audits, and more" />
                                <FeatureItem label="Chart rendering" desc="Results include interactive charts and data tables" />
                                <FeatureItem label="Follow-up suggestions" desc="Every response includes 3 suggested follow-up questions" />
                                <FeatureItem label="Daily briefing" desc="Get an automatic morning briefing on your first visit each day" />
                            </div>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Example Questions</h2>
                            <div className="space-y-2">
                                {[
                                    'Why is my traffic dropping?',
                                    'Which keywords can I push to page 1?',
                                    'Find me quick wins — low CTR, high impressions',
                                    'Grade my SEO from A to F',
                                    'What is the ONE thing I should do today to grow?',
                                    'Give me 5 blog post ideas based on my data',
                                ].map((q, i) => (
                                    <div key={i} className="bg-emerald-500/[0.04] border border-emerald-500/[0.1] rounded-lg px-3 py-2 text-sm text-emerald-300 font-mono">
                                        {q}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-3">
                            <h2 className="text-lg font-semibold text-white">Credits</h2>
                            <p className="text-sm text-zinc-400">
                                Each AI message costs <strong className="text-white">1 credit</strong>. Free accounts start with 10 credits.
                                Upgrade to a paid plan for 50-300 credits/month that reset each billing cycle.
                            </p>
                            <p className="text-sm text-zinc-400">
                                Chat history is preserved across sections — your last conversations stay available
                                whether you use the AI Chat page or the floating chat widget.
                            </p>
                        </div>
                    </>
                )}

                {activeSection === 'plans' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Plans & Credits</h1>
                            <p className="text-zinc-400 text-sm">All dashboard features are free. Plans unlock AI credits and Telegram bot access.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Monthly Plans</h2>
                            <div className="space-y-3">
                                <PlanRow icon={<Zap className="w-4 h-4 text-cyan-400" />} name="Starter" price="$9/mo" credits="50" features="Full dashboard, SEO tools, site audits" />
                                <PlanRow icon={<BarChart3 className="w-4 h-4 text-emerald-400" />} name="Growth" price="$19/mo" credits="150" features="Everything in Starter + priority AI, advanced intelligence" highlight />
                                <PlanRow icon={<Crown className="w-4 h-4 text-violet-400" />} name="Pro" price="$29/mo" credits="300" features="Everything in Growth + Telegram bot, priority support" />
                            </div>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-3">
                            <h2 className="text-lg font-semibold text-white">How Credits Work</h2>
                            <ul className="space-y-2 text-sm text-zinc-400">
                                <li className="flex items-start gap-2"><span className="text-emerald-400 font-bold">1 credit = 1 AI message.</span></li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Credits reset at the start of each billing cycle (no rollover)</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Free accounts get 10 credits to try the AI analyst</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Upgrade or switch plans anytime from Settings</li>
                                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> Cancel anytime — no lock-in</li>
                            </ul>
                        </div>
                    </>
                )}

                {activeSection === 'analytics' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
                            <p className="text-zinc-400 text-sm">Your Google Analytics 4 data visualized and analyzed.</p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Connecting GA4</h2>
                            <p className="text-sm text-zinc-400">
                                Sign in with Google on the Settings page. TrafficClaw will automatically detect
                                your GA4 properties and start pulling data. You can switch between properties using the dropdown.
                            </p>
                            <h3 className="text-sm font-semibold text-white mt-4">Metrics Tracked</h3>
                            <ul className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
                                <li>Active users & sessions</li>
                                <li>Page views & engagement</li>
                                <li>Bounce rate</li>
                                <li>Traffic sources & channels</li>
                                <li>Device breakdown</li>
                                <li>Top countries (world map)</li>
                                <li>Real-time active users</li>
                                <li>Time range comparison</li>
                            </ul>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-3">
                            <h2 className="text-lg font-semibold text-white">Features</h2>
                            <div className="space-y-3">
                                <FeatureItem label="KPI cards with trends" desc="See percentage changes vs previous period with sparkline charts" />
                                <FeatureItem label="Interactive world map" desc="Visualize visitor locations with real-time pulsing dots" />
                                <FeatureItem label="Traffic source breakdown" desc="Organic, direct, referral, social — see where your visitors come from" />
                                <FeatureItem label="Real-time dashboard" desc="Live active user count, refreshing every 15 seconds" />
                            </div>
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
                                <RecType color="blue" label="Quick Wins" desc="Keywords on page 2 that can be pushed to page 1 with small effort" />
                                <RecType color="emerald" label="CTR Optimization" desc="High-impression pages with below-average click-through rates" />
                            </div>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-3">
                            <h2 className="text-lg font-semibold text-white">SEO Tools</h2>
                            <div className="space-y-3">
                                <FeatureItem label="Schema markup generator" desc="Generate JSON-LD structured data for any page" />
                                <FeatureItem label="Blog post generator" desc="AI-written SEO-optimized blog content based on your keywords" />
                                <FeatureItem label="Keyword research" desc="Find related keywords and search volume estimates" />
                                <FeatureItem label="Internal linking suggestions" desc="Discover linking opportunities across your content" />
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'bot-setup' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Telegram Bot</h1>
                            <p className="text-zinc-400 text-sm">Get analytics and SEO insights on the go via Telegram. <span className="text-violet-400 font-medium">Pro plan required.</span></p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">Setting Up Your Bot</h2>
                            <p className="text-sm text-zinc-400">The Telegram bot is available on the <span className="text-violet-400 font-semibold">Pro plan ($29/mo)</span>.</p>
                            <CodeBlock code={`# 1. Open Telegram and message @BotFather\n/newbot\n# 2. Follow the prompts to name your bot\n# 3. Copy the API token\n# 4. Paste it in Dashboard → Bot page`} />
                            <p className="text-sm text-zinc-400">
                                TrafficClaw provisions a container for your bot and connects it automatically.
                                Your bot will have access to all your connected Google data.
                            </p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-white">What Your Bot Can Do</h2>
                            <div className="space-y-3">
                                <FeatureItem label="Deep analytics insights" desc="Ask about traffic, sessions, bounce rates — get cross-dimensional analysis" />
                                <FeatureItem label="Search Console analysis" desc="Analyze queries, CTR, positions, and find keyword opportunities" />
                                <FeatureItem label="SEO optimization" desc="Get meta tag recommendations, schema markup, and ranking strategies" />
                                <FeatureItem label="Content strategy" desc="Generate SEO-optimized content ideas based on your real data" />
                                <FeatureItem label="Site audits" desc="Detect broken links, 404s, schema errors with fix recommendations" />
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'integrations' && (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-2">Integrations</h1>
                            <p className="text-zinc-400 text-sm">Connect TrafficClaw with your tools.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <IntegrationItem emoji="🐙" name="GitHub" desc="Sign in and sync repositories" status="Available" />
                            <IntegrationItem emoji="📊" name="Google Analytics" desc="GA4 traffic, events, and real-time data" status="Available" />
                            <IntegrationItem emoji="🔍" name="Search Console" desc="SEO rankings, queries, and search data" status="Available" />
                            <IntegrationItem emoji="✈️" name="Telegram" desc="AI bot for on-the-go insights (Pro plan)" status="Available" />
                            <IntegrationItem emoji="💬" name="Slack" desc="Team notifications and alerts" status="Coming Soon" />
                            <IntegrationItem emoji="📝" name="WordPress" desc="Content publishing and management" status="Coming Soon" />
                            <IntegrationItem emoji="🛒" name="Shopify" desc="E-commerce analytics and orders" status="Coming Soon" />
                            <IntegrationItem emoji="📓" name="Notion" desc="Content planning and documentation" status="Coming Soon" />
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

function FeatureItem({ label, desc }: { label: string; desc: string }) {
    return (
        <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
            </div>
        </div>
    );
}

function PlanRow({ icon, name, price, credits, features, highlight }: { icon: React.ReactNode; name: string; price: string; credits: string; features: string; highlight?: boolean }) {
    return (
        <div className={`flex items-center gap-4 p-4 rounded-xl border transition ${highlight ? 'bg-emerald-500/[0.04] border-emerald-500/[0.15]' : 'bg-white/[0.01] border-white/[0.06]'}`}>
            <div className="flex-shrink-0">{icon}</div>
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{name}</span>
                    <span className="text-xs text-zinc-500">{price}</span>
                    {highlight && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15] font-semibold">Popular</span>}
                </div>
                <div className="text-xs text-zinc-500">{features}</div>
            </div>
            <div className="text-sm font-bold text-emerald-400">{credits} <span className="text-[10px] text-zinc-500 font-normal">credits/mo</span></div>
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
