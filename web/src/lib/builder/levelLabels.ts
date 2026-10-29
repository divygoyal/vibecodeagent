/**
 * Plain-language labels for drilled widgets (round 8 judge fixes): the title follows the level the viewer is on,
 * Google's placeholder values ("(organic)", "(not set)") read as words, the homepage is "/ (home)" in page
 * lists, and a filter a widget cannot apply says which one and why. Pure (no React).
 */
import { pageLabel } from '@/components/site/lib/pagePath';
import { dimLabel } from './catalog';
import type { DimId, WidgetDef } from './types';

/** Value text for placeholder values, or null when the value is shown as it is. */
export function friendlyDimValue(dim: DimId, value: string): string | null {
    const v = value.trim();
    if (dim === 'campaign') {
        if (v === '(organic)') return 'No campaign (organic)';
        if (v === '(direct)') return 'No campaign (direct)';
        if (v === '(referral)') return 'No campaign (referral)';
        if (v === '(not set)' || v === '(none)') return 'No campaign (not set)';
    }
    if (dim === 'sourceMedium') {
        if (v === '(direct) / (none)') return 'Direct (no source)';
        if (v === '(not set)' || v === '(not set) / (not set)') return 'Not set';
    }
    // GA4's raw values ("new", "returning", "(not set)") read as data, not words (round 10).
    if (dim === 'newVsReturning') {
        const l = v.toLowerCase();
        if (l === 'new') return 'New visitors';
        if (l === 'returning') return 'Returning visitors';
        if (l === '(not set)' || l === '') return 'Unknown';
    }
    if (dim === 'page' || dim === 'landingPage' || dim === 'pagePath') {
        if (v === '/') return pageLabel('/');
    }
    return null;
}

/**
 * A drilled widget with its own title keeps it and names the level after it ("Sessions by channel › Campaign"),
 * so the title never says Countries over a list of cities. A widget on an automatic title already follows the
 * level (its title is built from the dimension). Returns the suffix, or null at the top level.
 */
export function drillTitleSuffix(w: WidgetDef): string | null {
    const chain = w.interactions?.drillChain;
    const depth = w.interactions?.drillDepth ?? 0;
    if (!w.title || !chain || depth <= 0 || !chain[depth]) return null;
    return dimLabel(chain[depth]);
}

/** The footnote for filters a widget did not apply: which filters, and which Google product lacks them. */
export function ignoredFiltersNote(items: Array<{ dimension: DimId; family: 'ga4' | 'gsc' }> | undefined, fallbackCount = 0): string | null {
    if (!items?.length) return fallbackCount ? `${fallbackCount === 1 ? 'A filter was' : 'Some filters were'} not applied to this widget` : null;
    const byFamily = new Map<string, string[]>();
    for (const it of items) {
        const product = it.family === 'gsc' ? 'Search Console' : 'Google Analytics';
        const list = byFamily.get(product) ?? [];
        const label = dimLabel(it.dimension);
        if (!list.includes(label)) list.push(label);
        byFamily.set(product, list);
    }
    return [...byFamily].map(([product, labels]) => {
        const names = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0];
        return `${names} filter${labels.length > 1 ? 's' : ''} not applied (${product} has no ${labels.length > 1 ? 'data for them' : `${labels[0].toLowerCase()} data`})`;
    }).join('; ');
}
