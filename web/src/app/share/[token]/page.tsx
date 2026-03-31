import { Metadata } from 'next';
import Link from 'next/link';
import { getShareData } from '@/app/api/share/route';
import {
    fetchGoogleTokensFromDb,
    getValidAccessToken,
    fetchAnalyticsDashboard,
    fetchSeoDashboard,
} from '@/lib/googleApi';
import SharedDashboardClient from './SharedDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared Dashboard — TrafficClaw',
    description: 'View shared analytics dashboard powered by TrafficClaw',
};

/* ─── Helpers ─── */
function fmtNumber(n: number): string {
    return n.toLocaleString('en-US');
}

function fmtPct(n: number): string {
    const abs = Math.abs(n);
    return `${abs.toFixed(1)}%`;
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

    /* ─── Fetch real analytics data ─── */
    let analyticsData: {
        kpis: { label: string; value: string; change: string; positive: boolean }[];
        trafficTrend: { date: string; users: number; sessions: number; views: number }[];
        sources: { source: string; sessions: number }[];
        topPages: { page: string; views: number }[];
        countries: { country: string; users: number }[];
    } | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seoData: any = null;
    let seoError: string | null = null;
    let dataError = false;

    try {
        const tokens = await fetchGoogleTokensFromDb(share.userId);
        if (!tokens) throw new Error('No Google tokens found');

        const accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);

        // Fetch GA4 data if any analytics section is enabled
        if (share.config.traffic || share.config.sources || share.config.pages || share.config.geo) {
            const dashboard = await fetchAnalyticsDashboard(accessToken, share.propertyId, '30d');

            const kpis = dashboard.kpis
                ? [
                      {
                          label: 'Users',
                          value: fmtNumber(dashboard.kpis.totalUsers),
                          change: fmtPct(dashboard.kpis.changeUsers),
                          positive: dashboard.kpis.changeUsers >= 0,
                      },
                      {
                          label: 'Sessions',
                          value: fmtNumber(dashboard.kpis.totalSessions),
                          change: fmtPct(dashboard.kpis.changeSessions),
                          positive: dashboard.kpis.changeSessions >= 0,
                      },
                      {
                          label: 'Page Views',
                          value: fmtNumber(dashboard.kpis.totalPageViews),
                          change: fmtPct(dashboard.kpis.changePageViews),
                          positive: dashboard.kpis.changePageViews >= 0,
                      },
                      {
                          label: 'Bounce Rate',
                          value: `${dashboard.kpis.avgBounceRate}%`,
                          change: fmtPct(dashboard.kpis.changeBounceRate),
                          positive: dashboard.kpis.changeBounceRate <= 0,
                      },
                  ]
                : [];

            const trafficTrend = (dashboard.traffic || []).map(
                (t: { date: string; activeUsers: number; sessions: number; pageViews: number }) => ({
                    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    users: t.activeUsers,
                    sessions: t.sessions,
                    views: t.pageViews,
                })
            );

            const sources = (dashboard.sources || []).map(
                (s: { source: string; sessions: number }) => ({
                    source: s.source,
                    sessions: s.sessions,
                })
            );

            const topPages = (dashboard.pages || []).map(
                (p: { page: string; views: number }) => ({
                    page: p.page,
                    views: p.views,
                })
            );

            const countries = (dashboard.countries || []).map(
                (c: { country: string; users: number }) => ({
                    country: c.country,
                    users: c.users,
                })
            );

            analyticsData = { kpis, trafficTrend, sources, topPages, countries };
        }

        // Fetch SEO data if enabled
        if (share.config.seo && share.siteUrl) {
            try {
                seoData = await fetchSeoDashboard(accessToken, share.siteUrl);
            } catch {
                seoError = 'SEO data requires a Google Search Console connection';
            }
        } else if (share.config.seo) {
            seoError = 'SEO data requires a Google Search Console connection';
        }
    } catch (err) {
        console.error('Share page — data fetch error:', err);
        dataError = true;
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

                {/* Data unavailable state */}
                {dataError && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 mb-6">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-amber-300">Analytics data is temporarily unavailable</p>
                                <p className="text-xs text-zinc-500 mt-1">
                                    The dashboard owner&apos;s analytics connection may need to be refreshed. Please try again later.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Client-rendered analytics dashboard */}
                {!dataError && analyticsData && share.config.traffic && (
                    <SharedDashboardClient
                        kpis={analyticsData.kpis}
                        trafficTrend={analyticsData.trafficTrend}
                        sources={share.config.sources ? analyticsData.sources : []}
                        topPages={share.config.pages ? analyticsData.topPages : []}
                        countries={share.config.geo ? analyticsData.countries : []}
                        showSources={share.config.sources}
                        showPages={share.config.pages}
                        showGeo={share.config.geo}
                    />
                )}

                {/* SEO section */}
                {share.config.seo && seoData && seoData.kpis && (
                    <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                        <h3 className="text-sm font-semibold text-zinc-300 mb-3">SEO Performance</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                {
                                    label: 'Total Clicks',
                                    value: fmtNumber(seoData.kpis.totalClicks),
                                    change: `${seoData.kpis.changeClicks >= 0 ? '+' : ''}${seoData.kpis.changeClicks}%`,
                                    positive: seoData.kpis.changeClicks >= 0,
                                },
                                {
                                    label: 'Impressions',
                                    value: fmtNumber(seoData.kpis.totalImpressions),
                                    change: `${seoData.kpis.changeImpressions >= 0 ? '+' : ''}${seoData.kpis.changeImpressions}%`,
                                    positive: seoData.kpis.changeImpressions >= 0,
                                },
                                {
                                    label: 'Avg. CTR',
                                    value: `${seoData.kpis.avgCTR}%`,
                                    change: `${seoData.kpis.changeCTR >= 0 ? '+' : ''}${seoData.kpis.changeCTR}%`,
                                    positive: seoData.kpis.changeCTR >= 0,
                                },
                                {
                                    label: 'Avg. Position',
                                    value: `${seoData.kpis.avgPosition}`,
                                    change: `${seoData.kpis.changePosition >= 0 ? '+' : ''}${seoData.kpis.changePosition}`,
                                    positive: seoData.kpis.changePosition <= 0,
                                },
                            ].map((item) => (
                                <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                                    <p className="text-[10px] text-zinc-500">{item.label}</p>
                                    <p className="text-lg font-bold text-zinc-100 font-mono">{item.value}</p>
                                    <p className={`text-[10px] ${item.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {item.change}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Top Queries */}
                        {seoData.queries && seoData.queries.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-medium text-zinc-400 mb-2">Top Queries</h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-white/[0.06]">
                                                <th className="text-left py-2 text-zinc-500 font-medium">Query</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">Clicks</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">Impressions</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">CTR</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">Position</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {seoData.queries.slice(0, 10).map((q: { query: string; clicks: number; impressions: number; ctr: number; position: number }, i: number) => (
                                                <tr key={i} className="border-b border-white/[0.04]">
                                                    <td className="py-2 text-zinc-300 truncate max-w-[200px]">{q.query}</td>
                                                    <td className="py-2 text-right text-zinc-400 font-mono">{fmtNumber(q.clicks)}</td>
                                                    <td className="py-2 text-right text-zinc-400 font-mono">{fmtNumber(q.impressions)}</td>
                                                    <td className="py-2 text-right text-zinc-400 font-mono">{q.ctr}%</td>
                                                    <td className="py-2 text-right text-zinc-400 font-mono">{q.position}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* SEO error / unavailable state */}
                {share.config.seo && !seoData && seoError && (
                    <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                        <h3 className="text-sm font-semibold text-zinc-300 mb-2">SEO Performance</h3>
                        <p className="text-xs text-zinc-500">{seoError}</p>
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
