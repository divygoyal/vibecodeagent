'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster as Sonner } from 'sonner';

import { useIsMobile } from '@/lib/useIsMobile';

export { toast } from 'sonner';

/** True while a modal dialog is open (Radix marks it role="dialog"). Toasts then move to the top so they never sit on its buttons. */
function useDialogOpen(): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const check = () => setOpen(Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')));
        check();
        const obs = new MutationObserver(check);
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
        return () => obs.disconnect();
    }, []);
    return open;
}

/**
 * App toasts (DESIGN 3.16): bottom-right on desktop, top-center on mobile,
 * max 3, 4s (errors and toasts with actions: pass duration 8000). In the
 * dashboard editor they sit bottom-center, clear of the palette and the properties panel. While a dialog is open
 * they move to top-center (round 9 review, item 16): a toast never covers a dialog's buttons.
 * Mounted once in app/providers.tsx. Styling lives in globals.css (.tc-toast).
 */
export function Toaster() {
    const isMobile = useIsMobile();
    const inEditor = /^\/dashboard\/dashboards\/[^/]+\/edit$/.test(usePathname() ?? '');
    const dialogOpen = useDialogOpen();
    return (
        <Sonner
            position={isMobile || dialogOpen ? 'top-center' : inEditor ? 'bottom-center' : 'bottom-right'}
            // Tight to the top while a dialog is open: its title row starts about 67px down, so the toast clears it.
            offset={dialogOpen && !isMobile ? 6 : undefined}
            visibleToasts={3}
            gap={8}
            duration={4000}
            closeButton={false}
            icons={{
                success: <CheckCircle2 aria-hidden size={16} strokeWidth={1.75} className="text-up" />,
                warning: <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="text-warn" />,
                error: <XCircle aria-hidden size={16} strokeWidth={1.75} className="text-down" />,
                info: <Info aria-hidden size={16} strokeWidth={1.75} className="text-info" />,
                loading: <Loader2 aria-hidden size={16} strokeWidth={1.75} className="animate-spin text-fg-muted" />,
            }}
            toastOptions={{
                unstyled: true,
                classNames: {
                    toast: 'tc-toast',
                    title: 'text-body font-medium',
                    description: 'text-body-sm text-fg-muted',
                    actionButton: 'ml-auto h-7 shrink-0 rounded-md px-2 text-body-sm font-medium text-fg hover:bg-subtle',
                    cancelButton: 'h-7 shrink-0 rounded-md px-2 text-body-sm text-fg-muted hover:bg-subtle',
                },
            }}
        />
    );
}
