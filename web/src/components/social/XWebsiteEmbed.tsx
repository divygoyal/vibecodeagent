'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { LogoIcon } from '@/components/Logo';
import OfficialXTweetEmbed from '@/components/social/OfficialXTweetEmbed';
import XMentionsLockup from '@/components/social/XMentionsMark';
import {
    DEFAULT_X_WIDGET_CONFIG,
    type XWidgetConfig,
} from '@/lib/socialEmbeds';
import type { XMentionPayload } from '@/lib/xMentionsShared';

type EmbedResponse = {
    token: string;
    platform: 'x';
    domain: string;
    label: string | null;
    showBranding: boolean;
    mentions: XMentionPayload[];
    config?: XWidgetConfig;
    warning?: string;
    error?: string;
};

export type XWidgetRenderMode = 'embed' | 'preview' | 'builder';

export type XWidgetData = {
    domain: string;
    label?: string | null;
    showBranding?: boolean;
    mentions: XMentionPayload[];
    config?: Partial<XWidgetConfig> | XWidgetConfig;
    warning?: string;
    error?: string;
    resizeKey?: string;
};

type XWidgetSurfaceProps = {
    data: XWidgetData;
    mode?: XWidgetRenderMode;
    loading?: boolean;
};

type ViewState = {
    key: string;
    failedTweetIds: string[];
    pageStart: number;
};

type XWebsiteEmbedProps = {
    token: string;
    mode?: Exclude<XWidgetRenderMode, 'builder'>;
};

const FOUR_CARD_THRESHOLD = 1360;
const THREE_CARD_THRESHOLD = 1040;
const TWO_CARD_THRESHOLD = 720;

function getResponsiveVisibleCapacity(width: number) {
    if (width >= FOUR_CARD_THRESHOLD) return 4;
    if (width >= THREE_CARD_THRESHOLD) return 3;
    if (width >= TWO_CARD_THRESHOLD) return 2;
    return 1;
}

function getCardRenderWidth(visibleCards: number) {
    switch (visibleCards) {
        case 4:
            return 276;
        case 3:
            return 320;
        case 2:
            return 360;
        default:
            return 520;
    }
}

function WidgetShell({
    children,
    showBranding,
}: {
    children: ReactNode;
    showBranding: boolean;
}) {
    return (
        <div className="bg-[#05080d] text-white">
            <div className="mx-auto w-full overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#0a0f14] shadow-[0_20px_60px_rgba(0,0,0,0.34)]">
                <div className="px-5 pb-2 pt-4 sm:px-6">
                    <XMentionsLockup iconClassName="h-4 w-4" textClassName="text-xs font-semibold uppercase tracking-[0.22em] text-white" />
                </div>

                {children}

                {showBranding ? (
                    <div className="flex justify-end border-t border-white/[0.06] px-5 py-3 text-xs text-zinc-500 sm:px-6">
                        <a
                            href="https://trafficclaw.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-zinc-300 transition hover:border-cyan-400/20 hover:bg-white/[0.06] hover:text-white"
                            aria-label="Powered by TrafficClaw"
                        >
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                Powered by
                            </span>
                            <LogoIcon size={16} />
                            <span className="font-medium text-white">TrafficClaw</span>
                        </a>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function XWidgetSurface({
    data,
    mode = 'embed',
    loading = false,
}: XWidgetSurfaceProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stateKey = useMemo(
        () => `${data.domain}:${data.mentions.map((mention) => mention.id).join(',')}`,
        [data.domain, data.mentions],
    );
    const [viewState, setViewState] = useState<ViewState>({
        key: stateKey,
        failedTweetIds: [],
        pageStart: 0,
    });
    const [contentWidth, setContentWidth] = useState(1200);
    const resolvedViewState = viewState.key === stateKey
        ? viewState
        : { key: stateKey, failedTweetIds: [], pageStart: 0 };
    const failedTweetIdSet = useMemo(() => new Set(resolvedViewState.failedTweetIds), [resolvedViewState.failedTweetIds]);

    useEffect(() => {
        const node = contentRef.current;
        if (!node || typeof window === 'undefined') return;

        const updateWidth = () => {
            setContentWidth(Math.max(320, Math.floor(node.clientWidth || 1200)));
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
    }, []);

    const visibleCards = useMemo(
        () => Math.max(1, getResponsiveVisibleCapacity(contentWidth)),
        [contentWidth],
    );
    const cardRenderWidth = useMemo(() => getCardRenderWidth(visibleCards), [visibleCards]);
    const skeletonHeight = 320;
    const availableMentions = useMemo(
        () => data.mentions.filter((mention) => !failedTweetIdSet.has(mention.id)),
        [data.mentions, failedTweetIdSet],
    );

    const maxPageStart = useMemo(() => {
        if (availableMentions.length === 0) return 0;
        return Math.floor((availableMentions.length - 1) / visibleCards) * visibleCards;
    }, [availableMentions.length, visibleCards]);

    const pageStart = Math.min(resolvedViewState.pageStart, maxPageStart);
    const currentMentions = useMemo(
        () => availableMentions.slice(pageStart, pageStart + visibleCards),
        [availableMentions, pageStart, visibleCards],
    );
    const canPagePrev = pageStart > 0;
    const canPageNext = pageStart + visibleCards < availableMentions.length;
    const rangeStart = availableMentions.length > 0 ? pageStart + 1 : 0;
    const rangeEnd = availableMentions.length > 0 ? Math.min(pageStart + visibleCards, availableMentions.length) : 0;
    const showUnavailableEmbedsState =
        !loading &&
        !data.error &&
        data.mentions.length > 0 &&
        availableMentions.length === 0;

    const handleTweetResolved = useCallback((tweetId: string, status: 'stable' | 'error') => {
        if (status === 'stable') {
            setViewState((previous) => {
                const base = previous.key === stateKey ? previous : { key: stateKey, failedTweetIds: [], pageStart: 0 };
                return {
                    ...base,
                    failedTweetIds: base.failedTweetIds.filter((id) => id !== tweetId),
                };
            });
            return;
        }

        setViewState((previous) => {
            const base = previous.key === stateKey ? previous : { key: stateKey, failedTweetIds: [], pageStart: 0 };
            return base.failedTweetIds.includes(tweetId)
                ? base
                : { ...base, failedTweetIds: [...base.failedTweetIds, tweetId] };
        });
    }, [stateKey]);

    const handlePageChange = useCallback((direction: -1 | 1) => {
        setViewState((previous) => {
            const base = previous.key === stateKey ? previous : { key: stateKey, failedTweetIds: [], pageStart: 0 };
            const nextPageStart = base.pageStart + direction * visibleCards;

            return {
                ...base,
                pageStart: direction < 0
                    ? Math.max(0, nextPageStart)
                    : Math.min(maxPageStart, nextPageStart),
            };
        });
    }, [maxPageStart, stateKey, visibleCards]);

    useEffect(() => {
        if (mode === 'builder') return;

        const wrapper = wrapperRef.current;
        if (!wrapper || typeof window === 'undefined') return;

        const postHeight = () => {
            const height = Math.ceil(wrapper.getBoundingClientRect().height);
            window.parent?.postMessage(
                {
                    type: 'trafficclaw:x-embed-resize',
                    token: data.resizeKey || data.domain,
                    height,
                },
                '*',
            );
        };

        postHeight();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(() => {
            postHeight();
        });
        observer.observe(wrapper);

        return () => observer.disconnect();
    }, [currentMentions.length, data.domain, data.error, data.resizeKey, data.warning, loading, mode, visibleCards]);

    return (
        <div ref={wrapperRef}>
            <WidgetShell showBranding={data.showBranding !== false}>
                <div ref={contentRef} className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                    {loading ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-white">Loading the latest mentions</div>
                                <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                            </div>

                            <div
                                className="grid items-start gap-4"
                                style={{ gridTemplateColumns: `repeat(${visibleCards}, minmax(0, 1fr))` }}
                            >
                                {Array.from({ length: visibleCards }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="animate-pulse rounded-[16px] border border-white/[0.06] bg-[#060b0f]"
                                        style={{ height: skeletonHeight }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {!loading && data.error && !data.mentions.length ? (
                        <div className="rounded-[16px] border border-white/[0.06] bg-[#080c12] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">This X widget is unavailable</div>
                            <p className="mt-2 text-sm text-zinc-500">{data.error}</p>
                        </div>
                    ) : null}

                    {!loading && !data.error && data.mentions.length === 0 ? (
                        <div className="rounded-[16px] border border-white/[0.06] bg-[#080c12] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">No X mentions found yet</div>
                            <p className="mt-2 text-sm text-zinc-500">
                                We&apos;ll refresh the latest posts about {data.domain} again tomorrow.
                            </p>
                        </div>
                    ) : null}

                    {showUnavailableEmbedsState ? (
                        <div className="rounded-[16px] border border-white/[0.06] bg-[#080c12] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">Official X posts are unavailable right now</div>
                            <p className="mt-2 text-sm text-zinc-500">
                                We found mention candidates for {data.domain}, but X refused to fully embed them today.
                                We&apos;ll try again on the next daily refresh.
                            </p>
                        </div>
                    ) : null}

                    {!loading && availableMentions.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm text-zinc-400">
                                    Showing {rangeStart}-{rangeEnd} of {availableMentions.length}
                                </div>

                                <div className="flex items-center gap-2">
                                    {data.warning ? (
                                        <div className="hidden rounded-full border border-amber-400/20 bg-amber-500/8 px-3 py-1 text-[11px] text-amber-200 sm:block">
                                            {data.warning}
                                        </div>
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(-1)}
                                        disabled={!canPagePrev}
                                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Show previous tweets"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(1)}
                                        disabled={!canPageNext}
                                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Show next tweets"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {data.warning ? (
                                <div className="rounded-[14px] border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200 sm:hidden">
                                    {data.warning}
                                </div>
                            ) : null}

                            <div
                                className="grid items-start gap-4"
                                style={{ gridTemplateColumns: `repeat(${Math.max(currentMentions.length, 1)}, minmax(0, 1fr))` }}
                            >
                                {currentMentions.map((mention) => (
                                    <div key={mention.id} className="flex min-w-0 justify-center self-start">
                                        <OfficialXTweetEmbed
                                            tweetId={mention.id}
                                            maxRenderWidth={cardRenderWidth}
                                            className="w-full"
                                            onResolvedStatusChange={handleTweetResolved}
                                            showErrorState={false}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </WidgetShell>
        </div>
    );
}

export default function XWebsiteEmbed({ token, mode = 'embed' }: XWebsiteEmbedProps) {
    const [data, setData] = useState<EmbedResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/embed/x?token=${encodeURIComponent(token)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => ({}));
                if (cancelled) return;

                if (!response.ok) {
                    setError(payload.error || 'This embed is unavailable.');
                    setData(null);
                    return;
                }

                setData(payload as EmbedResponse);
                setError((payload as EmbedResponse).error || null);
            } catch {
                if (!cancelled) {
                    setError('Failed to load this embed.');
                    setData(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [token]);

    return (
        <XWidgetSurface
            mode={mode}
            loading={loading}
            data={{
                domain: data?.domain || 'your site',
                label: data?.label || null,
                showBranding: data?.showBranding ?? true,
                mentions: data?.mentions || [],
                config: data?.config || DEFAULT_X_WIDGET_CONFIG,
                warning: data?.warning,
                error: error || data?.error,
                resizeKey: token,
            }}
        />
    );
}
