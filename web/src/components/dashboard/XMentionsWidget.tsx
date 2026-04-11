'use client';

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';
import {
  EMBED_WIDTH,
  TWEET_LOADING_HEIGHT,
  XEmbedPreloader,
  XTweetSlide,
  createFallbackTweetState,
  getTweetRenderKey,
  type TweetHeightState,
} from '@/components/social/OfficialXTweetRenderer';
import { ensureTwitterSdk, type TwttrSdk } from '@/lib/xWidgetSdk';

type XMention = {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  verified: boolean;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  createdAt: string;
  media: { type: string; url: string }[];
  urls: string[];
  quotedTweet: {
    id: string;
    text: string;
    authorName: string;
    authorHandle: string;
  } | null;
};

type VisibleMention = {
  index: number;
  mention: XMention;
};

type WindowWithTwitter = Window & typeof globalThis & {
  twttr?: TwttrSdk;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface XMentionsProviderProps {
  domain: string;
  children: ReactNode;
}

interface XMentionsTopPanelProps {
  className?: string;
  premiumHover?: boolean;
}

interface XMentionsPickerRailProps {
  className?: string;
  premiumHover?: boolean;
}

type XMentionsContextValue = {
  domain: string;
  activated: boolean;
  activate: () => void;
  mentions: XMention[];
  loading: boolean;
  error: string | null;
  hasMentions: boolean;
  windowStart: number;
  boundedWindowStart: number;
  visibleMentions: VisibleMention[];
  visibleIndexSet: Set<number>;
  canGoPrev: boolean;
  canGoNext: boolean;
  compactScale: number;
  stageWidth: number;
  fallbackHeight: number;
  preloadMention: XMention | null;
  goToWindowStart: (index: number) => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleSlideStateChange: (tweetId: string, nextState: TweetHeightState) => void;
  getCardState: (tweetId: string, renderWidth?: number, renderFallbackHeight?: number) => TweetHeightState;
};

const DESKTOP_SCALE = 0.64;
const MOBILE_SCALE = 0.74;
const RAIL_CARD_WIDTH = 252;
const RAIL_CARD_GAP = 12;

const XMentionsContext = createContext<XMentionsContextValue | null>(null);

function useXMentionsContext() {
  const value = useContext(XMentionsContext);
  if (!value) {
    throw new Error('X mentions components must be used within XMentionsProvider');
  }
  return value;
}

function dedupMentions(mentions: XMention[]): XMention[] {
  const seenIds = new Set<string>();
  const idUnique = mentions.filter((mention) => !seenIds.has(mention.id) && !!seenIds.add(mention.id));
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/@\w+/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const seenTexts: string[] = [];

  return idUnique.filter((mention) => {
    const normalized = normalize(mention.text);
    if (
      normalized.length > 15 &&
      seenTexts.some((previous) => {
        const a = new Set(normalized.split(' ').filter(Boolean));
        const b = new Set(previous.split(' ').filter(Boolean));
        let overlap = 0;
        for (const word of a) {
          if (b.has(word)) overlap += 1;
        }
        return overlap / (a.size + b.size - overlap) > 0.55;
      })
    ) {
      return false;
    }
    seenTexts.push(normalized);
    return true;
  });
}

function toTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortMentionsByNewest(mentions: XMention[]) {
  return [...mentions].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
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

function formatMentionPreview(text: string) {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const withoutTrailingUrls = collapsed.replace(/(https?:\/\/\S+\s*)+$/g, '').trim();
  const withoutAllUrls = withoutTrailingUrls.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const trimmedReplyPrefix = withoutAllUrls.replace(/^(@\w+\s+){2,}/, '').trim();
  const candidate = trimmedReplyPrefix || withoutAllUrls || withoutTrailingUrls || collapsed;

  if (candidate.length <= 88) {
    return candidate;
  }

  const shortened = candidate.slice(0, 85).replace(/\s+\S*$/, '').trim();
  return `${shortened}...`;
}

export function XMentionsProvider({ domain, children }: XMentionsProviderProps) {
  const [activated, setActivated] = useState(false);
  const [mentions, setMentions] = useState<XMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const [tweetStates, setTweetStates] = useState<Record<string, TweetHeightState>>({});
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    setIsNarrow(mql.matches);
    const handler = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setActivated(false);
    setMentions([]);
    setLoading(false);
    setError(null);
    setWindowStart(0);
    setTweetStates({});
  }, [domain]);

  useEffect(() => {
    if (!activated || !domain) return;
    ensureTwitterSdk().catch(() => {
      // Visible slides handle embed failures locally.
    });
  }, [activated, domain]);

  useEffect(() => {
    if (!activated || !domain) return;

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `tc-xm6-${domain}-${today}`;

    let cancelled = false;
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => {
      if (!cancelled) controller.abort();
    }, 12_000);

    const readCache = () => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        const parsed = JSON.parse(cached) as XMention[];
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return sortMentionsByNewest(dedupMentions(parsed));
      } catch {
        return null;
      }
    };

    (async () => {
      const cachedMentions = readCache();
      if (cachedMentions && !cancelled) {
        setMentions(cachedMentions);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/x-mentions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
          signal: controller.signal,
        });

        if (cancelled) return;
        if (!response.ok) {
          setError('Failed to fetch X mentions');
          return;
        }

        const data = await response.json();
        const nextMentions = sortMentionsByNewest(dedupMentions(Array.isArray(data.mentions) ? data.mentions : []));

        if (data.error) {
          setError(data.error);
        } else if (data.warning) {
          setError(data.warning);
        } else {
          setError(null);
        }

        setMentions(nextMentions);

        if (nextMentions.length > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(nextMentions));
          } catch {
            // Ignore localStorage quota failures.
          }
        }
      } catch (err) {
        if (cancelled) return;
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        setError(isAbort ? 'X mentions are taking longer than usual — check back later' : 'Failed to fetch X mentions');
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
    setTweetStates({});
  }, [mentions]);

  const compactScale = isNarrow ? MOBILE_SCALE : DESKTOP_SCALE;
  const stageWidth = Math.round(EMBED_WIDTH * compactScale);
  const fallbackHeight = Math.round(TWEET_LOADING_HEIGHT * compactScale) + 32;
  const hasMentions = mentions.length > 0;
  const boundedWindowStart = hasMentions ? Math.max(0, Math.min(windowStart, mentions.length - 1)) : 0;
  const maxPairStart = mentions.length > 1 ? mentions.length - 2 : 0;
  const visibleIndexes = useMemo(() => {
    if (!hasMentions) return [];
    const next = [boundedWindowStart];
    if (boundedWindowStart + 1 < mentions.length) {
      next.push(boundedWindowStart + 1);
    }
    return next;
  }, [boundedWindowStart, hasMentions, mentions.length]);
  const visibleMentions = useMemo(
    () =>
      visibleIndexes
        .map((index) => ({ index, mention: mentions[index] }))
        .filter((entry): entry is VisibleMention => !!entry.mention),
    [mentions, visibleIndexes],
  );
  const visibleIndexSet = useMemo(() => new Set(visibleIndexes), [visibleIndexes]);
  const preloadIndex = visibleIndexes.length > 0 ? visibleIndexes[visibleIndexes.length - 1] + 1 : null;
  const preloadMention = preloadIndex !== null && preloadIndex < mentions.length ? mentions[preloadIndex] : null;
  const canGoPrev = boundedWindowStart > 0;
  const canGoNext = boundedWindowStart < maxPairStart;

  const activate = useCallback(() => {
    setActivated(true);
  }, []);

  const goToWindowStart = useCallback(
    (nextIndex: number) => {
      setWindowStart((current) => {
        if (mentions.length === 0) return current;
        const bounded = Math.max(0, Math.min(nextIndex, mentions.length - 1));
        return Number.isFinite(bounded) ? bounded : current;
      });
    },
    [mentions.length],
  );

  const handlePrev = useCallback(() => {
    if (!canGoPrev) return;
    goToWindowStart(boundedWindowStart - 1);
  }, [boundedWindowStart, canGoPrev, goToWindowStart]);

  const handleNext = useCallback(() => {
    if (!canGoNext) return;
    goToWindowStart(boundedWindowStart + 1);
  }, [boundedWindowStart, canGoNext, goToWindowStart]);

  const handleSlideStateChange = useCallback((tweetId: string, nextState: TweetHeightState) => {
    setTweetStates((previous) => {
      const current = previous[tweetId];
      if (
        current?.height === nextState.height &&
        current.status === nextState.status &&
        current.renderKey === nextState.renderKey
      ) {
        return previous;
      }
      return { ...previous, [tweetId]: nextState };
    });
  }, []);

  const getCardState = useCallback(
    (tweetId: string, renderWidth = stageWidth, renderFallbackHeight = fallbackHeight) => {
      const renderKey = getTweetRenderKey(tweetId, renderWidth);
      const current = tweetStates[tweetId];
      if (!current || current.renderKey !== renderKey) {
        return createFallbackTweetState(renderKey, renderFallbackHeight);
      }
      return current;
    },
    [fallbackHeight, stageWidth, tweetStates],
  );

  const value = useMemo<XMentionsContextValue>(
    () => ({
      domain,
      activated,
      activate,
      mentions,
      loading,
      error,
      hasMentions,
      windowStart,
      boundedWindowStart,
      visibleMentions,
      visibleIndexSet,
      canGoPrev,
      canGoNext,
      compactScale,
      stageWidth,
      fallbackHeight,
      preloadMention,
      goToWindowStart,
      handlePrev,
      handleNext,
      handleSlideStateChange,
      getCardState,
    }),
    [
      activate,
      activated,
      boundedWindowStart,
      canGoNext,
      canGoPrev,
      compactScale,
      domain,
      error,
      fallbackHeight,
      getCardState,
      goToWindowStart,
      handleSlideStateChange,
      handleNext,
      handlePrev,
      hasMentions,
      loading,
      mentions,
      preloadMention,
      stageWidth,
      visibleIndexSet,
      visibleMentions,
      windowStart,
    ],
  );

  return <XMentionsContext.Provider value={value}>{children}</XMentionsContext.Provider>;
}

export const XMentionsTopPanel = memo(function XMentionsTopPanel({ className = '', premiumHover = false }: XMentionsTopPanelProps) {
  const {
    domain,
    activated,
    activate,
    loading,
    error,
    hasMentions,
    visibleMentions,
    boundedWindowStart,
    mentions,
    canGoPrev,
    canGoNext,
    compactScale,
    stageWidth,
    preloadMention,
    handlePrev,
    handleNext,
    handleSlideStateChange,
    getCardState,
  } = useXMentionsContext();

  const sectionRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const slotMeasureRef = useRef<HTMLDivElement | null>(null);
  const [measuredSlotWidth, setMeasuredSlotWidth] = useState<number | null>(null);

  const updateMeasuredSlotWidth = useCallback(() => {
    const node = slotMeasureRef.current;
    if (!node) {
      setMeasuredSlotWidth(null);
      return;
    }

    const nextWidth = Math.floor(node.getBoundingClientRect().width);
    if (nextWidth <= 0) {
      return;
    }

    setMeasuredSlotWidth((previous) => (previous === nextWidth ? previous : nextWidth));
  }, []);

  const handleSlotMeasureRef = useCallback((node: HTMLDivElement | null) => {
    slotMeasureRef.current = node;
    if (!node) {
      setMeasuredSlotWidth(null);
      return;
    }

    const nextWidth = Math.floor(node.getBoundingClientRect().width);
    if (nextWidth <= 0) {
      return;
    }

    setMeasuredSlotWidth((previous) => (previous === nextWidth ? previous : nextWidth));
  }, []);

  useEffect(() => {
    if (activated || !domain) return;

    const browserWindow = window as WindowWithTwitter;
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

  useLayoutEffect(() => {
    const node = slotMeasureRef.current;
    if (!node || typeof window === 'undefined' || !('ResizeObserver' in window)) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateMeasuredSlotWidth();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [boundedWindowStart, hasMentions, loading, updateMeasuredSlotWidth]);

  const effectiveStageWidth = compactScale > DESKTOP_SCALE && measuredSlotWidth
    ? Math.min(stageWidth, measuredSlotWidth)
    : stageWidth;
  const effectiveScale = effectiveStageWidth / EMBED_WIDTH;
  const effectiveFallbackHeight = Math.round(TWEET_LOADING_HEIGHT * effectiveScale) + 32;

  return (
    <DashboardHoverSurface
      ref={sectionRef}
      as="section"
      tone="cyan"
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">X Social Mentions</div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-2xl">Who&apos;s talking about you</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Latest posts on X that mention <span className="text-cyan-400">{domain}</span>. Newest mentions appear first.
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
              aria-label="Show previous posts"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              data-variant="ghost"
              aria-label="Show next posts"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!activated && !hasMentions && !loading && !error && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-5 text-sm text-zinc-500">
          X mentions will load when this section comes into view.
        </div>
      )}

      {loading && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#05090d] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest X Posts</div>
              <div className="mt-1 text-sm text-zinc-400">Loading the two newest mentions now.</div>
            </div>
            <div className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Two-post view
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-start">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                ref={index === 0 ? handleSlotMeasureRef : null}
                className="w-full max-w-[360px] overflow-hidden border border-white/[0.06] bg-[#060b0f] p-4"
              >
                <div className="h-3 w-28 animate-pulse bg-zinc-800/70" />
                <div className="mt-2 h-2.5 w-36 animate-pulse bg-zinc-800/50" />
                <div
                  className="mt-4 max-w-full animate-pulse overflow-hidden border border-white/[0.06] bg-[#05090d]"
                  style={{ width: effectiveStageWidth, height: effectiveFallbackHeight }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-6 text-center">
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 fill-current text-zinc-600" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <p className="mt-3 text-sm text-zinc-400">{error}</p>
        </div>
      )}

      {!loading && !error && activated && !hasMentions && (
        <div className="mt-5 border border-white/[0.06] bg-[#060b0f] p-6 text-center">
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 fill-current text-zinc-700" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <p className="mt-3 text-sm text-zinc-500">No X mentions found yet for this domain.</p>
          <p className="mt-1 text-[11px] text-zinc-600">Check back tomorrow — mentions refresh daily.</p>
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
          {error && (
            <div className="mb-4 border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
              {error}
            </div>
          )}

          <div className="border border-white/[0.06] bg-[#05090d] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest X Posts</div>
                <div className="mt-1 text-sm text-zinc-400">
                  Showing two posts at once. Use the arrows or the picker below to swap posts into view.
                </div>
              </div>
              <div className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                {visibleMentions.length === 2
                  ? `Showing ${boundedWindowStart + 1}-${boundedWindowStart + 2} of ${mentions.length}`
                  : `Showing ${boundedWindowStart + 1} of ${mentions.length}`}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-start">
              {visibleMentions.map(({ index, mention }, position) => {
                const cardState = getCardState(mention.id, effectiveStageWidth, effectiveFallbackHeight);

                return (
                  <div
                    key={mention.id}
                    ref={position === 0 ? handleSlotMeasureRef : null}
                    className={`${premiumHover ? 'dashboard-hover-item ' : ''}w-full max-w-[360px] overflow-hidden border border-white/[0.06] bg-[#060b0f] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.18)]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          {position === 0 ? 'Selected Post' : 'Following Post'}
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {position === 0 ? 'Primary post in the current two-post view.' : 'The next newest post in sequence.'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {index === 0 && (
                          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                            Latest
                          </div>
                        )}
                        <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{timeAgo(mention.createdAt)}</span>
                      </div>
                    </div>

                    <div
                      className="mt-4 max-w-full overflow-hidden"
                      style={{
                        width: effectiveStageWidth,
                        height: cardState.status === 'stable'
                          ? Math.max(cardState.height, 0)
                          : Math.max(cardState.height, effectiveFallbackHeight),
                      }}
                    >
                      <XTweetSlide
                        key={getTweetRenderKey(mention.id, effectiveStageWidth)}
                        tweetId={mention.id}
                        scale={effectiveScale}
                        stageWidth={effectiveStageWidth}
                        state={cardState}
                        onStateChange={handleSlideStateChange}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {preloadMention && (
            <XEmbedPreloader tweetId={preloadMention.id} scale={effectiveScale} stageWidth={effectiveStageWidth} />
          )}
        </div>
      )}
    </DashboardHoverSurface>
  );
});

export const XMentionsPickerRail = memo(function XMentionsPickerRail({ className = '', premiumHover = false }: XMentionsPickerRailProps) {
  const {
    activated,
    mentions,
    loading,
    error,
    hasMentions,
    boundedWindowStart,
    visibleIndexSet,
    goToWindowStart,
  } = useXMentionsContext();

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
    const frameId = window.requestAnimationFrame(updateScrollState);
    const rail = railRef.current;
    if (!rail) {
      return () => {
        window.cancelAnimationFrame(frameId);
      };
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

  if (!activated && !hasMentions && !loading && !error) {
    return null;
  }

  return (
    <DashboardHoverSurface
      as="section"
      tone="cyan"
      interactive={premiumHover}
      className={`border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] sm:p-6 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Latest Mentions</div>
          <div className="mt-1 text-sm text-zinc-400">
            Pick any recent post to swap it into the main view above.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
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
                aria-label="Scroll recent mentions left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                disabled={!canScrollRight}
                className="dashboard-hover-action inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                data-variant="ghost"
                aria-label="Scroll recent mentions right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {loading && !hasMentions && (
        <div className="mt-4 flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[220px] w-[252px] shrink-0 animate-pulse border border-white/[0.06] bg-[#060b0f]" />
          ))}
        </div>
      )}

      {!loading && error && !hasMentions && (
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] p-5 text-sm text-zinc-400">
          {error}
        </div>
      )}

      {!loading && !error && activated && !hasMentions && (
        <div className="mt-4 border border-white/[0.06] bg-[#060b0f] p-5 text-sm text-zinc-500">
          No recent X mentions are available to show in the picker yet.
        </div>
      )}

      {hasMentions && (
        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#020508] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#020508] to-transparent" />

          <div ref={railRef} className="flex snap-x gap-3 overflow-x-auto pb-2">
            {mentions.map((mention, index) => {
              const isVisibleAbove = visibleIndexSet.has(index);
              const isLeadVisible = index === boundedWindowStart;

              return (
                <button
                  key={mention.id}
                  type="button"
                  onClick={() => goToWindowStart(index)}
                  className={`flex h-[220px] w-[252px] shrink-0 snap-start flex-col overflow-hidden border p-4 text-left ${
                    isVisibleAbove
                      ? 'border-cyan-500/30 bg-cyan-500/[0.08] shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : `${premiumHover ? 'dashboard-hover-item ' : ''}border-white/[0.06] bg-[#060b0f]`
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{mention.authorName}</div>
                      <div className="mt-1 text-xs text-zinc-500">@{mention.authorHandle}</div>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      {timeAgo(mention.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {index === 0 && (
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                        Latest
                      </span>
                    )}
                    {isVisibleAbove && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                        {isLeadVisible ? 'Showing above' : 'Also above'}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 h-[3rem] overflow-hidden">
                    <div
                      className="pr-2 text-sm leading-6 text-zinc-400"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        maxHeight: '3rem',
                        overflow: 'hidden',
                      }}
                    >
                      {formatMentionPreview(mention.text)}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {isVisibleAbove ? 'In Current View' : 'Click To Show Above'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </DashboardHoverSurface>
  );
});
