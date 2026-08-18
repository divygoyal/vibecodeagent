// Shared alert computation engine — used by Intelligence page and /api/alerts

export interface AlertItem {
    id: string;
    type: 'traffic_drop' | 'traffic_spike' | 'ranking_loss' | 'ranking_gain' | 'content_decay' |
    'ctr_problem' | 'opportunity' | 'new_keyword' | 'position_change';
    severity: 'critical' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    metric?: string;
    change?: number;
    timestamp: string;
    category: 'traffic' | 'rankings' | 'content' | 'opportunities';
}

export interface OpportunityItem {
    query: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
    potentialClicks: number;
    type: 'striking_distance' | 'ctr_fix' | 'quick_win' | 'rising';
}

/** Expected CTR by position (industry average) */
export const expectedCTR = (pos: number): number => {
    if (pos <= 1) return 31.7;
    if (pos <= 2) return 24.7;
    if (pos <= 3) return 18.7;
    if (pos <= 4) return 13.6;
    if (pos <= 5) return 9.5;
    if (pos <= 6) return 6.2;
    if (pos <= 7) return 4.2;
    if (pos <= 8) return 3.1;
    if (pos <= 9) return 2.6;
    if (pos <= 10) return 2.4;
    return 1.0;
};

/** Compute alerts from raw SEO + Analytics data */
export function computeAlerts(seoData: any, analyticsData: any): AlertItem[] {
    const alerts: AlertItem[] = [];
    const now = new Date().toISOString();
    let id = 0;

    if (!seoData) return alerts;

    const kpis = seoData.kpis;
    const queries = seoData.queries || [];
    const pages = seoData.pages || [];
    const trend = seoData.trend || [];

    // ── Traffic Alerts ──
    if (kpis) {
        if (kpis.changeClicks < -20) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: kpis.changeClicks < -40 ? 'critical' : 'warning',
                title: `Traffic dropped ${Math.abs(kpis.changeClicks)}%`,
                description: `Your clicks declined from the previous period. ${kpis.changeClicks < -40 ? 'This is a significant drop that needs immediate attention.' : 'Monitor this trend closely.'}`,
                metric: `${kpis.totalClicks.toLocaleString()} clicks`, change: kpis.changeClicks,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changeClicks > 20) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_spike', severity: 'success',
                title: `Traffic surged +${kpis.changeClicks}%`,
                description: `Great news! Your clicks increased significantly. Identify what's working and double down.`,
                metric: `${kpis.totalClicks.toLocaleString()} clicks`, change: kpis.changeClicks,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changeImpressions < -25) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: 'warning',
                title: `Impressions dropped ${Math.abs(kpis.changeImpressions)}%`,
                description: `Your visibility in search results is declining. This could indicate ranking losses or seasonal trends.`,
                metric: `${kpis.totalImpressions.toLocaleString()} impressions`, change: kpis.changeImpressions,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changePosition > 2) {
            alerts.push({
                id: `alert-${id++}`, type: 'ranking_loss', severity: 'warning',
                title: `Avg. position worsened by ${kpis.changePosition.toFixed(1)} spots`,
                description: `Your overall ranking position dropped. Check individual keywords to identify the cause.`,
                metric: `Position ${kpis.avgPosition}`, change: kpis.changePosition,
                timestamp: now, category: 'rankings',
            });
        }
        if (kpis.changePosition < -2) {
            alerts.push({
                id: `alert-${id++}`, type: 'ranking_gain', severity: 'success',
                title: `Rankings improved by ${Math.abs(kpis.changePosition).toFixed(1)} positions`,
                description: `Your overall position in search results improved. Your SEO efforts are paying off!`,
                metric: `Position ${kpis.avgPosition}`, change: kpis.changePosition,
                timestamp: now, category: 'rankings',
            });
        }
    }

    // ── Content Decay ──
    const decayingPages = pages.filter((p: any) => (p.status === 'decay' || p.position > 20) && p.impressions > 50);
    if (decayingPages.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'content_decay', severity: decayingPages.length > 5 ? 'critical' : 'warning',
            title: `${decayingPages.length} page${decayingPages.length > 1 ? 's' : ''} showing content decay`,
            description: `These pages are losing rankings and visibility. Refresh content, update information, and add internal links to recover.`,
            metric: `${decayingPages.length} pages affected`,
            timestamp: now, category: 'content',
        });
    }

    // ── CTR Problems ──
    const ctrProblems = queries.filter((q: any) => {
        const expected = expectedCTR(q.position);
        return q.position <= 10 && q.ctr < expected * 0.5 && q.impressions > 100;
    });
    if (ctrProblems.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'ctr_problem', severity: 'warning',
            title: `${ctrProblems.length} keyword${ctrProblems.length > 1 ? 's' : ''} with below-average CTR`,
            description: `These keywords rank well but get fewer clicks than expected. Rewriting meta titles and descriptions could significantly boost traffic.`,
            metric: `${ctrProblems.length} keywords affected`,
            timestamp: now, category: 'content',
        });
    }

    // ── Striking Distance Opportunities ──
    const strikingDistance = queries.filter((q: any) => q.position > 3 && q.position <= 20 && q.impressions > 50);
    if (strikingDistance.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'opportunity', severity: 'info',
            title: `${strikingDistance.length} keywords within striking distance`,
            description: `These keywords are on the edge of page 1. A small content boost, more internal links, or better meta tags could push them to top positions.`,
            metric: `${strikingDistance.length} keywords (pos 4-20)`,
            timestamp: now, category: 'opportunities',
        });
    }

    // ── Quick Wins ──
    const quickWins = queries.filter((q: any) => q.position > 10 && q.position <= 15 && q.impressions > 200);
    if (quickWins.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'new_keyword', severity: 'info',
            title: `${quickWins.length} quick-win keyword${quickWins.length > 1 ? 's' : ''} detected`,
            description: `These keywords have high impressions but sit just below page 1. They're the easiest wins to capture more organic traffic.`,
            metric: `Position 11-15, ${quickWins.reduce((sum: number, q: any) => sum + q.impressions, 0).toLocaleString()} impressions`,
            timestamp: now, category: 'opportunities',
        });
    }

    // ── Traffic Trend analysis ──
    if (trend.length >= 14) {
        const last7 = trend.slice(-7);
        const prev7 = trend.slice(-14, -7);
        const avgLast = last7.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0) / 7;
        const avgPrev = prev7.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0) / 7;
        if (avgPrev > 0 && avgLast < avgPrev * 0.7) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: 'critical',
                title: `Week-over-week traffic declined ${Math.round((1 - avgLast / avgPrev) * 100)}%`,
                description: `The last 7 days show significantly less traffic than the previous week. Check for algorithm updates, technical issues, or seasonal patterns.`,
                metric: `${Math.round(avgLast)} avg daily clicks (was ${Math.round(avgPrev)})`,
                change: -Math.round((1 - avgLast / avgPrev) * 100),
                timestamp: now, category: 'traffic',
            });
        }
    }

    // Sort: critical first, then warning, info, success
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/** Compute opportunity items from SEO data */
export function computeOpportunities(seoData: any): OpportunityItem[] {
    const queries = seoData?.queries || [];
    const opps: OpportunityItem[] = [];

    for (const q of queries) {
        const expected = expectedCTR(q.position);
        const potentialClicks = Math.round((expected / 100) * q.impressions);

        if (q.position > 3 && q.position <= 10 && q.impressions > 50) {
            opps.push({ ...q, potentialClicks, type: 'striking_distance' as const });
        } else if (q.position <= 5 && q.ctr < expected * 0.5 && q.impressions > 100) {
            opps.push({ ...q, potentialClicks, type: 'ctr_fix' as const });
        } else if (q.position > 10 && q.position <= 15 && q.impressions > 200) {
            opps.push({ ...q, potentialClicks, type: 'quick_win' as const });
        }
    }

    return opps.sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, 20);
}
