/**
 * Site type detector — classifies a page as ecom / saas / blog / lead-gen / marketplace / unknown
 * from DOM signals so downstream checks and AI synthesis can tailor recommendations.
 * Operates on the cheerio DOM already loaded by runSiteAudit — no extra fetches.
 */
import type * as cheerio from 'cheerio';

export type SiteType = 'ecom' | 'saas' | 'blog' | 'lead-gen' | 'marketplace' | 'unknown';

export interface SiteTypeResult {
    type: SiteType;
    confidence: number;   // 0..1
    signals: string[];    // human-readable evidence
}

interface Score {
    type: Exclude<SiteType, 'unknown'>;
    score: number;
    signals: string[];
}

const MIN_CONFIDENCE = 0.35;

export function detectSiteType($: cheerio.CheerioAPI, html: string, url: string): SiteTypeResult {
    const lowerHtml = html.toLowerCase();
    const path = safePath(url);
    const title = ($('title').first().text() || '').toLowerCase();
    const bodyText = $('body').text().toLowerCase();

    const jsonLdTypes = collectJsonLdTypes($);
    const scriptSrcs = $('script[src]').map((_, el) => ($(el).attr('src') || '').toLowerCase()).get();
    const allAnchors = $('a[href]').map((_, el) => ({
        href: ($(el).attr('href') || '').toLowerCase(),
        text: $(el).text().trim().toLowerCase(),
    })).get();
    const buttonsText = $('button, a[class*="btn"], a[class*="button"], [role="button"]')
        .map((_, el) => $(el).text().trim().toLowerCase()).get();

    const scores: Record<Score['type'], Score> = {
        ecom:        { type: 'ecom',        score: 0, signals: [] },
        saas:        { type: 'saas',        score: 0, signals: [] },
        blog:        { type: 'blog',        score: 0, signals: [] },
        'lead-gen':  { type: 'lead-gen',    score: 0, signals: [] },
        marketplace: { type: 'marketplace', score: 0, signals: [] },
    };

    // ─── ECOM ───
    if (jsonLdTypes.some(t => /^(Product|Offer|Store|AggregateOffer)$/.test(t))) {
        scores.ecom.score += 0.45;
        scores.ecom.signals.push('schema.org Product/Offer/Store');
    }
    if (scriptSrcs.some(s => /shopify|woocommerce|bigcommerce|magento|prestashop|shopware/.test(s))) {
        scores.ecom.score += 0.35;
        scores.ecom.signals.push('e-commerce platform script');
    }
    if (/\/(cart|checkout|products?|shop|store|collections?)(\/|$|\?)/.test(path)) {
        scores.ecom.score += 0.20;
        scores.ecom.signals.push(`commerce URL path: ${path}`);
    }
    if (buttonsText.some(t => /^(add to (cart|bag)|buy now|shop now)/.test(t))) {
        scores.ecom.score += 0.25;
        scores.ecom.signals.push('add-to-cart CTA');
    }
    if (allAnchors.some(a => /\/cart|\/checkout/.test(a.href))) {
        scores.ecom.score += 0.15;
        scores.ecom.signals.push('cart/checkout link');
    }

    // ─── SAAS ───
    if (allAnchors.some(a => /\/pricing/.test(a.href))) {
        scores.saas.score += 0.30;
        scores.saas.signals.push('pricing link');
    }
    if (buttonsText.some(t => /(start free trial|sign up free|get started free|book a demo|free trial|start trial|try (it )?free)/.test(t))) {
        scores.saas.score += 0.30;
        scores.saas.signals.push('SaaS trial CTA');
    }
    if (jsonLdTypes.some(t => /^SoftwareApplication$/.test(t))) {
        scores.saas.score += 0.30;
        scores.saas.signals.push('schema.org SoftwareApplication');
    }
    if (/(platform|app|software|saas|api|dashboard|workspace)/.test(title)) {
        scores.saas.score += 0.10;
        scores.saas.signals.push('SaaS keyword in title');
    }
    if (/integration|api|webhook|sdk/.test(bodyText.slice(0, 4000))) {
        scores.saas.score += 0.05;
        scores.saas.signals.push('integration/API references');
    }

    // ─── BLOG ───
    if (jsonLdTypes.some(t => /^(BlogPosting|Article|NewsArticle)$/.test(t))) {
        scores.blog.score += 0.45;
        scores.blog.signals.push('schema.org BlogPosting/Article');
    }
    if ($('article').length >= 3) {
        scores.blog.score += 0.15;
        scores.blog.signals.push(`${$('article').length} <article> elements`);
    }
    if ($('meta[property="article:published_time"]').length > 0) {
        scores.blog.score += 0.20;
        scores.blog.signals.push('article:published_time meta');
    }
    if (/\/(blog|posts?|news|articles?)(\/|$|\?)/.test(path)) {
        scores.blog.score += 0.15;
        scores.blog.signals.push(`blog URL path: ${path}`);
    }
    if ($('link[type="application/rss+xml"], link[type="application/atom+xml"]').length > 0) {
        scores.blog.score += 0.10;
        scores.blog.signals.push('RSS/Atom feed link');
    }

    // ─── LEAD-GEN ───
    const hasContactForm = $('form').filter((_, el) => {
        const inputs = $(el).find('input').toArray();
        const hasEmail = inputs.some(i => $(i).attr('type') === 'email' || /email/i.test($(i).attr('name') || ''));
        const hasName  = inputs.some(i => /name/i.test($(i).attr('name') || '') || /name/i.test($(i).attr('placeholder') || ''));
        return hasEmail && hasName;
    }).length > 0;
    if (hasContactForm && !jsonLdTypes.some(t => /Product/.test(t))) {
        scores['lead-gen'].score += 0.25;
        scores['lead-gen'].signals.push('contact form (email + name)');
    }
    if (/\/(contact|quote|demo|consultation|get-started|free-tools?)(\/|$|\?)/.test(path)) {
        scores['lead-gen'].score += 0.25;
        scores['lead-gen'].signals.push(`lead-gen URL path: ${path}`);
    }
    if (scriptSrcs.some(s => /hubspot|marketo|pardot|salesforce-mc|hsforms|mktoforms/.test(s))) {
        scores['lead-gen'].score += 0.35;
        scores['lead-gen'].signals.push('marketing-automation script');
    }
    if (buttonsText.some(t => /(book a demo|get a quote|talk to sales|contact sales|request demo|schedule call)/.test(t))) {
        scores['lead-gen'].score += 0.20;
        scores['lead-gen'].signals.push('lead-gen CTA');
    }

    // ─── MARKETPLACE ───
    if (jsonLdTypes.some(t => /^WebSite$/.test(t)) && /SearchAction/.test(lowerHtml)) {
        scores.marketplace.score += 0.25;
        scores.marketplace.signals.push('schema.org WebSite SearchAction');
    }
    if (jsonLdTypes.filter(t => /^Product$/.test(t)).length >= 3) {
        scores.marketplace.score += 0.30;
        scores.marketplace.signals.push('multiple Product items per page');
    }
    if (scriptSrcs.some(s => /algolia|typesense|elasticsearch|meilisearch/.test(s))) {
        scores.marketplace.score += 0.20;
        scores.marketplace.signals.push('marketplace search vendor');
    }
    if (/\/(listings?|sellers?|stores?|vendors?|categories|search)(\/|$|\?)/.test(path)) {
        scores.marketplace.score += 0.15;
        scores.marketplace.signals.push(`marketplace URL path: ${path}`);
    }
    if (buttonsText.some(t => /(sell on|become a seller|list your|join as a seller|create a listing)/.test(t))) {
        scores.marketplace.score += 0.20;
        scores.marketplace.signals.push('seller-side CTA');
    }

    // argmax
    const ranked = Object.values(scores).sort((a, b) => b.score - a.score);
    const top = ranked[0];

    if (!top || top.score < MIN_CONFIDENCE) {
        return { type: 'unknown', confidence: top ? +top.score.toFixed(2) : 0, signals: [] };
    }
    return {
        type: top.type,
        confidence: Math.min(1, +top.score.toFixed(2)),
        signals: top.signals,
    };
}

function collectJsonLdTypes($: cheerio.CheerioAPI): string[] {
    const out: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const text = $(el).html();
        if (!text) return;
        try {
            const parsed = JSON.parse(text);
            walkType(parsed, out);
        } catch { /* ignore invalid JSON */ }
    });
    return out;
}

function walkType(node: unknown, out: string[]): void {
    if (!node) return;
    if (Array.isArray(node)) {
        for (const item of node) walkType(item, out);
        return;
    }
    if (typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        const t = obj['@type'];
        if (typeof t === 'string') out.push(t);
        else if (Array.isArray(t)) for (const v of t) if (typeof v === 'string') out.push(v);
        if (Array.isArray(obj['@graph'])) for (const v of obj['@graph']) walkType(v, out);
    }
}

function safePath(url: string): string {
    try { return new URL(url).pathname.toLowerCase(); }
    catch { return ''; }
}
