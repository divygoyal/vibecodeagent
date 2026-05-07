/**
 * psiBatch.ts — PageSpeed Insights batch for top money pages.
 *
 * Fetches mobile + desktop CWV (LCP, CLS, TBT, performance score) for up to
 * 3 top money pages. Drives the `cwv_ranking_correlation` cross-source
 * detector — if a mobile-laggard keyword's page has CLS > 0.25 or LCP > 2.5s
 * on mobile, the CWV failure IS the ranking failure. That's a "wow" insight.
 *
 * PSI is slow (~5-10s per call). We cap to 3 pages × 2 strategies = 6 calls
 * with 12-second per-call timeout, run in parallel. With 6h cache TTL the
 * heavy lift is amortized across many chat turns.
 */

export interface PsiResult {
    url: string;
    strategy: 'mobile' | 'desktop';
    fetched: boolean;
    /** 0–100 performance score */
    performance: number;
    /** Largest Contentful Paint in ms (numeric, not display string). */
    lcpMs: number;
    /** Cumulative Layout Shift (raw decimal, e.g., 0.15). */
    cls: number;
    /** Total Blocking Time in ms. */
    tbtMs: number;
    /** First Contentful Paint in ms. */
    fcpMs: number;
    /** Verdict per CWV: GOOD | NEEDS_IMPROVEMENT | POOR */
    lcpVerdict: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR' | 'UNKNOWN';
    clsVerdict: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR' | 'UNKNOWN';
    error?: string;
}

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function blank(url: string, strategy: 'mobile' | 'desktop', error?: string): PsiResult {
    return {
        url, strategy,
        fetched: false,
        performance: 0,
        lcpMs: 0, cls: 0, tbtMs: 0, fcpMs: 0,
        lcpVerdict: 'UNKNOWN', clsVerdict: 'UNKNOWN',
        error,
    };
}

function parseMsValue(displayValue?: string): number {
    if (!displayValue) return 0;
    // PSI display values like "2.4 s" or "180 ms" or "0.15"
    if (/s\b/.test(displayValue) && !/ms\b/.test(displayValue)) {
        const n = parseFloat(displayValue);
        return Number.isFinite(n) ? Math.round(n * 1000) : 0;
    }
    if (/ms\b/.test(displayValue)) {
        const n = parseFloat(displayValue);
        return Number.isFinite(n) ? Math.round(n) : 0;
    }
    const n = parseFloat(displayValue);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

function verdict(score: number | null | undefined): 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR' | 'UNKNOWN' {
    if (score == null) return 'UNKNOWN';
    if (score >= 0.9) return 'GOOD';
    if (score >= 0.5) return 'NEEDS_IMPROVEMENT';
    return 'POOR';
}

export async function fetchPsi(url: string, strategy: 'mobile' | 'desktop'): Promise<PsiResult> {
    if (!url) return blank('', strategy, 'no url');
    const apiUrl = `${PSI_BASE}?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
    let res: Response;
    try {
        res = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
    } catch (e: any) {
        return blank(url, strategy, e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch failed'));
    }
    if (!res.ok) return blank(url, strategy, `HTTP ${res.status}`);

    let data: any;
    try { data = await res.json(); } catch (e: any) { return blank(url, strategy, e?.message || 'json parse failed'); }
    const lh = data?.lighthouseResult;
    if (!lh) return blank(url, strategy, 'no lighthouse result');
    const audits = lh.audits || {};
    const cats = lh.categories || {};
    const lcpDisplay = audits['largest-contentful-paint']?.displayValue;
    const clsRaw = audits['cumulative-layout-shift']?.numericValue;
    const tbtDisplay = audits['total-blocking-time']?.displayValue;
    const fcpDisplay = audits['first-contentful-paint']?.displayValue;
    const lcpScore = audits['largest-contentful-paint']?.score;
    const clsScore = audits['cumulative-layout-shift']?.score;

    return {
        url, strategy,
        fetched: true,
        performance: Math.round((cats.performance?.score ?? 0) * 100),
        lcpMs: parseMsValue(lcpDisplay),
        cls: typeof clsRaw === 'number' ? Math.round(clsRaw * 1000) / 1000 : 0,
        tbtMs: parseMsValue(tbtDisplay),
        fcpMs: parseMsValue(fcpDisplay),
        lcpVerdict: verdict(lcpScore),
        clsVerdict: verdict(clsScore),
    };
}

/** Fetch PSI for a list of (url, strategy) pairs. Caps at 8 calls. */
export async function fetchPsiBatch(targets: Array<{ url: string; strategy: 'mobile' | 'desktop' }>): Promise<Map<string, PsiResult>> {
    const out = new Map<string, PsiResult>();
    const unique = targets.slice(0, 8);
    if (unique.length === 0) return out;
    const results = await Promise.all(unique.map(t => fetchPsi(t.url, t.strategy).catch(() => blank(t.url, t.strategy, 'unhandled'))));
    unique.forEach((t, i) => out.set(`${t.strategy}:${t.url}`, results[i]));
    return out;
}
