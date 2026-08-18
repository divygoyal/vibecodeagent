'use client';

/**
 * TrafficClaw Logo Component
 * Usage: <Logo /> or <Logo size="sm" /> or <Logo iconOnly />
 */

export function LogoIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 36 36"
            width={size}
            height={size}
            fill="none"
            className={className}
        >
            <defs>
                <linearGradient id="logo-icon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="50%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
            </defs>

            <rect width="36" height="36" rx="10" fill="url(#logo-icon-grad)" />

            {/* Claw marks */}
            <line x1="10" y1="26" x2="16" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
            <line x1="16" y1="26" x2="22" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
            <line x1="22" y1="26" x2="28" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />

            {/* Upward trend line */}
            <path d="M8 28 L14 22 L20 24 L28 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="28" cy="12" r="2" fill="white" />
        </svg>
    );
}

const CLAW_BRAND_ACCENT = '#7AD9DA';

export function Logo({
    size = 'md',
    iconOnly = false,
    className = '',
}: {
    size?: 'sm' | 'md' | 'lg';
    iconOnly?: boolean;
    className?: string;
}) {
    const sizes = {
        sm: { icon: 24, text: 'text-sm', gap: 'gap-1.5' },
        md: { icon: 32, text: 'text-lg', gap: 'gap-2' },
        lg: { icon: 40, text: 'text-2xl', gap: 'gap-3' },
    };

    const s = sizes[size];

    return (
        <div className={`flex items-center ${s.gap} ${className}`}>
            <LogoIcon size={s.icon} />
            {!iconOnly && (
                <span className={`${s.text} font-extrabold tracking-tight`}>
                    <span className="text-white">Traffic</span>
                    <span style={{ color: CLAW_BRAND_ACCENT }}>Claw</span>
                </span>
            )}
        </div>
    );
}

export default Logo;
