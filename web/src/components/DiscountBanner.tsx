'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Copy, Check } from 'lucide-react';

export function DiscountBanner() {
    const [dismissed, setDismissed] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText('NEWBEE20');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AnimatePresence>
            {!dismissed && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative z-[60] bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 border-b border-emerald-500/20 overflow-hidden"
                >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_3s_ease-in-out_infinite]" />

                    <div className="relative max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
                        <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-zinc-300">
                            New here? Get <span className="text-emerald-400 font-bold">20% off</span> your first month!
                        </span>
                        <button
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs hover:bg-emerald-500/30 transition-colors cursor-pointer"
                        >
                            NEWBEE20
                            {copied ? (
                                <Check className="w-3 h-3" />
                            ) : (
                                <Copy className="w-3 h-3" />
                            )}
                        </button>
                        <button
                            onClick={() => setDismissed(true)}
                            className="absolute right-4 text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer"
                            aria-label="Dismiss banner"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Inline discount badge for use near CTAs and pricing */
export function DiscountBadge({ className = '' }: { className?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText('NEWBEE20');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/20 ${className}`}
        >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-300">
                Use code <button onClick={handleCopy} className="font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
                    NEWBEE20
                </button> for <span className="text-amber-400 font-semibold">20% off</span>
            </span>
            {copied && <Check className="w-3.5 h-3.5 text-emerald-400" />}
        </motion.div>
    );
}
