'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Globe, ChevronDown, Coins, History, RotateCcw, Maximize2, Minimize2, X } from 'lucide-react';

interface SiteOption {
    id: string;
    label: string;
    type: string;
}

interface ChatHeaderProps {
    currentSiteLabel: string;
    allSites: SiteOption[];
    selectedChatSite: string;
    onSiteChange: (id: string) => void;
    showSiteDropdown: boolean;
    setShowSiteDropdown: (next: boolean | ((prev: boolean) => boolean)) => void;
    credits: number | null;
    showCreditAnim: boolean;
    showHistory: boolean;
    onHistoryClick: () => void;
    onClearClick: () => void;
    isExpanded: boolean;
    onExpandToggle: () => void;
    onClose: () => void;
}

/**
 * Sticky chat header — brand mark + AI Analyst label + inline site picker
 * + credits + history/clear/expand/close buttons. Stateless: parent owns
 * the dropdown open-state, the active site, and all click handlers.
 *
 * Extracted from AIChatbot.tsx during B5-full split.
 */
export function ChatHeader({
    currentSiteLabel, allSites, selectedChatSite, onSiteChange,
    showSiteDropdown, setShowSiteDropdown,
    credits, showCreditAnim, showHistory, onHistoryClick,
    onClearClick, isExpanded, onExpandToggle, onClose,
}: ChatHeaderProps) {
    return (
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between bg-[var(--header-bg)]">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center relative">
                    <Sparkles className="w-4 h-4 text-black" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[var(--header-bg)]" />
                </div>
                <div>
                    <h3 className="text-sm sm:text-base font-semibold text-white leading-none">AI Analyst</h3>
                    <div className="relative">
                        <button
                            onClick={() => setShowSiteDropdown(prev => !prev)}
                            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5"
                        >
                            <Globe className="w-2.5 h-2.5" />
                            <span className="max-w-[120px] truncate">{currentSiteLabel}</span>
                            <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showSiteDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showSiteDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSiteDropdown(false)} />
                                <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl shadow-black/80 py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                                    {allSites.length === 0 ? (
                                        <div className="px-3 py-2 text-[11px] text-zinc-600">No sites connected</div>
                                    ) : (
                                        allSites.map(site => (
                                            <button
                                                key={site.id}
                                                onClick={() => { onSiteChange(site.id); setShowSiteDropdown(false); }}
                                                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition ${selectedChatSite === site.id
                                                    ? 'text-emerald-400 bg-emerald-500/[0.06]'
                                                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                                                }`}
                                            >
                                                <Globe className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">{site.label}</span>
                                                <span className="ml-auto text-[9px] text-zinc-600">{site.type}</span>
                                                {selectedChatSite === site.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1">
                {credits !== null && (
                    <div className="relative flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/8 border border-amber-500/15 mr-1">
                        <Coins className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-400">{credits}</span>
                        <AnimatePresence>
                            {showCreditAnim && (
                                <motion.span
                                    initial={{ opacity: 1, y: 0 }}
                                    animate={{ opacity: 0, y: -20 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                    className="absolute -top-1 right-0 text-[10px] font-bold text-red-400 pointer-events-none"
                                >
                                    -1
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                )}
                <button
                    onClick={onHistoryClick}
                    className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'text-white bg-white/[0.06]' : 'text-zinc-600 hover:text-white hover:bg-white/[0.04]'}`}
                    aria-label="Past conversations"
                    title="History"
                >
                    <History className="w-3.5 h-3.5" />
                </button>
                <button onClick={onClearClick} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors" aria-label="Clear chat history" title="Clear chat">
                    <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button onClick={onExpandToggle} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors" aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'} title={isExpanded ? 'Minimize' : 'Expand'}>
                    {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-colors" aria-label="Close chat" title="Close (Esc)">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
