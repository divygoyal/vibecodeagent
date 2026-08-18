'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import {
    Globe, ArrowRight, Code2, Copy, Check, CheckCircle2,
} from 'lucide-react';
import GlobeDemoSection from '@/components/marketing/GlobeDemoSection';

export default function GlobePublicPage() {
    const [copied, setCopied] = useState(false);

    const embedCode = `<iframe
  src="https://trafficclaw.com/embed/YOUR_SITE_ID?token=YOUR_TOKEN"
  width="100%" height="600" frameborder="0"
  style="border-radius: 16px;" allow="fullscreen"
></iframe>`;

    return (
        <div className="py-12 sm:py-20 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                {/* ─── Header ─── */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-6">
                        <Globe className="w-3.5 h-3.5" />
                        100% Free &mdash; No Credit Card Required
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                        Real-time visitor globe for{' '}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">your website</span>
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-4">
                        Embed an interactive 3D globe showing live visitors from Google Analytics.
                        One iframe, no tracking scripts, no SDK.
                    </p>
                    <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20 mb-8">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-emerald-400 font-bold text-sm">Free forever. No limits. No credit card.</p>
                            <p className="text-zinc-500 text-xs">Upgrade to any paid plan to remove the &quot;Powered by TrafficClaw&quot; watermark.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/dashboard/globe' })}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-emerald-500/25"
                        >
                            Get your free embed code
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6 mt-6">
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Free forever
                        </div>
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Real GA4 data
                        </div>
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            No tracking scripts
                        </div>
                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Click visitor profiles
                        </div>
                    </div>
                </div>

                <GlobeDemoSection className="mb-16" />

                {/* ─── Embed Instructions ─── */}
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Get started in 2 minutes</h2>
                        <p className="text-zinc-400">Sign up, connect Google Analytics, and paste the iframe on your site.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Step 1 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">1</div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-white mb-1">Sign up and connect Google Analytics</h3>
                                <p className="text-sm text-zinc-500 mb-3">Sign in with GitHub, then connect your Google account to authorize GA4 access.</p>
                                <button onClick={() => signIn('google', { callbackUrl: '/dashboard/globe' })} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition">
                                    Sign up free <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">2</div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-white mb-1">Generate your embed token</h3>
                                <p className="text-sm text-zinc-500">Go to Globe API in the dashboard and click &quot;Generate Embed Token&quot;.</p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold flex-shrink-0">3</div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-white mb-1">Paste the iframe on your website</h3>
                                <p className="text-sm text-zinc-500 mb-3">Copy the embed code and add it anywhere on your site.</p>
                                <div className="bg-[#0d1117] border border-white/[0.08] rounded-xl overflow-hidden max-w-full">
                                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-2">
                                            <Code2 className="w-4 h-4 text-emerald-400" />
                                            <span className="text-xs text-zinc-500">embed.html</span>
                                        </div>
                                        <button onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-zinc-400 hover:text-white transition">
                                            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="p-3 sm:p-4 text-[11px] sm:text-[13px] leading-relaxed font-mono text-zinc-400 overflow-x-auto max-w-full whitespace-pre-wrap break-all"><code>{embedCode}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
