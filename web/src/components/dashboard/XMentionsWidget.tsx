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
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

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

type TwttrSdk = {
  widgets: {
    createTweet: (
      id: string,
      el: HTMLElement,
      opts: Record<string, string>,
    ) => Promise<HTMLElement | undefined>;
  };
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
}

interface XMentionsPickerRailProps {
  className?: string;
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
  handleHeightChange: (index: number, height: number) => void;
  getCardHeight: (index: number) => number;
};

const TWITTER_ORIGINS = [
  'https://platform.twitter.com',
  'https://syndication.twitter.com',
  'https://pbs.twimg.com',
];

const EMBED_WIDTH = 480;
const DESKTOP_SCALE = 0.64;
const MOBILE_SCALE = 0.74;
const TWEET_LOADING_HEIGHT = 250;
const RAIL_CARD_WIDTH = 252;
const RAIL_CARD_GAP = 12;

const XMentionsContext = createContext<XMentionsContextValue | null>(null);

let twitterSdkPromise: Promise<TwttrSdk> | null = null;

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

function ensureTwitterSdk(): Promise<TwttrSdk> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Twitter widgets can only load in the browser'));
  }

  const browserWindow = window as WindowWithTwitter;
  if (browserWindow.twttr?.widgets?.createTweet) {
    return Promise.resolve(browserWindow.twttr);
  }

  if (twitterSdkPromise) {
    return twitterSdkPromise;
  }

  TWITTER_ORIGINS.forEach((origin) => {
    if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      document.head.appendChild(link);
    }
  });

  twitterSdkPromise = new Promise<TwttrSdk>((resolve, reject) => {
    const resolveWhenReady = () => {
      if (browserWindow.twttr?.widgets?.createTweet) {
        resolve(browserWindow.twttr);
        return true;
      }
      return false;
    };

    if (resolveWhenReady()) {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src*="platform.twitter.com/widgets.js"]');
    const script =
      existingScript ||
      (() => {
        const element = document.createElement('script');
        element.src = 'https://platform.twitter.com/widgets.js';
        element.async = true;
        element.charset = 'utf-8';
        document.head.appendChild(element);
        return element;
      })();

    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      if (pollTimer) clearTimeout(pollTimer);
    };

    const poll = (attemptsLeft: number) => {
      if (resolveWhenReady()) {
        stopPolling();
        return;
      }
      if (attemptsLeft <= 0) {
        stopPolling();
        twitterSdkPromise = null;
        reject(new Error('Twitter widgets failed to initialize'));
        return;
      }
      pollTimer = setTimeout(() => poll(attemptsLeft - 1), 100);
    };

    script.addEventListener(
      'error',
      () => {
        stopPolling();
        twitterSdkPromise = null;
        reject(new Error('Twitter widgets failed to load'));
      },
      { once: true },
    );

    if (existingScript) {
      poll(40);
      return;
    }

    script.addEventListener(
      'load',
      () => {
        poll(40);
      },
      { once: true },
    );
  });

  return twitterSdkPromise;
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

const XTweetSlide = memo(function XTweetSlide({
  tweetId,
  scale,
  stageWidth,
  reservedHeight,
  showPlaceholder = true,
  onReady,
  onHeightChange,
}: {
  tweetId: string;
  scale: number;
  stageWidth: number;
  reservedHeight: number;
  showPlaceholder?: boolean;
  onReady?: () => void;
  onHeightChange?: (height: number) => void;
}) {
  const scaledWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const scaledWrapper = scaledWrapperRef.current;
    const container = containerRef.current;
    if (!scaledWrapper || !container) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const reportHeight = () => {
      if (!onHeightChange) return;
      const height = Math.ceil(scaledWrapper.getBoundingClientRect().height);
      if (height > 0) {
        onHeightChange(height);
      }
    };

    if (!renderedRef.current) {
      renderedRef.current = true;
      container.innerHTML = '';

      ensureTwitterSdk()
        .then((twttr) =>
          twttr.widgets.createTweet(tweetId, container, {
            theme: 'dark',
            conversation: 'none',
            dnt: 'true',
            align: 'left',
          }),
        )
        .then(() => {
          if (cancelled) return;
          setStatus('ready');
          onReady?.();
          reportHeight();

          if ('ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(reportHeight);
            resizeObserver.observe(scaledWrapper);
          }

          const iframe = container.querySelector('iframe');
          if (iframe) {
            mutationObserver = new MutationObserver(reportHeight);
            mutationObserver.observe(iframe, {
              attributes: true,
              attributeFilter: ['style', 'height'],
            });
          }

          setTimeout(reportHeight, 120);
          setTimeout(reportHeight, 320);
          setTimeout(reportHeight, 900);
        })
        .catch(() => {
          if (cancelled) return;
          setStatus('error');
          reportHeight();
        });
    } else {
      reportHeight();
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [onHeightChange, onReady, scale, tweetId]);

  const placeholderHeight = Math.round(TWEET_LOADING_HEIGHT * scale) + 32;
  const outerHeight = status === 'ready' ? reservedHeight : placeholderHeight;

  return (
    <div className="relative" style={{ width: stageWidth, height: outerHeight }}>
      {showPlaceholder && status === 'loading' && (
        <div className="absolute inset-0 animate-pulse border border-white/[0.06] bg-[#060b0f] p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-800" />
            <div className="space-y-2">
              <div className="h-2.5 w-24 bg-zinc-800" />
              <div className="h-2 w-14 bg-zinc-800/60" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-full bg-zinc-800/55" />
            <div className="h-2.5 w-[90%] bg-zinc-800/45" />
            <div className="h-2.5 w-[78%] bg-zinc-800/35" />
          </div>
          <div className="mt-5 h-[84px] bg-zinc-800/25" />
          <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading official X post
          </div>
        </div>
      )}

      {showPlaceholder && status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 border border-white/[0.06] bg-[#060b0f] px-5 text-center">
          <div className="text-sm font-medium text-white">Post failed to render</div>
          <div className="text-sm leading-6 text-zinc-500">
            X did not finish embedding this post. Try another recent mention or refresh later.
          </div>
        </div>
      )}

      <div
        ref={scaledWrapperRef}
        className="absolute left-0 top-0"
        style={{
          width: EMBED_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          visibility: status === 'ready' ? 'visible' : 'hidden',
        }}
      >
        <div ref={containerRef} style={{ width: EMBED_WIDTH }} />
      </div>
    </div>
  );
});

const XEmbedPreloader = memo(function XEmbedPreloader({
  tweetId,
  scale,
  stageWidth,
}: {
  tweetId: string;
  scale: number;
  stageWidth: number;
}) {
  return (
    <div className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
      <XTweetSlide
        tweetId={tweetId}
        scale={scale}
        stageWidth={stageWidth}
        reservedHeight={0}
        showPlaceholder={false}
      />
    </div>
  );
});

export function XMentionsProvider({ domain, children }: XMentionsProviderProps) {
  const [activated, setActivated] = useState(false);
  const [mentions, setMentions] = useState<XMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const [slideHeights, setSlideHeights] = useState<Record<number, number>>({});
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
    setSlideHeights({});
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
    setSlideHeights({});
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

  const handleHeightChange = useCallback((index: number, height: number) => {
    setSlideHeights((previous) => {
      if (previous[index] === height) return previous;
      return { ...previous, [index]: height };
    });
  }, []);

  const getCardHeight = useCallback(
    (index: number) => slideHeights[index] ?? fallbackHeight,
    [fallbackHeight, slideHeights],
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
      handleHeightChange,
      getCardHeight,
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
      getCardHeight,
      goToWindowStart,
      handleHeightChange,
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

export const XMentionsTopPanel = memo(function XMentionsTopPanel({ className = '' }: XMentionsTopPanelProps) {
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
    fallbackHeight,
    preloadMention,
    handlePrev,
    handleNext,
    handleHeightChange,
    getCardHeight,
  } = useXMentionsContext();

  const sectionRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

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

  return (
    <section
      ref={sectionRef}
      className={`border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(34,211,238,0.05)] sm:p-6 ${className}`.trim()}
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
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-[#0a0f14] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Show previous posts"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-[#0a0f14] disabled:cursor-not-allowed disabled:opacity-40"
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
              <div key={index} className="w-full max-w-[360px] border border-white/[0.06] bg-[#060b0f] p-4">
                <div className="h-3 w-28 animate-pulse bg-zinc-800/70" />
                <div className="mt-2 h-2.5 w-36 animate-pulse bg-zinc-800/50" />
                <div className="mt-4 animate-pulse border border-white/[0.06] bg-[#05090d]" style={{ width: stageWidth, height: fallbackHeight }} />
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
              {visibleMentions.map(({ index, mention }, position) => (
                <div key={mention.id} className="w-full max-w-[360px] border border-white/[0.06] bg-[#060b0f] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
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

                  <div className="mt-4" style={{ width: stageWidth, height: getCardHeight(index) }}>
                    <XTweetSlide
                      key={mention.id}
                      tweetId={mention.id}
                      scale={compactScale}
                      stageWidth={stageWidth}
                      reservedHeight={getCardHeight(index)}
                      onHeightChange={(height) => handleHeightChange(index, height)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preloadMention && (
            <XEmbedPreloader tweetId={preloadMention.id} scale={compactScale} stageWidth={stageWidth} />
          )}
        </div>
      )}
    </section>
  );
});

export const XMentionsPickerRail = memo(function XMentionsPickerRail({ className = '' }: XMentionsPickerRailProps) {
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
    <section
      className={`border border-white/[0.08] bg-[#020508] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,0.32),0_0_24px_rgba(34,211,238,0.05)] sm:p-6 ${className}`.trim()}
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
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-[#0a0f14] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Scroll recent mentions left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                disabled={!canScrollRight}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-white/[0.08] bg-[#060b0f] text-zinc-300 transition-colors hover:border-white/[0.16] hover:bg-[#0a0f14] disabled:cursor-not-allowed disabled:opacity-40"
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
                  className={`flex h-[220px] w-[252px] shrink-0 snap-start flex-col overflow-hidden border p-4 text-left transition-all ${
                    isVisibleAbove
                      ? 'border-cyan-500/30 bg-cyan-500/[0.08] shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/[0.06] bg-[#060b0f] hover:border-white/[0.12] hover:bg-[#091017]'
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
    </section>
  );
});
