import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    ArrowRight,
    ArrowUpRight,
    Bot,
    Globe,
    Sparkles,
    Pen,
    Brain,
    Link2,
    Activity,
    Eye,
    Layers,
    Cpu,
    Timer,
    UserPlus,
    type LucideIcon,
} from 'lucide-react';

import DeferredEmbed from './DeferredEmbed';
import HeroGalaxy from './HeroGalaxy';
import LazyVideoFrame from './LazyVideoFrame';
import GoogleAuthButton from '@/components/marketing/GoogleAuthButton';
import {
    HOMEPAGE_CONTENT,
    type HomepageCompactReason,
    type HomepageProofCard,
} from './content';
import { JourneyLine, JourneyNode } from './JourneyTimeline';
import BadgeMarquee from './BadgeMarquee';

type FeaturedReason = {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    videoSrc: string;
    posterSrc?: string;
    videoClassName?: string;
    frameLabel: string;
    frameMeta: string;
    highlights: readonly string[] | readonly { title: string; text: string }[];
};

type HighlightItem = FeaturedReason['highlights'][number];
type HighlightObject = Extract<HighlightItem, { title: string; text: string }>;
type SeoReason = Extract<HomepageCompactReason, { kind: 'seo' }>;
type SeoFeature = NonNullable<SeoReason['features']>[number];
type HeroFallbackMetric = {
    label: string;
    value: string;
    change: string;
    bars: readonly number[];
    icon: LucideIcon;
};

const SEO_FEATURE_ICONS: Record<SeoFeature['iconType'], LucideIcon> = {
    pen: Pen,
    brain: Brain,
    link: Link2,
    activity: Activity,
    layers: Layers,
    cpu: Cpu,
};

const HERO_FALLBACK_METRICS: readonly HeroFallbackMetric[] = [
    {
        label: 'Sessions',
        value: '86.6K',
        change: '+284.4%',
        bars: [18, 18, 28, 30, 30, 18, 24, 38, 48, 36, 44, 52],
        icon: Activity,
    },
    {
        label: 'Pageviews',
        value: '180.0K',
        change: '+221.7%',
        bars: [16, 12, 32, 34, 34, 18, 26, 44, 48, 46, 56],
        icon: Eye,
    },
    {
        label: 'Session Duration',
        value: '3m 45s',
        change: '+5.0%',
        bars: [44, 78, 38, 30, 26, 28, 22, 24, 26, 24, 30],
        icon: Timer,
    },
    {
        label: 'New Users',
        value: '61.4K',
        change: '+386.4%',
        bars: [14, 10, 34, 28, 36, 16, 32, 54, 52, 42, 66],
        icon: UserPlus,
    },
] as const;

function isHighlightObject(item: HighlightItem): item is HighlightObject {
    return typeof item === 'object';
}

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7AD9DA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14C4E1]" />
            {children}
        </div>
    );
}

function GradientButton({
    href,
    children,
    secondary = false,
    newTab = false,
}: {
    href: string;
    children: ReactNode;
    secondary?: boolean;
    newTab?: boolean;
}) {
    const className = secondary
        ? 'border border-white/[0.12] bg-white/[0.03] text-white hover:border-white/[0.18] hover:bg-white/[0.05]'
        : 'border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] text-[#031017] hover:brightness-105';

    return (
        <Link
            href={href}
            target={newTab ? '_blank' : undefined}
            rel={newTab ? 'noreferrer' : undefined}
            className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 text-center text-sm font-semibold transition-all duration-200 sm:w-auto ${className}`}
        >
            {children}
        </Link>
    );
}

function HeroFrameFallback() {
    return (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(82,226,245,0.14),transparent_28%),linear-gradient(180deg,#030609_0%,#020406_45%,#010203_100%)] p-3 sm:p-4">
            <div
                className="absolute inset-0 opacity-35"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            />
            <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_70%)]" />

            <div className="relative grid h-full grid-cols-2 gap-3 sm:gap-4">
                {HERO_FALLBACK_METRICS.map((metric) => {
                    const Icon = metric.icon;

                    return (
                        <div
                            key={metric.label}
                            className="relative min-w-0 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_50px_rgba(0,0,0,0.42)] sm:p-5"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(82,226,245,0.08),transparent_34%)]" />
                            <div className="relative flex h-full flex-col">
                                <div className="flex items-start justify-between gap-2 sm:gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 sm:text-[11px]">
                                            <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                                            <span className="truncate">{metric.label}</span>
                                        </div>
                                        <div className="mt-2 text-[1.45rem] font-semibold tracking-[-0.06em] text-white sm:mt-3 sm:text-[2.35rem]">
                                            {metric.value}
                                        </div>
                                    </div>

                                    <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-500/12 px-2 py-1 text-[9px] font-semibold text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.12)] sm:px-2.5 sm:text-[10px]">
                                        {metric.change}
                                    </span>
                                </div>

                                <div className="mt-auto pt-3 sm:pt-5">
                                    <div className="flex h-14 items-end gap-1 sm:h-16 sm:gap-1.5">
                                        {metric.bars.map((barHeight, index) => (
                                            <span
                                                key={`${metric.label}-${index}`}
                                                className="block h-full flex-1 rounded-[4px] bg-[linear-gradient(180deg,#5ee8f5_0%,#22d3ee_38%,#0f6d86_100%)] shadow-[0_0_18px_rgba(82,226,245,0.2)]"
                                                style={{
                                                    height: `${barHeight}%`,
                                                    opacity: index < 2 ? 0.45 : 1,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function VideoFallback({
    icon,
    title,
    eyebrow,
    posterSrc,
    number,
}: {
    icon: ReactNode;
    title: string;
    eyebrow: string;
    posterSrc?: string;
    number: string;
}) {
    return (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.1),transparent_38%),linear-gradient(180deg,#06080b_0%,#030406_100%)]">
            {posterSrc ? (
                <>
                    <Image
                        src={posterSrc}
                        alt={title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 60vw"
                        className="object-cover object-center"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,4,6,0.28),rgba(3,4,6,0.64)_62%,rgba(3,4,6,0.84)_100%)]" />
                </>
            ) : null}

            <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-black/35 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[#dff9ff]">
                {icon}
                {eyebrow}
            </div>

            <div className="absolute right-5 top-5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-300">
                Reason {number}
            </div>

            <div className="absolute inset-x-5 bottom-5 rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <h4 className="max-w-lg text-2xl font-semibold tracking-[-0.04em] text-white">{title}</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((card) => (
                        <div
                            key={card}
                            className="rounded-2xl border border-white/[0.08] bg-black/35 p-4"
                        >
                            <div className="mb-3 h-2 w-16 rounded-full bg-[#14C4E1]/60" />
                            <div className="h-2 w-full rounded-full bg-white/[0.08]" />
                            <div className="mt-2 h-2 w-3/4 rounded-full bg-white/[0.05]" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function FeaturedReasonCard({
    reason,
    icon,
    videoTitle,
    fallbackEyebrow,
    id,
    reverse = false,
    ctaHref,
    ctaLabel,
    newTab = false,
}: {
    reason: FeaturedReason;
    icon: ReactNode;
    videoTitle: string;
    fallbackEyebrow: string;
    id?: string;
    reverse?: boolean;
    ctaHref?: string;
    ctaLabel?: string;
    newTab?: boolean;
}) {
    return (
        <article
            id={id}
            className="overflow-hidden rounded-[36px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.08),transparent_36%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-5 lg:p-6"
        >
            <div
                className={`grid gap-8 lg:items-center xl:gap-16 ${reverse ? 'lg:grid-cols-2' : 'lg:grid-cols-2'}`}
            >
                <div className={`relative z-10 min-w-0 space-y-6 ${reverse ? 'lg:order-2' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#dff9ff] shadow-[0_0_12px_rgba(20,196,225,0.15)] transition-colors hover:bg-[#14C4E1]/20">
                            Reason {reason.number}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-300 transition-colors hover:bg-white/[0.05]">
                            {reason.eyebrow}
                        </span>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-balance max-w-[16ch] text-[1.9rem] font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-[3rem] lg:leading-[1.05]">
                            {reason.title}
                        </h3>
                        <p className="max-w-xl text-[15px] leading-7 text-zinc-400 sm:text-base">{reason.description}</p>
                    </div>

                    <div className="flex flex-col gap-4 mt-8">
                        {reason.highlights.map((item) => {
                            const isObj = isHighlightObject(item);
                            const key = isObj ? item.title : item;
                            
                            return (
                                <div key={key} className="flex items-start gap-4">
                                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#14C4E1]/20 bg-[#14C4E1]/10 text-[#7AD9DA] shadow-[0_0_12px_rgba(20,196,225,0.1)]">
                                        {icon}
                                    </div>
                                    {isObj ? (
                                        <div className="min-w-0 space-y-1">
                                            <div className="text-[15px] font-semibold text-white">{item.title}</div>
                                            <div className="text-[14px] leading-relaxed text-zinc-400">{item.text}</div>
                                        </div>
                                    ) : (
                                        <div className="min-w-0 text-[14px] leading-relaxed text-zinc-300">{item}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {ctaHref && ctaLabel ? (
                        <div className="pt-2">
                            <GradientButton href={ctaHref} secondary={newTab} newTab={newTab}>
                                {ctaLabel}
                                <ArrowUpRight className="h-4 w-4 text-[#7AD9DA]" />
                            </GradientButton>
                        </div>
                    ) : null}
                </div>

                <div className={`relative z-0 min-w-0 ${reverse ? 'lg:order-1' : ''}`}>
                    <LazyVideoFrame
                        src={reason.videoSrc}
                        title={videoTitle}
                        posterSrc={reason.posterSrc}
                        chromeLabel={reason.frameLabel}
                        chromeMeta={reason.frameMeta}
                        className="w-full shadow-[0_34px_100px_rgba(0,0,0,0.4)]"
                        videoClassName={`object-contain ${reason.videoClassName || ''}`}
                    >
                        <VideoFallback
                            icon={icon}
                            eyebrow={fallbackEyebrow}
                            title={videoTitle}
                            posterSrc={reason.posterSrc}
                            number={reason.number}
                        />
                    </LazyVideoFrame>
                </div>
            </div>
        </article>
    );
}

function XLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

function RedditLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M24 11.779c0-1.459-1.192-2.645-2.657-2.645-.715 0-1.363.286-1.84.746-1.81-1.191-4.259-1.949-6.971-2.046l1.483-4.669 4.016.941-.006.058c0 1.193.975 2.163 2.174 2.163 1.198 0 2.172-.97 2.172-2.163s-.975-2.164-2.172-2.164c-.92 0-1.704.574-2.021 1.379l-4.329-1.015c-.189-.046-.381.063-.44.249l-1.654 5.207c-2.838.034-5.409.798-7.3 2.025-.474-.438-1.103-.712-1.799-.712-1.465 0-2.656 1.187-2.656 2.646 0 .97.533 1.811 1.317 2.271-.052.282-.086.567-.086.857 0 3.911 4.808 7.093 10.719 7.093s10.72-3.182 10.72-7.093c0-.274-.029-.544-.075-.81.832-.447 1.405-1.312 1.405-2.318zm-17.224 1.816c0-.868.71-1.575 1.582-1.575.872 0 1.581.707 1.581 1.575s-.709 1.574-1.581 1.574-1.582-.706-1.582-1.574zm9.061 4.669c-1.25.864-2.909 1.107-5.111 1.107-2.203 0-3.864-.247-5.11-1.107-.245-.168-.309-.499-.143-.746.166-.247.497-.311.744-.143 1.05.72 2.503.957 4.509.957 2.008 0 3.46-.237 4.512-.957.247-.168.579-.104.745.143.167.245.103.578-.146.746zm-2.02-3.095c-.872 0-1.582-.706-1.582-1.574 0-.868.709-1.575 1.582-1.575s1.581.707 1.581 1.575c0 .868-.709 1.574-1.581 1.574z" />
        </svg>
    );
}

function MentionReasonCard({ card }: { card: HomepageCompactReason & { kind: 'mention' } }) {
    const isX = card.icon === 'x';
    const isReddit = card.icon === 'reddit';

    return (
        <article className="flex h-full flex-col items-center overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#020202] p-5 text-center shadow-[0_34px_90px_rgba(0,0,0,0.6)] sm:p-8">
            <div className="mb-5 sm:mb-6">
                {isX && <XLogo className="h-10 w-10 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />}
                {isReddit && <RedditLogo className="h-11 w-11 text-[#ff4500] drop-shadow-[0_0_16px_rgba(255,69,0,0.4)]" />}
            </div>

            <h3 className="mb-4 text-balance text-[1.9rem] font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                {card.title}
            </h3>
            
            <p className="mb-8 text-balance text-[15px] leading-relaxed text-zinc-400 sm:mb-10">
                {card.description}
            </p>

            <div className="relative mb-8 w-full overflow-hidden rounded-[20px] border border-white/[0.04] bg-[#050505] shadow-[0_20px_60px_rgba(0,0,0,0.8)] sm:mb-10">
                <Image
                    src={card.imageSrc}
                    alt={card.title}
                    width={1000}
                    height={700}
                    className="w-full h-auto object-cover"
                />
            </div>

            <div className="mt-auto flex w-full flex-col items-center gap-4">
                <GoogleAuthButton
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-semibold transition-all sm:w-auto hover:scale-105 ${
                        isX
                            ? 'bg-[#14C4E1]/15 text-[#7AD9DA] shadow-[0_0_24px_rgba(20,196,225,0.3)] hover:bg-[#14C4E1]/25'
                            : 'bg-[#b63013] text-[#ffebe5] shadow-[0_0_24px_rgba(182,48,19,0.5)] hover:bg-[#d83c18]'
                    }`}
                >
                    {card.buttonLabel}
                    <span>&rarr;</span>
                </GoogleAuthButton>

                <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.15em] text-zinc-500">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    No-code embed
                </div>
            </div>
        </article>
    );
}

function SeoReasonCard({ card }: { card: HomepageCompactReason & { kind: 'seo' } }) {
    return (
        <article className="relative flex w-full flex-col overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,rgba(12,14,16,0.95),rgba(4,5,6,1))] border border-white/[0.06] shadow-[0_44px_100px_rgba(0,0,0,0.8)] p-6 sm:p-10 lg:flex-row lg:items-center lg:gap-16 lg:p-12">
            
            <div className="absolute -left-[20%] top-[10%] -z-10 h-[600px] w-[600px] bg-[radial-gradient(circle_at_center,rgba(20,196,225,0.12),transparent_60%)] blur-3xl pointer-events-none" />

            <div className="relative z-10 min-w-0 w-full text-left lg:w-[45%]">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7AD9DA]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {card.eyebrow}
                </div>
                
                <h3 className="mb-6 text-balance text-[2rem] font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-[44px] lg:leading-[1.1]">
                    {card.title}
                </h3>
                
                <p className="mb-10 text-[16px] leading-relaxed text-zinc-400">
                    {card.description}
                </p>

                <div className="mb-10 flex flex-wrap gap-2">
                    {card.chips.map((chip) => (
                        <span key={chip} className="rounded-full border border-white/[0.06] bg-[#0A0D10]/50 px-4 py-2 text-xs font-medium text-zinc-300">
                            {chip}
                        </span>
                    ))}
                </div>

                {'href' in card && 'ctaLabel' in card ? (
                    <GoogleAuthButton className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-center text-sm font-semibold text-[#031017] transition-all duration-200 hover:brightness-105 sm:w-auto">
                        {card.ctaLabel}
                        <ArrowRight className="h-4 w-4" />
                    </GoogleAuthButton>
                ) : null}
            </div>

            <div className="relative z-10 mt-10 min-w-0 w-full lg:mt-0 lg:w-[55%]">
                <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0A0D10]/80 shadow-[inset_0_1px_rgba(255,255,255,0.1),0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                    
                    <div 
                        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} 
                    />

                    <div className="relative z-10 p-2 sm:p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-[20px] border border-white/[0.04] bg-black/60 px-3 py-3 sm:px-5 sm:py-4">
                            <div className="flex gap-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-black/20" />
                                <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-black/20" />
                                <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-black/20" />
                            </div>
                            <div className="min-w-0 flex items-center gap-2">
                                <span className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-[#8EE68E]">{card.previewLabel}</span>
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8EE68E] shadow-[0_0_8px_rgba(142,230,142,0.8)]" />
                            </div>
                        </div>

                        <div className="relative bg-black/40 p-4 sm:p-5 rounded-b-[20px] border-x border-b border-white/[0.04]">
                            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 mt-4">
                                {card.features?.map((feature, index) => {
                                    const Icon = SEO_FEATURE_ICONS[feature.iconType] ?? Bot;

                                    return (
                                        <div
                                            key={index}
                                            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#12161A] to-[#0A0D10] p-3.5 shadow-[inset_0_1px_rgba(255,255,255,0.05),0_4px_20px_rgba(0,0,0,0.5)] transition-all duration-500 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-[0_12px_40px_rgba(20,196,225,0.15)] hover:from-[#181D22] hover:to-[#0A0D10] cursor-pointer"
                                        >
                                            <div className="absolute inset-0 z-[-1] opacity-0 transition-opacity duration-700 group-hover:opacity-100 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.05),transparent_60%)] pointer-events-none" />

                                            <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.1] shadow-xl ${feature.iconBg} bg-[#050608]`}>
                                                <div className="absolute inset-0 rounded-[14px] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                                                <Icon className={`h-5 w-5 ${feature.iconColor} drop-shadow-[0_0_8px_currentColor] group-hover:scale-110 transition-transform duration-300`} />
                                            </div>

                                            <div className="min-w-0 flex flex-col gap-0.5">
                                                <h4 className="text-[14px] font-bold tracking-wide text-white group-hover:text-[#14C4E1] transition-colors">{feature.label}</h4>
                                                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500 opacity-60">
                                                    SEO Tool
                                                </span>
                                            </div>
                                            
                                            <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1">
                                                <ArrowRight className="h-4 w-4 text-[#14C4E1]" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="absolute left-1/2 top-1/2 -z-10 h-full w-full -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,#14C4E1_0%,transparent_60%)] opacity-20 blur-[80px] pointer-events-none" />
            </div>
        </article>
    );
}

function CompactReasonCard({ card }: { card: HomepageCompactReason }) {
    if (card.kind === 'mention') {
        return <MentionReasonCard card={card} />;
    }
    return <SeoReasonCard card={card} />;
}

function ProofCard({ card }: { card: HomepageProofCard }) {
    return (
        <article className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,10,12,0.98),rgba(5,5,6,1))] shadow-[0_34px_90px_rgba(0,0,0,0.4)]">
            <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.06] bg-white">
                <Image
                    src={card.imageSrc}
                    alt={card.site}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain object-top p-2"
                />
            </div>
            <div className="space-y-4 p-6">
                <div className="inline-flex rounded-full border border-[#14C4E1]/20 bg-[#07131d] px-3 py-1.5 text-xs font-semibold text-[#dff9ff]">
                    {card.metric}
                </div>
                <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">{card.site}</h3>
                <p className="text-sm leading-7 text-zinc-400">{card.caption}</p>
            </div>
        </article>
    );
}

export default function LandingHomepage() {
    return (
        <div className="relative overflow-x-clip bg-[#010101] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_18%),linear-gradient(180deg,#030303_0%,#010101_24%,#000000_100%)]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 18% 16%, rgba(255,255,255,0.26) 0 1px, transparent 1.5px), radial-gradient(circle at 72% 24%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 58% 62%, rgba(255,255,255,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 86% 52%, rgba(255,255,255,0.16) 0 1px, transparent 1.5px)',
                    backgroundSize: '320px 320px, 420px 420px, 520px 520px, 640px 640px',
                }}
            />

            <section id="dashboard" className="relative overflow-hidden border-b border-white/[0.06]">
                <div className="absolute inset-0 hidden lg:block">
                    <HeroGalaxy />
                </div>

                <div className="relative mx-auto max-w-[1380px] px-4 pb-14 pt-24 sm:px-6 sm:pb-20 sm:pt-28 lg:px-8 lg:pb-24 lg:pt-36">
                    <div className="mx-auto max-w-[1040px] text-center">
                        <h1 className="text-[2.8rem] font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-[5.9rem] lg:leading-[0.94]">
                            {HOMEPAGE_CONTENT.hero.title}
                        </h1>
                    </div>

                    <div className="mx-auto mt-8 max-w-[1280px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] p-2 shadow-[0_44px_140px_rgba(0,0,0,0.54)] sm:mt-10 sm:rounded-[34px] sm:p-3">
                        <div className="rounded-[28px] border border-white/[0.08] bg-[#030406]">
                            <div className="flex items-center border-b border-white/[0.06] px-3 py-3 sm:px-4">
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#14C4E1]/60" />
                                </div>
                            </div>

                            <DeferredEmbed
                                src={HOMEPAGE_CONTENT.analyticsEmbedUrl}
                                title="TrafficClaw shared analytics dashboard"
                                mountStrategy="idle"
                                className="h-[300px] min-[420px]:h-[360px] sm:h-[520px] lg:h-[760px]"
                            >
                                <HeroFrameFallback />
                            </DeferredEmbed>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <GoogleAuthButton
                            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-center text-sm font-semibold text-[#031017] transition-all duration-200 hover:brightness-105 sm:w-auto"
                        >
                            {HOMEPAGE_CONTENT.hero.primaryCta}
                            <ArrowRight className="h-4 w-4" />
                        </GoogleAuthButton>
                        <GradientButton href={HOMEPAGE_CONTENT.analyticsEmbedUrl} secondary newTab>
                            {HOMEPAGE_CONTENT.hero.secondaryCta}
                            <ArrowUpRight className="h-4 w-4 text-[#7AD9DA]" />
                        </GradientButton>
                    </div>
                </div>
            </section>

            <section id="why-trafficclaw" className="relative border-t border-white/[0.06]">
                <div className="mx-auto max-w-[1380px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
                    <div className="mx-auto max-w-[980px] text-center">
                        <SectionLabel>{HOMEPAGE_CONTENT.reasonsIntro.eyebrow}</SectionLabel>
                        <h2 className="mt-5 text-[2.2rem] font-semibold tracking-[-0.06em] text-white sm:text-5xl lg:text-[4.2rem] lg:leading-[0.98]">
                            {HOMEPAGE_CONTENT.reasonsIntro.title}
                        </h2>
                        <p className="mt-5 text-base leading-7 text-[#d8dde6] sm:text-lg sm:leading-8">
                            {HOMEPAGE_CONTENT.reasonsIntro.description}
                        </p>
                        <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                            {HOMEPAGE_CONTENT.reasonsIntro.supportingCopy}
                        </p>

                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            {HOMEPAGE_CONTENT.reasonsIntro.checkpoints.map((checkpoint) => (
                                <span
                                    key={checkpoint}
                                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-zinc-300"
                                >
                                    {checkpoint}
                                </span>
                            ))}
                        </div>
                    </div>

                    <JourneyLine>
                        <JourneyNode number={1}>
                            <FeaturedReasonCard
                                reason={HOMEPAGE_CONTENT.aiChat}
                                icon={<Bot className="h-4 w-4" />}
                                videoTitle="TrafficClaw AI chat demo"
                                fallbackEyebrow="AI chat"
                                id="ai-chat"
                            />
                        </JourneyNode>

                        <JourneyNode number={2}>
                            <FeaturedReasonCard
                                reason={HOMEPAGE_CONTENT.globe}
                                icon={<Globe className="h-4 w-4" />}
                                videoTitle="TrafficClaw realtime globe demo"
                                fallbackEyebrow="Live globe"
                                id="globe"
                                reverse
                                ctaHref={HOMEPAGE_CONTENT.globe.demoHref}
                                ctaLabel={HOMEPAGE_CONTENT.globe.ctaLabel}
                                newTab
                            />
                        </JourneyNode>
                    </JourneyLine>

                    <div id="mentions" className="mt-10 grid gap-4 sm:gap-6 lg:grid-cols-2">
                        {HOMEPAGE_CONTENT.compactReasons.map((card) => (
                            <div key={card.number} className={card.kind === 'seo' ? 'lg:col-span-2' : ''}>
                                <CompactReasonCard card={card} />
                            </div>
                        ))}
                    </div>

                    <div
                        id="proof"
                        className="mt-12 overflow-hidden rounded-[36px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.08),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-5 lg:p-6"
                    >
                        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start xl:gap-10">
                            <div className="space-y-6 rounded-[30px] border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="inline-flex items-center rounded-full border border-[#14C4E1]/22 bg-[#06131d] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#dff9ff]">
                                        {HOMEPAGE_CONTENT.proof.number}
                                    </span>
                                    <SectionLabel>{HOMEPAGE_CONTENT.proof.eyebrow}</SectionLabel>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                                        {HOMEPAGE_CONTENT.proof.title}
                                    </h3>
                                    <p className="text-base leading-7 text-zinc-400">
                                        {HOMEPAGE_CONTENT.proof.description}
                                    </p>
                                </div>

                                <div className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-5">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#dff9ff]">
                                        <Sparkles className="h-3.5 w-3.5 text-[#7AD9DA]" />
                                        Switch message
                                    </div>
                                    <h4 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">
                                        {HOMEPAGE_CONTENT.cta.title}
                                    </h4>
                                    <p className="mt-3 text-sm leading-7 text-zinc-400">
                                        {HOMEPAGE_CONTENT.cta.description}
                                    </p>
                                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                        <GoogleAuthButton
                                            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-[#14C4E1]/28 bg-[linear-gradient(135deg,#14C4E1_0%,#7AD9DA_100%)] px-5 text-center text-sm font-semibold text-[#031017] transition-all duration-200 hover:brightness-105 sm:w-auto"
                                        >
                                            Start free
                                            <ArrowRight className="h-4 w-4" />
                                        </GoogleAuthButton>
                                        <GradientButton href={HOMEPAGE_CONTENT.analyticsEmbedUrl} secondary newTab>
                                            Open live dashboard
                                            <ArrowUpRight className="h-4 w-4 text-[#7AD9DA]" />
                                        </GradientButton>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-6 lg:grid-cols-2">
                                {HOMEPAGE_CONTENT.proofCards.map((card) => (
                                    <ProofCard key={card.site} card={card} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="relative border-t border-white/[0.06]">
                <BadgeMarquee />
                <div className="mx-auto flex max-w-[1380px] flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center lg:px-8">
                    <div className="flex items-center gap-3">
                        <Image src="/icon.svg" alt="TrafficClaw" width={28} height={28} className="rounded-lg" />
                        <span>
                            Traffic<span className="text-[#7AD9DA]">Claw</span>
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-5">
                        <Link href="/pricing" className="transition hover:text-white">Pricing</Link>
                        <Link href="/contact" className="transition hover:text-white">Contact</Link>
                        <Link href="/features" className="transition hover:text-white">Features</Link>
                        <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
