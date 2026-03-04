'use client';

import { memo, useMemo } from 'react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { TrendingUp, TrendingDown, Eye, MousePointerClick, MapPin, AlertTriangle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   SHARED CONFIG
   ═══════════════════════════════════════════════════════════════ */

const COLORS = {
    clicks: '#f97316',      // orange-500
    impressions: '#64748b', // slate-500
    ctr: '#10b981',         // emerald-500
    position: '#f59e0b',    // amber-500
    device: { mobile: '#f97316', desktop: '#334155', tablet: '#10b981' },
    pie: ['#f97316', '#334155', '#64748b', '#cbd5e1', '#f59e0b', '#10b981', '#ef4444'],
    posBuckets: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'], // top3, 4-10, 11-20, 20+
};

const CARD = 'rounded-xl border border-white/[0.04] bg-white/[0.02] overflow-hidden';

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-3 py-2 shadow-2xl text-[11px]">
            {label && <p className="text-zinc-500 mb-1 font-medium">{label}</p>}
            {payload.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <span className="text-zinc-400">{e.name}:</span>
                    <span className="text-white font-semibold tabular-nums">{typeof e.value === 'number' ? e.value.toLocaleString() : e.value}</span>
                </div>
            ))}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   1. TREND LINE CHART (AreaChart — date dimension)
   ═══════════════════════════════════════════════════════════════ */

interface TrendRow { date: string; clicks: number; impressions: number; ctr?: number; position?: number }

export const TrendLineChart = memo(function TrendLineChart({ rows }: { rows: TrendRow[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        return rows.map(r => ({
            date: r.date?.replace(/^\d{4}-/, '') || '', // strip year for compact labels
            Clicks: r.clicks,
            Impressions: r.impressions,
        }));
    }, [rows]);

    if (data.length < 2) return null;

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Traffic Trend
            </p>
            <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <defs>
                            <linearGradient id="chatGradClicks" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.clicks} stopOpacity={0.25} />
                                <stop offset="95%" stopColor={COLORS.clicks} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="chatGradImpr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.impressions} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={COLORS.impressions} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="Clicks" stroke={COLORS.clicks} strokeWidth={2} fill="url(#chatGradClicks)" dot={false} />
                        <Area type="monotone" dataKey="Impressions" stroke={COLORS.impressions} strokeWidth={1.5} fill="url(#chatGradImpr)" dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   2. HORIZONTAL BAR CHART (query / page dimension)
   ═══════════════════════════════════════════════════════════════ */

export const HorizontalBarChart = memo(function HorizontalBarChart({ rows, dimKey, title }: {
    rows: any[];
    dimKey: string;
    title?: string;
}) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        return rows.slice(0, 8).map(r => {
            const label = String(r[dimKey] || r.query || r.page || '');
            return {
                name: label.length > 28 ? label.slice(0, 28) + '\u2026' : label,
                Clicks: r.clicks || 0,
                Impressions: r.impressions || 0,
            };
        }).reverse(); // highest at top
    }, [rows, dimKey]);

    if (data.length === 0) return null;

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-2 uppercase tracking-wider">
                {title || `Top by ${dimKey}`}
            </p>
            <div style={{ height: Math.max(120, data.length * 32 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="Clicks" fill={COLORS.clicks} radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   3. DEVICE DONUT CHART (device dimension)
   ═══════════════════════════════════════════════════════════════ */

export const DeviceDonutChart = memo(function DeviceDonutChart({ rows }: { rows: any[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        // Handle both {device, clicks} and {device, percentage} shapes
        const total = rows.reduce((s, r) => s + (r.clicks || r.value || 0), 0);
        return rows.map(r => {
            const name = (r.device || r.name || 'Unknown').charAt(0).toUpperCase() + (r.device || r.name || 'Unknown').slice(1);
            const value = r.clicks || r.value || 0;
            return { name, value, pct: total > 0 ? ((value / total) * 100).toFixed(1) : (r.percentage || 0) };
        });
    }, [rows]);

    if (data.length === 0) return null;

    const deviceColors: Record<string, string> = { Mobile: COLORS.device.mobile, Desktop: COLORS.device.desktop, Tablet: COLORS.device.tablet };

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-2 uppercase tracking-wider">Device Split</p>
            <div className="flex items-center gap-4">
                <div className="h-[140px] w-[140px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                                {data.map((d, i) => <Cell key={i} fill={deviceColors[d.name] || COLORS.pie[i]} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                    {data.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: deviceColors[d.name] || COLORS.pie[i] }} />
                            <span className="text-zinc-400">{d.name}</span>
                            <span className="text-white font-semibold ml-auto tabular-nums">{d.pct}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   4. COUNTRY BAR CHART (country dimension)
   ═══════════════════════════════════════════════════════════════ */

const COUNTRY_FLAGS: Record<string, string> = {
    'usa': '\u{1F1FA}\u{1F1F8}', 'ind': '\u{1F1EE}\u{1F1F3}', 'gbr': '\u{1F1EC}\u{1F1E7}', 'can': '\u{1F1E8}\u{1F1E6}',
    'aus': '\u{1F1E6}\u{1F1FA}', 'deu': '\u{1F1E9}\u{1F1EA}', 'fra': '\u{1F1EB}\u{1F1F7}', 'bra': '\u{1F1E7}\u{1F1F7}',
    'jpn': '\u{1F1EF}\u{1F1F5}', 'mex': '\u{1F1F2}\u{1F1FD}', 'esp': '\u{1F1EA}\u{1F1F8}', 'ita': '\u{1F1EE}\u{1F1F9}',
    'nld': '\u{1F1F3}\u{1F1F1}', 'phl': '\u{1F1F5}\u{1F1ED}', 'pak': '\u{1F1F5}\u{1F1F0}', 'idn': '\u{1F1EE}\u{1F1E9}',
};

export const CountryBarChart = memo(function CountryBarChart({ rows }: { rows: any[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        return rows.slice(0, 6).map(r => {
            const code = (r.country || r.name || '').toLowerCase().slice(0, 3);
            return {
                name: `${COUNTRY_FLAGS[code] || '\u{1F30D}'} ${r.country || r.name || 'Unknown'}`,
                Clicks: r.clicks || r.value || 0,
            };
        }).reverse();
    }, [rows]);

    if (data.length === 0) return null;

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Top Countries
            </p>
            <div style={{ height: Math.max(100, data.length * 30 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="Clicks" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   5. POSITION DISTRIBUTION CHART (donut — 4 buckets)
   ═══════════════════════════════════════════════════════════════ */

export const PositionDistributionChart = memo(function PositionDistributionChart({ rows }: { rows: any[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        const buckets = [
            { name: 'Top 3', count: 0, range: [0, 3] },
            { name: 'Pos 4-10', count: 0, range: [4, 10] },
            { name: 'Pos 11-20', count: 0, range: [11, 20] },
            { name: 'Pos 20+', count: 0, range: [20, Infinity] },
        ];
        for (const r of rows) {
            const pos = r.position || 50;
            if (pos <= 3) buckets[0].count++;
            else if (pos <= 10) buckets[1].count++;
            else if (pos <= 20) buckets[2].count++;
            else buckets[3].count++;
        }
        return buckets.filter(b => b.count > 0).map(b => ({ name: b.name, value: b.count }));
    }, [rows]);

    if (data.length === 0) return null;
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-2 uppercase tracking-wider">Position Distribution</p>
            <div className="flex items-center gap-4">
                <div className="h-[140px] w-[140px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                                {data.map((_, i) => <Cell key={i} fill={COLORS.posBuckets[i]} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                    {data.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS.posBuckets[i] }} />
                            <span className="text-zinc-400">{d.name}</span>
                            <span className="text-white font-semibold ml-auto tabular-nums">
                                {d.value} ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   6. CTR OPPORTUNITY LIST (styled list — no chart)
   ═══════════════════════════════════════════════════════════════ */

const CTR_BENCHMARKS: Record<number, number> = {
    1: 28, 2: 16, 3: 11, 4: 8, 5: 6.5, 6: 5, 7: 4, 8: 3.2, 9: 2.6, 10: 2.2,
};

export const CtrOpportunityList = memo(function CtrOpportunityList({ rows }: { rows: any[] }) {
    const opportunities = useMemo(() => {
        if (!rows?.length) return [];
        return rows
            .filter(r => (r.impressions || 0) > 100 && (r.ctr || 0) < 3)
            .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
            .slice(0, 5)
            .map(r => {
                const pos = Math.round(r.position || 10);
                const expected = CTR_BENCHMARKS[Math.min(pos, 10)] || 2;
                const actual = r.ctr || 0;
                const gap = expected - actual;
                return {
                    query: r.query || r.page || 'Unknown',
                    impressions: r.impressions,
                    ctr: actual,
                    expected,
                    gap: gap > 0 ? gap : 0,
                    position: r.position,
                };
            })
            .filter(o => o.gap > 1);
    }, [rows]);

    if (opportunities.length === 0) return null;

    return (
        <div className={`${CARD} my-3 p-4`}>
            <p className="text-[11px] text-zinc-400 font-semibold mb-3 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> CTR Opportunities
            </p>
            <div className="space-y-2">
                {opportunities.map((o, i) => (
                    <div key={i} className="flex items-center gap-3 text-[11px] py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                        <div className="flex-1 min-w-0">
                            <p className="text-zinc-300 truncate font-medium">{o.query}</p>
                            <p className="text-zinc-500 text-[10px]">
                                Pos {o.position?.toFixed(0)} &middot; {o.impressions?.toLocaleString()} impr
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-red-400 font-mono font-semibold">{o.ctr?.toFixed(1)}%</span>
                            <TrendingDown className="w-3 h-3 text-zinc-600" />
                            <span className="text-emerald-400 font-mono font-semibold">{o.expected?.toFixed(1)}%</span>
                            <span className="bg-amber-500/10 text-amber-400 text-[9px] px-1.5 py-0.5 rounded-full font-semibold">
                                +{o.gap.toFixed(1)}% gap
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   7. OVERVIEW METRIC CARDS (summary KPI grid)
   ═══════════════════════════════════════════════════════════════ */

export const OverviewMetricCards = memo(function OverviewMetricCards({ data }: { data: any }) {
    if (!data) return null;

    const metrics = [
        { label: 'Clicks', value: data.totalClicks ?? data.clicks, icon: MousePointerClick, color: 'text-orange-400' },
        { label: 'Impressions', value: data.totalImpressions ?? data.impressions, icon: Eye, color: 'text-slate-400' },
        { label: 'Avg CTR', value: data.avgCTR ?? data.ctr, suffix: '%', icon: TrendingUp, color: 'text-emerald-400' },
        { label: 'Avg Pos', value: data.avgPosition ?? data.position, icon: MapPin, color: 'text-amber-400' },
    ].filter(m => m.value !== undefined && m.value !== null);

    if (metrics.length === 0) return null;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
            {metrics.map((m, i) => {
                const Icon = m.icon;
                const display = typeof m.value === 'number'
                    ? (m.suffix ? m.value.toFixed(1) + m.suffix : m.value.toLocaleString())
                    : String(m.value);
                return (
                    <div key={i} className={`${CARD} p-3 text-center`}>
                        <Icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} />
                        <p className="text-white font-bold text-sm tabular-nums">{display}</p>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wider">{m.label}</p>
                    </div>
                );
            })}
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   SMART CHART PANEL — auto-selects charts based on dimensions
   ═══════════════════════════════════════════════════════════════ */

export interface StructuredToolResult {
    dimensions: string[];
    rows: any[];
    totals?: any;
}

function hasPositionData(rows: any[]): boolean {
    return rows.length > 3 && rows.some(r => r.position !== undefined);
}

export const SmartChartPanel = memo(function SmartChartPanel({ result }: { result: StructuredToolResult }) {
    if (!result?.rows?.length) return null;

    const { dimensions = [], rows } = result;
    const hasDate = dimensions.includes('date');
    const hasQuery = dimensions.includes('query');
    const hasPage = dimensions.includes('page');
    const hasDevice = dimensions.includes('device');
    const hasCountry = dimensions.includes('country');

    return (
        <div className="chat-charts-panel">
            {hasDate && <TrendLineChart rows={rows} />}
            {hasQuery && <HorizontalBarChart rows={rows} dimKey="query" title="Top Keywords by Clicks" />}
            {hasQuery && <CtrOpportunityList rows={rows} />}
            {hasPage && <HorizontalBarChart rows={rows} dimKey="page" title="Top Pages by Clicks" />}
            {hasDevice && <DeviceDonutChart rows={rows} />}
            {hasCountry && <CountryBarChart rows={rows} />}
            {!hasDate && hasPositionData(rows) && <PositionDistributionChart rows={rows} />}
        </div>
    );
});
