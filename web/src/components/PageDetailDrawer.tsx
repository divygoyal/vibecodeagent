'use client';

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Copy, ExternalLink, MousePointer, Eye, Hash,
  TrendingUp, Smartphone, Monitor, Tablet, ScanSearch, Zap,
  Sparkles, Check, ArrowUpDown, ChevronUp, ChevronDown
} from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie
} from 'recharts';
import useSWR from 'swr';
import { useTableActions } from '@/components/TableActionMenu';

/* ─── Types ─── */
interface PageDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pageUrl: string | null;
  siteUrl: string | null;
}

interface KeywordRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface DeviceRow {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PageDetailData {
  keywords: KeywordRow[];
  devices: DeviceRow[];
}

type SortKey = 'query' | 'position' | 'clicks' | 'impressions' | 'ctr';
type SortDir = 'asc' | 'desc';

/* ─── Helpers ─── */
function fmtNum(n?: number): string {
  if (n === undefined || n === null) return '--';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function truncateUrl(url: string, maxLen = 45): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > maxLen) return path.substring(0, maxLen) + '...';
    return path;
  } catch {
    return url.length > maxLen ? url.substring(0, maxLen) + '...' : url;
  }
}

function positionColor(pos: number): string {
  if (pos <= 3) return 'text-emerald-400 bg-emerald-500/[0.1] border-emerald-500/20';
  if (pos <= 10) return 'text-cyan-400 bg-cyan-500/[0.1] border-cyan-500/20';
  if (pos <= 20) return 'text-amber-400 bg-amber-500/[0.1] border-amber-500/20';
  return 'text-red-400 bg-red-500/[0.1] border-red-500/20';
}

const POSITION_CHART_COLORS = ['#34d399', '#22d3ee', '#fbbf24', '#f87171'];

/* ─── SWR Fetcher ─── */
const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Failed to fetch');
  return r.json();
});

/* ─── Skeleton ─── */
function DrawerSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 bg-white/[0.02] rounded-xl border border-white/[0.04]" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3">
            <div className="h-2.5 w-12 bg-white/[0.06] rounded mb-2" />
            <div className="h-5 w-10 bg-white/[0.08] rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-white/[0.02] rounded-lg border border-white/[0.04]" />
        ))}
      </div>
      <div className="h-28 bg-white/[0.02] rounded-xl border border-white/[0.04]" />
    </div>
  );
}

/* ─── Device Icon ─── */
function DeviceIcon({ device }: { device: string }) {
  const d = device.toLowerCase();
  if (d === 'mobile') return <Smartphone className="w-3.5 h-3.5" />;
  if (d === 'tablet') return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
}

/* ─── Main Component ─── */
export default function PageDetailDrawer({ isOpen, onClose, pageUrl, siteUrl }: PageDetailDrawerProps) {
  const actions = useTableActions();
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Reset state when drawer opens with new page
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setSortKey('clicks');
      setSortDir('desc');
    }
  }, [isOpen, pageUrl]);

  // SWR conditional fetch
  const { data, error, isLoading } = useSWR<PageDetailData>(
    isOpen && pageUrl && siteUrl
      ? `/api/seo/page-detail?siteUrl=${encodeURIComponent(siteUrl)}&pageUrl=${encodeURIComponent(pageUrl)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Computed values
  const totalClicks = data?.keywords?.reduce((s, k) => s + k.clicks, 0) ?? 0;
  const totalImpressions = data?.keywords?.reduce((s, k) => s + k.impressions, 0) ?? 0;
  const avgPosition = data?.keywords?.length
    ? +(data.keywords.reduce((s, k) => s + k.position, 0) / data.keywords.length).toFixed(1)
    : null;
  const avgCtr = totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(1) : 0;

  // Sorted keywords
  const sortedKeywords = data?.keywords
    ? [...data.keywords].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      })
    : [];

  // Position distribution
  const positionDistribution = data?.keywords ? (() => {
    const buckets = { '1-3': 0, '4-10': 0, '11-20': 0, '20+': 0 };
    data.keywords.forEach(k => {
      if (k.position <= 3) buckets['1-3']++;
      else if (k.position <= 10) buckets['4-10']++;
      else if (k.position <= 20) buckets['11-20']++;
      else buckets['20+']++;
    });
    return [
      { name: '#1-3', value: buckets['1-3'] },
      { name: '#4-10', value: buckets['4-10'] },
      { name: '#11-20', value: buckets['11-20'] },
      { name: '#20+', value: buckets['20+'] },
    ].filter(b => b.value > 0);
  })() : [];

  // Device comparison
  const mobileDevice = data?.devices?.find(d => d.device.toLowerCase() === 'mobile');
  const desktopDevice = data?.devices?.find(d => d.device.toLowerCase() === 'desktop');
  const hasDeviceGap = mobileDevice && desktopDevice
    ? Math.abs(mobileDevice.position - desktopDevice.position) > 3 || Math.abs(mobileDevice.ctr - desktopDevice.ctr) > 3
    : false;

  // Copy handler
  const handleCopy = () => {
    if (pageUrl) {
      navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-2.5 h-2.5 text-[var(--text-muted)] opacity-50" />;
    return sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />;
  };

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
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Page Detail</p>
                  <h2 className="text-sm font-bold text-[var(--text-primary)] truncate break-all mt-0.5" title={pageUrl ?? ''}>
                    {pageUrl ? truncateUrl(pageUrl, 35) : '--'}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                  title="Copy URL"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                {pageUrl && (
                  <button
                    onClick={() => window.open(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`, '_blank')}
                    className="p-2 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                    title="Open in browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6">
              {isLoading && <DrawerSkeleton />}

              {error && (
                <div className="bg-red-500/[0.06] border border-red-500/15 rounded-xl p-4 text-center">
                  <p className="text-sm text-red-400">Failed to load page data</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Please try again later</p>
                </div>
              )}

              {data && !isLoading && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniMetricCard label="Clicks" value={fmtNum(totalClicks)} color="emerald" />
                    <MiniMetricCard label="Impressions" value={fmtNum(totalImpressions)} color="cyan" />
                    <MiniMetricCard label="Avg Pos" value={avgPosition?.toString() ?? '--'} color={avgPosition && avgPosition <= 10 ? 'emerald' : 'amber'} />
                    <MiniMetricCard label="Avg CTR" value={`${avgCtr}%`} color="violet" />
                  </div>

                  {/* Keywords Table + Position Distribution */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        Keywords ({sortedKeywords.length})
                      </h3>
                    </div>

                    {/* Position Distribution Mini Chart */}
                    {positionDistribution.length > 0 && (
                      <div className="h-8 mb-3 flex items-center gap-2">
                        {positionDistribution.map((bucket, i) => {
                          const total = data.keywords.length;
                          const pct = total > 0 ? (bucket.value / total) * 100 : 0;
                          return (
                            <div key={bucket.name} className="flex items-center gap-1 text-[10px]">
                              <div
                                className="h-4 rounded-sm min-w-[4px]"
                                style={{
                                  width: `${Math.max(4, pct * 0.8)}px`,
                                  backgroundColor: POSITION_CHART_COLORS[i],
                                }}
                              />
                              <span className="text-[var(--text-muted)]">{bucket.name}</span>
                              <span className="text-[var(--text-secondary)] font-mono font-bold">{bucket.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Sortable Table */}
                    {sortedKeywords.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] text-center py-6">No keywords found</p>
                    ) : (
                      <div className="border border-white/[0.04] rounded-xl overflow-hidden overflow-x-auto">
                        {/* Table Header */}
                        <div className="grid grid-cols-[1fr_55px_55px_50px_50px] gap-1 px-3 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                          <button onClick={() => handleSort('query')} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium hover:text-[var(--text-secondary)] transition text-left">
                            Query <SortIcon col="query" />
                          </button>
                          <button onClick={() => handleSort('position')} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium hover:text-[var(--text-secondary)] transition justify-end">
                            Pos <SortIcon col="position" />
                          </button>
                          <button onClick={() => handleSort('clicks')} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium hover:text-[var(--text-secondary)] transition justify-end">
                            Clicks <SortIcon col="clicks" />
                          </button>
                          <button onClick={() => handleSort('impressions')} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium hover:text-[var(--text-secondary)] transition justify-end">
                            Impr <SortIcon col="impressions" />
                          </button>
                          <button onClick={() => handleSort('ctr')} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium hover:text-[var(--text-secondary)] transition justify-end">
                            CTR <SortIcon col="ctr" />
                          </button>
                        </div>

                        {/* Table Rows */}
                        <div className="max-h-60 overflow-y-auto">
                          {sortedKeywords.map((kw, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-[1fr_55px_55px_50px_50px] gap-1 px-3 py-2 border-b border-white/[0.02] hover:bg-white/[0.03] transition-colors"
                            >
                              <span className="text-xs text-[var(--text-primary)] truncate">{kw.query}</span>
                              <span className={`text-xs font-mono text-right font-bold ${positionColor(kw.position).split(' ')[0]}`}>
                                {kw.position}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)] font-mono text-right">{fmtNum(kw.clicks)}</span>
                              <span className="text-xs text-[var(--text-muted)] font-mono text-right">{fmtNum(kw.impressions)}</span>
                              <span className="text-xs text-[var(--text-muted)] font-mono text-right">{kw.ctr}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Device Breakdown */}
                  {data.devices.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Device Breakdown</h3>
                      <div className="space-y-2">
                        {data.devices.map((device, i) => {
                          const maxClicks = Math.max(...data.devices.map(d => d.clicks), 1);
                          const barWidth = (device.clicks / maxClicks) * 100;
                          return (
                            <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <DeviceIcon device={device.device} />
                                  <span className="text-xs font-medium text-[var(--text-primary)] capitalize">{device.device}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px]">
                                  <span className="text-[var(--text-muted)]">Pos <span className="text-[var(--text-secondary)] font-mono font-bold">{device.position}</span></span>
                                  <span className="text-[var(--text-muted)]">CTR <span className="text-[var(--text-secondary)] font-mono font-bold">{device.ctr}%</span></span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                      width: `${barWidth}%`,
                                      backgroundColor: device.device.toLowerCase() === 'mobile' ? '#22d3ee' : device.device.toLowerCase() === 'tablet' ? '#fbbf24' : '#34d399',
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-[var(--text-secondary)] font-mono w-14 text-right">{fmtNum(device.clicks)} cl</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Device Gap Warning */}
                      {hasDeviceGap && mobileDevice && desktopDevice && (
                        <div className="mt-3 bg-amber-500/[0.06] border border-amber-500/15 rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-amber-400 mb-0.5">Significant Device Gap</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">
                            Mobile ranks #{mobileDevice.position} vs Desktop #{desktopDevice.position}
                            {Math.abs(mobileDevice.ctr - desktopDevice.ctr) > 3 && (
                              <> | CTR gap: {Math.abs(mobileDevice.ctr - desktopDevice.ctr).toFixed(1)}%</>
                            )}
                            . Consider mobile-specific optimizations.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="border-t border-[var(--card-border)] pt-4">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Quick Actions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <ActionButton
                        icon={ScanSearch}
                        label="Audit Page"
                        color="text-emerald-400"
                        onClick={() => {
                          if (pageUrl) {
                            const a = actions.auditPage(pageUrl);
                            a.onClick();
                          }
                        }}
                      />
                      <ActionButton
                        icon={Zap}
                        label="Optimize Page"
                        color="text-violet-400"
                        onClick={() => {
                          if (pageUrl) {
                            const a = actions.optimizePage(pageUrl);
                            a.onClick();
                          }
                        }}
                      />
                      <ActionButton
                        icon={ExternalLink}
                        label="Open External"
                        color="text-cyan-400"
                        onClick={() => {
                          if (pageUrl) {
                            const a = actions.openExternal(pageUrl);
                            a.onClick();
                          }
                        }}
                      />
                      <ActionButton
                        icon={Sparkles}
                        label="Analyze with AI"
                        color="text-amber-400"
                        onClick={() => {
                          if (pageUrl) {
                            const a = actions.analyzeWithAI(
                              `Analyze the page "${pageUrl}" in depth. It has ${totalClicks} total clicks, ${totalImpressions} impressions, avg position ${avgPosition}, and ${sortedKeywords.length} keywords. ${hasDeviceGap ? 'There is a significant mobile vs desktop performance gap.' : ''} Provide detailed optimization recommendations.`,
                              siteUrl ?? undefined
                            );
                            a.onClick();
                          }
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

/* ─── Sub-components ─── */

function MiniMetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400',
    cyan: 'text-cyan-400', violet: 'text-violet-400',
  };
  return (
    <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-2.5 text-center">
      <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${colorMap[color] || 'text-[var(--text-primary)]'}`}>{value}</p>
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
