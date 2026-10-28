/**
 * Template prompts (round 4: client-report placeholders). Templates ship a few text widgets
 * and a company name that only tell the author what to write ("What went well this month").
 * Until the author changes them they are prompts, not content: the editor shows them as such,
 * and view, share, TV and PDF leave them out (the grid closes the gap). A prompt the author has
 * edited, even slightly, is content and always shows.
 *
 * Exact template strings: dashboards made from a template before this change keep the same
 * text, so they are recognised too. tests/builderPlaceholders.test.mjs checks every string
 * still appears in a shipped template.
 */
import type { ThemeV2, WidgetDef } from './types';

export const PLACEHOLDER_COMPANY = 'Your company';

export const PLACEHOLDER_TEXTS: readonly string[] = [
    // client-report (v1)
    '### Notes and next steps\n- What went well this month\n- What we are fixing next\n- Questions for you',
    // round 2 templates
    '### Highlights and next steps\n- The one result worth celebrating\n- The one thing we are fixing\n- What we need from you',
    '### Highlights\n- The one result worth celebrating this month\n- What changed, and why, in one sentence\n- What we will do about it next month',
    '### Work completed this month\n- Pages improved, with the change made\n- Technical fixes shipped',
    '### Planned for next month\n- The next pages to improve\n- Content to publish',
    '### Questions for you\n- Anything we need from you to move faster',
    '### This week in one line\nWrite the one sentence your team should remember.',
];

const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
const PROMPTS = new Set(PLACEHOLDER_TEXTS.map(norm));

/** True for a template prompt the author has not changed. */
export function isPlaceholderMarkdown(md: string | null | undefined): boolean {
    return typeof md === 'string' && PROMPTS.has(norm(md));
}

/** Widgets viewers never see: unchanged prompts, empty text, and image widgets with no image yet. */
export function hiddenForViewers(w: WidgetDef | undefined): boolean {
    if (!w) return false;
    if (w.type === 'text') return !w.config.markdown.trim() || isPlaceholderMarkdown(w.config.markdown);
    if (w.type === 'image') return !/^https:\/\//i.test(w.config.src ?? '');
    return false;
}

/** The company name to print, or null while it is still the template's "Your company". */
export function brandCompanyName(theme: Pick<ThemeV2, 'header'>): string | null {
    const n = theme.header.companyName?.trim();
    return n && n !== PLACEHOLDER_COMPANY ? n : null;
}
