import { BookOpen, FileText, GitCompareArrows, Globe, Sparkles, type LucideIcon } from 'lucide-react';

export interface FreeTool {
    slug: string;
    title: string;
    /** One line for the index card. */
    short: string;
    /** Meta description for the tool page. */
    description: string;
    icon: LucideIcon;
}

/** The free tools under /tools (no sign-up). One list feeds the index, metadata and the sitemap. */
export const FREE_TOOLS: FreeTool[] = [
    {
        slug: 'ai-search-readiness',
        title: 'AI Search Readiness',
        short: 'Check if a page is ready for ChatGPT, Perplexity and Google AI Overviews.',
        description: 'Free AI search readiness checker: see whether a page is optimised for AI search engines like ChatGPT, Perplexity and Google AI Overviews, with a score per category.',
        icon: Sparkles,
    },
    {
        slug: 'robots-analyzer',
        title: 'Robots.txt Analyzer',
        short: 'Find robots.txt issues and see which AI crawlers can access your site.',
        description: 'Free robots.txt analyzer: parse directives, list sitemaps, flag issues and see whether GPTBot, ClaudeBot, PerplexityBot, Googlebot and Bingbot can access your site.',
        icon: FileText,
    },
    {
        slug: 'readability-checker',
        title: 'Readability Checker',
        short: 'Score a page or pasted text with Flesch-Kincaid readability.',
        description: 'Free readability checker: score a URL or pasted text with Flesch-Kincaid and see the grade level, words per sentence and syllables per word.',
        icon: BookOpen,
    },
    {
        slug: 'hreflang-validator',
        title: 'Hreflang Validator',
        short: 'Validate hreflang tags for international targeting.',
        description: 'Free hreflang validator: check a page for a self-referencing tag, an x-default tag, valid language codes and absolute URLs.',
        icon: Globe,
    },
    {
        slug: 'comparison-builder',
        title: 'Comparison Builder',
        short: 'Generate a comparison page with schema markup.',
        description: 'Free comparison page builder: generate a product comparison table with structured data (schema markup) for your site.',
        icon: GitCompareArrows,
    },
];

export function toolBySlug(slug: string): FreeTool {
    const tool = FREE_TOOLS.find((t) => t.slug === slug);
    if (!tool) throw new Error(`Unknown tool ${slug}`);
    return tool;
}
