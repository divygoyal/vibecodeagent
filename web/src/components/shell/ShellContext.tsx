'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ShellState {
    /** Mobile / tablet navigation drawer. */
    navOpen: boolean;
    setNavOpen: (open: boolean) => void;
    /** Desktop sidebar collapsed to the 64px rail (saved in localStorage 'tc-sidebar'). */
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    /** Label of the last breadcrumb, set by pages with useBreadcrumbTitle(). */
    crumbTitle: string | null;
    setCrumbTitle: (v: string | null) => void;
    /** Site switcher popover (shortcut g s). */
    switcherOpen: boolean;
    setSwitcherOpen: (v: boolean) => void;
}

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
    const [navOpen, setNavOpen] = useState(false);
    const [collapsed, setCollapsedState] = useState(false);
    const [crumbTitle, setCrumbTitle] = useState<string | null>(null);
    const [switcherOpen, setSwitcherOpen] = useState(false);

    useEffect(() => {
        try {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved sidebar width after hydration
            if (window.localStorage.getItem('tc-sidebar') === 'collapsed') setCollapsedState(true);
        } catch {
            // ignore
        }
    }, []);

    const value = useMemo<ShellState>(() => ({
        navOpen,
        setNavOpen,
        collapsed,
        setCollapsed: (v: boolean) => {
            setCollapsedState(v);
            try {
                window.localStorage.setItem('tc-sidebar', v ? 'collapsed' : 'open');
            } catch {
                // ignore
            }
        },
        crumbTitle,
        setCrumbTitle,
        switcherOpen,
        setSwitcherOpen,
    }), [navOpen, collapsed, crumbTitle, switcherOpen]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellState {
    const v = useContext(Ctx);
    if (!v) throw new Error('useShell must be used inside AppShell');
    return v;
}

/**
 * Set the last breadcrumb label (e.g. a dashboard's name) while the page is
 * mounted. Pages that are site pages or listed in nav.ts get one automatically.
 */
export function useBreadcrumbTitle(title: string | null | undefined) {
    const ctx = useContext(Ctx);
    const set = ctx?.setCrumbTitle;
    useEffect(() => {
        if (!set) return;
        set(title ?? null);
        return () => set(null);
    }, [set, title]);
}
