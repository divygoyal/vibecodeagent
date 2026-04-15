import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    ArrowRight,
    ArrowUpRight,
    Bot,
    Code2,
    Globe,
    Sparkles,
} from 'lucide-react';

import DeferredEmbed from './DeferredEmbed';
import HeroGalaxy from './HeroGalaxy';
import LazyVideoFrame from './LazyVideoFrame';
import {
    HOMEPAGE_CONTENT,
    MARKETING_SIGN_IN_URL,
    type HomepageCompactReason,
    type HomepageProofCard,
} from './content';

type FeaturedReason = {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    videoSrc: string;
    posterSrc?: string;
    frameLabel: string;
    frameMeta: string;
    highlights: readonly string[];
};

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
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all duration-200 ${className}`}
        >
            {children}
        </Link>
    );
}

function HeroFrameFallback() {
    return (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_32%),linear-gradient(180deg,#050608_0%,#020305_45%,#010101_100%)]">
            <div className="absolute inset-x-5 top-5 h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03]" />
            <div className="absolute bottom-5 left-5 right-[34%] top-24 rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]" />
            <div className="absolute right-5 top-24 bottom-[44%] w-[28%] rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
            <div className="absolute right-5 bottom-5 top-[62%] w-[28%] rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
            <div className="absolute left-10 top-36 flex items-end gap-2">
                {[0, 1, 2, 3, 4].map((bar) => (
                    <div
                        key={bar}
                        className="w-12 rounded-full bg-[linear-gradient(180deg,rgba(20,196,225,0.85),rgba(255,255,255,0.24))]"
                        style={{ height: `${80 + bar * 22}px` }}
                    />
                ))}
            </div>
            <div className="absolute bottom-12 left-10 right-[39%] h-20 rounded-[24px] border border-white/[0.06] bg-white/[0.02]" />
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
                className={`grid gap-8 lg:items-center xl:gap-10 ${reverse ? 'lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]' : 'lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]'}`}
            >
                <div className={`space-y-6 ${reverse ? 'lg:order-2' : ''}`}>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full border border-[#14C4E1]/22 bg-[#06131d] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#dff9ff]">
                            Reason {reason.number}
                        </span>
                        <SectionLabel>{reason.eyebrow}</SectionLabel>
                    </div>

                    <div className="space-y-4">
                        <h3 className="max-w-[12ch] text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl lg:text-[3.2rem] lg:leading-[1.02]">
                            {reason.title}
                        </h3>
                        <p className="max-w-2xl text-base leading-7 text-zinc-400">{reason.description}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {reason.highlights.map((item) => (
                            <div
                                key={item}
                                className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] px-4 py-4 text-sm leading-6 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                            >
                                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#09131b] text-[#7AD9DA]">
                                    {icon}
                                </div>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>

                    {ctaHref && ctaLabel ? (
                        <GradientButton href={ctaHref} secondary={newTab} newTab={newTab}>
                            {ctaLabel}
                            <ArrowUpRight className="h-4 w-4 text-[#7AD9DA]" />
                        </GradientButton>
                    ) : null}
                </div>

                <div className={reverse ? 'lg:order-1' : ''}>
                    <LazyVideoFrame
                        src={reason.videoSrc}
                        title={videoTitle}
                        posterSrc={reason.posterSrc}
                        chromeLabel={reason.frameLabel}
                        chromeMeta={reason.frameMeta}
                        className="h-[380px] sm:h-[440px] lg:h-[560px]"
                        videoClassName="object-contain"
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

function CompactReasonCard({ card }: { card: HomepageCompactReason }) {
    return (
        <article className="flex h-full flex-col overflow-hidden rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,10,12,0.98),rgba(4,5,6,1))] p-5 shadow-[0_34px_90px_rgba(0,0,0,0.4)] sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-[#14C4E1]/22 bg-[#06131d] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#dff9ff]">
                    Reason {card.number}
                </span>
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#7AD9DA]">{card.eyebrow}</span>
            </div>

            <div className="mt-5 space-y-3">
                <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">{card.title}</h3>
                <p className="text-sm leading-7 text-zinc-400">{card.description}</p>
            </div>

            {card.kind === 'dashboard' ? (
                <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">{card.previewLabel}</span>
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#dff9ff]">
                            Live
                        </span>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#05070a] px-4 py-3 font-mono text-xs text-[#dff9ff]">
                        {card.previewValue}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {['Traffic', 'Pages', 'Realtime'].map((label, index) => (
                            <div
                                key={label}
                                className="rounded-2xl border border-white/[0.08] bg-black/35 p-3"
                            >
                                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                                <div className="mt-3 h-16 rounded-[18px] bg-[linear-gradient(180deg,rgba(20,196,225,0.18),rgba(255,255,255,0.03))]" />
                                <div
                                    className="mt-3 h-1.5 rounded-full bg-[#14C4E1]/55"
                                    style={{ width: `${68 + index * 12}%` }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-6 space-y-4">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#020202]">
                        <Image
                            src={card.imageSrc}
                            alt={card.title}
                            fill
                            sizes="(max-width: 1024px) 100vw, 33vw"
                            className="object-contain object-top"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_56%,rgba(0,0,0,0.52)_100%)]" />
                    </div>

                    <div className="rounded-[24px] border border-white/[0.08] bg-black/45 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Code2 className="h-4 w-4 text-[#7AD9DA]" />
                            <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">{card.previewLabel}</span>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#05070a] px-4 py-3 font-mono text-xs text-[#dff9ff]">
                            {card.previewValue}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
                {card.chips.map((chip) => (
                    <span
                        key={chip}
                        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300"
                    >
                        {chip}
                    </span>
                ))}
            </div>

            {card.kind === 'dashboard' ? (
                <div className="mt-6">
                    <GradientButton href={card.href} secondary newTab>
                        {card.ctaLabel}
                        <ArrowUpRight className="h-4 w-4 text-[#7AD9DA]" />
                    </GradientButton>
                </div>
            ) : null}
        </article>
    );
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
        <div className="relative overflow-hidden bg-[#010101] text-white">
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

                <div className="relative mx-auto max-w-[1380px] px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24 lg:pt-36">
                    <div className="mx-auto max-w-[1040px] text-center">
                        <h1 className="text-5xl font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-[5.9rem] lg:leading-[0.94]">
                            {HOMEPAGE_CONTENT.hero.title}
                        </h1>
                    </div>

                    <div className="mx-auto mt-10 max-w-[1280px] overflow-hidden rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] p-3 shadow-[0_44px_140px_rgba(0,0,0,0.54)]">
                        <div className="rounded-[28px] border border-white/[0.08] bg-[#030406]">
                            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#14C4E1]/60" />
                                </div>
                                <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-400">
                                    {HOMEPAGE_CONTENT.analyticsDisplayUrl}
                                </div>
                            </div>

                            <DeferredEmbed
                                src={HOMEPAGE_CONTENT.analyticsEmbedUrl}
                                title="TrafficClaw shared analytics dashboard"
                                mountStrategy="idle"
                                interactive={false}
                                openHref={HOMEPAGE_CONTENT.analyticsEmbedUrl}
                                openLabel="Open live dashboard"
                                className="h-[400px] sm:h-[520px] lg:h-[760px]"
                            >
                                <HeroFrameFallback />
                            </DeferredEmbed>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <GradientButton href={MARKETING_SIGN_IN_URL}>
                            {HOMEPAGE_CONTENT.hero.primaryCta}
                            <ArrowRight className="h-4 w-4" />
                        </GradientButton>
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
                        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl lg:text-[4.2rem] lg:leading-[0.98]">
                            {HOMEPAGE_CONTENT.reasonsIntro.title}
                        </h2>
                        <p className="mt-5 text-lg leading-8 text-[#d8dde6]">
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

                    <div className="mt-14 space-y-8 lg:space-y-10">
                        <FeaturedReasonCard
                            reason={HOMEPAGE_CONTENT.aiChat}
                            icon={<Bot className="h-4 w-4" />}
                            videoTitle="TrafficClaw AI chat demo"
                            fallbackEyebrow="AI chat"
                            id="ai-chat"
                        />

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
                    </div>

                    <div id="mentions" className="mt-10 grid gap-6 lg:grid-cols-3">
                        {HOMEPAGE_CONTENT.compactReasons.map((card) => (
                            <CompactReasonCard key={card.number} card={card} />
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
                                        <GradientButton href={MARKETING_SIGN_IN_URL}>
                                            Start free
                                            <ArrowRight className="h-4 w-4" />
                                        </GradientButton>
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
