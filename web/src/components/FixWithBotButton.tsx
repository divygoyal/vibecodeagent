'use client';

import { useState } from 'react';
import { Bot, Zap } from 'lucide-react';
import Link from 'next/link';

interface FixWithBotButtonProps {
    label?: string;
    context?: string;
    size?: 'sm' | 'md';
    variant?: 'solid' | 'ghost';
}

export default function FixWithBotButton({
    label = 'Fix Instantly',
    context,
    size = 'sm',
    variant = 'solid',
}: FixWithBotButtonProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    const sizeClasses = size === 'sm'
        ? 'px-3 py-1.5 text-[11px] gap-1.5'
        : 'px-4 py-2 text-xs gap-2';

    const variantClasses = variant === 'solid'
        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold hover:opacity-90 shadow-lg shadow-emerald-500/10'
        : 'bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/[0.15]';

    return (
        <div className="relative inline-block">
            <Link
                href="/dashboard/bot"
                className={`inline-flex items-center rounded-lg transition-all ${sizeClasses} ${variantClasses}`}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <Zap className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                {label}
            </Link>

            {showTooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                    <div className="bg-[#0c0c10] border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs">
                            <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-zinc-300 font-medium">Connect with Bot / Fix with Bot</span>
                        </div>
                        {context && (
                            <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] whitespace-normal">{context}</p>
                        )}
                    </div>
                    <div className="w-2 h-2 bg-[#0c0c10] border-r border-b border-white/[0.1] rotate-45 mx-auto -mt-1" />
                </div>
            )}
        </div>
    );
}
