'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * Floating "Ask AI about this view" chip pinned to the bottom-right of the
 * SEO dashboard. Mirrors the discoverability the legacy floating chatbot
 * provided, without re-mounting a widget — it just deep-links into the
 * dedicated /dashboard/ai-chat page where the user's seoContext is already
 * snapshot into the chat request.
 *
 * Hidden below lg because the mobile shell already exposes the chat via the
 * bottom bar, and a floating element there would overlap that nav.
 */
export default function SeoAskAiChip() {
    return (
        <Link
            href="/dashboard/ai-chat"
            aria-label="Ask AI about this view"
            className="fixed bottom-6 right-6 z-40 hidden lg:inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-gradient-to-r from-emerald-500/[0.18] to-cyan-500/[0.18] px-4 py-2.5 text-[13px] font-semibold text-cyan-100 shadow-lg shadow-cyan-500/10 backdrop-blur transition hover:from-emerald-500/[0.30] hover:to-cyan-500/[0.30] hover:border-cyan-500/50 hover:shadow-cyan-500/20"
        >
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Ask AI about this view
        </Link>
    );
}
