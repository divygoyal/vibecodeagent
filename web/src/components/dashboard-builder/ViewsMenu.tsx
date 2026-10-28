'use client';

/**
 * "Views" menu of the dashboard controls (round 9, savedViews.ts). The owner saves the current state
 * (dates, comparison, filters, switchers, drill) under a name, applies, deletes and picks a default view.
 * A share viewer only gets "Copy link to this view": the URL already carries their state, and the owner's
 * list never reaches them.
 */
import { useState } from 'react';
import { Bookmark, Check, Link2, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui';
import { MAX_VIEW_NAME } from '@/lib/builder/savedViews';
import type { SavedView } from '@/lib/builder/types';

export interface ViewsHandlers {
    /** Owner pages: the saved views, the default one, and the actions that change them. Missing = share viewer. */
    owner?: {
        views: SavedView[];
        defaultId?: string;
        /** The saved view equal to the current state, if any. */
        currentId?: string;
        canSave: boolean;
        onSave: (name: string) => Promise<string | null>;
        onDelete: (id: string) => void;
        onDefault: (id: string | null) => void;
    };
    /** Opens a view: replaces the state keys of the URL. */
    onApply: (query: string) => void;
    /** Back to what the dashboard opens with (the default view, else the dashboard's own defaults). */
    onReset: () => void;
    /** True when a default view exists (the reset row then names it). */
    hasDefault: boolean;
    /** The link to the current view (state keys only). */
    link: () => string;
}

async function copyLink(url: string) {
    try {
        await navigator.clipboard.writeText(url);
        toast.success('Link to this view copied');
    } catch {
        toast.error('Could not copy. Copy the address from the browser bar instead.');
    }
}

export function ViewsMenu({ handlers, size = 'md' }: { handlers: ViewsHandlers; size?: 'sm' | 'md' }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const owner = handlers.owner;
    const count = owner?.views.length ?? 0;
    const save = async () => {
        if (!owner || busy) return;
        setBusy(true);
        setErr(null);
        const problem = await owner.onSave(name);
        setBusy(false);
        if (problem) setErr(problem);
        else { setName(''); toast.success('View saved'); }
    };
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setErr(null); setName(''); } }}>
            <PopoverTrigger asChild>
                <button type="button" aria-label={count ? `Views (${count})` : 'Views'} data-pdf-ignore="true"
                    className={cn('inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-body-sm font-medium text-fg-secondary transition-colors duration-120 hover:bg-subtle hover:text-fg', size === 'sm' ? 'h-8' : 'h-9')}>
                    <Bookmark aria-hidden size={16} strokeWidth={1.75} />
                    <span>Views</span>
                    {count ? <span className="rounded-badge bg-subtle px-1.5 text-caption text-fg-muted">{count}</span> : null}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1.5" aria-label="Views">
                <button type="button" onClick={() => { handlers.onReset(); setOpen(false); }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-body-sm text-fg hover:bg-subtle">
                    {handlers.hasDefault ? 'Default view' : 'Dashboard defaults'}
                    <span className="ml-auto text-caption text-fg-muted">{handlers.hasDefault ? 'Opens like this' : 'Clear filters and dates'}</span>
                </button>
                {owner ? (
                    <div role="list" aria-label="Saved views" className="max-h-64 overflow-y-auto">
                        {owner.views.map((v) => (
                            <div key={v.id} role="listitem" className="group flex items-center gap-1 rounded-md hover:bg-subtle">
                                <button type="button" onClick={() => { handlers.onApply(v.query); setOpen(false); }} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 px-2.5 py-1 text-left text-body-sm text-fg">
                                    <span className="truncate">{v.name}</span>
                                    {owner.currentId === v.id ? <Check aria-hidden size={14} className="shrink-0 text-brand-text" /> : null}
                                    {owner.defaultId === v.id ? <span className="shrink-0 rounded-badge bg-brand-soft px-1.5 text-caption text-brand-soft-fg">Default</span> : null}
                                </button>
                                <Tooltip content={owner.defaultId === v.id ? 'Default view. Click to clear' : 'Make default'}>
                                    <button type="button" aria-label={owner.defaultId === v.id ? `Stop opening on ${v.name}` : `Open on ${v.name} by default`} aria-pressed={owner.defaultId === v.id}
                                        onClick={() => owner.onDefault(owner.defaultId === v.id ? null : v.id)} className="tap-area rounded p-1 text-fg-muted hover:text-fg">
                                        <Star aria-hidden size={14} className={owner.defaultId === v.id ? 'fill-current text-brand-text' : undefined} />
                                    </button>
                                </Tooltip>
                                <Tooltip content="Delete view">
                                    <button type="button" aria-label={`Delete view ${v.name}`} onClick={() => owner.onDelete(v.id)} className="tap-area mr-1 rounded p-1 text-fg-muted hover:text-down">
                                        <Trash2 aria-hidden size={14} />
                                    </button>
                                </Tooltip>
                            </div>
                        ))}
                        {!owner.views.length ? <p className="px-2.5 py-2 text-body-sm text-fg-muted">No saved views yet. Set dates and filters, then save them here.</p> : null}
                    </div>
                ) : null}
                <div className="my-1 h-px bg-border-subtle" />
                {owner ? (
                    <form className="space-y-1.5 px-1.5 pb-1.5 pt-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                        <label className="block text-meta font-medium text-fg-muted" htmlFor="tc-view-name">Save current view as</label>
                        <div className="flex gap-1.5">
                            <input id="tc-view-name" value={name} maxLength={MAX_VIEW_NAME} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="Name, e.g. Mobile, last quarter" disabled={!owner.canSave}
                                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-body-sm text-fg placeholder:text-fg-muted" />
                            <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!name.trim() || !owner.canSave}>Save</Button>
                        </div>
                        {err ? <p role="alert" className="text-meta text-down">{err}</p> : null}
                    </form>
                ) : null}
                <button type="button" onClick={() => { void copyLink(handlers.link()); setOpen(false); }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-body-sm text-fg hover:bg-subtle">
                    <Link2 aria-hidden size={14} className="text-fg-muted" />Copy link to this view
                </button>
            </PopoverContent>
        </Popover>
    );
}
