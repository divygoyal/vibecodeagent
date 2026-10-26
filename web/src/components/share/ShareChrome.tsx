import type { ReactNode } from 'react';
import Link from 'next/link';
import { Eye, Link2Off } from 'lucide-react';

import { cn } from '@/lib/cn';
import { BRAND_NAME } from '@/lib/brand';
import { fmtCompact } from '@/lib/format';
import { buttonClasses } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

/**
 * Chrome shared by the public share pages (/share/[token], its events report,
 * the old layouts): light by default, ?theme=dark through the head script
 * (DESIGN 2.1). Same tokens and widths as the app.
 */

/** Page width for share pages (the app's content width). */
export const SHARE_CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 md:px-6';

const HOME_URL = 'https://trafficclaw.com';

/** Page root: canvas background, app type scale. */
export function SharePage({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('tc-root min-h-dvh overflow-x-hidden bg-canvas text-fg', className)}>{children}</div>;
}

export interface ShareBrandingLike {
    logoUrl?: string | null;
    companyName?: string | null;
}

/** "sc-domain:acme.com" / "https://www.acme.com/" -> "acme.com" */
export function shareSiteLabel(siteUrl?: string | null): string {
    if (!siteUrl) return '';
    return siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

/** Owner logo when the share has one, else the TrafficClaw mark + wordmark. */
export function ShareBrand({ branding, size = 24 }: { branding?: ShareBrandingLike | null; size?: number }) {
    if (branding?.logoUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.companyName || 'Logo'} className="h-7 w-auto max-w-[160px] shrink-0 object-contain" />
        );
    }
    return (
        <a href={HOME_URL} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-2" aria-label={`${BRAND_NAME} home`}>
            <BrandMark size={size} />
            <Wordmark />
        </a>
    );
}

/**
 * Header of a share page: brand, the site, a "Shared" badge and the view count.
 * `actions` sit at the right (date picker, live pill, back link).
 */
export function ShareHeader({
    siteUrl,
    title,
    views,
    branding,
    label = 'Shared dashboard',
    actions,
}: {
    siteUrl?: string | null;
    /** Defaults to the site host. */
    title?: ReactNode;
    views?: number;
    branding?: ShareBrandingLike | null;
    label?: string;
    actions?: ReactNode;
}) {
    const host = shareSiteLabel(siteUrl);
    return (
        <header className="border-b border-border-subtle bg-surface">
            <div className={cn(SHARE_CONTAINER, 'flex flex-wrap items-center gap-x-4 gap-y-3 py-3')}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ShareBrand branding={branding} />
                    <span aria-hidden className="h-5 w-px bg-border-subtle max-sm:hidden" />
                    <div className="flex min-w-0 items-center gap-2 max-sm:hidden">
                        {host ? <Favicon host={host} size={20} /> : null}
                        <h1 className="truncate text-title-sm text-fg">{title ?? (host || label)}</h1>
                        <Badge variant="outline">{branding?.companyName || label}</Badge>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {actions}
                    {typeof views === 'number' ? (
                        <span className="inline-flex items-center gap-1.5 text-meta text-fg-muted tabular-nums" title={`${views.toLocaleString()} views of this share`}>
                            <Eye aria-hidden size={14} strokeWidth={1.75} />
                            {fmtCompact(views)} views
                        </span>
                    ) : null}
                </div>
                {/* Phones: the site on its own row under the brand. */}
                <div className="flex w-full min-w-0 items-center gap-2 sm:hidden">
                    {host ? <Favicon host={host} size={20} /> : null}
                    <h1 className="truncate text-title-sm text-fg">{title ?? (host || label)}</h1>
                    <Badge variant="outline">{branding?.companyName || label}</Badge>
                </div>
            </div>
        </header>
    );
}

/** "Built with TrafficClaw" line under a share page. */
export function ShareFooter({ compact = false, className }: { compact?: boolean; className?: string }) {
    return (
        <footer className={cn('text-center', compact ? 'py-4' : 'py-8', className)}>
            <a href={HOME_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-meta text-fg-muted transition-colors hover:text-fg">
                <BrandMark size={14} />
                Built with {BRAND_NAME}
            </a>
        </footer>
    );
}

/** Invalid or revoked token. */
export function ShareNotFound({ isEmbed = false, what = 'shared dashboard' }: { isEmbed?: boolean; what?: string }) {
    return (
        <SharePage className="flex items-center justify-center p-6">
            <EmptyState
                variant="page"
                icon={Link2Off}
                title={`This ${what} is not available`}
                description="The link is wrong, or the owner stopped sharing it."
                actions={isEmbed ? null : (
                    <Link href={HOME_URL} className={buttonClasses({ variant: 'secondary' })}>Visit {BRAND_NAME}</Link>
                )}
            />
        </SharePage>
    );
}
