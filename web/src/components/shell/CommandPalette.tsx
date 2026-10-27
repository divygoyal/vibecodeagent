'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { Moon, Plug, Plus, Search, Sparkles, Sun, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { buildAskAiUrl } from '@/lib/askAi';
import { setThemePreference, useResolvedTheme } from '@/lib/theme';
import { Favicon } from '@/components/ui/Favicon';
import { Kbd } from '@/components/ui/Kbd';
import { BOTTOM_ITEMS, GROW_ITEMS, MAIN_ITEMS, PORTFOLIO_ITEM, SITE_NAV, siteHref } from './nav';
import { useCurrentSite } from './useCurrentSite';

const OPEN_EVENT = 'tc:command-palette';
const RECENT_KEY = 'tc-cmdk-recent';
const MAX_RECENT = 3;
const MAX_SITES_IDLE = 6;

/** Opens the palette (the topbar search button). ⌘K / Ctrl K also opens it. */
export function openCommandPalette() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

type Section = 'Recent' | 'Go to' | 'Sites' | 'Actions';

interface Command {
    id: string;
    label: string;
    hint?: string;
    section: Exclude<Section, 'Recent'>;
    icon?: LucideIcon | ComponentType<{ className?: string }>;
    /** Site rows show the favicon instead of an icon. */
    host?: string;
    keywords?: string[];
    run: () => void;
}

function readRecent(): string[] {
    try {
        const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
    } catch {
        return [];
    }
}

function pushRecent(id: string) {
    try {
        const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // Private mode: no recents.
    }
}

function matches(c: Command, q: string): boolean {
    return c.label.toLowerCase().includes(q)
        || Boolean(c.hint?.toLowerCase().includes(q))
        || Boolean(c.host?.includes(q))
        || Boolean(c.keywords?.some((k) => k.includes(q)));
}

/**
 * ⌘K command palette (DESIGN 3.23): sites, pages of the app, a few actions and
 * the last three picks. Mounted by the topbar, so it has the workspace's site list.
 */
export function CommandPalette() {
    const router = useRouter();
    const { site, sites, selectSite } = useCurrentSite();
    const theme = useResolvedTheme();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [recent, setRecent] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const show = useCallback((next: boolean) => {
        setOpen(next);
        if (next) {
            setQuery('');
            setActive(0);
            setRecent(readRecent());
        }
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                show(!open);
            }
        };
        const onOpen = () => show(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, [show, open]);

    const go = useCallback((href: string) => () => router.push(href), [router]);

    const commands = useMemo<Command[]>(() => {
        const list: Command[] = [{
            id: 'go:portfolio', label: PORTFOLIO_ITEM.label, hint: 'All your sites', section: 'Go to',
            icon: PORTFOLIO_ITEM.icon, keywords: ['home', 'dashboard', 'sites'], run: go(PORTFOLIO_ITEM.href),
        }];
        if (site) {
            for (const s of SITE_NAV) {
                list.push({
                    id: `go:site:${s.section || 'overview'}`, label: s.label, hint: site.label, section: 'Go to', icon: s.icon,
                    keywords: s.section === 'traffic' ? ['ga4', 'analytics', 'visitors', 'users']
                        : s.section === 'search' ? ['gsc', 'search console', 'seo', 'keywords', 'queries']
                        : s.section === 'actions' ? ['audit', 'fix', 'todo'] : ['site'],
                    run: go(siteHref(site.host, s.section)),
                });
            }
        }
        for (const item of [...MAIN_ITEMS, ...GROW_ITEMS, ...BOTTOM_ITEMS]) {
            list.push({ id: `go:${item.href}`, label: item.label, section: 'Go to', icon: item.icon, run: go(item.href) });
        }
        for (const s of sites) {
            list.push({
                id: `site:${s.host}`, label: s.label, hint: s.label === s.host ? undefined : s.host, section: 'Sites',
                host: s.host, keywords: s.gscSiteUrl ? [s.gscSiteUrl.toLowerCase()] : undefined,
                run: () => selectSite(s),
            });
        }
        list.push(
            { id: 'act:ask', label: 'Ask AI…', section: 'Actions', icon: Sparkles, keywords: ['chat', 'question'], run: go('/dashboard/ask') },
            {
                id: 'act:today', label: 'What should I do today?', hint: 'Ask AI', section: 'Actions', icon: Sparkles,
                keywords: ['recommend', 'grow', 'next'], run: go(buildAskAiUrl('What’s the one thing I should do today to grow?')),
            },
            { id: 'act:new-dashboard', label: 'New dashboard', section: 'Actions', icon: Plus, keywords: ['create', 'report'], run: go('/dashboard/dashboards/new') },
            { id: 'act:connect-ai', label: 'Connect ChatGPT or Claude', section: 'Actions', icon: Plug, keywords: ['mcp', 'connect ai'], run: go('/dashboard/connect-ai') },
            {
                id: 'act:theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', section: 'Actions',
                icon: theme === 'dark' ? Sun : Moon, keywords: ['theme', 'appearance', 'dark', 'light', 'mode'],
                run: () => setThemePreference(theme === 'dark' ? 'light' : 'dark'),
            },
        );
        return list;
    }, [go, site, sites, selectSite, theme]);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const out: { section: Section; items: Command[] }[] = [];
        if (!q) {
            const byId = new Map(commands.map((c) => [c.id, c]));
            const rec = recent.map((id) => byId.get(id)).filter((c): c is Command => Boolean(c));
            if (rec.length) out.push({ section: 'Recent', items: rec });
            const seen = new Set(rec.map((c) => c.id));
            for (const section of ['Go to', 'Sites', 'Actions'] as const) {
                let items = commands.filter((c) => c.section === section && !seen.has(c.id));
                if (section === 'Sites') items = items.slice(0, MAX_SITES_IDLE);
                if (items.length) out.push({ section, items });
            }
            return out;
        }
        for (const section of ['Sites', 'Go to', 'Actions'] as const) {
            const items = commands.filter((c) => c.section === section && matches(c, q));
            if (section === 'Actions') {
                items.push({
                    id: 'act:ask-query', label: `Ask AI: “${query.trim()}”`, section: 'Actions', icon: Sparkles,
                    run: go(buildAskAiUrl(query)),
                });
            }
            if (items.length) out.push({ section, items });
        }
        return out;
    }, [commands, query, recent, go]);

    const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
    const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const runItem = useCallback((c: Command | undefined) => {
        if (!c) return;
        if (c.id !== 'act:ask-query') pushRecent(c.id);
        setOpen(false);
        c.run();
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (Math.min(i, flat.length - 1) + 1) % Math.max(flat.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (Math.min(i, flat.length - 1) - 1 + flat.length) % Math.max(flat.length, 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            runItem(flat[activeIndex]);
        }
    };

    let index = 0;
    return (
        <Dialog.Root open={open} onOpenChange={show}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-70 bg-overlay animate-fade-in" />
                <Dialog.Content
                    aria-describedby={undefined}
                    onKeyDown={onKeyDown}
                    className="tc-root fixed inset-x-0 top-[10vh] z-70 mx-auto w-[calc(100%-32px)] max-w-[640px] overflow-hidden rounded-popover border border-border-subtle bg-surface-raised text-fg shadow-modal outline-none animate-pop-in md:top-[18vh]"
                >
                    <Dialog.Title className="sr-only">Search TrafficClaw</Dialog.Title>
                    <div className="flex h-12 items-center gap-2.5 border-b border-border-subtle px-4">
                        <Search className="size-[18px] shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActive(0);
                            }}
                            placeholder="Search sites, pages and actions"
                            role="combobox"
                            aria-expanded
                            aria-controls={listId}
                            aria-activedescendant={flat.length ? `${listId}-${activeIndex}` : undefined}
                            aria-autocomplete="list"
                            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none"
                        />
                        <Kbd className="max-md:hidden">esc</Kbd>
                    </div>
                    <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[min(400px,55dvh)] overflow-y-auto overscroll-contain p-1.5">
                        {groups.map((g) => (
                            <div key={g.section} role="group" aria-label={g.section}>
                                <div className="px-3 pt-2 pb-1 text-meta font-medium text-fg-muted">{g.section}</div>
                                {g.items.map((c) => {
                                    const i = index++;
                                    const selected = i === activeIndex;
                                    const Icon = c.icon;
                                    return (
                                        <div
                                            key={`${g.section}-${c.id}`}
                                            id={`${listId}-${i}`}
                                            data-index={i}
                                            role="option"
                                            aria-selected={selected}
                                            onMouseMove={() => setActive(i)}
                                            onClick={() => runItem(c)}
                                            className={cn(
                                                'flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-3 text-body',
                                                selected ? 'bg-subtle text-fg' : 'text-fg-secondary',
                                            )}
                                        >
                                            {c.host ? (
                                                <Favicon host={c.host} size={16} />
                                            ) : Icon ? (
                                                <Icon className={cn('size-4 shrink-0', selected ? 'text-fg' : 'text-fg-muted')} strokeWidth={1.75} aria-hidden />
                                            ) : null}
                                            <span className="truncate">{c.label}</span>
                                            {c.hint ? <span className="truncate text-body-sm text-fg-muted">{c.hint}</span> : null}
                                            <span className="ml-auto shrink-0 text-meta text-fg-muted">
                                                {selected ? (c.section === 'Actions' ? 'Run' : 'Open') : null}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 border-t border-border-subtle px-4 py-2 text-meta text-fg-muted max-md:hidden">
                        <Kbd>↑</Kbd><Kbd>↓</Kbd> to navigate <span aria-hidden>·</span> <Kbd>↵</Kbd> to open <span aria-hidden>·</span> <Kbd>esc</Kbd> to close
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
