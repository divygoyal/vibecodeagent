'use client';

/**
 * /dashboard/setup — Unified workspace selection.
 *
 * Single screen where the user picks a GA4 property and/or a GSC site. The
 * selection becomes the dashboard's single source of truth (see
 * useWorkspace() in dashboard/layout.tsx). At least one of the two is
 * required before Continue is enabled. Reachable both as a guarded
 * post-login step (no saved workspace yet) and as the workspace switcher
 * pill in the dashboard sidebar.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
    CheckCircle2, Search, Sparkles, ArrowRight, AlertTriangle,
    BarChart3, Globe as GlobeIcon, ScanSearch,
} from 'lucide-react';
import { useWorkspace } from '../layout';
import {
    formatSiteLabel,
    matchPropertyToSite,
    type PropertyOption,
    type SiteOption,
} from '@/lib/dashboardSelection';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList, usePropertyList } from '@/lib/useDashboardData';

function siteHostTokens(siteUrl: string): { host: string; tokens: Set<string> } {
    const cleaned = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const host = cleaned.split('/')[0].toLowerCase();
    const tokens = new Set(host.split('.').flatMap((p) => p.split(/[-_]+/)).filter((t) => t.length >= 3));
    return { host, tokens };
}

function tokensOverlap(a: Set<string>, b: Set<string>): boolean {
    for (const t of a) if (b.has(t)) return true;
    return false;
}

type Star = { id: number; x: number; y: number; size: number; opMin: number; opMax: number; dur: number; delay: number };

function MiniStarField() {
    const [stars, setStars] = useState<Star[]>([]);
    useEffect(() => {
        setStars(
            Array.from({ length: 80 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 1.4 + 0.3,
                opMin: Math.random() * 0.15 + 0.05,
                opMax: Math.random() * 0.5 + 0.35,
                dur: Math.random() * 4 + 3,
                delay: Math.random() * 6,
            })),
        );
    }, []);
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {stars.map((s) => (
                <span
                    key={s.id}
                    className="tc-star"
                    style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        ['--tw-opacity-min' as never]: s.opMin,
                        ['--tw-opacity-max' as never]: s.opMax,
                        ['--twinkle-dur' as never]: `${s.dur}s`,
                        ['--twinkle-delay' as never]: `${s.delay}s`,
                    } as CSSProperties}
                />
            ))}
        </div>
    );
}

export default function SetupPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const {
        selectedProperty,
        selectedSite,
        saveWorkspace,
        isWorkspaceLoaded,
    } = useWorkspace();
    const { hasGoogleConnection } = useContainerStatus();
    const {
        sites: gscSitesRaw,
        isLoading: sitesLoading,
        error: sitesError,
    } = useSiteList(hasGoogleConnection);
    const {
        properties: propsRaw,
        isLoading: propsLoading,
        error: propsError,
    } = usePropertyList(hasGoogleConnection);

    const sites = (gscSitesRaw as SiteOption[]) || [];
    const properties = (propsRaw as PropertyOption[]) || [];

    const [chosenProperty, setChosenProperty] = useState(selectedProperty);
    const [chosenSite, setChosenSite] = useState(selectedSite);
    const [propSearch, setPropSearch] = useState('');
    const [siteSearch, setSiteSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [autoMatched, setAutoMatched] = useState<{ property: string; site: string } | null>(null);

    const userName = session?.user?.name?.split(' ')[0] || 'there';
    const greeting = (() => {
        const hr = new Date().getHours();
        if (hr < 12) return 'Good morning';
        if (hr < 17) return 'Good afternoon';
        return 'Good evening';
    })();

    // Hydrate the form from current workspace once it loads.
    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        if (selectedProperty && !chosenProperty) setChosenProperty(selectedProperty);
        if (selectedSite && !chosenSite) setChosenSite(selectedSite);
    }, [isWorkspaceLoaded, selectedProperty, selectedSite, chosenProperty, chosenSite]);

    // Single-property + single-site auto-select on first paint.
    useEffect(() => {
        if (chosenProperty || chosenSite) return;
        if (propsLoading || sitesLoading) return;
        if (properties.length === 1 && properties[0].property) {
            setChosenProperty(properties[0].property);
        }
        if (sites.length === 1 && sites[0].siteUrl) {
            setChosenSite(sites[0].siteUrl);
        }
    }, [propsLoading, sitesLoading, properties, sites, chosenProperty, chosenSite]);

    // Auto-match GSC site when a GA4 property is picked and no site selected.
    useEffect(() => {
        if (!chosenProperty || chosenSite) return;
        if (!sites.length) return;
        const propObj = properties.find((p) => p.property === chosenProperty);
        if (!propObj?.displayName) return;
        const propTokens = new Set(
            (propObj.displayName || '')
                .toLowerCase()
                .split(/[\s.\-_/]+/)
                .filter((t) => t.length >= 3)
        );
        for (const site of sites) {
            const { tokens } = siteHostTokens(site.siteUrl);
            if (tokensOverlap(propTokens, tokens)) {
                setChosenSite(site.siteUrl);
                setAutoMatched({ property: chosenProperty, site: site.siteUrl });
                return;
            }
        }
    }, [chosenProperty, chosenSite, sites, properties]);

    // Reverse auto-match: when a GSC site is picked first, find a GA4 property.
    useEffect(() => {
        if (!chosenSite || chosenProperty) return;
        if (!properties.length) return;
        const match = matchPropertyToSite(chosenSite, properties);
        if (match?.property) {
            setChosenProperty(match.property);
            setAutoMatched({ property: match.property, site: chosenSite });
        }
    }, [chosenSite, chosenProperty, properties]);

    const filteredProperties = useMemo(() => {
        const q = propSearch.trim().toLowerCase();
        if (!q) return properties;
        return properties.filter((p) =>
            (p.displayName || '').toLowerCase().includes(q)
            || (p.property || '').toLowerCase().includes(q)
        );
    }, [properties, propSearch]);

    const filteredSites = useMemo(() => {
        const q = siteSearch.trim().toLowerCase();
        if (!q) return sites;
        return sites.filter((s) => formatSiteLabel(s.siteUrl).toLowerCase().includes(q));
    }, [sites, siteSearch]);

    const canContinue = Boolean(chosenProperty || chosenSite);

    // Mismatch warning: both picked but tokens don't overlap.
    const showMismatch = useMemo(() => {
        if (!chosenProperty || !chosenSite) return false;
        const propObj = properties.find((p) => p.property === chosenProperty);
        if (!propObj?.displayName) return false;
        const propTokens = new Set(
            (propObj.displayName || '')
                .toLowerCase()
                .split(/[\s.\-_/]+/)
                .filter((t) => t.length >= 3)
        );
        const { tokens: siteTokens } = siteHostTokens(chosenSite);
        return propTokens.size > 0 && siteTokens.size > 0 && !tokensOverlap(propTokens, siteTokens);
    }, [chosenProperty, chosenSite, properties]);

    const onContinue = async () => {
        if (!canContinue || saving) return;
        setSaving(true);
        setSaveError(null);
        const ok = await saveWorkspace({
            property: chosenProperty || null,
            site: chosenSite || null,
        });
        setSaving(false);
        if (!ok) {
            setSaveError('Could not save your workspace. Try again.');
            return;
        }
        router.push('/dashboard/ai-chat');
    };

    const onSkip = async () => {
        await saveWorkspace({ property: null, site: null });
        router.push('/dashboard/ai-chat');
    };

    const onContinueWithDemo = async () => {
        setSaving(true);
        const ok = await saveWorkspace({ property: DEMO_PROPERTY_ID, site: DEMO_SITE_URL });
        setSaving(false);
        if (ok) router.push('/dashboard/ai-chat');
    };

    const cosmicShell = (children: React.ReactNode) => (
        <div className="relative min-h-screen overflow-hidden bg-black -m-3 sm:-m-4 md:-m-6">
            <MiniStarField />
            <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-[-220px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(20,196,225,0.18),transparent_70%)] blur-3xl" />
                <div className="absolute left-1/2 top-[280px] h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(122,217,218,0.10),transparent_70%)] blur-3xl" />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    );

    // ─── Render branches ──────────────────────────────────────────────

    if (!hasGoogleConnection) {
        return cosmicShell(
            <div className="max-w-2xl mx-auto py-16 sm:py-24 px-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-4">
                    {greeting}, {userName}
                </p>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
                    Let&apos;s set up your workspace
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed">
                    TrafficClaw needs your Google Analytics and Search Console data to surface
                    insights, anomalies, and growth opportunities. Connect once and we&apos;ll
                    bring everything in.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                        className="group relative px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)] hover:shadow-[0_0_36px_rgba(20,196,225,0.55)]"
                    >
                        Connect Google
                    </button>
                    <button
                        type="button"
                        onClick={onContinueWithDemo}
                        disabled={saving}
                        className="px-6 py-3 rounded-2xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Continue with demo data →
                    </button>
                </div>
            </div>
        );
    }

    const inventoryEmpty = !propsLoading && !sitesLoading && properties.length === 0 && sites.length === 0 && !propsError && !sitesError;

    if (inventoryEmpty) {
        return cosmicShell(
            <div className="max-w-2xl mx-auto py-16 sm:py-24 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-yellow-500/12 mx-auto mb-6 flex items-center justify-center border border-yellow-500/20">
                    <AlertTriangle className="w-6 h-6 text-yellow-400" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
                    No GA4 or Search Console data found
                </h1>
                <p className="text-sm text-zinc-400 mb-10 max-w-md mx-auto leading-relaxed">
                    We couldn&apos;t find any GA4 properties or Search Console sites for this Google account.
                    Re-connect with a different account, or explore with demo data.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' })}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)]"
                    >
                        Switch Google account
                    </button>
                    <button
                        type="button"
                        onClick={onContinueWithDemo}
                        disabled={saving}
                        className="px-6 py-3 rounded-2xl bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Continue with demo data →
                    </button>
                </div>
            </div>
        );
    }

    // ─── Main two-column picker ───────────────────────────────────────

    return cosmicShell(
        <div className="max-w-5xl mx-auto py-10 sm:py-16 px-4 pb-32 sm:pb-16">
            <div className="text-center mb-10 sm:mb-14">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-3">
                    {greeting}, {userName}
                </p>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                    Pick your workspace
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
                    Choose a Google Analytics property and a Search Console site. Both are
                    recommended, but either alone will work.
                </p>
                <button
                    type="button"
                    onClick={onSkip}
                    className="mt-4 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                    Skip for now →
                </button>
            </div>

            {autoMatched && chosenProperty === autoMatched.property && chosenSite === autoMatched.site && (
                <div className="mb-6 mx-auto max-w-3xl rounded-2xl border border-[#14C4E1]/24 bg-[#14C4E1]/[0.06] px-4 py-3 flex items-center gap-2.5 text-xs text-[#7AD9DA] backdrop-blur">
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    <span>We auto-matched a GA4 property to your Search Console site. Change either side below if it&apos;s wrong.</span>
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
                <PickerColumn
                    icon={BarChart3}
                    iconColor="#7AD9DA"
                    title="GA4 property"
                    subtitle="Realtime, retention, conversions"
                    badge={chosenProperty ? properties.find((p) => p.property === chosenProperty)?.displayName || 'Selected' : 'None selected'}
                    error={propsError ? 'Could not load GA4 properties.' : null}
                    loading={propsLoading}
                    search={propSearch}
                    onSearch={setPropSearch}
                    emptyText="No GA4 properties on this account."
                >
                    {filteredProperties.map((p) => {
                        const id = p.property || p.propertyId || '';
                        const isSelected = chosenProperty === id;
                        return (
                            <button
                                key={id || p.displayName}
                                type="button"
                                disabled={!id}
                                onClick={() => setChosenProperty(isSelected ? '' : id)}
                                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                                    isSelected
                                        ? 'border-[#14C4E1]/50 bg-[#14C4E1]/[0.10] text-white shadow-[0_0_24px_rgba(20,196,225,0.18)]'
                                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.12]'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{p.displayName || '(unnamed)'}</div>
                                    <div className="text-[10.5px] text-zinc-500 truncate font-mono">{id}</div>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#7AD9DA] flex-shrink-0" />}
                            </button>
                        );
                    })}
                </PickerColumn>

                <PickerColumn
                    icon={ScanSearch}
                    iconColor="#7AD9DA"
                    title="Search Console site"
                    subtitle="Queries, pages, rankings"
                    badge={chosenSite ? formatSiteLabel(chosenSite) : 'None selected'}
                    error={sitesError ? 'Could not load Search Console sites.' : null}
                    loading={sitesLoading}
                    search={siteSearch}
                    onSearch={setSiteSearch}
                    emptyText="No Search Console sites on this account."
                >
                    {filteredSites.map((s) => {
                        const isSelected = chosenSite === s.siteUrl;
                        return (
                            <button
                                key={s.siteUrl}
                                type="button"
                                onClick={() => setChosenSite(isSelected ? '' : s.siteUrl)}
                                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                                    isSelected
                                        ? 'border-[#14C4E1]/50 bg-[#14C4E1]/[0.10] text-white shadow-[0_0_24px_rgba(20,196,225,0.18)]'
                                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.12]'
                                }`}
                            >
                                <GlobeIcon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{formatSiteLabel(s.siteUrl)}</div>
                                    <div className="text-[10.5px] text-zinc-500 truncate font-mono">{s.siteUrl}</div>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#7AD9DA] flex-shrink-0" />}
                            </button>
                        );
                    })}
                </PickerColumn>
            </div>

            {showMismatch && (
                <div className="mt-5 mx-auto max-w-3xl rounded-xl border border-yellow-500/30 bg-yellow-500/[0.06] px-4 py-3 flex items-start gap-2.5 text-xs text-yellow-300 backdrop-blur">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                        These don&apos;t look like the same site — your GA4 property and Search Console site appear to be different domains. Continue anyway if that&apos;s intentional.
                    </span>
                </div>
            )}

            {saveError && (
                <div className="mt-5 mx-auto max-w-3xl rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
                    {saveError}
                </div>
            )}

            {/* Continue — sticky on mobile, centered on desktop */}
            <div className="fixed sm:static bottom-0 inset-x-0 sm:bottom-auto sm:inset-x-auto sm:mt-10 px-4 sm:px-0 py-3 sm:py-0 bg-black/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-0 border-t border-white/[0.06] sm:border-0 z-10">
                <div className="max-w-5xl mx-auto sm:mx-0 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={!canContinue || saving}
                        className="group relative px-7 py-3.5 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)] hover:shadow-[0_0_36px_rgba(20,196,225,0.55)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                    >
                        {saving ? 'Saving…' : 'Continue to dashboard'}
                        {!saving && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PickerColumn({
    icon: Icon,
    iconColor,
    title,
    subtitle,
    badge,
    error,
    loading,
    search,
    onSearch,
    emptyText,
    children,
}: {
    icon: React.ElementType;
    iconColor: string;
    title: string;
    subtitle: string;
    badge: string;
    error: string | null;
    loading: boolean;
    search: string;
    onSearch: (v: string) => void;
    emptyText: string;
    children: React.ReactNode;
}) {
    const childArray = Array.isArray(children) ? children : [children];
    const isEmpty = !loading && !error && childArray.flat().filter(Boolean).length === 0;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-white">{title}</h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
                </div>
                <span className="text-[10px] text-zinc-500 truncate max-w-[40%] mt-1.5">{badge}</span>
            </div>
            <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/30"
                />
            </div>
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                {loading && (
                    <>
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />
                        ))}
                    </>
                )}
                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {error}
                    </div>
                )}
                {!loading && !error && children}
                {isEmpty && (
                    <div className="text-xs text-zinc-500 italic px-3 py-6 text-center">
                        {emptyText}
                    </div>
                )}
            </div>
        </div>
    );
}
