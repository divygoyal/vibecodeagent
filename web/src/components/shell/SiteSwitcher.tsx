'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronsUpDown, LayoutGrid, Plus, Search } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { SiteEntry } from '@/lib/sites/siteDirectory';
import { Badge } from '@/components/ui/Badge';
import { Favicon } from '@/components/ui/Favicon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useShell } from './ShellContext';
import { useCurrentSite } from './useCurrentSite';

function kindBadge(e: SiteEntry) {
    if (e.gscKind === 'domain') return 'Domain';
    if (e.gscKind === 'prefix') return 'Prefix';
    return 'GA4';
}

/**
 * Picks the current site (DESIGN 3.1). Shows "All sites" on Portfolio.
 * Keyboard: Enter/Space opens, typing filters, arrows move, Enter selects; `g s` opens it from anywhere.
 */
export function SiteSwitcher({ collapsed = false, onNavigate, open, onOpenChange }: {
    collapsed?: boolean;
    onNavigate?: () => void;
    /** Controlled open state. Omit to use the shell's (which the `g s` shortcut opens). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const router = useRouter();
    const { site, sites, loading, fromRoute, selectSite } = useCurrentSite();
    const shell = useShell();
    const controlled = open !== undefined && onOpenChange !== undefined;
    const switcherOpen = controlled ? open : shell.switcherOpen;
    const setSwitcherOpen = controlled ? onOpenChange : shell.setSwitcherOpen;
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const showAll = !fromRoute;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? sites.filter((s) => s.label.toLowerCase().includes(q) || s.host.includes(q) || (s.ga4Name ?? '').toLowerCase().includes(q)) : sites;
    }, [query, sites]);
    // Row 0 is "All sites", then the filtered sites.
    const rows: (SiteEntry | 'all')[] = useMemo(() => ['all', ...filtered], [filtered]);

    const choose = (row: SiteEntry | 'all') => {
        setSwitcherOpen(false);
        setQuery('');
        onNavigate?.();
        if (row === 'all') {
            router.push('/dashboard');
            return;
        }
        selectSite(row);
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(rows.length - 1, a + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = rows[active];
            if (row) choose(row);
        }
        requestAnimationFrame(() => listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }));
    };

    const label = showAll ? 'All sites' : site?.label ?? (loading ? '' : 'Pick a site');
    const trigger = (
        <button
            type="button"
            aria-label={`Current site: ${label || 'loading'}. Switch site`}
            className={cn(
                'tc-control flex h-10 w-full items-center gap-2 rounded-control border border-border bg-surface text-left transition-colors duration-120 hover:border-border-strong',
                collapsed ? 'justify-center px-0' : 'px-2.5',
            )}
        >
            {showAll || !site ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-badge bg-subtle text-fg-muted"><LayoutGrid aria-hidden size={14} /></span>
            ) : (
                <Favicon host={site.gscSiteUrl ?? site.host} size={20} />
            )}
            {collapsed ? null : (
                <>
                    {loading && !label ? <Skeleton className="h-3.5 w-28" delay={0} /> : <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">{label}</span>}
                    <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-fg-muted" />
                </>
            )}
        </button>
    );

    return (
        <Popover open={switcherOpen} onOpenChange={(o) => { setSwitcherOpen(o); if (o) { setQuery(''); setActive(0); } }}>
            {collapsed ? (
                <Tooltip content={label || 'Switch site'} side="right"><PopoverTrigger asChild>{trigger}</PopoverTrigger></Tooltip>
            ) : (
                <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            )}
            <PopoverContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-80 max-w-[calc(100vw-16px)] p-0" aria-label="Switch site">
                <div className="flex items-center gap-2 border-b border-border-subtle px-3">
                    <Search aria-hidden size={16} className="shrink-0 text-fg-muted" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(e.target.value ? 1 : 0); }}
                        onKeyDown={onKey}
                        placeholder="Search sites"
                        aria-label="Search sites"
                        aria-controls="site-switcher-list"
                        aria-activedescendant={`site-row-${active}`}
                        role="combobox"
                        aria-expanded
                        className="h-11 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
                    />
                </div>
                <div ref={listRef} id="site-switcher-list" role="listbox" aria-label="Sites" className="max-h-[320px] overflow-y-auto p-1">
                    {rows.map((row, i) => {
                        const isAll = row === 'all';
                        const selected = isAll ? showAll : !showAll && site?.host === row.host;
                        return (
                            <div
                                key={isAll ? '__all' : row.host}
                                id={`site-row-${i}`}
                                role="option"
                                aria-selected={selected}
                                data-active={i === active}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => choose(row)}
                                className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-body text-fg', i === active && 'bg-subtle')}
                            >
                                {isAll ? (
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded-badge bg-subtle text-fg-muted"><LayoutGrid aria-hidden size={14} /></span>
                                ) : (
                                    <Favicon host={row.gscSiteUrl ?? row.host} size={20} />
                                )}
                                <span className="min-w-0 flex-1 truncate">{isAll ? 'All sites' : row.label}</span>
                                {isAll ? <span className="text-meta text-fg-muted tabular-nums">{sites.length}</span> : <Badge>{kindBadge(row)}</Badge>}
                                {selected ? <Check aria-hidden size={14} className="shrink-0 text-fg" /> : null}
                            </div>
                        );
                    })}
                    {loading ? (
                        <div className="flex flex-col gap-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
                    ) : filtered.length === 0 ? (
                        <p className="px-2 py-3 text-body-sm text-fg-muted">{query ? `No sites match '${query}'` : 'No sites yet'}</p>
                    ) : null}
                </div>
                <div className="border-t border-border-subtle p-1">
                    <Link
                        href="/dashboard/setup"
                        onClick={() => { setSwitcherOpen(false); onNavigate?.(); }}
                        className="flex h-9 items-center gap-2.5 rounded-md px-2 text-body text-fg-secondary hover:bg-subtle hover:text-fg"
                    >
                        <Plus aria-hidden size={16} className="text-fg-muted" />
                        Add a site
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}
