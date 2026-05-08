'use client';

import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { buildAskAiUrl } from '@/lib/askAi';

interface FixWithBotButtonProps {
    label?: string;
    context?: string;
    /** @deprecated site is now read from workspace context on the chat page. */
    site?: string;
    size?: 'sm' | 'md';
    variant?: 'solid' | 'ghost' | 'link';
}

export default function FixWithBotButton({
    label = 'Ask AI',
    context,
    size = 'sm',
    variant = 'solid',
}: FixWithBotButtonProps) {
    const router = useRouter();
    const sizeClasses = size === 'sm'
        ? 'px-3 py-1.5 text-[11px] gap-1.5'
        : 'px-4 py-2.5 text-xs gap-2 w-full justify-center';

    const variantClasses = variant === 'solid'
        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 shadow-lg shadow-emerald-500/10'
        : variant === 'link'
            ? 'text-emerald-400 hover:text-emerald-300 text-sm font-medium'
            : 'text-emerald-400 hover:text-emerald-300 text-xs font-medium';

    const handleClick = () => {
        const question = context || 'Analyze this issue and tell me how to fix it';
        router.push(buildAskAiUrl(question));
    };

    return (
        <button
            onClick={handleClick}
            className={`inline-flex items-center rounded-lg transition-all ${sizeClasses} ${variantClasses}`}
        >
            <Sparkles className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            {label}
        </button>
    );
}
