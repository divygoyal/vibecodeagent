'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { SiteEntry } from '@/lib/sites/siteDirectory';
import { Favicon } from '@/components/ui/Favicon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentSite } from '@/components/shell/useCurrentSite';

/**
 * Small "which site is this about?" pill for forms and composers (Ask).
 * It reads and sets the shell's current site: picking one saves the Search
 * Console + GA4 pair to the workspace without leaving the page.
 */
export function SiteChip({ className, disabled }: { className?: string; disabled?: boolean }) {
    const { site, sites, loading, selectSite } = useCurrentSite();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? sites.filter((s) => s.label.toLowerCase().includes(q) || s.host.includes(q) || (s.ga4Name ?? '').toLowerCase().includes(q)) : sites;
    }, [query, sites]);

    const choose = (entry: SiteEntry) => {
        setOpen(false);
        setQuery('');
        selectSite(entry, { navigate: false });
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(filtered.length - 1, a + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = filtered[active];
            if (row) choose(row);
        }
        requestAnimationFrame(() => listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }));
    };

    if (loading && sites.length === 0) return <Skeleton className={cn('h-8 w-36 rounded-full', className)} delay={0} />;

    const label = site?.label ?? (sites.length === 0 ? 'No sites yet' : 'Pick a site');

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setQuery(''); setActive(0); } }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled || sites.length === 0}
                    aria-label={`Site for this question: ${label}. Change site`}
                    className="tc-control inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-surface pl-2 pr-2.5 text-body-sm text-fg transition-colors duration-120 hover:border-border-strong hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {site ? <Favicon host={site.gscSiteUrl ?? site.host} size={16} /> : <Globe aria-hidden size={14} className="text-fg-muted" />}
                    <span className="min-w-0 truncate">{label}</span>
                    <ChevronDown aria-hidden size={14} className="shrink-0 text-fg-muted" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-72 max-w-[calc(100vw-16px)] p-0" aria-label="Choose a site">
                <div className="flex items-center gap-2 border-b border-border-subtle px-3">
                    <Search aria-hidden size={16} className="shrink-0 text-fg-muted" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        onKeyDown={onKey}
                        placeholder="Search sites"
                        aria-label="Search sites"
                        className="h-10 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
                    />
                </div>
                <div ref={listRef} role="listbox" aria-label="Sites" className="max-h-[280px] overflow-y-auto p-1">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-6 text-center text-body-sm text-fg-muted">No site matches</p>
                    ) : filtered.map((s, i) => (
                        <div
                            key={s.host}
                            role="option"
                            aria-selected={site?.host === s.host}
                            data-active={i === active}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => choose(s)}
                            className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-body text-fg', i === active && 'bg-subtle')}
                        >
                            <Favicon host={s.gscSiteUrl ?? s.host} size={16} />
                            <span className="min-w-0 flex-1 truncate">{s.label}</span>
                            {site?.host === s.host ? <Check aria-hidden size={16} className="shrink-0 text-fg-muted" /> : null}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
