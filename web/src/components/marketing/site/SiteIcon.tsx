import { Favicon, type FaviconSize } from '@/components/ui';
import { cn } from '@/lib/cn';

const RESERVED = /\.(example|test|invalid|localhost|local)\/?$/i;

/**
 * Favicon for real hosts; for the demo's reserved `.example` hosts a letter
 * tile straight away, so demo pages make no favicon requests at all.
 */
export function SiteIcon({ host, size = 20, className }: { host: string; size?: FaviconSize; className?: string }) {
    const clean = host.replace(/^sc-domain:/, '').replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (RESERVED.test(clean)) {
        const radius = size >= 64 ? 'rounded-xl' : size >= 24 ? 'rounded-md' : 'rounded-[4px]';
        return (
            <span
                aria-hidden
                className={cn('inline-flex shrink-0 items-center justify-center bg-subtle font-semibold text-fg-secondary', radius, className)}
                style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.5)) }}
            >
                {(clean[0] ?? '?').toUpperCase()}
            </span>
        );
    }
    return <Favicon host={host} size={size} className={className} />;
}
