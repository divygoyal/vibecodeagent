'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/cn';

/** Monospace value with a copy button (MCP server URL). */
export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            /* clipboard blocked: the value is visible and selectable */
        }
    };
    return (
        <div className={cn('flex h-11 items-center gap-2 rounded-control border border-border bg-surface pl-3 pr-1 shadow-xs', className)}>
            <code className="min-w-0 flex-1 truncate font-mono text-body text-fg" title={value}>{value}</code>
            <button
                type="button"
                onClick={copy}
                aria-label={copied ? `${label} copied` : `Copy ${label}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body-sm font-medium text-fg-secondary transition-colors duration-120 hover:bg-subtle hover:text-fg"
            >
                {copied ? <Check aria-hidden size={14} strokeWidth={2} className="text-up" /> : <Copy aria-hidden size={14} strokeWidth={1.75} />}
                {copied ? 'Copied' : 'Copy'}
            </button>
            <span aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
        </div>
    );
}
