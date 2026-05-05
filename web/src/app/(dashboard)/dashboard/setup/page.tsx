'use client';

/**
 * /dashboard/setup — Two-step linear workspace wizard.
 *
 * Step 1 ("Pick your website") — single-column list of GA4 properties shown
 * as websites. User clicks one, we advance to Step 2.
 *   Inverted branch: when the user has GSC sites but no GA4 properties at all,
 *   Step 1 becomes a list of Search Console sites instead.
 *
 * Step 2 ("Got Search Console for this site?") — soft-suggested GSC site
 * (token-overlap with the picked GA4) at the top, plus a searchable list of
 * the rest. User either picks one ("Use this site") or clicks "Skip — I
 * don't have one." Either action saves and routes to /dashboard/ai-chat.
 *   In the inverted branch, Step 2 asks about GA4 instead.
 *
 * Workspace name (label) is auto-derived: GA4 displayName wins, else GSC
 * root domain. No user-typed name input.
 */
import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
    CheckCircle2, Search, Sparkles, ArrowRight, AlertTriangle,
    BarChart3, Globe as GlobeIcon,
} from 'lucide-react';
import { useWorkspace } from '../layout';
import {
    formatSiteLabel,
    matchPropertyToSite,
    type PropertyOption,
    type SiteOption,
} from '@/lib/dashboardSelection';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import { useContainerStatus, useSiteList, usePropertyList, useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

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

function propertyTokens(p: PropertyOption | undefined): Set<string> {
    if (!p?.displayName) return new Set();
    return new Set(
        p.displayName
            .toLowerCase()
            .split(/[\s.\-_/]+/)
            .filter((t) => t.length >= 3)
    );
}

function rootDomainFromSite(siteUrl: string): string {
    const cleaned = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return cleaned.split('/')[0].toLowerCase();
}

// Compact KPI formatter — 37424 → "37.4k", 1_240_000 → "1.2M". Avoids pulling
// in another util; matches the post-bridge.com card style the user referenced.
function formatCompact(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return Math.round(n).toLocaleString();
}

// Sanitize an id (propertyId, siteUrl) for use as a recharts <linearGradient>
// id. Recharts requires unique gradient ids per chart on the page; we derive
// from the source identifier so each card's gradient is stable across renders.
function sparkGradId(raw: string): string {
    return `sg-${raw.replace(/[^a-zA-Z0-9]+/g, '-')}`;
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
    const { data: session, update: updateSession } = useSession();
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
    // Wizard step. 'pick-website' = Step 1 (pick GA4, or GSC in inverted
    // mode). 'pair-gsc' = Step 2 (pair the secondary source, optional).
    const [step, setStep] = useState<'pick-website' | 'pair-gsc'>(
        selectedProperty || selectedSite ? 'pair-gsc' : 'pick-website'
    );

    const userName = session?.user?.name?.split(' ')[0] || 'there';
    const greeting = (() => {
        const hr = new Date().getHours();
        if (hr < 12) return 'Good morning';
        if (hr < 17) return 'Good afternoon';
        return 'Good evening';
    })();

    // Inverted mode — user has only GSC sites, no GA4 inventory at all.
    // Step 1 picks a GSC site, Step 2 (optional) pairs a GA4 property.
    const gscOnlyMode = !propsLoading && properties.length === 0 && sites.length > 0;

    // Hydrate the form from current workspace once it loads.
    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        if (selectedProperty && !chosenProperty) setChosenProperty(selectedProperty);
        if (selectedSite && !chosenSite) setChosenSite(selectedSite);
    }, [isWorkspaceLoaded, selectedProperty, selectedSite, chosenProperty, chosenSite]);

    // Soft-suggestion (Step 2 only): given the Step 1 pick, find a
    // token-overlap match in the OTHER inventory. Used to bubble that match
    // to the top of the list and tag it "Best match" — never auto-fills.
    const suggestion = useMemo<{ kind: 'site' | 'property'; siteUrl?: string; propertyId?: string } | null>(() => {
        if (chosenProperty && sites.length > 0) {
            const prop = properties.find((p) => p.property === chosenProperty);
            const propTokens = propertyTokens(prop);
            if (!propTokens.size) return null;
            for (const site of sites) {
                const { tokens } = siteHostTokens(site.siteUrl);
                if (tokensOverlap(propTokens, tokens)) {
                    return { kind: 'site', siteUrl: site.siteUrl };
                }
            }
        }
        if (chosenSite && properties.length > 0) {
            const match = matchPropertyToSite(chosenSite, properties);
            if (match?.property) {
                return { kind: 'property', propertyId: match.property };
            }
        }
        return null;
    }, [chosenProperty, chosenSite, properties, sites]);

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

    // Mark workspace_setup_completed=true server-side AND refresh the JWT
    // claim via NextAuth's update() trigger. Middleware reads the claim on
    // every dashboard request — without the JWT refresh it would still see
    // the old `false` value and bounce the user back here.
    const markSetupCompleted = useCallback(async () => {
        try {
            await fetch('/api/user/workspace', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mark_setup_completed: true }),
            });
        } catch {
            /* non-fatal — the layout-effect guard is a fallback. */
        }
        try {
            await updateSession({ workspaceSetupCompleted: true });
        } catch {
            /* non-fatal — JWT will refresh on next sign-in. */
        }
    }, [updateSession]);

    // Helper used by both Step 2 buttons — saves with the explicit values
    // passed in (so we don't race React state updates from the Use/Skip click).
    // Computes the label from the explicit values too.
    const finishSetup = async (finalProperty: string | null, finalSite: string | null) => {
        if (saving) return;
        if (!finalProperty && !finalSite) return; // safety — Step 2 always has at least one
        setSaving(true);
        setSaveError(null);
        let label = '';
        if (finalProperty) {
            const prop = properties.find((p) => p.property === finalProperty);
            label = prop?.displayName || prop?.property || finalProperty;
        } else if (finalSite) {
            label = rootDomainFromSite(finalSite);
        }
        const ok = await saveWorkspace({
            property: finalProperty,
            site: finalSite,
            label,
        });
        if (ok) await markSetupCompleted();
        setSaving(false);
        if (!ok) {
            setSaveError('Could not save your workspace. Try again.');
            return;
        }
        router.push('/dashboard/ai-chat');
    };

    const onContinueWithDemo = async () => {
        setSaving(true);
        const ok = await saveWorkspace({
            property: DEMO_PROPERTY_ID,
            site: DEMO_SITE_URL,
            label: 'Demo workspace',
        });
        if (ok) await markSetupCompleted();
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

    // ─── No-Google branch ─────────────────────────────────────────────

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
                        className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#14C4E1] to-[#0AA0BA] text-[#031318] hover:from-[#26D5F0] hover:to-[#14C4E1] transition-all text-sm font-semibold shadow-[0_0_24px_rgba(20,196,225,0.32)] hover:shadow-[0_0_36px_rgba(20,196,225,0.55)]"
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

    // ─── Main flow: two-step linear wizard ───────────────────────────

    // Suggestion-aware list ordering for Step 2 (GSC list when GA4 is picked,
    // or GA4 list in inverted mode). The matched item moves to the top with
    // a "best match" badge.
    const orderedStep2Sites = useMemo(() => {
        if (!suggestion || suggestion.kind !== 'site') return filteredSites;
        const matchUrl = suggestion.siteUrl;
        const match = filteredSites.find((s) => s.siteUrl === matchUrl);
        if (!match) return filteredSites;
        return [match, ...filteredSites.filter((s) => s.siteUrl !== matchUrl)];
    }, [filteredSites, suggestion]);

    const orderedStep2Properties = useMemo(() => {
        if (!suggestion || suggestion.kind !== 'property') return filteredProperties;
        const matchId = suggestion.propertyId;
        const match = filteredProperties.find((p) => p.property === matchId);
        if (!match) return filteredProperties;
        return [match, ...filteredProperties.filter((p) => p.property !== matchId)];
    }, [filteredProperties, suggestion]);

    const stepBadge = (
        <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${step === 'pick-website' ? 'text-[#7AD9DA]' : 'text-zinc-600'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 'pick-website' ? 'bg-[#14C4E1]/20 border border-[#14C4E1]/30' : 'bg-white/[0.04] border border-white/[0.08]'}`}>
                    {step === 'pair-gsc' ? <CheckCircle2 className="w-3 h-3 text-[#7AD9DA]" /> : '1'}
                </span>
                Pick website
            </span>
            <span className="w-8 h-px bg-white/[0.08]" />
            <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${step === 'pair-gsc' ? 'text-[#7AD9DA]' : 'text-zinc-600'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 'pair-gsc' ? 'bg-[#14C4E1]/20 border border-[#14C4E1]/30' : 'bg-white/[0.04] border border-white/[0.08]'}`}>2</span>
                {gscOnlyMode ? 'Add GA4' : 'Add Search Console'}
            </span>
        </div>
    );

    // ─── STEP 1 ──────────────────────────────────────────────────────

    if (step === 'pick-website') {
        const step1Loading = gscOnlyMode ? sitesLoading : propsLoading;
        const step1Error = gscOnlyMode ? sitesError : propsError;

        const onPickProperty = (id: string) => {
            setChosenProperty(id);
            setChosenSite(''); // clear stale selection from previous flow
            setStep('pair-gsc');
        };
        const onPickSite = (url: string) => {
            setChosenSite(url);
            setChosenProperty('');
            setStep('pair-gsc');
        };

        return cosmicShell(
            <div className="max-w-5xl mx-auto py-10 sm:py-14 px-4 pb-24 sm:pb-14">
                <div className="text-center mb-8">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-3">
                        {greeting}, {userName}
                    </p>
                    <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                        Pick your website
                    </h1>
                    <p className="text-sm sm:text-base text-zinc-400 max-w-md mx-auto leading-relaxed">
                        Choose the website you want TrafficClaw to analyze.
                    </p>
                </div>

                {stepBadge}

                {/* Search */}
                <div className="max-w-xl mx-auto mb-6 relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={gscOnlyMode ? siteSearch : propSearch}
                        onChange={(e) => (gscOnlyMode ? setSiteSearch : setPropSearch)(e.target.value)}
                        placeholder="Search your websites…"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0a0d12]/80 backdrop-blur-sm border border-white/[0.08] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/40 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                    />
                </div>

                {/* Card grid — 3 across on desktop */}
                {step1Error ? (
                    <div className="max-w-xl mx-auto rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Could not load your websites. Try refreshing.
                    </div>
                ) : step1Loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="rounded-2xl border border-white/[0.06] bg-[#0a0d12]/80 p-4 h-[164px] animate-pulse">
                                <div className="h-3.5 w-32 rounded bg-white/[0.05]" />
                                <div className="mt-4 h-12 w-full rounded bg-white/[0.03]" />
                                <div className="mt-4 h-3 w-24 rounded bg-white/[0.04]" />
                            </div>
                        ))}
                    </div>
                ) : gscOnlyMode ? (
                    filteredSites.length === 0 ? (
                        <div className="text-xs text-zinc-500 italic px-3 py-12 text-center">
                            No websites match your search.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredSites.map((s) => (
                                <WebsiteCardGsc
                                    key={s.siteUrl}
                                    siteUrl={s.siteUrl}
                                    onClick={() => onPickSite(s.siteUrl)}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    filteredProperties.length === 0 ? (
                        <div className="text-xs text-zinc-500 italic px-3 py-12 text-center">
                            No websites match your search.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredProperties.map((p) => {
                                const id = p.property || p.propertyId || '';
                                return (
                                    <WebsiteCardGa4
                                        key={id || p.displayName}
                                        propertyId={id}
                                        displayName={p.displayName || '(unnamed)'}
                                        disabled={!id}
                                        onClick={() => onPickProperty(id)}
                                    />
                                );
                            })}
                        </div>
                    )
                )}
            </div>
        );
    }

    // ─── STEP 2 ──────────────────────────────────────────────────────

    // The "primary" pick from Step 1 (always set on this step)
    const primaryLabel = chosenProperty
        ? (properties.find((p) => p.property === chosenProperty)?.displayName || chosenProperty)
        : (chosenSite ? formatSiteLabel(chosenSite) : '');

    const askingAboutGsc = !gscOnlyMode; // GA4 was Step 1, ask about GSC in Step 2
    const step2Loading = askingAboutGsc ? sitesLoading : propsLoading;
    const step2Error = askingAboutGsc ? sitesError : propsError;
    const stepTitle = askingAboutGsc
        ? 'Got Search Console for this site?'
        : 'Got Google Analytics for this site?';
    const stepSub = askingAboutGsc
        ? 'Connect your Search Console site to unlock query, ranking, and CTR data.'
        : 'Connect a GA4 property to unlock realtime, retention, and conversion data.';
    const skipSub = askingAboutGsc
        ? 'You can add it later from your workspace settings.'
        : 'You can add it later from your workspace settings.';

    const goBack = () => {
        // Reset selection so they can re-pick freely
        if (askingAboutGsc) setChosenSite('');
        else setChosenProperty('');
        setStep('pick-website');
    };

    const onUseStep2Site = (url: string) => finishSetup(chosenProperty || null, url);
    const onUseStep2Property = (id: string) => finishSetup(id, chosenSite || null);
    const onSkipStep2 = () => finishSetup(chosenProperty || null, chosenSite || null);

    return cosmicShell(
        <div className="max-w-2xl mx-auto py-10 sm:py-14 px-4 pb-32 sm:pb-14">
            <div className="text-center mb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-3">
                    {greeting}, {userName}
                </p>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white mb-2">
                    {stepTitle}
                </h1>
                <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                    {stepSub}
                </p>
            </div>

            {stepBadge}

            <div className="mb-4">
                <button
                    type="button"
                    onClick={goBack}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
                >
                    ← Back to website list
                </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
                <div className="mb-4 flex items-center gap-2.5 px-1">
                    <div className="w-7 h-7 rounded-lg border border-[#14C4E1]/20 bg-[#14C4E1]/[0.08] flex items-center justify-center flex-shrink-0">
                        <GlobeIcon className="w-3.5 h-3.5 text-[#7AD9DA]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Your website</div>
                        <div className="text-sm font-semibold text-white truncate">{primaryLabel}</div>
                    </div>
                </div>

                <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={askingAboutGsc ? siteSearch : propSearch}
                        onChange={(e) => (askingAboutGsc ? setSiteSearch : setPropSearch)(e.target.value)}
                        placeholder={askingAboutGsc ? 'Search your Search Console sites…' : 'Search your GA4 properties…'}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#14C4E1]/30"
                    />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
                    {step2Loading && (
                        <>
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />
                            ))}
                        </>
                    )}
                    {step2Error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Could not load — you can skip this step.
                        </div>
                    )}
                    {!step2Loading && !step2Error && askingAboutGsc && (
                        <>
                            {orderedStep2Sites.length === 0 && (
                                <div className="text-xs text-zinc-500 italic px-3 py-6 text-center">
                                    No Search Console sites found on this account.
                                </div>
                            )}
                            {orderedStep2Sites.map((s) => {
                                const isMatch = suggestion?.kind === 'site' && suggestion.siteUrl === s.siteUrl;
                                return (
                                    <button
                                        key={s.siteUrl}
                                        type="button"
                                        onClick={() => onUseStep2Site(s.siteUrl)}
                                        className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3 group ${
                                            isMatch
                                                ? 'border-[#14C4E1]/40 bg-[#14C4E1]/[0.08] text-white shadow-[0_0_20px_rgba(20,196,225,0.12)]'
                                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.12]'
                                        }`}
                                    >
                                        <GlobeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isMatch ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate flex items-center gap-2">
                                                {formatSiteLabel(s.siteUrl)}
                                                {isMatch && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#14C4E1]/15 border border-[#14C4E1]/30 text-[9px] font-semibold uppercase tracking-wider text-[#7AD9DA]">
                                                        <Sparkles className="w-2.5 h-2.5" />
                                                        Best match
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10.5px] text-zinc-500 truncate font-mono">{s.siteUrl}</div>
                                        </div>
                                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </>
                    )}
                    {!step2Loading && !step2Error && !askingAboutGsc && (
                        <>
                            {orderedStep2Properties.length === 0 && (
                                <div className="text-xs text-zinc-500 italic px-3 py-6 text-center">
                                    No GA4 properties found on this account.
                                </div>
                            )}
                            {orderedStep2Properties.map((p) => {
                                const id = p.property || p.propertyId || '';
                                const isMatch = suggestion?.kind === 'property' && suggestion.propertyId === id;
                                return (
                                    <button
                                        key={id || p.displayName}
                                        type="button"
                                        disabled={!id}
                                        onClick={() => onUseStep2Property(id)}
                                        className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3 group ${
                                            isMatch
                                                ? 'border-[#14C4E1]/40 bg-[#14C4E1]/[0.08] text-white shadow-[0_0_20px_rgba(20,196,225,0.12)]'
                                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.12]'
                                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                                    >
                                        <BarChart3 className={`w-3.5 h-3.5 flex-shrink-0 ${isMatch ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate flex items-center gap-2">
                                                {p.displayName || '(unnamed)'}
                                                {isMatch && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#14C4E1]/15 border border-[#14C4E1]/30 text-[9px] font-semibold uppercase tracking-wider text-[#7AD9DA]">
                                                        <Sparkles className="w-2.5 h-2.5" />
                                                        Best match
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10.5px] text-zinc-500 truncate font-mono">{id}</div>
                                        </div>
                                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            {saveError && (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
                    {saveError}
                </div>
            )}

            {/* Skip — no need to make picking the easy path; many users don't have GSC */}
            <div className="mt-6 text-center">
                <button
                    type="button"
                    onClick={onSkipStep2}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-200 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving…' : <>Skip — I don&apos;t have one <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
                <p className="text-[11px] text-zinc-600 mt-2">{skipSub}</p>
            </div>
        </div>
    );
}

// ─── WebsiteCardGa4 ─────────────────────────────────────────────────
// Rich card shown on Step 1 for each GA4 property. 30-day visitor
// sparkline + total visitor count, fetched per-card via useAnalyticsData.
// SWR dedupes by URL (60s) and the server has a 3-min cache, so firing
// N parallel fetches for typical inventories (3-5 properties) is cheap.
// The card stays clickable even when the data hasn't loaded or errored
// — selection should never be blocked on KPI fetches.

type Ga4TrafficPoint = { date?: string; activeUsers?: number };

function WebsiteCardGa4({
    propertyId,
    displayName,
    onClick,
    disabled,
}: {
    propertyId: string;
    displayName: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    const { data, isLoading, isError } = useAnalyticsData('all', propertyId, true, '30d', false);
    const traffic: Ga4TrafficPoint[] = Array.isArray(data?.traffic) ? data.traffic : [];
    const sparkData = useMemo(
        () => traffic.map((t) => ({ v: typeof t.activeUsers === 'number' ? t.activeUsers : 0 })),
        [traffic]
    );
    const total = useMemo(() => {
        if (typeof data?.kpis?.totalUsers === 'number') return data.kpis.totalUsers;
        return sparkData.reduce((sum, p) => sum + (p.v || 0), 0);
    }, [data, sparkData]);
    const hasSpark = sparkData.length > 1 && sparkData.some((p) => p.v > 0);
    const gradId = sparkGradId(propertyId);

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="group text-left rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-4 shadow-[0_22px_60px_rgba(0,0,0,0.30)] hover:border-[#14C4E1]/30 hover:bg-[#0c1219] hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Pick ${displayName}`}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0">
                    <GlobeIcon className="w-3 h-3 text-[#7AD9DA]" />
                </div>
                <div className="text-sm font-semibold text-white truncate flex-1">{displayName}</div>
            </div>

            <div className="h-12 w-full">
                {isLoading ? (
                    <div className="h-full w-full rounded bg-white/[0.02] animate-pulse" />
                ) : hasSpark ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#7AD9DA" stopOpacity={0.45} />
                                    <stop offset="100%" stopColor="#7AD9DA" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="v"
                                stroke="#7AD9DA"
                                strokeWidth={1.5}
                                fill={`url(#${gradId})`}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                        {isError ? 'No data' : '—'}
                    </div>
                )}
            </div>

            <div className="mt-3 flex items-center justify-between">
                <span className="text-[12.5px] text-zinc-300">
                    {isLoading ? <span className="inline-block w-12 h-3 rounded bg-white/[0.05] animate-pulse" /> : (
                        <>
                            <span className="font-semibold text-white">{formatCompact(total)}</span>{' '}
                            <span className="text-zinc-500">visitors</span>
                        </>
                    )}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all" />
            </div>
        </button>
    );
}

// ─── WebsiteCardGsc ─────────────────────────────────────────────────
// Symmetrical card for the GSC-only inverted branch. Shows total clicks
// + 30-day click sparkline pulled from /api/seo's `trend` array.

type GscTrendPoint = { date?: string; clicks?: number };

function WebsiteCardGsc({
    siteUrl,
    onClick,
}: {
    siteUrl: string;
    onClick: () => void;
}) {
    const { data, isLoading, isError } = useSeoData('all', siteUrl, true, '30d', false);
    const trend: GscTrendPoint[] = Array.isArray(data?.trend) ? data.trend : [];
    const sparkData = useMemo(
        () => trend.map((t) => ({ v: typeof t.clicks === 'number' ? t.clicks : 0 })),
        [trend]
    );
    const total = useMemo(() => {
        if (typeof data?.kpis?.totalClicks === 'number') return data.kpis.totalClicks;
        return sparkData.reduce((sum, p) => sum + (p.v || 0), 0);
    }, [data, sparkData]);
    const hasSpark = sparkData.length > 1 && sparkData.some((p) => p.v > 0);
    const gradId = sparkGradId(siteUrl);
    const label = formatSiteLabel(siteUrl);

    return (
        <button
            type="button"
            onClick={onClick}
            className="group text-left rounded-2xl border border-white/[0.08] bg-[#0a0d12]/80 backdrop-blur-sm p-4 shadow-[0_22px_60px_rgba(0,0,0,0.30)] hover:border-[#14C4E1]/30 hover:bg-[#0c1219] hover:-translate-y-0.5 transition-all"
            aria-label={`Pick ${label}`}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center flex-shrink-0">
                    <GlobeIcon className="w-3 h-3 text-[#7AD9DA]" />
                </div>
                <div className="text-sm font-semibold text-white truncate flex-1">{label}</div>
            </div>

            <div className="h-12 w-full">
                {isLoading ? (
                    <div className="h-full w-full rounded bg-white/[0.02] animate-pulse" />
                ) : hasSpark ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#7AD9DA" stopOpacity={0.45} />
                                    <stop offset="100%" stopColor="#7AD9DA" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="v"
                                stroke="#7AD9DA"
                                strokeWidth={1.5}
                                fill={`url(#${gradId})`}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-600">
                        {isError ? 'No data' : '—'}
                    </div>
                )}
            </div>

            <div className="mt-3 flex items-center justify-between">
                <span className="text-[12.5px] text-zinc-300">
                    {isLoading ? <span className="inline-block w-12 h-3 rounded bg-white/[0.05] animate-pulse" /> : (
                        <>
                            <span className="font-semibold text-white">{formatCompact(total)}</span>{' '}
                            <span className="text-zinc-500">clicks</span>
                        </>
                    )}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#7AD9DA] group-hover:translate-x-0.5 transition-all" />
            </div>
        </button>
    );
}

