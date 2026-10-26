'use client';

import { useState } from 'react';
import { Check, Copy, Tag } from 'lucide-react';

const CODE = 'NEWBEE20';

/** Neutral banner for the first-month code (DESIGN 5.17: not a big green block). */
export function DiscountBanner() {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex flex-col gap-3 rounded-control border border-border-subtle bg-surface-sunken p-3.5 sm:flex-row sm:items-center">
            <Tag aria-hidden size={16} strokeWidth={1.75} className="hidden shrink-0 text-fg-muted sm:block" />
            <p className="flex-1 text-body-sm text-fg-secondary">
                <span className="font-medium text-fg">New here?</span> Use code <code className="font-mono font-medium text-fg">{CODE}</code> at checkout for 20% off your first month on Growth or Pro.
            </p>
            <button
                type="button"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(CODE);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1800);
                    } catch { /* clipboard blocked */ }
                }}
                className="inline-flex h-8 items-center gap-1.5 self-start rounded-control border border-border bg-surface px-3 text-body-sm font-medium text-fg shadow-xs transition-colors duration-120 hover:bg-subtle sm:self-auto"
            >
                {copied ? <Check aria-hidden size={14} strokeWidth={2} className="text-up" /> : <Copy aria-hidden size={14} strokeWidth={1.75} />}
                {copied ? 'Copied' : 'Copy code'}
            </button>
        </div>
    );
}
