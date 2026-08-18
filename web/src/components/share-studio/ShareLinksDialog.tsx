'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Code2, Copy, Link as LinkIcon, X } from 'lucide-react';
import {
    getPublicShareUrl,
    getEmbedUrl,
    getEmbedIframeSnippet,
} from '@/lib/shareUrls';

type LinkKind = 'public' | 'embed' | 'iframe';

interface Props {
    open: boolean;
    token: string;
    onClose: () => void;
}

const OPTIONS: ReadonlyArray<{ id: LinkKind; label: string; icon: typeof LinkIcon; help: string }> = [
    { id: 'public', label: 'Public Link', icon: LinkIcon, help: 'Anyone with this URL can view the dashboard.' },
    { id: 'embed', label: 'Embed URL', icon: Code2, help: 'Drop this into an iframe in your own page.' },
    { id: 'iframe', label: 'Iframe Snippet', icon: Code2, help: 'Paste this <iframe> tag straight into your CMS or HTML.' },
];

export default function ShareLinksDialog({ open, token, onClose }: Props) {
    const [selected, setSelected] = useState<LinkKind | null>(null);
    const [copied, setCopied] = useState(false);

    /* Reset every time the dialog opens — otherwise the previous run's selection
     * lingers and the dialog appears half-filled-in on first paint. */
    useEffect(() => {
        if (open) {
            setSelected(null);
            setCopied(false);
        }
    }, [open]);

    /* Esc closes the dialog. Same affordance as backdrop-click + the OK button. */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const value = (() => {
        if (!selected) return '';
        if (selected === 'public') return getPublicShareUrl(token);
        if (selected === 'embed') return getEmbedUrl(token);
        return getEmbedIframeSnippet(token);
    })();

    const handleCopy = useCallback(() => {
        if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        });
    }, [value]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                >
                    <motion.div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    <motion.div
                        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0a0d12] shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Shared dashboard links"
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-white">Your shared dashboard is ready</h2>
                                <p className="mt-1 text-[12px] text-zinc-400">
                                    Pick the format you want to share.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            <div className="grid grid-cols-3 gap-2">
                                {OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    const active = selected === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => {
                                                setSelected(opt.id);
                                                setCopied(false);
                                            }}
                                            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-medium transition-colors ${
                                                active
                                                    ? 'border-[#14C4E1]/55 bg-[#14C4E1]/[0.10] text-[#7AD9DA]'
                                                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.05]'
                                            }`}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {selected ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-zinc-500">
                                        {OPTIONS.find((o) => o.id === selected)?.help}
                                    </p>
                                    <div className="flex items-stretch overflow-hidden rounded-xl border border-white/[0.10]">
                                        {selected === 'iframe' ? (
                                            <textarea
                                                readOnly
                                                value={value}
                                                rows={4}
                                                onFocus={(e) => e.currentTarget.select()}
                                                className="min-w-0 flex-1 resize-none bg-white/[0.03] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-cyan-300/80 outline-none"
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                readOnly
                                                value={value}
                                                onFocus={(e) => e.currentTarget.select()}
                                                className="min-w-0 flex-1 bg-white/[0.03] px-3 py-2.5 font-mono text-[11px] text-zinc-200 outline-none"
                                            />
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleCopy}
                                            className="flex items-center gap-1.5 border-l border-white/[0.10] bg-white/[0.06] px-3 text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white"
                                            title={copied ? 'Copied' : 'Copy'}
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                    <span className="text-[11px]">Copied</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-3.5 w-3.5" />
                                                    <span className="text-[11px]">Copy</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[11px] text-zinc-500">
                                    Pick one of the options above to reveal a copyable URL or snippet.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg bg-[#14C4E1] px-4 py-1.5 text-xs font-semibold text-[#031017] transition-colors hover:brightness-110"
                            >
                                OK
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
