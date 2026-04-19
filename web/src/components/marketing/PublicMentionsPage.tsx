'use client';

import Link from 'next/link';
import { Manrope, Space_Grotesk } from 'next/font/google';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import {
    ArrowRight,
    Check,
    Eye,
    Globe2,
    Heart,
    Loader2,
    Lock,
    MessageCircle,
    MessageSquare,
    Repeat2,
    TrendingUp,
} from 'lucide-react';

import GoogleAuthButton from '@/components/marketing/GoogleAuthButton';
import OfficialRedditPostEmbed from '@/components/social/OfficialRedditPostEmbed';
import OfficialXTweetEmbed from '@/components/social/OfficialXTweetEmbed';
import { RedditMark } from '@/components/social/RedditMentionsMark';
import { XMark } from '@/components/social/XMentionsMark';
import { PUBLIC_MENTIONS_DEMO_DOMAIN } from '@/lib/publicMentionsRateLimit';
import { type RedditMentionPayload } from '@/lib/redditMentionsShared';
import { canonicalizeDomainInput, type XMentionPayload } from '@/lib/xMentionsShared';

const marketingHeading = Space_Grotesk({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
});

const marketingBody = Manrope({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
});

type Platform = 'x' | 'reddit';

type PublicMentionsResult = {
    canonicalDomain: string;
    mentions: XMentionPayload[] | RedditMentionPayload[];
    warning?: string;
    error?: string;
};

type PreviewState = {
    status: 'loading' | 'ready' | 'error';
    result: PublicMentionsResult;
};

type PlatformConfig = {
    apiPath: string;
    builderPath: string;
    liveLabel: string;
    title: string;
    description: string;
    previewButtonLabel: string;
    ctaLabel: string;
    unlockTitle: string;
    unlockSubtitle: string;
    leftBullets: readonly string[];
    unlockBullets: readonly string[];
    accentTextClassName: string;
    accentBorderClassName: string;
    accentSurfaceClassName: string;
    accentButtonClassName: string;
    accentGlowClassName: string;
    previewCounterLabel: string;
    renderMark: () => ReactElement;
    renderHeroLogo: () => ReactElement;
    renderPrimaryCard: (
        mention: XMentionPayload | RedditMentionPayload | null,
        loading: boolean,
        useOfficialDemo: boolean,
    ) => ReactElement;
};

const DEFAULT_TRAFFICCLAW_X_TWEET_ID = '2044450601132827104';
const DEFAULT_TRAFFICCLAW_REDDIT_MENTION: RedditMentionPayload = {
    id: 'trafficclaw-reddit-demo',
    postId: '1s3po44',
    title: '20 websites are already using my globe — and I didn’t expect this so soon 😅',
    text: 'Live visitors on a real-time globe view on TrafficClaw.',
    author: 'Zealousideal_Gur9406',
    subreddit: 'microsaas',
    score: 0,
    commentCount: 0,
    createdAt: '',
    permalink: 'https://www.reddit.com/r/microsaas/comments/1s3po44/20_websites_are_already_using_my_globe_and_i/',
    outboundUrl: 'https://www.reddit.com/r/microsaas/comments/1s3po44/20_websites_are_already_using_my_globe_and_i/',
    externalUrl: 'https://trafficclaw.com',
};

function formatCompactNumber(value: number) {
    if (!Number.isFinite(value)) {
        return '0';
    }

    return new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function formatRelativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
        return 'Just now';
    }

    const diffMinutes = Math.round((timestamp - Date.now()) / 60000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 60) {
        return formatter.format(diffMinutes, 'minute');
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
        return formatter.format(diffHours, 'hour');
    }

    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, 'day');
}

function PreviewShell({
    children,
    accentGlowClassName,
}: {
    children: ReactElement;
    accentGlowClassName: string;
}) {
    return (
        <div className="relative mx-auto w-full max-w-[500px]">
            <div className={`pointer-events-none absolute inset-x-[12%] bottom-2 h-20 rounded-full opacity-40 blur-[80px] ${accentGlowClassName}`} />
            <div
                className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(16,20,28,0.98),rgba(7,10,15,1))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5"
                style={{ animation: 'publicMentionsFloat 9s ease-in-out infinite' }}
            >
                <div className={`pointer-events-none absolute inset-0 rounded-[28px] opacity-25 ${accentGlowClassName}`} style={{ filter: 'blur(26px)' }} />
                <div className="relative">{children}</div>
            </div>
        </div>
    );
}

function XPreviewCard({
    mention,
    loading,
    useOfficialDemo,
}: {
    mention: XMentionPayload | null;
    loading: boolean;
    useOfficialDemo: boolean;
}) {
    if (useOfficialDemo) {
        return (
            <div className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,19,27,0.98),rgba(7,10,15,1))] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_26px_rgba(0,0,0,0.2)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
                        TrafficClaw sample post
                    </div>
                    <XMark className="h-3.5 w-3.5 text-zinc-500" />
                </div>
                <div className="mx-auto max-w-[300px] overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0b1016] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <OfficialXTweetEmbed
                        tweetId={DEFAULT_TRAFFICCLAW_X_TWEET_ID}
                        className="w-full"
                        maxRenderWidth={292}
                        showErrorState
                    />
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="animate-pulse rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,24,34,0.94),rgba(8,11,16,0.98))] p-4">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-white/[0.08]" />
                    <div className="space-y-2">
                        <div className="h-3 w-28 rounded-full bg-white/[0.08]" />
                        <div className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
                    </div>
                </div>
                <div className="mt-4 space-y-2">
                    <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
                    <div className="h-2.5 w-[92%] rounded-full bg-white/[0.06]" />
                    <div className="h-2.5 w-[78%] rounded-full bg-white/[0.04]" />
                </div>
                <div className="mt-5 flex gap-4">
                    <div className="h-2.5 w-10 rounded-full bg-white/[0.06]" />
                    <div className="h-2.5 w-10 rounded-full bg-white/[0.06]" />
                    <div className="h-2.5 w-12 rounded-full bg-white/[0.06]" />
                </div>
            </div>
        );
    }

    if (!mention) {
        return (
            <div className="rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,24,34,0.94),rgba(8,11,16,0.98))] p-5 text-sm text-zinc-400">
                We couldn&apos;t find public X posts matching this domain yet. Try a more active brand/domain or check again later.
            </div>
        );
    }

    return (
        <div className="rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,24,34,0.94),rgba(8,11,16,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    {mention.authorAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={mention.authorAvatar}
                            alt={mention.authorName}
                            className="h-11 w-11 rounded-full border border-white/[0.08] object-cover"
                        />
                    ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-zinc-300">
                            {mention.authorName.slice(0, 1)}
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{mention.authorName}</span>
                            {mention.verified ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[10px] text-[#031017]">
                                    <Check className="h-3 w-3" />
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span>@{mention.authorHandle}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(mention.createdAt)}</span>
                        </div>
                    </div>
                </div>

                <XMark className="h-4 w-4 shrink-0 text-zinc-400" />
            </div>

            <div className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                {mention.text}
            </div>

            {mention.quotedTweet ? (
                <div className="mt-4 rounded-[14px] border border-white/[0.08] bg-black/20 p-3 text-sm text-zinc-300">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                        Quoted
                    </div>
                    <div className="mt-2 line-clamp-3">{mention.quotedTweet.text}</div>
                </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.replies)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Repeat2 className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.retweets)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.likes)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.views)}
                </span>
            </div>
        </div>
    );
}

function RedditPreviewCard({
    mention,
    loading,
    useOfficialDemo,
}: {
    mention: RedditMentionPayload | null;
    loading: boolean;
    useOfficialDemo: boolean;
}) {
    if (useOfficialDemo) {
        return (
            <div className="relative overflow-hidden rounded-[18px] border border-[#FF4500]/14 bg-[linear-gradient(180deg,rgba(62,34,23,0.98),rgba(32,19,14,1))] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_26px_rgba(0,0,0,0.2),0_0_24px_rgba(255,69,0,0.08)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FF4500]/80" />
                        TrafficClaw sample thread
                    </div>
                    <RedditMark className="h-3.5 w-3.5 text-zinc-500" />
                </div>
                <div className="mx-auto max-w-[320px] overflow-hidden rounded-[16px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(22,20,18,0.96),rgba(15,13,11,1))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <OfficialRedditPostEmbed
                        mention={DEFAULT_TRAFFICCLAW_REDDIT_MENTION}
                        className="w-full"
                    />
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="animate-pulse rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(28,20,14,0.96),rgba(11,8,6,0.98))] p-4">
                <div className="h-3 w-28 rounded-full bg-white/[0.08]" />
                <div className="mt-3 space-y-2">
                    <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
                    <div className="h-2.5 w-[88%] rounded-full bg-white/[0.06]" />
                    <div className="h-2.5 w-[72%] rounded-full bg-white/[0.04]" />
                </div>
                <div className="mt-5 flex gap-4">
                    <div className="h-2.5 w-12 rounded-full bg-white/[0.06]" />
                    <div className="h-2.5 w-16 rounded-full bg-white/[0.06]" />
                </div>
            </div>
        );
    }

    if (!mention) {
        return (
            <div className="rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(28,20,14,0.96),rgba(11,8,6,0.98))] p-5 text-sm text-zinc-400">
                We couldn&apos;t find public Reddit posts matching this domain yet. Try a more active brand/domain or check again later.
            </div>
        );
    }

    return (
        <div className="rounded-[18px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(28,20,14,0.96),rgba(11,8,6,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded-full border border-[#FF4500]/20 bg-[#FF4500]/10 px-2 py-0.5 font-semibold uppercase tracking-[0.16em] text-[#FF4500]">
                            Reddit
                        </span>
                        <span>r/{mention.subreddit}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(mention.createdAt)}</span>
                    </div>
                    <div className="mt-3 text-base font-semibold leading-7 text-white">
                        {mention.title}
                    </div>
                </div>

                <RedditMark className="h-5 w-5 shrink-0 text-[#FF4500]" />
            </div>

            <div className="mt-4 line-clamp-4 whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                {mention.text || 'Open Reddit to see the full post.'}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.score)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {formatCompactNumber(mention.commentCount)}
                </span>
                <span>u/{mention.author}</span>
            </div>
        </div>
    );
}

function PreviewPlaceholderList({
    count,
    accentBorderClassName,
}: {
    count: number;
    accentBorderClassName: string;
}) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    className={`rounded-[16px] border bg-white/[0.03] px-4 py-4 opacity-60 blur-[3px] saturate-[0.7] ${accentBorderClassName}`}
                    style={{
                        transform: `translateY(${index * -4}px) scale(${1 - index * 0.015})`,
                        animation: `publicMentionsFeedPulse 5.2s ease-in-out ${index * 0.4}s infinite`,
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-white/[0.08]" />
                        <div className="space-y-2">
                            <div className="h-2.5 w-24 rounded-full bg-white/[0.08]" />
                            <div className="h-2 w-16 rounded-full bg-white/[0.05]" />
                        </div>
                    </div>
                    <div className="mt-4 space-y-2">
                        <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
                        <div className="h-2.5 w-[86%] rounded-full bg-white/[0.06]" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function PreviewMessageCard({
    title,
    description,
    accentBorderClassName,
    accentSurfaceClassName,
    accentTextClassName,
    tone = 'neutral',
}: {
    title: string;
    description: string;
    accentBorderClassName: string;
    accentSurfaceClassName: string;
    accentTextClassName: string;
    tone?: 'neutral' | 'warning' | 'error';
}) {
    const toneClassName =
        tone === 'error'
            ? 'border-red-400/20 bg-red-500/[0.08] text-red-100'
            : tone === 'warning'
                ? 'border-amber-400/20 bg-amber-500/[0.08] text-amber-100'
                : `border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,24,34,0.94),rgba(8,11,16,0.98))] text-zinc-200`;

    return (
        <div className={`rounded-[18px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${toneClassName}`}>
            <div className="flex items-start gap-3">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${accentBorderClassName} ${accentSurfaceClassName}`}>
                    <Lock className={`h-4 w-4 ${accentTextClassName}`} />
                </span>

                <div className="min-w-0">
                    <div className="text-base font-semibold tracking-[-0.03em] text-white">
                        {title}
                    </div>
                    <p className="mt-2 text-sm leading-7 opacity-90">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}

const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
    x: {
        apiPath: '/api/public/x-mentions',
        builderPath: '/dashboard/x-api',
        liveLabel: 'Live mentions',
        title: 'Track and display your X mentions in real time',
        description:
            'Instantly preview your X mentions and turn them into a live feed for your website.',
        previewButtonLabel: 'See my mentions',
        ctaLabel: 'Sign up & get your embed code',
        unlockTitle: 'Unlock your full mention feed',
        unlockSubtitle: 'Unlock all X mentions + embed on your site',
        leftBullets: [
            'No signup required to preview',
            'Instant real-time preview',
            'Works on any website',
        ],
        unlockBullets: [
            'See the full feed, not just the preview sample',
            'Copy-paste embed code',
            'Auto-updating widget',
        ],
        accentTextClassName: 'text-cyan-300',
        accentBorderClassName: 'border-cyan-400/18',
        accentSurfaceClassName: 'bg-cyan-500/10',
        accentButtonClassName:
            'border border-cyan-400/24 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] text-[#031017] hover:brightness-105',
        accentGlowClassName: 'bg-cyan-400/25',
        previewCounterLabel: 'preview mentions unlocked',
        renderMark: () => <XMark className="h-4 w-4 text-white" />,
        renderHeroLogo: () => <XMark className="h-10 w-10 text-white sm:h-12 sm:w-12" />,
        renderPrimaryCard: (mention, loading, useOfficialDemo) => (
            <XPreviewCard
                mention={mention as XMentionPayload | null}
                loading={loading}
                useOfficialDemo={useOfficialDemo}
            />
        ),
    },
    reddit: {
        apiPath: '/api/public/reddit-mentions',
        builderPath: '/dashboard/reddit-api',
        liveLabel: 'Reddit discussions',
        title: 'Track and display your Reddit mentions in real time',
        description:
            'Preview the latest Reddit posts about your site and turn community buzz into a discussion feed on your website.',
        previewButtonLabel: 'See my mentions',
        ctaLabel: 'Sign up & get your embed code',
        unlockTitle: 'Unlock your full Reddit feed',
        unlockSubtitle: 'Unlock all Reddit mentions + embed on your site',
        leftBullets: [
            'No signup required to preview',
            'See discussion threads instantly',
            'Works on any website',
        ],
        unlockBullets: [
            'See the full feed, not just the preview sample',
            'Copy-paste embed code',
            'Auto-updating discussion widget',
        ],
        accentTextClassName: 'text-[#FF4500]',
        accentBorderClassName: 'border-[#FF4500]/18',
        accentSurfaceClassName: 'bg-[#FF4500]/10',
        accentButtonClassName:
            'border border-[#FF4500]/24 bg-[linear-gradient(135deg,#FF4500_0%,#FF6A33_100%)] text-white hover:brightness-105',
        accentGlowClassName: 'bg-[#FF4500]/25',
        previewCounterLabel: 'preview discussions unlocked',
        renderMark: () => <RedditMark className="h-5 w-5 text-[#FF4500]" />,
        renderHeroLogo: () => <RedditMark className="h-11 w-11 text-[#FF4500] sm:h-14 sm:w-14" />,
        renderPrimaryCard: (mention, loading, useOfficialDemo) => (
            <RedditPreviewCard
                mention={mention as RedditMentionPayload | null}
                loading={loading}
                useOfficialDemo={useOfficialDemo}
            />
        ),
    },
};

function buildBuilderHref(path: string, domain?: string | null) {
    if (!domain) {
        return path;
    }

    const params = new URLSearchParams({ domain });
    return `${path}?${params.toString()}`;
}

function SignupCta({
    session,
    href,
    label,
    className,
}: {
    session: ReturnType<typeof useSession>['data'];
    href: string;
    label: string;
    className: string;
}) {
    if (session?.user) {
        return (
            <Link href={href} className={className}>
                {label}
                <ArrowRight className="h-4 w-4" />
            </Link>
        );
    }

    return (
        <GoogleAuthButton callbackUrl={href} className={className}>
            {label}
            <ArrowRight className="h-4 w-4" />
        </GoogleAuthButton>
    );
}

function MentionsPreviewPanel({
    className,
    config,
    platform,
    session,
    builderHref,
    previewDomain,
    previewLoading,
    useOfficialDemo,
    primaryMention,
    previewIssueMessage,
    previewIssueTone,
    emptyPreviewMessage,
    unlockDescription,
    totalPreviewMentions,
    blurredMentionsCount,
    footerHiddenCount,
    previewWarning,
    previewError,
    formError,
}: {
    className?: string;
    config: PlatformConfig;
    platform: Platform;
    session: ReturnType<typeof useSession>['data'];
    builderHref: string;
    previewDomain: string;
    previewLoading: boolean;
    useOfficialDemo: boolean;
    primaryMention: XMentionPayload | RedditMentionPayload | null;
    previewIssueMessage: string | null;
    previewIssueTone: 'neutral' | 'warning' | 'error';
    emptyPreviewMessage: string | null;
    unlockDescription: string;
    totalPreviewMentions: number;
    blurredMentionsCount: number;
    footerHiddenCount: number;
    previewWarning?: string;
    previewError?: string;
    formError: string | null;
}) {
    const previewDotStyle =
        platform === 'x'
            ? { backgroundColor: 'rgba(103, 232, 249, 0.9)' }
            : { backgroundColor: 'rgba(255, 69, 0, 0.9)' };

    return (
        <div className={className}>
            <PreviewShell accentGlowClassName={config.accentGlowClassName}>
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className={`text-[1.25rem] font-semibold tracking-[-0.045em] text-white sm:text-[1.42rem] ${marketingHeading.className}`}>
                                {previewDomain}
                            </div>
                            <p className="mt-1 text-sm text-zinc-500">
                                {platform === 'x' ? 'Live X mentions preview' : 'Live Reddit discussions preview'}
                            </p>
                        </div>

                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] ${config.accentBorderClassName} ${config.accentSurfaceClassName}`}>
                            <span className="h-1.5 w-1.5 rounded-full" style={previewDotStyle} />
                            Live preview
                        </span>
                    </div>

                    <div className="relative">
                        {previewIssueMessage ? (
                            <PreviewMessageCard
                                title={platform === 'x' ? 'Live X preview unavailable right now' : 'Live Reddit preview unavailable right now'}
                                description={previewIssueMessage}
                                accentBorderClassName={config.accentBorderClassName}
                                accentSurfaceClassName={config.accentSurfaceClassName}
                                accentTextClassName={config.accentTextClassName}
                                tone={previewIssueTone}
                            />
                        ) : emptyPreviewMessage ? (
                            <PreviewMessageCard
                                title={platform === 'x' ? 'No public X mentions found yet' : 'No public Reddit mentions found yet'}
                                description={emptyPreviewMessage}
                                accentBorderClassName={config.accentBorderClassName}
                                accentSurfaceClassName={config.accentSurfaceClassName}
                                accentTextClassName={config.accentTextClassName}
                            />
                        ) : (
                            config.renderPrimaryCard(primaryMention, previewLoading, useOfficialDemo)
                        )}

                        <div className="mt-3 rounded-[18px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <PreviewPlaceholderList
                                count={1}
                                accentBorderClassName={config.accentBorderClassName}
                            />
                        </div>

                        <div className="absolute inset-x-4 bottom-4 rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,18,24,0.86),rgba(8,10,15,0.94))] p-3.5 text-center shadow-[0_18px_42px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                            <div className="flex justify-center">
                                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${config.accentBorderClassName} ${config.accentSurfaceClassName}`}>
                                    <Lock className={`h-4 w-4 ${config.accentTextClassName}`} />
                                </span>
                            </div>

                            <div className={`mt-3 text-[1rem] font-semibold tracking-[-0.04em] text-white sm:text-[1.08rem] ${marketingHeading.className}`}>
                                {config.unlockSubtitle}
                            </div>
                            <p className="mt-1.5 text-xs leading-5 text-zinc-400">
                                {unlockDescription}
                            </p>

                            <div className="mt-4">
                                <SignupCta
                                    session={session}
                                    href={builderHref}
                                    label="Unlock full feed"
                                    className={`inline-flex min-h-[38px] items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition ${config.accentBorderClassName} ${config.accentSurfaceClassName} ${config.accentTextClassName}`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-500">
                        <span>
                            {blurredMentionsCount > 0
                                ? `...and ${footerHiddenCount} more blurred mentions`
                                : 'Unlock to keep the live feed on your site'}
                        </span>
                        <span className={`font-medium ${config.accentTextClassName}`}>
                            {totalPreviewMentions} {config.previewCounterLabel}
                        </span>
                    </div>

                    {previewWarning && !previewError && !previewIssueMessage ? (
                        <div className="rounded-[14px] border border-amber-400/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100">
                            {previewWarning}
                        </div>
                    ) : null}

                    {previewError && !formError && !previewIssueMessage ? (
                        <div className="rounded-[14px] border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                            {previewError}
                        </div>
                    ) : null}
                </div>
            </PreviewShell>
        </div>
    );
}

export default function PublicMentionsPage({ platform }: { platform: Platform }) {
    const config = PLATFORM_CONFIG[platform];
    const { data: session } = useSession();
    const [domainInput, setDomainInput] = useState('');
    const [previewState, setPreviewState] = useState<PreviewState>({
        status: 'loading',
        result: {
            canonicalDomain: PUBLIC_MENTIONS_DEMO_DOMAIN,
            mentions: [],
        },
    });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchPreview = useCallback(
        async (domain: string): Promise<PublicMentionsResult> => {
            const response = await fetch(config.apiPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });

            const payload = await response.json().catch(() => ({}));
            const canonicalDomain =
                canonicalizeDomainInput(payload.canonicalDomain || domain) ||
                canonicalizeDomainInput(domain);
            const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
            const warning = typeof payload.warning === 'string' ? payload.warning : undefined;
            const error = typeof payload.error === 'string' ? payload.error : undefined;

            if (!canonicalDomain) {
                throw new Error(error || warning || 'Enter a valid domain like example.com.');
            }

            if (!response.ok && mentions.length === 0) {
                throw new Error(error || warning || 'Preview is unavailable right now.');
            }

            return {
                canonicalDomain,
                mentions,
                warning,
                error,
            };
        },
        [config.apiPath],
    );

    useEffect(() => {
        let cancelled = false;

        const loadDemo = async () => {
            setPreviewState({
                status: 'loading',
                result: {
                    canonicalDomain: PUBLIC_MENTIONS_DEMO_DOMAIN,
                    mentions: [],
                },
            });

            try {
                const result = await fetchPreview(PUBLIC_MENTIONS_DEMO_DOMAIN);
                if (cancelled) return;

                setPreviewState({
                    status: 'ready',
                    result,
                });
            } catch (error) {
                if (cancelled) return;

                setPreviewState({
                    status: 'error',
                    result: {
                        canonicalDomain: PUBLIC_MENTIONS_DEMO_DOMAIN,
                        mentions: [],
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Preview is unavailable right now.',
                    },
                });
            }
        };

        void loadDemo();

        return () => {
            cancelled = true;
        };
    }, [fetchPreview]);

    const carriedDomain = useMemo(() => {
        const previewDomain = previewState.result.canonicalDomain;
        return previewDomain && previewDomain !== PUBLIC_MENTIONS_DEMO_DOMAIN
            ? previewDomain
            : null;
    }, [previewState.result.canonicalDomain]);
    const builderHref = useMemo(
        () => buildBuilderHref(config.builderPath, carriedDomain),
        [carriedDomain, config.builderPath],
    );
    const previewLoading = previewState.status === 'loading';
    const previewMentions = previewState.result.mentions;
    const previewDomain = previewState.result.canonicalDomain || PUBLIC_MENTIONS_DEMO_DOMAIN;
    const primaryMention = (previewMentions[0] || null) as XMentionPayload | RedditMentionPayload | null;
    const showingDemoPreview = !carriedDomain;
    const useOfficialXDemo = platform === 'x' && previewDomain === PUBLIC_MENTIONS_DEMO_DOMAIN;
    const useOfficialRedditDemo = platform === 'reddit' && previewDomain === PUBLIC_MENTIONS_DEMO_DOMAIN;
    const useOfficialDemo = useOfficialXDemo || useOfficialRedditDemo;
    const previewIssueMessage =
        !previewLoading && !useOfficialDemo && previewMentions.length === 0
            ? previewState.result.error || previewState.result.warning || null
            : null;
    const previewIssueTone =
        previewState.result.error && previewIssueMessage
            ? 'error'
            : previewIssueMessage
                ? 'warning'
                : 'neutral';
    const emptyPreviewMessage =
        !previewLoading && !useOfficialDemo && previewMentions.length === 0 && !previewIssueMessage
            ? platform === 'x'
                ? `We couldn't find recent public X posts for ${previewDomain} yet. Try a more active brand/domain or check again later.`
                : `We couldn't find recent public Reddit posts for ${previewDomain} yet. Try a more active brand/domain or check again later.`
            : null;
    const previewReadyForUnlock = Boolean(primaryMention) || useOfficialDemo;
    const unlockDescription = showingDemoPreview
        ? `Previewing ${PUBLIC_MENTIONS_DEMO_DOMAIN} until you enter your own domain.`
        : previewReadyForUnlock
            ? `Your preview for ${previewDomain} is ready. Sign up to unlock the hosted feed and iframe code.`
            : previewIssueMessage
                ? `We couldn't load a live public preview for ${previewDomain} right now. You can still continue to the builder and finish setup there.`
                : `We didn't find recent public mentions for ${previewDomain} yet. You can still continue and generate the embed setup.`;
    const totalPreviewMentions = useOfficialDemo
        ? Math.max(previewMentions.length, 16)
        : previewMentions.length;
    const blurredMentionsCount = useOfficialDemo
        ? Math.max(totalPreviewMentions - 1, 3)
        : Math.max(totalPreviewMentions - 1, 0);
    const footerHiddenCount = Math.max(totalPreviewMentions - 1, 15);

    const handlePreview = useCallback(async () => {
        const canonicalDomain = canonicalizeDomainInput(domainInput);
        if (!canonicalDomain) {
            setFormError('Enter a valid domain like example.com.');
            return;
        }

        setSubmitting(true);
        setFormError(null);

        try {
            const result = await fetchPreview(canonicalDomain);
            setPreviewState({
                status: 'ready',
                result,
            });
            setDomainInput(result.canonicalDomain);
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : 'Preview is unavailable right now.',
            );
        } finally {
            setSubmitting(false);
        }
    }, [domainInput, fetchPreview]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void handlePreview();
        },
        [handlePreview],
    );

    return (
        <div className={`relative overflow-hidden bg-[#06070c] text-white ${marketingBody.className}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.10),transparent_18%),radial-gradient(circle_at_72%_24%,rgba(103,232,249,0.08),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#090b12_0%,#04050a_36%,#020308_100%)]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 12% 14%, rgba(255,255,255,0.30) 0 1px, transparent 1.5px), radial-gradient(circle at 34% 72%, rgba(255,255,255,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 86% 64%, rgba(255,255,255,0.12) 0 1px, transparent 1.5px)',
                    backgroundSize: '300px 300px, 420px 420px, 520px 520px, 640px 640px',
                }}
            />

            <section className="relative mx-auto max-w-[1180px] px-4 pb-14 pt-24 sm:px-6 sm:pb-14 sm:pt-28 lg:min-h-[calc(100vh-78px)] lg:px-8 lg:pb-10 lg:pt-28 xl:pb-12 xl:pt-32">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,1fr)] lg:items-center lg:gap-8 xl:gap-10">
                    <div className="max-w-[520px] space-y-5 sm:space-y-6">
                        <div className="flex items-center">
                            <div className="relative">
                                <div className={`pointer-events-none absolute inset-1 opacity-45 blur-2xl ${config.accentGlowClassName}`} />
                                <div className="relative z-10">
                                    {config.renderHeroLogo()}
                                </div>
                            </div>
                        </div>

                        <div className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] ${config.accentBorderClassName} ${config.accentSurfaceClassName}`}>
                            {config.renderMark()}
                            <span className={config.accentTextClassName}>{config.liveLabel}</span>
                        </div>

                        <div className="space-y-4">
                            <h1 className={`max-w-[9ch] text-balance text-[2.8rem] font-semibold leading-[0.9] tracking-[-0.075em] text-white sm:text-[3.95rem] sm:leading-[0.92] ${marketingHeading.className}`}>
                                {config.title}
                            </h1>
                            <p className="max-w-[30rem] text-[1rem] leading-7 text-zinc-400 sm:text-[1.02rem] sm:leading-7">
                                {config.description}
                            </p>
                        </div>

                        <div className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                                    Preview your domain
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                    No signup required
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="flex items-center gap-3 rounded-[16px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                    <Globe2 className={`h-5 w-5 shrink-0 ${config.accentTextClassName}`} />
                                    <input
                                        value={domainInput}
                                        onChange={(event) => setDomainInput(event.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="yourwebsite.com"
                                        className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-500"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => void handlePreview()}
                                    disabled={submitting}
                                    className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[16px] border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${config.accentBorderClassName} ${config.accentSurfaceClassName} ${config.accentTextClassName}`}
                                >
                                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                                    {submitting ? 'Loading preview...' : config.previewButtonLabel}
                                </button>
                            </div>

                            {formError ? (
                                <div className="mt-3 rounded-[16px] border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                                    {formError}
                                </div>
                            ) : null}
                            <div className="mt-3 text-sm leading-6 text-zinc-500">
                                Enter any website to load a live public preview before you open the builder.
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
                            {config.leftBullets.map((bullet) => (
                                <div key={bullet} className="flex items-center gap-2">
                                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${config.accentBorderClassName} ${config.accentSurfaceClassName}`}>
                                        <Check className={`h-3 w-3 ${config.accentTextClassName}`} />
                                    </span>
                                    {bullet}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                            <SignupCta
                                session={session}
                                href={builderHref}
                                label={config.ctaLabel}
                                className={`inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-5 text-center text-sm font-semibold transition ${config.accentButtonClassName}`}
                            />
                            <div className="max-w-[14rem] text-xs leading-5 text-zinc-500 sm:text-sm sm:leading-6">
                                {carriedDomain
                                    ? `Ready to unlock ${carriedDomain}`
                                    : `Demo loaded with ${PUBLIC_MENTIONS_DEMO_DOMAIN}`}
                            </div>
                        </div>

                        <MentionsPreviewPanel
                            className="lg:hidden"
                            config={config}
                            platform={platform}
                            session={session}
                            builderHref={builderHref}
                            previewDomain={previewDomain}
                            previewLoading={previewLoading}
                            useOfficialDemo={useOfficialDemo}
                            primaryMention={primaryMention}
                            previewIssueMessage={previewIssueMessage}
                            previewIssueTone={previewIssueTone}
                            emptyPreviewMessage={emptyPreviewMessage}
                            unlockDescription={unlockDescription}
                            totalPreviewMentions={totalPreviewMentions}
                            blurredMentionsCount={blurredMentionsCount}
                            footerHiddenCount={footerHiddenCount}
                            previewWarning={previewState.result.warning}
                            previewError={previewState.result.error}
                            formError={formError}
                        />
                    </div>

                    <MentionsPreviewPanel
                        className="relative hidden min-w-0 lg:block"
                        config={config}
                        platform={platform}
                        session={session}
                        builderHref={builderHref}
                        previewDomain={previewDomain}
                        previewLoading={previewLoading}
                        useOfficialDemo={useOfficialDemo}
                        primaryMention={primaryMention}
                        previewIssueMessage={previewIssueMessage}
                        previewIssueTone={previewIssueTone}
                        emptyPreviewMessage={emptyPreviewMessage}
                        unlockDescription={unlockDescription}
                        totalPreviewMentions={totalPreviewMentions}
                        blurredMentionsCount={blurredMentionsCount}
                        footerHiddenCount={footerHiddenCount}
                        previewWarning={previewState.result.warning}
                        previewError={previewState.result.error}
                        formError={formError}
                    />
                </div>
            </section>
            <style jsx>{`
                @keyframes publicMentionsFloat {
                    0%, 100% {
                        transform: translateY(0px);
                    }
                    50% {
                        transform: translateY(-8px);
                    }
                }

                @keyframes publicMentionsScan {
                    0% {
                        transform: translateX(-24%);
                        opacity: 0;
                    }
                    15% {
                        opacity: 0.85;
                    }
                    85% {
                        opacity: 0.85;
                    }
                    100% {
                        transform: translateX(24%);
                        opacity: 0;
                    }
                }

                @keyframes publicMentionsFeedPulse {
                    0%, 100% {
                        opacity: 0.55;
                    }
                    50% {
                        opacity: 0.78;
                    }
                }
            `}</style>
        </div>
    );
}
