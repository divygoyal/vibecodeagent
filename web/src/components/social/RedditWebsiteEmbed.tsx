'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { LogoIcon } from '@/components/Logo';
import OfficialRedditPostEmbed from '@/components/social/OfficialRedditPostEmbed';
import RedditMentionsLockup from '@/components/social/RedditMentionsMark';
import { DEFAULT_X_WIDGET_CONFIG, type XWidgetConfig } from '@/lib/socialEmbeds';
import type { RedditMentionPayload } from '@/lib/redditMentionsShared';
import { BRAND_NAME } from '@/lib/brand';

type RedditEmbedResponse = {
    token: string;
    platform: 'reddit';
    domain: string;
    label: string | null;
    showBranding: boolean;
    mentions: RedditMentionPayload[];
    config?: XWidgetConfig;
    warning?: string;
    error?: string;
};

export type RedditWidgetRenderMode = 'embed' | 'preview' | 'builder';

export type RedditWidgetData = {
    domain: string;
    label?: string | null;
    showBranding?: boolean;
    mentions: RedditMentionPayload[];
    config?: Partial<XWidgetConfig> | XWidgetConfig;
    warning?: string;
    error?: string;
    resizeKey?: string;
};

type RedditWidgetSurfaceProps = {
    data: RedditWidgetData;
    mode?: RedditWidgetRenderMode;
    loading?: boolean;
};

type ViewState = {
    key: string;
    pageStart: number;
};

type RedditWebsiteEmbedProps = {
    token: string;
    mode?: Exclude<RedditWidgetRenderMode, 'builder'>;
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

function WidgetShell({
    children,
    showBranding,
}: {
    children: ReactNode;
    showBranding: boolean;
}) {
    return (
        <div className="bg-[#05080d] text-white">
            <div className="mx-auto w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-[linear-gradient(180deg,#0c1117_0%,#090e14_100%)] shadow-[0_16px_44px_rgba(0,0,0,0.24)]">
                <div className="border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
                    <RedditMentionsLockup
                        iconClassName="h-5 w-5 text-orange-400"
                        textClassName="text-[11px] font-semibold uppercase tracking-[0.2em] text-white"
                    />
                </div>

                {children}

                {showBranding ? (
                    <div className="flex justify-end border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500 sm:px-5">
                        <a
                            href="https://trafficclaw.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-zinc-300 transition hover:border-cyan-400/20 hover:bg-white/[0.06] hover:text-white"
                            aria-label={`Powered by ${BRAND_NAME}`}
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

export function RedditWidgetSurface({
    data,
    mode = 'embed',
    loading = false,
}: RedditWidgetSurfaceProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stateKey = useMemo(
        () => `${data.domain}:${data.mentions.map((mention) => mention.id).join(',')}`,
        [data.domain, data.mentions],
    );
    const [viewState, setViewState] = useState<ViewState>({ key: stateKey, pageStart: 0 });
    const [contentWidth, setContentWidth] = useState(1200);
    const resolvedViewState = viewState.key === stateKey
        ? viewState
        : { key: stateKey, pageStart: 0 };

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
    const maxPageStart = useMemo(() => {
        if (data.mentions.length === 0) return 0;
        return Math.floor((data.mentions.length - 1) / visibleCards) * visibleCards;
    }, [data.mentions.length, visibleCards]);
    const currentPageStart = Math.min(resolvedViewState.pageStart, maxPageStart);
    const currentMentions = useMemo(
        () => data.mentions.slice(currentPageStart, currentPageStart + visibleCards),
        [currentPageStart, data.mentions, visibleCards],
    );
    const canPagePrev = currentPageStart > 0;
    const canPageNext = currentPageStart + visibleCards < data.mentions.length;
    const rangeStart = data.mentions.length > 0 ? currentPageStart + 1 : 0;
    const rangeEnd = data.mentions.length > 0 ? Math.min(currentPageStart + visibleCards, data.mentions.length) : 0;

    const handlePageChange = useCallback((direction: -1 | 1) => {
        setViewState((previous) => {
            const base = previous.key === stateKey ? previous : { key: stateKey, pageStart: 0 };
            const next = base.pageStart + direction * visibleCards;
            if (direction < 0) {
                return { ...base, pageStart: Math.max(0, next) };
            }
            return { ...base, pageStart: Math.min(maxPageStart, next) };
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
                    type: 'trafficclaw:reddit-embed-resize',
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
                                <div className="text-sm font-medium text-white">Loading the latest Reddit mentions</div>
                                <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                            </div>

                            <div
                                className="grid items-stretch gap-4"
                                style={{ gridTemplateColumns: `repeat(${visibleCards}, minmax(0, 1fr))` }}
                            >
                                {Array.from({ length: visibleCards }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="h-[320px] animate-pulse rounded-[12px] border border-white/[0.06] bg-[#060b0f]"
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {!loading && data.error && !data.mentions.length ? (
                        <div className="rounded-[12px] border border-white/[0.06] bg-[#080c12] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">This Reddit widget is unavailable</div>
                            <p className="mt-2 text-sm text-zinc-500">{data.error}</p>
                        </div>
                    ) : null}

                    {!loading && !data.error && data.warning && !data.mentions.length ? (
                        <div className="rounded-[12px] border border-amber-400/20 bg-amber-500/[0.08] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">Reddit mentions are temporarily unavailable</div>
                            <p className="mt-2 text-sm text-amber-100">{data.warning}</p>
                        </div>
                    ) : null}

                    {!loading && !data.error && !data.warning && data.mentions.length === 0 ? (
                        <div className="rounded-[12px] border border-white/[0.06] bg-[#080c12] px-6 py-10 text-center">
                            <div className="text-base font-medium text-white">No Reddit mentions found yet</div>
                            <p className="mt-2 text-sm text-zinc-500">
                                We&apos;ll refresh the latest discussions about {data.domain} again tomorrow.
                            </p>
                        </div>
                    ) : null}

                    {!loading && data.mentions.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm text-zinc-400">
                                    Showing {rangeStart}-{rangeEnd} of {data.mentions.length}
                                </div>

                                <div className="flex items-center gap-2">
                                    {data.warning ? (
                                        <div className="hidden rounded-[10px] border border-amber-400/20 bg-amber-500/[0.08] px-3 py-1 text-[11px] text-amber-200 sm:block">
                                            {data.warning}
                                        </div>
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(-1)}
                                        disabled={!canPagePrev}
                                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Show previous Reddit mentions"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(1)}
                                        disabled={!canPageNext}
                                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Show next Reddit mentions"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {data.warning ? (
                                <div className="rounded-[10px] border border-amber-400/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-200 sm:hidden">
                                    {data.warning}
                                </div>
                            ) : null}

                            <div
                                className="grid items-stretch gap-4"
                                style={{ gridTemplateColumns: `repeat(${Math.max(currentMentions.length, 1)}, minmax(0, 1fr))` }}
                            >
                                {currentMentions.map((mention) => (
                                    <OfficialRedditPostEmbed key={mention.id} mention={mention} />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </WidgetShell>
        </div>
    );
}

export default function RedditWebsiteEmbed({ token, mode = 'embed' }: RedditWebsiteEmbedProps) {
    const [data, setData] = useState<RedditEmbedResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/embed/reddit?token=${encodeURIComponent(token)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => ({}));
                if (cancelled) return;

                if (!response.ok) {
                    setError(payload.error || 'This embed is unavailable.');
                    setData(null);
                    return;
                }

                setData(payload as RedditEmbedResponse);
                setError((payload as RedditEmbedResponse).error || null);
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
        <RedditWidgetSurface
            mode={mode}
            loading={loading}
            data={{
                domain: data?.domain || token,
                label: data?.label,
                mentions: data?.mentions || [],
                config: data?.config || DEFAULT_X_WIDGET_CONFIG,
                warning: data?.warning,
                error: error || data?.error,
                showBranding: data?.showBranding !== false,
                resizeKey: token,
            }}
        />
    );
}
