'use client';

import type { ReactNode } from 'react';

import { BrandMark } from '@/components/shell/BrandMark';
import { useAppTheme } from '@/lib/theme';

export interface AdminFrameProps {
    /** The page h1, e.g. "Admin". */
    title: ReactNode;
    /** Next to the title: a Badge or Pill. */
    badge?: ReactNode;
    /** Right side of the header: refresh, sign out, back link. */
    actions?: ReactNode;
    children: ReactNode;
}

/**
 * Page frame for the two operator consoles (/admin, /superadmin): header with
 * the brand mark, one h1, header actions, and the centred 1440px main column.
 * The consoles sit outside the app shell, so the frame applies the stored
 * Light / Dark / System preference itself (useAppTheme).
 */
export function AdminFrame({ title, badge, actions, children }: AdminFrameProps) {
    useAppTheme();
    return (
        <div className="tc-root min-h-dvh bg-canvas text-fg">
            <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface">
                <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <BrandMark size={24} />
                        <h1 className="min-w-0 truncate text-title-sm text-fg">{title}</h1>
                        {badge ? <div className="flex shrink-0 items-center">{badge}</div> : null}
                    </div>
                    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
                </div>
            </header>
            <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-6 md:px-6">
                {children}
            </main>
        </div>
    );
}

/** Centred card page for the sign-in gate (still inside the tc-root frame, no header actions). */
export function AdminGate({ children }: { children: ReactNode }) {
    useAppTheme();
    return (
        <div className="tc-root min-h-dvh bg-canvas text-fg">
            <main id="main-content" className="mx-auto flex min-h-dvh max-w-[1440px] items-center justify-center px-4 py-10 md:px-6">
                <div className="w-full max-w-[400px]">{children}</div>
            </main>
        </div>
    );
}
