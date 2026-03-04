'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye, Sparkles, Loader2, RefreshCw,
    MessageSquare, Search, Zap, CheckCircle2, AlertTriangle,
    ChevronDown, X, BookOpen, Info
} from 'lucide-react';
import { useContainerStatus, useSiteList, useAIVisibility } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import { ConnectGoogleState } from '@/components/EmptyState';
import { useEffect } from 'react';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const PLATFORM_CONFIG: Record<string, { name: string; icon: typeof MessageSquare; color: string; bgColor: string }> = {
    chatgpt: { name: 'ChatGPT', icon: MessageSquare, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
    perplexity: { name: 'Perplexity', icon: Search, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    googleAIO: { name: 'Google AIO', icon: Sparkles, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
};

const LIKELIHOOD_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: 'High', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    low: { label: 'Low', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

const PLATFORM_TIPS: Record<string, { factors: string[]; tips: string[] }> = {
    chatgpt: {
        factors: ['Content depth and comprehensiveness', 'Clear structure with headers and subsections', 'Authoritative citations and data sources', 'FAQ-style Q&A content patterns'],
        tips: ['Write long-form, well-structured content (2000+ words)', 'Include expert quotes and data citations', 'Add FAQ sections that directly answer common questions', 'Use schema markup (Article, FAQ, HowTo)'],
    },
    perplexity: {
        factors: ['Factual accuracy and content recency', 'Source credibility and domain authority', 'Structured data markup presence', 'External backlinks from trusted domains'],
        tips: ['Keep content factually accurate and up-to-date', 'Build backlinks from authoritative domains', 'Add structured data to every key page', 'Include publish and update dates prominently'],
    },
    googleAIO: {
        factors: ['Google Search ranking (top 10 positions)', 'Schema markup presence and quality', 'E-E-A-T signals (author, credentials, trust)', 'Page experience and Core Web Vitals'],
        tips: ['Rank on page 1 for target queries first', 'Implement comprehensive schema markup', 'Add author bios with verifiable credentials', 'Optimize Core Web Vitals scores'],
    },
};

const DIMENSION_INFO: Record<string, { description: string; goodAdvice: string; badAdvice: string }> = {
    'Content Quality': {
        description: 'Measures how comprehensive, well-structured, and authoritative your content is. AI platforms prefer deep, expert content over thin pages.',
        goodAdvice: 'Your content depth is strong. Continue creating comprehensive, expert-level content.',
        badAdvice: 'Improve content depth by expanding articles to 1500+ words, adding multiple subheadings, and including author attribution.',
    },
    'Structured Data': {
        description: 'Evaluates schema markup (JSON-LD) on your pages. AI platforms use structured data to understand and extract your content more accurately.',
        goodAdvice: 'Great structured data implementation. Ensure all content types have matching schema.',
        badAdvice: 'Add JSON-LD schema markup to key pages: Article, FAQ, HowTo, and Organization schemas are most impactful.',
    },
    'Citation Worthiness': {
        description: 'How likely AI platforms are to reference your content as a source. Determined by external links, depth, table of contents, and factual density.',
        goodAdvice: 'Your content is highly citable. Keep adding authoritative references and data.',
        badAdvice: 'Add external citations to authoritative sources, include a table of contents, and back claims with data and statistics.',
    },
    'Answer Readiness': {
        description: 'Whether your content directly answers questions in a format AI can easily extract — FAQs, direct definitions, step-by-step guides.',
        goodAdvice: 'Your content is well-formatted for AI extraction. Maintain FAQ and direct-answer patterns.',
        badAdvice: 'Create FAQ sections, use "What is X?" headers, and format answers as direct first-paragraph responses.',
    },
    'Brand Authority': {
        description: 'Overall domain trust, author credibility, and brand recognition signals that make AI platforms confident citing your content.',
        goodAdvice: 'Strong authority signals detected. Focus on maintaining consistent quality.',
        badAdvice: 'Build authority by adding author bios, earning quality backlinks, and maintaining consistent publishing schedules.',
    },
};

const RECOMMENDATION_HOWTO: Record<string, string> = {
    'faq schema': 'Use your CMS\'s schema plugin (Yoast, RankMath) or add JSON-LD manually in the page <head>. Structure as {"@type": "FAQPage"} with Question and Answer items.',
    'author': 'Add an author section to every article with name, bio, credentials, and links to social profiles. Use Person schema markup for machine readability.',
    'structured data': 'Use Google\'s Structured Data Markup Helper to generate JSON-LD. Focus on Article, HowTo, and FAQ types for AI visibility.',
    'direct-answer': 'Start each article with a clear, concise answer to the main question. Use "What is X?" format headers. Keep the first paragraph under 50 words.',
    'external citations': 'Link to authoritative sources (.gov, .edu, major publications) throughout your content. Aim for 3-5 external references per 1000 words.',
    'howto': 'Convert instructional content to step-by-step format with numbered steps. Add HowTo schema markup with step names and descriptions.',
    'content refresh': 'Update publish dates, add new data, refresh statistics, and add new sections. Google and AI platforms prefer recently updated content.',
    'table of contents': 'Add anchor-linked table of contents at the top of long articles. This helps both users and AI understand content structure.',
};

function GeoScoreGauge({ score }: { score: number }) {
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference * 0.75;
    const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';

    return (
        <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-[135deg]">
                <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" />
                <motion.circle
                    cx="100" cy="100" r={radius} fill="none" stroke={color} strokeWidth="12"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: `0 ${circumference}` }}
                    animate={{ strokeDasharray: `${progress} ${circumference - progress}` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{score}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">GEO Score</span>
            </div>
        </div>
    );
}

export default function AIVisibilityPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const { selectedSite, setSelectedSite } = useRegistration();

    useEffect(() => {
        if (sites.length > 0 && !selectedSite) setSelectedSite(sites[0].siteUrl);
    }, [sites, selectedSite, setSelectedSite]);

    const { data, geoScore, isLoading, refresh } = useAIVisibility(selectedSite, hasGoogleConnection && !!selectedSite);

    // Interactive state
    const [showExplainer, setShowExplainer] = useState(true);
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
    const [expandedDim, setExpandedDim] = useState<string | null>(null);
    const [expandedRec, setExpandedRec] = useState<number | null>(null);
    const [hoveredKw, setHoveredKw] = useState<number | null>(null);

    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="AI visibility analysis and GEO tracking" /></div>;
    }

    const dimensions = data?.dimensions || [];
    const platforms = data?.platforms || {};
    const recommendations = data?.recommendations || [];
    const keywordVisibility = data?.keywordVisibility || [];
    const pageSignals = data?.pageSignals || [];

    const allRecs = recommendations.length > 0 ? recommendations : [
        { action: 'Add FAQ schema markup to your most visited pages', impact: 'high', effort: 'low' },
        { action: 'Include author attribution and publish dates on all content', impact: 'medium', effort: 'low' },
        { action: 'Add structured data (HowTo, Article) to key pages', impact: 'high', effort: 'medium' },
        { action: 'Create direct-answer content for your top queries', impact: 'high', effort: 'medium' },
        { action: 'Add external citations and references to build authority', impact: 'medium', effort: 'low' },
    ];

    return (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
            {/* Header */}
            <motion.div variants={fadeUp} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/20 flex items-center justify-center">
                        <Eye className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">AI Visibility</h1>
                        <p className="text-[11px] text-zinc-500">How likely AI platforms are to cite your content</p>
                    </div>
                </div>
                <button onClick={() => refresh()} disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </motion.div>

            {/* Explainer Banner */}
            <AnimatePresence>
                {showExplainer && (
                    <motion.div
                        variants={fadeUp}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-cyan-500/[0.04] p-5 relative overflow-hidden"
                    >
                        <button onClick={() => setShowExplainer(false)} className="absolute top-3 right-3 text-zinc-600 hover:text-white transition">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                                <BookOpen className="w-5 h-5 text-violet-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-white mb-1.5">What is AI Visibility?</h2>
                                <p className="text-[12px] text-zinc-400 leading-relaxed mb-2">
                                    AI Visibility measures how likely AI platforms like <strong className="text-white">ChatGPT</strong>, <strong className="text-white">Perplexity</strong>, and <strong className="text-white">Google AI Overviews</strong> are to cite your content in their responses. Your <strong className="text-emerald-400">GEO Score</strong> (Generative Engine Optimization) reflects your readiness for the AI search era.
                                </p>
                                <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    <strong className="text-zinc-300">Why it matters:</strong> As users shift from traditional search to AI assistants, sites optimized for AI citation capture traffic that Google organic alone cannot deliver. Content depth, structured data, authority signals, and direct-answer formatting are the key factors AI platforms evaluate.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isLoading ? (
                <motion.div variants={fadeUp} className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-400 mb-3" />
                    <p className="text-sm text-zinc-500">Analyzing your content for AI visibility...</p>
                    <p className="text-[10px] text-zinc-600 mt-1">This may take up to 30 seconds</p>
                </motion.div>
            ) : (
                <>
                    {/* GEO Score Hero + Platform Likelihood */}
                    <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col items-center justify-center">
                            <GeoScoreGauge score={geoScore || 0} />
                            <p className="text-[11px] text-zinc-500 mt-3 text-center max-w-[200px]">
                                {(geoScore || 0) >= 70 ? 'Strong AI visibility. Keep optimizing.' :
                                 (geoScore || 0) >= 40 ? 'Moderate visibility. Room for improvement.' :
                                 'Low AI visibility. Action needed.'}
                            </p>
                            {data?.source && (
                                <span className="mt-2 text-[9px] text-zinc-600 uppercase tracking-wider">
                                    Powered by {data.source === 'gemini' ? 'Gemini AI' : 'Content Analysis'}
                                </span>
                            )}
                        </div>

                        {/* Platform Likelihood — expandable */}
                        <div className="lg:col-span-2 grid grid-cols-3 gap-3">
                            {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                                const likelihood = platforms[key] || 'low';
                                const style = LIKELIHOOD_STYLES[likelihood];
                                const Icon = config.icon;
                                const isExpanded = expandedPlatform === key;
                                const tips = PLATFORM_TIPS[key];
                                return (
                                    <motion.div
                                        key={key}
                                        layout
                                        onClick={() => setExpandedPlatform(isExpanded ? null : key)}
                                        className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col items-center text-center cursor-pointer hover:border-white/[0.15] hover:bg-white/[0.04] transition-all"
                                    >
                                        <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center mb-3`}>
                                            <Icon className={`w-5 h-5 ${config.color}`} />
                                        </div>
                                        <span className="text-xs font-semibold text-white mb-1">{config.name}</span>
                                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${style.bg} ${style.color}`}>
                                            {style.label} Likelihood
                                        </span>
                                        <ChevronDown className={`w-3 h-3 text-zinc-600 mt-2 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        <AnimatePresence>
                                            {isExpanded && tips && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="w-full text-left mt-3 pt-3 border-t border-white/[0.06] overflow-hidden"
                                                >
                                                    <p className="text-[10px] font-semibold text-zinc-400 mb-1.5">Key Factors:</p>
                                                    {tips.factors.map((f, i) => (
                                                        <p key={i} className="text-[10px] text-zinc-500 flex items-start gap-1.5 mb-1">
                                                            <span className="text-emerald-500/70 mt-px">-</span> {f}
                                                        </p>
                                                    ))}
                                                    <p className="text-[10px] font-semibold text-zinc-400 mt-2.5 mb-1.5">How to Improve:</p>
                                                    {tips.tips.map((t, i) => (
                                                        <p key={i} className="text-[10px] text-zinc-500 flex items-start gap-1.5 mb-1">
                                                            <Zap className="w-2.5 h-2.5 text-violet-400 mt-0.5 flex-shrink-0" /> {t}
                                                        </p>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Dimension Breakdown — expandable */}
                    {dimensions.length > 0 && (
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <h2 className="text-sm font-bold text-white">Dimension Breakdown</h2>
                                <span className="text-[9px] text-zinc-600 bg-white/[0.04] px-2 py-0.5 rounded-full">Click to expand</span>
                            </div>
                            <div className="space-y-3">
                                {dimensions.map((dim: any) => {
                                    const color = dim.score >= 70 ? 'bg-emerald-400' : dim.score >= 40 ? 'bg-amber-400' : 'bg-red-400';
                                    const isExp = expandedDim === dim.name;
                                    const info = DIMENSION_INFO[dim.name];
                                    return (
                                        <div
                                            key={dim.name}
                                            className="cursor-pointer hover:bg-white/[0.02] rounded-xl p-3 -mx-1 transition"
                                            onClick={() => setExpandedDim(isExp ? null : dim.name)}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-zinc-300">{dim.name}</span>
                                                    <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform duration-200 ${isExp ? 'rotate-180' : ''}`} />
                                                </div>
                                                <span className="text-xs font-bold text-white">{dim.score}/100</span>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                <motion.div
                                                    className={`h-full rounded-full ${color}`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${dim.score}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-1">{dim.rationale}</p>
                                            <AnimatePresence>
                                                {isExp && info && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 overflow-hidden"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <Info className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                                            <p className="text-[11px] text-zinc-400 leading-relaxed">{info.description}</p>
                                                        </div>
                                                        <div className="flex items-start gap-2 bg-white/[0.02] rounded-lg p-2.5">
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
                        </motion.div>
                    )}

                    {/* Keyword Visibility + Recommendations */}
                    <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Keyword Visibility Table — with hover tooltips */}
                        {keywordVisibility.length > 0 && (
                            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                <h2 className="text-sm font-bold text-white mb-3">Keyword AI Visibility</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="border-b border-white/[0.06]">
                                                <th className="text-left py-2 text-zinc-500 font-medium">Query</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">Pos</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">AI Citation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {keywordVisibility.slice(0, 15).map((kw: any, i: number) => {
                                                const kwStyle = LIKELIHOOD_STYLES[kw.aiCitationLikelihood || 'low'];
                                                const isHovered = hoveredKw === i;
                                                return (
                                                    <tr
                                                        key={i}
                                                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition cursor-default"
                                                        onMouseEnter={() => setHoveredKw(i)}
                                                        onMouseLeave={() => setHoveredKw(null)}
                                                    >
                                                        <td className="py-2 text-zinc-300 max-w-[200px] truncate">{kw.query}</td>
                                                        <td className="py-2 text-right text-zinc-400">{kw.position}</td>
                                                        <td className="py-2 text-right relative">
                                                            <span className={`text-[10px] font-semibold ${kwStyle.color}`}>{kwStyle.label}</span>
                                                            <AnimatePresence>
                                                                {isHovered && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 4 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0 }}
                                                                        transition={{ duration: 0.15 }}
                                                                        className="absolute right-0 top-full z-20 mt-1 p-2.5 rounded-lg bg-[#1a1a24] border border-white/[0.12] shadow-xl text-[10px] text-zinc-400 w-[220px] text-left leading-relaxed"
                                                                    >
                                                                        {kw.aiCitationLikelihood === 'high'
                                                                            ? 'AI platforms are very likely to cite your content for this query. Your strong ranking and content signals make you a top candidate.'
                                                                            : kw.aiCitationLikelihood === 'medium'
                                                                            ? 'AI platforms may cite your content. Improving content depth, adding structured data, and boosting rankings could increase likelihood.'
                                                                            : 'AI platforms are unlikely to cite you here. Focus on improving rankings to top 5 and adding comprehensive, direct-answer content.'}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Recommendations — expandable with how-to */}
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <h2 className="text-sm font-bold text-white">Recommendations</h2>
                                <span className="text-[9px] text-zinc-600 bg-white/[0.04] px-2 py-0.5 rounded-full">Click for details</span>
                            </div>
                            <div className="space-y-2.5">
                                {allRecs.slice(0, 8).map((rec: any, i: number) => {
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
                                                <Zap className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] text-zinc-300 leading-relaxed">{rec.action}</p>
                                                    <div className="flex gap-2 mt-1.5">
                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                            rec.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                                                            rec.impact === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-500/10 text-zinc-400'
                                                        }`}>{rec.impact} impact</span>
                                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                            rec.effort === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                                                            rec.effort === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                                                        }`}>{rec.effort} effort</span>
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
                                                <ChevronDown className={`w-3 h-3 text-zinc-600 mt-1 transition-transform duration-200 flex-shrink-0 ${isExp ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>

                    {/* Content Signals */}
                    {pageSignals.length > 0 && (
                        <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <h2 className="text-sm font-bold text-white mb-3">Content Signals</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-white/[0.06]">
                                            <th className="text-left py-2 text-zinc-500 font-medium">Page</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Words</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Schema</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">FAQ</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Author</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Ext Links</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageSignals.map((ps: any, i: number) => (
                                            <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition">
                                                <td className="py-2 text-zinc-300 max-w-[250px] truncate" title={ps.url}>
                                                    {new URL(ps.url).pathname || '/'}
                                                </td>
                                                <td className="py-2 text-center text-zinc-400">{ps.wordCount.toLocaleString()}</td>
                                                <td className="py-2 text-center">
                                                    {ps.hasSchema ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center">
                                                    {ps.hasFaq ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center">
                                                    {ps.hasAuthor ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center text-zinc-400">{ps.externalLinks}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </motion.div>
    );
}
