'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, Zap } from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';

interface Recommendation {
    action: string;
    impact: string;
    effort: string;
    projectedPoints: number;
}

interface NextBestActionsProps {
    currentScore: number;
    projectedScore: number;
    recommendations: Recommendation[];
}

const RECOMMENDATION_HOWTO: Record<string, string> = {
    'faq schema': 'Use your CMS schema plugin (Yoast, RankMath) or add JSON-LD manually. Structure as {"@type": "FAQPage"} with Question and Answer items.',
    'author': 'Add an author section with name, bio, credentials, and links to social profiles. Use Person schema markup.',
    'structured data': 'Use Google\'s Structured Data Markup Helper to generate JSON-LD. Focus on Article, HowTo, and FAQ types.',
    'direct-answer': 'Start each article with a clear, concise answer. Use "What is X?" format headers. Keep first paragraph under 50 words.',
    'external citations': 'Link to authoritative sources (.gov, .edu, major publications). Aim for 3-5 external references per 1000 words.',
    'howto': 'Convert instructional content to step-by-step format with numbered steps. Add HowTo schema markup.',
    'content refresh': 'Update publish dates, add new data, refresh statistics, and add new sections.',
    'table of contents': 'Add anchor-linked table of contents at the top of long articles.',
};

export default function NextBestActions({ currentScore, projectedScore, recommendations }: NextBestActionsProps) {
    const [expandedRec, setExpandedRec] = useState<number | null>(null);
    const topRecs = recommendations.slice(0, 3);

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full flex flex-col">
            <div className="mb-4">
                <h2 className="text-sm font-bold text-white">Next Best Actions</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Ranked by GEO score impact</p>
            </div>

            {/* Projected Score */}
            <div className="flex items-center justify-center gap-3 mb-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Projected Score After All Actions</span>
            </div>
            <div className="flex items-center justify-center gap-3 mb-5">
                <span className="text-2xl font-bold text-zinc-400"><AnimatedCounter value={currentScore} /></span>
                <ArrowRight className="w-4 h-4 text-zinc-600" />
                <span className="text-2xl font-bold text-emerald-400"><AnimatedCounter value={projectedScore} /></span>
            </div>

            {/* Action Cards */}
            <div className="space-y-2.5 flex-1">
                {topRecs.map((rec, i) => {
                    const isExp = expandedRec === i;
                    const howToKey = Object.keys(RECOMMENDATION_HOWTO).find(k => rec.action.toLowerCase().includes(k));
                    const howTo = howToKey ? RECOMMENDATION_HOWTO[howToKey] : null;

                    return (
                        <div
                            key={i}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition"
                            onClick={() => setExpandedRec(isExp ? null : i)}
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[11px] font-bold text-emerald-400">{i + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-zinc-300 leading-relaxed mb-1.5">{rec.action}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                            rec.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                                            rec.impact === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-500/10 text-zinc-400'
                                        }`}>{rec.impact} impact</span>
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                            rec.effort === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                                            rec.effort === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                                        }`}>{rec.effort} effort</span>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <span className="text-[10px] text-zinc-500 block">Projected</span>
                                    <span className="text-sm font-bold text-emerald-400">+{rec.projectedPoints} pts</span>
                                </div>
                            </div>
                            <AnimatePresence>
                                {isExp && howTo && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="mt-2.5 pt-2.5 border-t border-white/[0.06] overflow-hidden"
                                    >
                                        <p className="text-[10px] font-semibold text-zinc-400 mb-1">How to implement:</p>
                                        <p className="text-[10px] text-zinc-500 leading-relaxed">{howTo}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
