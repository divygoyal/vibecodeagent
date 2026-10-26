/**
 * PageSpeed Insights v5 and CrUX answers for demo mode. Scores depend only
 * on the URL and strategy, so a page always gets the same report.
 */

import { unit } from './rng';

/* eslint-disable @typescript-eslint/no-explicit-any */

function lighthouseScore(value: number, good: number, poor: number): number {
    if (value <= good) return Math.min(1, 0.9 + 0.1 * (1 - value / good));
    if (value >= poor) return Math.max(0, 0.49 * (poor / value) * 0.6);
    return 0.5 + 0.39 * ((poor - value) / (poor - good));
}

function fmtMs(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function demoPagespeed(url: string, strategy: string = 'mobile', categories: string[] = ['performance']): any {
    const mobile = strategy.toLowerCase() !== 'desktop';
    const r = (k: string) => unit('psi', url, k);
    const slow = mobile ? 1.9 : 1;
    const lcp = (1200 + r('lcp') * 2600) * slow;
    const fcp = (600 + r('fcp') * 1400) * slow;
    const tbt = (40 + r('tbt') * 520) * (mobile ? 2.4 : 1);
    const cls = r('cls') * 0.24;
    const si = (1100 + r('si') * 3000) * slow;
    const tti = lcp * 1.25 + tbt;
    const ttfb = 180 + r('ttfb') * 900;
    const inp = 90 + r('inp') * 320;
    const audits: Record<string, any> = {
        'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'Largest Contentful Paint', numericValue: lcp, numericUnit: 'millisecond', displayValue: fmtMs(lcp), score: lighthouseScore(lcp, 2500, 4000) },
        'first-contentful-paint': { id: 'first-contentful-paint', title: 'First Contentful Paint', numericValue: fcp, numericUnit: 'millisecond', displayValue: fmtMs(fcp), score: lighthouseScore(fcp, 1800, 3000) },
        'total-blocking-time': { id: 'total-blocking-time', title: 'Total Blocking Time', numericValue: tbt, numericUnit: 'millisecond', displayValue: fmtMs(tbt), score: lighthouseScore(tbt, 200, 600) },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', title: 'Cumulative Layout Shift', numericValue: cls, numericUnit: 'unitless', displayValue: cls.toFixed(3), score: lighthouseScore(cls, 0.1, 0.25) },
        'speed-index': { id: 'speed-index', title: 'Speed Index', numericValue: si, numericUnit: 'millisecond', displayValue: fmtMs(si), score: lighthouseScore(si, 3400, 5800) },
        interactive: { id: 'interactive', title: 'Time to Interactive', numericValue: tti, numericUnit: 'millisecond', displayValue: fmtMs(tti), score: lighthouseScore(tti, 3800, 7300) },
        'server-response-time': { id: 'server-response-time', title: 'Initial server response time was short', numericValue: ttfb, numericUnit: 'millisecond', displayValue: `Root document took ${Math.round(ttfb)} ms`, score: ttfb < 600 ? 1 : 0 },
        'interaction-to-next-paint': { id: 'interaction-to-next-paint', title: 'Interaction to Next Paint', numericValue: inp, numericUnit: 'millisecond', displayValue: fmtMs(inp), score: lighthouseScore(inp, 200, 500) },
        'render-blocking-resources': { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', description: 'Resources are blocking the first paint of your page.', score: 0.4, details: { type: 'opportunity', overallSavingsMs: Math.round(300 + r('rb') * 900) } },
        'unused-javascript': { id: 'unused-javascript', title: 'Reduce unused JavaScript', description: 'Reduce unused JavaScript and defer loading scripts until they are required.', score: 0.3, details: { type: 'opportunity', overallSavingsMs: Math.round(200 + r('uj') * 1400), overallSavingsBytes: Math.round(80000 + r('ujb') * 300000) } },
        'modern-image-formats': { id: 'modern-image-formats', title: 'Serve images in next-gen formats', description: 'Image formats like WebP and AVIF often provide better compression.', score: 0.5, details: { type: 'opportunity', overallSavingsMs: Math.round(150 + r('img') * 700) } },
        'uses-text-compression': { id: 'uses-text-compression', title: 'Enable text compression', description: 'Text-based resources should be served with compression.', score: r('gz') < 0.3 ? 0 : 1, details: { type: 'opportunity', overallSavingsMs: r('gz') < 0.3 ? 420 : 0 } },
        'document-title': { id: 'document-title', title: 'Document has a `<title>` element', score: 1 },
        'meta-description': { id: 'meta-description', title: 'Document has a meta description', score: r('meta') < 0.2 ? 0 : 1 },
    };
    const perf = Math.round(
        (audits['first-contentful-paint'].score * 0.1 + audits['speed-index'].score * 0.1 + audits['largest-contentful-paint'].score * 0.25 + audits['total-blocking-time'].score * 0.3 + audits['cumulative-layout-shift'].score * 0.25) * 100,
    ) / 100;
    const cat = (id: string, title: string, score: number) => ({ id, title, score });
    const allCats: Record<string, any> = {
        performance: cat('performance', 'Performance', perf),
        accessibility: cat('accessibility', 'Accessibility', Math.round((0.82 + r('a11y') * 0.17) * 100) / 100),
        'best-practices': cat('best-practices', 'Best Practices', Math.round((0.78 + r('bp') * 0.21) * 100) / 100),
        seo: cat('seo', 'SEO', Math.round((0.85 + r('seo') * 0.15) * 100) / 100),
    };
    const wanted = categories.map(c => c.toLowerCase().replace(/_/g, '-'));
    const categoriesOut = Object.fromEntries(Object.entries(allCats).filter(([k]) => wanted.includes(k)));
    const rate = (v: number, good: number, poor: number) => (v <= good ? 'FAST' : v >= poor ? 'SLOW' : 'AVERAGE');
    return {
        captchaResult: 'CAPTCHA_NOT_NEEDED',
        kind: 'pagespeedonline#result',
        id: url,
        loadingExperience: {
            id: url,
            metrics: {
                LARGEST_CONTENTFUL_PAINT_MS: { percentile: Math.round(lcp * 0.9), category: rate(lcp * 0.9, 2500, 4000) },
                CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: Math.round(cls * 100), category: rate(cls, 0.1, 0.25) },
                INTERACTION_TO_NEXT_PAINT: { percentile: Math.round(inp), category: rate(inp, 200, 500) },
                FIRST_CONTENTFUL_PAINT_MS: { percentile: Math.round(fcp * 0.9), category: rate(fcp * 0.9, 1800, 3000) },
                EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: Math.round(ttfb), category: rate(ttfb, 800, 1800) },
            },
            overall_category: rate(lcp, 2500, 4000),
        },
        lighthouseResult: {
            requestedUrl: url,
            finalUrl: url,
            lighthouseVersion: '12.2.1',
            fetchTime: new Date().toISOString(),
            configSettings: { formFactor: mobile ? 'mobile' : 'desktop', emulatedFormFactor: mobile ? 'mobile' : 'desktop' },
            audits,
            categories: categoriesOut,
        },
        analysisUTCTimestamp: new Date().toISOString(),
    };
}

/** CrUX records:queryRecord for an origin or URL. */
export function demoCruxRecord(body: { origin?: string; url?: string; formFactor?: string }): any {
    const key = body.origin || body.url || 'unknown';
    const ff = body.formFactor || 'ALL';
    const r = (k: string) => unit('crux', key, ff, k);
    const slow = ff === 'PHONE' ? 1.35 : ff === 'TABLET' ? 1.15 : ff === 'DESKTOP' ? 0.8 : 1;
    const hist = (good: number, ni: number) => [
        { start: 0, end: good, density: 0.62 + r(`g${good}`) * 0.25 },
        { start: good, end: ni, density: 0.08 + r(`n${good}`) * 0.12 },
        { start: ni, density: 0.02 + r(`p${good}`) * 0.06 },
    ];
    return {
        record: {
            key: { ...(body.origin ? { origin: body.origin } : { url: body.url }), ...(body.formFactor ? { formFactor: body.formFactor } : {}) },
            metrics: {
                largest_contentful_paint: { histogram: hist(2500, 4000), percentiles: { p75: Math.round((1500 + r('lcp') * 1900) * slow) } },
                interaction_to_next_paint: { histogram: hist(200, 500), percentiles: { p75: Math.round((90 + r('inp') * 240) * slow) } },
                cumulative_layout_shift: { histogram: hist(0.1, 0.25), percentiles: { p75: (r('cls') * 0.18).toFixed(2) } },
                first_contentful_paint: { histogram: hist(1800, 3000), percentiles: { p75: Math.round((900 + r('fcp') * 1300) * slow) } },
                experimental_time_to_first_byte: { histogram: hist(800, 1800), percentiles: { p75: Math.round((250 + r('ttfb') * 900) * slow) } },
            },
            collectionPeriod: (() => {
                const ymd = (d: Date) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
                const last = new Date(Date.now() - 2 * 86_400_000);
                return { firstDate: ymd(new Date(last.getTime() - 27 * 86_400_000)), lastDate: ymd(last) };
            })(),
        },
    };
}
