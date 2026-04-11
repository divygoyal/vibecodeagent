'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Loader2, MessageSquare, TrendingUp } from 'lucide-react';

import type { RedditMentionPayload } from '@/lib/redditMentionsShared';

type OfficialRedditPostEmbedProps = {
    mention: RedditMentionPayload;
    className?: string;
};

type EmbedStatus = 'loading' | 'stable' | 'error';

const EMBED_SCRIPT_SRC = 'https://embed.reddit.com/widgets.js';
const DEFAULT_PLACEHOLDER_HEIGHT = 320;
const EMBED_TIMEOUT_MS = 5000;
const REDDIT_CARD_SHELL =
    'relative overflow-hidden rounded-[14px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-[1px] shadow-[0_14px_34px_rgba(0,0,0,0.18)]';
const REDDIT_CARD_INNER =
    'relative overflow-hidden rounded-[13px] bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.07),transparent_26%),linear-gradient(180deg,#0d1219_0%,#090d13_100%)] ring-1 ring-white/[0.04]';

function formatRelativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
        return 'Recently';
    }

    const diffMs = timestamp - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 60) {
        return formatter.format(diffMinutes, 'minute');
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
        return formatter.format(diffHours, 'hour');
    }

    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 30) {
        return formatter.format(diffDays, 'day');
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function RedditFallbackCard({ mention }: { mention: RedditMentionPayload }) {
    return (
        <div className={REDDIT_CARD_SHELL}>
            <article className={`${REDDIT_CARD_INNER} flex h-full min-w-0 flex-col p-4`}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/35 to-transparent" />

                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-[8px] border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-200">
                                Post
                            </span>
                            <span className="text-[11px] font-medium text-zinc-500">r/{mention.subreddit}</span>
                        </div>
                        <div className="mt-3 text-sm font-semibold text-white">u/{mention.author}</div>
                        <div className="mt-1 text-xs text-zinc-500">{formatRelativeTime(mention.createdAt)}</div>
                    </div>

                    <a
                        href={mention.outboundUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-white"
                        aria-label="View this Reddit post"
                    >
                        <ArrowUpRight className="h-4 w-4" />
                    </a>
                </div>

                <div className="mt-4 min-w-0 flex-1 space-y-3">
                    <h3 className="text-base font-semibold leading-6 text-white">
                        {mention.title}
                    </h3>

                    <p className="line-clamp-7 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                        {mention.text || 'Open Reddit to view the full post.'}
                    </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {mention.score.toLocaleString()} score
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {mention.commentCount.toLocaleString()} comments
                    </span>
                    <a
                        href={mention.outboundUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1.5 text-orange-300 transition hover:text-orange-200"
                    >
                        View on Reddit
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                </div>
            </article>
        </div>
    );
}

function buildOfficialEmbed(container: HTMLDivElement, mention: RedditMentionPayload) {
    container.innerHTML = '';

    const blockquote = document.createElement('blockquote');
    blockquote.className = 'reddit-embed-bq';
    blockquote.style.height = `${DEFAULT_PLACEHOLDER_HEIGHT}px`;
    blockquote.setAttribute('data-embed-theme', 'dark');

    const titleLink = document.createElement('a');
    titleLink.href = mention.permalink;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.textContent = mention.title;
    blockquote.appendChild(titleLink);
    blockquote.appendChild(document.createElement('br'));
    blockquote.append(' by ');

    const authorLink = document.createElement('a');
    authorLink.href = `https://www.reddit.com/user/${encodeURIComponent(mention.author)}/`;
    authorLink.target = '_blank';
    authorLink.rel = 'noopener noreferrer';
    authorLink.textContent = `u/${mention.author}`;
    blockquote.appendChild(authorLink);
    blockquote.append(' in ');

    const subredditLink = document.createElement('a');
    subredditLink.href = `https://www.reddit.com/r/${encodeURIComponent(mention.subreddit)}/`;
    subredditLink.target = '_blank';
    subredditLink.rel = 'noopener noreferrer';
    subredditLink.textContent = mention.subreddit;
    blockquote.appendChild(subredditLink);

    const script = document.createElement('script');
    script.async = true;
    script.src = EMBED_SCRIPT_SRC;
    script.charset = 'UTF-8';

    container.appendChild(blockquote);
    container.appendChild(script);

    return script;
}

export default function OfficialRedditPostEmbed({
    mention,
    className = '',
}: OfficialRedditPostEmbedProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<EmbedStatus>('loading');

    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof window === 'undefined') return;

        let cancelled = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
        let mutationObserver: MutationObserver | null = null;

        const cleanupTimers = () => {
            if (pollTimer) clearTimeout(pollTimer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
        };

        const markStable = () => {
            if (cancelled) return;
            cleanupTimers();
            setStatus('stable');
        };

        const markError = () => {
            if (cancelled) return;
            cleanupTimers();
            setStatus('error');
        };

        const hasOfficialEmbed = () => Boolean(container.querySelector('iframe'));

        const pollForEmbed = () => {
            if (cancelled) return;
            if (hasOfficialEmbed()) {
                markStable();
                return;
            }

            pollTimer = setTimeout(pollForEmbed, 180);
        };

        const script = buildOfficialEmbed(container, mention);

        script.addEventListener('error', markError, { once: true });
        script.addEventListener(
            'load',
            () => {
                if (hasOfficialEmbed()) {
                    markStable();
                    return;
                }
                pollForEmbed();
            },
            { once: true }
        );

        mutationObserver = new MutationObserver(() => {
            if (hasOfficialEmbed()) {
                markStable();
            }
        });
        mutationObserver.observe(container, { childList: true, subtree: true });

        timeoutTimer = setTimeout(() => {
            if (!hasOfficialEmbed()) {
                markError();
            }
        }, EMBED_TIMEOUT_MS);

        return () => {
            cancelled = true;
            cleanupTimers();
            mutationObserver?.disconnect();
            container.innerHTML = '';
        };
    }, [mention]);

    if (status === 'error') {
        return <RedditFallbackCard mention={mention} />;
    }

    return (
        <div className={`min-w-0 ${className}`.trim()}>
            <div className={REDDIT_CARD_SHELL}>
                <div className={REDDIT_CARD_INNER}>
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/35 to-transparent" />

                    {status === 'loading' ? (
                        <div className="absolute inset-0 animate-pulse p-4">
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
                            <div className="mt-5 h-[88px] bg-zinc-800/25" />
                            <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Loading official Reddit post
                            </div>
                        </div>
                    ) : null}

                    <div
                        ref={containerRef}
                        className={status === 'loading' ? 'min-h-[320px] opacity-0' : 'min-h-[320px]'}
                    />
                </div>
            </div>
        </div>
    );
}
