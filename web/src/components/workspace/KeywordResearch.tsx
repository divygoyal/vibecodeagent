'use client';
import React, { useState, useMemo } from 'react';
import { Search, Target, Loader2, PenTool, MessageSquare, Copy, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import useSWR from 'swr';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';

interface KeywordResult {
  keyword: string;
  volume: number;
  difficulty: 'Low' | 'Medium' | 'High';
  intent: 'Informational' | 'Commercial' | 'Transactional' | 'Navigational';
  contentType: string;
  reason: string;
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Failed to fetch');
  return r.json();
});

const INTENT_TABS = ['All', 'Informational', 'Commercial', 'Transactional', 'Navigational'] as const;

const difficultyBadge: Record<string, string> = {
  Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  High: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const intentColor: Record<string, string> = {
  Informational: 'text-blue-400',
  Commercial: 'text-violet-400',
  Transactional: 'text-emerald-400',
  Navigational: 'text-amber-400',
};

export default function KeywordResearch() {
  const [seedKeyword, setSeedKeyword] = useState('');
  const [domain, setDomain] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [searchDomain, setSearchDomain] = useState('');
  const [activeIntent, setActiveIntent] = useState<typeof INTENT_TABS[number]>('All');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { generateContent, trackKeyword, analyzeWithAI, copyToClipboard } = useTableActions();

  const { data, error, isLoading } = useSWR(
    searchTrigger ? `/api/keyword-research?keyword=${encodeURIComponent(searchTrigger)}${searchDomain ? `&domain=${encodeURIComponent(searchDomain)}` : ''}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const keywords: KeywordResult[] = data?.keywords || [];

  const filteredKeywords = useMemo(() => {
    if (activeIntent === 'All') return keywords;
    return keywords.filter(k => k.intent === activeIntent);
  }, [keywords, activeIntent]);

  const handleSearch = () => {
    if (seedKeyword.trim()) {
      setSearchTrigger(seedKeyword.trim());
      setSearchDomain(domain.trim());
      setActiveIntent('All');
      setExpandedRow(null);
    }
  };

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
          <Search className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Keyword Research</h2>
          <p className="text-xs text-[var(--text-muted)]">Discover keyword opportunities powered by AI</p>
        </div>
      </div>

      {/* Input Section */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
        <div className="flex-1 glass-card rounded-xl p-3 flex items-center gap-3">
          <Target className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            type="text"
            value={seedKeyword}
            onChange={(e) => setSeedKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter a seed keyword..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none min-h-[44px]"
          />
        </div>
        <div className="sm:w-48 glass-card rounded-xl p-3 flex items-center gap-3">
          <PenTool className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Domain (optional)"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none min-h-[44px]"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!seedKeyword.trim() || isLoading}
          className="w-full sm:w-auto min-h-[44px] px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Research
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 mb-4">
          Failed to fetch keyword data. Please try again.
        </div>
      )}

      {/* Intent Filter Tabs */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-4 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mr-1" />
          {INTENT_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveIntent(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                activeIntent === tab
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer-loading rounded-xl h-14" />
          ))}
        </div>
      )}

      {/* Results Table */}
      {!isLoading && filteredKeywords.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--card-border)]">
                <th className="pb-3 pl-4 font-medium">Keyword</th>
                <th className="pb-3 font-medium">Volume</th>
                <th className="pb-3 font-medium">Difficulty</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Intent</th>
                <th className="pb-3 font-medium hidden md:table-cell">Content Type</th>
                <th className="pb-3 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeywords.map((kw, idx) => (
                <React.Fragment key={idx}>
                  <tr
                    className="table-row-premium cursor-pointer"
                    onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                  >
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{kw.keyword}</span>
                        {expandedRow === idx ? (
                          <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="text-sm text-[var(--text-secondary)]">
                        {typeof kw.volume === 'number' ? kw.volume.toLocaleString() : kw.volume}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${difficultyBadge[kw.difficulty] || difficultyBadge.Medium}`}>
                        {kw.difficulty}
                      </span>
                    </td>
                    <td className="py-3 hidden sm:table-cell">
                      <span className={`text-xs font-medium ${intentColor[kw.intent] || 'text-[var(--text-secondary)]'}`}>
                        {kw.intent}
                      </span>
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <span className="text-xs text-[var(--text-muted)]">{kw.contentType}</span>
                    </td>
                    <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <TableActionMenu
                        actions={[
                          generateContent(kw.keyword),
                          trackKeyword(kw.keyword),
                          analyzeWithAI(`Analyze the keyword "${kw.keyword}" with volume ${kw.volume}, ${kw.difficulty} difficulty, and ${kw.intent} intent. Suggest a content strategy.`),
                          copyToClipboard(kw.keyword),
                        ]}
                      />
                    </td>
                  </tr>
                  {expandedRow === idx && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3">
                        <div className="rounded-lg bg-white/[0.03] border border-[var(--card-border)] p-3 text-xs text-[var(--text-secondary)] flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span><strong className="text-[var(--text-primary)]">Why this keyword?</strong> {kw.reason}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty States */}
      {!isLoading && !error && searchTrigger && filteredKeywords.length === 0 && keywords.length > 0 && (
        <div className="text-center py-12">
          <Filter className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No keywords match the &quot;{activeIntent}&quot; intent filter.</p>
        </div>
      )}

      {!isLoading && !error && searchTrigger && keywords.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No keyword suggestions found. Try a different seed keyword.</p>
        </div>
      )}

      {!searchTrigger && !isLoading && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-violet-400/60" />
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-1">Enter a seed keyword to discover opportunities</p>
          <p className="text-xs text-[var(--text-muted)]">AI will generate related keywords with volume, difficulty, and intent data</p>
        </div>
      )}
    </div>
  );
}
