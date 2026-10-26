import { useId } from 'react';

import { BRAND_NAME } from '@/lib/brand';

/**
 * TrafficClaw mark in pine (DESIGN 2.8 recommendation: same shape, pine
 * gradient; owner OK pending). Wordmark is Geist 600, one colour.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    return (
        <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" fill="none" className="shrink-0">
            <defs>
                <linearGradient id={`bm-${id}`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#43b28e" />
                    <stop offset="1" stopColor="#0d3a2c" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill={`url(#bm-${id})`} />
            <g stroke="rgba(0,0,0,0.28)" strokeWidth="2.2" strokeLinecap="round">
                <line x1="8" y1="24" x2="13" y2="9" />
                <line x1="13" y1="24" x2="18" y2="9" />
                <line x1="18" y1="24" x2="23" y2="9" />
            </g>
            <path d="M5 25 L11 19 L17 21 L25 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="25" cy="10" r="1.5" fill="white" />
        </svg>
    );
}

export function Wordmark({ className }: { className?: string }) {
    return <span className={className ?? 'text-title-sm tracking-[-0.02em] text-fg'}>{BRAND_NAME}</span>;
}
