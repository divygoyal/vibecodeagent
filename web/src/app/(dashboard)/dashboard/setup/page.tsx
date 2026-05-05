'use client';

/**
 * /dashboard/setup — Workspace data-source selection.
 *
 * The user picks at least ONE of:
 *   - a GA4 property
 *   - a Search Console site
 *
 * The workspace name (label) is fully auto-derived from the selection:
 * GA4 property displayName wins (more authoritative), else GSC root domain.
 * No user-typed name input — the label updates live as the selection changes
 * and is saved on Continue. Renaming is deferred to a future settings surface.
 *
 * When one side is picked and the other is empty, we surface a SOFT
 * SUGGESTION ("We found X — pair?") that the user explicitly accepts or
 * dismisses. No silent auto-fill, no mismatch warning.
 */
import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
    CheckCircle2, Search, Sparkles, ArrowRight, AlertTriangle,
    BarChart3, Globe as GlobeIcon, ScanSearch, X as XIcon,
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
        workspaceLabel: serverLabel,
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
    const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);

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

    // Workspace label is fully auto-derived from the selection — no user input.
    // Precedence: GA4 displayName wins (more authoritative), else GSC root
    // domain. Falls back to the GA4 propertyId when displayName is missing.
    // serverLabel from a previous save is shown if no fresh selection exists.
    const derivedLabel = useMemo(() => {
        if (chosenProperty) {
            const prop = properties.find((p) => p.property === chosenProperty);
            return prop?.displayName || prop?.property || chosenProperty;
        }
        if (chosenSite) return rootDomainFromSite(chosenSite);
        return serverLabel || '';
    }, [chosenProperty, chosenSite, properties, serverLabel]);

    // Suggestion: when one side is picked and the other is not, find a
    // token-overlap match in the inventory and surface it as a hint card.
    // The user explicitly accepts. No silent auto-fill.
    const suggestion = useMemo<{ kind: 'site' | 'property'; siteUrl?: string; propertyId?: string; label: string } | null>(() => {
        // GA4 picked, no GSC yet → suggest a GSC site.
        if (chosenProperty && !chosenSite && sites.length > 0) {
            const prop = properties.find((p) => p.property === chosenProperty);
            const propTokens = propertyTokens(prop);
            if (!propTokens.size) return null;
            for (const site of sites) {
                const { tokens } = siteHostTokens(site.siteUrl);
                if (tokensOverlap(propTokens, tokens)) {
                    if (dismissedSuggestion === site.siteUrl) return null;
                    return { kind: 'site', siteUrl: site.siteUrl, label: formatSiteLabel(site.siteUrl) };
                }
            }
        }
        // GSC picked, no GA4 yet → suggest a GA4 property.
        if (chosenSite && !chosenProperty && properties.length > 0) {
            const match = matchPropertyToSite(chosenSite, properties);
            if (match?.property && match.displayName) {
                if (dismissedSuggestion === match.property) return null;
                return { kind: 'property', propertyId: match.property, label: match.displayName };
            }
        }
        return null;
    }, [chosenProperty, chosenSite, properties, sites, dismissedSuggestion]);

    const acceptSuggestion = () => {
        if (!suggestion) return;
        if (suggestion.kind === 'site' && suggestion.siteUrl) setChosenSite(suggestion.siteUrl);
        if (suggestion.kind === 'property' && suggestion.propertyId) setChosenProperty(suggestion.propertyId);
    };

    const dismissSuggestion = () => {
        if (!suggestion) return;
        setDismissedSuggestion(suggestion.kind === 'site' ? (suggestion.siteUrl || '') : (suggestion.propertyId || ''));
    };

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

    const onContinue = async () => {
        if (!canContinue || saving) return;
        setSaving(true);
        setSaveError(null);
        // Label is fully auto-derived from the current selection. canContinue
        // guarantees at least one of property/site is set, so derivedLabel
        // will always be a non-empty string here.
        const ok = await saveWorkspace({
            property: chosenProperty || null,
            site: chosenSite || null,
            label: derivedLabel,
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

    // ─── Main flow: pick at least one data source ────────────────────

    return cosmicShell(
        <div className="max-w-5xl mx-auto py-10 sm:py-14 px-4 pb-32 sm:pb-14">
            <div className="text-center mb-10 sm:mb-12">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-3">
                    {greeting}, {userName}
                </p>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                    Set up your workspace
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
                    Pick a Google Analytics property or a Search Console site — at least one.
                    Your workspace name is set automatically from your selection.
                </p>
            </div>

            {/* Connect data sources */}
            <div className="mx-auto max-w-5xl">
                <div className="text-center mb-5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7AD9DA]">Connect data sources</span>
                    {derivedLabel && (
                        <p className="text-[11px] text-zinc-500 mt-1.5">
                            Workspace name: <span className="text-zinc-300 font-medium">{derivedLabel}</span>
                        </p>
                    )}
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                    <PickerColumn
                        icon={BarChart3}
                        iconColor="#7AD9DA"
                        title="Google Analytics"
                        subtitle="Realtime, retention, conversions"
                        badge={chosenProperty ? properties.find((p) => p.property === chosenProperty)?.displayName || 'Selected' : 'Optional'}
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
                        title="Search Console"
                        subtitle="Queries, pages, rankings"
                        badge={chosenSite ? formatSiteLabel(chosenSite) : 'Optional'}
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

                {/* Soft suggestion — explicit accept, never silent fill */}
                {suggestion && (
                    <div className="mt-5 mx-auto max-w-3xl rounded-xl border border-[#14C4E1]/24 bg-[#14C4E1]/[0.06] px-4 py-3 flex items-center gap-3 text-xs text-[#7AD9DA] backdrop-blur">
                        <Sparkles className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 min-w-0">
                            {suggestion.kind === 'site'
                                ? <>We found a Search Console site that looks related: <span className="font-semibold text-white">{suggestion.label}</span>. Pair it?</>
                                : <>We found a GA4 property that looks related: <span className="font-semibold text-white">{suggestion.label}</span>. Pair it?</>}
                        </span>
                        <button
                            type="button"
                            onClick={acceptSuggestion}
                            className="px-3 py-1.5 rounded-lg bg-[#14C4E1]/20 hover:bg-[#14C4E1]/30 border border-[#14C4E1]/30 text-[#7AD9DA] hover:text-white text-[11px] font-semibold transition-colors flex-shrink-0"
                        >
                            Pair
                        </button>
                        <button
                            type="button"
                            onClick={dismissSuggestion}
                            aria-label="Dismiss suggestion"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-colors flex-shrink-0"
                        >
                            <XIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {saveError && (
                <div className="mt-5 mx-auto max-w-3xl rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
                    {saveError}
                </div>
            )}

            {/* Continue — sticky on mobile, centered on desktop */}
            <div className="fixed sm:static bottom-0 inset-x-0 sm:bottom-auto sm:inset-x-auto sm:mt-10 px-4 sm:px-0 py-3 sm:py-0 bg-black/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-0 border-t border-white/[0.06] sm:border-0 z-10">
                <div className="max-w-5xl mx-auto sm:mx-0 flex flex-col items-center justify-center gap-2">
                    {!canContinue && !saving && (
                        <p className="text-[11px] text-zinc-500">
                            Pick at least one — a GA4 property or a Search Console site.
                        </p>
                    )}
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
