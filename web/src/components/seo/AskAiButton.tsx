'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { buildAiChatUrl, type SeoFromTag } from '@/lib/seoAiPrompts';

interface AskAiButtonProps {
    /** Pre-built question text. Will be truncated to 320 chars in the URL. */
    question: string;
    /** GSC site URL — flows into the chat workspace switcher (?site=). */
    siteUrl?: string | null;
    /** GA4 property id — flows into the chat workspace switcher (?property=). */
    propertyId?: string | null;
    /** Surface tag — the chat reads this to route the right tool first. */
    fromTag?: SeoFromTag;
    /** compact = pill button next to a panel title; prominent = larger CTA. */
    variant?: 'compact' | 'prominent';
    /** Override default label. */
    label?: string;
    /** When false (e.g., no row selected), renders nothing. */
    enabled?: boolean;
    /** Extra Tailwind classes for the outer link element. */
    className?: string;
}

/**
 * "Ask AI about this" link, mounted next to SEO findings so a user can hand
 * off the specific finding (keyword, page, cannibalization, etc.) to the AI
 * chat without re-typing context. The chat receives the pre-built question
 * + site/property workspace switch + a `__from=seo:*` routing tag that the
 * chat's system prompt uses to force the relevant tool to run first.
 *
 * Two variants:
 *   - compact (default): small cyan-outlined pill, fits in a panel title bar
 *   - prominent: larger filled-style button, for page-level CTAs
 */
export function AskAiButton({
    question,
    siteUrl,
    propertyId,
    fromTag,
    variant = 'compact',
    label = 'Ask AI',
    enabled = true,
    className = '',
}: AskAiButtonProps) {
    if (!enabled || !question.trim()) return null;

    const href = buildAiChatUrl({ question, siteUrl, propertyId, fromTag });

    if (variant === 'prominent') {
        return (
            <Link
                href={href}
                title="Open AI chat with this question pre-filled"
                className={`inline-flex items-center gap-1.5 rounded-full bg-[#22d3ee] px-3.5 py-1.5 text-[12px] font-semibold text-[#06141a] shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_2px_8px_rgba(34,211,238,0.30)] transition-all hover:brightness-110 ${className}`}
                data-testid={`ask-ai-button-${fromTag ?? 'generic'}`}
            >
                <Sparkles className="h-3.5 w-3.5" />
                {label}
            </Link>
        );
    }

    return (
        <Link
            href={href}
            title="Open AI chat with this question pre-filled"
            className={`inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/[0.08] px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/[0.16] hover:text-cyan-200 ${className}`}
            data-testid={`ask-ai-button-${fromTag ?? 'generic'}`}
        >
            <Sparkles className="h-3 w-3" />
            {label}
        </Link>
    );
}
