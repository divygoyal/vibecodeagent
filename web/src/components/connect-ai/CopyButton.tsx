'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cx, s } from './styles';

export function CopyButton({ text, label = 'Copy', className, size = 'sm' }: { text: string; label?: string; className?: string; size?: 'sm' | 'md' }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
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
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    }
    return (
        <button type="button" onClick={copy} className={cx(s.btn, size === 'sm' ? s.btnSm : s.btnMd, s.secondary, className)} aria-label={`${label}: ${text.slice(0, 60)}`}>
            {copied ? <Check size={14} strokeWidth={1.75} aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />}
            <span>{copied ? 'Copied' : label}</span>
        </button>
    );
}

export function CodeBlock({ label, code }: { label?: string; code: string }) {
    const multiline = code.includes('\n');
    return (
        <div className="min-w-0">
            {label ? <div className={cx(s.meta, 'mb-1.5 font-medium')}>{label}</div> : null}
            <div className={cx(s.sunken, 'flex items-start gap-2 p-2 pl-3')}>
                <pre className={cx(s.mono, 'min-w-0 flex-1 overflow-x-auto py-1 leading-5 text-[var(--tc-fg)]', multiline ? 'whitespace-pre' : 'whitespace-pre-wrap break-all')}>{code}</pre>
                <CopyButton text={code} />
            </div>
        </div>
    );
}
