'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AIChatbot = dynamic(() => import('@/components/AIChatbot'), { ssr: false });
const CreditWelcome = dynamic(() => import('@/components/CreditWelcome'), { ssr: false });
const OnboardingWizard = dynamic(() => import('@/components/OnboardingWizard'), { ssr: false });
const FloatingAuditBanner = dynamic(() => import('@/components/FloatingAuditBanner'), { ssr: false });
import DatePicker, { MobileDatePicker } from '@/components/DatePicker';
import Image from 'next/image';
import {
    LayoutDashboard, Bot, BarChart3, Search, Settings, ScanSearch,
    ChevronLeft, ChevronRight, LogOut, Menu, X,
    Book, Newspaper, Coins, MessageSquare,
    ChevronDown, Bell, Globe, CreditCard, Sparkles, Target
} from 'lucide-react';
import { useCredits, useAlerts, useContainerStatus, useSiteList } from '@/lib/useDashboardData';
import { isPushEnabled, sendBrowserNotification } from '@/lib/pushNotifications';
import { useChatStore } from '@/stores/chatStore';

// Extended user type — id is added via JWT callback in auth.ts
type SessionUser = { id?: string; name?: string | null; email?: string | null; image?: string | null };

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
    range: '30d',
    setRange: () => { },
});

export const useRegistration = () => useContext(RegistrationContext);

const sidebarItems = [
    { icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
    { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/ai-chat' },
    { icon: Bot, label: 'Bot', href: '/dashboard/bot' },
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    { icon: Search, label: 'SEO', href: '/dashboard/seo' },
    { icon: Target, label: 'Opportunities', href: '/dashboard/opportunities' },
    { icon: ScanSearch, label: 'Audit', href: '/dashboard/audit' },
    { icon: CreditCard, label: 'Plan', href: '/dashboard/plan' },
    { icon: Globe, label: 'Globe API', href: '/dashboard/globe' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

// Date range presets moved to DatePicker component

const resourceItems = [
    { icon: Book, label: 'Docs', href: '/dashboard/docs' },
    { icon: Newspaper, label: 'Blog', href: '/dashboard/blog' },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
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
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const alertSiteUrl = selectedSite || (gscSites.length > 0 ? gscSites[0].siteUrl : '');
    const { alerts, alertCount } = useAlerts(alertSiteUrl, hasGoogleConnection && !!alertSiteUrl);
    const criticalAlertCount = alerts.filter((a: any) => a.severity === 'critical' || a.severity === 'warning').length;

    // Send browser push notifications for new critical alerts
    const prevAlertCountRef = useRef(criticalAlertCount);
    useEffect(() => {
        if (criticalAlertCount > prevAlertCountRef.current && isPushEnabled()) {
            const newAlerts = alerts.filter((a: any) => a.severity === 'critical');
            if (newAlerts.length > 0) {
                sendBrowserNotification(
                    'TrafficClaw Alert',
                    newAlerts[0].title || 'New critical alert detected',
                    { tag: 'critical-alert', onClick: () => setBellOpen(true) }
                );
            }
        }
        prevAlertCountRef.current = criticalAlertCount;
    }, [criticalAlertCount, alerts]);

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
    const [registrationState, setRegistrationState] = useState(() => {
        if (typeof window !== 'undefined') {
            const cached = sessionStorage.getItem('tc-registered');
            const cachedUser = sessionStorage.getItem('tc-registered-user');
            // Only trust cache if a user identity was stored with it
            if (cached === 'true' && cachedUser) {
                return { isRegistered: true, isRegistering: false, registrationError: null as string | null };
            }
        }
        return { isRegistered: false, isRegistering: true, registrationError: null as string | null };
    });

    // Bug #1 fix: prevent duplicate registration calls with a ref
    const registrationAttempted = useRef(false);

    // Bug #3 fix: clear registration flag on sign-out so a different account doesn't reuse it
    useEffect(() => {
        if (status === 'unauthenticated') {
            sessionStorage.removeItem('tc-registered');
            sessionStorage.removeItem('tc-registered-user');
        }
    }, [status]);

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
                    // Persist in sessionStorage with user identity
                    sessionStorage.setItem('tc-registered', 'true');
                    sessionStorage.setItem('tc-registered-user', session.user?.email || session.user?.name || '');
                    setRegistrationState({
                        isRegistered: true,
                        isRegistering: false,
                        registrationError: null,
                    });
                } else {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to register provider');
                }
            } catch (err) {
                console.error('Registration error:', err);
                setRegistrationState({
                    isRegistered: false,
                    isRegistering: false,
                    registrationError: err instanceof Error ? err.message : 'Registration failed',
                });
            }
        };

        registerProvider();
    }, [session?.user?.email]); // Bug #1 fix: stable dependency — only changes on actual login

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
                className={`hidden lg:flex flex-col border-r border-[var(--card-border)] bg-[var(--sidebar-bg)] transition-all duration-300 sticky top-0 h-screen overflow-y-auto ${collapsed ? 'w-[68px]' : 'w-[240px]'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center px-4 border-b border-[var(--divider)]">
                    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
                        <Image src="/icon.svg" alt="TrafficClaw" width={32} height={32} className="rounded-lg flex-shrink-0" />
                        {!collapsed && (
                            <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">
                                Traffic<span className="text-emerald-400">Claw</span>
                            </span>
                        )}
                    </Link>
                </div>

                {/* Nav items */}
                <nav className="flex-1 py-3 px-2 space-y-1" aria-label="Main navigation">
                    {sidebarItems.map((item) => {
                        const isActive = pathname === item.href ||
                            (item.href !== '/dashboard' && pathname.startsWith(item.href));

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                    ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                                    }`} />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </Link>
                        );
                    })}

                    {/* Resources divider */}
                    {!collapsed && (
                        <div className="pt-3 mt-2 border-t border-[var(--divider)]">
                            <span className="px-3 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Resources</span>
                        </div>
                    )}
                    {collapsed && <div className="mt-2 border-t border-[var(--divider)]" />}
                    {resourceItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                    ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                            >
                                <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Keyboard shortcuts hint */}
                {!collapsed && (
                    <div className="mx-3 mt-1 mb-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-[var(--divider)]">
                        <p className="text-[10px] text-zinc-600 mb-1.5">Shortcuts</p>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500">Search</span>
                                <kbd className="kbd-hint">⌘K</kbd>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500">Help</span>
                                <kbd className="kbd-hint">?</kbd>
                            </div>
                        </div>
                    </div>
                )}

                {/* User section + collapse toggle */}
                <div className="border-t border-[var(--divider)] p-3 space-y-2">
                    {session?.user && !collapsed && (
                        <div className="flex items-center gap-3 px-2 py-2">
                            <Link href="/dashboard/plan" className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                                {session.user.image && (
                                    <img
                                        src={session.user.image}
                                        alt=""
                                        className="w-7 h-7 rounded-full ring-1 ring-white/[0.1]"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                        {session.user.name}
                                        <span
                                            className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none ${
                                                subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                : userPlan === 'growth' ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black'
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
                    {/* Subtle upgrade hint for non-pro users */}
                    {session?.user && !collapsed && userPlan !== 'pro' && (
                        <Link
                            href="/dashboard/plan"
                            className="mx-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.06] border border-violet-500/[0.1] hover:border-violet-500/[0.2] transition-all group"
                        >
                            <Sparkles className="w-3 h-3 text-violet-400 group-hover:text-violet-300 transition-colors" />
                            <span className="text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                {userPlan === 'free' ? 'Upgrade to Pro' : 'Upgrade plan'}
                            </span>
                        </Link>
                    )}

                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="w-full flex items-center justify-center py-2 text-zinc-600 hover:text-zinc-400 transition-colors rounded-lg hover:bg-white/[0.04]"
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
            <div className="flex-1 flex flex-col min-h-screen w-full min-w-0">
                {/* Top bar */}
                <header className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 md:px-6 border-b border-[var(--card-border)] bg-[var(--header-bg)] backdrop-blur-xl sticky top-0 z-40">
                    {/* Mobile menu button */}
                    <button
                        className="lg:hidden text-zinc-400 hover:text-white flex-shrink-0"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Open navigation menu"
                        aria-expanded={mobileOpen}
                    >
                        <Menu className="w-5 h-5" />
                    </button>

                    {/* Breadcrumb navigation */}
                    <nav className="flex items-center gap-1.5 text-sm flex-wrap overflow-hidden" aria-label="Breadcrumb">
                        {/* Mobile: just the page name */}
                        {(() => {
                            const currentItem = [...sidebarItems, ...resourceItems].find(i =>
                                pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))
                            );
                            const segments = pathname.replace('/dashboard/', '').split('/');
                            const pageName = currentItem?.label || segments[segments.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Dashboard';
                            return (
                                <span className="sm:hidden text-sm font-semibold text-[var(--text-primary)]">
                                    {pathname === '/dashboard' ? 'Dashboard' : pageName}
                                </span>
                            );
                        })()}
                        {/* Desktop: full breadcrumb */}
                        <Link href="/dashboard" className="hidden sm:inline text-zinc-500 hover:text-zinc-300 transition-colors font-medium">
                            Dashboard
                        </Link>
                        {pathname !== '/dashboard' && (() => {
                            const segments = pathname.replace('/dashboard/', '').split('/');
                            const currentItem = [...sidebarItems, ...resourceItems].find(i =>
                                pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))
                            );
                            return (
                                <>
                                    <ChevronRight className="hidden sm:block w-3 h-3 text-zinc-600" />
                                    <span className={`hidden sm:inline text-zinc-300 font-semibold`}>
                                        {currentItem?.label || segments[segments.length - 1]?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </span>
                                    {segments.length > 1 && currentItem && (
                                        <>
                                            <ChevronRight className="hidden sm:block w-3 h-3 text-zinc-600" />
                                            <span className="hidden sm:inline text-zinc-300 font-semibold">
                                                {segments[segments.length - 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            </span>
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </nav>

                    {/* Right side */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {/* Global Site Switcher */}
                        {gscSites.length > 1 && (
                            <div className="relative">
                                <button
                                    onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                                    className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition max-w-[160px] md:max-w-[200px]"
                                    aria-label="Switch site"
                                >
                                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">{selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : 'Site'}</span>
                                    <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {siteDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setSiteDropdownOpen(false)} />
                                        <div className="absolute right-0 mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[260px] overflow-y-auto">
                                            {gscSites.map((site: any) => {
                                                const url = site.siteUrl || site;
                                                const label = url.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                                const isSelected = url === selectedSite;
                                                return (
                                                    <button
                                                        key={url}
                                                        onClick={() => { setSelectedSite(url); setSiteDropdownOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition ${
                                                            isSelected ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                        }`}
                                                    >
                                                        <Globe className="w-3 h-3 flex-shrink-0" />
                                                        <span className="truncate">{label}</span>
                                                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto flex-shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Global Date Range Picker — hidden on mobile, shown in mobile sidebar instead */}
                        <div className="hidden md:block">
                            <DatePicker range={range} setRange={setRange} />
                        </div>
                        {/* Notification Bell */}
                        <div className="relative" ref={bellRef}>
                            <button
                                onClick={() => setBellOpen(!bellOpen)}
                                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all flex-shrink-0"
                                aria-label={`Alerts${criticalAlertCount > 0 ? ` (${criticalAlertCount} active)` : ''}`}
                                aria-expanded={bellOpen}
                                aria-haspopup="true"
                                title="Alerts"
                            >
                                <Bell className="w-4 h-4" />
                                {criticalAlertCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-[var(--background)]">
                                        {criticalAlertCount > 9 ? '9+' : criticalAlertCount}
                                    </span>
                                )}
                            </button>
                            {bellOpen && (
                                <>
                                    <div className="absolute right-0 mt-1 z-50 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 w-[280px] sm:w-[320px] max-w-[calc(100vw-2rem)] max-h-[400px] overflow-hidden">
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
                                                alerts.slice(0, 10).map((alert: any) => (
                                                    <div key={alert.id} className="px-4 py-2.5 hover:bg-white/[0.03] transition border-b border-[var(--divider)] last:border-0">
                                                        <div className="flex items-start gap-2.5">
                                                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
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
                                </>
                            )}
                        </div>
                        {/* Theme toggle removed — dark mode only */}
                        {/* Credits badge — hidden on mobile, shown in mobile sidebar */}
                        {credits !== null && (
                            <Link href="/dashboard/plan" className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${credits < 20
                                ? 'bg-red-500/[0.08] border-red-500/[0.15]'
                                : credits < 50
                                    ? 'bg-amber-500/[0.08] border-amber-500/[0.15]'
                                    : 'bg-emerald-500/[0.08] border-emerald-500/[0.15]'
                                }`}>
                                <Coins className={`w-3 h-3 ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'
                                    }`} />
                                <span className={`text-[10px] font-bold ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'
                                    }`}>{credits} msgs</span>
                                {userPlan === 'free' && (
                                    <Sparkles className="w-2.5 h-2.5 text-amber-400/70" />
                                )}
                            </Link>
                        )}
                        {/* User avatar — hidden on mobile for cleaner header, visible on tablets without sidebar */}
                        {session?.user?.image && (
                            <img
                                src={session.user.image}
                                alt=""
                                className="w-7 h-7 rounded-full ring-1 ring-white/[0.1] hidden md:block lg:hidden"
                            />
                        )}
                    </div>
                </header>

                {/* Page content */}
                <main id="main-content" className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto overflow-x-hidden max-w-full" role="main">
                    <div className="max-w-7xl mx-auto">
                        <RegistrationContext.Provider value={{ ...registrationState, retryRegistration, selectedProperty, setSelectedProperty, selectedSite, setSelectedSite, range, setRange }}>
                            {children}
                        </RegistrationContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global AI Chatbot — available on every page */}
            <AIChatbot />

            {/* Floating audit banner — available on every page */}
            <FloatingAuditBanner />

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
                        className="fixed inset-0 bg-black/60 z-50 lg:hidden cursor-pointer"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setMobileOpen(false); }}
                    />
                    <div className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[var(--sidebar-bg)] border-r border-[var(--card-border)] z-50 lg:hidden flex flex-col">
                        {/* Header with logo and close */}
                        <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--divider)]">
                            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                                <Image src="/icon.svg" alt="TrafficClaw" width={28} height={28} className="rounded-lg" />
                                <span className="text-sm font-bold text-[var(--text-primary)]">
                                    Traffic<span className="text-emerald-400">Claw</span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="text-zinc-400 w-10 h-10 flex items-center justify-center -mr-2 rounded-lg hover:text-white hover:bg-white/[0.06] transition-colors active:bg-white/[0.1]"
                                aria-label="Close navigation menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mobile site selector — shown when multiple sites */}
                        {gscSites.length > 1 && (
                            <div className="px-3 pt-3 pb-1">
                                <label className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1 mb-1.5 block">Site</label>
                                <button
                                    onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition"
                                >
                                    <Globe className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                    <span className="flex-1 text-left truncate">{selectedSite ? selectedSite.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '') : 'Select site'}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform ${siteDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {siteDropdownOpen && (
                                    <div className="mt-1 bg-[var(--dropdown-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl py-1 max-h-[200px] overflow-y-auto">
                                        {gscSites.map((site: any) => {
                                            const url = site.siteUrl || site;
                                            const label = url.replace('sc-domain:', '').replace('https://', '').replace(/\/$/, '');
                                            const isSelected = url === selectedSite;
                                            return (
                                                <button
                                                    key={url}
                                                    onClick={() => { setSelectedSite(url); setSiteDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 min-h-[44px] transition ${
                                                        isSelected ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                    }`}
                                                >
                                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{label}</span>
                                                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto flex-shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Mobile date range picker */}
                        <MobileDatePicker range={range} setRange={setRange} />

                        {/* Divider before nav */}
                        <div className="mx-3 mt-2 border-t border-[var(--divider)]" />

                        {/* Navigation items */}
                        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
                            {sidebarItems.map((item) => {
                                const isActive = pathname === item.href ||
                                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${isActive
                                            ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04] active:bg-white/[0.08]'
                                            }`}
                                    >
                                        <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'
                                            }`} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}

                            {/* Resources divider */}
                            <div className="pt-3 mt-2 border-t border-[var(--divider)]">
                                <span className="px-3 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Resources</span>
                            </div>
                            {resourceItems.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${isActive
                                            ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04] active:bg-white/[0.08]'
                                            }`}
                                    >
                                        <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
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
                                        : 'bg-emerald-500/[0.08] border-emerald-500/[0.15]'
                                    }`}>
                                    <Coins className={`w-4 h-4 ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'}`} />
                                    <span className={`text-xs font-bold ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{credits} messages</span>
                                    {userPlan === 'free' && (
                                        <Sparkles className="w-3 h-3 text-amber-400/70 ml-auto" />
                                    )}
                                </Link>
                            </div>
                        )}

                        {/* User profile and sign out */}
                        {session?.user && (
                            <div className="border-t border-[var(--divider)] p-3">
                                <div className="flex items-center gap-3 px-2 py-2">
                                    <Link href="/dashboard/plan" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                        {session.user.image && (
                                            <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                                                {session.user.name}
                                                <span
                                                    className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider leading-none ${
                                                        subscriptionCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                        : userPlan === 'pro' ? 'bg-gradient-to-r from-violet-400 to-purple-500 text-white'
                                                        : userPlan === 'growth' ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black'
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
                </>
            )}
        </div>
    );
}
