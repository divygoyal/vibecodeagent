/**
 * React-PDF Template — 14-page ultra-detailed analytics report
 * with light theme, custom SVG charts, prompt boxes, and deep analysis.
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
    promptBg: '#F3F4F6',
    promptBorder: '#D1D5DB',
    gradeA: '#10B981',
    gradeB: '#06B6D4',
    gradeC: '#F59E0B',
    gradeD: '#EF4444',
    gradeF: '#991B1B',
};

// ─── Styles ───

const s = StyleSheet.create({
    page: { backgroundColor: C.white, padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: C.text },
    accentSidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.accentBar },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    headerLogo: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.emerald },
    headerSite: { fontSize: 9, color: C.textMuted },
    footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
    footerText: { fontSize: 7, color: C.textLight },

    sectionTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 4 },
    sectionSubtitle: { fontSize: 9, color: C.textMuted, marginBottom: 14 },

    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    kpiCard: { flex: 1, backgroundColor: C.cardBg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.border },
    kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.text },
    kpiLabel: { fontSize: 7, color: C.textMuted, marginTop: 2 },
    kpiDelta: { fontSize: 7, marginTop: 3 },

    card: { backgroundColor: C.cardBg, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
    cardTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6 },

    tableHeader: { flexDirection: 'row', backgroundColor: C.cardBg, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5, paddingHorizontal: 6 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 4, paddingHorizontal: 6 },
    tableCell: { fontSize: 7, color: C.text },
    tableHeaderCell: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.textMuted, textTransform: 'uppercase' as const },

    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 8, fontFamily: 'Helvetica-Bold' },
    badgeGrowing: { backgroundColor: C.emeraldLight, color: C.emeraldDark },
    badgeStable: { backgroundColor: C.cyanLight, color: C.cyan },
    badgeAtRisk: { backgroundColor: C.amberLight, color: C.amber },
    badgeDeclining: { backgroundColor: C.redLight, color: C.red },

    narrative: { fontSize: 9, lineHeight: 1.6, color: C.text, marginBottom: 10 },

    actionBox: { backgroundColor: C.emeraldLight, borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: C.emerald, marginTop: 8 },
    actionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 3 },
    actionText: { fontSize: 8, color: C.text, lineHeight: 1.5 },

    warningBox: { backgroundColor: C.amberLight, borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: C.amber, marginBottom: 8 },
    warningTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.amber, marginBottom: 3 },

    promptBox: { backgroundColor: C.promptBg, borderRadius: 6, padding: 10, borderWidth: 1, borderColor: C.promptBorder, borderStyle: 'dashed' as const, marginTop: 6, marginBottom: 6 },
    promptLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 4 },
    promptText: { fontSize: 7, fontFamily: 'Courier', color: C.text, lineHeight: 1.4 },
});

// ─── SVG Charts ───

function Sparkline({ data, width = 90, height = 20, color = C.emerald }: { data: number[]; width?: number; height?: number; color?: string }) {
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

function DailyBarChart({ data, valueKey, anomalyDates, color = C.emerald, width = 460, height = 90 }: {
    data: Array<Record<string, unknown>>;
    valueKey: string;
    anomalyDates?: string[];
    color?: string;
    width?: number;
    height?: number;
}) {
    if (data.length === 0) return null;
    const vals = data.map(d => Number(d[valueKey]) || 0);
    const max = Math.max(...vals, 1);
    const yAxisW = 32;
    const xAxisH = 14;
    const chartW = width - yAxisW;
    const chartH = height - xAxisH;
    const barWidth = Math.min(28, (chartW - 10) / data.length - 3);
    const anomalySet = new Set(anomalyDates ?? []);

    const yTicks = [0, Math.round(max / 2), max];
    const labelInterval = Math.max(1, Math.ceil(data.length / 7));

    return (
        <Svg width={width} height={height}>
            {/* Y-axis labels */}
            {yTicks.map(tick => {
                const y = chartH - (tick / max) * (chartH - 8);
                return (
                    <G key={`y-${tick}`}>
                        <Text x={yAxisW - 4} y={y + 3} textAnchor="end" fill={C.textMuted} style={{ fontSize: 6 }}>{tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : String(tick)}</Text>
                        <Line x1={yAxisW} y1={y} x2={width} y2={y} stroke={C.border} strokeWidth={0.5} strokeDasharray="2,2" />
                    </G>
                );
            })}
            {/* Baseline */}
            <Line x1={yAxisW} y1={chartH} x2={width} y2={chartH} stroke={C.border} strokeWidth={1} />
            {/* Bars + X-axis labels */}
            {data.map((d, i) => {
                const v = vals[i];
                const barH = (v / max) * (chartH - 8);
                const x = yAxisW + i * (chartW / data.length) + 4;
                const y = chartH - barH;
                const isAnomaly = anomalySet.has(String(d.date));
                const dateStr = String(d.date ?? '');
                const shortDate = dateStr.length >= 10 ? `${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)}` : dateStr;
                return (
                    <G key={`bar-${i}`}>
                        <Rect x={x} y={y} width={barWidth} height={barH} fill={isAnomaly ? C.red : color} rx={2} />
                        {i % labelInterval === 0 && (
                            <Text x={x + barWidth / 2} y={chartH + 10} textAnchor="middle" fill={C.textMuted} style={{ fontSize: 5 }}>{shortDate}</Text>
                        )}
                    </G>
                );
            })}
        </Svg>
    );
}

function HorizontalBar({ label, current, prev, maxVal, width = 300 }: { label: string; current: number; prev: number; maxVal: number; width?: number }) {
    const currentW = maxVal > 0 ? (current / maxVal) * width : 0;
    const prevW = maxVal > 0 ? (prev / maxVal) * width : 0;
    const showPrev = prev > 0;
    return (
        <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 7, color: C.text }}>{label}</Text>
                <Text style={{ fontSize: 7, color: C.textMuted }}>{current.toFixed(1)}%</Text>
            </View>
            <Svg width={width} height={showPrev ? 12 : 6}>
                {showPrev && <Rect x={0} y={0} width={prevW} height={5} fill={C.border} rx={2} />}
                <Rect x={0} y={showPrev ? 6 : 0} width={currentW} height={5} fill={C.emerald} rx={2} />
            </Svg>
        </View>
    );
}

function DonutChart({ segments, size = 70 }: { segments: Array<{ label: string; value: number; color: string }>; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
    const r = size / 2 - 4;
    const cx = size / 2;
    const cy = size / 2;
    const rad = (a: number) => (a * Math.PI) / 180;
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
            {arcs.map((arc, i) => (<Path key={i} d={arc.d} fill={arc.color} />))}
            <Circle cx={cx} cy={cy} r={r * 0.55} fill={C.white} />
        </Svg>
    );
}

// ─── Helpers ───

function PageHeader({ siteUrl }: { siteUrl: string }) {
    return (
        <View style={s.header}>
            <Text style={s.headerLogo}>TrafficClaw</Text>
            <Text style={s.headerSite}>{siteUrl}</Text>
        </View>
    );
}

function PageFooter() {
    return (
        <View style={s.footer} fixed>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            <Text style={s.footerText}>trafficclaw.com</Text>
        </View>
    );
}

function AvailabilityNotice({ title, message }: { title: string; message: string }) {
    return (
        <View style={[s.card, { backgroundColor: C.amberLight, borderLeftWidth: 3, borderLeftColor: C.amber, marginBottom: 8 }]}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.amber, marginBottom: 3 }}>{title}</Text>
            <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>{message}</Text>
        </View>
    );
}

function KPICard({ value, label, delta, sparkData, invertDelta, unavailable, unavailableNote }: { value: string; label: string; delta: number; sparkData?: number[]; invertDelta?: boolean; unavailable?: boolean; unavailableNote?: string }) {
    if (unavailable) {
        return (
            <View style={s.kpiCard}>
                <Text style={[s.kpiValue, { color: C.textMuted }]}>N/A</Text>
                <Text style={s.kpiLabel}>{label}</Text>
                <Text style={[s.kpiDelta, { color: C.textLight }]}>{unavailableNote || 'Unavailable'}</Text>
            </View>
        );
    }

    const displayDelta = invertDelta ? -delta : delta;
    const deltaColor = displayDelta > 0 ? C.emerald : displayDelta < 0 ? C.red : C.textMuted;
    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{value}</Text>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiDelta, { color: deltaColor }]}>{displayDelta > 0 ? '+' : ''}{displayDelta}%</Text>
            {sparkData && sparkData.length > 1 && (
                <View style={{ marginTop: 4 }}>
                    <Sparkline data={sparkData} width={80} height={18} color={displayDelta >= 0 ? C.emerald : C.red} />
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

function GradeBadge({ grade }: { grade: string }) {
    const colors: Record<string, string> = { A: C.gradeA, B: C.gradeB, C: C.gradeC, D: C.gradeD, F: C.gradeF };
    return (
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors[grade] || C.textMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{grade}</Text>
        </View>
    );
}

function EffortImpactBadge({ effort, impact }: { effort: string; impact: string }) {
    const impactColor = impact === 'high' ? C.emerald : impact === 'medium' ? C.amber : C.textMuted;
    const effortLabel = effort === 'low' ? 'Easy' : effort === 'medium' ? 'Moderate' : 'Hard';
    return (
        <View style={{ flexDirection: 'row', gap: 4 }}>
            <Text style={{ fontSize: 6, color: impactColor, fontFamily: 'Helvetica-Bold' }}>{impact.toUpperCase()} IMPACT</Text>
            <Text style={{ fontSize: 6, color: C.textMuted }}>{effortLabel}</Text>
        </View>
    );
}

function PromptBox({ label, text }: { label: string; text: string }) {
    const truncated = text.length > 250 ? text.slice(0, 247) + '...' : text;
    return (
        <View style={s.promptBox}>
            <Text style={s.promptLabel}>[COPY THIS PROMPT] {label}</Text>
            <Text style={s.promptText}>{truncated}</Text>
        </View>
    );
}

// ─── Page Components ───

interface ReportProps {
    analysis: ReportAnalysis;
    gemini: GeminiReportOutput;
    period: ReportPeriod;
    siteUrl: string;
}

// Page 1: Cover
function CoverPage({ siteUrl, period, hasGa4 }: { siteUrl: string; period: ReportPeriod; hasGa4: boolean }) {
    const periodLabel = period.type === 'weekly' ? 'Weekly Report' : 'Monthly Report';
    return (
        <Page size="A4" style={[s.page, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ width: '100%', height: 6, backgroundColor: C.accentBar, position: 'absolute', top: 0, left: 0 }} />
            <View style={{ width: 3, height: 120, backgroundColor: C.emerald, position: 'absolute', left: 50, top: '35%', borderRadius: 2, opacity: 0.4 }} />
            <View style={{ width: 3, height: 80, backgroundColor: C.cyan, position: 'absolute', right: 50, top: '45%', borderRadius: 2, opacity: 0.3 }} />
            <Text style={{ fontSize: 32, fontFamily: 'Helvetica-Bold', color: C.emerald, marginBottom: 4 }}>TrafficClaw</Text>
            <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 40 }}>AI-Powered Deep Analytics Report</Text>
            <View style={{ width: 200, height: 1, backgroundColor: C.border, marginBottom: 40 }} />
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 8 }}>{siteUrl}</Text>
            <View style={[s.badge, s.badgeGrowing, { marginBottom: 16 }]}><Text>{periodLabel}</Text></View>
            {!hasGa4 && (
                <View style={{ backgroundColor: C.amberLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 }}>
                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.amber, textAlign: 'center' as const }}>Search Console-only report</Text>
                    <Text style={{ fontSize: 7, color: C.text, textAlign: 'center' as const, marginTop: 2 }}>GA4 was not connected, so this PDF focuses on SEO visibility and page performance.</Text>
                </View>
            )}
            <Text style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{period.startDate} - {period.endDate}</Text>
            <Text style={{ fontSize: 8, color: C.textLight }}>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            <Text style={{ fontSize: 7, color: C.textLight, marginTop: 30 }}>Comprehensive analysis with actionable fix prompts</Text>
            <View style={{ position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 7, color: C.textLight }}>trafficclaw.com</Text>
                <Text style={{ fontSize: 7, color: C.textLight }}>Confidential</Text>
            </View>
        </Page>
    );
}

// Page 2: Executive Summary
function ExecutiveSummaryPage({ analysis, gemini, period, siteUrl }: ReportProps) {
    const kpi = analysis.kpis;
    const es = gemini.executiveSummary;
    const sessionData = analysis.dailySessions.map(d => d.sessions);
    const clickData = analysis.dailyClicks.map(d => d.clicks);

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <Text style={s.sectionTitle}>1. Executive Summary</Text>
                <HealthBadge status={es.healthStatus} />
            </View>
            <Text style={s.sectionSubtitle}>{analysis.hasGa4 ? 'AI-generated deep analysis of your site performance' : 'AI-generated SEO analysis based on Search Console data only'}</Text>

            {!analysis.hasGa4 && (
                <AvailabilityNotice
                    title="GA4 not connected"
                    message="This report uses Search Console data only. Traffic, engagement, bounce rate, device mix, and other GA4 behavior metrics are intentionally marked unavailable."
                />
            )}

            {analysis.criticalAlerts.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                    {analysis.criticalAlerts.slice(0, 2).map((alert, i) => {
                        const alertStyle = alert.severity === 'critical' ? { bg: C.redLight, border: C.red, text: C.red }
                            : alert.severity === 'danger' ? { bg: C.amberLight, border: C.amber, text: C.amber }
                            : { bg: '#EFF6FF', border: '#3B82F6', text: '#3B82F6' };
                        return (
                            <View key={`alert-${i}`} style={{ backgroundColor: alertStyle.bg, borderRadius: 6, padding: 8, borderLeftWidth: 3, borderLeftColor: alertStyle.border, marginBottom: 4 }}>
                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: alertStyle.text }}>[{alert.severity.toUpperCase()}] {alert.title}</Text>
                                <Text style={{ fontSize: 7, color: C.text, marginTop: 2, lineHeight: 1.3 }}>{alert.detail}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            <Text style={s.narrative}>{es.narrative}</Text>

            <View style={s.kpiRow}>
                <KPICard value={kpi.users.toLocaleString()} label="Users" delta={kpi.usersDelta} sparkData={sessionData} unavailable={!analysis.hasGa4} unavailableNote="GA4 unavailable" />
                <KPICard value={kpi.clicks.toLocaleString()} label="Organic Clicks" delta={kpi.clicksDelta} sparkData={clickData} />
                <KPICard value={kpi.avgPosition.toString()} label="Avg Position" delta={kpi.avgPositionDelta} invertDelta />
                <KPICard value={`${(kpi.bounceRate * 100).toFixed(0)}%`} label="Bounce Rate" delta={Math.round(kpi.bounceRateDelta * 100)} invertDelta unavailable={!analysis.hasGa4} unavailableNote="GA4 unavailable" />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Key Findings</Text>
                {es.highlights.map((h, i) => (
                    <Text key={i} style={{ fontSize: 8, color: C.text, marginBottom: 3, paddingLeft: 10 }}>* {h}</Text>
                ))}
            </View>

            <View style={s.actionBox}>
                <Text style={s.actionTitle}>#1 Action This {period.type === 'weekly' ? 'Week' : 'Month'}</Text>
                <Text style={s.actionText}>{es.oneAction}</Text>
                <Text style={[s.actionText, { color: C.textMuted, marginTop: 3 }]}>Why: {es.oneActionWhy}</Text>
                <Text style={[s.actionText, { color: C.emeraldDark, marginTop: 2 }]}>Expected: {es.oneActionImpact}</Text>
            </View>

            {gemini.criticalProblems.slice(0, 2).map((prob, i) => (
                <View key={`prob-${i}`} wrap={false} style={[s.card, { marginTop: 6, borderLeftWidth: 3, borderLeftColor: C.red }]}>
                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.red, marginBottom: 3 }}>{prob.title}</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4, marginBottom: 3 }}>{prob.explanation}</Text>
                    <Text style={{ fontSize: 7, color: C.emeraldDark, lineHeight: 1.4 }}>{prob.fix}</Text>
                </View>
            ))}
            <PageFooter />
        </Page>
    );
}

// Page 3: Performance Scorecard
function PerformanceScorecardPage({ analysis, siteUrl, period }: ReportProps) {
    const kpi = analysis.kpis;
    const sessionData = analysis.dailySessions.map(d => d.sessions);
    const clickData = analysis.dailyClicks.map(d => d.clicks);
    const impressionData = analysis.dailyImpressions.map(d => d.impressions);

    const metrics = [
        { label: 'Users', value: kpi.users.toLocaleString(), delta: kpi.usersDelta, spark: sessionData, unavailable: !analysis.hasGa4 },
        { label: 'Sessions', value: kpi.sessions.toLocaleString(), delta: kpi.sessionsDelta, spark: sessionData, unavailable: !analysis.hasGa4 },
        { label: 'Organic Clicks', value: kpi.clicks.toLocaleString(), delta: kpi.clicksDelta, spark: clickData },
        { label: 'Impressions', value: kpi.impressions.toLocaleString(), delta: kpi.impressionsDelta, spark: impressionData },
        { label: 'Avg Position', value: kpi.avgPosition.toString(), delta: kpi.avgPositionDelta, invert: true, spark: [] },
        { label: 'Bounce Rate', value: `${(kpi.bounceRate * 100).toFixed(1)}%`, delta: Math.round(kpi.bounceRateDelta * 100), invert: true, spark: [], unavailable: !analysis.hasGa4 },
        { label: 'Session Duration', value: `${kpi.avgSessionDuration}s`, delta: 0, spark: [], unavailable: !analysis.hasGa4 },
        { label: 'New User Ratio', value: `${kpi.newUserRatio}%`, delta: 0, spark: [], unavailable: !analysis.hasGa4 },
    ];

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>2. Performance Scorecard</Text>
            <Text style={s.sectionSubtitle}>{analysis.hasGa4 ? `Complete KPI dashboard — ${period.startDate} to ${period.endDate}` : `Search Console scorecard — ${period.startDate} to ${period.endDate}`}</Text>

            {[0, 1].map(row => (
                <View key={row} style={s.kpiRow}>
                    {metrics.slice(row * 4, row * 4 + 4).map(m => (
                        <KPICard key={m.label} value={m.value} label={m.label} delta={m.delta} sparkData={m.spark.length > 1 ? m.spark : undefined} invertDelta={m.invert} unavailable={m.unavailable} unavailableNote="GA4 unavailable" />
                    ))}
                </View>
            ))}

            {/* Session trend chart */}
            {analysis.hasGa4 ? (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Daily Sessions Trend</Text>
                    <DailyBarChart data={analysis.dailySessions as unknown as Array<Record<string, unknown>>} valueKey="sessions" anomalyDates={analysis.anomalies.map(a => a.date)} />
                </View>
            ) : (
                <AvailabilityNotice
                    title="Session trend unavailable"
                    message="Daily session charts require GA4. This Search Console-only report keeps the SEO trendline below and omits traffic charts intentionally."
                />
            )}

            {/* Clicks trend chart */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Daily Organic Clicks Trend</Text>
                <DailyBarChart data={analysis.dailyClicks as unknown as Array<Record<string, unknown>>} valueKey="clicks" color={C.cyan} />
            </View>
            <PageFooter />
        </Page>
    );
}

// Page 4: Anomaly Deep Dive
function AnomalyDeepDivePage({ analysis, gemini, siteUrl }: ReportProps) {
    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>3. Anomaly Deep Dive</Text>
            <Text style={s.sectionSubtitle}>{analysis.hasGa4 ? 'Root cause analysis for unusual traffic patterns' : 'Traffic anomaly analysis requires GA4 session data'}</Text>

            {!analysis.hasGa4 ? (
                <AvailabilityNotice
                    title="Anomaly analysis unavailable"
                    message="This section normally analyzes daily session anomalies from GA4. Because GA4 is not connected, this report focuses on Search Console movements and omits traffic anomaly claims."
                />
            ) : analysis.anomalies.length === 0 ? (
                <View style={s.card}>
                    <Text style={s.cardTitle}>No Statistical Anomalies</Text>
                    <Text style={{ fontSize: 8, color: C.textMuted }}>
                        Session variance stayed within normal ranges (z-score under 1.5). {analysis.criticalAlerts.length > 0
                            ? `However, ${analysis.criticalAlerts.length} critical issue(s) were detected in other metrics — see Executive Summary.`
                            : 'Daily traffic patterns were consistent.'}
                    </Text>
                </View>
            ) : (
                gemini.anomalyExplanations.map((ae, i) => {
                    const anomaly = analysis.anomalies[i];
                    if (!anomaly) return null;
                    return (
                        <View key={`anomaly-${i}`} style={s.card}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <Text style={[s.cardTitle, { marginBottom: 0 }]}>{anomaly.dayName}, {anomaly.date}</Text>
                                <Text style={[s.badge, anomaly.severity === 'critical' ? s.badgeDeclining : s.badgeAtRisk]}>
                                    {anomaly.deviationPercent > 0 ? '+' : ''}{anomaly.deviationPercent}%
                                </Text>
                            </View>
                            <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 4 }}>
                                Actual: {anomaly.actual} sessions | Expected: ~{anomaly.expected} | Deviation: {Math.abs(anomaly.actual - anomaly.expected)} sessions
                            </Text>
                            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{ae.rootCause}</Text>
                            <View style={{ backgroundColor: C.redLight, borderRadius: 4, padding: 6, marginBottom: 4 }}>
                                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.red }}>Impact: {ae.impact}</Text>
                            </View>
                            <View style={{ backgroundColor: C.emeraldLight, borderRadius: 4, padding: 6 }}>
                                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 2 }}>How to Fix</Text>
                                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>{ae.howToFix}</Text>
                            </View>
                        </View>
                    );
                })
            )}
            <PageFooter />
        </Page>
    );
}

// Page 5: Keyword Intelligence
function KeywordIntelligencePage({ analysis, gemini, siteUrl }: ReportProps) {
    const { accelerating, decelerating } = analysis.keywordVelocity;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>4. Keyword Intelligence</Text>
            <Text style={s.sectionSubtitle}>Momentum tracking with CTR gap analysis</Text>

            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.emeraldDark }]}>Accelerating Keywords ({accelerating.length})</Text>
                {accelerating.length === 0 ? (
                    <Text style={{ fontSize: 7, color: C.textMuted }}>No keywords showed significant acceleration. {analysis.keywordVelocity.newKeywords.length > 0 ? `${analysis.keywordVelocity.newKeywords.length} new keyword(s) appeared this period — see below.` : 'Build keyword authority by creating targeted content.'}</Text>
                ) : (
                    <>
                        <View style={s.tableHeader}>
                            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Keyword</Text>
                            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Position</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Clicks</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Impr %</Text>
                            <Text style={[s.tableHeaderCell, { width: '15%' }]}>CTR vs Exp</Text>
                            <Text style={[s.tableHeaderCell, { width: '14%' }]}>Gap</Text>
                        </View>
                        {accelerating.slice(0, 7).map(k => (
                            <View key={k.query} style={s.tableRow}>
                                <Text style={[s.tableCell, { width: '30%' }]}>{k.query.slice(0, 35)}</Text>
                                <Text style={[s.tableCell, { width: '15%', color: C.emerald }]}>{k.prevPosition}-&gt;{k.currentPosition}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{k.prevClicks}-&gt;{k.currentClicks}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{k.impressionDelta > 0 ? '+' : ''}{k.impressionDelta}%</Text>
                                <Text style={[s.tableCell, { width: '15%' }]}>{k.actualCtr}%/{k.expectedCtr}%</Text>
                                <Text style={[s.tableCell, { width: '14%', color: k.ctrGap >= 0 ? C.emerald : C.red }]}>{k.ctrGap > 0 ? '+' : ''}{k.ctrGap}pp</Text>
                            </View>
                        ))}
                    </>
                )}
                <Text style={{ fontSize: 7, color: C.textMuted, marginTop: 6, lineHeight: 1.4 }}>{gemini.keywordAccelCommentary}</Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.red }]}>Decelerating Keywords ({decelerating.length})</Text>
                {decelerating.length === 0 ? (
                    <Text style={{ fontSize: 7, color: C.textMuted }}>No keywords showed significant deceleration. {analysis.keywordVelocity.lostKeywords.length > 0 ? `However, ${analysis.keywordVelocity.lostKeywords.length} keyword(s) disappeared entirely this period.` : ''}</Text>
                ) : (
                    <>
                        <View style={s.tableHeader}>
                            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Keyword</Text>
                            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Position</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Clicks</Text>
                            <Text style={[s.tableHeaderCell, { width: '13%' }]}>Impr %</Text>
                            <Text style={[s.tableHeaderCell, { width: '15%' }]}>CTR vs Exp</Text>
                            <Text style={[s.tableHeaderCell, { width: '14%' }]}>Gap</Text>
                        </View>
                        {decelerating.slice(0, 7).map(k => (
                            <View key={k.query} style={s.tableRow}>
                                <Text style={[s.tableCell, { width: '30%' }]}>{k.query.slice(0, 35)}</Text>
                                <Text style={[s.tableCell, { width: '15%', color: C.red }]}>{k.prevPosition}-&gt;{k.currentPosition}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{k.prevClicks}-&gt;{k.currentClicks}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{k.impressionDelta > 0 ? '+' : ''}{k.impressionDelta}%</Text>
                                <Text style={[s.tableCell, { width: '15%' }]}>{k.actualCtr}%/{k.expectedCtr}%</Text>
                                <Text style={[s.tableCell, { width: '14%', color: k.ctrGap >= 0 ? C.emerald : C.red }]}>{k.ctrGap > 0 ? '+' : ''}{k.ctrGap}pp</Text>
                            </View>
                        ))}
                    </>
                )}
                <Text style={{ fontSize: 7, color: C.textMuted, marginTop: 6, lineHeight: 1.4 }}>{gemini.keywordDecelCommentary}</Text>
            </View>
            <PageFooter />
        </Page>
    );
}

// Page 6: Content Decay Analysis
function ContentDecayPage({ analysis, gemini, siteUrl }: ReportProps) {
    const decay = analysis.decayPages;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>5. Content Decay Analysis</Text>
            <Text style={s.sectionSubtitle}>{decay.length} pages losing traffic and rankings</Text>

            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{gemini.decayOverview}</Text>

            {decay.length === 0 ? (
                <View style={s.card}>
                    <Text style={{ fontSize: 8, color: analysis.kpis.clicks < 10 ? C.amber : C.emeraldDark }}>
                        {analysis.kpis.clicks < 10
                            ? `Organic data is too limited for decay analysis (${analysis.kpis.clicks} total click(s), ${analysis.kpis.impressions} impressions). Building organic visibility is the first priority.`
                            : 'No significant content decay detected this period — content is holding steady.'}
                    </Text>
                </View>
            ) : (
                <>
                    <View style={s.tableHeader}>
                        <Text style={[s.tableHeaderCell, { width: '35%' }]}>Page</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Clicks</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Decay</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Position</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>CTR</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Impressions</Text>
                    </View>
                    {decay.slice(0, 8).map(p => (
                        <View key={p.page} style={s.tableRow}>
                            <Text style={[s.tableCell, { width: '35%' }]}>{p.page.slice(0, 40)}</Text>
                            <Text style={[s.tableCell, { width: '13%', color: C.red }]}>{p.prevClicks}-&gt;{p.currentClicks}</Text>
                            <Text style={[s.tableCell, { width: '13%', color: C.red }]}>{p.decayRate}%</Text>
                            <Text style={[s.tableCell, { width: '13%' }]}>{p.prevPosition}-&gt;{p.currentPosition}</Text>
                            <Text style={[s.tableCell, { width: '13%' }]}>{p.currentCtr}%</Text>
                            <Text style={[s.tableCell, { width: '13%' }]}>{p.currentImpressions}</Text>
                        </View>
                    ))}
                </>
            )}

            {gemini.decayFixes.slice(0, 2).map((fix, i) => (
                <View key={`decay-fix-${i}`} style={[s.card, { marginTop: 6 }]}>
                    <Text style={[s.cardTitle, { fontSize: 9 }]}>Fix: {fix.page.slice(0, 50)}</Text>
                    <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 3 }}>{fix.diagnosis}</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>{fix.refreshStrategy}</Text>
                </View>
            ))}
            <PageFooter />
        </Page>
    );
}

// Page 7: Cannibalization Report
function CannibalizationPage({ analysis, gemini, siteUrl }: ReportProps) {
    const cannibal = analysis.cannibalization;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>6. Keyword Cannibalization</Text>
            <Text style={s.sectionSubtitle}>{cannibal.length} keywords with competing pages</Text>

            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{gemini.cannibalizationOverview}</Text>

            {cannibal.length === 0 ? (
                <View style={s.card}>
                    <Text style={{ fontSize: 8, color: analysis.kpis.impressions < 50 ? C.amber : C.emeraldDark }}>
                        {analysis.kpis.impressions < 50
                            ? `Insufficient search data for cannibalization analysis (${analysis.kpis.impressions} total impressions). Focus on building organic presence first.`
                            : 'No keyword cannibalization detected — pages are targeting distinct queries.'}
                    </Text>
                </View>
            ) : (
                cannibal.slice(0, 4).map((group, i) => (
                    <View key={`cannibal-${i}`} style={s.card}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={[s.cardTitle, { fontSize: 9, marginBottom: 0 }]}>&quot;{group.query.slice(0, 40)}&quot;</Text>
                            <Text style={{ fontSize: 7, color: C.textMuted }}>{group.totalImpressions} impressions</Text>
                        </View>
                        {group.pages.slice(0, 4).map((p, j) => (
                            <View key={`page-${j}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                <Text style={{ fontSize: 7, color: j === 0 ? C.emeraldDark : C.text, width: '50%' }}>
                                    {j === 0 ? '[WINNER] ' : ''}{p.page.slice(0, 45)}
                                </Text>
                                <Text style={{ fontSize: 7, color: C.textMuted }}>{p.clicks} clicks | pos {p.position}</Text>
                            </View>
                        ))}
                        {gemini.cannibalizationFixes[i] && (
                            <View style={{ marginTop: 4, backgroundColor: C.emeraldLight, borderRadius: 4, padding: 6 }}>
                                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.emeraldDark }}>{gemini.cannibalizationFixes[i].recommendation}</Text>
                                <Text style={{ fontSize: 7, color: C.text, marginTop: 2, lineHeight: 1.3 }}>{gemini.cannibalizationFixes[i].steps}</Text>
                            </View>
                        )}
                    </View>
                ))
            )}
            <PageFooter />
        </Page>
    );
}

// Combined Content Health page — used when both decay and cannibalization are sparse
function ContentHealthPage({ analysis, gemini, siteUrl }: ReportProps) {
    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>5. Content Health</Text>
            <Text style={s.sectionSubtitle}>Decay analysis and cannibalization review</Text>

            {/* Decay section */}
            <View style={[s.card, { marginBottom: 8 }]}>
                <Text style={[s.cardTitle, { color: C.emeraldDark, fontSize: 9 }]}>Content Decay</Text>
                <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{gemini.decayOverview}</Text>
                <Text style={{ fontSize: 8, color: analysis.kpis.clicks < 10 ? C.amber : C.emeraldDark }}>
                    {analysis.kpis.clicks < 10
                        ? `Organic data is too limited for decay analysis (${analysis.kpis.clicks} click(s), ${analysis.kpis.impressions} impressions). Building visibility is the first priority.`
                        : 'No significant content decay detected this period.'}
                </Text>
            </View>

            {/* Cannibalization section */}
            <View style={[s.card, { marginBottom: 8 }]}>
                <Text style={[s.cardTitle, { color: C.cyan, fontSize: 9 }]}>Keyword Cannibalization</Text>
                <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{gemini.cannibalizationOverview}</Text>
                <Text style={{ fontSize: 8, color: analysis.kpis.impressions < 50 ? C.amber : C.emeraldDark }}>
                    {analysis.kpis.impressions < 50
                        ? `Insufficient search data for cannibalization analysis (${analysis.kpis.impressions} impressions).`
                        : 'No keyword cannibalization detected — pages are targeting distinct queries.'}
                </Text>
            </View>

            {/* Gemini assessment for the combined page */}
            {(gemini.criticalProblems.length > 0 || analysis.criticalAlerts.length > 0) && (
                <View style={[s.card, { backgroundColor: C.redLight, borderLeftWidth: 3, borderLeftColor: C.red }]}>
                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.red, marginBottom: 3 }}>Note</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>
                        Although no decay or cannibalization patterns are detectable, {analysis.criticalAlerts.length} critical alert(s) were flagged in the Executive Summary. Review those before concluding content is healthy.
                    </Text>
                </View>
            )}
            <PageFooter />
        </Page>
    );
}

// Page 8: Revenue & Opportunity
function RevenueOpportunityPage({ analysis, gemini, siteUrl }: ReportProps) {
    const opps = analysis.opportunities;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>7. Revenue and Opportunity</Text>
            <Text style={s.sectionSubtitle}>Estimated monthly organic value: ${analysis.totalRevenueEstimate.toLocaleString()}</Text>

            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{gemini.revenueNarrative}</Text>

            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{gemini.opportunityOverview}</Text>

            {opps.length > 0 ? (
                <>
                    <View style={s.tableHeader}>
                        <Text style={[s.tableHeaderCell, { width: '28%' }]}>Keyword</Text>
                        <Text style={[s.tableHeaderCell, { width: '10%' }]}>Type</Text>
                        <Text style={[s.tableHeaderCell, { width: '10%' }]}>Pos</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Impressions</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Potential</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Est. Value</Text>
                        <Text style={[s.tableHeaderCell, { width: '13%' }]}>Current</Text>
                    </View>
                    {opps.slice(0, 10).map(o => {
                        const typeLabel = o.type === 'striking_distance' ? 'SD' : o.type === 'ctr_fix' ? 'CTR' : 'QW';
                        return (
                            <View key={o.query} style={s.tableRow}>
                                <Text style={[s.tableCell, { width: '28%' }]}>{o.query.slice(0, 30)}</Text>
                                <Text style={[s.tableCell, { width: '10%', color: C.cyan }]}>{typeLabel}</Text>
                                <Text style={[s.tableCell, { width: '10%' }]}>{o.position.toFixed(1)}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{o.impressions}</Text>
                                <Text style={[s.tableCell, { width: '13%', color: C.emerald }]}>+{o.potentialClicks}</Text>
                                <Text style={[s.tableCell, { width: '13%', fontFamily: 'Helvetica-Bold' }]}>${o.revenueEstimate}</Text>
                                <Text style={[s.tableCell, { width: '13%' }]}>{o.clicks} cl</Text>
                            </View>
                        );
                    })}
                </>
            ) : (
                <View style={[s.card, { backgroundColor: C.amberLight, borderLeftWidth: 3, borderLeftColor: C.amber }]}>
                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.amber, marginBottom: 3 }}>No ranking opportunities detected</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>
                        {analysis.kpis.impressions < 50
                            ? `With only ${analysis.kpis.impressions} total impressions, the site has not yet built enough search visibility for keyword opportunities. Focus on publishing quality content targeting low-competition keywords.`
                            : 'No striking-distance or CTR-fix opportunities met the threshold this period. Keep monitoring as rankings develop.'}
                    </Text>
                </View>
            )}

            {gemini.opportunityStrategies.filter(st => st.keyword.length > 0).slice(0, opps.length === 0 ? 4 : 2).map((strat, i) => (
                <View key={`strat-${i}`} style={[s.card, { marginTop: 6 }]}>
                    <Text style={[s.cardTitle, { fontSize: 9 }]}>Strategy: &quot;{strat.keyword.slice(0, 35)}&quot;</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>{strat.strategy}</Text>
                    <Text style={{ fontSize: 7, color: C.emeraldDark, marginTop: 2 }}>Timeline: {strat.timeline}</Text>
                </View>
            ))}

            {opps.length > 0 && (
                <View style={[s.card, { marginTop: 6, alignItems: 'center' }]}>
                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text }}>
                        {opps.length} opportunities = +{opps.reduce((sum, o) => sum + o.potentialClicks, 0).toLocaleString()} clicks/mo = ~${analysis.totalRevenueEstimate.toLocaleString()}/mo
                    </Text>
                </View>
            )}
            <PageFooter />
        </Page>
    );
}

// Page 9: Top Pages Performance
function TopPagesPage({ analysis, gemini, siteUrl }: ReportProps) {
    const pages = analysis.pageGrades;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>8. Top Pages Performance</Text>
            <Text style={s.sectionSubtitle}>{analysis.hasGa4 ? 'Page-level grading based on clicks, CTR, position, and bounce rate' : 'Page-level grading based on search performance; GA4 behavior metrics are unavailable'}</Text>

            <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { width: '5%' }]}>Gr</Text>
                <Text style={[s.tableHeaderCell, { width: '33%' }]}>Page</Text>
                <Text style={[s.tableHeaderCell, { width: '10%' }]}>Clicks</Text>
                <Text style={[s.tableHeaderCell, { width: '10%' }]}>Delta</Text>
                <Text style={[s.tableHeaderCell, { width: '10%' }]}>Pos</Text>
                <Text style={[s.tableHeaderCell, { width: '10%' }]}>CTR</Text>
                <Text style={[s.tableHeaderCell, { width: '10%' }]}>Bounce</Text>
                <Text style={[s.tableHeaderCell, { width: '12%' }]}>Sessions</Text>
            </View>
            {pages.slice(0, 12).map(p => (
                <View key={p.page} style={s.tableRow}>
                    <View style={{ width: '5%', alignItems: 'center' }}><GradeBadge grade={p.grade} /></View>
                    <Text style={[s.tableCell, { width: '33%' }]}>{p.page.slice(0, 38)}</Text>
                    <Text style={[s.tableCell, { width: '10%' }]}>{p.clicks}</Text>
                    <Text style={[s.tableCell, { width: '10%', color: p.clickDelta >= 0 ? C.emerald : C.red }]}>{p.clickDelta >= 0 ? '+' : ''}{p.clickDelta}</Text>
                    <Text style={[s.tableCell, { width: '10%' }]}>{p.position}</Text>
                    <Text style={[s.tableCell, { width: '10%' }]}>{p.ctr}%</Text>
                    <Text style={[s.tableCell, { width: '10%' }]}>{p.bounceRate === null ? 'N/A' : `${p.bounceRate}%`}</Text>
                    <Text style={[s.tableCell, { width: '12%' }]}>{p.sessions === null ? 'N/A' : p.sessions}</Text>
                </View>
            ))}

            {gemini.pageOptimizations.slice(0, 2).map((po, i) => (
                <View key={`po-${i}`} style={[s.card, { marginTop: 6 }]}>
                    <Text style={[s.cardTitle, { fontSize: 9 }]}>Optimize: {po.page.slice(0, 45)}</Text>
                    <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 2 }}>{po.issues}</Text>
                    <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.4 }}>{po.fixes}</Text>
                </View>
            ))}
            <PageFooter />
        </Page>
    );
}

// Page 10: Traffic DNA
function TrafficDNAPage({ analysis, gemini, period, siteUrl }: ReportProps) {
    const dna = analysis.trafficDNA;
    const maxChannelShare = Math.max(...dna.channels.map(c => Math.max(c.currentShare, c.prevShare)), 1);
    const deviceColors = [C.emerald, C.cyan, C.amber, C.textLight];
    const donutSegments = dna.devices.map((d, i) => ({ label: d.device, value: d.currentShare, color: deviceColors[i % deviceColors.length] }));

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>9. Traffic Composition</Text>
            <Text style={s.sectionSubtitle}>{analysis.hasGa4 ? 'How your traffic sources and audience are shifting' : 'Traffic composition requires GA4 and is not included in this Search Console-only report'}</Text>

            {analysis.hasGa4 ? (
                <>
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Channel Mix (current vs previous)</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <View style={{ width: 8, height: 5, backgroundColor: C.border, borderRadius: 2 }} />
                                <Text style={{ fontSize: 6, color: C.textMuted }}>Previous</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <View style={{ width: 8, height: 5, backgroundColor: C.emerald, borderRadius: 2 }} />
                                <Text style={{ fontSize: 6, color: C.textMuted }}>Current</Text>
                            </View>
                        </View>
                        {dna.channels.slice(0, 6).map(ch => (
                            <HorizontalBar key={ch.channel} label={ch.channel} current={ch.currentShare} prev={ch.prevShare} maxVal={maxChannelShare} width={380} />
                        ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={[s.card, { flex: 1 }]}>
                            <Text style={s.cardTitle}>Device Split</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <DonutChart segments={donutSegments} size={60} />
                                <View>
                                    {dna.devices.map((d, i) => (
                                        <View key={d.device} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                            <View style={{ width: 7, height: 7, borderRadius: 3, backgroundColor: deviceColors[i % deviceColors.length] }} />
                                            <Text style={{ fontSize: 7, color: C.text }}>{d.device} {d.currentShare}%</Text>
                                            <Text style={{ fontSize: 6, color: d.shareDelta > 0 ? C.emerald : d.shareDelta < 0 ? C.red : C.textMuted }}>
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
                                <View key={c.country} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <Text style={{ fontSize: 7, color: C.text, width: '40%' }}>{c.country}</Text>
                                    <Text style={{ fontSize: 7, color: C.textMuted }}>{c.currentShare}%</Text>
                                    <Text style={{ fontSize: 6, color: c.shareDelta > 0 ? C.emerald : c.shareDelta < 0 ? C.red : C.textMuted }}>
                                        {c.shareDelta > 0 ? '+' : ''}{c.shareDelta}pp
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {dna.topPageShare > 25 && (
                        <View style={s.warningBox}>
                            <Text style={s.warningTitle}>Concentration Risk</Text>
                            <Text style={{ fontSize: 7, color: C.text }}>
                                {dna.topPage} drives {dna.topPageShare}% of sessions. Losing rankings on this page could cost ~{Math.round(analysis.kpis.sessions * dna.topPageShare / 100)} sessions/{period.type === 'weekly' ? 'week' : 'month'}.
                            </Text>
                        </View>
                    )}
                </>
            ) : (
                <AvailabilityNotice
                    title="Traffic composition unavailable"
                    message="Channel mix, device split, country mix, and concentration-risk analysis are GA4 features. They are intentionally omitted here because this PDF was generated in Search Console-only mode."
                />
            )}

            <View style={[s.card, { marginTop: 4 }]}>
                <Text style={s.cardTitle}>Analysis</Text>
                <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5 }}>{gemini.trafficDNAInterpretation}</Text>
            </View>
            <PageFooter />
        </Page>
    );
}

// Page 11: Fix Prompts Collection
function FixPromptsPage({ analysis, gemini, siteUrl }: ReportProps) {
    const prompts = analysis.fixPrompts;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>10. Recommended Fixes</Text>
            <Text style={s.sectionSubtitle}>AI-generated fix prompts — copy into ChatGPT, Gemini, or Claude for detailed solutions</Text>

            {prompts.length === 0 && gemini.criticalProblems.length === 0 ? (
                <View style={s.card}>
                    <Text style={{ fontSize: 8, color: analysis.kpis.clicks < 10 ? C.amber : C.emeraldDark }}>
                        {analysis.kpis.clicks < 10
                            ? `Organic presence is too weak for targeted fix prompts. See the Critical Problems and Action Plan sections for strategic recommendations.`
                            : 'No targeted fix prompts generated this period. Review the Action Plan for strategic recommendations.'}
                    </Text>
                </View>
            ) : (
                prompts.slice(0, 3).map(p => (
                    <View key={p.id} wrap={false} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text }}>{p.title}</Text>
                            <Text style={{ fontSize: 6, color: C.emerald, fontFamily: 'Helvetica-Bold' }}>{p.category.toUpperCase()}</Text>
                        </View>
                        <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 2 }}>{p.context}</Text>
                        <PromptBox label={p.title} text={p.prompt} />
                    </View>
                ))
            )}
            <PageFooter />
        </Page>
    );
}

// Page 12: Fix Prompts Continued (if needed)
function FixPromptsPage2({ analysis, siteUrl }: ReportProps) {
    const prompts = analysis.fixPrompts.slice(3);
    if (prompts.length === 0) return null;

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>10. Recommended Fixes (continued)</Text>
            <Text style={s.sectionSubtitle}>More fixes for your remaining issues</Text>

            {prompts.slice(0, 4).map(p => (
                <View key={p.id} wrap={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text }}>{p.title}</Text>
                        <Text style={{ fontSize: 6, color: C.emerald, fontFamily: 'Helvetica-Bold' }}>{p.category.toUpperCase()}</Text>
                    </View>
                    <Text style={{ fontSize: 7, color: C.textMuted, marginBottom: 2 }}>{p.context}</Text>
                    <PromptBox label={p.title} text={p.prompt} />
                </View>
            ))}
            <PageFooter />
        </Page>
    );
}

// Page 13: Action Plan
function ActionPlanPage({ analysis, gemini, period, siteUrl }: ReportProps) {
    const weekLabel = period.type === 'weekly' ? 'This Week' : 'This Month';
    const monthLabel = period.type === 'weekly' ? 'This Month' : 'Next Quarter';

    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>11. Action Plan</Text>
            <Text style={s.sectionSubtitle}>Prioritized actions ranked by effort and impact</Text>

            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.emeraldDark }]}>{weekLabel} — Quick Wins</Text>
                {gemini.actionPlanThisWeek.map((a, i) => (
                    <View key={`week-${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.emerald, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.4 }}>{a.action}</Text>
                            <EffortImpactBadge effort={a.effort} impact={a.impact} />
                        </View>
                    </View>
                ))}
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { color: C.cyan }]}>{monthLabel} — Strategic Actions</Text>
                {gemini.actionPlanThisMonth.map((a, i) => (
                    <View key={`month-${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.cyan, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.4 }}>{a.action}</Text>
                            <EffortImpactBadge effort={a.effort} impact={a.impact} />
                        </View>
                    </View>
                ))}
            </View>

            <View style={[s.card, { backgroundColor: C.emeraldLight }]}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.emeraldDark, marginBottom: 4 }}>Summary</Text>
                <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.5 }}>
                    {gemini.actionPlanThisWeek.length} quick win(s) and {gemini.actionPlanThisMonth.length} strategic action(s) planned.{analysis.opportunities.length > 0 ? ` ${analysis.opportunities.length} keyword opportunities worth ~$${analysis.totalRevenueEstimate}/month.` : ''}{analysis.decayPages.length > 0 ? ` ${analysis.decayPages.length} pages need content refresh.` : ''}{analysis.cannibalization.length > 0 ? ` ${analysis.cannibalization.length} cannibalization groups to resolve.` : ''}{analysis.criticalAlerts.length > 0 ? ` ${analysis.criticalAlerts.length} critical alert(s) require attention.` : ''}
                </Text>
            </View>
            <PageFooter />
        </Page>
    );
}

// Page 14: Methodology Notes
function MethodologyPage({ analysis, siteUrl }: ReportProps) {
    return (
        <Page size="A4" style={s.page}>
            <View style={s.accentSidebar} />
            <PageHeader siteUrl={siteUrl} />
            <Text style={s.sectionTitle}>12. Methodology</Text>
            <Text style={s.sectionSubtitle}>How this report is generated</Text>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Data Sources</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    {analysis.hasGa4
                        ? 'All data is pulled directly from your Google Analytics 4 (GA4) and Google Search Console (GSC) accounts via their official APIs. No data is estimated or scraped from third-party tools.'
                        : 'This PDF uses Google Search Console (GSC) data directly from the official API. GA4 was not connected for this user, so traffic and engagement metrics are marked unavailable rather than estimated.'}
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Anomaly Detection</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    {analysis.hasGa4
                        ? 'Anomalies are detected using z-score analysis on daily session data. Days with z-scores exceeding 1.5 standard deviations are flagged. Severity is &quot;critical&quot; at 2.5+ and &quot;warning&quot; at 1.5-2.5.'
                        : 'Traffic anomaly detection is only available when GA4 session data is connected. Search Console-only reports omit anomaly scoring rather than substituting zero values.'}
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Keyword Velocity</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    Momentum scores combine position changes (weighted 10x), click deltas (weighted 2x), and impression growth. CTR gap compares actual CTR against expected CTR benchmarks for the keyword&apos;s position.
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Content Decay</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    Pages are flagged as decaying when clicks drop by 2+ and position worsens by 0.5+ compared to the previous period. Decay rate is the percentage change in clicks.
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Revenue Estimation</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    Revenue estimates use keyword-intent CPC tiers: transactional ($2.50), commercial investigation ($1.50), informational ($0.30), and default ($0.50). Potential clicks are calculated from the expected CTR at position 1-3 minus current clicks.
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>Page Grades</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    {analysis.hasGa4
                        ? 'Pages are graded A-F based on a composite score of: position (top 3 = 3pts, top 10 = 2pts, top 20 = 1pt), CTR (10%+ = 3pts, 5%+ = 2pts, 2%+ = 1pt), click trend (positive = 2pts), and bounce rate (under 40% = 2pts, under 60% = 1pt).'
                        : 'Pages are graded A-F using search performance only: position, CTR, and click trend. Bounce rate and session metrics are excluded when GA4 is unavailable so missing data does not inflate scores.'}
                </Text>
            </View>

            <View style={s.card}>
                <Text style={[s.cardTitle, { fontSize: 9 }]}>AI Analysis</Text>
                <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.5 }}>
                    Narrative insights are generated using Google Gemini AI, prompted with the structured analysis data. The AI provides root cause analysis, strategic recommendations, and actionable fix prompts. All AI content is grounded in your actual data.
                </Text>
            </View>
            <PageFooter />
        </Page>
    );
}

// Page 15: CTA
function CTAPage() {
    return (
        <Page size="A4" style={[s.page, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{ width: '100%', height: 6, backgroundColor: C.accentBar, position: 'absolute', top: 0, left: 0 }} />
            <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.emerald, marginBottom: 16 }}>TrafficClaw</Text>
                <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 8, textAlign: 'center' as const }}>Get real-time monitoring</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, textAlign: 'center' as const, marginBottom: 24 }}>
                    Your dashboard includes live anomaly alerts, AI chat on your data,{'\n'}
                    automated content strategy, and weekly email briefings.
                </Text>
                <View style={{ backgroundColor: C.emeraldLight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.emerald, textAlign: 'center' as const }}>trafficclaw.com/dashboard</Text>
                </View>
                <Text style={{ fontSize: 9, color: C.textLight, textAlign: 'center' as const }}>Free tier available - No credit card required</Text>
            </View>
            <View style={{ position: 'absolute', bottom: 24, left: 40, right: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, color: C.textLight }}>Generated by TrafficClaw - trafficclaw.com - 2026 TrafficClaw. All rights reserved.</Text>
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
    const rp: ReportProps = { analysis, gemini, period, siteUrl };
    const bothContentSparse = analysis.decayPages.length === 0 && analysis.cannibalization.length === 0;
    const hasFixPrompts = analysis.fixPrompts.length > 0 || gemini.criticalProblems.length > 0;

    return (
        <Document
            title={`TrafficClaw ${period.type === 'weekly' ? 'Weekly' : 'Monthly'} Deep Report - ${siteUrl}`}
            author="TrafficClaw"
            subject={`Analytics Report for ${period.startDate} to ${period.endDate}`}
        >
            <CoverPage siteUrl={siteUrl} period={period} hasGa4={analysis.hasGa4} />
            <ExecutiveSummaryPage {...rp} />
            <PerformanceScorecardPage {...rp} />
            <AnomalyDeepDivePage {...rp} />
            <KeywordIntelligencePage {...rp} />
            {bothContentSparse ? (
                <ContentHealthPage {...rp} />
            ) : (
                <>
                    <ContentDecayPage {...rp} />
                    <CannibalizationPage {...rp} />
                </>
            )}
            <RevenueOpportunityPage {...rp} />
            <TopPagesPage {...rp} />
            <TrafficDNAPage {...rp} />
            {hasFixPrompts && <FixPromptsPage {...rp} />}
            {hasFixPrompts && <FixPromptsPage2 {...rp} />}
            <ActionPlanPage {...rp} />
            <MethodologyPage {...rp} />
            <CTAPage />
        </Document>
    );
}
