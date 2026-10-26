'use client';

/**
 * Left editor panel (BUILDER.md 11.2-11.3): Widgets (search, groups, click to add, drag onto
 * the canvas) and Outline (pages and widgets in reading order; click selects and scrolls,
 * eye toggles "hide on phones").
 */
import { forwardRef, useMemo, useState } from 'react';
import { BarChart3, Eye, EyeOff, Globe2, Hash, Heading, Image as ImageIcon, LayoutGrid, LineChart, PieChart, Plus, Rows3, Table2, Type, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { SearchInput, Tabs, Tooltip } from '@/components/ui';
import { PALETTE_GROUPS, PALETTE_ORDER, widgetMeta, widgetTitle } from '@/lib/builder/registry';
import { readingOrder, updateWidget } from '@/lib/builder/docOps';
import { searchMetrics } from '@/lib/builder/catalog';
import type { DashboardDocV2, WidgetType } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { setPaletteDrag } from '../DashboardCanvas';

const ICONS: Record<WidgetType, LucideIcon> = {
    scorecard: Hash, 'kpi-strip': Rows3, timeseries: LineChart, bar: BarChart3, pie: PieChart, table: Table2,
    geo: Globe2, text: Type, section: Heading, image: ImageIcon, 'portfolio-grid': LayoutGrid,
};

export function WidgetIcon({ type, size = 16 }: { type: WidgetType; size?: number }) {
    const C = ICONS[type] ?? Hash;
    return <C aria-hidden size={size} strokeWidth={1.75} />;
}

export const LeftPanel = forwardRef<HTMLInputElement, { doc: DashboardDocV2; onAdd: (type: WidgetType) => void }>(function LeftPanel({ doc, onAdd }, searchRef) {
    const [tab, setTab] = useState<'widgets' | 'outline'>('widgets');
    const [q, setQ] = useState('');
    const items = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return PALETTE_ORDER;
        const metricHit = searchMetrics(s).length > 0;
        return PALETTE_ORDER.filter((t) => {
            const m = widgetMeta(t);
            return m.label.toLowerCase().includes(s) || m.keywords.some((k) => k.includes(s)) || (metricHit && !m.static);
        });
    }, [q]);
    return (
        <aside aria-label="Widgets and outline" className="flex h-full w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
            <div className="border-b border-border-subtle px-3 py-2">
                <Tabs variant="pills" ariaLabel="Left panel" value={tab} onValueChange={(v) => setTab(v as 'widgets' | 'outline')} items={[{ value: 'widgets', label: 'Widgets' }, { value: 'outline', label: 'Outline' }]} />
            </div>
            {tab === 'widgets' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="p-3"><SearchInput ref={searchRef} value={q} onValueChange={setQ} placeholder="Search widgets or metrics" size="sm" slashShortcut={false} /></div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                        {PALETTE_GROUPS.map((g) => {
                            const list = items.filter((t) => widgetMeta(t).group === g);
                            if (!list.length) return null;
                            return (
                                <div key={g} className="mb-2">
                                    <p className="px-2 py-1 text-caption uppercase tracking-[0.04em] text-fg-muted">{g}</p>
                                    {list.map((t) => {
                                        const m = widgetMeta(t);
                                        return (
                                            <Tooltip key={t} content={m.description} side="right">
                                                <button
                                                    type="button"
                                                    draggable
                                                    onDragStart={(e) => { setPaletteDrag(t); e.dataTransfer.setData('text/plain', t); e.dataTransfer.effectAllowed = 'copy'; }}
                                                    onDragEnd={() => setTimeout(() => setPaletteDrag(null), 50)}
                                                    onClick={() => onAdd(t)}
                                                    className="group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm text-fg hover:bg-subtle"
                                                >
                                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-subtle text-fg-secondary group-hover:bg-surface"><WidgetIcon type={t} /></span>
                                                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                                                    <Plus aria-hidden size={14} className="text-fg-faint opacity-0 group-hover:opacity-100" />
                                                </button>
                                            </Tooltip>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {!items.length ? <p className="px-2 py-4 text-body-sm text-fg-muted">Nothing matches “{q}”.</p> : null}
                    </div>
                    <p className="border-t border-border-subtle px-3 py-2 text-caption text-fg-muted">Click to add, or drag onto the canvas.</p>
                </div>
            ) : (
                <Outline doc={doc} />
            )}
        </aside>
    );
});

function Outline({ doc }: { doc: DashboardDocV2 }) {
    const pageId = useEditorStore((s) => s.pageId);
    const selectedId = useEditorStore((s) => s.selectedId);
    const setPage = useEditorStore((s) => s.setPage);
    const select = useEditorStore((s) => s.select);
    const apply = useEditorStore((s) => s.apply);
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {doc.pages.map((p) => (
                <div key={p.id} className="mb-2">
                    <button type="button" onClick={() => setPage(p.id)} className={cn('flex h-8 w-full items-center rounded-md px-2 text-left text-body-sm font-medium', p.id === pageId ? 'text-fg' : 'text-fg-muted hover:text-fg')}>{p.title}</button>
                    <ul className="ml-2 border-l border-border-subtle pl-2">
                        {readingOrder(p.layouts.lg).map((l) => {
                            const w = doc.widgets[l.i];
                            if (!w) return null;
                            const hidden = Boolean(w.mobile?.hidden);
                            return (
                                <li key={l.i} className={cn('group flex h-8 items-center gap-2 rounded-md px-1.5 text-body-sm', selectedId === w.id ? 'bg-brand-soft text-brand-soft-fg' : 'text-fg-secondary hover:bg-subtle')}>
                                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => {
                                        if (p.id !== pageId) setPage(p.id);
                                        select(w.id);
                                        setTimeout(() => document.querySelector(`[data-widget-id="${w.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
                                    }}>
                                        <WidgetIcon type={w.type} size={14} />
                                        <span className="truncate">{widgetTitle(w)}</span>
                                    </button>
                                    <button type="button" aria-label={hidden ? 'Show on phones' : 'Hide on phones'} title={hidden ? 'Hidden on phones' : 'Shown on phones'}
                                        onClick={() => apply((d) => updateWidget(d, { ...w, mobile: { ...(w.mobile ?? {}), hidden: !hidden } }))}
                                        className={cn('shrink-0 rounded p-0.5 hover:bg-surface', hidden ? 'text-fg-muted' : 'text-fg-faint opacity-0 group-hover:opacity-100')}>
                                        {hidden ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
                                    </button>
                                </li>
                            );
                        })}
                        {!p.layouts.lg.length ? <li className="px-1.5 py-1 text-meta text-fg-faint">No widgets</li> : null}
                    </ul>
                </div>
            ))}
        </div>
    );
}
