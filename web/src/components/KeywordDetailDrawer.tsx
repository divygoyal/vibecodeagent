'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, TrendingUp, Eye, MousePointer, Hash, AlertTriangle,
  Target, FileText, ScanSearch, Sparkles, Loader2
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell
} from 'recharts';
import useSWR from 'swr';
import { useTableActions } from '@/components/TableActionMenu';

/* ─── Types ─── */
interface KeywordDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  keyword: string | null;
  siteUrl: string | null;
}

interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface TrendRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface KeywordDetailData {
  pages: PageRow[];
  trend: TrendRow[];
}

/* ─── Expected CTR by position (industry benchmarks) ─── */
const EXPECTED_CTR: Record<number, number> = {
  1: 31.7, 2: 24.7, 3: 18.7, 4: 13.6, 5: 9.5,
  6: 6.2, 7: 4.2, 8: 3.1, 9: 2.4, 10: 2.1,
};

function getExpectedCtr(position: number): number {
  const rounded = Math.min(10, Math.max(1, Math.round(position)));
  return EXPECTED_CTR[rounded] || 1.5;
}

/* ─── Helpers ─── */
function fmtNum(n?: number): string {
  if (n === undefined || n === null) return '--';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function positionColor(pos: number): string {
  if (pos <= 3) return 'text-emerald-400 bg-emerald-500/[0.1] border-emerald-500/20';
  if (pos <= 10) return 'text-cyan-400 bg-cyan-500/[0.1] border-cyan-500/20';
  if (pos <= 20) return 'text-amber-400 bg-amber-500/[0.1] border-amber-500/20';
  return 'text-red-400 bg-red-500/[0.1] border-red-500/20';
}

function positionBadgeColor(pos: number): string {
  if (pos <= 3) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (pos <= 10) return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25';
  if (pos <= 20) return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  return 'bg-red-500/15 text-red-400 border-red-500/25';
}

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > maxLen) return path.substring(0, maxLen) + '...';
    return path;
  } catch {
    return url.length > maxLen ? url.substring(0, maxLen) + '...' : url;
  }
}

/* ─── SWR Fetcher ─── */
const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Failed to fetch');
  return r.json();
});

/* ─── Skeleton Loader ─── */
function DrawerSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3.5">
            <div className="h-2.5 w-16 bg-white/[0.06] rounded mb-2" />
            <div className="h-6 w-12 bg-white/[0.08] rounded" />
          </div>
        ))}
      </div>
      <div className="h-40 bg-white/[0.02] rounded-xl border border-white/[0.04]" />
      <div className="h-24 bg-white/[0.02] rounded-xl border border-white/[0.04]" />
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.02] rounded-lg border border-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function KeywordDetailDrawer({ isOpen, onClose, keyword, siteUrl }: KeywordDetailDrawerProps) {
  const actions = useTableActions();

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // SWR conditional fetch
  const { data, error, isLoading } = useSWR<KeywordDetailData>(
    isOpen && keyword && siteUrl
      ? `/api/seo/keyword-detail?siteUrl=${encodeURIComponent(siteUrl)}&keyword=${encodeURIComponent(keyword)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Computed values
  const avgPosition = data?.pages?.length
    ? +(data.pages.reduce((s, p) => s + p.position, 0) / data.pages.length).toFixed(1)
    : null;
  const totalClicks = data?.pages?.reduce((s, p) => s + p.clicks, 0) ?? 0;
  const totalImpressions = data?.pages?.reduce((s, p) => s + p.impressions, 0) ?? 0;
  const avgCtr = totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(1) : 0;
  const expectedCtr = avgPosition ? getExpectedCtr(avgPosition) : 0;
  const hasCannibalization = (data?.pages?.length ?? 0) > 1;
  const topPage = data?.pages?.[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:max-w-lg z-50 bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-[var(--card-bg)] backdrop-blur-md border-b border-[var(--card-border)] px-4 sm:px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Search className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Keyword Detail</p>
                  <h2 className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5">&ldquo;{keyword}&rdquo;</h2>
                </div>
                {avgPosition !== null && (
                  <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md border ${positionBadgeColor(avgPosition)}`}>
                    #{avgPosition}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6">
              {isLoading && <DrawerSkeleton />}

              {error && (
                <div className="bg-red-500/[0.06] border border-red-500/15 rounded-xl p-4 text-center">
                  <p className="text-sm text-red-400">Failed to load keyword data</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Please try again later</p>
                </div>
              )}

              {data && !isLoading && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Total Clicks" value={fmtNum(totalClicks)} icon={MousePointer} color="emerald" />
                    <MetricCard label="Impressions" value={fmtNum(totalImpressions)} icon={Eye} color="cyan" />
                    <MetricCard label="Avg. Position" value={avgPosition?.toString() ?? '--'} icon={Hash} color={avgPosition && avgPosition <= 10 ? 'emerald' : 'amber'} />
                    <MetricCard label="Avg. CTR" value={`${avgCtr}%`} icon={TrendingUp} color={avgCtr >= expectedCtr ? 'emerald' : 'amber'} />
                  </div>

                  {/* 7-Day Trend Sparkline */}
                  {data.trend.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">7-Day Trend</h3>
                      <div className="h-40 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data.trend}>
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v: string) => v.slice(5)}
                            />
                            <YAxis
                              yAxisId="left"
                              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                              axisLine={false}
                              tickLine={false}
                              width={30}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                              axisLine={false}
                              tickLine={false}
                              width={30}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--card-border)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: 'var(--text-primary)',
                              }}
                              labelStyle={{ color: 'var(--text-muted)' }}
                            />
                            <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#34d399" strokeWidth={2} dot={false} name="Clicks" />
                            <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="#22d3ee" strokeWidth={2} dot={false} name="Impressions" strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* CTR vs Benchmark */}
                  {avgPosition !== null && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">CTR vs Expected (Position #{Math.round(avgPosition)})</h3>
                      <div className="h-24 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Actual CTR', value: avgCtr },
                              { name: 'Expected CTR', value: expectedCtr },
                            ]}
                            layout="vertical"
                            barGap={4}
                          >
                            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} domain={[0, 'auto']} unit="%" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={80} />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--card-border)',
                                borderRadius: 8,
                                fontSize: 11,
                              }}
                              formatter={(v) => `${v}%`}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              <Cell fill={avgCtr >= expectedCtr ? '#34d399' : '#f87171'} />
                              <Cell fill="#22d3ee" />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {avgCtr < expectedCtr && (
                        <p className="text-[10px] text-amber-400 mt-1.5">
                          CTR is {(expectedCtr - avgCtr).toFixed(1)}% below benchmark. Consider improving your meta title and description.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cannibalization Warning */}
                  {hasCannibalization && (
                    <div className="bg-amber-500/[0.06] border border-amber-500/15 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-400">Keyword Cannibalization Detected</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {data.pages.length} pages are ranking for &ldquo;{keyword}&rdquo;. This may split ranking signals.
                        Consider consolidating content or using canonical tags.
                      </p>
                    </div>
                  )}

                  {/* Pages Ranking Table */}
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                      Pages Ranking for This Keyword
                    </h3>
                    {data.pages.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] text-center py-6">No pages found</p>
                    ) : (
                      <div className="space-y-1.5">
                        {data.pages.map((page, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-2.5 px-3 bg-white/[0.02] rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                          >
                            <div className="min-w-0 flex-1 mr-3">
                              <p className="text-xs text-[var(--text-primary)] truncate font-medium">{truncateUrl(page.page)}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-[var(--text-muted)]">{fmtNum(page.clicks)} clicks</span>
                                <span className="text-[10px] text-[var(--text-muted)]">{fmtNum(page.impressions)} impr</span>
                                <span className="text-[10px] text-[var(--text-muted)]">{page.ctr}% CTR</span>
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border flex-shrink-0 ${positionColor(page.position)}`}>
                              #{page.position}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="border-t border-[var(--card-border)] pt-4">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Quick Actions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <ActionButton
                        icon={Target}
                        label="Track Keyword"
                        color="text-amber-400"
                        onClick={() => {
                          const a = actions.trackKeyword(keyword!);
                          a.onClick();
                        }}
                      />
                      <ActionButton
                        icon={FileText}
                        label="Generate Content"
                        color="text-emerald-400"
                        onClick={() => {
                          const a = actions.generateContent(keyword!);
                          a.onClick();
                        }}
                      />
                      {topPage && (
                        <ActionButton
                          icon={ScanSearch}
                          label="Audit Top Page"
                          color="text-cyan-400"
                          onClick={() => {
                            const a = actions.auditPage(topPage.page);
                            a.onClick();
                          }}
                        />
                      )}
                      <ActionButton
                        icon={Sparkles}
                        label="Analyze with AI"
                        color="text-violet-400"
                        onClick={() => {
                          const a = actions.analyzeWithAI(
                            `Analyze the keyword "${keyword}" in depth. It ranks at position ${avgPosition} with ${totalClicks} clicks and ${totalImpressions} impressions. ${hasCannibalization ? `Warning: ${data.pages.length} pages compete for this keyword.` : ''} Provide optimization recommendations.`,
                            siteUrl ?? undefined
                          );
                          a.onClick();
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Reusable sub-components ─── */

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400',
    cyan: 'text-cyan-400', violet: 'text-violet-400',
  };
  return (
    <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${colorMap[color] || 'text-zinc-400'}`} />
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold tabular-nums ${colorMap[color] || 'text-[var(--text-primary)]'}`}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({ icon: Icon, label, color, onClick }: { icon: React.ElementType; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] rounded-xl text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      {label}
    </button>
  );
}
