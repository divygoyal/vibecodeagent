'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
    EMBED_WIDTH,
    XTweetSlide,
    createFallbackTweetState,
    getTweetPlaceholderHeight,
    getTweetRenderKey,
    type SlideRenderStatus,
    type TweetHeightState,
} from '@/components/social/OfficialXTweetRenderer';

type OfficialXTweetEmbedProps = {
    tweetId: string;
    className?: string;
    align?: 'left' | 'center' | 'right';
    showErrorState?: boolean;
    maxRenderWidth?: number;
    onStateChange?: (tweetId: string, nextState: TweetHeightState) => void;
    onResolvedStatusChange?: (tweetId: string, status: Extract<SlideRenderStatus, 'stable' | 'error'>) => void;
};

export default function OfficialXTweetEmbed({
    tweetId,
    className = '',
    align = 'left',
    showErrorState = true,
    maxRenderWidth = EMBED_WIDTH,
    onStateChange,
    onResolvedStatusChange,
}: OfficialXTweetEmbedProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const lastResolvedStatusRef = useRef<Extract<SlideRenderStatus, 'stable' | 'error'> | null>(null);
    const [stageWidth, setStageWidth] = useState(EMBED_WIDTH);
    const renderWidthLimit = Math.min(EMBED_WIDTH, Math.max(260, maxRenderWidth));
    const scale = stageWidth / EMBED_WIDTH;
    const fallbackHeight = getTweetPlaceholderHeight(scale);
    const renderKey = getTweetRenderKey(tweetId, stageWidth);
    const [state, setState] = useState<TweetHeightState>(() => createFallbackTweetState(renderKey, fallbackHeight));

    useEffect(() => {
        lastResolvedStatusRef.current = null;
    }, [renderKey]);

    const activeState = state.renderKey === renderKey
        ? state
        : createFallbackTweetState(renderKey, fallbackHeight);

    useLayoutEffect(() => {
        const node = wrapperRef.current;
        if (!node || typeof window === 'undefined') return;

        const updateWidth = () => {
            const nextWidth = Math.min(renderWidthLimit, Math.max(260, Math.floor(node.clientWidth || renderWidthLimit)));
            setStageWidth((previous) => (previous === nextWidth ? previous : nextWidth));
        };

        updateWidth();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }

        const observer = new ResizeObserver(() => {
            updateWidth();
        });
        observer.observe(node);

        return () => observer.disconnect();
    }, [renderWidthLimit]);

    const handleRendererStateChange = useCallback((nextTweetId: string, nextState: TweetHeightState) => {
        setState((previous) => {
            if (
                previous.height === nextState.height &&
                previous.status === nextState.status &&
                previous.renderKey === nextState.renderKey
            ) {
                return previous;
            }
            return nextState;
        });

        onStateChange?.(nextTweetId, nextState);

        if (
            (nextState.status === 'stable' || nextState.status === 'error') &&
            lastResolvedStatusRef.current !== nextState.status
        ) {
            lastResolvedStatusRef.current = nextState.status;
            onResolvedStatusChange?.(nextTweetId, nextState.status);
        }
    }, [onResolvedStatusChange, onStateChange]);

    return (
        <div
            ref={wrapperRef}
            className={`min-w-0 ${className}`.trim()}
        >
            <XTweetSlide
                key={renderKey}
                tweetId={tweetId}
                scale={scale}
                stageWidth={stageWidth}
                state={activeState}
                align={align}
                showPlaceholder={showErrorState}
                onStateChange={handleRendererStateChange}
            />
        </div>
    );
}
