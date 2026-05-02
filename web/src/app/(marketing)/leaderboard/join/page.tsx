'use client';

import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft, ShieldCheck, Sparkles, Clock, Trophy, Loader2 } from 'lucide-react';
import LeaderboardOptIn from '@/app/(dashboard)/dashboard/settings/LeaderboardOptIn';

export default function LeaderboardJoinPage() {
    const { data: session, status } = useSession();

    return (
        <div className="min-h-screen relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/[0.04] rounded-full blur-[120px]" />
                <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-cyan-500/[0.03] rounded-full blur-[100px]" />
            </div>

            <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-24">
                <Link
                    href="/leaderboard"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition mb-8"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to leaderboard
                </Link>

                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.15] mb-5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-400">Verified via Google Analytics + domain match</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                        Add your startup
                        <br />
                        <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                            to the leaderboard
                        </span>
                    </h1>
                    <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-md mx-auto">
                        Connect Google Analytics, confirm the property tracks your domain, and you&apos;re live. Free for everyone.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-8">
                    <Perk icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />} title="Verified" sub="GA4 + domain match" />
                    <Perk icon={<Sparkles className="w-4 h-4 text-cyan-400" />} title="Free backlink" sub="Embed badge on your site" />
                    <Perk icon={<Clock className="w-4 h-4 text-amber-400" />} title="60 seconds" sub="One-click sign in" />
                </div>

                {status === 'loading' && (
                    <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Checking session...</span>
                    </div>
                )}

                {status === 'unauthenticated' && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/[0.08] flex items-center justify-center mx-auto mb-4">
                            <Trophy className="w-6 h-6 text-emerald-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white mb-2">Sign in to continue</h2>
                        <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
                            We use your Google account to read GA4 metrics for your property — no other writes, no spam, no data shared.
                        </p>
                        <button
                            onClick={() => signIn('google', { callbackUrl: '/leaderboard/join' })}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-xl hover:opacity-90 transition shadow-lg shadow-emerald-500/20"
                        >
                            Continue with Google
                        </button>
                    </div>
                )}

                {status === 'authenticated' && session?.user && (
                    <LeaderboardOptIn />
                )}
            </div>
        </div>
    );
}

function Perk({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-semibold text-white">{title}</span></div>
            <span className="text-[10px] text-zinc-500">{sub}</span>
        </div>
    );
}
