'use client';

import { type LucideIcon, Search, BarChart3, Radar, AlertCircle, Loader2 } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    actionHref?: string;
    variant?: 'default' | 'connect' | 'error' | 'loading' | 'inline';
    iconColor?: string;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    actionHref,
    variant = 'default',
    iconColor = 'emerald',
}: EmptyStateProps) {
    if (variant === 'inline') {
        return (
            <div className="text-center py-6 text-sm text-zinc-500">
                {Icon && <Icon className="w-5 h-5 mx-auto mb-2 text-zinc-600" />}
                <p>{title}</p>
                {description && <p className="text-xs text-zinc-600 mt-1">{description}</p>}
            </div>
        );
    }

    if (variant === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
                <p className="text-sm text-zinc-400 font-medium">{title}</p>
                {description && <p className="text-xs text-zinc-600 mt-1 max-w-sm">{description}</p>}
            </div>
        );
    }

    const colorMap: Record<string, { iconBg: string; iconText: string; border: string }> = {
        emerald: { iconBg: 'from-emerald-500/20 to-cyan-500/20', iconText: 'text-emerald-400', border: 'border-emerald-500/20' },
        blue: { iconBg: 'from-blue-500/20 to-indigo-500/20', iconText: 'text-blue-400', border: 'border-blue-500/20' },
        red: { iconBg: 'from-red-500/20 to-orange-500/20', iconText: 'text-red-400', border: 'border-red-500/20' },
        amber: { iconBg: 'from-amber-500/20 to-yellow-500/20', iconText: 'text-amber-400', border: 'border-amber-500/20' },
    };

    const colors = colorMap[iconColor] || colorMap.emerald;

    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            {Icon && (
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colors.iconBg} border ${colors.border} flex items-center justify-center mb-5`}>
                    <Icon className={`w-7 h-7 ${colors.iconText}`} />
                </div>
            )}
            <h3 className="text-base font-bold text-white mb-2">{title}</h3>
            {description && (
                <p className="text-sm text-zinc-500 max-w-md leading-relaxed mb-5">{description}</p>
            )}
            {actionLabel && (onAction || actionHref) && (
                actionHref ? (
                    <a
                        href={actionHref}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-semibold text-black hover:opacity-90 transition"
                    >
                        {actionLabel}
                    </a>
                ) : (
                    <button
                        onClick={onAction}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-semibold text-black hover:opacity-90 transition"
                    >
                        {actionLabel}
                    </button>
                )
            )}
        </div>
    );
}

/* Pre-configured empty states for common patterns */
export function ConnectGoogleState({ feature }: { feature?: string }) {
    return (
        <EmptyState
            icon={Search}
            title="Connect Google to get started"
            description={feature
                ? `Sign in with your Google account to unlock ${feature}. We'll pull your Analytics and Search Console data automatically.`
                : 'Sign in with your Google account to access Search Console and Analytics data.'
            }
            actionLabel="Connect Google"
            actionHref="/api/auth/signin/google"
        />
    );
}

export function NoDataState({ message }: { message?: string }) {
    return (
        <EmptyState
            variant="inline"
            title={message || 'No data available yet'}
            description="Check back after your site has accumulated some data."
        />
    );
}

export function ErrorState({
    title,
    description,
    onRetry,
}: {
    title?: string;
    description?: string;
    onRetry?: () => void;
}) {
    return (
        <EmptyState
            icon={AlertCircle}
            title={title || 'Something went wrong'}
            description={description || 'An error occurred while loading data. Please try again.'}
            actionLabel={onRetry ? 'Retry' : undefined}
            onAction={onRetry}
            variant="error"
            iconColor="red"
        />
    );
}
