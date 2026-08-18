'use client';

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, TrendingUp } from 'lucide-react';

import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';
import OfficialRedditPostEmbed from '@/components/social/OfficialRedditPostEmbed';
import RedditMentionsLockup from '@/components/social/RedditMentionsMark';
import type { RedditMentionPayload } from '@/lib/redditMentionsShared';

interface RedditMentionsProviderProps {
  domain: string;
  children: ReactNode;
}

interface RedditMentionsTopPanelProps {
  className?: string;
  premiumHover?: boolean;
}

interface RedditMentionsPickerRailProps {
  className?: string;
  premiumHover?: boolean;
}

type VisibleMention = {
  index: number;
  mention: RedditMentionPayload;
};

type RedditMentionsContextValue = {
  domain: string;
  activated: boolean;
  activate: () => void;
  mentions: RedditMentionPayload[];
  loading: boolean;
  error: string | null;
  warning: string | null;
  hasMentions: boolean;
  visibleCount: number;
  visibleMentions: VisibleMention[];
  visibleIndexSet: Set<number>;
  boundedWindowStart: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  handlePrev: () => void;
  handleNext: () => void;
  goToWindowStart: (index: number) => void;
};

type WindowWithIdle = Window & typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const RAIL_CARD_WIDTH = 280;
const RAIL_CARD_GAP = 12;
const DESKTOP_VISIBLE_COUNT = 3;
const MOBILE_VISIBLE_COUNT = 1;

const RedditMentionsContext = createContext<RedditMentionsContextValue | null>(null);

function useRedditMentionsContext() {
  const value = useContext(RedditMentionsContext);
  if (!value) {
    throw new Error('Reddit mentions components must be used within RedditMentionsProvider');
  }
  return value;
}

function toTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortMentionsByNewest(mentions: RedditMentionPayload[]) {
  return [...mentions].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

function dedupMentions(mentions: RedditMentionPayload[]) {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    if (!mention.id || seen.has(mention.id)) return false;
    seen.add(mention.id);
    return true;
  });
}

function timeAgo(value?: string) {
  if (!value) return 'Recently';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatCompact(value?: number | string) {
  if (value === undefined || value === null) return '0';
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Math.abs(numeric) >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return Number.isInteger(numeric) ? numeric.toLocaleString() : numeric.toFixed(1);
}

export function RedditMentionsProvider({ domain, children }: RedditMentionsProviderProps) {
  const [activated, setActivated] = useState(false);
  const [mentions, setMentions] = useState<RedditMentionPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 768px)');
    setIsWide(mql.matches);
    const handler = (event: MediaQueryListEvent) => setIsWide(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setActivated(false);
    setMentions([]);
    setLoading(false);
    setError(null);
    setWarning(null);
    setWindowStart(0);
  }, [domain]);

  useEffect(() => {
    if (!activated || !domain) return;

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `tc-rdm2-${domain}-${today}`;

    let cancelled = false;
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => {
      if (!cancelled) controller.abort();
    }, 18_000);

    const readCache = () => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        const parsed = JSON.parse(cached) as {
          mentions?: RedditMentionPayload[];
          warning?: string | null;
          error?: string | null;
        };

        if (!Array.isArray(parsed.mentions)) return null;
        return {
          mentions: sortMentionsByNewest(dedupMentions(parsed.mentions)),
          warning: parsed.warning || null,
          error: parsed.error || null,
        };
      } catch {
        return null;
      }
    };

    (async () => {
      const cached = readCache();
      if (cached && !cancelled) {
        setMentions(cached.mentions);
        setWarning(cached.warning);
        setError(cached.error);
        return;
      }

      setLoading(true);
      setError(null);
      setWarning(null);

      try {
        const response = await fetch('/api/reddit-mentions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: controller.signal,
        });

        if (cancelled) return;

        const payload = await response.json().catch(() => ({}));
        const nextMentions = sortMentionsByNewest(
          dedupMentions(Array.isArray(payload.mentions) ? payload.mentions : []),
        );
        const nextError =
          !response.ok || payload.error ? payload.error || 'Failed to fetch Reddit mentions' : null;
        const nextWarning = !nextError ? payload.warning || null : null;

        setMentions(nextMentions);
        setError(nextError);
        setWarning(nextWarning);

        if (!nextError) {
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({
                mentions: nextMentions,
                warning: nextWarning,
                error: nextError,
              }),
            );
          } catch {
            // Ignore storage quota failures.
          }
        }
      } catch (err) {
        if (cancelled) return;
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        setError(isAbort ? 'Reddit mentions are taking longer than usual — check back in a bit.' : 'Failed to fetch Reddit mentions');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(fetchTimeout);
      controller.abort();
    };
  }, [activated, domain]);

  useEffect(() => {
    setWindowStart(0);
  }, [mentions, isWide]);

  const visibleCount = isWide ? DESKTOP_VISIBLE_COUNT : MOBILE_VISIBLE_COUNT;
  const hasMentions = mentions.length > 0;
  const maxWindowStart = hasMentions ? Math.max(0, mentions.length - visibleCount) : 0;
  const boundedWindowStart = hasMentions ? Math.min(windowStart, maxWindowStart) : 0;
  const visibleMentions = useMemo(
    () =>
      mentions
        .slice(boundedWindowStart, boundedWindowStart + visibleCount)
        .map((mention, index) => ({ index: boundedWindowStart + index, mention })),
    [boundedWindowStart, mentions, visibleCount],
  );
  const visibleIndexSet = useMemo(
    () => new Set(visibleMentions.map((entry) => entry.index)),
    [visibleMentions],
  );
  const canGoPrev = boundedWindowStart > 0;
  const canGoNext = boundedWindowStart < maxWindowStart;

  const activate = useCallback(() => {
    setActivated(true);
  }, []);

  const goToWindowStart = useCallback(
    (index: number) => {
      setWindowStart(() => {
        if (mentions.length === 0) return 0;
        return Math.max(0, Math.min(index, maxWindowStart));
      });
    },
    [maxWindowStart, mentions.length],
  );

  const handlePrev = useCallback(() => {
    if (!canGoPrev) return;
    setWindowStart((current) => Math.max(0, current - visibleCount));
  }, [canGoPrev, visibleCount]);

  const handleNext = useCallback(() => {
    if (!canGoNext) return;
    setWindowStart((current) => Math.min(maxWindowStart, current + visibleCount));
  }, [canGoNext, maxWindowStart, visibleCount]);

  const value = useMemo<RedditMentionsContextValue>(
    () => ({
      domain,
      activated,
      activate,
      mentions,
      loading,
      error,
      warning,
      hasMentions,
      visibleCount,
      visibleMentions,
      visibleIndexSet,
      boundedWindowStart,
      canGoPrev,
      canGoNext,
      handlePrev,
      handleNext,
      goToWindowStart,
    }),
    [
      activate,
      activated,
      boundedWindowStart,
      canGoNext,
      canGoPrev,
      domain,
      error,
      goToWindowStart,
      handleNext,
      handlePrev,
      hasMentions,
      loading,
      mentions,
      visibleCount,
      visibleIndexSet,
      visibleMentions,
      warning,
    ],
  );

  return <RedditMentionsContext.Provider value={value}>{children}</RedditMentionsContext.Provider>;
}

export const RedditMentionsTopPanel = memo(function RedditMentionsTopPanel({
  className = '',
  premiumHover = false,
}: RedditMentionsTopPanelProps) {
  const {
    domain,
    activated,
    activate,
    loading,
    error,
    warning,
    hasMentions,
    mentions,
    visibleCount,
    visibleMentions,
    boundedWindowStart,
    canGoPrev,
    canGoNext,
    handlePrev,
    handleNext,
  } = useRedditMentionsContext();

  const sectionRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  useEffect(() => {
    if (activated || !domain) return;

    const browserWindow = window as WindowWithIdle;
    let observer: IntersectionObserver | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: number | null = null;

    if (sectionRef.current && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activate();
            observer?.disconnect();
          }
        },
        { rootMargin: '320px 0px' },
      );
      observer.observe(sectionRef.current);
    }

    if (browserWindow.requestIdleCallback) {
      idleHandle = browserWindow.requestIdleCallback(activate, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(activate, 4000);
    }

    return () => {
      observer?.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
      if (idleHandle !== null && browserWindow.cancelIdleCallback) {
        browserWindow.cancelIdleCallback(idleHandle);
      }
    };
  }, [activate, activated, domain]);

  return (
    <DashboardHoverSurface
      ref={sectionRef}
      as="section"
      tone="amber"
      interactive={premiumHover}
      className={`border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6 ${className}`.trim()}
      tabIndex={hasMentions ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handlePrev();
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          handleNext();
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <RedditMentionsLockup
              iconClassName="h-5 w-5 text-orange-400"
              textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500"
            />
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-2xl">
            Who&apos;s discussing your site
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Recent Reddit posts that mention <span className="text-orange-300">{domain}</span>. Newest discussions appear first.
          </p>
        </div>

        {hasMentions && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              data-variant="ghost"
              aria-label="Show previous Reddit posts"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              data-variant="ghost"
              aria-label="Show next Reddit posts"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!activated && !hasMentions && !loading && !error && !warning && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-5 text-sm text-zinc-500">
          Reddit mentions will load when this section comes into view.
        </div>
      )}

      {loading && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#05090d] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest Reddit Posts</div>
              <div className="mt-1 text-sm text-zinc-400">Loading the latest discussions now.</div>
            </div>
            <div className="rounded-full border border-orange-500/20 bg-orange-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
              Posts only
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {Array.from({ length: visibleCount }).map((_, index) => (
              <div
                key={index}
                className="h-[320px] animate-pulse rounded-[14px] border border-white/[0.06] bg-[#060b0f]"
              />
            ))}
          </div>
        </div>
      )}

      {!loading && error && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-6 text-center">
          <p className="text-sm text-zinc-400">{error}</p>
        </div>
      )}

      {!loading && !error && activated && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-6 text-center">
          <p className="text-sm text-zinc-500">No Reddit mentions found yet for this domain.</p>
          <p className="mt-1 text-[11px] text-zinc-600">Check back tomorrow — mentions refresh daily.</p>
          {warning ? <p className="mt-3 text-xs text-amber-200">{warning}</p> : null}
        </div>
      )}

      {hasMentions && (
        <div
          className="relative mt-5"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0].clientX;
            touchCurrentX.current = event.touches[0].clientX;
          }}
          onTouchMove={(event) => {
            touchCurrentX.current = event.touches[0].clientX;
          }}
          onTouchEnd={() => {
            const delta = touchStartX.current - touchCurrentX.current;
            if (Math.abs(delta) < 50) return;
            if (delta > 0 && canGoNext) handleNext();
            if (delta < 0 && canGoPrev) handlePrev();
          }}
          style={{ touchAction: 'pan-y' }}
        >
          {warning ? (
            <div className="mb-4 border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
              {warning}
            </div>
          ) : null}

          <div className="border border-white/[0.06] bg-[#05090d] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest Reddit Posts</div>
                <div className="mt-1 text-sm text-zinc-400">
                  Browse the freshest posts now. Use the arrows or the picker below to swap posts into view.
                </div>
              </div>
              <div className="rounded-full border border-orange-500/20 bg-orange-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
                {visibleMentions.length > 1
                  ? `Showing ${boundedWindowStart + 1}-${boundedWindowStart + visibleMentions.length} of ${mentions.length}`
                  : `Showing ${boundedWindowStart + 1} of ${mentions.length}`}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {visibleMentions.map(({ mention, index }) => (
                <div key={mention.id} className={premiumHover ? 'dashboard-hover-item' : ''}>
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      {index === 0 ? 'Latest Post' : 'Recent Post'}
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{timeAgo(mention.createdAt)}</span>
                  </div>
                  <OfficialRedditPostEmbed mention={mention} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardHoverSurface>
  );
});

export const RedditMentionsPickerRail = memo(function RedditMentionsPickerRail({
  className = '',
  premiumHover = false,
}: RedditMentionsPickerRailProps) {
  const {
    activated,
    mentions,
    loading,
    error,
    warning,
    hasMentions,
    visibleIndexSet,
    goToWindowStart,
  } = useRedditMentionsContext();

  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(rail.scrollLeft > 4);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (typeof window === 'undefined') return;
    const frameId = window.requestAnimationFrame(updateScrollState);

    if (!rail) {
      return () => window.cancelAnimationFrame(frameId);
    }

    const handleScroll = () => updateScrollState();
    rail.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      window.cancelAnimationFrame(frameId);
      rail.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [mentions.length, updateScrollState]);

  const scrollRail = useCallback((direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * (RAIL_CARD_WIDTH + RAIL_CARD_GAP),
      behavior: 'smooth',
    });
  }, []);

  if (!activated && !hasMentions && !loading && !error && !warning) {
    return null;
  }

  return (
    <DashboardHoverSurface
      as="section"
      tone="amber"
      interactive={premiumHover}
      className={`border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest Reddit mentions</div>
          <div className="mt-1 text-sm text-zinc-400">
            Pick any recent Reddit post to swap it into the main view above.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-orange-500/20 bg-orange-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
            Interactive picker
          </div>
          <div className="rounded-full border border-white/[0.08] bg-[#060b0f] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Click or drag
          </div>
          {hasMentions && (
            <>
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                disabled={!canScrollLeft}
                className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                data-variant="ghost"
                aria-label="Scroll Reddit picker left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                disabled={!canScrollRight}
                className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                data-variant="ghost"
                aria-label="Scroll Reddit picker right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {warning ? (
        <div className="mt-4 border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
          {warning}
        </div>
      ) : null}

      {!hasMentions && !loading ? (
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] p-4 text-sm text-zinc-500">
          Reddit posts will appear here once mentions load for this domain.
        </div>
      ) : null}

      {hasMentions ? (
        <div
          ref={railRef}
          className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {mentions.map((mention, index) => {
            const active = visibleIndexSet.has(index);

            return (
              <button
                key={mention.id}
                type="button"
                onClick={() => goToWindowStart(index)}
                className={`${premiumHover ? 'dashboard-hover-item ' : ''}w-[280px] shrink-0 border p-4 text-left transition-all duration-200 ${
                  active
                    ? 'border-orange-400/35 bg-orange-500/[0.08] shadow-[0_12px_30px_rgba(249,115,22,0.08)]'
                    : 'border-white/[0.06] bg-[#060b0f]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      <span className={active ? 'text-orange-200' : 'text-zinc-500'}>
                        r/{mention.subreddit}
                      </span>
                      {index === 0 ? (
                        <span className="rounded-full border border-orange-500/20 bg-orange-500/[0.08] px-2 py-0.5 text-[9px] text-orange-200">
                          Latest
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-white">
                      {mention.title}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                    {timeAgo(mention.createdAt)}
                  </span>
                </div>

                <div className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-400">
                  {mention.text || 'Open the post to view the full discussion.'}
                </div>

                <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-orange-300" />
                    {formatCompact(mention.score)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />
                    {formatCompact(mention.commentCount)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </DashboardHoverSurface>
  );
});
