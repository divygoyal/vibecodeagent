/**
 * Numbers for the link-preview card of a site share (/share/<token>/opengraph-image). Server only.
 * The same three Google Analytics figures the share page leads with (users, sessions, pageviews) for the share's own
 * default range, two small reports (this period and the one before), not the page's fifteen. Kept for a while, and
 * given up after 2.5 s like the dashboard card. Shares that hide their metrics, or are the Umami layout, get no numbers.
 */
import { storedCredentialsForAsset } from '@/lib/googleAccounts';
import { getValidAccessToken, resolvePrevRange, resolveRange, runGAReport } from '@/lib/googleApi';
import { fmtMetricValue, metricDeltaFor } from '@/lib/builder/catalog';
import { isPresetId, PRESETS } from '@/lib/builder/dates';
import { cachedCardNumbers, CARD_DATA_BUDGET_MS } from '@/lib/builder/server/shareCard';
import type { ShareCardNumbers } from '@/lib/builder/shareCard';
import type { ShareData } from '@/lib/shareTypes';
import { shareSiteLabel } from '@/components/share/ShareChrome';

/** The three figures both share layouts lead with (the overview calls the first one "Visitors", the classic page "Users"). */
const METRICS = [
    { id: 'ga4:activeUsers', api: 'activeUsers' },
    { id: 'ga4:sessions', api: 'sessions' },
    { id: 'ga4:screenPageViews', api: 'screenPageViews' },
] as const;
const LABELS = { overview: ['Visitors', 'Sessions', 'Pageviews'], classic: ['Users', 'Sessions', 'Pageviews'] } as const;

const shortDay = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
};

/** Whether the share page shows these numbers at all: a Google Analytics layout (classic or overview, not the Umami one) with its metrics on. */
export function shareShowsMetrics(share: Pick<ShareData, 'propertyId' | 'config'>): boolean {
    const c = share.config;
    return Boolean(share.propertyId) && c.layoutMode !== 'umami_fork' && c.shareProvider !== 'umami_fork' && c.traffic !== false && c.sectionVisibility?.metrics !== false;
}

/** "Last 28 days · Sep 30 – Oct 27" for a range key such as "28d". */
export function shareSiteRangeLabel(range: string, start: string, end: string): string {
    const label = isPresetId(range) ? PRESETS.find((p) => p.id === range)?.label ?? 'Last 28 days' : 'Last 28 days';
    const a = shortDay(start);
    const b = shortDay(end);
    return a && b ? `${label} · ${a} – ${b}` : label;
}

async function load(share: ShareData): Promise<ShareCardNumbers | null> {
    const creds = await storedCredentialsForAsset(share.userId, { kind: 'ga4', id: share.propertyId });
    if (!creds) return null;
    const token = await getValidAccessToken(creds.accessToken, creds.refreshToken);
    const range = share.config.defaults.range || '28d';
    const cur = resolveRange(range);
    const prev = resolvePrevRange(range);
    const mets = METRICS.map((m) => m.api);
    const [now, before] = await Promise.all([
        runGAReport(token, share.propertyId, [], mets, cur.startDate, cur.endDate, 1),
        runGAReport(token, share.propertyId, [], mets, prev.startDate, prev.endDate, 1),
    ]);
    const a = now.rows?.[0]?.metricValues;
    if (!a) return null;
    const b = before.rows?.[0]?.metricValues;
    const labels = share.config.layoutMode === 'openpanel_overview' ? LABELS.overview : LABELS.classic;
    const kpis = METRICS.flatMap((m, i) => {
        const value = Number(a[i]?.value);
        if (!Number.isFinite(value)) return [];
        const old = b ? Number(b[i]?.value) : NaN;
        const d = Number.isFinite(old) ? metricDeltaFor(m.id, value, old) : null;
        return [{
            label: labels[i],
            value: fmtMetricValue(m.id, value, { compact: true, tile: true }),
            ...(d && (d.state === 'change' || d.state === 'flat') ? { delta: { text: d.text, dir: d.direction, tone: d.tone } } : {}),
        }];
    });
    if (!kpis.length) return null;
    return { site: shareSiteLabel(share.siteUrl) || undefined, range: shareSiteRangeLabel(range, cur.startDate, cur.endDate), kpis };
}

/** Users, sessions and pageviews with their change, or null (hidden, slow, failed). `budgetMs` is for tests. */
export function shareSiteCardData(share: ShareData, budgetMs: number = CARD_DATA_BUDGET_MS): Promise<ShareCardNumbers | null> {
    if (!shareShowsMetrics(share)) return Promise.resolve(null);
    return cachedCardNumbers(`site:${share.token}`, () => load(share), budgetMs);
}
