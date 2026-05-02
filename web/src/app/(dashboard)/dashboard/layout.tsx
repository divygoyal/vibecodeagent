'use client';

import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AIChatbot = dynamic(() => import('@/components/AIChatbot'), { ssr: false });
import ErrorBoundary from '@/components/ErrorBoundary';
const CreditWelcome = dynamic(() => import('@/components/CreditWelcome'), { ssr: false });
const OnboardingWizard = dynamic(() => import('@/components/OnboardingWizard'), { ssr: false });
import DatePicker, { MobileDatePicker } from '@/components/DatePicker';
import Image from 'next/image';
import {
    LayoutDashboard, Bot, BarChart3, Search, Settings,
    ChevronLeft, ChevronRight, LogOut, Menu, X,
    Coins, MessageCircle, MessageSquare,
    ChevronDown, Bell, Globe, Sparkles, Target, type LucideIcon
} from 'lucide-react';
import {
    type Ga4Availability,
    type PropertyOption,
    type SiteOption,
    formatSiteLabel,
    resolveDashboardSelection,
} from '@/lib/dashboardSelection';
import { DEMO_DOMAIN_LABEL } from '@/lib/demoWorkspace';
import { useCredits, useAlerts, useContainerStatus, useSiteList, usePropertyList } from '@/lib/useDashboardData';
import { isPushEnabled, sendBrowserNotification } from '@/lib/pushNotifications';
import { useChatStore } from '@/stores/chatStore';

// Extended user type — id is added via JWT callback in auth.ts
type SessionUser = { id?: string; name?: string | null; email?: string | null; image?: string | null };
type AlertItem = {
    id: string | number;
    title?: string;
    metric?: string;
    severity?: 'critical' | 'warning' | 'success' | string;
};

// Registration context to coordinate registration with data fetching
interface RegistrationContextType {
    isRegistered: boolean;
    isRegistering: boolean;
    registrationError: string | null;
    retryRegistration: () => void;
    selectedProperty: string;
    setSelectedProperty: (v: string) => void;
    selectedSite: string;
    setSelectedSite: (v: string) => void;
    resolvedPropertyId: string;
    resolvedSiteUrl: string;
    hasGa4Properties: boolean;
    ga4Availability: Ga4Availability;
    propertyInventoryError: string | null;
    siteInventoryError: string | null;
    propertyInventoryLoading: boolean;
    siteInventoryLoading: boolean;
    isDemoWorkspace: boolean;
    demoDomainLabel: string;
    range: string;
    setRange: (v: string) => void;
}

const RegistrationContext = createContext<RegistrationContextType>({
    isRegistered: false,
    isRegistering: true,
    registrationError: null,
    retryRegistration: () => { },
    selectedProperty: '',
    setSelectedProperty: () => { },
    selectedSite: '',
    setSelectedSite: () => { },
    resolvedPropertyId: '',
    resolvedSiteUrl: '',
    hasGa4Properties: false,
    ga4Availability: 'inventory_empty',
    propertyInventoryError: null,
    siteInventoryError: null,
    propertyInventoryLoading: false,
    siteInventoryLoading: false,
    isDemoWorkspace: false,
    demoDomainLabel: DEMO_DOMAIN_LABEL,
    range: '30d',
    setRange: () => { },
});

export const useRegistration = () => useContext(RegistrationContext);

function getInventoryErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'info' in error) {
        const info = (error as { info?: { error?: string } }).info;
        if (info?.error) {
            return info.error;
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return null;
}

type SidebarItem = { icon: LucideIcon; label: string; href: string };
type SidebarGroup = { label: string | null; items: SidebarItem[] };

const sidebarGroups: SidebarGroup[] = [
    { label: null, items: [
        { icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
    ]},
    { label: 'Intelligence', items: [
        { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/ai-chat' },
        { icon: Bot, label: 'Bot', href: '/dashboard/bot' },
    ]},
    { label: 'Analysis', items: [
        { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
        { icon: Search, label: 'SEO', href: '/dashboard/seo' },
    ]},
    { label: 'Social APIs', items: [
        { icon: Sparkles, label: 'X mentions', href: '/dashboard/x-api' },
        { icon: MessageCircle, label: 'Reddit mentions', href: '/dashboard/reddit-api' },
        { icon: Globe, label: 'Globe API', href: '/dashboard/globe' },
    ]},
    { label: 'Growth', items: [
        { icon: Target, label: 'Opportunities', href: '/dashboard/opportunities' },
    ]},
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const isOverviewRoute = pathname === '/dashboard';
    const isAnalyticsMainRoute = pathname === '/dashboard/analytics';
    const shellRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-xl';
    const shellCompactRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-lg';
    const shellBadgeRadiusClass = isOverviewRoute ? 'rounded-none' : 'rounded-full';
    const brandAccentColor = '#7AD9DA';
    const sidebarActiveItemClasses = 'border border-[#14C4E1]/24 bg-[linear-gradient(180deg,rgba(20,196,225,0.16),rgba(7,48,60,0.16))] text-[#7AD9DA] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(5,24,34,0.24)]';
    const sidebarInactiveItemClasses = 'border border-transparent text-zinc-400 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.06]';
    const { credits, plan: userPlan, subscriptionCancelled } = useCredits();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    // User-scoped localStorage helper — prevents cross-user data leaks
    const user = session?.user as SessionUser | undefined;
    const getUserKey = useCallback((key: string) => {
        const uid = user?.id || user?.email || '';
        return uid ? `${key}:${uid}` : key;
    }, [user?.id, user?.email]);

    // Immediate onboarding check — runs on session, NOT registration
    useEffect(() => {
        if (!user) return;
        const welcomeKey = getUserKey('tc-welcomed');
        const onboardKey = getUserKey('tc-onboarded');
        if (!localStorage.getItem(welcomeKey)) {
            localStorage.setItem(welcomeKey, 'true');
            if (!localStorage.getItem(onboardKey)) {
                setShowOnboarding(true);
            } else {
                setShowWelcome(true);
            }
        }
    }, [user, getUserKey]);

    const [selectedProperty, setSelectedProperty] = useState('');
    const [selectedSite, setSelectedSite] = useState('');
    const [showWelcome, setShowWelcome] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [range, setRange] = useState('30d');
    useEffect(() => {
        if (!mobileOpen) {
            setSiteDropdownOpen(false);
        }
    }, [mobileOpen]);

    useEffect(() => {
        setSiteDropdownOpen(false);
    }, [pathname]);

    // Load user-scoped selections and chat history once session is available
    useEffect(() => {
        if (!user) return;
        // Scope chat store to current user
        const uid = user.id || user.email || '';
        if (uid) useChatStore.getState().setCurrentUser(uid);
        // Load saved property/site/range
        const propKey = getUserKey('tc-last-property');
        const siteKey = getUserKey('tc-last-site');
        const rangeKey = getUserKey('tc-last-range');
        const savedProp = localStorage.getItem(propKey) || '';
        const savedSite = localStorage.getItem(siteKey) || '';
        const savedRange = localStorage.getItem(rangeKey) || '30d';
        if (savedProp) setSelectedProperty(savedProp);
        if (savedSite) setSelectedSite(savedSite);
        if (savedRange) setRange(savedRange);
    }, [user, getUserKey]);
    const [bellOpen, setBellOpen] = useState(false);
    const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

    // Logout handler — clears user-scoped data to prevent cross-user leaks
    const handleSignOut = useCallback(() => {
        // Clear chat history
        useChatStore.getState().clearChat();
        // Clear user-scoped localStorage keys (any key containing user ID)
        const uid = user?.id || user?.email || '';
        if (uid) {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.endsWith(`:${uid}`)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        }
        // Clear legacy non-scoped keys (from before this fix)
        ['tc-last-property', 'tc-last-site', 'tc-last-range', 'tc-chat-history',
         'tc-credit-usage', 'tc-last-briefing-date', 'tc-onboarded', 'tc-welcomed',
         'tc-notification-prefs', 'tc-push-enabled'].forEach(k => localStorage.removeItem(k));
        // Clear session storage
        sessionStorage.removeItem('tc-registered');
        sessionStorage.removeItem('tc-registered-user');
        signOut({ callbackUrl: '/' });
    }, [user?.id, user?.email]);

    // Close bell dropdown on route change
    useEffect(() => {
        setBellOpen(false);
    }, [pathname]);

    // Close bell dropdown on any click outside
    const bellRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!bellOpen) return;
        const handler = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [bellOpen]);

    // Alerts for notification bell
    const { hasGoogleConnection } = useContainerStatus();
    const {
        sites: gscSites,
        isLoading: siteInventoryLoading,
        error: siteInventoryRequestError,
    } = useSiteList(hasGoogleConnection);
    const {
        properties,
        isLoading: propertyInventoryLoading,
        error: propertyInventoryRequestError,
    } = usePropertyList(hasGoogleConnection);
    const typedSites = gscSites as SiteOption[];
    const typedProperties = properties as PropertyOption[];
    const siteInventoryError = getInventoryErrorMessage(siteInventoryRequestError);
    const propertyInventoryError = getInventoryErrorMessage(propertyInventoryRequestError);
    const selection = useMemo(() => resolveDashboardSelection({
        selectedSite,
        selectedProperty,
        sites: typedSites,
        properties: typedProperties,
        siteInventoryError,
        propertyInventoryError,
    }), [propertyInventoryError, selectedProperty, selectedSite, siteInventoryError, typedProperties, typedSites]);
    const {
        resolvedSiteUrl,
        resolvedPropertyId,
        hasGa4Properties,
        ga4Availability,
    } = selection;
    const isDemoWorkspace = hasGoogleConnection
        && !siteInventoryLoading
        && !propertyInventoryLoading
        && !siteInventoryError
        && !propertyInventoryError
        && typedSites.length === 0
        && typedProperties.length === 0;
    const displaySiteUrl = resolvedSiteUrl || (siteInventoryError ? selectedSite : '');

    useEffect(() => {
        if (!user) return;
        const siteKey = getUserKey('tc-last-site');

        if (resolvedSiteUrl) {
            if (resolvedSiteUrl !== selectedSite) {
                setSelectedSite(resolvedSiteUrl);
            }
            localStorage.setItem(siteKey, resolvedSiteUrl);
            return;
        }

        if (!siteInventoryError && selectedSite) {
            setSelectedSite('');
            localStorage.removeItem(siteKey);
        }
    }, [getUserKey, resolvedSiteUrl, selectedSite, setSelectedSite, siteInventoryError, user]);

    useEffect(() => {
        if (!user) return;
        const propertyKey = getUserKey('tc-last-property');

        if (resolvedPropertyId) {
            if (resolvedPropertyId !== selectedProperty) {
                setSelectedProperty(resolvedPropertyId);
            }
            localStorage.setItem(propertyKey, resolvedPropertyId);
            return;
        }

        if (!propertyInventoryError && selectedProperty) {
            setSelectedProperty('');
            localStorage.removeItem(propertyKey);
        }
    }, [getUserKey, propertyInventoryError, resolvedPropertyId, selectedProperty, setSelectedProperty, user]);

    const alertSiteUrl = displaySiteUrl || typedSites[0]?.siteUrl || '';
    const { alerts, alertCount } = useAlerts(alertSiteUrl, hasGoogleConnection && !!alertSiteUrl);
    const typedAlerts = alerts as AlertItem[];
    const criticalAlertCount = typedAlerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning').length;
    const mobileOverviewSiteLabel = (() => {
        const siteUrl = displaySiteUrl || typedSites[0]?.siteUrl || '';
        if (!siteUrl) return 'Dashboard';
        return formatSiteLabel(siteUrl);
    })();

    // Send browser push notifications for new critical alerts
    const prevAlertCountRef = useRef(criticalAlertCount);
    useEffect(() => {
        if (criticalAlertCount > prevAlertCountRef.current && isPushEnabled()) {
            const newAlerts = typedAlerts.filter((alert) => alert.severity === 'critical');
            if (newAlerts.length > 0) {
                sendBrowserNotification(
                    'TrafficClaw Alert',
                    newAlerts[0].title || 'New critical alert detected',
                    { tag: 'critical-alert', onClick: () => setBellOpen(true) }
                );
            }
        }
        prevAlertCountRef.current = criticalAlertCount;
    }, [criticalAlertCount, typedAlerts]);

    // Enforce dark mode — clear any stale light-mode preference
    useEffect(() => {
        localStorage.removeItem('gc-theme');
        document.documentElement.setAttribute('data-theme', 'dark');
    }, []);

    // Persist selected property/site to user-scoped localStorage
    useEffect(() => {
        if (selectedProperty && user) localStorage.setItem(getUserKey('tc-last-property'), selectedProperty);
    }, [selectedProperty, user, getUserKey]);
    useEffect(() => {
        if (selectedSite && user) localStorage.setItem(getUserKey('tc-last-site'), selectedSite);
    }, [selectedSite, user, getUserKey]);
    useEffect(() => {
        if (range && user) localStorage.setItem(getUserKey('tc-last-range'), range);
    }, [range, user, getUserKey]);

    // Dark mode only — theme toggle removed

    // Registration state — check sessionStorage first to avoid re-registering on refresh
    // Bug #3 fix: validate cached registration belongs to current user
    const [registrationState, setRegistrationState] = useState({
        isRegistered: false,
        isRegistering: true,
        registrationError: null as string | null,
    });

    // Bug #1 fix: prevent duplicate registration calls with a ref
    const registrationAttempted = useRef(false);
    const registrationCacheHydrated = useRef(false);

    // Bug #3 fix: clear registration flag on sign-out so a different account doesn't reuse it
    useEffect(() => {
        if (status === 'unauthenticated') {
            sessionStorage.removeItem('tc-registered');
            sessionStorage.removeItem('tc-registered-user');
        }
    }, [status]);

    useEffect(() => {
        if (!session?.user || registrationCacheHydrated.current) return;

        registrationCacheHydrated.current = true;

        const cached = sessionStorage.getItem('tc-registered');
        const cachedUser = sessionStorage.getItem('tc-registered-user');
        const currentUser = session.user.email || session.user.name || '';

        if (cached === 'true' && cachedUser && cachedUser === currentUser) {
            registrationAttempted.current = true;
            setRegistrationState({
                isRegistered: true,
                isRegistering: false,
                registrationError: null,
            });
        }
    }, [session?.user]);

    // Bug #3 fix: if session user email doesn't match cached user, invalidate cache
    useEffect(() => {
        if (session?.user?.email) {
            const cachedUser = sessionStorage.getItem('tc-registered-user');
            if (cachedUser && cachedUser !== session.user.email) {
                // Different user — clear stale cache
                sessionStorage.removeItem('tc-registered');
                sessionStorage.removeItem('tc-registered-user');
                registrationAttempted.current = false;
                setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
            }
        }
    }, [session?.user?.email]);

    const getRegistrationWarning = useCallback((reason?: string) => {
        const normalized = (reason || '').toLowerCase();

        if (normalized.includes('abort') || normalized.includes('timed out')) {
            return 'Background provider sync is taking longer than usual. The dashboard will keep loading while we retry.';
        }

        if (normalized.includes('missing-admin-api-key') || normalized.includes('missing-session-data')) {
            return 'Background provider sync is temporarily unavailable. The dashboard will keep loading in degraded mode.';
        }

        return 'Background provider sync is delayed right now. The dashboard can still load while connected features catch up.';
    }, []);

    const applyDegradedRegistration = useCallback((reason?: string) => {
        setRegistrationState({
            isRegistered: true,
            isRegistering: false,
            registrationError: getRegistrationWarning(reason),
        });
    }, [getRegistrationWarning]);

    useEffect(() => {
        // Skip if already registered
        if (registrationState.isRegistered) return;
        // Bug #1 fix: don't reset state when session is briefly undefined — just wait
        if (!session?.user) return;
        // Bug #1 fix: prevent re-entry if registration is already in-flight
        if (registrationAttempted.current) return;
        registrationAttempted.current = true;

        const registerProvider = async () => {
            try {
                setRegistrationState(prev => ({ ...prev, isRegistering: true, registrationError: null }));

                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data?.synced) {
                        // Persist in sessionStorage with user identity only after admin sync succeeds
                        sessionStorage.setItem('tc-registered', 'true');
                        sessionStorage.setItem('tc-registered-user', session.user?.email || session.user?.name || '');
                        setRegistrationState({
                            isRegistered: true,
                            isRegistering: false,
                            registrationError: null,
                        });
                    } else if (data?.registered || data?.degraded) {
                        applyDegradedRegistration(data?.reason);
                    } else {
                        throw new Error(data?.reason || 'Provider sync is still pending');
                    }
                } else {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to register provider');
                }
            } catch (err) {
                console.warn('Registration degraded:', err);
                applyDegradedRegistration(err instanceof Error ? err.message : undefined);
            }
        };

        registerProvider();
    }, [applyDegradedRegistration, registrationState.isRegistered, session?.user?.email]); // Bug #1 fix: stable dependency — only changes on actual login

    // Bug #6 fix: retry callback so child components can retry without full page reload
    const retryRegistration = useCallback(() => {
        registrationAttempted.current = false;
        setRegistrationState({ isRegistered: false, isRegistering: true, registrationError: null });
    }, []);

    // Bug #13 fix: redirect to login if session is expired/unauthenticated
    if (status === 'unauthenticated') {
        return (
            <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-zinc-500 mb-4">Your session has expired</p>
                    <button
                        onClick={() => signIn()}
                        className="px-5 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 font-medium text-sm"
                    >
                        Sign In Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex max-w-[100vw]">
            <a href="#main-content" className="skip-to-content">Skip to content</a>
            {/* ─── Sidebar (Desktop) ─── */}
            <aside
                className={`relative hidden lg:flex flex-col border-r border-white/[0.06] bg-[linear-gradient(180deg,#04070c_0%,#050913_16%,#020306_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] transition-all duration-300 sticky top-0 h-screen overflow-y-auto overflow-x-visible ${collapsed ? 'w-[68px]' : 'w-[248px]'
                    }`}
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(20,196,225,0.16),transparent_64%),radial-gradient(circle_at_top_right,rgba(122,217,218,0.1),transparent_48%)]" />
                {siteDropdownOpen && (
                    <button
                        type="button"
                        className="fixed inset-0 z-[60] hidden cursor-default bg-transparent lg:block"
                        onClick={() => setSiteDropdownOpen(false)}
                        aria-label="Close site selector"
                    />
                )}
                {/* Logo */}
                <div className="relative z-10 h-16 flex items-center px-4 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
                    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
                        <Image src="/icon.svg" alt="TrafficClaw" width={32} height={32} className={`${shellCompactRadiusClass} flex-shrink-0`} />
                        {!collapsed && (
                            <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">
                                Traffic<span style={{ color: brandAccentColor }}>Claw</span>
                            </span>
                        )}
                    </Link>
                </div>

                {/* Site selector */}
                {gscSites.length > 0 && (
                    <div className={`relative px-2.5 pt-3 pb-1.5 ${siteDropdownOpen ? 'z-[80]' : 'z-10'}`}>
                        <div className="relative">
                            <button
                                onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                                className={`relative z-[90] w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] border border-white/[0.08] shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${shellCompactRadiusClass} hover:border-[#14C4E1]/24 hover:bg-[linear-gradient(180deg,rgba(16,24,34,0.94),rgba(8,13,20,0.96))] transition ${collapsed ? 'justify-center' : ''}`}
                                aria-label="Switch site"
                            >
                                <div className={`w-4 h-4 ${isOverviewRoute ? 'rounded-none' : 'rounded'} bg-[#14C4E1]/14 flex items-center justify-center flex-shrink-0`}>
                                    <Globe className="w-2.5 h-2.5 text-[#7AD9DA]" />
                                </div>
                                {!collapsed && (
                                    <>
                                        <span className="flex-1 text-left truncate font-medium">{displaySiteUrl ? formatSiteLabel(displaySiteUrl) : 'Select site'}</span>
                                        <ChevronDown className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                                    </>
                                )}
                            </button>
                            {siteDropdownOpen && (
                                <div className={`absolute ${collapsed ? 'left-full ml-2 top-0' : 'left-0 right-0 mt-2'} z-[95] bg-[linear-gradient(180deg,#09131c_0%,#040912_100%)] border border-[#14C4E1]/20 ${shellRadiusClass} shadow-[0_26px_60px_rgba(0,0,0,0.48)] py-1.5 min-w-[220px] max-h-[260px] overflow-y-auto backdrop-blur-xl`}>
                                        <div className="px-3 pb-1.5 pt-0.5">
                                            <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">Sites</span>
                                        </div>
                                        {typedSites.map((site) => {
                                            const url = site.siteUrl;
                                            const label = url.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                            const isSelected = url === displaySiteUrl;
                                            return (
                                                <button
                                                    key={url}
                                                    onClick={() => { setSelectedSite(url); setSiteDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2.5 transition ${
                                                        isSelected ? 'text-[#7AD9DA] bg-[#14C4E1]/[0.10]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{label}</span>
                                                    {isSelected && <span className={`w-1.5 h-1.5 ${shellBadgeRadiusClass} bg-[#7AD9DA] ml-auto flex-shrink-0`} />}
                                                </button>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Grouped nav items */}
                <nav className={`relative z-10 flex-1 py-2 px-2.5 overflow-y-auto transition-opacity duration-200 ${siteDropdownOpen ? 'pointer-events-none opacity-35' : ''}`} aria-label="Main navigation">
                    {sidebarGroups.map((group, gi) => (
                        <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-[var(--divider)]' : ''}>
                            {group.label && !collapsed && (
                                <div className="px-3 pb-1 pt-0.5">
                                    <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{group.label}</span>
                                </div>
                            )}
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`flex items-center gap-3 px-3 py-2.5 ${shellRadiusClass} text-sm font-medium transition-all duration-200 group ${isActive
                                                ? sidebarActiveItemClasses
                                                : sidebarInactiveItemClasses
                                            }`}
                                        >
                                            <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-[#7AD9DA]' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                            {!collapsed && <span className="truncate">{item.label}</span>}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Bottom section: Settings + Credits + User + Collapse */}
                <div className={`relative z-10 border-t border-[var(--divider)] p-2.5 space-y-1.5 transition-opacity duration-200 ${siteDropdownOpen ? 'pointer-events-none opacity-35' : ''}`}>
                    {/* Settings link */}
                    {(() => {
                        const isSettingsActive = pathname.startsWith('/dashboard/settings');
                        return (
                            <Link
                                href="/dashboard/settings"
                                className={`flex items-center gap-3 px-3 py-2.5 ${shellRadiusClass} text-sm font-medium transition-all duration-200 group ${isSettingsActive
                                    ? sidebarActiveItemClasses
                                    : sidebarInactiveItemClasses
                                }`}
                            >
                                <Settings className={`w-[18px] h-[18px] flex-shrink-0 ${isSettingsActive ? 'text-[#7AD9DA]' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                {!collapsed && <span className="truncate">Settings</span>}
                            </Link>
                        );
                    })()}

                    {/* Credits badge */}
                    {credits !== null && !collapsed && (
                        <Link
                            href="/dashboard/plan"
                            className={`flex items-center gap-2.5 px-3 py-2 ${shellRadiusClass} border transition-all hover:opacity-80 ${credits < 20
                                ? 'bg-red-500/[0.08] border-red-500/[0.15]'
                                : credits < 50
                                    ? 'bg-amber-500/[0.08] border-amber-500/[0.15]'
                                    : 'bg-[#14C4E1]/[0.08] border-[#14C4E1]/[0.18]'
                            }`}
                        >
                            <Coins className={`w-3.5 h-3.5 ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-[#7AD9DA]'}`} />
                            <span className={`text-[11px] font-bold ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-[#7AD9DA]'}`}>{credits} msgs</span>
                        </Link>
                    )}

                    {/* User profile */}
                    {session?.user && !collapsed && (
                        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <Link href="/dashboard/plan" className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                                {session.user.image && (
                                    <Image
                                        src={session.user.image}
                                        alt=""
                                        width={28}
                                        height={28}
                                        className={`w-7 h-7 ${shellBadgeRadiusClass} ring-1 ring-white/[0.1]`}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                        {session.user.name}
                                        <span
                                            className={`text-[8px] px-1.5 py-0.5 ${shellBadgeRadiusClass} font-bold uppercase tracking-wider leading-none ${
                                                subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                : userPlan === 'growth' ? 'bg-gradient-to-r from-[#7AD9DA] to-cyan-400 text-[#041015]'
                                                : userPlan === 'starter' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                                                : 'bg-zinc-700 text-zinc-400'
                                            }`}
                                        >
                                            {subscriptionCancelled ? 'Ending' : userPlan === 'free' ? 'Free' : userPlan === 'starter' ? 'Starter' : userPlan === 'growth' ? 'Growth' : userPlan === 'pro' ? 'Pro' : 'Free'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-zinc-600 truncate">
                                        {session.user.email}
                                    </div>
                                </div>
                            </Link>
                            <button
                                onClick={handleSignOut}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                                aria-label="Sign out"
                                title="Sign out"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className={`w-full flex items-center justify-center py-2.5 text-zinc-600 hover:text-[#7AD9DA] transition-colors ${shellCompactRadiusClass} border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]`}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </aside>

            {/* ─── Main content area ─── */}
            <div className={`flex-1 flex flex-col min-h-screen w-full min-w-0 ${isOverviewRoute ? 'bg-[#010203]' : ''}`}>
                {/* Top bar — minimal: just date picker + bell */}
                <header className={`border-b border-[var(--card-border)] ${isOverviewRoute ? 'bg-[#020305]/95' : 'bg-[var(--header-bg)]'} backdrop-blur-xl sticky top-0 z-40`}>
                    <div className="flex h-12 items-center px-3 sm:px-4 md:px-6">
                        {/* Mobile menu button */}
                        <button
                            className="lg:hidden text-zinc-400 hover:text-white flex-shrink-0 mr-auto"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            aria-label="Open navigation menu"
                            aria-expanded={mobileOpen}
                        >
                            <Menu className="w-5 h-5" />
                        </button>

                        {/* Right side controls */}
                        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0">
                            {/* Global Date Range Picker — desktop here, compact mobile version rendered below on overview */}
                            <div className={`hidden md:block ${isAnalyticsMainRoute ? 'invisible pointer-events-none w-0 overflow-hidden' : ''}`}>
                                <DatePicker range={range} setRange={setRange} />
                            </div>
                            {/* Notification Bell */}
                            <div className="relative" ref={bellRef}>
                                <button
                                    onClick={() => setBellOpen(!bellOpen)}
                                    className={`relative w-8 h-8 ${shellCompactRadiusClass} flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all flex-shrink-0`}
                                    aria-label={`Alerts${criticalAlertCount > 0 ? ` (${criticalAlertCount} active)` : ''}`}
                                    aria-expanded={bellOpen}
                                    aria-haspopup="true"
                                    title="Alerts"
                                >
                                    <Bell className="w-4 h-4" />
                                    {criticalAlertCount > 0 && (
                                        <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 ${shellBadgeRadiusClass} bg-red-500 text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-[var(--background)]`}>
                                            {criticalAlertCount > 9 ? '9+' : criticalAlertCount}
                                        </span>
                                    )}
                                </button>
                                {bellOpen && (
                                    <div className={`absolute right-0 mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] ${shellRadiusClass} shadow-2xl py-1 w-[280px] sm:w-[320px] max-w-[calc(100vw-2rem)] max-h-[400px] overflow-hidden`}>
                                        <div className="px-4 py-2.5 border-b border-[var(--divider)] flex items-center justify-between">
                                            <span className="text-xs font-semibold text-white">Alerts</span>
                                            {alertCount > 0 && (
                                                <span className="text-[10px] text-zinc-500">{alertCount} active</span>
                                            )}
                                        </div>
                                        <div className="overflow-y-auto max-h-[300px]">
                                            {alerts.length === 0 ? (
                                                <div className="px-4 py-6 text-center">
                                                    <Bell className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
                                                    <p className="text-[11px] text-zinc-600">No alerts right now</p>
                                                </div>
                                            ) : (
                                                typedAlerts.slice(0, 10).map((alert) => (
                                                    <div key={alert.id} className="px-4 py-2.5 hover:bg-white/[0.03] transition border-b border-[var(--divider)] last:border-0">
                                                        <div className="flex items-start gap-2.5">
                                                            <div className={`w-2 h-2 ${shellBadgeRadiusClass} mt-1.5 flex-shrink-0 ${
                                                                alert.severity === 'critical' ? 'bg-red-400' :
                                                                alert.severity === 'warning' ? 'bg-amber-400' :
                                                                alert.severity === 'success' ? 'bg-emerald-400' : 'bg-blue-400'
                                                            }`} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-medium text-zinc-200 leading-snug">{alert.title}</p>
                                                                {alert.metric && (
                                                                    <p className="text-[10px] text-zinc-500 mt-0.5">{alert.metric}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        {alerts.length > 0 && (
                                            <div className="px-4 py-2 border-t border-[var(--divider)]">
                                                <Link
                                                    href="/dashboard"
                                                    onClick={() => setBellOpen(false)}
                                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium transition"
                                                >
                                                    View all alerts →
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {isOverviewRoute && (
                        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 md:hidden">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold tracking-tight text-white">
                                    {mobileOverviewSiteLabel}
                                </div>
                            </div>
                            <div className="shrink-0">
                                <DatePicker range={range} setRange={setRange} compact />
                            </div>
                        </div>
                    )}
                </header>

                {/* Page content */}
                <main id="main-content" className={`flex-1 overflow-y-auto overflow-x-hidden p-3 max-w-full sm:p-4 md:p-6 ${isOverviewRoute ? 'bg-[#010203]' : ''}`} role="main">
                    <div className="max-w-7xl mx-auto">
                        <RegistrationContext.Provider value={{
                            ...registrationState,
                            retryRegistration,
                            selectedProperty,
                            setSelectedProperty,
                            selectedSite,
                            setSelectedSite,
                            resolvedPropertyId,
                            resolvedSiteUrl,
                            hasGa4Properties,
                            ga4Availability,
                            propertyInventoryError,
                            siteInventoryError,
                            propertyInventoryLoading,
                            siteInventoryLoading,
                            isDemoWorkspace,
                            demoDomainLabel: DEMO_DOMAIN_LABEL,
                            range,
                            setRange,
                        }}>
                            <ErrorBoundary>{children}</ErrorBoundary>
                        </RegistrationContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global AI Chatbot — available on every page */}
            <AIChatbot />

            {/* Credit welcome animation (first signup only) */}
            {showWelcome && (
                <CreditWelcome credits={10} onDismiss={() => setShowWelcome(false)} />
            )}

            {/* Onboarding wizard for first-time users */}
            {showOnboarding && (
                <OnboardingWizard
                    onComplete={() => { setShowOnboarding(false); setShowWelcome(true); }}
                    onSelectSite={setSelectedSite}
                    onSelectProperty={setSelectedProperty}
                    storageKey={getUserKey('tc-onboarded')}
                />
            )}

            {/* ─── Mobile sidebar overlay ─── */}
            {mobileOpen && (
                <>
                    {/* Full-screen overlay — tap anywhere to dismiss */}
                    <div
                        className="fixed inset-0 bg-[#02050b]/72 backdrop-blur-sm z-50 lg:hidden cursor-pointer"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setMobileOpen(false); }}
                    />
                    <div className="fixed left-0 top-0 bottom-0 z-50 flex w-[296px] max-w-[88vw] flex-col overflow-hidden rounded-r-[30px] border-r border-white/[0.08] bg-[linear-gradient(180deg,#050914_0%,#060b12_18%,#020306_100%)] shadow-[0_30px_70px_rgba(0,0,0,0.45)] lg:hidden">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(20,196,225,0.18),transparent_64%),radial-gradient(circle_at_top_right,rgba(122,217,218,0.1),transparent_48%)]" />
                        {siteDropdownOpen && (
                            <button
                                type="button"
                                className="absolute inset-0 z-40 cursor-default bg-[#040914]/78 backdrop-blur-[2px]"
                                onClick={() => setSiteDropdownOpen(false)}
                                aria-label="Close site selector"
                            />
                        )}
                        {/* Header with logo and close */}
                        <div className="relative z-10 flex h-16 items-center justify-between border-b border-white/[0.06] px-4 pt-[env(safe-area-inset-top,0px)]">
                            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                                <Image src="/icon.svg" alt="TrafficClaw" width={28} height={28} className="rounded-lg" />
                                <span className="text-sm font-bold text-[var(--text-primary)]">
                                    Traffic<span style={{ color: brandAccentColor }}>Claw</span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="text-zinc-400 w-10 h-10 flex items-center justify-center -mr-2 rounded-xl border border-transparent hover:border-white/[0.08] hover:text-white hover:bg-white/[0.06] transition-colors active:bg-white/[0.1]"
                                aria-label="Close navigation menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mobile site selector — shown when multiple sites */}
                        {gscSites.length > 1 && (
                            <div className={`relative px-3 pt-3 pb-1.5 ${siteDropdownOpen ? 'z-[80]' : 'z-10'}`}>
                                <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1 mb-1.5 block">Site</label>
                                <button
                                    onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                                    className="relative z-[90] w-full flex items-center gap-2.5 px-3 py-3 text-xs text-zinc-300 bg-[linear-gradient(180deg,rgba(12,18,26,0.92),rgba(6,10,16,0.94))] border border-white/[0.08] rounded-2xl shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:border-[#14C4E1]/24 hover:bg-[linear-gradient(180deg,rgba(16,24,34,0.94),rgba(8,13,20,0.96))] transition"
                                >
                                    <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-[#14C4E1]/12">
                                        <Globe className="w-3.5 h-3.5 text-[#7AD9DA] flex-shrink-0" />
                                    </div>
                                    <span className="flex-1 text-left truncate">{displaySiteUrl ? formatSiteLabel(displaySiteUrl) : 'Select site'}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {siteDropdownOpen && (
                                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[95] rounded-2xl bg-[linear-gradient(180deg,#09131d_0%,#040913_100%)] border border-[#14C4E1]/18 shadow-[0_24px_50px_rgba(0,0,0,0.45)] py-1.5 max-h-[220px] overflow-y-auto backdrop-blur-xl">
                                        {typedSites.map((site) => {
                                            const url = site.siteUrl;
                                            const label = url.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                            const isSelected = url === displaySiteUrl;
                                            return (
                                                <button
                                                    key={url}
                                                    onClick={() => { setSelectedSite(url); setSiteDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 min-h-[44px] transition ${
                                                        isSelected ? 'text-[#7AD9DA] bg-[#14C4E1]/[0.10]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{label}</span>
                                                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#7AD9DA] ml-auto flex-shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={`relative z-10 flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${siteDropdownOpen ? 'pointer-events-none opacity-35' : ''}`}>
                            {/* Mobile date range picker */}
                            <MobileDatePicker range={range} setRange={setRange} />

                            {/* Divider before nav */}
                            <div className="mx-3 mt-2 border-t border-[var(--divider)]" />

                            {/* Grouped navigation items */}
                            <nav className="relative z-10 flex-1 py-2 px-3 overflow-y-auto">
                                {sidebarGroups.map((group, gi) => (
                                    <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-[var(--divider)]' : ''}>
                                        {group.label && (
                                            <div className="px-3 pb-1 pt-0.5">
                                                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{group.label}</span>
                                            </div>
                                        )}
                                        <div className="space-y-0.5">
                                            {group.items.map((item) => {
                                                const isActive = pathname === item.href ||
                                                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setMobileOpen(false)}
                                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-2xl text-sm font-medium transition-all active:scale-[0.98] ${isActive
                                                            ? sidebarActiveItemClasses
                                                            : sidebarInactiveItemClasses + ' active:bg-white/[0.08]'
                                                        }`}
                                                    >
                                                        <item.icon className={`w-5 h-5 ${isActive ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                                        <span>{item.label}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {/* Settings in mobile nav */}
                                <div className="mt-2 pt-2 border-t border-[var(--divider)]">
                                    <Link
                                        href="/dashboard/settings"
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-2xl text-sm font-medium transition-all active:scale-[0.98] ${pathname.startsWith('/dashboard/settings')
                                            ? sidebarActiveItemClasses
                                            : sidebarInactiveItemClasses + ' active:bg-white/[0.08]'
                                        }`}
                                    >
                                        <Settings className={`w-5 h-5 ${pathname.startsWith('/dashboard/settings') ? 'text-[#7AD9DA]' : 'text-zinc-500'}`} />
                                        <span>Settings</span>
                                    </Link>
                                </div>
                            </nav>

                            {/* Credits display in mobile sidebar */}
                            {credits !== null && (
                                <div className="border-t border-[var(--divider)] px-3 py-3">
                                    <Link
                                        href="/dashboard/plan"
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border hover:opacity-80 transition-opacity ${credits < 20
                                        ? 'bg-red-500/[0.08] border-red-500/[0.15]'
                                        : credits < 50
                                            ? 'bg-amber-500/[0.08] border-amber-500/[0.15]'
                                            : 'bg-[#14C4E1]/[0.08] border-[#14C4E1]/[0.18]'
                                        }`}>
                                        <Coins className={`w-4 h-4 ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-[#7AD9DA]'}`} />
                                        <span className={`text-xs font-bold ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-[#7AD9DA]'}`}>{credits} messages</span>
                                        {userPlan === 'free' && (
                                            <Sparkles className="w-3 h-3 text-amber-400/70 ml-auto" />
                                        )}
                                    </Link>
                                </div>
                            )}

                            {/* User profile and sign out */}
                            {session?.user && (
                                <div className="border-t border-[var(--divider)] p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
                                    <div className="flex items-center gap-3 rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                        <Link href="/dashboard/plan" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                            {session.user.image && (
                                                <Image src={session.user.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                                    {session.user.name}
                                                    <span
                                                        className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none ${
                                                            subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                            : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                            : userPlan === 'growth' ? 'bg-gradient-to-r from-[#7AD9DA] to-cyan-400 text-[#041015]'
                                                            : userPlan === 'starter' ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                                                            : 'bg-zinc-700 text-zinc-400'
                                                        }`}
                                                    >
                                                        {subscriptionCancelled ? 'Ending' : userPlan === 'free' ? 'Free' : userPlan === 'starter' ? 'Starter' : userPlan === 'growth' ? 'Growth' : userPlan === 'pro' ? 'Pro' : 'Free'}
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>
                                        <button
                                            onClick={handleSignOut}
                                            className="text-zinc-600 hover:text-zinc-400 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
                                            aria-label="Sign out"
                                        >
                                            <LogOut className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {/* Mobile upgrade hint */}
                                    {userPlan !== 'pro' && (
                                        <Link
                                            href="/dashboard/plan"
                                            onClick={() => setMobileOpen(false)}
                                            className="mt-2 flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.06] border border-violet-500/[0.1] hover:border-violet-500/[0.2] transition-all active:scale-[0.98]"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                            <span className="text-xs text-zinc-400">
                                                {userPlan === 'free' ? 'Upgrade to Pro' : 'Upgrade plan'}
                                            </span>
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
