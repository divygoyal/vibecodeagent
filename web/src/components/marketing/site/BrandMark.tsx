import Link from 'next/link';

import { cn } from '@/lib/cn';
import { BRAND_NAME, isDefaultBrand, LOGO_LIGHT_SRC } from '@/lib/brand';

/**
 * The TrafficClaw mark (claw slashes + trend line) recoloured to pine, with a
 * one-colour wordmark (DESIGN 2.8). Other brands (env NEXT_PUBLIC_LOGO_*) keep
 * their own light logo file.
 */
export function BrandIcon({ size = 28, className }: { size?: number; className?: string }) {
    return (
        <svg aria-hidden viewBox="0 0 36 36" width={size} height={size} fill="none" className={cn('shrink-0', className)}>
            <defs>
                <linearGradient id="tc-mark-pine" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#43b28e" />
                    <stop offset="1" stopColor="#0d3a2c" />
                </linearGradient>
            </defs>
            <rect width="36" height="36" rx="10" fill="url(#tc-mark-pine)" />
            <g stroke="rgba(0,0,0,0.32)" strokeWidth="3" strokeLinecap="round">
                <line x1="10" y1="26" x2="16" y2="10" />
                <line x1="16" y1="26" x2="22" y2="10" />
                <line x1="22" y1="26" x2="28" y2="10" />
            </g>
            <path d="M8 28 L14 22 L20 24 L28 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="28" cy="12" r="2" fill="white" />
        </svg>
    );
}

export function BrandMark({ className, href = '/' }: { className?: string; href?: string }) {
    return (
        <Link href={href} className={cn('relative inline-flex items-center gap-2 rounded-control pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1', className)} aria-label={`${BRAND_NAME} home`}>
            {isDefaultBrand() ? (
                <BrandIcon />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={LOGO_LIGHT_SRC} alt="" width={28} height={28} className="size-7" />
            )}
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-fg">{BRAND_NAME}</span>
        </Link>
    );
}
