'use client';

import { Sun } from 'lucide-react';

const QUICK_PROMPTS = [
    '🎯 What is the ONE thing I should do today to grow?',
    '🚨 Why did my traffic drop?',
    '💰 Which pages are money pits? (high impressions, low clicks)',
    '📈 Keywords on page 2 I can push to page 1',
    '📝 Give me 5 blog post ideas based on my data',
    '📊 Grade my SEO (A-F)',
    '⚡ Are my Core Web Vitals hurting my rankings?',
    '🔮 Growth opportunities I am missing',
];

interface QuickPromptsProps {
    dataReady: boolean;
    briefingDoneToday: boolean;
    onBriefingClick: () => void;
    onPromptClick: (prompt: string) => void;
}

/**
 * Empty-state quick-prompt strip — daily briefing button + 8 canned prompts.
 * Shown only when no user message has been sent yet AND chat isn't loading.
 *
 * Extracted from AIChatbot.tsx during B5-full split.
 */
export function QuickPrompts({ dataReady, briefingDoneToday, onBriefingClick, onPromptClick }: QuickPromptsProps) {
    return (
        <div className="px-4 pb-2">
            {!dataReady && (
                <div className="text-[10px] text-zinc-600 mb-1.5 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full border border-emerald-500/30 border-t-emerald-400 animate-spin" />
                    Loading your data...
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={onBriefingClick}
                    disabled={!dataReady || briefingDoneToday}
                    title={briefingDoneToday ? 'Already viewed today' : 'Daily briefing of overnight changes + #1 priority'}
                    className="text-xs px-3 py-2 sm:text-[11px] sm:px-2.5 sm:py-1.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/[0.20] text-amber-300 hover:bg-amber-500/[0.10] hover:border-amber-500/[0.35] hover:text-amber-200 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500/[0.05] disabled:hover:border-amber-500/[0.20]"
                >
                    <Sun className="w-3 h-3" />
                    {briefingDoneToday ? 'Briefing — already viewed' : 'Daily Briefing'}
                </button>
                {QUICK_PROMPTS.map((prompt, i) => (
                    <button
                        key={i}
                        onClick={() => onPromptClick(prompt)}
                        disabled={!dataReady}
                        className="text-xs px-3 py-2 sm:text-[11px] sm:px-2.5 sm:py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/[0.15] hover:bg-emerald-500/[0.03] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-500 disabled:hover:border-white/[0.04] disabled:hover:bg-white/[0.02]"
                    >
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    );
}
