'use client';

import { memo, useMemo } from 'react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
    LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown, Eye, MousePointerClick, MapPin, AlertTriangle, BarChart3 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   SHARED PALETTE — brand-cyan primary, semantic ramp by rank.
   The previous all-orange approach made every chart look identical;
   this maps top→cyan, mid→amber, tail→zinc so a glance reads rank.
   ═══════════════════════════════════════════════════════════════ */

const PALETTE = {
    primary: '#22d3ee',      // brand cyan
    primaryDeep: '#0e7490',
    success: '#10b981',      // emerald (good CTR / top positions)
    warning: '#f59e0b',      // amber (mid)
    danger: '#ef4444',       // red (bad CTR / page 3+)
    neutral: '#52525b',      // zinc-600 (impressions / passives)
    impressions: '#6366f1',  // indigo (distinct from clicks)
    deviceMobile: '#22d3ee',
    deviceDesktop: '#a855f7', // purple
    deviceTablet: '#f59e0b',
    posBuckets: ['#10b981', '#22d3ee', '#f59e0b', '#ef4444'], // top3 / 4-10 / 11-20 / 20+
};

/** Rank-based color: top performer cyan → amber middle → zinc tail. */
function rankColor(idx: number, total: number): string {
    if (total <= 1) return PALETTE.primary;
    const pct = idx / Math.max(1, total - 1);
    if (pct <= 0.34) return PALETTE.primary;
    if (pct <= 0.67) return PALETTE.warning;
    return PALETTE.neutral;
}

/** Card with brand-cyan accent stripe on the left edge. */
const CARD = 'relative rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-white/[0.01] overflow-hidden';
const ACCENT_BAR = 'absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-gradient-to-b from-[#22d3ee] via-[#0e7490] to-transparent';

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508]/95 backdrop-blur border border-white/[0.12] rounded-xl px-3 py-2 shadow-2xl shadow-black/50 text-[11px]">
            {label && <p className="text-zinc-400 mb-1.5 font-semibold">{label}</p>}
            {payload.map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color || e.fill }} />
                    <span className="text-zinc-500">{e.name}:</span>
                    <span className="text-white font-semibold tabular-nums">
                        {typeof e.value === 'number' ? e.value.toLocaleString() : e.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Data-label rendered AT THE END of horizontal bars so values are visible without hover. */
function BarValueLabel({ x, y, width, height, value }: any) {
    if (typeof value !== 'number' || value === 0) return null;
    const display = value >= 10000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();
    return (
        <text
            x={x + width + 6}
            y={y + height / 2}
            fill="#e4e4e7"
            fontSize={10}
            fontWeight={600}
            dominantBaseline="middle"
            className="tabular-nums"
        >
            {display}
        </text>
    );
}

function ChartHeader({ icon: Icon, iconColor = 'text-cyan-400', title, sub }: { icon?: any; iconColor?: string; title: string; sub?: string }) {
    return (
        <div className="flex items-center justify-between mb-2.5 ml-2">
            <div className="flex items-center gap-1.5">
                {Icon && <Icon className={`w-3.5 h-3.5 ${iconColor}`} />}
                <span className="text-[11px] text-zinc-300 font-semibold uppercase tracking-wider">{title}</span>
            </div>
            {sub && <span className="text-[10px] text-zinc-500 tabular-nums">{sub}</span>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   1. TREND LINE CHART (date dimension)
   ═══════════════════════════════════════════════════════════════ */

interface TrendRow { date: string; clicks: number; impressions: number; ctr?: number; position?: number }

export const TrendLineChart = memo(function TrendLineChart({ rows }: { rows: TrendRow[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        return rows.map(r => ({
            date: r.date?.replace(/^\d{4}-/, '') || '',
            Clicks: r.clicks,
            Impressions: r.impressions,
        }));
    }, [rows]);

    const totals = useMemo(() => ({
        clicks: data.reduce((s, d) => s + d.Clicks, 0),
        impressions: data.reduce((s, d) => s + d.Impressions, 0),
    }), [data]);

    if (data.length < 2) return null;

    return (
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader
                icon={TrendingUp}
                iconColor="text-emerald-400"
                title="Traffic Trend"
                sub={`${totals.clicks.toLocaleString()} clicks · ${totals.impressions.toLocaleString()} impr`}
            />
            <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 5 }}>
                        <defs>
                            <linearGradient id="chatGradClicks" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={PALETTE.primary} stopOpacity={0.45} />
                                <stop offset="95%" stopColor={PALETTE.primary} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="chatGradImpr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={PALETTE.impressions} stopOpacity={0.18} />
                                <stop offset="95%" stopColor={PALETTE.impressions} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="Impressions" stroke={PALETTE.impressions} strokeWidth={1.5} fill="url(#chatGradImpr)" dot={false} />
                        <Area type="monotone" dataKey="Clicks" stroke={PALETTE.primary} strokeWidth={2.25} fill="url(#chatGradClicks)" dot={false} activeDot={{ r: 4, fill: PALETTE.primary, stroke: '#050508', strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   2. HORIZONTAL BAR CHART (query / page) — rank-colored + value labels
   ═══════════════════════════════════════════════════════════════ */

export const HorizontalBarChart = memo(function HorizontalBarChart({ rows, dimKey, title }: {
    rows: any[];
    dimKey: string;
    title?: string;
}) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        // Tolerate the field-name drift across upstreams (GSC: clicks, GA4:
        // sessions, OpenPanel: users, Umami: pageviews, internal: value).
        const valueOf = (r: any): number => {
            const n = Number(r.clicks ?? r.sessions ?? r.users ?? r.value ?? r.count ?? r.pageviews ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const imprOf = (r: any): number => {
            const n = Number(r.impressions ?? r.views ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        return rows.slice(0, 8).map(r => {
            const label = String(r[dimKey] || r.query || r.page || '');
            return {
                name: label.length > 32 ? label.slice(0, 32) + '…' : label,
                fullName: label,
                Clicks: valueOf(r),
                Impressions: imprOf(r),
            };
        }).filter(d => d.Clicks > 0 || d.Impressions > 0)
          .sort((a, b) => b.Clicks - a.Clicks); // ensure descending; reverse() at render time
    }, [rows, dimKey]);

    if (data.length === 0) return null;

    const total = data.reduce((s, d) => s + d.Clicks, 0);
    const renderData = [...data].reverse(); // top performer at top of chart

    return (
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader
                icon={BarChart3}
                title={title || `Top by ${dimKey}`}
                sub={`${data.length} ${dimKey === 'query' ? 'keywords' : 'pages'} · ${total.toLocaleString()} clicks`}
            />
            <div style={{ height: Math.max(140, renderData.length * 34 + 24) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={renderData} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="barGradPrimary" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.85} />
                                <stop offset="100%" stopColor={PALETTE.primaryDeep} stopOpacity={0.65} />
                            </linearGradient>
                            <linearGradient id="barGradMid" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={PALETTE.warning} stopOpacity={0.85} />
                                <stop offset="100%" stopColor="#b45309" stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="barGradLow" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={PALETTE.neutral} stopOpacity={0.65} />
                                <stop offset="100%" stopColor="#3f3f46" stopOpacity={0.4} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={150} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                        <Bar dataKey="Clicks" radius={[0, 6, 6, 0]} barSize={16}>
                            <LabelList dataKey="Clicks" content={BarValueLabel} />
                            {renderData.map((_, i) => {
                                // renderData is reversed, so visual-top index = renderData.length-1-i in original rank
                                const rank = renderData.length - 1 - i;
                                const fill = rank / Math.max(1, data.length - 1) <= 0.34
                                    ? 'url(#barGradPrimary)'
                                    : rank / Math.max(1, data.length - 1) <= 0.67
                                        ? 'url(#barGradMid)'
                                        : 'url(#barGradLow)';
                                return <Cell key={i} fill={fill} />;
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   3. DEVICE DONUT
   ═══════════════════════════════════════════════════════════════ */

export const DeviceDonutChart = memo(function DeviceDonutChart({ rows }: { rows: any[] }) {
    const data = useMemo(() => {
        if (!rows?.length) return [];
        const valueOf = (r: any): number => {
            const n = Number(r.clicks ?? r.sessions ?? r.users ?? r.value ?? r.count ?? r.pageviews ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const total = rows.reduce((s, r) => s + valueOf(r), 0);
        return rows.map(r => {
            const raw = (r.device || r.name || 'Unknown') as string;
            const name = raw.charAt(0).toUpperCase() + raw.slice(1);
            const value = valueOf(r);
            return { name, value, pct: total > 0 ? ((value / total) * 100).toFixed(1) : (r.percentage || 0) };
        }).filter(d => d.value > 0);
    }, [rows]);

    if (data.length === 0) return null;

    const deviceColors: Record<string, string> = {
        Mobile: PALETTE.deviceMobile,
        Desktop: PALETTE.deviceDesktop,
        Tablet: PALETTE.deviceTablet,
    };

    return (
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader title="Device Split" sub={`${data.length} categories`} />
            <div className="flex items-center gap-5">
                <div className="h-[140px] w-[140px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <defs>
                                {data.map((d, i) => (
                                    <radialGradient key={i} id={`devGrad${i}`} cx="50%" cy="50%" r="50%">
                                        <stop offset="60%" stopColor={deviceColors[d.name] || PALETTE.primary} stopOpacity={0.95} />
                                        <stop offset="100%" stopColor={deviceColors[d.name] || PALETTE.primary} stopOpacity={0.55} />
                                    </radialGradient>
                                ))}
                            </defs>
                            <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={3} dataKey="value" stroke="#050508" strokeWidth={1.5}>
                                {data.map((_, i) => <Cell key={i} fill={`url(#devGrad${i})`} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-2 flex-1">
                    {data.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: deviceColors[d.name] || PALETTE.primary }} />
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
   4. COUNTRY BAR CHART
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

        // Tolerate the wide variety of GA4 / Search Console / OpenPanel / Umami
        // shapes the assistant might pass us: { country, sessions } from GA4,
        // { country, clicks } from GSC, { name, users } from OpenPanel, etc.
        const valueOf = (r: any): number => {
            const n = Number(r.clicks ?? r.sessions ?? r.users ?? r.value ?? r.count ?? r.pageviews ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const labelOf = (r: any): string => r.country || r.name || r.region || 'Unknown';

        // Some upstream sources return city- or region-level rows tagged with
        // the country name, which produces visible duplicates in the chart
        // ("Singapore" twice, "India" three times). Collapse by country and
        // sum the values so the bar chart actually shows top countries.
        const collapsed = new Map<string, number>();
        for (const r of rows) {
            const label = labelOf(r);
            collapsed.set(label, (collapsed.get(label) || 0) + valueOf(r));
        }

        return Array.from(collapsed.entries())
            .map(([label, clicks]) => {
                const code = label.toLowerCase().slice(0, 3);
                return {
                    name: `${COUNTRY_FLAGS[code] || '\u{1F30D}'} ${label}`,
                    Clicks: clicks,
                };
            })
            .filter(d => d.Clicks > 0)
            .sort((a, b) => b.Clicks - a.Clicks)
            .slice(0, 6);
    }, [rows]);

    if (data.length === 0) return null;

    const total = data.reduce((s, d) => s + d.Clicks, 0);
    const renderData = [...data].reverse();

    return (
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader
                icon={MapPin}
                iconColor="text-cyan-400"
                title="Top Countries"
                sub={`${data.length} regions · ${total.toLocaleString()} clicks`}
            />
            <div style={{ height: Math.max(110, renderData.length * 32 + 24) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={renderData} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="countryGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.85} />
                                <stop offset="100%" stopColor={PALETTE.primaryDeep} stopOpacity={0.55} />
                            </linearGradient>
                        </defs>
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={130} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                        <Bar dataKey="Clicks" fill="url(#countryGrad)" radius={[0, 6, 6, 0]} barSize={14}>
                            <LabelList dataKey="Clicks" content={BarValueLabel} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   5. POSITION DISTRIBUTION — show all 4 buckets so the donut
   has visual context even when one bucket dominates.
   ═══════════════════════════════════════════════════════════════ */

export const PositionDistributionChart = memo(function PositionDistributionChart({ rows }: { rows: any[] }) {
    const data = useMemo(() => {
        const buckets = [
            { name: 'Top 3', count: 0 },
            { name: 'Pos 4-10', count: 0 },
            { name: 'Pos 11-20', count: 0 },
            { name: 'Pos 20+', count: 0 },
        ];
        if (!rows?.length) return buckets;
        for (const r of rows) {
            const pos = r.position || 50;
            if (pos <= 3) buckets[0].count++;
            else if (pos <= 10) buckets[1].count++;
            else if (pos <= 20) buckets[2].count++;
            else buckets[3].count++;
        }
        return buckets;
    }, [rows]);

    const total = data.reduce((s, d) => s + d.count, 0);
    if (total === 0) return null;

    // Recharts pie wants non-zero values; substitute a tiny epsilon for empty buckets
    // but keep their displayed value as 0. This makes the donut show all 4 segments
    // proportionally even when one bucket holds 100% of keywords (the big-blob bug).
    const pieData = data.map(d => ({ ...d, value: d.count > 0 ? d.count : 0.0001, displayCount: d.count }));

    return (
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader title="Position Distribution" sub={`${total} keywords`} />
            <div className="flex items-center gap-5">
                <div className="h-[140px] w-[140px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <defs>
                                {data.map((_, i) => (
                                    <radialGradient key={i} id={`posGrad${i}`} cx="50%" cy="50%" r="50%">
                                        <stop offset="60%" stopColor={PALETTE.posBuckets[i]} stopOpacity={0.95} />
                                        <stop offset="100%" stopColor={PALETTE.posBuckets[i]} stopOpacity={0.55} />
                                    </radialGradient>
                                ))}
                            </defs>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2} dataKey="value" stroke="#050508" strokeWidth={1.5}>
                                {data.map((_, i) => <Cell key={i} fill={`url(#posGrad${i})`} opacity={data[i].count > 0 ? 1 : 0.25} />)}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 flex-1">
                    {data.map((d, i) => (
                        <div key={i} className={`flex items-center gap-2 text-[11px] ${d.count === 0 ? 'opacity-40' : ''}`}>
                            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PALETTE.posBuckets[i] }} />
                            <span className="text-zinc-400">{d.name}</span>
                            <span className="text-white font-semibold ml-auto tabular-nums">
                                {d.count} <span className="text-zinc-500">({total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%)</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   6. CTR OPPORTUNITY LIST
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
        <div className={`${CARD} my-3 p-4 pl-5`}>
            <div className={ACCENT_BAR} />
            <ChartHeader
                icon={AlertTriangle}
                iconColor="text-zinc-400"
                title="CTR Opportunities"
                sub={`${opportunities.length} keywords below benchmark`}
            />
            <div className="space-y-0.5">
                {opportunities.map((o, i) => (
                    <div key={i} className="flex items-center gap-3 text-[12px] py-2 px-2.5 rounded-md hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                            <p className="text-zinc-200 truncate font-medium">{o.query}</p>
                            <p className="text-zinc-500 text-[10px]">
                                Pos {o.position?.toFixed(0)} &middot; {o.impressions?.toLocaleString()} impr
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-[11px]">
                            <div className="flex items-center gap-1.5 text-zinc-500">
                                <span className="text-zinc-100 font-semibold tabular-nums">{o.ctr?.toFixed(1)}%</span>
                                <TrendingDown className="w-3 h-3 text-zinc-600" />
                                <span className="text-zinc-400 tabular-nums">{o.expected?.toFixed(1)}%</span>
                            </div>
                            <span className="text-zinc-500 tabular-nums text-[10px]">
                                gap {o.gap.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   7. OVERVIEW METRIC CARDS
   ═══════════════════════════════════════════════════════════════ */

export const OverviewMetricCards = memo(function OverviewMetricCards({ data }: { data: any }) {
    if (!data) return null;

    const metrics = [
        { label: 'Clicks', value: data.totalClicks ?? data.clicks, change: data.changeClicks, icon: MousePointerClick, color: 'text-cyan-400' },
        { label: 'Impressions', value: data.totalImpressions ?? data.impressions, icon: Eye, color: 'text-indigo-400' },
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
                const change: number | undefined = (m as any).change;
                const showChange = typeof change === 'number' && Number.isFinite(change);
                const positive = (change || 0) >= 0;
                return (
                    <div key={i} className={`${CARD} p-3 text-center pl-3.5`}>
                        <div className={ACCENT_BAR} />
                        <Icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} />
                        <p className="text-white font-bold text-sm tabular-nums">{display}</p>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wider">{m.label}</p>
                        {showChange && (
                            <p className={`text-[10px] font-semibold mt-0.5 tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                                {positive ? '▲' : '▼'} {Math.abs(change as number).toFixed(1)}%
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

/* ═══════════════════════════════════════════════════════════════
   SMART CHART PANEL — picks ONE most-informative chart per result.
   Previously rendered up to 5 stacked charts on a single tool result;
   that combined badly with the model's MANDATORY-charts behavior.
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

    // Pick THE single most-informative chart for this dimension shape.
    // Time-series wins over rank breakdown; device/country are dimension-exclusive.
    if (hasDate) return <div className="chat-charts-panel"><TrendLineChart rows={rows} /></div>;
    if (hasDevice) return <div className="chat-charts-panel"><DeviceDonutChart rows={rows} /></div>;
    if (hasCountry) return <div className="chat-charts-panel"><CountryBarChart rows={rows} /></div>;
    if (hasQuery) {
        // For queries, prefer the CTR-opportunity list when there's clear underperformance;
        // otherwise show the rank-colored bar chart. Both is overkill.
        const hasCtrLeak = rows.some((r: any) => (r.impressions || 0) > 100 && (r.ctr || 0) < 3);
        return (
            <div className="chat-charts-panel">
                {hasCtrLeak ? <CtrOpportunityList rows={rows} /> : <HorizontalBarChart rows={rows} dimKey="query" title="Top Keywords by Clicks" />}
            </div>
        );
    }
    if (hasPage) return <div className="chat-charts-panel"><HorizontalBarChart rows={rows} dimKey="page" title="Top Pages by Clicks" /></div>;
    if (hasPositionData(rows)) return <div className="chat-charts-panel"><PositionDistributionChart rows={rows} /></div>;
    // Generic fallback so we never render nothing when rows are present —
    // previously SmartChartPanel returned null for unknown dimension
    // shapes and the user saw the assistant answer with no chart at all.
    return <div className="chat-charts-panel"><GenericRowsTable rows={rows} dimensions={dimensions} /></div>;
});

/* ═══════════════════════════════════════════════════════════════
   GENERIC FALLBACK TABLE — last resort for unknown dimension shapes
   so the user always sees the data, even when no specialised chart
   matches.
   ═══════════════════════════════════════════════════════════════ */

const GenericRowsTable = memo(function GenericRowsTable({ rows, dimensions }: { rows: any[]; dimensions: string[] }) {
    const cols = useMemo(() => {
        if (!rows.length) return [];
        const keys = Object.keys(rows[0]).slice(0, 6);
        // Surface dimension keys first if present, then the rest.
        return [...dimensions.filter(d => keys.includes(d)), ...keys.filter(k => !dimensions.includes(k))].slice(0, 6);
    }, [rows, dimensions]);
    if (!cols.length) return null;
    return (
        <div className={`${CARD} my-3 p-4 pl-5 overflow-x-auto`}>
            <div className={ACCENT_BAR} />
            <ChartHeader title="Result" sub={`${rows.length} rows`} />
            <table className="w-full text-[12px] text-zinc-300">
                <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        {cols.map(c => <th key={c} className="px-2 py-1.5 text-left">{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 12).map((r, i) => (
                        <tr key={i} className="border-b border-white/[0.04] last:border-b-0">
                            {cols.map(c => (
                                <td key={c} className="px-2 py-1.5 truncate max-w-[200px] tabular-nums">
                                    {typeof r[c] === 'number' ? r[c].toLocaleString() : String(r[c] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > 12 && (
                <p className="mt-2 text-[11px] text-zinc-600">+ {rows.length - 12} more rows</p>
            )}
        </div>
    );
});
