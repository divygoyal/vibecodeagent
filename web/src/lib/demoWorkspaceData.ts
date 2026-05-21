import type { FunnelDefinition, FunnelSuggestion, GoalDefinition, GoalSuggestion } from '@/lib/analyticsDefinitions';
import type { AuditReport } from '@/lib/siteAudit';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';

type OverviewInterval = 'hour' | 'day' | 'week' | 'month';
const DEMO_ANALYTICS_SCALE = 13;

function hashSeed(input: string) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed: string) {
    let state = hashSeed(seed) || 1;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function toIsoDate(date: Date) {
    return date.toISOString().split('T')[0];
}

function buildDateSeries(count: number, interval: OverviewInterval, seed: string) {
    const random = createSeededRandom(seed);
    const today = new Date('2026-04-20T00:00:00.000Z');
    const series: string[] = [];

    for (let index = count - 1; index >= 0; index -= 1) {
        const cursor = new Date(today);
        if (interval === 'hour') {
            cursor.setUTCHours(today.getUTCHours() - index);
            series.push(`${cursor.getUTCHours().toString().padStart(2, '0')}:00`);
        } else if (interval === 'week') {
            cursor.setUTCDate(today.getUTCDate() - index * 7);
            series.push(toIsoDate(cursor));
        } else if (interval === 'month') {
            cursor.setUTCMonth(today.getUTCMonth() - index);
            series.push(`${cursor.getUTCFullYear()}-${(cursor.getUTCMonth() + 1).toString().padStart(2, '0')}-01`);
        } else {
            cursor.setUTCDate(today.getUTCDate() - index);
            series.push(toIsoDate(cursor));
        }

        random();
    }

    return series;
}

function buildMetricDelta(current: number, ratio: number) {
    return Math.round(current / ratio);
}

function scaleDemoCount(value: number, scale = DEMO_ANALYTICS_SCALE) {
    return Math.round(value * scale);
}

function buildAnalyticsTraffic(range = '30d') {
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '60d' ? 60 : range === '90d' ? 90 : 30;
    const dates = buildDateSeries(days, 'day', `traffic:${range}`);
    const random = createSeededRandom(`traffic-values:${range}`);

    return dates.map((date, index) => {
        const baseline = 4300 + index * 42;
        const wave = Math.sin(index / 4) * 580;
        const activeUsers = Math.round(baseline + wave + random() * 220);
        const sessions = Math.round(activeUsers * 1.23 + random() * 340);
        const pageViews = Math.round(sessions * 2.38 + random() * 760);
        return {
            date,
            activeUsers,
            sessions,
            pageViews,
            bounceRate: +(34 + (index % 5) * 1.1 + random() * 2).toFixed(1),
            avgSessionDuration: Math.round(156 + (index % 6) * 8 + random() * 18),
        };
    });
}

const ANALYTICS_SOURCES = [
    { source: 'Google / Organic', sessions: 5284, percentage: 44.2 },
    { source: 'Direct', sessions: 2210, percentage: 18.5 },
    { source: 'Reddit / Social', sessions: 1455, percentage: 12.2 },
    { source: 'X / Social', sessions: 1188, percentage: 9.9 },
    { source: 'GitHub / Referral', sessions: 874, percentage: 7.3 },
    { source: 'Newsletter / Email', sessions: 542, percentage: 4.5 },
    { source: 'Other', sessions: 401, percentage: 3.4 },
].map((item) => ({ ...item, sessions: scaleDemoCount(item.sessions) }));

const ANALYTICS_PAGES = [
    { page: '/', title: 'Homepage', views: 9144, uniqueViews: 6720, avgTime: '2:42', bounceRate: 31.2 },
    { page: '/features', title: 'Features', views: 3684, uniqueViews: 2834, avgTime: '3:14', bounceRate: 26.8 },
    { page: '/pricing', title: 'Pricing', views: 2942, uniqueViews: 2441, avgTime: '1:58', bounceRate: 39.4 },
    { page: '/docs/getting-started', title: 'Getting Started', views: 2288, uniqueViews: 1821, avgTime: '4:31', bounceRate: 18.1 },
    { page: '/blog/seo-automation', title: 'SEO Automation Guide', views: 1874, uniqueViews: 1522, avgTime: '5:12', bounceRate: 16.4 },
    { page: '/blog/reddit-mentions', title: 'Reddit Mentions Playbook', views: 1413, uniqueViews: 1210, avgTime: '4:03', bounceRate: 20.8 },
    { page: '/globe', title: 'Live Globe', views: 1142, uniqueViews: 908, avgTime: '2:24', bounceRate: 28.5 },
    { page: '/contact', title: 'Contact', views: 482, uniqueViews: 410, avgTime: '1:08', bounceRate: 48.6 },
    { page: '/x', title: 'X Mentions', views: 1264, uniqueViews: 1028, avgTime: '3:28', bounceRate: 22.1 },
    { page: '/reddit', title: 'Reddit Mentions', views: 1188, uniqueViews: 974, avgTime: '3:46', bounceRate: 21.4 },
    { page: '/tools/comparison-builder', title: 'Comparison Builder', views: 962, uniqueViews: 804, avgTime: '4:12', bounceRate: 19.6 },
    { page: '/blog/google-analytics-alternative', title: 'GA Alternative Guide', views: 836, uniqueViews: 712, avgTime: '4:48', bounceRate: 18.8 },
].map((item) => ({
    ...item,
    views: scaleDemoCount(item.views),
    uniqueViews: scaleDemoCount(item.uniqueViews),
}));

const ANALYTICS_DEVICES = [
    { device: 'Desktop', sessions: 7028, percentage: 58.8 },
    { device: 'Mobile', sessions: 3982, percentage: 33.3 },
    { device: 'Tablet', sessions: 936, percentage: 7.9 },
].map((item) => ({ ...item, sessions: scaleDemoCount(item.sessions) }));

const ANALYTICS_COUNTRIES = [
    { country: 'United States', users: 3921, percentage: 32.8 },
    { country: 'India', users: 2168, percentage: 18.1 },
    { country: 'United Kingdom', users: 1189, percentage: 9.9 },
    { country: 'Germany', users: 846, percentage: 7.1 },
    { country: 'Canada', users: 782, percentage: 6.5 },
    { country: 'Australia', users: 614, percentage: 5.1 },
    { country: 'Brazil', users: 498, percentage: 4.2 },
    { country: 'Singapore', users: 421, percentage: 3.5 },
    { country: 'Netherlands', users: 388, percentage: 3.2 },
    { country: 'France', users: 346, percentage: 2.9 },
    { country: 'United Arab Emirates', users: 274, percentage: 2.3 },
    { country: 'Other', users: 1936, percentage: 16.3 },
].map((item) => ({ ...item, users: scaleDemoCount(item.users) }));

const ANALYTICS_BROWSERS = [
    { name: 'Chrome', value: 6980, users: 6120, percentage: 58.4 },
    { name: 'Safari', value: 2410, users: 2168, percentage: 20.1 },
    { name: 'Firefox', value: 932, users: 810, percentage: 7.8 },
    { name: 'Edge', value: 650, users: 590, percentage: 5.4 },
    { name: 'Brave', value: 520, users: 472, percentage: 4.4 },
    { name: 'Instagram', value: 482, users: 430, percentage: 4.0 },
    { name: 'Samsung Internet', value: 196, users: 170, percentage: 1.6 },
    { name: 'Opera', value: 142, users: 126, percentage: 1.2 },
].map((item) => ({
    ...item,
    value: scaleDemoCount(item.value),
    users: scaleDemoCount(item.users),
}));

const ANALYTICS_OPERATING_SYSTEMS = [
    { name: 'Windows', value: 4460, users: 4020, percentage: 37.3 },
    { name: 'macOS', value: 2690, users: 2418, percentage: 22.5 },
    { name: 'iOS', value: 1882, users: 1741, percentage: 15.7 },
    { name: 'Android', value: 1644, users: 1498, percentage: 13.7 },
    { name: 'Linux', value: 812, users: 730, percentage: 6.8 },
    { name: 'Chrome OS', value: 188, users: 165, percentage: 1.6 },
].map((item) => ({
    ...item,
    value: scaleDemoCount(item.value),
    users: scaleDemoCount(item.users),
}));

const ANALYTICS_CHANNELS = [
    { name: 'Organic Search', value: 4821, users: 4210, percentage: 40.4 },
    { name: 'Direct', value: 2310, users: 2080, percentage: 19.3 },
    { name: 'Referral', value: 1522, users: 1384, percentage: 12.7 },
    { name: 'Social', value: 1461, users: 1338, percentage: 12.2 },
    { name: 'Email', value: 644, users: 582, percentage: 5.4 },
    { name: 'Paid Search', value: 421, users: 386, percentage: 3.5 },
    { name: 'Display', value: 275, users: 248, percentage: 2.3 },
    { name: 'Affiliates', value: 209, users: 194, percentage: 1.7 },
].map((item) => ({
    ...item,
    value: scaleDemoCount(item.value),
    users: scaleDemoCount(item.users),
}));

const ANALYTICS_REFERRERS = [
    { name: 'google.com', value: 4821, users: 4210, percentage: 40.4 },
    { name: '(direct)', value: 2310, users: 2080, percentage: 19.3 },
    { name: 'reddit.com', value: 1042, users: 950, percentage: 8.7 },
    { name: 'x.com', value: 936, users: 850, percentage: 7.8 },
    { name: 'github.com', value: 710, users: 648, percentage: 5.9 },
    { name: 'linkedin.com', value: 464, users: 418, percentage: 3.9 },
    { name: 'youtube.com', value: 280, users: 252, percentage: 2.3 },
    { name: 'news.ycombinator.com', value: 122, users: 108, percentage: 1.0 },
    { name: 'indiehackers.com', value: 116, users: 104, percentage: 1.0 },
    { name: 'producthunt.com', value: 102, users: 92, percentage: 0.8 },
    { name: 't.co', value: 94, users: 86, percentage: 0.7 },
].map((item) => ({
    ...item,
    value: scaleDemoCount(item.value),
    users: scaleDemoCount(item.users),
}));

const ANALYTICS_CITIES = [
    { city: 'New York', country: 'United States', users: 894 },
    { city: 'San Francisco', country: 'United States', users: 731 },
    { city: 'London', country: 'United Kingdom', users: 664 },
    { city: 'Bengaluru', country: 'India', users: 642 },
    { city: 'Toronto', country: 'Canada', users: 411 },
    { city: 'Berlin', country: 'Germany', users: 387 },
    { city: 'Sydney', country: 'Australia', users: 295 },
    { city: 'São Paulo', country: 'Brazil', users: 248 },
].map((item) => ({ ...item, users: scaleDemoCount(item.users) }));

const ANALYTICS_REGIONS = [
    { region: 'California', country: 'United States', users: 1560 },
    { region: 'England', country: 'United Kingdom', users: 1184 },
    { region: 'Karnataka', country: 'India', users: 968 },
    { region: 'New York', country: 'United States', users: 882 },
    { region: 'Ontario', country: 'Canada', users: 632 },
    { region: 'Bavaria', country: 'Germany', users: 421 },
].map((item) => ({ ...item, users: scaleDemoCount(item.users) }));

const ANALYTICS_ENTRY_PAGES = [
    { page: '/', sessions: 8012, users: 6954, bounceRate: 31.8, percentage: 41.7 },
    { page: '/pricing', sessions: 1242, users: 1084, bounceRate: 38.1, percentage: 6.5 },
    { page: '/features', sessions: 981, users: 844, bounceRate: 26.8, percentage: 5.1 },
    { page: '/blog/reddit-mentions', sessions: 876, users: 792, bounceRate: 19.4, percentage: 4.6 },
    { page: '/docs/getting-started', sessions: 664, users: 590, bounceRate: 16.2, percentage: 3.5 },
].map((item) => ({
    ...item,
    sessions: scaleDemoCount(item.sessions),
    users: scaleDemoCount(item.users),
}));

const ANALYTICS_LANGUAGES = [
    { name: 'English', value: 6918, users: 6240, percentage: 57.7 },
    { name: 'Hindi', value: 1542, users: 1398, percentage: 12.9 },
    { name: 'German', value: 792, users: 716, percentage: 6.6 },
    { name: 'Portuguese', value: 610, users: 546, percentage: 5.1 },
    { name: 'French', value: 542, users: 491, percentage: 4.5 },
    { name: 'Japanese', value: 324, users: 286, percentage: 2.7 },
].map((item) => ({
    ...item,
    value: scaleDemoCount(item.value),
    users: scaleDemoCount(item.users),
}));

export function getDemoAnalyticsDashboard(section = 'all', range = '30d') {
    const traffic = buildAnalyticsTraffic(range);
    const result: Record<string, unknown> = {};
    const totalUsers = traffic.reduce((sum, point) => sum + point.activeUsers, 0);
    const totalSessions = traffic.reduce((sum, point) => sum + point.sessions, 0);
    const totalPageViews = traffic.reduce((sum, point) => sum + point.pageViews, 0);

    if (section === 'all' || section === 'kpis') {
        result.kpis = {
            totalUsers,
            totalSessions,
            totalPageViews,
            avgBounceRate: 34.8,
            avgSessionDuration: 184,
            newUsers: Math.round(totalUsers * 0.58),
            returningUsers: Math.round(totalUsers * 0.42),
            pagesPerSession: +(totalPageViews / Math.max(totalSessions, 1)).toFixed(2),
            changeUsers: 12.8,
            changeSessions: 9.4,
            changePageViews: 15.1,
            changeBounceRate: -2.8,
        };
    }
    if (section === 'all' || section === 'traffic') result.traffic = traffic;
    if (section === 'all' || section === 'sources') result.sources = ANALYTICS_SOURCES;
    if (section === 'all' || section === 'pages') result.pages = ANALYTICS_PAGES;
    if (section === 'all' || section === 'devices') result.devices = ANALYTICS_DEVICES;
    if (section === 'all' || section === 'countries') result.countries = ANALYTICS_COUNTRIES;
    if (section === 'all' || section === 'browsers') result.browsers = ANALYTICS_BROWSERS;
    if (section === 'all' || section === 'os') result.operatingSystems = ANALYTICS_OPERATING_SYSTEMS;
    if (section === 'all' || section === 'channels') result.channels = ANALYTICS_CHANNELS;
    if (section === 'all' || section === 'referrers') result.referrers = ANALYTICS_REFERRERS;
    if (section === 'all' || section === 'cities') result.cities = ANALYTICS_CITIES;
    if (section === 'all' || section === 'regions') result.regions = ANALYTICS_REGIONS;
    if (section === 'all' || section === 'entryPages') result.entryPages = ANALYTICS_ENTRY_PAGES;
    if (section === 'all' || section === 'languages') result.languages = ANALYTICS_LANGUAGES;
    return result;
}

function buildSeoTrend(range = '30d') {
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '60d' ? 60 : 30;
    const dates = buildDateSeries(days, 'day', `seo-trend:${range}`);
    const random = createSeededRandom(`seo-trend-values:${range}`);
    return dates.map((date, index) => ({
        date,
        clicks: Math.round(260 + index * 3 + Math.sin(index / 5) * 34 + random() * 18),
        impressions: Math.round(3700 + index * 29 + Math.sin(index / 4) * 320 + random() * 120),
        ctr: +(6.4 + Math.sin(index / 6) * 0.7 + random() * 0.4).toFixed(1),
        position: +(6.2 - Math.sin(index / 7) * 0.3 + random() * 0.2).toFixed(1),
    }));
}

const SEO_QUERIES = [
    { query: 'antigravity analytics alternative', clicks: 902, impressions: 12400, ctr: 7.3, position: 3.4, changeClicks: 16.2, changePosition: -0.5 },
    { query: 'reddit mentions widget', clicks: 644, impressions: 9022, ctr: 7.1, position: 4.2, changeClicks: 12.1, changePosition: -0.4 },
    { query: 'x mentions embed', clicks: 588, impressions: 8410, ctr: 7.0, position: 4.8, changeClicks: 14.8, changePosition: -0.6 },
    { query: 'ga4 alternative for startups', clicks: 421, impressions: 6540, ctr: 6.4, position: 5.7, changeClicks: 11.4, changePosition: -0.2 },
    { query: 'seo audit dashboard', clicks: 302, impressions: 4760, ctr: 6.3, position: 6.4, changeClicks: 8.2, changePosition: -0.1 },
] as const;

const SEO_PAGES = [
    { page: '/', clicks: 2142, impressions: 28100, ctr: 7.6, position: 3.1, status: 'healthy', changeClicks: 18.1, changePosition: -0.6 },
    { page: '/pricing', clicks: 1214, impressions: 15400, ctr: 7.9, position: 4.3, status: 'healthy', changeClicks: 12.8, changePosition: -0.4 },
    { page: '/features', clicks: 932, impressions: 12600, ctr: 7.4, position: 4.9, status: 'healthy', changeClicks: 10.1, changePosition: -0.3 },
    { page: '/blog/reddit-mentions', clicks: 702, impressions: 8900, ctr: 7.9, position: 5.2, status: 'warning', changeClicks: 7.4, changePosition: 0.2 },
    { page: '/docs/getting-started', clicks: 482, impressions: 6410, ctr: 7.5, position: 5.8, status: 'healthy', changeClicks: 9.1, changePosition: -0.2 },
] as const;

const SEO_RECOMMENDATIONS = [
    {
        id: 'seo-demo-1',
        type: 'content_decay',
        severity: 'high',
        title: 'Refresh /blog/reddit-mentions',
        description: 'This page is still ranking, but CTR slipped while impressions climbed.',
        action: 'Rewrite the title and intro to match real-time monitoring intent.',
        impact: '+180 clicks/month',
        page: '/blog/reddit-mentions',
    },
    {
        id: 'seo-demo-2',
        type: 'opportunity',
        severity: 'medium',
        title: 'Build a dedicated page for "x mentions embed"',
        description: 'The query already converts well, but the current page is generic.',
        action: 'Create a focused landing page and add internal links from homepage + pricing.',
        impact: '+260 clicks/month',
        page: null,
    },
    {
        id: 'seo-demo-3',
        type: 'technical',
        severity: 'low',
        title: 'Compress above-the-fold screenshots',
        description: 'Hero and demo screenshots are contributing to slower page speed on mobile.',
        action: 'Serve smaller AVIF/WebP variants and lazy-load below-the-fold media.',
        impact: '+0.2s faster LCP',
        page: '/',
    },
] as const;

export function getDemoSeoDashboard(section = 'all', range = '30d') {
    const trend = buildSeoTrend(range);
    const result: Record<string, unknown> = {};

    if (section === 'all' || section === 'kpis') {
        result.kpis = {
            totalClicks: 10912,
            totalImpressions: 151884,
            avgCTR: 7.2,
            avgPosition: 5.8,
            indexedPages: 58,
            crawlErrors: 2,
            changeClicks: 15.4,
            changeImpressions: 11.2,
            changeCTR: 1.1,
            changePosition: -0.6,
        };
    }
    if (section === 'all' || section === 'queries') result.queries = SEO_QUERIES;
    if (section === 'all' || section === 'pages') result.pages = SEO_PAGES;
    if (section === 'all' || section === 'recommendations') result.recommendations = SEO_RECOMMENDATIONS;
    if (section === 'all' || section === 'trend') result.trend = trend;
    if (section === 'all') {
        result.queries = SEO_QUERIES;
        result.pages = SEO_PAGES;
        result.recommendations = SEO_RECOMMENDATIONS;
        result.trend = trend;
    }
    return result;
}

export function getDemoRealtimeData() {
    return {
        activeUsers: 18,
        byCountry: [
            { country: 'United States', users: 6 },
            { country: 'India', users: 4 },
            { country: 'United Kingdom', users: 3 },
            { country: 'Germany', users: 2 },
            { country: 'Canada', users: 2 },
            { country: 'Australia', users: 1 },
        ],
        byCity: [
            { city: 'New York', country: 'United States', users: 3 },
            { city: 'San Francisco', country: 'United States', users: 3 },
            { city: 'Bengaluru', country: 'India', users: 2 },
            { city: 'Mumbai', country: 'India', users: 2 },
            { city: 'London', country: 'United Kingdom', users: 3 },
            { city: 'Berlin', country: 'Germany', users: 2 },
            { city: 'Toronto', country: 'Canada', users: 2 },
            { city: 'Sydney', country: 'Australia', users: 1 },
        ],
        byDevice: [
            { device: 'desktop', users: 10 },
            { device: 'mobile', users: 6 },
            { device: 'tablet', users: 2 },
        ],
        byPage: [
            { page: '/', users: 7 },
            { page: '/pricing', users: 4 },
            { page: '/features', users: 3 },
            { page: '/blog/reddit-mentions', users: 2 },
            { page: '/docs/getting-started', users: 2 },
        ],
    };
}

export function getDemoOverviewStats(range = '30d', interval: OverviewInterval = 'day') {
    const pointCount = interval === 'hour' ? 24 : interval === 'week' ? 8 : interval === 'month' ? 6 : range === '7d' ? 7 : range === '14d' ? 14 : 30;
    const dates = buildDateSeries(pointCount, interval, `overview-stats:${range}:${interval}`);
    const random = createSeededRandom(`overview-stats-values:${range}:${interval}`);

    const series = dates.map((date, index) => {
        const unique_visitors = Math.round(12800 + index * 240 + Math.sin(index / 3) * 1850 + random() * 540);
        const total_sessions = Math.round(unique_visitors * 1.24 + random() * 920);
        const total_screen_views = Math.round(total_sessions * 2.41 + random() * 2800);
        const new_users = Math.round(unique_visitors * 0.59 + random() * 260);
        const bounce_rate = +(34 - Math.sin(index / 4) * 2 + random() * 1.2).toFixed(1);
        const avg_session_duration = Math.round(176 + Math.sin(index / 5) * 12 + random() * 8);
        const views_per_session = +(total_screen_views / Math.max(total_sessions, 1)).toFixed(2);
        return {
            date,
            unique_visitors,
            prev_unique_visitors: buildMetricDelta(unique_visitors, 1.11),
            total_sessions,
            prev_total_sessions: buildMetricDelta(total_sessions, 1.09),
            total_screen_views,
            prev_total_screen_views: buildMetricDelta(total_screen_views, 1.13),
            new_users,
            prev_new_users: buildMetricDelta(new_users, 1.08),
            bounce_rate,
            prev_bounce_rate: +(bounce_rate + 2.4).toFixed(1),
            avg_session_duration,
            prev_avg_session_duration: Math.max(0, avg_session_duration - 12),
            views_per_session,
            prev_views_per_session: +(Math.max(1, views_per_session - 0.18)).toFixed(2),
            total_revenue: +(unique_visitors * 14.8).toFixed(2),
            prev_total_revenue: +(unique_visitors * 12.6).toFixed(2),
        };
    });

    const latest = series[series.length - 1];
    return {
        metrics: {
            unique_visitors: latest.unique_visitors,
            prev_unique_visitors: latest.prev_unique_visitors,
            total_sessions: latest.total_sessions,
            prev_total_sessions: latest.prev_total_sessions,
            total_screen_views: latest.total_screen_views,
            prev_total_screen_views: latest.prev_total_screen_views,
            new_users: latest.new_users,
            prev_new_users: latest.prev_new_users,
            bounce_rate: latest.bounce_rate,
            prev_bounce_rate: latest.prev_bounce_rate,
            avg_session_duration: latest.avg_session_duration,
            prev_avg_session_duration: latest.prev_avg_session_duration,
            views_per_session: latest.views_per_session,
            prev_views_per_session: latest.prev_views_per_session,
            total_revenue: latest.total_revenue,
            prev_total_revenue: latest.prev_total_revenue,
        },
        series,
    };
}

const TOP_GENERIC_LABELS: Record<string, string> = {
    referrer_name: 'Referrers',
    referrer: 'URLs',
    referrer_type: 'Types',
    utm_source: 'Source',
    utm_medium: 'Medium',
    utm_campaign: 'Campaign',
    utm_term: 'Term',
    utm_content: 'Content',
    device: 'Device',
    browser: 'Browser',
    browser_version: 'Browser Version',
    os: 'OS',
    os_version: 'OS Version',
    brand: 'Brand',
    model: 'Model',
    country: 'Country',
    region: 'Region',
    city: 'City',
} as const;

const TOP_GENERIC_ITEMS: Record<string, Array<{ name: string; prefix?: string; sessions: number; pageviews: number }>> = {
    referrer_name: [
        { name: 'google.com', sessions: scaleDemoCount(2480), pageviews: scaleDemoCount(5690) },
        { name: 'reddit.com', sessions: scaleDemoCount(1180), pageviews: scaleDemoCount(2760) },
        { name: 'x.com', sessions: scaleDemoCount(940), pageviews: scaleDemoCount(2040) },
        { name: 'github.com', sessions: scaleDemoCount(620), pageviews: scaleDemoCount(1530) },
        { name: 'linkedin.com', sessions: scaleDemoCount(410), pageviews: scaleDemoCount(980) },
        { name: 'youtube.com', sessions: scaleDemoCount(320), pageviews: scaleDemoCount(770) },
        { name: 'indiehackers.com', sessions: scaleDemoCount(240), pageviews: scaleDemoCount(620) },
        { name: 'producthunt.com', sessions: scaleDemoCount(180), pageviews: scaleDemoCount(480) },
    ],
    device: [
        { name: 'desktop', sessions: scaleDemoCount(4210), pageviews: scaleDemoCount(9780) },
        { name: 'mobile', sessions: scaleDemoCount(2760), pageviews: scaleDemoCount(6240) },
        { name: 'tablet', sessions: scaleDemoCount(510), pageviews: scaleDemoCount(1180) },
    ],
    browser: [
        { name: 'Chrome', sessions: scaleDemoCount(3980), pageviews: scaleDemoCount(9020) },
        { name: 'Safari', sessions: scaleDemoCount(2140), pageviews: scaleDemoCount(4680) },
        { name: 'Firefox', sessions: scaleDemoCount(760), pageviews: scaleDemoCount(1660) },
        { name: 'Edge', sessions: scaleDemoCount(610), pageviews: scaleDemoCount(1420) },
        { name: 'Brave', sessions: scaleDemoCount(420), pageviews: scaleDemoCount(980) },
        { name: 'Samsung Internet', sessions: scaleDemoCount(180), pageviews: scaleDemoCount(430) },
    ],
    country: [
        { name: 'United States', sessions: scaleDemoCount(2950), pageviews: scaleDemoCount(6540) },
        { name: 'India', sessions: scaleDemoCount(1820), pageviews: scaleDemoCount(4120) },
        { name: 'United Kingdom', sessions: scaleDemoCount(920), pageviews: scaleDemoCount(2030) },
        { name: 'Germany', sessions: scaleDemoCount(610), pageviews: scaleDemoCount(1450) },
        { name: 'Canada', sessions: scaleDemoCount(540), pageviews: scaleDemoCount(1220) },
        { name: 'Australia', sessions: scaleDemoCount(420), pageviews: scaleDemoCount(980) },
        { name: 'Singapore', sessions: scaleDemoCount(310), pageviews: scaleDemoCount(760) },
        { name: 'Netherlands', sessions: scaleDemoCount(260), pageviews: scaleDemoCount(640) },
    ],
    city: [
        { name: 'New York', sessions: scaleDemoCount(720), pageviews: scaleDemoCount(1650) },
        { name: 'San Francisco', sessions: scaleDemoCount(640), pageviews: scaleDemoCount(1520) },
        { name: 'London', sessions: scaleDemoCount(560), pageviews: scaleDemoCount(1290) },
        { name: 'Bengaluru', sessions: scaleDemoCount(520), pageviews: scaleDemoCount(1180) },
        { name: 'Toronto', sessions: scaleDemoCount(420), pageviews: scaleDemoCount(980) },
        { name: 'Berlin', sessions: scaleDemoCount(360), pageviews: scaleDemoCount(850) },
    ],
    region: [
        { name: 'California', sessions: scaleDemoCount(1210), pageviews: scaleDemoCount(2810) },
        { name: 'Karnataka', sessions: scaleDemoCount(882), pageviews: scaleDemoCount(2010) },
        { name: 'England', sessions: scaleDemoCount(790), pageviews: scaleDemoCount(1740) },
        { name: 'Ontario', sessions: scaleDemoCount(420), pageviews: scaleDemoCount(980) },
        { name: 'Bavaria', sessions: scaleDemoCount(360), pageviews: scaleDemoCount(820) },
        { name: 'New South Wales', sessions: scaleDemoCount(280), pageviews: scaleDemoCount(660) },
    ],
    utm_source: [
        { name: 'reddit', sessions: scaleDemoCount(782), pageviews: scaleDemoCount(1860) },
        { name: 'x', sessions: scaleDemoCount(654), pageviews: scaleDemoCount(1508) },
        { name: 'newsletter', sessions: scaleDemoCount(402), pageviews: scaleDemoCount(982) },
        { name: 'linkedin', sessions: scaleDemoCount(268), pageviews: scaleDemoCount(640) },
        { name: 'youtube', sessions: scaleDemoCount(194), pageviews: scaleDemoCount(470) },
    ],
    utm_medium: [
        { name: 'social', sessions: scaleDemoCount(1480), pageviews: scaleDemoCount(3380) },
        { name: 'email', sessions: scaleDemoCount(432), pageviews: scaleDemoCount(1010) },
        { name: 'organic', sessions: scaleDemoCount(3610), pageviews: scaleDemoCount(8240) },
        { name: 'referral', sessions: scaleDemoCount(620), pageviews: scaleDemoCount(1480) },
    ],
};

function resolveTopGenericItems(column: string) {
    return TOP_GENERIC_ITEMS[column] || TOP_GENERIC_ITEMS.referrer_name;
}

export function getDemoOverviewTopGeneric(column: string) {
    return {
        supported: true,
        label: TOP_GENERIC_LABELS[column] || 'Referrers',
        primaryMetric: 'sessions' as const,
        items: resolveTopGenericItems(column),
    };
}

export function getDemoOverviewTopGenericSeries(column: string, interval: OverviewInterval = 'day') {
    const dates = buildDateSeries(interval === 'month' ? 6 : interval === 'week' ? 8 : 14, interval, `top-generic-series:${column}:${interval}`);
    return {
        supported: true,
        label: TOP_GENERIC_LABELS[column] || 'Referrers',
        primaryMetric: 'sessions' as const,
        items: resolveTopGenericItems(column).slice(0, 4).map((item, itemIndex) => ({
            ...item,
            data: dates.map((date, index) => {
                const ratio = 0.62 + index * 0.04 + itemIndex * 0.03;
                return {
                    date,
                    sessions: Math.round(item.sessions * Math.min(ratio, 1)),
                    pageviews: Math.round(item.pageviews * Math.min(ratio, 1)),
                };
            }),
        })),
    };
}

export function getDemoOverviewTopPages(mode: string) {
    if (mode === 'entry') {
        return {
            supported: true,
            items: [
                { origin: DEMO_SITE_URL, path: '/', title: 'Homepage', sessions: scaleDemoCount(2480), pageviews: scaleDemoCount(2480), bounceRate: 29.4, avgSessionDuration: 0 },
                { origin: DEMO_SITE_URL, path: '/pricing', title: '/pricing', sessions: scaleDemoCount(940), pageviews: scaleDemoCount(940), bounceRate: 33.1, avgSessionDuration: 0 },
                { origin: DEMO_SITE_URL, path: '/features', title: '/features', sessions: scaleDemoCount(822), pageviews: scaleDemoCount(822), bounceRate: 24.2, avgSessionDuration: 0 },
                { origin: DEMO_SITE_URL, path: '/x', title: '/x', sessions: scaleDemoCount(714), pageviews: scaleDemoCount(714), bounceRate: 21.8, avgSessionDuration: 0 },
                { origin: DEMO_SITE_URL, path: '/reddit', title: '/reddit', sessions: scaleDemoCount(668), pageviews: scaleDemoCount(668), bounceRate: 23.4, avgSessionDuration: 0 },
            ],
        };
    }

    if (mode === 'exit') {
        return {
            supported: true,
            items: [
                { origin: '', path: '/pricing', title: '/pricing', sessions: scaleDemoCount(1180), pageviews: scaleDemoCount(1180), bounceRate: 0, avgSessionDuration: 128 },
                { origin: '', path: '/', title: '/', sessions: scaleDemoCount(920), pageviews: scaleDemoCount(920), bounceRate: 0, avgSessionDuration: 78 },
                { origin: '', path: '/features', title: '/features', sessions: scaleDemoCount(610), pageviews: scaleDemoCount(610), bounceRate: 0, avgSessionDuration: 142 },
                { origin: '', path: '/x', title: '/x', sessions: scaleDemoCount(494), pageviews: scaleDemoCount(494), bounceRate: 0, avgSessionDuration: 176 },
                { origin: '', path: '/docs/getting-started', title: '/docs/getting-started', sessions: scaleDemoCount(386), pageviews: scaleDemoCount(386), bounceRate: 0, avgSessionDuration: 214 },
            ],
        };
    }

    return {
        supported: true,
        items: [
            { origin: DEMO_SITE_URL, path: '/', title: 'Homepage', sessions: scaleDemoCount(3120), pageviews: scaleDemoCount(7640), bounceRate: 31.2, avgSessionDuration: 184 },
            { origin: DEMO_SITE_URL, path: '/pricing', title: 'Pricing', sessions: scaleDemoCount(1284), pageviews: scaleDemoCount(2440), bounceRate: 38.4, avgSessionDuration: 116 },
            { origin: DEMO_SITE_URL, path: '/features', title: 'Features', sessions: scaleDemoCount(1116), pageviews: scaleDemoCount(2280), bounceRate: 24.8, avgSessionDuration: 168 },
            { origin: DEMO_SITE_URL, path: '/blog/reddit-mentions', title: 'Reddit Mentions Playbook', sessions: scaleDemoCount(802), pageviews: scaleDemoCount(1620), bounceRate: 18.3, avgSessionDuration: 224 },
            { origin: DEMO_SITE_URL, path: '/x', title: 'X Mentions', sessions: scaleDemoCount(764), pageviews: scaleDemoCount(1540), bounceRate: 20.2, avgSessionDuration: 236 },
            { origin: DEMO_SITE_URL, path: '/reddit', title: 'Reddit Mentions', sessions: scaleDemoCount(702), pageviews: scaleDemoCount(1460), bounceRate: 21.0, avgSessionDuration: 242 },
            { origin: DEMO_SITE_URL, path: '/docs/getting-started', title: 'Getting Started', sessions: scaleDemoCount(644), pageviews: scaleDemoCount(1320), bounceRate: 17.4, avgSessionDuration: 278 },
        ],
    };
}

export function getDemoOverviewLive() {
    const activeUsers = 18;
    const minuteCounts = Array.from({ length: 30 }, (_, index) => {
        const minuteOffset = 29 - index;
        const base = 6 + Math.round(Math.sin(index / 5) * 3);
        return {
            minute: `${minuteOffset}m`,
            sessionCount: Math.max(2, base + (index % 4)),
            visitorCount: Math.max(2, base + (index % 4)),
            timestamp: minuteOffset,
            time: `${minuteOffset}m ago`,
            referrers: [
                { referrer: 'google.com', count: Math.max(1, 2 + (index % 3)) },
                { referrer: 'reddit.com', count: 1 + (index % 2) },
            ],
        };
    });

    return {
        activeUsers,
        minuteCounts,
        referrers: [
            { referrer: 'google.com', count: 7 },
            { referrer: 'reddit.com', count: 5 },
            { referrer: 'x.com', count: 3 },
            { referrer: 'github.com', count: 2 },
        ],
        byCountry: getDemoRealtimeData().byCountry,
        byCity: getDemoRealtimeData().byCity,
        byPage: getDemoRealtimeData().byPage,
    };
}

export function getDemoEventsData() {
    return {
        summary: {
            eventCount: scaleDemoCount(28420),
            activeUsers: scaleDemoCount(9248),
            trackedTypes: 8,
            keyEvents: ['sign_up', 'cta_click', 'contact_submit'],
            focusEvent: 'cta_click',
        },
        topEvents: [
            { name: 'page_view', eventCount: scaleDemoCount(12840), users: scaleDemoCount(8920), isKeyEvent: false },
            { name: 'cta_click', eventCount: scaleDemoCount(4120), users: scaleDemoCount(2842), isKeyEvent: true },
            { name: 'scroll_90', eventCount: scaleDemoCount(3984), users: scaleDemoCount(3020), isKeyEvent: false },
            { name: 'sign_up', eventCount: scaleDemoCount(982), users: scaleDemoCount(982), isKeyEvent: true },
        ],
        trend: buildDateSeries(14, 'day', 'demo-events-trend').map((date, index) => ({
            date,
            page_view: scaleDemoCount(640 + index * 14),
            cta_click: scaleDemoCount(128 + index * 5),
            scroll_90: scaleDemoCount(184 + index * 4),
            sign_up: scaleDemoCount(26 + Math.round(index / 2)),
        })),
        trendKeys: ['page_view', 'cta_click', 'scroll_90', 'sign_up'],
        focusEvent: 'cta_click',
        pageBreakdown: [
            { page: '/', eventCount: scaleDemoCount(6210), users: scaleDemoCount(4021) },
            { page: '/pricing', eventCount: scaleDemoCount(3180), users: scaleDemoCount(1960) },
            { page: '/features', eventCount: scaleDemoCount(2240), users: scaleDemoCount(1540) },
        ],
        sourceBreakdown: [
            { source: 'Organic Search', eventCount: scaleDemoCount(9460) },
            { source: 'Direct', eventCount: scaleDemoCount(4280) },
            { source: 'Reddit / Social', eventCount: scaleDemoCount(2840) },
        ],
        deviceBreakdown: [
            { device: 'Desktop', eventCount: scaleDemoCount(15220) },
            { device: 'Mobile', eventCount: scaleDemoCount(11280) },
            { device: 'Tablet', eventCount: scaleDemoCount(1920) },
        ],
    };
}

export function getDemoPagesData() {
    return {
        summary: {
            pageViews: scaleDemoCount(32840),
            sessions: scaleDemoCount(14120),
            users: scaleDemoCount(11240),
            pagesPerSession: 2.33,
            avgSessionDuration: 188,
            bounceRate: 34.8,
        },
        trend: buildDateSeries(14, 'day', 'demo-pages-trend').map((date, index) => ({
            date,
            views: scaleDemoCount(1820 + index * 22),
            sessions: scaleDemoCount(760 + index * 10),
            users: scaleDemoCount(610 + index * 8),
            avgDuration: 174 + (index % 4) * 4,
            bounceRate: +(34 + (index % 5) * 0.5).toFixed(1),
        })),
        topPages: [
            { page: '/', title: 'Homepage', views: scaleDemoCount(9144), users: scaleDemoCount(6720), avgDuration: 162, bounceRate: 31.2, engagementRate: 68.8 },
            { page: '/pricing', title: 'Pricing', views: scaleDemoCount(2942), users: scaleDemoCount(2288), avgDuration: 118, bounceRate: 38.4, engagementRate: 61.6 },
            { page: '/features', title: 'Features', views: scaleDemoCount(2420), users: scaleDemoCount(1860), avgDuration: 172, bounceRate: 24.8, engagementRate: 75.2 },
        ],
        landingPages: [
            { page: '/', sessions: scaleDemoCount(6120), users: scaleDemoCount(4980), bounceRate: 29.4, engagementRate: 70.6, share: 43.3 },
            { page: '/pricing', sessions: scaleDemoCount(1480), users: scaleDemoCount(1212), bounceRate: 36.1, engagementRate: 63.9, share: 10.5 },
            { page: '/features', sessions: scaleDemoCount(1120), users: scaleDemoCount(944), bounceRate: 24.8, engagementRate: 75.2, share: 7.9 },
        ],
        exitPages: [
            { page: '/pricing', exits: scaleDemoCount(1180), views: scaleDemoCount(2942), share: 40.1 },
            { page: '/', exits: scaleDemoCount(920), views: scaleDemoCount(9144), share: 31.3 },
            { page: '/features', exits: scaleDemoCount(580), views: scaleDemoCount(2420), share: 19.7 },
        ],
        exitMetricSource: 'exits',
    };
}

export function getDemoSessionsData() {
    return {
        summary: {
            sessions: scaleDemoCount(14120),
            engagedSessions: scaleDemoCount(9324),
            activeUsers: scaleDemoCount(11240),
            pagesPerSession: 2.33,
            avgSessionDuration: 188,
            bounceRate: 34.8,
            engagementRate: 66.1,
        },
        trend: buildDateSeries(14, 'day', 'demo-sessions-trend').map((date, index) => ({
            date,
            sessions: scaleDemoCount(760 + index * 10),
            engagedSessions: scaleDemoCount(492 + index * 8),
        })),
        landingPatterns: [
            { label: '/', sessions: scaleDemoCount(6120), engagedSessions: scaleDemoCount(4382), engagementRate: 71.6, avgDuration: 214, bounceRate: 28.4, share: 43.3, qualityScore: 88 },
            { label: '/pricing', sessions: scaleDemoCount(1480), engagedSessions: scaleDemoCount(918), engagementRate: 62.0, avgDuration: 138, bounceRate: 38.0, share: 10.5, qualityScore: 71 },
            { label: '/features', sessions: scaleDemoCount(1120), engagedSessions: scaleDemoCount(816), engagementRate: 72.9, avgDuration: 196, bounceRate: 27.1, share: 7.9, qualityScore: 83 },
        ],
        channelQuality: [
            { label: 'Organic Search', sessions: scaleDemoCount(4821), engagedSessions: scaleDemoCount(3312), engagementRate: 68.7, avgDuration: 208, bounceRate: 31.3, share: 34.1, qualityScore: 86 },
            { label: 'Reddit / Social', sessions: scaleDemoCount(1455), engagedSessions: scaleDemoCount(980), engagementRate: 67.4, avgDuration: 222, bounceRate: 32.6, share: 10.3, qualityScore: 84 },
            { label: 'Direct', sessions: scaleDemoCount(2210), engagedSessions: scaleDemoCount(1322), engagementRate: 59.8, avgDuration: 144, bounceRate: 40.2, share: 15.6, qualityScore: 71 },
        ],
        deviceQuality: [
            { label: 'Desktop', sessions: scaleDemoCount(7028), engagedSessions: scaleDemoCount(4980), engagementRate: 70.9, avgDuration: 212, bounceRate: 29.1, share: 49.8, qualityScore: 89 },
            { label: 'Mobile', sessions: scaleDemoCount(3982), engagedSessions: scaleDemoCount(2380), engagementRate: 59.8, avgDuration: 142, bounceRate: 40.2, share: 28.2, qualityScore: 72 },
            { label: 'Tablet', sessions: scaleDemoCount(936), engagedSessions: scaleDemoCount(624), engagementRate: 66.7, avgDuration: 168, bounceRate: 33.3, share: 6.6, qualityScore: 78 },
        ],
        referrerQuality: [
            { label: 'google.com', sessions: scaleDemoCount(4821), engagedSessions: scaleDemoCount(3326), engagementRate: 69.0, avgDuration: 206, bounceRate: 31.0, share: 34.1, qualityScore: 86 },
            { label: 'reddit.com', sessions: scaleDemoCount(1042), engagedSessions: scaleDemoCount(728), engagementRate: 69.9, avgDuration: 228, bounceRate: 30.1, share: 7.4, qualityScore: 87 },
            { label: 'x.com', sessions: scaleDemoCount(936), engagedSessions: scaleDemoCount(584), engagementRate: 62.4, avgDuration: 174, bounceRate: 37.6, share: 6.6, qualityScore: 76 },
        ],
    };
}

export function getDemoJourneysData() {
    return {
        overview: {
            avgPathLength: 2.6,
            avgTimeOnSite: 204,
            bounceRate: 34,
            mostCommonPath: '/ → /pricing → /signup → EXIT',
        },
        journeys: [
            { id: 1, steps: ['/', '/pricing', '/signup', 'EXIT'], users: scaleDemoCount(482), percentage: 18.6, avgDuration: 284 },
            { id: 2, steps: ['/', '/features', '/pricing', 'EXIT'], users: scaleDemoCount(311), percentage: 12.0, avgDuration: 228 },
            { id: 3, steps: ['/blog/reddit-mentions', '/pricing', 'EXIT'], users: scaleDemoCount(242), percentage: 9.3, avgDuration: 248 },
            { id: 4, steps: ['/docs/getting-started', '/features', '/pricing', '/signup', 'EXIT'], users: scaleDemoCount(198), percentage: 7.6, avgDuration: 366 },
        ],
        landingPages: [
            { page: '/', entries: scaleDemoCount(1188), percentage: 46.1, avgPagesAfter: 2.4 },
            { page: '/blog/reddit-mentions', entries: scaleDemoCount(384), percentage: 14.9, avgPagesAfter: 1.8 },
            { page: '/pricing', entries: scaleDemoCount(342), percentage: 13.3, avgPagesAfter: 1.3 },
        ],
        exitPages: [
            { page: '/pricing', exits: scaleDemoCount(622), percentage: 24.1, avgSessionDuration: 148 },
            { page: '/', exits: scaleDemoCount(412), percentage: 15.9, avgSessionDuration: 54 },
            { page: '/signup', exits: scaleDemoCount(388), percentage: 15.0, avgSessionDuration: 284 },
        ],
    };
}

export function getDemoRetentionData(mode = 'daily') {
    if (mode === 'weekly') {
        return {
            mode,
            cohorts: [
                { date: 'Feb 24 - Mar 2', users: scaleDemoCount(6120), retention: [100, 34, 26, 20, 17, 15, 14, 13, 12] },
                { date: 'Mar 3 - Mar 9', users: scaleDemoCount(6480), retention: [100, 33, 25, 19, 16, 15, 13, 12, null] },
                { date: 'Mar 10 - Mar 16', users: scaleDemoCount(6620), retention: [100, 35, 27, 21, 17, 15, 14, null, null] },
                { date: 'Mar 17 - Mar 23', users: scaleDemoCount(6840), retention: [100, 36, 28, 21, 18, 16, null, null, null] },
            ],
            averages: { day1: 34.5, day7: 17.5, day14: 14.2, day30: 12.6 },
            curve: [
                { period: 0, retention: 100 },
                { period: 1, retention: 34.5 },
                { period: 2, retention: 26.5 },
                { period: 3, retention: 20.2 },
                { period: 4, retention: 17.0 },
                { period: 5, retention: 15.3 },
                { period: 6, retention: 13.7 },
                { period: 7, retention: 12.5 },
                { period: 8, retention: 12.0 },
            ],
            trends: { day1: 0, day7: 0, day14: 0, day30: 0 },
        };
    }

    if (mode === 'monthly') {
        return {
            mode,
            cohorts: [
                { date: 'November 2025', users: scaleDemoCount(24120), retention: [100, 41, 31, 24, 19, 17, 15] },
                { date: 'December 2025', users: scaleDemoCount(25880), retention: [100, 43, 32, 25, 20, 18, null] },
                { date: 'January 2026', users: scaleDemoCount(27320), retention: [100, 42, 31, 24, 20, null, null] },
                { date: 'February 2026', users: scaleDemoCount(28110), retention: [100, 44, 33, 25, null, null, null] },
            ],
            averages: { day1: 42.5, day7: 31.8, day14: 24.5, day30: 18.5 },
            curve: [
                { period: 0, retention: 100 },
                { period: 1, retention: 42.5 },
                { period: 2, retention: 31.8 },
                { period: 3, retention: 24.5 },
                { period: 4, retention: 19.8 },
                { period: 5, retention: 17.5 },
                { period: 6, retention: 15.0 },
            ],
            trends: { day1: 0, day7: 0, day14: 0, day30: 0 },
        };
    }

    return {
        mode: 'daily',
        cohorts: [
            { date: 'Apr 7', users: scaleDemoCount(1324), retention: [100, 28, 21, 18, 15, 14, 13, 12, 11, 10, 9, 8, 7, 7, 6] },
            { date: 'Apr 8', users: scaleDemoCount(1286), retention: [100, 27, 20, 17, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, null] },
            { date: 'Apr 9', users: scaleDemoCount(1362), retention: [100, 29, 22, 18, 15, 14, 13, 12, 11, 10, 9, 8, 7, null, null] },
            { date: 'Apr 10', users: scaleDemoCount(1420), retention: [100, 30, 22, 19, 16, 15, 13, 12, 11, 10, 9, 8, null, null, null] },
        ],
        averages: { day1: 28.5, day7: 12.0, day14: 6.7, day30: 4.1 },
        curve: Array.from({ length: 15 }, (_, period) => ({
            period,
            retention: [100, 28.5, 21.2, 18.0, 15.2, 14.2, 13.0, 12.0, 11.0, 10.0, 9.0, 8.0, 7.0, 6.5, 6.0][period],
        })),
        trends: { day1: 0, day7: 0, day14: 0, day30: 0 },
    };
}

export function getDemoPerformanceData(siteUrl = DEMO_SITE_URL) {
    return {
        overview: {
            lcp: { value: 2.1, rating: 'good' as const },
            inp: { value: 168, rating: 'good' as const },
            cls: { value: 0.07, rating: 'good' as const },
            fcp: { value: 1.5, rating: 'good' as const },
            ttfb: { value: 0.7, rating: 'good' as const },
        },
        trend: [],
        byPage: [],
        byDevice: [
            { device: 'Desktop', lcp: 1.8, inp: 124, cls: 0.05, fcp: 1.3, ttfb: 0.6, score: 94 },
            { device: 'Mobile', lcp: 2.4, inp: 192, cls: 0.08, fcp: 1.7, ttfb: 0.8, score: 88 },
            { device: 'Tablet', lcp: 2.2, inp: 171, cls: 0.07, fcp: 1.6, ttfb: 0.7, score: 90 },
        ],
        score: 91,
        source: 'demo',
        origin: siteUrl.startsWith('http') ? siteUrl : DEMO_SITE_URL,
        collectionPeriod: {
            firstDate: { year: 2026, month: 3, day: 20 },
            lastDate: { year: 2026, month: 4, day: 16 },
        },
    };
}

export function getDemoOpportunitiesData() {
    return {
        queries: [
            { query: 'x mentions embed', clicks: 588, impressions: 8410, ctr: 0.07, position: 4.8 },
            { query: 'reddit mentions widget', clicks: 644, impressions: 9022, ctr: 0.071, position: 4.2 },
            { query: 'ga4 alternative for startups', clicks: 421, impressions: 6540, ctr: 0.064, position: 5.7 },
        ],
        comparisonQueries: [
            { query: 'x mentions embed', clicks: 514, impressions: 7920, ctr: 0.065, position: 5.1 },
            { query: 'reddit mentions widget', clicks: 590, impressions: 8440, ctr: 0.069, position: 4.5 },
            { query: 'ga4 alternative for startups', clicks: 376, impressions: 6010, ctr: 0.062, position: 6.0 },
        ],
        queryPages: [
            { query: 'x mentions embed', page: `${DEMO_SITE_URL}/x`, clicks: 588, impressions: 8410, ctr: 0.07, position: 4.8 },
            { query: 'reddit mentions widget', page: `${DEMO_SITE_URL}/reddit`, clicks: 644, impressions: 9022, ctr: 0.071, position: 4.2 },
            { query: 'ga4 alternative for startups', page: `${DEMO_SITE_URL}/`, clicks: 421, impressions: 6540, ctr: 0.064, position: 5.7 },
        ],
    };
}

const DEMO_GOAL_SUGGESTIONS: GoalSuggestion[] = [
    {
        name: 'Signup conversions',
        description: 'Track users who trigger the signup event.',
        type: 'event_count',
        target: 'sign_up',
    },
    {
        name: 'Pricing visits',
        description: 'Track visits to the pricing page.',
        type: 'page_visit',
        target: '/pricing',
    },
];

export function getDemoGoalDefinitions() {
    return {
        definitions: [] as GoalDefinition[],
        suggestions: DEMO_GOAL_SUGGESTIONS,
    };
}

export function getDemoGoalAnalytics(input: { type?: string | null; target?: string | null; name?: string | null; description?: string | null }) {
    const type = (input.type || 'event_count') as GoalDefinition['type'];
    const target = input.target || 'sign_up';
    const name = input.name || (type === 'page_visit' ? 'Pricing visits' : 'Signup conversions');
    return {
        definition: {
            id: 'demo-goal',
            propertyId: DEMO_PROPERTY_ID,
            name,
            description: input.description || 'Demo goal data for onboarding users.',
            type,
            target,
            isActive: true,
        },
        summary: {
            conversions: scaleDemoCount(982),
            totalSessions: scaleDemoCount(14120),
            rate: 6.95,
            change: 18.4,
            rateChange: 1.2,
        },
        trend: buildDateSeries(14, 'day', `demo-goal:${target}`).map((date, index) => ({
            date,
            conversions: scaleDemoCount(42 + index * 2 + (index % 3) * 4),
            users: scaleDemoCount(38 + index * 2),
        })),
        sourceContribution: [
            { source: 'Organic Search', conversions: scaleDemoCount(412), share: 42.0 },
            { source: 'Reddit / Social', conversions: scaleDemoCount(218), share: 22.2 },
            { source: 'Direct', conversions: scaleDemoCount(190), share: 19.3 },
        ],
        pageContribution: [
            { page: '/', conversions: scaleDemoCount(388), share: 39.5 },
            { page: '/pricing', conversions: scaleDemoCount(344), share: 35.0 },
            { page: '/features', conversions: scaleDemoCount(172), share: 17.5 },
        ],
        explanation: 'Demo goal performance is strongest when visitors reach pricing from social proof pages, which suggests signup intent spikes after mention-driven trust signals.',
    };
}

const DEMO_FUNNEL_SUGGESTIONS: FunnelSuggestion[] = [
    {
        name: 'Homepage to signup',
        description: 'Track the primary conversion journey.',
        steps: ['/', '/pricing', '/signup'],
    },
    {
        name: 'Mentions to trial',
        description: 'Track the social-proof path into trial intent.',
        steps: ['/x', '/pricing', '/signup'],
    },
];

export function getDemoFunnelDefinitions() {
    return {
        definitions: [] as FunnelDefinition[],
        suggestions: DEMO_FUNNEL_SUGGESTIONS,
    };
}

export function getDemoFunnelAnalytics(input: { steps?: string[]; name?: string | null; description?: string | null }) {
    const steps = input.steps && input.steps.length >= 2 ? input.steps : ['/', '/pricing', '/signup'];
    const entries = scaleDemoCount(1440);
    const mid = scaleDemoCount(884);
    const completions = scaleDemoCount(462);
    return {
        definition: {
            id: 'demo-funnel',
            propertyId: DEMO_PROPERTY_ID,
            name: input.name || 'Homepage to signup',
            description: input.description || 'Demo funnel performance for onboarding.',
            steps,
            isActive: true,
        },
        steps: [
            { name: steps[0], count: entries, users: entries, avgDuration: 64, percentOfTotal: 100, dropFromPrevious: 0 },
            { name: steps[1] || '/pricing', count: mid, users: mid, avgDuration: 122, percentOfTotal: 61.4, dropFromPrevious: 38.6 },
            { name: steps[2] || '/signup', count: completions, users: completions, avgDuration: 188, percentOfTotal: 32.1, dropFromPrevious: 47.7 },
        ],
        summary: {
            totalEntries: entries,
            completions,
            overallRate: +(completions / entries * 100).toFixed(1),
            completionChange: 12.6,
            avgCompletionSessionDuration: 188,
        },
        biggestDrop: {
            from: steps[1] || '/pricing',
            to: steps[2] || '/signup',
            rate: 47.7,
        },
        trend: buildDateSeries(14, 'day', `demo-funnel:${steps.join('>')}`).map((date, index) => ({
            date,
            entries: scaleDemoCount(92 + index * 3),
            completions: scaleDemoCount(26 + index * 2),
        })),
    };
}

export function getDemoAnalyticsIntelligence() {
    const traffic = buildAnalyticsTraffic('30d');
    const totalUsers = traffic.reduce((sum, point) => sum + point.activeUsers, 0);
    const totalSessions = traffic.reduce((sum, point) => sum + point.sessions, 0);
    const totalPageViews = traffic.reduce((sum, point) => sum + point.pageViews, 0);

    return {
        kpis: {
            totalUsers,
            totalSessions,
            totalPageViews,
            avgBounceRate: 34.8,
            avgSessionDuration: 188,
            newUsers: Math.round(totalUsers * 0.58),
            returningUsers: Math.round(totalUsers * 0.42),
            pagesPerSession: +(totalPageViews / Math.max(totalSessions, 1)).toFixed(2),
            changeUsers: 12.8,
            changeSessions: 9.4,
            changePageViews: 15.1,
            changeBounceRate: -2.8,
        },
        traffic,
        channels: ANALYTICS_CHANNELS,
    };
}

export function getDemoAuditReport(url = DEMO_SITE_URL): AuditReport {
    return {
        url,
        fetchedAt: '2026-04-20T09:30:00.000Z',
        responseTime: 684,
        statusCode: 200,
        score: 86,
        summary: { critical: 1, warning: 5, info: 4, passed: 18, total: 28 },
        issues: [
            {
                id: 'audit-demo-1',
                category: 'Performance',
                title: 'Large hero media delays first render',
                description: 'The homepage ships multiple heavy visuals above the fold.',
                severity: 'warning',
                recommendation: 'Compress hero media and lazy-load below-the-fold assets.',
                value: 'LCP 2.1s',
            },
            {
                id: 'audit-demo-2',
                category: 'Meta',
                title: 'Homepage description can be more intent-driven',
                description: 'The current meta description is descriptive but not conversion-focused.',
                severity: 'info',
                recommendation: 'Rewrite the description around live mentions, AI analytics, and trust.',
            },
            {
                id: 'audit-demo-3',
                category: 'Images',
                title: 'One image is missing descriptive alt text',
                description: 'A marketing screenshot is missing meaningful alt copy.',
                severity: 'warning',
                recommendation: 'Add concise alt text describing the product preview.',
            },
            {
                id: 'audit-demo-4',
                category: 'Security',
                title: 'HTTPS is configured correctly',
                description: 'The site is served securely over HTTPS.',
                severity: 'passed',
            },
        ],
        meta: {
            title: 'Antigravity Codes',
            description: 'Real-time growth tooling for startups.',
            canonical: url,
            wordCount: 1284,
            pageSize: 642000,
            headings: { h1: 1, h2: 8, h3: 14, h4: 4, h5: 0, h6: 0 },
            images: { total: 18, withAlt: 17, withoutAlt: 1 },
            links: { internal: 32, external: 6, total: 38 },
            scripts: 9,
            stylesheets: 3,
        },
        details: {
            links: [
                { url: `${url}/pricing`, text: 'Pricing', type: 'internal', nofollow: false },
                { url: `${url}/features`, text: 'Features', type: 'internal', nofollow: false },
                { url: 'https://analytics.google.com', text: 'Google Analytics', type: 'external', nofollow: true },
            ],
            images: [
                { src: `${url}/hero.png`, alt: 'Product dashboard preview', hasAlt: true, lazy: false },
                { src: `${url}/social-proof.png`, alt: '', hasAlt: false, lazy: true },
            ],
            headings: [
                { level: 1, text: 'Track growth in real time' },
                { level: 2, text: 'Analytics' },
                { level: 2, text: 'Mentions' },
                { level: 2, text: 'SEO' },
            ],
            scripts: [
                { src: `${url}/_next/static/runtime.js` },
                { src: `${url}/_next/static/main.js` },
            ],
            stylesheets: [
                { href: `${url}/_next/static/main.css` },
            ],
            structuredData: [
                { type: 'WebSite', data: '{"@context":"https://schema.org","@type":"WebSite","name":"Antigravity Codes"}' },
            ],
        },
        siteType: { type: 'saas', confidence: 0.8, signals: ['demo workspace'] },
        htmlExcerpt: 'Track growth in real time. Real-time growth tooling for startups — analytics, mentions, and SEO in one workspace.',
    };
}
