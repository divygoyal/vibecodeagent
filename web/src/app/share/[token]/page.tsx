import { Metadata } from 'next';
import Link from 'next/link';
import { getShareData } from '@/app/api/share/route';
import SharedDashboardClient from './SharedDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared Dashboard — TrafficClaw',
    description: 'View shared analytics dashboard powered by TrafficClaw',
};

/* ─── Demo data generator (since we use in-memory store) ─── */
function generateDemoData() {
    const now = new Date();
    const trafficTrend = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (13 - i));
        const base = 1200 + Math.floor(Math.random() * 800);
        return {
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            users: base + Math.floor(Math.random() * 400),
            sessions: Math.floor(base * 0.7 + Math.random() * 300),
            views: Math.floor(base * 2.5 + Math.random() * 500),
        };
    });

    const kpis = [
        { label: 'Users', value: '23,997', change: '12.4%', positive: true },
        { label: 'Sessions', value: '15,234', change: '8.7%', positive: true },
        { label: 'Page Views', value: '80,695', change: '15.2%', positive: true },
        { label: 'Bounce Rate', value: '32.8%', change: '3.1%', positive: false },
    ];

    const sources = [
        { source: 'Google', sessions: 4821 },
        { source: 'Direct', sessions: 2134 },
        { source: 'Twitter / X', sessions: 987 },
        { source: 'GitHub', sessions: 654 },
        { source: 'Reddit', sessions: 432 },
    ];

    const topPages = [
        { page: '/', views: 8432 },
        { page: '/pricing', views: 2890 },
        { page: '/blog/seo-guide', views: 1847 },
        { page: '/features', views: 1234 },
        { page: '/docs/getting-started', views: 876 },
    ];

    return { kpis, trafficTrend, sources, topPages };
}

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

    /* ─── Valid share — render dashboard ─── */
    const { kpis, trafficTrend, sources, topPages } = generateDemoData();

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

                {/* Client-rendered dashboard */}
                {share.config.traffic && (
                    <SharedDashboardClient
                        kpis={kpis}
                        trafficTrend={trafficTrend}
                        sources={share.config.sources ? sources : []}
                        topPages={share.config.pages ? topPages : []}
                        showSources={share.config.sources}
                        showPages={share.config.pages}
                        showGeo={share.config.geo}
                    />
                )}

                {/* SEO section placeholder */}
                {share.config.seo && (
                    <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                        <h3 className="text-sm font-semibold text-zinc-300 mb-3">SEO Performance</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Total Clicks', value: '12,847', change: '+18.3%' },
                                { label: 'Impressions', value: '324,591', change: '+9.1%' },
                                { label: 'Avg. CTR', value: '3.96%', change: '+0.4%' },
                                { label: 'Avg. Position', value: '14.2', change: '-2.1' },
                            ].map((item) => (
                                <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                                    <p className="text-[10px] text-zinc-500">{item.label}</p>
                                    <p className="text-lg font-bold text-zinc-100 font-mono">{item.value}</p>
                                    <p className="text-[10px] text-emerald-400">{item.change}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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
