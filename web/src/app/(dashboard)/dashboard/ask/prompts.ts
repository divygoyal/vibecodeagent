import { BarChart3, FileText, ListChecks, Search, Sparkles, TrendingDown, type LucideIcon } from 'lucide-react';

export interface AskPrompt {
    icon: LucideIcon;
    /** Short title on the card. */
    title: string;
    /** The question that is sent. */
    question: string;
}

/**
 * Suggested questions for the empty state (DESIGN 5.11). Plain sentences, no
 * emoji. The first four are the ones phones show.
 */
export const ASK_PROMPTS: readonly AskPrompt[] = [
    { icon: TrendingDown, title: 'Why did my traffic change?', question: 'Why did my traffic change recently? Compare the last 28 days with the 28 days before.' },
    { icon: ListChecks, title: 'What should I fix first?', question: 'What’s the one thing I should do today to grow?' },
    { icon: Search, title: 'Keywords close to page 1', question: 'Which keywords are on page 2 that I can push to page 1?' },
    { icon: BarChart3, title: 'Pages with few clicks', question: 'Which pages get lots of impressions but few clicks?' },
    { icon: FileText, title: 'Content ideas', question: 'Give me 5 blog post ideas based on my data.' },
    { icon: Sparkles, title: 'Grade my SEO', question: 'Grade my SEO from A to F and tell me why.' },
] as const;
