'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Loader2, RefreshCw, BookOpen, X } from 'lucide-react';
import { useContainerStatus, useSiteList, useAIVisibility } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import { ConnectGoogleState } from '@/components/EmptyState';

import GeoScoreHero from '@/components/ai-visibility/GeoScoreHero';
import PlatformCards from '@/components/ai-visibility/PlatformCard';
import DimensionBreakdown from '@/components/ai-visibility/DimensionBreakdown';
import NextBestActions from '@/components/ai-visibility/NextBestActions';
import CompetitorIntelligence from '@/components/ai-visibility/CompetitorIntelligence';
import LiveQueryMonitor from '@/components/ai-visibility/LiveQueryMonitor';
import ContentSignals from '@/components/ai-visibility/ContentSignals';
import EntityMap from '@/components/ai-visibility/EntityMap';
import SchemaGenerator from '@/components/ai-visibility/SchemaGenerator';
import ContentOptimizer from '@/components/ai-visibility/ContentOptimizer';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

export default function AIVisibilityPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const { selectedSite, setSelectedSite } = useRegistration();

    useEffect(() => {
        if (sites.length > 0 && !selectedSite) setSelectedSite(sites[0].siteUrl);
    }, [sites, selectedSite, setSelectedSite]);

    const { data, geoScore, isLoading, refresh } = useAIVisibility(selectedSite, hasGoogleConnection && !!selectedSite);
    const [showExplainer, setShowExplainer] = useState(true);

    // Modal state
    const [schemaUrl, setSchemaUrl] = useState<string | null>(null);
    const [optimizeUrl, setOptimizeUrl] = useState<string | null>(null);

    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="AI visibility analysis and GEO tracking" /></div>;
    }

    const topQueryStrings = (data?.topQueries || []).map((q: any) => q.query);

    return (
        <>
            <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-5">
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
                            className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-cyan-500/[0.04] p-4 relative overflow-hidden"
                        >
                            <button onClick={() => setShowExplainer(false)} className="absolute top-3 right-3 text-zinc-600 hover:text-white transition">
                                <X className="w-4 h-4" />
                            </button>
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-4 h-4 text-violet-400" />
                                </div>
                                <div>
                                    <h2 className="text-xs font-bold text-white mb-1">What is AI Visibility?</h2>
                                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                                        AI Visibility measures how likely <strong className="text-white">ChatGPT</strong>, <strong className="text-white">Perplexity</strong>, and <strong className="text-white">Google AI Overviews</strong> are to cite your content. Your <strong className="text-emerald-400">GEO Score</strong> reflects your readiness for the AI search era.
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
                        {/* Row 1: GEO Score Hero + Platform Mini-Dashboards */}
                        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                            <div className="lg:col-span-2">
                                <GeoScoreHero score={geoScore || 0} trend={data?.trend || null} />
                            </div>
                            <div className="lg:col-span-3">
                                <PlatformCards platforms={data?.platforms || {}} />
                            </div>
                        </motion.div>

                        {/* Row 2: Dimension Breakdown + Next Best Actions + Competitor Intelligence */}
                        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <DimensionBreakdown dimensions={data?.dimensions || []} />
                            <NextBestActions
                                currentScore={geoScore || 0}
                                projectedScore={data?.projectedScore || (geoScore || 0) + 15}
                                recommendations={data?.recommendations || []}
                            />
                            <CompetitorIntelligence
                                competitors={data?.competitors || []}
                                gapAlert={data?.competitorGapAlert || ''}
                            />
                        </motion.div>

                        {/* Row 3: Live Query Monitor + Content Signals */}
                        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <LiveQueryMonitor monitor={data?.queryMonitor || null} />
                            <ContentSignals
                                pages={data?.pageSignals || []}
                                onGenerateSchema={(url) => setSchemaUrl(url)}
                                onOptimize={(url) => setOptimizeUrl(url)}
                            />
                        </motion.div>

                        {/* Row 4: Entity Map */}
                        {(data?.entities?.length ?? 0) > 0 && (
                            <motion.div variants={fadeUp}>
                                <EntityMap entities={data?.entities || []} />
                            </motion.div>
                        )}

                        {/* Source indicator */}
                        {data?.source && (
                            <motion.div variants={fadeUp} className="text-center">
                                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                                    Powered by {data.source === 'gemini' ? 'Gemini AI' : 'Content Analysis'}
                                </span>
                            </motion.div>
                        )}
                    </>
                )}
            </motion.div>

            {/* Modals */}
            <AnimatePresence>
                {schemaUrl && (
                    <SchemaGenerator url={schemaUrl} onClose={() => setSchemaUrl(null)} />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {optimizeUrl && (
                    <ContentOptimizer url={optimizeUrl} topQueries={topQueryStrings} onClose={() => setOptimizeUrl(null)} />
                )}
            </AnimatePresence>
        </>
    );
}
