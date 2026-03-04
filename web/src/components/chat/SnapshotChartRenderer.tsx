'use client';

import { ReactNode } from 'react';
import {
    TrendLineChart, HorizontalBarChart, DeviceDonutChart, CountryBarChart,
    PositionDistributionChart, CtrOpportunityList, OverviewMetricCards,
} from './ChatCharts';

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD SNAPSHOT INTERFACE
   ═══════════════════════════════════════════════════════════════ */

export interface DashboardSnapshot {
    kpis: {
        totalClicks?: number; clicks?: number;
        totalImpressions?: number; impressions?: number;
        avgCTR?: number; ctr?: number;
        avgPosition?: number; position?: number;
        totalUsers?: number; totalPageViews?: number;
        avgBounceRate?: number; totalSessions?: number;
        changeClicks?: number; changeUsers?: number;
    };
    topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    topPages: { page: string; clicks: number; impressions: number; ctr?: number; position?: number }[];
    devices: { device: string; percentage?: number; clicks?: number; value?: number }[];
    countries: { country: string; clicks?: number; sessions?: number; value?: number }[];
    dateTrend: { date: string; clicks: number; impressions: number }[];
    sources: { source: string; sessions: number }[];
}

/* ═══════════════════════════════════════════════════════════════
   CHART TAG PARSER
   ═══════════════════════════════════════════════════════════════ */

export type Segment =
    | { type: 'text'; content: string }
    | { type: 'chart'; tag: string; payload?: string };

const CHART_TAG_RE = /<!--\s*chart:(\w+)(?::([^-][^>]*?))?\s*-->/g;

/**
 * Split markdown content on `<!-- chart:xxx -->` tags.
 * Returns interleaved text and chart segments.
 * Handles incomplete tags during streaming by hiding them.
 */
export function splitContentOnChartTags(content: string): Segment[] {
    if (!content) return [];

    // Check for incomplete chart tag at end (streaming)
    const incompleteIdx = content.lastIndexOf('<!--');
    const hasComplete = incompleteIdx >= 0 && content.indexOf('-->', incompleteIdx) >= 0;
    let safeContent = content;
    if (incompleteIdx >= 0 && !hasComplete) {
        // Hide the partial tag while streaming
        safeContent = content.slice(0, incompleteIdx);
    }

    const segments: Segment[] = [];
    let lastIndex = 0;

    for (const match of safeContent.matchAll(CHART_TAG_RE)) {
        const before = safeContent.slice(lastIndex, match.index);
        if (before.trim()) {
            segments.push({ type: 'text', content: before });
        }
        segments.push({
            type: 'chart',
            tag: match[1],
            payload: match[2]?.trim() || undefined,
        });
        lastIndex = match.index! + match[0].length;
    }

    const remaining = safeContent.slice(lastIndex);
    if (remaining.trim()) {
        segments.push({ type: 'text', content: remaining });
    }

    return segments.length > 0 ? segments : [{ type: 'text', content: safeContent }];
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: filter striking distance keywords
   ═══════════════════════════════════════════════════════════════ */

function filterStrikingDistance(queries: any[]): any[] {
    return queries
        .filter(q => q.position >= 11 && q.position <= 20 && (q.impressions || 0) > 20)
        .sort((a, b) => a.position - b.position)
        .slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════
   INLINE CHART RENDERERS (Type 2 — JSON payload tags)
   ═══════════════════════════════════════════════════════════════ */

function normalizeRows(rows: any[]): any[] {
    return rows.map(r => ({
        ...r,
        ctr: r.ctr > 1 ? parseFloat(r.ctr.toFixed(1)) : parseFloat((r.ctr * 100).toFixed(1)),
        position: parseFloat((r.position || 0).toFixed(1)),
    }));
}

function renderInlineChart(payload: string): ReactNode {
    try {
        const parsed = JSON.parse(payload);
        if (!parsed?.rows?.length) return null;
        const rows = normalizeRows(parsed.rows);

        if (parsed.type === 'keywords' || parsed.type === 'queries') {
            return <HorizontalBarChart rows={rows} dimKey="query" title={parsed.title || 'Keywords'} />;
        }
        if (parsed.type === 'pages') {
            return <HorizontalBarChart rows={rows} dimKey="page" title={parsed.title || 'Pages'} />;
        }
        // Fallback: try to detect
        if (rows[0]?.query) return <HorizontalBarChart rows={rows} dimKey="query" title={parsed.title} />;
        if (rows[0]?.page) return <HorizontalBarChart rows={rows} dimKey="page" title={parsed.title} />;
        return null;
    } catch {
        return null;
    }
}

/* ═══════════════════════════════════════════════════════════════
   SNAPSHOT CHART RENDERERS (Type 1 — named tags)
   ═══════════════════════════════════════════════════════════════ */

const SNAPSHOT_RENDERERS: Record<string, (snapshot: DashboardSnapshot) => ReactNode> = {
    overview: (s) => <OverviewMetricCards data={s.kpis} />,
    topKeywords: (s) => s.topQueries?.length ? <HorizontalBarChart rows={s.topQueries} dimKey="query" title="Top Keywords by Clicks" /> : null,
    topPages: (s) => s.topPages?.length ? <HorizontalBarChart rows={s.topPages} dimKey="page" title="Top Pages by Clicks" /> : null,
    ctrOpportunities: (s) => s.topQueries?.length ? <CtrOpportunityList rows={s.topQueries} /> : null,
    strikingDistance: (s) => {
        const sd = filterStrikingDistance(s.topQueries || []);
        return sd.length ? <HorizontalBarChart rows={sd} dimKey="query" title="Striking Distance Keywords (Pos 11-20)" /> : null;
    },
    positionDistribution: (s) => s.topQueries?.length ? <PositionDistributionChart rows={s.topQueries} /> : null,
    trafficTrend: (s) => s.dateTrend?.length ? <TrendLineChart rows={s.dateTrend} /> : null,
    deviceSplit: (s) => s.devices?.length ? <DeviceDonutChart rows={s.devices} /> : null,
    countries: (s) => s.countries?.length ? <CountryBarChart rows={s.countries} /> : null,
};

/**
 * Render a single snapshot chart by tag name.
 */
export function renderSnapshotChart(tag: string, snapshot: DashboardSnapshot, payload?: string): ReactNode {
    // Inline chart with JSON payload
    if (tag === 'inline' && payload) {
        return renderInlineChart(payload);
    }

    const renderer = SNAPSHOT_RENDERERS[tag];
    if (!renderer) return null;
    return renderer(snapshot);
}
