'use client';

import { Sparkles } from 'lucide-react';

interface FixWithBotButtonProps {
    label?: string;
    context?: string;
    site?: string;
    size?: 'sm' | 'md';
    variant?: 'solid' | 'ghost' | 'link';
}

export default function FixWithBotButton({
    label = 'Ask AI',
    context,
    site,
    size = 'sm',
    variant = 'solid',
}: FixWithBotButtonProps) {
    const sizeClasses = size === 'sm'
        ? 'px-3 py-1.5 text-[11px] gap-1.5'
        : 'px-4 py-2.5 text-xs gap-2 w-full justify-center';

    const variantClasses = variant === 'solid'
        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 shadow-lg shadow-emerald-500/10'
        : variant === 'link'
            ? 'text-zinc-500 hover:text-zinc-300 font-medium'
            : 'bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/[0.15]';

    const handleClick = () => {
        const question = context || 'Analyze this issue and tell me how to fix it';
        window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question, site } }));
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
