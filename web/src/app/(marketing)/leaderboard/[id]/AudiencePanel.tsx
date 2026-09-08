'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ShieldCheck, Users, Search, FileText, Monitor, Smartphone, Tablet,
    MapPin, Compass, BookOpen, Tag, UserRound, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
    leadShare,
    type AudienceIntelligence,
    type AudienceShare,
    type AudienceCountry,
    type AudiencePage,
    type AudienceQuery,
    type AudienceTopic,
    type AudienceDemographics,
} from '@/lib/audienceTypes';
import { SectionLabel, formatNumber, type StartupProfileData } from './StartupProfileClient';

/* ───────────────────────────────────────────────────────────────────
 * Audience intelligence
 *
 * Who visits the site, from verified GA4 (+ GSC when a property matched).
 * Sits directly above the ad slots so a buyer can answer "is this audience
 * mine?" before reading the publisher's prices. Nothing here feeds pricing —
 * every number is a share of the 28-day window, shown as-is.
 *
 * Renders nothing when `audience` is null or every section inside it is
 * null/empty. Each section likewise renders only when it has data.
 * ──────────────────────────────────────────────────────────────────── */

const QUERY_PREVIEW_COUNT = 10;
const MAX_PAGES = 8;

/* ── helpers ─────────────────────────────────────────────────────── */

function flagEmoji(iso2: string | undefined): string {
    if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return '';
    return String.fromCodePoint(
        ...iso2.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

/** Shares are 0–100. Whole numbers ≥10, one decimal below (9.4%). */
function formatShare(share: number): string {
    if (!Number.isFinite(share)) return '0';
    if (share >= 10) return String(Math.round(share));
    return share.toFixed(1).replace(/\.0$/, '');
}

/**
 * The cron writes naive ISO timestamps (no Z / offset). Treat those as UTC
 * rather than letting the browser read them in local time.
 */
function parseRefreshedAt(iso: string | null): Date | null {
    if (!iso) return null;
    const naive = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso);
    const d = new Date(naive ? `${iso}Z` : iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function relativeTime(date: Date): string {
    const diffMs = date.getTime() - Date.now();
    const abs = Math.abs(diffMs);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (abs < minute) return 'just now';
    if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
    if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
    if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sortByShare<T extends { share: number }>(items: T[]): T[] {
    return items.slice().sort((a, b) => b.share - a.share);
}

function nonEmpty<T>(items: T[] | null | undefined): items is T[] {
    return Array.isArray(items) && items.length > 0;
}

function hasAnyData(a: AudienceIntelligence): boolean {
    return (
        nonEmpty(a.topics) ||
        nonEmpty(a.countries) ||
        nonEmpty(a.cities) ||
        nonEmpty(a.channels) ||
        nonEmpty(a.devices) ||
        nonEmpty(a.top_pages) ||
        nonEmpty(a.top_queries) ||
        (a.demographics !== null && (nonEmpty(a.demographics.age) || nonEmpty(a.demographics.gender)))
    );
}

function joinUrl(base: string | null, path: string): string | null {
    if (!base) return null;
    try {
        const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
        return new URL(path, withScheme).toString();
    } catch {
        return null;
    }
}

/* ── primitives ──────────────────────────────────────────────────── */

/** Thin horizontal meter. `value` is 0–100 of the track width; `label` is what a screen reader hears. */
function Bar({
    value,
    label,
    className = 'bg-[#14C4E1]/70',
    height = 'h-1.5',
}: {
    value: number;
    label: string;
    className?: string;
    height?: string;
}) {
    const reduce = useReducedMotion();
    const width = `${Math.max(0, Math.min(100, value))}%`;
    return (
        <div
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            className={`w-full overflow-hidden rounded-full bg-white/[0.05] ${height}`}
        >
            <motion.div
                className={`h-full rounded-full ${className}`}
                initial={reduce ? false : { width: 0 }}
                animate={{ width }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
            />
        </div>
    );
}

function SubSection({
    icon,
    title,
    children,
    className = '',
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 ${className}`}>
            <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[#7AD9DA]">
                    {icon}
                </span>
                {title}
            </h3>
            <div className="mt-4">{children}</div>
        </div>
    );
}

/** name · bar · % — the row shape used by countries, cities and demographics. */
function ShareRow({
    name,
    share,
    max,
    prefix,
    barClass,
}: {
    name: string;
    share: number;
    max: number;
    prefix?: React.ReactNode;
    barClass?: string;
}) {
    return (
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-200">
                {prefix}
                <span className="truncate">{name}</span>
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-white">{formatShare(share)}%</span>
            <div className="col-span-2">
                <Bar value={max > 0 ? (share / max) * 100 : 0} label={`${name}: ${formatShare(share)}% of visitors`} className={barClass} />
            </div>
        </li>
    );
}

/* ── sections ────────────────────────────────────────────────────── */

function TopicsSection({ topics }: { topics: AudienceTopic[] }) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const sorted = sortByShare(topics);
    const open = openIndex !== null ? sorted[openIndex] : null;

    return (
        <SubSection icon={<Tag className="h-3 w-3" />} title="What this audience is here for">
            <ul className="flex flex-wrap gap-2">
                {sorted.map((topic, i) => {
                    const isOpen = openIndex === i;
                    return (
                        <li key={topic.label}>
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={isOpen ? `audience-topic-${i}` : undefined}
                                title={topic.evidence.join(' · ')}
                                onClick={() => setOpenIndex(isOpen ? null : i)}
                                className={`group relative overflow-hidden rounded-xl border px-3.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14C4E1]/50 ${
                                    isOpen
                                        ? 'border-[#14C4E1]/35 bg-[#14C4E1]/10'
                                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="text-[13px] font-medium text-white">{topic.label}</span>
                                    <span className="text-[12px] font-semibold tabular-nums text-[#7AD9DA]">{formatShare(topic.share)}%</span>
                                </span>
                                <span className="mt-1.5 block">
                                    <Bar
                                        value={topic.share}
                                        label={`${topic.label}: ${formatShare(topic.share)}% of search-driven visits`}
                                        height="h-1"
                                        className="bg-gradient-to-r from-[#14C4E1] to-[#7AD9DA]"
                                    />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {open ? (
                <div
                    id={`audience-topic-${openIndex}`}
                    className="mt-3 rounded-xl border border-white/[0.06] bg-[#04070d]/70 px-3.5 py-3"
                >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Evidence · {open.label}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                        {open.evidence.map((item) => {
                            const isPath = item.startsWith('/');
                            return (
                                <li key={item} className="flex items-center gap-2 font-mono text-[12px] text-zinc-400">
                                    {isPath ? (
                                        <FileText className="h-3 w-3 flex-shrink-0 text-zinc-600" aria-label="Page path" />
                                    ) : (
                                        <Search className="h-3 w-3 flex-shrink-0 text-zinc-600" aria-label="Search query" />
                                    )}
                                    <span className="truncate">{item}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <p className="mt-3 text-[11px] text-zinc-600">Select a topic to see the queries and pages behind it.</p>
            )}
        </SubSection>
    );
}

function GeoSection({ countries, cities }: { countries: AudienceCountry[] | null; cities: AudienceShare[] | null }) {
    const hasCountries = nonEmpty(countries);
    const hasCities = nonEmpty(cities);
    if (!hasCountries && !hasCities) return null;

    const sortedCountries = hasCountries
        ? countries.slice().sort((a, b) => {
            // Keep the "Other" bucket last regardless of its size.
            if (!a.iso2 && b.iso2) return 1;
            if (a.iso2 && !b.iso2) return -1;
            return b.share - a.share;
        })
        : [];
    const maxCountry = sortedCountries.reduce((m, c) => Math.max(m, c.share), 0);
    const sortedCities = hasCities ? sortByShare(cities) : [];

    return (
        <SubSection icon={<MapPin className="h-3 w-3" />} title="Where they are">
            <div className={`grid gap-6 ${hasCountries && hasCities ? 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
                {hasCountries && (
                    <ul className="space-y-3">
                        {sortedCountries.map((c) => (
                            <ShareRow
                                key={c.name}
                                name={c.name}
                                share={c.share}
                                max={maxCountry}
                                barClass={c.iso2 ? undefined : 'bg-zinc-500/50'}
                                prefix={
                                    c.iso2 ? (
                                        <span className="text-base leading-none" aria-hidden="true">{flagEmoji(c.iso2)}</span>
                                    ) : undefined
                                }
                            />
                        ))}
                    </ul>
                )}
                {hasCities && (
                    <div className={hasCountries ? 'md:border-l md:border-white/[0.06] md:pl-6' : ''}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Top cities</p>
                        <ol className="mt-3 space-y-1.5">
                            {sortedCities.map((city, i) => (
                                <li
                                    key={city.name}
                                    className="flex items-center justify-between border-b border-white/[0.04] py-1.5 text-[13px] last:border-b-0"
                                >
                                    <span className="flex items-center gap-2.5 text-zinc-200">
                                        <span className="w-4 text-right font-mono text-[11px] text-zinc-600">{i + 1}</span>
                                        {city.name}
                                    </span>
                                    <span className="font-semibold tabular-nums text-white">{formatShare(city.share)}%</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>
        </SubSection>
    );
}

const CHANNEL_HUES: Record<string, string> = {
    'organic search': '#14C4E1',
    'direct': '#a78bfa',
    'referral': '#fbbf24',
    'organic social': '#f472b6',
    'paid search': '#34d399',
    'paid social': '#fb7185',
    'email': '#60a5fa',
    'organic video': '#f97316',
    'display': '#c084fc',
    'affiliates': '#2dd4bf',
    'unassigned': '#71717a',
};
const FALLBACK_HUES = ['#14C4E1', '#a78bfa', '#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#fb7185', '#71717a'];

function channelHue(name: string, index: number): string {
    return CHANNEL_HUES[name.toLowerCase()] || FALLBACK_HUES[index % FALLBACK_HUES.length];
}

function ChannelsSection({ channels }: { channels: AudienceShare[] }) {
    const reduce = useReducedMotion();
    const sorted = sortByShare(channels);
    const total = sorted.reduce((sum, c) => sum + c.share, 0) || 1;
    const lead = leadShare(sorted);

    return (
        <SubSection icon={<Compass className="h-3 w-3" />} title="How they arrive">
            <div
                role="img"
                aria-label={`Traffic channels: ${sorted.map((c) => `${c.name} ${formatShare(c.share)}%`).join(', ')}`}
                className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-white/[0.04]"
            >
                {sorted.map((c, i) => (
                    <motion.div
                        key={c.name}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ backgroundColor: channelHue(c.name, i), opacity: 0.85 }}
                        initial={reduce ? false : { flexBasis: '0%' }}
                        animate={{ flexBasis: `${(c.share / total) * 100}%` }}
                        transition={{ duration: 0.7, ease: 'easeOut', delay: reduce ? 0 : i * 0.05 }}
                    />
                ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {sorted.map((c, i) => (
                    <li key={c.name} className="flex items-center gap-2 text-[12px] text-zinc-400">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: channelHue(c.name, i) }} aria-hidden="true" />
                        {c.name}
                        <span className="font-semibold tabular-nums text-zinc-200">{formatShare(c.share)}%</span>
                    </li>
                ))}
            </ul>
            {lead && (
                <p className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-white">
                    {formatShare(lead.share)}% arrive from {lead.name.toLowerCase()}
                </p>
            )}
        </SubSection>
    );
}

function deviceIcon(name: string) {
    const key = name.toLowerCase();
    if (key.includes('mobile') || key.includes('phone')) return <Smartphone className="h-4 w-4 text-[#7AD9DA]" />;
    if (key.includes('tablet')) return <Tablet className="h-4 w-4 text-[#7AD9DA]" />;
    return <Monitor className="h-4 w-4 text-[#7AD9DA]" />;
}

function DevicesSection({ devices }: { devices: AudienceShare[] }) {
    const sorted = sortByShare(devices);
    return (
        <SubSection icon={<Monitor className="h-3 w-3" />} title="Devices">
            {/* Rows on phones, tiles from `sm` up — the uppercase label won't fit a third of 390px. */}
            <div className={`grid grid-cols-1 gap-3 ${sorted.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                {sorted.map((d) => (
                    <div
                        key={d.name}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(10,14,20,0.96),rgba(4,7,11,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:block"
                    >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                            {deviceIcon(d.name)}
                        </span>
                        <div className="min-w-0 flex-1 sm:mt-2.5">
                            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{d.name}</div>
                            <div className="mt-0.5 text-[1.45rem] font-semibold tracking-[-0.04em] text-white sm:mt-1">
                                {formatShare(d.share)}%
                            </div>
                            <div className="mt-2">
                                <Bar value={d.share} label={`${d.name}: ${formatShare(d.share)}% of visitors`} height="h-1" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </SubSection>
    );
}

function PagesSection({ pages, websiteUrl }: { pages: AudiencePage[]; websiteUrl: string | null }) {
    const ranked = pages.slice().sort((a, b) => b.views - a.views).slice(0, MAX_PAGES);
    const max = ranked.reduce((m, p) => Math.max(m, p.share), 0);

    return (
        <SubSection icon={<BookOpen className="h-3 w-3" />} title="What they read">
            <ol className="space-y-3">
                {ranked.map((p, i) => {
                    const href = joinUrl(websiteUrl, p.path);
                    const pathEl = (
                        <span className="truncate font-mono text-[12px] text-zinc-200 group-hover:text-white">{p.path}</span>
                    );
                    return (
                        <li key={p.path} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                            <span className="w-4 text-right font-mono text-[11px] text-zinc-600">{i + 1}</span>
                            {href ? (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="group flex min-w-0 items-center transition hover:underline decoration-white/20 underline-offset-4"
                                >
                                    {pathEl}
                                </a>
                            ) : (
                                <span className="flex min-w-0 items-center">{pathEl}</span>
                            )}
                            <span className="text-[12px] tabular-nums text-zinc-400">
                                <span className="font-semibold text-white">{formatNumber(p.views)}</span> views
                            </span>
                            <div className="col-start-2 col-span-2">
                                <Bar value={max > 0 ? (p.share / max) * 100 : 0} label={`${p.path}: ${formatShare(p.share)}% of pageviews`} height="h-1" />
                            </div>
                        </li>
                    );
                })}
            </ol>
        </SubSection>
    );
}

function QueriesSection({ queries, gscSiteUrl }: { queries: AudienceQuery[]; gscSiteUrl: string | null }) {
    const [showAll, setShowAll] = useState(false);
    const sorted = queries.slice().sort((a, b) => b.clicks - a.clicks);
    const visible = showAll ? sorted : sorted.slice(0, QUERY_PREVIEW_COUNT);
    const hasMore = sorted.length > QUERY_PREVIEW_COUNT;

    return (
        <SubSection icon={<Search className="h-3 w-3" />} title="What they search for">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-white/[0.06] pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                <span>Query</span>
                <span className="text-right">Clicks</span>
                <span className="hidden text-right sm:block">Impr.</span>
            </div>
            <ul>
                {visible.map((q) => (
                    <li
                        key={q.query}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-white/[0.04] py-2 text-[13px] last:border-b-0"
                    >
                        <span className="truncate text-zinc-200">{q.query}</span>
                        <span className="text-right font-semibold tabular-nums text-white">{formatNumber(q.clicks)}</span>
                        <span className="hidden text-right tabular-nums text-zinc-500 sm:block">{formatNumber(q.impressions)}</span>
                    </li>
                ))}
            </ul>
            {hasMore && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    aria-expanded={showAll}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-[#14C4E1]/30 hover:bg-white/[0.06] hover:text-white"
                >
                    {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showAll ? 'Show top 10' : `Show all ${sorted.length}`}
                </button>
            )}
            {gscSiteUrl && (
                <p className="mt-3 text-[11px] text-zinc-600">
                    Source: Google Search Console property <span className="font-mono text-zinc-500">{gscSiteUrl}</span>
                </p>
            )}
        </SubSection>
    );
}

function DemographicsSection({ demographics }: { demographics: AudienceDemographics }) {
    const age = nonEmpty(demographics.age) ? sortByShare(demographics.age) : [];
    const gender = nonEmpty(demographics.gender) ? sortByShare(demographics.gender) : [];
    if (age.length === 0 && gender.length === 0) return null;
    const maxAge = age.reduce((m, a) => Math.max(m, a.share), 0);
    const maxGender = gender.reduce((m, g) => Math.max(m, g.share), 0);

    return (
        <SubSection icon={<UserRound className="h-3 w-3" />} title="Demographics">
            <div className={`grid gap-6 ${age.length && gender.length ? 'sm:grid-cols-2' : ''}`}>
                {age.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Age</p>
                        <ul className="mt-3 space-y-3">
                            {age.map((a) => (
                                <ShareRow key={a.name} name={a.name} share={a.share} max={maxAge} barClass="bg-purple-400/70" />
                            ))}
                        </ul>
                    </div>
                )}
                {gender.length > 0 && (
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Gender</p>
                        <ul className="mt-3 space-y-3">
                            {gender.map((g) => (
                                <ShareRow
                                    key={g.name}
                                    name={g.name.charAt(0).toUpperCase() + g.name.slice(1)}
                                    share={g.share}
                                    max={maxGender}
                                    barClass="bg-amber-300/70"
                                />
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            <p className="mt-4 text-[11px] text-zinc-600">Google Signals estimates; may be thresholded on smaller sites.</p>
        </SubSection>
    );
}

/* ── panel ───────────────────────────────────────────────────────── */

export default function AudiencePanel({ entry }: { entry: StartupProfileData }) {
    const audience = entry.audience;
    if (!audience || !hasAnyData(audience)) return null;

    const hasGsc = nonEmpty(audience.top_queries) || Boolean(audience.gsc_site_url);
    const refreshed = parseRefreshedAt(audience.refreshed_at);
    const windowLabel = audience.data_window === '28d' || !audience.data_window ? 'last 28 days' : `last ${audience.data_window}`;
    const showDemographics =
        audience.demographics !== null && (nonEmpty(audience.demographics.age) || nonEmpty(audience.demographics.gender));

    return (
        <section
            aria-labelledby="audience-heading"
            className="mt-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.06),transparent_38%),linear-gradient(180deg,rgba(8,9,12,0.98),rgba(2,3,4,1))] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)] sm:p-8"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <SectionLabel>Audience</SectionLabel>
                    <h2 id="audience-heading" className="flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-white">
                        <Users className="h-4 w-4 text-[#7AD9DA]" />
                        Who visits {entry.startup_name}
                    </h2>
                    <p className="text-[12px] text-zinc-500">
                        From Google Analytics 4{hasGsc ? ' + Search Console' : ''} · {windowLabel}
                        {refreshed && (
                            <>
                                {' · refreshed '}
                                <time dateTime={refreshed.toISOString()} suppressHydrationWarning>
                                    {relativeTime(refreshed)}
                                </time>
                            </>
                        )}
                    </p>
                </div>
                <span
                    title="Read directly from the verified GA4 property"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/22 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300"
                >
                    <ShieldCheck className="h-3 w-3" /> Verified source
                </span>
            </div>

            <div className="mt-6 space-y-4">
                {nonEmpty(audience.topics) && <TopicsSection topics={audience.topics} />}

                <GeoSection countries={audience.countries} cities={audience.cities} />

                {(nonEmpty(audience.channels) || nonEmpty(audience.devices)) && (
                    <div className={`grid gap-4 ${nonEmpty(audience.channels) && nonEmpty(audience.devices) ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
                        {nonEmpty(audience.channels) && <ChannelsSection channels={audience.channels} />}
                        {nonEmpty(audience.devices) && <DevicesSection devices={audience.devices} />}
                    </div>
                )}

                {(nonEmpty(audience.top_pages) || nonEmpty(audience.top_queries)) && (
                    <div className={`grid gap-4 ${nonEmpty(audience.top_pages) && nonEmpty(audience.top_queries) ? 'lg:grid-cols-2' : ''}`}>
                        {nonEmpty(audience.top_pages) && <PagesSection pages={audience.top_pages} websiteUrl={entry.website_url} />}
                        {nonEmpty(audience.top_queries) && (
                            <QueriesSection queries={audience.top_queries} gscSiteUrl={audience.gsc_site_url} />
                        )}
                    </div>
                )}

                {showDemographics && audience.demographics && <DemographicsSection demographics={audience.demographics} />}
            </div>
        </section>
    );
}
