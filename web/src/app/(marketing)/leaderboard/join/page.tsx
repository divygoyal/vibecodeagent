'use client';

import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft, ShieldCheck, Sparkles, Clock, Trophy, Loader2, ArrowRight } from 'lucide-react';
import LeaderboardOptIn from '@/app/(dashboard)/dashboard/settings/LeaderboardOptIn';

function PremiumBackdrop() {
    return (
        <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_18%),linear-gradient(180deg,#030303_0%,#010101_24%,#000000_100%)]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 18% 16%, rgba(255,255,255,0.26) 0 1px, transparent 1.5px), radial-gradient(circle at 72% 24%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 58% 62%, rgba(255,255,255,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 86% 52%, rgba(255,255,255,0.16) 0 1px, transparent 1.5px)',
                    backgroundSize: '320px 320px, 420px 420px, 520px 520px, 640px 640px',
                }}
            />
            <div className="pointer-events-none absolute left-1/2 top-[8%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(20,196,225,0.18),transparent_60%)] blur-[120px]" />
        </>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
            {children}
        </div>
    );
}

function Perk({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.07] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_44%),linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_38px_rgba(0,0,0,0.32)]">
            <div className="flex items-center gap-2 text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    {icon}
                </span>
                <span className="text-sm font-semibold tracking-[-0.01em]">{title}</span>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-zinc-500">{sub}</p>
        </div>
    );
}

export default function LeaderboardJoinPage() {
    const { data: session, status } = useSession();

    return (
        <div className="relative min-h-screen overflow-x-clip bg-[#010101] text-white">
            <PremiumBackdrop />

            <div className="relative mx-auto max-w-[860px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 lg:px-8">
                <Link
                    href="/leaderboard"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-[#7AD9DA]"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to leaderboard
                </Link>

                <div className="mt-8 text-center">
                    <div className="flex justify-center">
                        <SectionLabel>Verified · GA4 + Domain Match</SectionLabel>
                    </div>
                    <h1 className="mt-6 text-balance text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl lg:text-[3.6rem] lg:leading-[1.02]">
                        <span className="text-white">Add your startup</span>
                        <br />
                        <span className="bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_50%,#dff9ff_100%)] bg-clip-text text-transparent">
                            to the leaderboard
                        </span>
                    </h1>
                    <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#d8dde6] sm:text-base sm:leading-8">
                        Connect Google Analytics, we match the property against your domain, and you&apos;re live in under a minute.
                        Every listing is free and gets a real backlink.
                    </p>
                </div>

                <div className="mt-9 grid grid-cols-3 gap-3">
                    <Perk icon={<ShieldCheck className="h-3.5 w-3.5 text-[#7AD9DA]" />} title="Verified" sub="GA4 OAuth + domain host match" />
                    <Perk icon={<Sparkles className="h-3.5 w-3.5 text-[#7AD9DA]" />} title="Free backlink" sub="Embed badge on your site, gets DR juice" />
                    <Perk icon={<Clock className="h-3.5 w-3.5 text-amber-300" />} title="60 seconds" sub="One-click sign in, instant listing" />
                </div>

                <div className="mt-10">
                    {status === 'loading' && (
                        <div className="flex items-center justify-center gap-2 rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] py-16 text-zinc-500 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Checking session…</span>
                        </div>
                    )}

                    {status === 'unauthenticated' && (
                        <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.08),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-8 text-center shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-12">
                            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#14C4E1]/24 bg-[#14C4E1]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                <Trophy className="h-7 w-7 text-[#7AD9DA]" />
                            </div>
                            <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">Sign in to continue</h2>
                            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                                Read-only Google scopes only — we use your GA4 access to verify the property, never to write or share data.
                            </p>
                            <button
                                onClick={() => signIn('google', { callbackUrl: '/leaderboard/join' })}
                                className="mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-6 text-[14px] font-semibold text-[#031017] shadow-[0_18px_50px_rgba(20,196,225,0.28)] transition hover:brightness-105"
                            >
                                Continue with Google
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {status === 'authenticated' && session?.user && (
                        <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-1 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
                            <LeaderboardOptIn />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
