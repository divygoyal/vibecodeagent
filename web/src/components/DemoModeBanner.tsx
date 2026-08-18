'use client';

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertTriangle } from 'lucide-react';

type DemoModeBannerProps = {
    title?: string;
    badgeLabel?: string;
    description: string;
    secondaryDescription?: string;
    primaryActionLabel?: string;
    secondaryActionLabel?: string;
    secondaryActionHref?: string;
    className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

export default function DemoModeBanner({
    title = 'Showing Demo Data',
    badgeLabel = 'Demo Mode',
    description,
    secondaryDescription,
    primaryActionLabel = 'Connect Different Account',
    secondaryActionLabel = 'Set up GA4 →',
    secondaryActionHref = 'https://analytics.google.com/analytics/web/',
    className,
}: DemoModeBannerProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const callbackUrl = useMemo(() => {
        const currentSearch = searchParams?.toString();
        return currentSearch ? `${pathname}?${currentSearch}` : pathname || '/dashboard';
    }, [pathname, searchParams]);

    return (
        <div
            className={cx(
                'relative overflow-hidden rounded-2xl border border-amber-500/25 bg-[linear-gradient(135deg,rgba(34,18,4,0.96),rgba(19,12,5,0.98)_58%,rgba(40,19,7,0.94))] shadow-[0_0_0_1px_rgba(245,158,11,0.06),0_24px_70px_rgba(20,8,1,0.45)]',
                className,
            )}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.14),transparent_36%)]" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-400 to-orange-500" />
            <div className="relative flex items-start gap-3 p-4 pl-5 sm:gap-4 sm:p-6 sm:pl-7">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 shadow-[0_12px_32px_rgba(245,158,11,0.14)]">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold tracking-[-0.02em] text-white sm:text-[28px] sm:leading-none sm:text-[30px] sm:font-semibold">
                            <span className="sm:hidden">{title}</span>
                            <span className="hidden sm:inline">{title}</span>
                        </h3>
                        <span className="rounded-full border border-amber-500/25 bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                            {badgeLabel}
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-zinc-200 sm:text-lg sm:leading-7">
                        {description}
                    </p>
                    {secondaryDescription ? (
                        <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                            {secondaryDescription}
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => signIn('google', { callbackUrl }, { prompt: 'select_account consent' })}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-sm font-bold text-black shadow-[0_16px_36px_rgba(249,115,22,0.24)] transition hover:opacity-90 sm:px-6"
                        >
                            {primaryActionLabel}
                        </button>
                        <a
                            href={secondaryActionHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-amber-300/90 transition hover:text-amber-200"
                        >
                            {secondaryActionLabel}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
