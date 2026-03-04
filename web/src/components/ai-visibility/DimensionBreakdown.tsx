'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Code, Quote, HelpCircle, Shield, ChevronDown, Info, Zap } from 'lucide-react';

const DIMENSION_ICONS: Record<string, typeof FileText> = {
    'Content Quality': FileText,
    'Structured Data': Code,
    'Citation Worthiness': Quote,
    'Answer Readiness': HelpCircle,
    'Brand Authority': Shield,
};

const DIMENSION_INFO: Record<string, { description: string; goodAdvice: string; badAdvice: string }> = {
    'Content Quality': {
        description: 'Measures how comprehensive, well-structured, and authoritative your content is.',
        goodAdvice: 'Your content depth is strong. Continue creating comprehensive, expert-level content.',
        badAdvice: 'Improve content depth by expanding articles to 1500+ words, adding multiple subheadings, and including author attribution.',
    },
    'Structured Data': {
        description: 'Evaluates schema markup (JSON-LD) on your pages. AI platforms use structured data to extract content accurately.',
        goodAdvice: 'Great structured data implementation. Ensure all content types have matching schema.',
        badAdvice: 'Add JSON-LD schema markup to key pages: Article, FAQ, HowTo, and Organization schemas are most impactful.',
    },
    'Citation Worthiness': {
        description: 'How likely AI platforms are to reference your content as a source.',
        goodAdvice: 'Your content is highly citable. Keep adding authoritative references and data.',
        badAdvice: 'Add external citations to authoritative sources, include a table of contents, and back claims with data.',
    },
    'Answer Readiness': {
        description: 'Whether your content directly answers questions in a format AI can easily extract.',
        goodAdvice: 'Your content is well-formatted for AI extraction. Maintain FAQ and direct-answer patterns.',
        badAdvice: 'Create FAQ sections, use "What is X?" headers, and format answers as direct first-paragraph responses.',
    },
    'Brand Authority': {
        description: 'Domain trust, author credibility, and brand recognition signals.',
        goodAdvice: 'Strong authority signals detected. Focus on maintaining consistent quality.',
        badAdvice: 'Build authority by adding author bios, earning quality backlinks, and consistent publishing.',
    },
};

interface Dimension {
    name: string;
    score: number;
    rationale: string;
    subDetail?: string;
}

export default function DimensionBreakdown({ dimensions }: { dimensions: Dimension[] }) {
    const [expandedDim, setExpandedDim] = useState<string | null>(null);

    if (!dimensions.length) return null;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full">
            <div className="mb-4">
                <h2 className="text-sm font-bold text-white">Dimension Breakdown</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Click bars for page-level detail</p>
            </div>
            <div className="space-y-3">
                {dimensions.map((dim) => {
                    const Icon = DIMENSION_ICONS[dim.name] || FileText;
                    const color = dim.score >= 70 ? 'bg-emerald-400' : dim.score >= 40 ? 'bg-amber-400' : 'bg-red-400';
                    const textColor = dim.score >= 70 ? 'text-emerald-400' : dim.score >= 40 ? 'text-amber-400' : 'text-red-400';
                    const isExp = expandedDim === dim.name;
                    const info = DIMENSION_INFO[dim.name];

                    return (
                        <div
                            key={dim.name}
                            className="cursor-pointer hover:bg-white/[0.02] rounded-xl p-2.5 -mx-1 transition"
                            onClick={() => setExpandedDim(isExp ? null : dim.name)}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <Icon className="w-3.5 h-3.5 text-zinc-400" />
                                    <span className="text-[11px] font-medium text-zinc-300">{dim.name}</span>
                                </div>
                                <span className={`text-xs font-bold ${textColor}`}>{dim.score}/100</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                <motion.div
                                    className={`h-full rounded-full ${color}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${dim.score}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                />
                            </div>
                            {dim.subDetail && (
                                <p className="text-[9px] text-zinc-600 mt-1">{dim.subDetail}</p>
                            )}
                            <AnimatePresence>
                                {isExp && info && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-2 overflow-hidden"
                                    >
                                        <div className="flex items-start gap-2">
                                            <Info className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-[10px] text-zinc-400 leading-relaxed">{info.description}</p>
                                        </div>
                                        <div className="flex items-start gap-2 bg-white/[0.02] rounded-lg p-2">
                                            <Zap className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                                                {dim.score >= 60 ? info.goodAdvice : info.badAdvice}
                                            </p>
                                        </div>
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
