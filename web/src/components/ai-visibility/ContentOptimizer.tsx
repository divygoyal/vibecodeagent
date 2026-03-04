'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Zap, FileText, Code, Hash, Shield, Layout } from 'lucide-react';

interface Suggestion {
    category: string;
    title: string;
    current: string;
    recommended: string;
    impact: string;
    example?: string;
}

interface ContentOptimizerProps {
    url: string;
    topQueries?: string[];
    onClose: () => void;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
    structure: { icon: Layout, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    content: { icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    schema: { icon: Code, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    keywords: { icon: Hash, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    authority: { icon: Shield, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
};

export default function ContentOptimizer({ url, topQueries, onClose }: ContentOptimizerProps) {
    const [data, setData] = useState<{ readabilityScore?: number; overallAssessment?: string; suggestions: Suggestion[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch on mount
    useState(() => {
        fetch('/api/ai-visibility/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, topQueries }),
        })
            .then(r => r.json())
            .then(result => {
                if (result.error && !result.suggestions?.length) setError(result.error);
                else setData(result);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    });

    const readabilityColor = (data?.readabilityScore || 0) >= 70 ? 'text-emerald-400' : (data?.readabilityScore || 0) >= 40 ? 'text-amber-400' : 'text-red-400';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-[#0c0c14] border border-white/[0.1] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Content Optimizer</h2>
                            <p className="text-[10px] text-zinc-500 truncate max-w-[300px]">{url}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-400 mb-2" />
                            <p className="text-xs text-zinc-500">Analyzing content for AI optimization...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-xs text-red-400">{error}</p>
                        </div>
                    ) : data ? (
                        <div className="space-y-4">
                            {/* Readability Score + Assessment */}
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="text-center">
                                    <span className={`text-3xl font-bold ${readabilityColor}`}>{data.readabilityScore}</span>
                                    <p className="text-[9px] text-zinc-500 mt-0.5">Readability</p>
                                </div>
                                <div className="flex-1 border-l border-white/[0.06] pl-4">
                                    <p className="text-[11px] text-zinc-300 leading-relaxed">{data.overallAssessment}</p>
                                </div>
                            </div>

                            {/* Suggestions */}
                            {(data.suggestions || []).map((s, i) => {
                                const catConfig = CATEGORY_CONFIG[s.category] || CATEGORY_CONFIG.content;
                                const CatIcon = catConfig.icon;

                                return (
                                    <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`w-5 h-5 rounded ${catConfig.bg} flex items-center justify-center`}>
                                                <CatIcon className={`w-3 h-3 ${catConfig.color}`} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-white">{s.title}</span>
                                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto ${
                                                s.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                                                s.impact === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-500/10 text-zinc-400'
                                            }`}>{s.impact} impact</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                            <div className="p-2.5 rounded-lg bg-red-500/[0.04] border border-red-500/10">
                                                <span className="text-[9px] font-semibold text-red-400 block mb-1">Current</span>
                                                <p className="text-[10px] text-zinc-400 leading-relaxed">{s.current}</p>
                                            </div>
                                            <div className="p-2.5 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10">
                                                <span className="text-[9px] font-semibold text-emerald-400 block mb-1">Recommended</span>
                                                <p className="text-[10px] text-zinc-400 leading-relaxed">{s.recommended}</p>
                                            </div>
                                        </div>

                                        {s.example && (
                                            <div className="mt-2 p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                                                <span className="text-[9px] font-semibold text-zinc-500 block mb-1">Example</span>
                                                <pre className="text-[10px] text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">{s.example}</pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </motion.div>
        </motion.div>
    );
}
