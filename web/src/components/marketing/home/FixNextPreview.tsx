import { fmtCompact, fmtFull } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DemoAction, DemoActions } from '../demo/types';
import { BrowserFrame } from '../site/Section';

const IMPACT: Record<DemoAction['impact'], { label: string; dot: string }> = {
    high: { label: 'High impact', dot: 'bg-warn' },
    medium: { label: 'Medium impact', dot: 'bg-info' },
    low: { label: 'Low impact', dot: 'bg-fg-faint' },
};

/**
 * The site Actions page in miniature: one demo site's top tasks, computed with
 * the app's rules from sample data (buildMarketingDemoActions). Numbers first,
 * evidence in one muted line (critique 2.9 rule 3).
 */
export function FixNextPreview({ data, className }: { data: DemoActions; className?: string }) {
    return (
        <BrowserFrame url={`trafficclaw.com/dashboard/s/${data.site.host}/actions`} className={className} bodyClassName="p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                <p className="min-w-0 truncate text-title-sm text-fg">
                    {data.site.label} <span className="font-normal text-fg-muted">· Actions</span>
                </p>
                <p className="text-meta text-fg-muted">sample data</p>
            </div>
            <ol className="mt-3 space-y-2">
                {data.actions.map((a, i) => (
                    <li key={a.id} className="rounded-control border border-border-subtle bg-surface px-3.5 py-3 shadow-xs">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 w-4 shrink-0 text-center text-meta font-medium tabular-nums text-fg-muted">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-body font-medium text-fg [overflow-wrap:anywhere]">{a.title}</p>
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-fg-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span aria-hidden className={cn('size-1.5 rounded-full', IMPACT[a.impact].dot)} />
                                        {IMPACT[a.impact].label}
                                    </span>
                                    <span aria-hidden>·</span>
                                    <span>{a.typeLabel}</span>
                                    <span aria-hidden>·</span>
                                    <span className="tabular-nums">position {a.position.toFixed(1)}</span>
                                    <span aria-hidden className="hidden sm:inline">·</span>
                                    <span className="hidden tabular-nums sm:inline">{fmtFull(a.impressions)} impressions</span>
                                </p>
                                {a.page ? <p className="mt-0.5 truncate font-mono text-caption text-fg-muted" title={a.page}>{a.page}</p> : null}
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-stat-sm tabular-nums text-fg" title={`+${fmtFull(a.gain)} clicks a month`}>+{fmtCompact(a.gain)}</p>
                                <p className="text-meta text-fg-muted">clicks/mo</p>
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
            <p className="mt-3 px-1 text-meta text-fg-muted">
                Ranked by extra clicks a month if the query reaches position 5. Each task opens to its evidence and a suggested fix.
            </p>
        </BrowserFrame>
    );
}
