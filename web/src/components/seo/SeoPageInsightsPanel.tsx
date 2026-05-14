'use client';

import { useMemo } from 'react';
import {
    AlertCircle,
    Eye,
    ExternalLink,
    Hash,
    Loader2,
    Monitor,
    MousePointer,
    Search,
    Smartphone,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react';
import { AnalyticsSubpagePanel, formatCompactNumber } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { usePageDetail } from '@/lib/useDashboardData';
import { pageInsightPrompt } from '@/lib/seoAiPrompts';
import { AskAiButton } from './AskAiButton';
import PositionPill from './PositionPill';

interface KeywordRow {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface DeviceRow {
    device: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface PageDetail {
    keywords: KeywordRow[];
    devices: DeviceRow[];
}

interface SeoPageInsightsPanelProps {
    pageUrl: string | null;
    siteUrl: string | null;
    summary?: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    };
}

type Tone = 'emerald' | 'cyan' | 'amber' | 'violet';

const TONE_VALUE: Record<Tone, string> = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
};
const TONE_ICON: Record<Tone, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/20',
    amber: 'text-amber-400 bg-amber-500/[0.08] border-amber-500/20',
    violet: 'text-violet-400 bg-violet-500/[0.08] border-violet-500/20',
};

function shortenPath(url: string): string {
    try {
        const u = new URL(url);
        return (u.pathname + u.search) || '/';
    } catch {
        return url;
    }
}

function KpiTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone }) {
    return (
        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${TONE_ICON[tone]}`}>
                    <Icon className="h-2.5 w-2.5" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
            </div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none tracking-[-0.02em] ${TONE_VALUE[tone]}`}>{value}</p>
        </div>
    );
}

function deviceIcon(device: string): LucideIcon {
    const d = device.toUpperCase();
    if (d === 'MOBILE') return Smartphone;
    if (d === 'DESKTOP') return Monitor;
    return Hash;
}

function deviceLabel(device: string): string {
    const d = device.toUpperCase();
    if (d === 'MOBILE') return 'Mobile';
    if (d === 'DESKTOP') return 'Desktop';
    if (d === 'TABLET') return 'Tablet';
    return device;
}

export default function SeoPageInsightsPanel({ pageUrl, siteUrl, summary }: SeoPageInsightsPanelProps) {
    const { data, error, isLoading } = usePageDetail(pageUrl ? siteUrl : null, pageUrl);
    const detail = data as PageDetail | undefined;

    const computed = useMemo(() => {
        if (summary) return { ...summary, ctrLabel: `${summary.ctr.toFixed(1)}%` };
        if (!detail?.keywords?.length) return null;
        const totalClicks = detail.keywords.reduce((s, k) => s + k.clicks, 0);
        const totalImpr = detail.keywords.reduce((s, k) => s + k.impressions, 0);
        const avgPos = +(detail.keywords.reduce((s, k) => s + k.position, 0) / detail.keywords.length).toFixed(1);
        const avgCtr = totalImpr > 0 ? +((totalClicks / totalImpr) * 100).toFixed(2) : 0;
        return { clicks: totalClicks, impressions: totalImpr, position: avgPos, ctr: avgCtr, ctrLabel: `${avgCtr.toFixed(1)}%` };
    }, [detail, summary]);

    const totalDeviceImpr = (detail?.devices || []).reduce((s, d) => s + d.impressions, 0);

    return (
        <AnalyticsSubpagePanel
            title="Page detail"
            description={pageUrl ? 'Performance, devices, and ranking keywords for the selected page.' : 'Pick a page on the left to populate this panel.'}
            tone="cyan"
            action={
                pageUrl ? (
                    <div className="flex items-center gap-2">
                        <a
                            href={pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 transition hover:border-cyan-500/40"
                        >
                            <ExternalLink className="h-3 w-3" />
                            <span className="max-w-[160px] truncate">{shortenPath(pageUrl)}</span>
                        </a>
                        <AskAiButton
                            question={computed
                                ? pageInsightPrompt({
                                    page: pageUrl,
                                    clicks: computed.clicks,
                                    impressions: computed.impressions,
                                    ctr: computed.ctr,
                                    position: computed.position,
                                })
                                : ''}
                            siteUrl={siteUrl}
                            fromTag="seo:page_insight"
                            enabled={!!computed}
                        />
                    </div>
                ) : null
            }
        >
            {!pageUrl ? (
                <div className="flex h-[280px] flex-col items-center justify-center rounded-[14px] border border-dashed border-white/[0.06] bg-[#0a0b0e] text-center">
                    <Search className="mb-3 h-5 w-5 text-zinc-600" />
                    <p className="text-[13px] font-semibold text-white">Select a page</p>
                    <p className="mt-1 max-w-xs text-[12px] text-zinc-500">Click any row in the Pages tab to see clicks, devices, and the queries that drive traffic to it.</p>
                </div>
            ) : isLoading && !detail ? (
                <div className="flex h-[280px] items-center justify-center text-[12px] text-zinc-500">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading page detail…
                </div>
            ) : error ? (
                <div className="rounded-[12px] border border-red-500/15 bg-red-500/[0.04] px-4 py-6 text-center text-[12px] text-red-300">
                    <AlertCircle className="mr-1 inline-block h-3.5 w-3.5" />
                    Couldn&apos;t load page detail. {error.info?.error || error.message}
                </div>
            ) : (
                <div className="space-y-5">
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <KpiTile icon={MousePointer} label="Total Clicks" tone="emerald" value={computed ? formatCompactNumber(computed.clicks) : '—'} />
                        <KpiTile icon={Eye} label="Impressions" tone="cyan" value={computed ? formatCompactNumber(computed.impressions) : '—'} />
                        <KpiTile icon={Hash} label="Avg. Position" tone="amber" value={computed ? computed.position.toFixed(1) : '—'} />
                        <KpiTile icon={TrendingUp} label="Avg. CTR" tone="violet" value={computed ? computed.ctrLabel : '—'} />
                    </div>

                    {/* Device breakdown */}
                    {detail?.devices?.length ? (
                        <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12] px-4 py-3">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                                    <Smartphone className="h-3 w-3" />
                                    Device breakdown
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500">28-day window</span>
                            </div>
                            <div className="space-y-2.5">
                                {detail.devices.map(d => {
                                    const Icon = deviceIcon(d.device);
                                    const pct = totalDeviceImpr > 0 ? (d.impressions / totalDeviceImpr) * 100 : 0;
                                    return (
                                        <div key={d.device} className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                                                    <Icon className="h-3 w-3 text-zinc-400" />
                                                    {deviceLabel(d.device)}
                                                </span>
                                                <span className="font-mono tabular-nums text-zinc-400">
                                                    <span className="text-emerald-300">{formatCompactNumber(d.clicks)}</span> · <span className="text-cyan-300">{formatCompactNumber(d.impressions)}</span> · <PositionPillInline pos={d.position} />
                                                </span>
                                            </div>
                                            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                                                <div className="absolute left-0 top-0 h-full rounded-full bg-cyan-400/80 transition-[width]" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {/* Ranking keywords */}
                    <div className="rounded-[14px] border border-white/[0.06] bg-[#0d0e12]">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                                <Search className="h-3 w-3" />
                                Ranking keywords
                            </span>
                            {detail?.keywords?.length ? (
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{detail.keywords.length} queries</span>
                            ) : null}
                        </div>
                        {detail?.keywords?.length ? (
                            <>
                                <div
                                    className="hidden md:grid gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] font-medium text-zinc-500"
                                    style={{ gridTemplateColumns: 'minmax(0,1fr) 80px 88px 64px 80px' }}
                                >
                                    <span>Query</span>
                                    <span className="text-right">Clicks</span>
                                    <span className="text-right">Impressions</span>
                                    <span className="text-right">CTR</span>
                                    <span className="text-right">Position</span>
                                </div>
                                <div className="max-h-[280px] overflow-y-auto">
                                    {detail.keywords.map((k, i) => (
                                        <div
                                            key={i}
                                            className="grid h-9 grid-cols-[minmax(0,1fr)_80px_88px_64px_80px] items-center gap-3 border-b border-white/[0.04] px-4 last:border-b-0 hover:bg-white/[0.02]"
                                        >
                                            <span className="block truncate text-[12px] text-zinc-200" title={k.query}>{k.query}</span>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-emerald-300">{formatCompactNumber(k.clicks)}</span>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-cyan-300">{formatCompactNumber(k.impressions)}</span>
                                            <span className="text-right font-mono text-[12px] tabular-nums text-zinc-300">{k.ctr.toFixed(1)}%</span>
                                            <span className="text-right"><PositionPill pos={k.position} /></span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="px-4 py-6 text-center text-[12px] text-zinc-500">No queries found for this page.</div>
                        )}
                    </div>
                </div>
            )}
        </AnalyticsSubpagePanel>
    );
}

function PositionPillInline({ pos }: { pos: number }) {
    let cls = 'text-zinc-400';
    if (pos > 0) {
        if (pos <= 3) cls = 'text-emerald-300';
        else if (pos <= 10) cls = 'text-emerald-400';
        else if (pos <= 20) cls = 'text-amber-300';
        else cls = 'text-red-300';
    }
    return <span className={`tabular-nums ${cls}`}>#{pos.toFixed(1)}</span>;
}
