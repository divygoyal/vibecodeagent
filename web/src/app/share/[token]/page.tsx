import { Metadata } from 'next';
import Link from 'next/link';
import { getShareData } from '@/app/api/share/route';
import SharedDashboardClient from './SharedDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared Dashboard — TrafficClaw',
    description: 'View shared analytics dashboard powered by TrafficClaw',
};

/* ─── Page Component ─── */
export default async function SharedDashboardPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const share = await getShareData(token);

    /* ─── Invalid / revoked token ─── */
    if (!share) {
        return (
            <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-semibold text-zinc-100 mb-2">Dashboard Not Found</h1>
                    <p className="text-sm text-zinc-500 mb-6">
                        This shared dashboard doesn&apos;t exist or has been revoked by the owner.
                    </p>
                    <Link
                        href="https://trafficclaw.com"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-all"
                    >
                        Visit TrafficClaw
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050507] text-zinc-100">
            {/* Header */}
            <header className="border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-semibold text-zinc-100">Shared Dashboard</h1>
                            <p className="text-[10px] text-zinc-600">TrafficClaw Analytics</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        {share.views} views
                    </div>
                </div>
            </header>

            {/* Dashboard Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Property info */}
                {share.siteUrl && (
                    <div className="mb-6">
                        <p className="text-xs text-zinc-600">
                            Analytics for{' '}
                            <span className="text-zinc-400 font-mono">{share.siteUrl}</span>
                        </p>
                    </div>
                )}

                {/* Client component handles data fetching, range selection, and rendering */}
                <SharedDashboardClient
                    token={token}
                    config={share.config}
                    siteUrl={share.siteUrl}
                    views={share.views}
                />
            </main>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] mt-12">
                <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </div>
                        <span className="text-sm font-semibold text-zinc-300">TrafficClaw</span>
                    </div>
                    <p className="text-xs text-zinc-600 text-center">
                        Powered by TrafficClaw — Free AI-Powered Analytics
                    </p>
                    <Link
                        href="https://trafficclaw.com"
                        className="text-xs text-emerald-500/70 hover:text-emerald-400 transition-colors"
                    >
                        trafficclaw.com
                    </Link>
                </div>
            </footer>
        </div>
    );
}
