import { Wrench } from 'lucide-react';

import { Favicon, MetricDelta } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtCompact, fmtFull } from '@/lib/format';
import type { PortfolioSite } from '@/lib/portfolio/types';
import { ClaudeMark } from '../marketing/home/BrandMarks';

export interface ClickMovers {
    kind: 'lost' | 'gained';
    rows: { site: PortfolioSite; diff: number }[];
}

/**
 * The sites that lost (or, with `kinds` including 'gained' and nobody lost, gained) the most Google clicks
 * against the previous period: the answer `top_movers` gives. Sites under 100 clicks before are left out.
 */
export function topClickMovers(sites: PortfolioSite[], kinds: ClickMovers['kind'][] = ['lost']): ClickMovers | null {
    const withPrev = sites.filter((s) => s.search && s.search.prev && s.search.prev.clicks >= 100);
    for (const kind of kinds) {
        const rows = withPrev
            .map((s) => ({ site: s, diff: s.search!.cur.clicks - s.search!.prev!.clicks }))
            .filter((r) => (kind === 'lost' ? r.diff < 0 : r.diff > 0))
            .sort((a, b) => (kind === 'lost' ? a.diff - b.diff : b.diff - a.diff))
            .slice(0, 3);
        if (rows.length) return { kind, rows };
    }
    return null;
}

/**
 * A Claude conversation with TrafficClaw connected: the question, the real MCP tool it calls and the answer,
 * computed from portfolio numbers. Shared by the home page (demo portfolio) and Connect AI (the user's own sites).
 */
export function McpTranscript({ movers, caption, className }: { movers: ClickMovers; caption: string; className?: string }) {
    const top = movers.rows[0];
    const lost = movers.kind === 'lost';
    const more = movers.rows.length - 1;
    return (
        <figure className={cn('min-w-0', className)}>
            <div className="overflow-hidden rounded-panel border border-border-subtle bg-canvas shadow-card">
                <div className="flex items-center gap-2 border-b border-border-subtle bg-surface px-4 py-2.5">
                    <ClaudeMark size={16} />
                    <span className="text-body-sm font-medium text-fg">Claude</span>
                    <span className="text-meta text-fg-muted">with TrafficClaw connected</span>
                </div>
                <div className="space-y-4 p-4 md:p-6">
                    <p className="ml-auto max-w-[85%] rounded-[18px] rounded-br-md bg-subtle px-4 py-2.5 text-body text-fg">
                        Which of my sites {lost ? 'lost' : 'gained'} the most Google clicks this month?
                    </p>
                    <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-meta text-fg-muted">
                        <Wrench aria-hidden size={12} strokeWidth={1.75} />
                        Used <code className="font-mono text-fg-secondary">top_movers</code>
                    </p>
                    <div className="text-body text-fg">
                        <p>
                            <strong className="font-semibold">{top.site.label}</strong> {lost ? 'lost' : 'gained'} the most: {fmtFull(top.site.search!.cur.clicks)} clicks,
                            {lost ? ' down' : ' up'} from {fmtFull(top.site.search!.prev!.clicks)}.
                            {more > 0 ? ` ${more} more ${more === 1 ? 'site is' : 'sites are'} ${lost ? 'down' : 'up'} too:` : ''}
                        </p>
                        <ul className="mt-3 divide-y divide-border-subtle rounded-control border border-border-subtle bg-surface">
                            {movers.rows.map(({ site }) => (
                                <li key={site.key} className="flex items-center gap-3 px-3 py-2.5">
                                    <Favicon host={site.host} size={16} />
                                    <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{site.label}</span>
                                    <span className="text-body-sm tabular-nums text-fg"><span className="sm:hidden">{fmtCompact(site.search!.cur.clicks)}</span><span className="max-sm:hidden">{fmtFull(site.search!.cur.clicks)}</span></span>
                                    <MetricDelta metric="clicks" current={site.search!.cur.clicks} previous={site.search!.prev?.clicks} className="w-14 justify-end sm:w-16" />
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <figcaption className="mt-3 text-meta text-fg-secondary">{caption}</figcaption>
        </figure>
    );
}
