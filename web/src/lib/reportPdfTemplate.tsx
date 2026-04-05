/**
 * React-PDF Template — 7-page analytics report with light theme,
 * custom SVG charts, and structured sections.
 */

import React from 'react';
import { Document, Page, View, Text, Svg, Rect, Line, Circle, G, Path, StyleSheet } from '@react-pdf/renderer';
import type { ReportAnalysis } from './reportAnalysis';
import type { GeminiReportOutput } from './reportGeminiSynth';
import type { ReportPeriod } from './reportDataFetcher';

// ─── Colors ───

const C = {
    white: '#FFFFFF',
    bg: '#FAFBFC',
    text: '#1A1A2E',
    textMuted: '#6B7280',
    textLight: '#9CA3AF',
    emerald: '#10B981',
    emeraldLight: '#D1FAE5',
    emeraldDark: '#059669',
    cyan: '#06B6D4',
    cyanLight: '#CFFAFE',
    red: '#EF4444',
    redLight: '#FEE2E2',
    amber: '#F59E0B',
    amberLight: '#FEF3C7',
    border: '#E5E7EB',
    cardBg: '#F9FAFB',
    accentBar: '#10B981',
};

// ─── Styles ───

const s = StyleSheet.create({
    page: { backgroundColor: C.white, padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: C.text },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    headerLogo: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.emerald },
    headerSite: { fontSize: 9, color: C.textMuted },
    footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
    footerText: { fontSize: 7, color: C.textLight },

    sectionTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 4 },
    sectionSubtitle: { fontSize: 9, color: C.textMuted, marginBottom: 16 },

    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    kpiCard: { flex: 1, backgroundColor: C.cardBg, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border },
    kpiValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.text },
    kpiLabel: { fontSize: 8, color: C.textMuted, marginTop: 2 },
    kpiDelta: { fontSize: 8, marginTop: 4 },

    card: { backgroundColor: C.cardBg, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
    cardTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6 },

    table: { width: '100%', marginBottom: 10 },
    tableHeader: { flexDirection: 'row', backgroundColor: C.cardBg, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 6, paddingHorizontal: 8 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 5, paddingHorizontal: 8 },
    tableCell: { fontSize: 8, color: C.text },
    tableCellMuted: { fontSize: 8, color: C.textMuted },
    tableHeaderCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.textMuted, textTransform: 'uppercase' as const },

    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 8, fontFamily: 'Helvetica-Bold' },
    badgeGrowing: { backgroundColor: C.emeraldLight, color: C.emeraldDark },
    badgeStable: { backgroundColor: C.cyanLight, color: C.cyan },
    badgeAtRisk: { backgroundColor: C.amberLight, color: C.amber },
    badgeDeclining: { backgroundColor: C.redLight, color: C.red },

    narrative: { fontSize: 10, lineHeight: 1.6, color: C.text, marginBottom: 12 },
    highlight: { fontSize: 9, color: C.text, marginBottom: 4, paddingLeft: 12 },

    actionBox: { backgroundColor: C.emeraldLight, borderRadius: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: C.emerald, marginTop: 12 },
    actionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 4 },
    actionText: { fontSize: 9, color: C.text, lineHeight: 1.5 },

    warningBox: { backgroundColor: C.amberLight, borderRadius: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: C.amber, marginBottom: 10 },
    warningTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.amber, marginBottom: 4 },

    lockedCard: { backgroundColor: C.cardBg, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
    lockedIcon: { width: 32, height: 32, backgroundColor: C.emeraldLight, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    lockedContent: { flex: 1 },
    lockedTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text },
    lockedDesc: { fontSize: 8, color: C.textMuted, marginTop: 2 },
    lockedCta: { fontSize: 7, color: C.emerald, fontFamily: 'Helvetica-Bold', marginTop: 4 },

    ctaCenter: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    ctaTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 8, textAlign: 'center' as const },
    ctaSubtitle: { fontSize: 12, color: C.textMuted, textAlign: 'center' as const, marginBottom: 24 },
    ctaUrl: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.emerald, textAlign: 'center' as const, marginBottom: 8 },
    ctaSmall: { fontSize: 9, color: C.textLight, textAlign: 'center' as const },
});

// ─── SVG Chart Components ───

function Sparkline({ data, width = 100, height = 24, color = C.emerald }: { data: number[]; width?: number; height?: number; color?: string }) {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = width / (data.length - 1);

    const points = data.map((v, i) => ({
        x: Math.round(i * step),
        y: Math.round(height - ((v - min) / range) * (height - 4) - 2),
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
        <Svg width={width} height={height}>
            <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" />
            <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2} fill={color} />
        </Svg>
    );
}

function DailyBarChart({ data, anomalyDates, width = 460, height = 80 }: { data: Array<{ date: string; sessions: number }>; anomalyDates: string[]; width?: number; height?: number }) {
    if (data.length === 0) return null;
    const max = Math.max(...data.map(d => d.sessions), 1);
    const barWidth = Math.min(40, (width - 20) / data.length - 4);
    const anomalySet = new Set(anomalyDates);

    return (
        <Svg width={width} height={height + 16}>
            <Line x1={0} y1={height} x2={width} y2={height} stroke={C.border} strokeWidth={1} />
            {data.map((d, i) => {
                const barH = (d.sessions / max) * (height - 8);
                const x = i * ((width - 10) / data.length) + 8;
                const y = height - barH;
                const isAnomaly = anomalySet.has(d.date);
                const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                return (
                    <G key={d.date}>
                        <Rect x={x} y={y} width={barWidth} height={barH} fill={isAnomaly ? C.red : C.emerald} rx={3} />
                        <Text x={x + barWidth / 2} y={height + 10} style={{ fontSize: 6, fill: C.textMuted, textAnchor: 'middle' as const }}>{dayLabel}</Text>
                    </G>
                );
            })}
        </Svg>
    );
}

function HorizontalBar({ label, current, prev, maxVal, width = 300 }: { label: string; current: number; prev: number; maxVal: number; width?: number }) {
    const currentW = maxVal > 0 ? (current / maxVal) * width : 0;
    const prevW = maxVal > 0 ? (prev / maxVal) * width : 0;

    return (
        <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 8, color: C.text }}>{label}</Text>
                <Text style={{ fontSize: 8, color: C.textMuted }}>{current.toFixed(1)}%</Text>
            </View>
            <Svg width={width} height={14}>
                <Rect x={0} y={0} width={prevW} height={6} fill={C.border} rx={3} />
                <Rect x={0} y={7} width={currentW} height={6} fill={C.emerald} rx={3} />
            </Svg>
        </View>
    );
}

function DonutChart({ segments, size = 80 }: { segments: Array<{ label: string; value: number; color: string }>; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
    const r = size / 2 - 4;
    const cx = size / 2;
    const cy = size / 2;
    const rad = (a: number) => (a * Math.PI) / 180;

    // Pre-compute all arcs before render to avoid variable reassignment in JSX
    const arcs = segments.map((seg, i) => {
        const precedingAngle = segments.slice(0, i).reduce((sum, s) => sum + (s.value / total) * 360, 0);
        const startAngle = -90 + precedingAngle;
        const angle = (seg.value / total) * 360;
        const endAngle = startAngle + angle;
        const largeArc = angle > 180 ? 1 : 0;
        const x1 = cx + r * Math.cos(rad(startAngle));
        const y1 = cy + r * Math.sin(rad(startAngle));
        const x2 = cx + r * Math.cos(rad(endAngle));
        const y2 = cy + r * Math.sin(rad(endAngle));
        return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: seg.color };
    });

    return (
        <Svg width={size} height={size}>
            {arcs.map((arc, i) => (
                <Path key={i} d={arc.d} fill={arc.color} />
            ))}
            <Circle cx={cx} cy={cy} r={r * 0.55} fill={C.white} />
        </Svg>
    );
}

// ─── Helper Components ───

function PageHeader({ siteUrl }: { siteUrl: string }) {
    return (
        <View style={s.header}>
            <Text style={s.headerLogo}>TrafficClaw</Text>
            <Text style={s.headerSite}>{siteUrl}</Text>
        </View>
    );
}

function PageFooter({ pageNum }: { pageNum: number }) {
    return (
        <View style={s.footer} fixed>
            <Text style={s.footerText}>Page {pageNum}</Text>
            <Text style={s.footerText}>trafficclaw.com</Text>
        </View>
    );
}

function KPICard({ value, label, delta, sparkData }: { value: string; label: string; delta: number; sparkData?: number[] }) {
    const deltaColor = delta > 0 ? C.emerald : delta < 0 ? C.red : C.textMuted;
    const deltaPrefix = delta > 0 ? '+' : '';

    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{value}</Text>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiDelta, { color: deltaColor }]}>{deltaPrefix}{delta}%</Text>
            {sparkData && sparkData.length > 1 && (
                <View style={{ marginTop: 6 }}>
                    <Sparkline data={sparkData} width={90} height={20} color={delta >= 0 ? C.emerald : C.red} />
                </View>
            )}
        </View>
    );
}

function HealthBadge({ status }: { status: string }) {
    const labels: Record<string, string> = { growing: 'GROWING', stable: 'STABLE', at_risk: 'AT RISK', declining: 'DECLINING' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badgeStyles: Record<string, any> = { growing: s.badgeGrowing, stable: s.badgeStable, at_risk: s.badgeAtRisk, declining: s.badgeDeclining };
    return <Text style={[s.badge, badgeStyles[status] || s.badgeStable]}>{labels[status] || 'STABLE'}</Text>;
}

// ─── Page Components ───

interface ReportProps {
    analysis: ReportAnalysis;
    gemini: GeminiReportOutput;
    period: ReportPeriod;
    siteUrl: string;
}

function CoverPage({ siteUrl, period }: { siteUrl: string; period: ReportPeriod }) {
    const periodLabel = period.type === 'weekly' ? 'Weekly Report' : 'Monthly Report';
    return (
        <Page size="A4" style={[s.page, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ width: '100%', height: 6, backgroundColor: C.accentBar, position: 'absolute', top: 0, left: 0 }} />
            <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.emerald, marginBottom: 4 }}>TrafficClaw</Text>
            <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 40 }}>AI-Powered Analytics Report</Text>
            <View style={{ width: 200, height: 1, backgroundColor: C.border, marginBottom: 40 }} />
            <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 8 }}>{siteUrl}</Text>
            <View style={[s.badge, s.badgeGrowing, { marginBottom: 16 }]}>
                <Text>{periodLabel}</Text>
            </View>
            <Text style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{period.startDate} — {period.endDate}</Text>
            <Text style={{ fontSize: 8, color: C.textLight }}>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            <View style={{ position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 7, color: C.textLight }}>trafficclaw.com</Text>
                <Text style={{ fontSize: 7, color: C.textLight }}>Confidential Report</Text>
            </View>
        </Page>
    );
}

function ExecutiveSummaryPage({ analysis, gemini, period, siteUrl }: ReportProps) {
    const kpi = analysis.kpis;
    const es = gemini.executiveSummary;
    const sessionData = analysis.dailySessions.map(d => d.sessions);
    const clickData = analysis.dailyClicks.map(d => d.clicks);

    return (
        <Page size="A4" style={s.page}>
            <PageHeader siteUrl={siteUrl} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <Text style={s.sectionTitle}>1. Executive Summary</Text>
                <HealthBadge status={es.healthStatus} />
            </View>
            <Text style={s.sectionSubtitle}>AI-generated overview of your site&apos;s performance</Text>

            <Text style={s.narrative}>{es.narrative}</Text>

            <View style={s.kpiRow}>
                <KPICard value={kpi.users.toLocaleString()} label="Users" delta={kpi.usersDelta} sparkData={sessionData} />
                <KPICard value={kpi.clicks.toLocaleString()} label="Organic Clicks" delta={kpi.clicksDelta} sparkData={clickData} />
                <KPICard value={kpi.avgPosition.toString()} label="Avg Position" delta={-kpi.avgPositionDelta} />
                <KPICard value={`${(kpi.bounceRate * 100).toFixed(0)}%`} label="Bounce Rate" delta={-Math.round(kpi.bounceRateDelta * 100)} />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Key Highlights</Text>
                {es.highlights.map((h, i) => (
                    <Text key={i} style={s.highlight}>• {h}</Text>
                ))}
            </View>

            <View style={s.actionBox}>
                <Text style={s.actionTitle}>#1 Action This {period.type === 'weekly' ? 'Week' : 'Month'}</Text>
                <Text style={s.actionText}>{es.oneAction}</Text>
                <Text style={[s.actionText, { color: C.textMuted, marginTop: 4 }]}>Why: {es.oneActionWhy}</Text>
                <Text style={[s.actionText, { color: C.emeraldDark, marginTop: 2 }]}>Expected impact: {es.oneActionImpact}</Text>
            </View>
            <PageFooter pageNum={2} />
        </Page>
    );
}

function AnomalySpotlightPage({ analysis, gemini, siteUrl }: ReportProps) {
    const anomalyDates = analysis.anomalies.map(a => a.date);

    return (
        <Page size="A4" style={s.page}>
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>2. Anomaly Spotlight</Text>
            <Text style={s.sectionSubtitle}>What happened — and why — during unusual days this period</Text>

            {analysis.dailySessions.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                    <DailyBarChart data={analysis.dailySessions} anomalyDates={anomalyDates} />
                </View>
            )}

            {analysis.anomalies.length === 0 ? (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Clean Period</Text>
                    <Text style={{ fontSize: 9, color: C.textMuted }}>No significant anomalies detected. Traffic patterns were within normal ranges throughout the period.</Text>
                </View>
            ) : (
                gemini.anomalyExplanations.map((ae, i) => {
                    const anomaly = analysis.anomalies[i];
                    if (!anomaly) return null;
                    return (
                        <View key={ae.date} style={s.card}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Text style={s.cardTitle}>{anomaly.dayName}, {anomaly.date}</Text>
                                <Text style={[s.badge, anomaly.severity === 'critical' ? s.badgeDeclining : s.badgeAtRisk]}>
                                    {anomaly.deviationPercent > 0 ? '+' : ''}{anomaly.deviationPercent}%
                                </Text>
                            </View>
                            <Text style={{ fontSize: 9, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{ae.rootCause}</Text>
                            <View style={{ backgroundColor: C.redLight, borderRadius: 6, padding: 8, marginBottom: 6 }}>
                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.red }}>Impact: {ae.impact}</Text>
                            </View>
                            <View style={{ backgroundColor: C.emeraldLight, borderRadius: 6, padding: 8 }}>
                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 2 }}>How to Fix</Text>
                                <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.4 }}>{ae.howToFix}</Text>
                            </View>
                        </View>
                    );
                })
            )}
            <PageFooter pageNum={3} />
        </Page>
    );
}

function KeywordIntelligencePage({ analysis, gemini, siteUrl }: ReportProps) {
    const { accelerating, decelerating } = analysis.keywordVelocity;

    return (
        <Page size="A4" style={s.page}>
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>3. Keyword Intelligence</Text>
            <Text style={s.sectionSubtitle}>Which keywords are gaining or losing momentum</Text>

            {/* Accelerating */}
            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.emeraldDark }]}>Accelerating Keywords</Text>
                {accelerating.length === 0 ? (
                    <Text style={{ fontSize: 8, color: C.textMuted }}>No keywords showed significant acceleration this period.</Text>
                ) : (
                    <>
                        <View style={s.tableHeader}>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Keyword</Text>
                            <Text style={[s.tableHeaderCell, { width: '18%' }]}>Position</Text>
                            <Text style={[s.tableHeaderCell, { width: '17%' }]}>Clicks</Text>
                            <Text style={[s.tableHeaderCell, { width: '17%' }]}>Impressions</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Momentum</Text>
                        </View>
                        {accelerating.map(k => (
                            <View key={k.query} style={s.tableRow}>
                                <Text style={[s.tableCell, { width: '35%' }]}>{k.query}</Text>
                                <Text style={[s.tableCell, { width: '18%', color: C.emerald }]}>{k.prevPosition} → {k.currentPosition}</Text>
                                <Text style={[s.tableCell, { width: '17%' }]}>{k.prevClicks} → {k.currentClicks}</Text>
                                <Text style={[s.tableCell, { width: '17%' }]}>{k.impressionDelta > 0 ? '+' : ''}{k.impressionDelta}%</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{'★'.repeat(Math.min(5, Math.ceil(k.momentumScore / 20)))}</Text>
                            </View>
                        ))}
                    </>
                )}
                <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 8, lineHeight: 1.4 }}>{gemini.keywordInsights.acceleratingCommentary}</Text>
            </View>

            {/* Decelerating */}
            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.red }]}>Decelerating Keywords</Text>
                {decelerating.length === 0 ? (
                    <Text style={{ fontSize: 8, color: C.textMuted }}>No keywords showed significant deceleration this period.</Text>
                ) : (
                    <>
                        <View style={s.tableHeader}>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Keyword</Text>
                            <Text style={[s.tableHeaderCell, { width: '18%' }]}>Position</Text>
                            <Text style={[s.tableHeaderCell, { width: '17%' }]}>Clicks</Text>
                            <Text style={[s.tableHeaderCell, { width: '17%' }]}>Impressions</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Momentum</Text>
                        </View>
                        {decelerating.map(k => (
                            <View key={k.query} style={s.tableRow}>
                                <Text style={[s.tableCell, { width: '35%' }]}>{k.query}</Text>
                                <Text style={[s.tableCell, { width: '18%', color: C.red }]}>{k.prevPosition} → {k.currentPosition}</Text>
                                <Text style={[s.tableCell, { width: '17%' }]}>{k.prevClicks} → {k.currentClicks}</Text>
                                <Text style={[s.tableCell, { width: '17%' }]}>{k.impressionDelta > 0 ? '+' : ''}{k.impressionDelta}%</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{'▼'.repeat(Math.min(5, Math.ceil(Math.abs(k.momentumScore) / 20)))}</Text>
                            </View>
                        ))}
                    </>
                )}
                <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 8, lineHeight: 1.4 }}>{gemini.keywordInsights.deceleratingCommentary}</Text>

                {decelerating.length > 0 && (
                    <View style={[s.actionBox, { marginTop: 8 }]}>
                        <Text style={s.actionTitle}>How to Fix: &quot;{decelerating[0].query}&quot;</Text>
                        <Text style={s.actionText}>{gemini.keywordInsights.topDeceleratingFix}</Text>
                    </View>
                )}
            </View>
            <PageFooter pageNum={4} />
        </Page>
    );
}

function TrafficDNAPage({ analysis, gemini, siteUrl }: ReportProps) {
    const dna = analysis.trafficDNA;
    const maxChannelShare = Math.max(...dna.channels.map(c => Math.max(c.currentShare, c.prevShare)), 1);

    const deviceColors = [C.emerald, C.cyan, C.amber, C.textLight];
    const donutSegments = dna.devices.map((d, i) => ({
        label: d.device,
        value: d.currentShare,
        color: deviceColors[i % deviceColors.length],
    }));

    return (
        <Page size="A4" style={s.page}>
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>4. Traffic Composition</Text>
            <Text style={s.sectionSubtitle}>How the mix of your traffic is shifting</Text>

            {/* Channels */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Channel Mix (this period vs previous)</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 10, height: 6, backgroundColor: C.border, borderRadius: 3 }} />
                        <Text style={{ fontSize: 7, color: C.textMuted }}>Previous</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 10, height: 6, backgroundColor: C.emerald, borderRadius: 3 }} />
                        <Text style={{ fontSize: 7, color: C.textMuted }}>Current</Text>
                    </View>
                </View>
                {dna.channels.slice(0, 5).map(ch => (
                    <HorizontalBar key={ch.channel} label={ch.channel} current={ch.currentShare} prev={ch.prevShare} maxVal={maxChannelShare} width={380} />
                ))}
            </View>

            {/* Devices + Countries side by side */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[s.card, { flex: 1 }]}>
                    <Text style={s.cardTitle}>Device Split</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                        <DonutChart segments={donutSegments} size={70} />
                        <View>
                            {dna.devices.map((d, i) => (
                                <View key={d.device} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: deviceColors[i % deviceColors.length] }} />
                                    <Text style={{ fontSize: 8, color: C.text }}>{d.device} {d.currentShare}%</Text>
                                    <Text style={{ fontSize: 7, color: d.shareDelta > 0 ? C.emerald : d.shareDelta < 0 ? C.red : C.textMuted }}>
                                        ({d.shareDelta > 0 ? '+' : ''}{d.shareDelta}pp)
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={[s.card, { flex: 1 }]}>
                    <Text style={s.cardTitle}>Top Countries</Text>
                    {dna.countries.map(c => (
                        <View key={c.country} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={{ fontSize: 8, color: C.text, width: '40%' }}>{c.country}</Text>
                            <Text style={{ fontSize: 8, color: C.textMuted }}>{c.currentShare}%</Text>
                            <Text style={{ fontSize: 7, color: c.shareDelta > 0 ? C.emerald : c.shareDelta < 0 ? C.red : C.textMuted }}>
                                {c.shareDelta > 0 ? '▲' : c.shareDelta < 0 ? '▼' : '─'} {Math.abs(c.shareDelta)}pp
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Concentration risk */}
            {dna.topPageShare > 25 && (
                <View style={s.warningBox}>
                    <Text style={s.warningTitle}>Concentration Risk</Text>
                    <Text style={{ fontSize: 8, color: C.text }}>
                        Your top page ({dna.topPage}) drives {dna.topPageShare}% of all sessions. If this page loses rankings, you could lose ~1/{Math.round(100 / dna.topPageShare)} of your traffic.
                    </Text>
                </View>
            )}

            <View style={[s.card, { marginTop: 6 }]}>
                <Text style={s.cardTitle}>What This Means</Text>
                <Text style={{ fontSize: 9, color: C.text, lineHeight: 1.5 }}>{gemini.trafficDNAInterpretation}</Text>
            </View>
            <PageFooter pageNum={5} />
        </Page>
    );
}

function LockedPreviewsPage({ analysis, gemini, siteUrl }: ReportProps) {
    const teasers = gemini.lockedTeasers;

    const items = [
        { title: 'Keyword Cannibalization', desc: teasers.cannibalizationSummary, metric: `${analysis.cannibalization.length} keywords affected` },
        { title: 'Content Decay Alerts', desc: teasers.decaySummary, metric: `${analysis.decayPages.length} pages at risk` },
        { title: 'Revenue Impact Calculator', desc: teasers.revenueEstimate, metric: 'Organic value estimate' },
        { title: 'AI Content Strategy', desc: teasers.strategySummary, metric: `${analysis.opportunities.length} opportunities` },
        { title: 'Core Web Vitals', desc: teasers.cwvSummary, metric: 'Performance audit' },
    ];

    return (
        <Page size="A4" style={s.page}>
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>5. More Insights Available</Text>
            <Text style={s.sectionSubtitle}>These deep-dive analyses are waiting on your TrafficClaw dashboard</Text>

            {items.map((item, i) => (
                <View key={i} style={s.lockedCard}>
                    <View style={s.lockedIcon}>
                        <Text style={{ fontSize: 14 }}>🔒</Text>
                    </View>
                    <View style={s.lockedContent}>
                        <Text style={s.lockedTitle}>{item.title}</Text>
                        <Text style={s.lockedDesc}>{item.desc}</Text>
                        <Text style={[s.lockedDesc, { color: C.text, fontFamily: 'Helvetica-Bold' }]}>{item.metric}</Text>
                        <Text style={s.lockedCta}>View on TrafficClaw →</Text>
                    </View>
                </View>
            ))}

            <View style={[s.card, { marginTop: 12, alignItems: 'center' }]}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 4 }}>
                    {analysis.opportunities.length} total opportunities worth an estimated +{analysis.opportunities.reduce((s, o) => s + o.potentialClicks, 0).toLocaleString()} clicks/month
                </Text>
                <Text style={{ fontSize: 8, color: C.emerald }}>Explore your full report at trafficclaw.com/dashboard</Text>
            </View>
            <PageFooter pageNum={6} />
        </Page>
    );
}

function CTAPage(_props: { siteUrl: string }) {
    return (
        <Page size="A4" style={[s.page, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ width: '100%', height: 6, backgroundColor: C.accentBar, position: 'absolute', top: 0, left: 0 }} />
            <View style={s.ctaCenter}>
                <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.emerald, marginBottom: 16 }}>TrafficClaw</Text>
                <Text style={s.ctaTitle}>Want the full picture?</Text>
                <Text style={s.ctaSubtitle}>
                    Your complete report is waiting on your dashboard — including{'\n'}
                    cannibalization fixes, content strategy, and revenue projections.
                </Text>
                <View style={{ backgroundColor: C.emeraldLight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginBottom: 16 }}>
                    <Text style={s.ctaUrl}>trafficclaw.com/dashboard</Text>
                </View>
                <Text style={s.ctaSmall}>Free to explore · No credit card required · 10 AI messages included</Text>
            </View>
            <View style={{ position: 'absolute', bottom: 24, left: 40, right: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, color: C.textLight }}>Generated by TrafficClaw · trafficclaw.com · © 2026 TrafficClaw. All rights reserved.</Text>
            </View>
        </Page>
    );
}

// ─── Main Document ───

export interface ReportDocumentProps {
    analysis: ReportAnalysis;
    gemini: GeminiReportOutput;
    period: ReportPeriod;
    siteUrl: string;
}

export function ReportDocument({ analysis, gemini, period, siteUrl }: ReportDocumentProps) {
    const reportProps: ReportProps = { analysis, gemini, period, siteUrl };

    return (
        <Document
            title={`TrafficClaw ${period.type === 'weekly' ? 'Weekly' : 'Monthly'} Report — ${siteUrl}`}
            author="TrafficClaw"
            subject={`Analytics Report for ${period.startDate} to ${period.endDate}`}
        >
            <CoverPage siteUrl={siteUrl} period={period} />
            <ExecutiveSummaryPage {...reportProps} />
            <AnomalySpotlightPage {...reportProps} />
            <KeywordIntelligencePage {...reportProps} />
            <TrafficDNAPage {...reportProps} />
            <LockedPreviewsPage {...reportProps} />
            <CTAPage siteUrl={siteUrl} />
        </Document>
    );
}
