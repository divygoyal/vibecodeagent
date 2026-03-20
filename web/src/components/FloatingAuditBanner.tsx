'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ScanSearch, X, ArrowRight, Zap } from 'lucide-react';

export default function FloatingAuditBanner() {
    const [dismissed, setDismissed] = useState(false);
    const [url, setUrl] = useState('');
    const [expanded, setExpanded] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    // Don't show on audit page itself
    if (pathname === '/dashboard/audit' || dismissed) return null;

    const handleAudit = () => {
        if (url.trim()) {
            router.push(`/dashboard/audit?url=${encodeURIComponent(url.trim())}`);
        } else {
            router.push('/dashboard/audit');
        }
    };

    if (!expanded) {
        return (
            <div className="hidden sm:flex fixed bottom-6 right-6 z-40 items-center gap-2">
                <button
                    onClick={() => setExpanded(true)}
                    className="fab-pulse group flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold text-sm rounded-full shadow-xl hover:shadow-2xl hover:shadow-emerald-500/20 transition-all hover:scale-105"
                >
                    <ScanSearch className="w-4.5 h-4.5" />
                    <span className="hidden sm:inline">Run Audit</span>
                </button>
            </div>
        );
    }

    return (
        <div className="hidden sm:flex fixed bottom-6 right-6 z-40 w-[340px]">
            <div className="toolbar-glass rounded-2xl p-4 shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-black" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-white">Quick Audit</h4>
                            <p className="text-[10px] text-zinc-500">50+ SEO & technical checks</p>
                        </div>
                    </div>
                    <button onClick={() => { setExpanded(false); setDismissed(true); }} className="p-1 rounded-lg hover:bg-white/[0.06] text-zinc-500 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
                        placeholder="Enter URL to audit..."
                        className="flex-1 px-3 py-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30 transition"
                    />
                    <button
                        onClick={handleAudit}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold text-xs rounded-lg hover:opacity-90 transition flex items-center gap-1.5"
                    >
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                <button onClick={() => setExpanded(false)} className="w-full mt-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition text-center">
                    Minimize
                </button>
            </div>
        </div>
    );
}
