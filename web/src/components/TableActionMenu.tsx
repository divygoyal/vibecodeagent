'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    MoreHorizontal, ScanSearch, Sparkles, TrendingUp, Copy,
    ExternalLink, BarChart3, FileText, Target, Zap
} from 'lucide-react';

interface ActionItem {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    color?: string;
    divider?: boolean;
}

interface TableActionMenuProps {
    actions: ActionItem[];
    size?: 'sm' | 'md';
}

export default function TableActionMenu({ actions, size = 'sm' }: TableActionMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

    return (
        <div ref={ref} className="relative inline-flex">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={`action-menu inline-flex items-center justify-center rounded-lg transition-all hover:bg-white/[0.06] ${size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'}`}
                aria-label="Actions"
            >
                <MoreHorizontal className={`${iconSize} text-zinc-500`} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 backdrop-blur-xl">
                    {actions.map((action, i) => (
                        <div key={i}>
                            {action.divider && i > 0 && <div className="my-1 h-px bg-white/[0.06]" />}
                            <button
                                onClick={(e) => { e.stopPropagation(); action.onClick(); setOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                            >
                                <action.icon className={`w-3.5 h-3.5 ${action.color || 'text-zinc-500'}`} />
                                {action.label}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Pre-built action factories
export function useTableActions() {
    const router = useRouter();

    const auditPage = (url: string) => ({
        label: 'Run Audit',
        icon: ScanSearch,
        color: 'text-emerald-400',
        onClick: () => router.push(`/dashboard/audit?url=${encodeURIComponent(url)}`),
    });

    const analyzeWithAI = (context: string, site?: string) => ({
        label: 'Analyze with AI',
        icon: Sparkles,
        color: 'text-cyan-400',
        onClick: () => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: context, site } })),
    });

    const trackKeyword = (keyword: string) => ({
        label: 'Track Keyword',
        icon: Target,
        color: 'text-amber-400',
        onClick: () => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Set up tracking and analysis for the keyword "${keyword}". What's the best strategy to improve its ranking?` } })),
    });

    const optimizePage = (url: string) => ({
        label: 'Optimize Page',
        icon: Zap,
        color: 'text-violet-400',
        onClick: () => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Analyze and provide optimization recommendations for ${url}` } })),
    });

    const viewTrend = (query: string) => ({
        label: 'View Trend',
        icon: TrendingUp,
        color: 'text-blue-400',
        onClick: () => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Show me the detailed trend and analysis for "${query}" keyword performance` } })),
    });

    const copyToClipboard = (text: string) => ({
        label: 'Copy',
        icon: Copy,
        color: 'text-zinc-500',
        onClick: () => navigator.clipboard.writeText(text),
    });

    const openExternal = (url: string) => ({
        label: 'Open in Browser',
        icon: ExternalLink,
        color: 'text-zinc-500',
        onClick: () => window.open(url.startsWith('http') ? url : `https://${url}`, '_blank'),
    });

    const generateContent = (keyword: string) => ({
        label: 'Generate Content',
        icon: FileText,
        color: 'text-emerald-400',
        divider: true,
        onClick: () => window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question: `Generate an SEO-optimized blog post outline targeting the keyword "${keyword}"` } })),
    });

    const viewAnalytics = (page: string) => ({
        label: 'View Analytics',
        icon: BarChart3,
        color: 'text-blue-400',
        onClick: () => router.push(`/dashboard/analytics`),
    });

    return {
        auditPage, analyzeWithAI, trackKeyword, optimizePage,
        viewTrend, copyToClipboard, openExternal, generateContent, viewAnalytics,
    };
}
