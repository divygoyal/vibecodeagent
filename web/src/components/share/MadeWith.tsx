import { cn } from '@/lib/cn';
import { BRAND_NAME } from '@/lib/brand';
import { BrandMark } from '@/components/shell/BrandMark';
import { madeWithUrl, type MadeWithKind } from '@/lib/growth/madeWith';

/**
 * "Made with TrafficClaw — free" footer link for public dashboards, share pages and embeds. A quiet pill: the pine
 * mark, one line of muted text, the same tokens as the page (light and dark). It sits in normal flow under the content,
 * so an embed's reported height includes it. The owner can switch it off (see lib/growth/madeWith.ts).
 */
export function MadeWithTrafficClaw({ kind, className }: { kind: MadeWithKind; className?: string }) {
    return (
        <a
            href={madeWithUrl(kind)}
            target="_blank"
            rel="noopener"
            data-made-with={kind}
            className={cn('tap-area inline-flex max-w-full items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-meta text-fg-muted shadow-xs transition-colors hover:text-fg', className)}
        >
            <BrandMark size={14} />
            <span className="truncate">Made with {BRAND_NAME} <span aria-hidden>—</span> free</span>
        </a>
    );
}
