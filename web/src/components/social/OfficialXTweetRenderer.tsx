'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ensureTwitterSdk } from '@/lib/xWidgetSdk';

export type SlideRenderStatus = 'measuring' | 'stable' | 'error';

export type TweetHeightState = {
    height: number;
    status: SlideRenderStatus;
    renderKey: string;
};

export const EMBED_WIDTH = 480;
export const TWEET_LOADING_HEIGHT = 250;

export function getTweetRenderKey(tweetId: string, stageWidth: number) {
    return `${tweetId}:${stageWidth}`;
}

export function getTweetPlaceholderHeight(scale: number) {
    return Math.round(TWEET_LOADING_HEIGHT * scale) + 32;
}

export function createFallbackTweetState(renderKey: string, fallbackHeight: number): TweetHeightState {
    return {
        height: fallbackHeight,
        status: 'measuring',
        renderKey,
    };
}

export const XTweetSlide = memo(function XTweetSlide({
    tweetId,
    scale,
    stageWidth,
    state,
    showPlaceholder = true,
    align = 'left',
    onStateChange,
}: {
    tweetId: string;
    scale: number;
    stageWidth: number;
    state: TweetHeightState;
    showPlaceholder?: boolean;
    align?: 'left' | 'center' | 'right';
    onStateChange?: (tweetId: string, nextState: TweetHeightState) => void;
}) {
    const scaledWrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const renderKey = getTweetRenderKey(tweetId, stageWidth);
    const [status, setStatus] = useState<'loading' | 'measuring' | 'ready' | 'error'>('loading');

    useEffect(() => {
        const scaledWrapper = scaledWrapperRef.current;
        const container = containerRef.current;
        if (!scaledWrapper || !container) return;

        let cancelled = false;
        let resizeObserver: ResizeObserver | null = null;
        let mutationObserver: MutationObserver | null = null;
        let iframeCleanup: (() => void) | null = null;
        const settleTimers = new Set<ReturnType<typeof setTimeout>>();
        let previousHeight = 0;
        let stableMatches = 0;
        const placeholderHeight = getTweetPlaceholderHeight(scale);

        const clearTimers = () => {
            settleTimers.forEach((timer) => clearTimeout(timer));
            settleTimers.clear();
        };

        const pushState = (nextState: TweetHeightState) => {
            onStateChange?.(tweetId, nextState);
        };

        const markError = () => {
            pushState({
                height: placeholderHeight,
                status: 'error',
                renderKey,
            });
            setStatus('error');
            clearTimers();
        };

        const readHeight = () => {
            const height = Math.ceil(scaledWrapper.getBoundingClientRect().height);
            return height > 0 ? height : 0;
        };

        const measureHeight = () => {
            const height = readHeight();
            if (height <= 0) return 0;
            pushState({
                height,
                status: 'measuring',
                renderKey,
            });
            setStatus('measuring');
            if (Math.abs(height - previousHeight) <= 2) {
                stableMatches += 1;
            } else {
                stableMatches = 1;
                previousHeight = height;
            }
            return height;
        };

        const finalizeStable = (height: number) => {
            pushState({
                height,
                status: 'stable',
                renderKey,
            });
            setStatus('ready');
            clearTimers();
        };

        const scheduleSettle = (attempt = 0) => {
            const timer = setTimeout(() => {
                settleTimers.delete(timer);
                if (cancelled) return;
                const height = measureHeight();
                if (height > 0 && stableMatches >= 2) {
                    finalizeStable(height);
                    return;
                }
                if (attempt >= 6) {
                    if (height > 0) {
                        finalizeStable(height);
                    } else {
                        markError();
                    }
                    return;
                }
                scheduleSettle(attempt + 1);
            }, attempt === 0 ? 90 : 180);
            settleTimers.add(timer);
        };

        container.innerHTML = '';

        ensureTwitterSdk()
            .then((twttr) => {
                if (cancelled) return undefined;
                return twttr.widgets.createTweet(tweetId, container, {
                    theme: 'dark',
                    conversation: 'none',
                    dnt: 'true',
                    align,
                });
            })
            .then(() => {
                if (cancelled) return;

                measureHeight();

                if ('ResizeObserver' in window) {
                    resizeObserver = new ResizeObserver(() => {
                        const height = measureHeight();
                        if (height > 0 && stableMatches >= 2) {
                            finalizeStable(height);
                        }
                    });
                    resizeObserver.observe(scaledWrapper);
                    resizeObserver.observe(container);
                }

                const iframe = container.querySelector('iframe');
                if (iframe) {
                    const handleIframeLoad = () => {
                        const height = measureHeight();
                        if (height > 0 && stableMatches >= 2) {
                            finalizeStable(height);
                        }
                    };

                    iframe.addEventListener('load', handleIframeLoad);
                    mutationObserver = new MutationObserver(() => {
                        const height = measureHeight();
                        if (height > 0 && stableMatches >= 2) {
                            finalizeStable(height);
                        }
                    });
                    mutationObserver.observe(iframe, {
                        attributes: true,
                        attributeFilter: ['style', 'height'],
                    });

                    iframeCleanup = () => {
                        iframe.removeEventListener('load', handleIframeLoad);
                    };
                }

                scheduleSettle();
            })
            .catch(() => {
                if (!cancelled) {
                    markError();
                }
            });

        return () => {
            cancelled = true;
            container.innerHTML = '';
            clearTimers();
            iframeCleanup?.();
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };
    }, [align, onStateChange, renderKey, scale, stageWidth, tweetId]);

    const placeholderHeight = getTweetPlaceholderHeight(scale);
    const reservedHeight = state.status === 'stable' ? Math.max(state.height, 0) : Math.max(state.height, placeholderHeight);
    const outerHeight = status === 'loading' || status === 'error' ? placeholderHeight : reservedHeight;

    return (
        <div className="relative overflow-hidden" style={{ width: stageWidth, height: outerHeight }}>
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
                    visibility: status === 'error' || status === 'loading' ? 'hidden' : 'visible',
                }}
            >
                <div ref={containerRef} style={{ width: EMBED_WIDTH }} />
            </div>
        </div>
    );
});

export const XEmbedPreloader = memo(function XEmbedPreloader({
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
                key={getTweetRenderKey(tweetId, stageWidth)}
                tweetId={tweetId}
                scale={scale}
                stageWidth={stageWidth}
                state={createFallbackTweetState(getTweetRenderKey(tweetId, stageWidth), getTweetPlaceholderHeight(scale))}
                showPlaceholder={false}
            />
        </div>
    );
});
