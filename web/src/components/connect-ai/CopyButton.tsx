'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonSize } from '@/components/ui';
import { cn } from '@/lib/cn';

async function writeClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
}

export function CopyButton({ text, label = 'Copy', size = 'sm', className }: { text: string; label?: string; size?: ButtonSize; className?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            size={size}
            variant="secondary"
            icon={copied ? Check : Copy}
            className={className}
            aria-label={`${label}: ${text.slice(0, 60)}`}
            onClick={async () => {
                await writeClipboard(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
            }}
        >
            {copied ? 'Copied' : label}
        </Button>
    );
}

/** Monospace snippet in a sunken well with a copy button. */
export function CodeBlock({ label, code, className }: { label?: string; code: string; className?: string }) {
    const multiline = code.includes('\n');
    return (
        <div className={cn('min-w-0', className)}>
            {label ? <div className="mb-1.5 text-meta font-medium text-fg-muted">{label}</div> : null}
            <div className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken p-2 pl-3">
                <pre className={cn('min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] leading-5 text-fg', multiline ? 'whitespace-pre' : 'whitespace-pre-wrap break-all')}>{code}</pre>
                <CopyButton text={code} />
            </div>
        </div>
    );
}
