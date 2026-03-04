'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AIChatbot = dynamic(() => import('@/components/AIChatbot'), { ssr: false });
const CreditWelcome = dynamic(() => import('@/components/CreditWelcome'), { ssr: false });
const OnboardingWizard = dynamic(() => import('@/components/OnboardingWizard'), { ssr: false });
import {
    LayoutDashboard, Bot, BarChart3, Search, Settings, ScanSearch,
    ChevronLeft, ChevronRight, Zap, LogOut, Menu, X,
    Book, Newspaper, History, Sun, Moon, Coins, Radar, MessageSquare,
    CalendarDays, ChevronDown, Bell, Eye
} from 'lucide-react';
import { useCredits, useAlerts, useContainerStatus, useSiteList } from '@/lib/useDashboardData';

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
    { icon: Radar, label: 'Intelligence', href: '/dashboard/intelligence' },
    { icon: Eye, label: 'AI Visibility', href: '/dashboard/ai-visibility' },
    { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/ai-chat' },
    { icon: Bot, label: 'Bot', href: '/dashboard/bot' },
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    { icon: Search, label: 'SEO', href: '/dashboard/seo' },
    { icon: ScanSearch, label: 'Audit', href: '/dashboard/audit' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

const RANGES = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: '7 days' },
    { value: '14d', label: '14 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '6m', label: '6 months' },
    { value: '12m', label: '12 months' },
];

const resourceItems = [
    { icon: Book, label: 'Docs', href: '/dashboard/docs' },
    { icon: Newspaper, label: 'Blog', href: '/dashboard/blog' },
    { icon: History, label: 'Changelog', href: '/dashboard/changelog' },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const { credits } = useCredits();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('tc-last-property') || '';
        return '';
    });
    const [selectedSite, setSelectedSite] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('tc-last-site') || '';
        return '';
    });
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [showWelcome, setShowWelcome] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [range, setRange] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('tc-last-range') || '30d';
        return '30d';
    });
    const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
    const [bellOpen, setBellOpen] = useState(false);

    // Alerts for notification bell
    const { hasGoogleConnection } = useContainerStatus();
    const { sites: gscSites } = useSiteList(hasGoogleConnection);
    const alertSiteUrl = selectedSite || (gscSites.length > 0 ? gscSites[0].siteUrl : '');
    const { alerts, alertCount } = useAlerts(alertSiteUrl, hasGoogleConnection && !!alertSiteUrl);
    const criticalAlertCount = alerts.filter((a: any) => a.severity === 'critical' || a.severity === 'warning').length;

    // Persist theme to localStorage and apply to <html>
    useEffect(() => {
        const saved = localStorage.getItem('gc-theme') as 'dark' | 'light' | null;
        if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved); }
    }, []);

    // Persist selected property/site to localStorage for instant load on return
    useEffect(() => {
        if (selectedProperty) localStorage.setItem('tc-last-property', selectedProperty);
    }, [selectedProperty]);
    useEffect(() => {
        if (selectedSite) localStorage.setItem('tc-last-site', selectedSite);
    }, [selectedSite]);
    useEffect(() => {
        if (range) localStorage.setItem('tc-last-range', range);
    }, [range]);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('gc-theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

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
                    // Show onboarding wizard on FIRST EVER signup (or credit welcome if already onboarded)
                    if (!localStorage.getItem('tc-welcomed')) {
                        localStorage.setItem('tc-welcomed', 'true');
                        if (!localStorage.getItem('tc-onboarded')) {
                            setShowOnboarding(true);
                        } else {
                            setShowWelcome(true);
                        }
                    }
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
            <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
                <div className="text-center">
                    <p className="text-zinc-400 mb-4">Your session has expired</p>
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
        <div className="min-h-screen bg-[#09090b] text-white flex">
            {/* ─── Sidebar (Desktop) ─── */}
            <aside
                className={`hidden lg:flex flex-col border-r border-white/[0.06] bg-[#0c0c10] transition-all duration-300 sticky top-0 h-screen overflow-y-auto ${collapsed ? 'w-[68px]' : 'w-[240px]'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center px-4 border-b border-white/[0.06]">
                    <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-black" strokeWidth={3} />
                        </div>
                        {!collapsed && (
                            <span className="text-base font-bold text-white whitespace-nowrap">
                                Traffic<span className="text-emerald-400">Claw</span>
                            </span>
                        )}
                    </Link>
                </div>

                {/* Nav items */}
                <nav className="flex-1 py-3 px-2 space-y-1">
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
                        <div className="pt-3 mt-2 border-t border-white/[0.04]">
                            <span className="px-3 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Resources</span>
                        </div>
                    )}
                    {collapsed && <div className="mt-2 border-t border-white/[0.04]" />}
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

                {/* User section + collapse toggle */}
                <div className="border-t border-white/[0.06] p-3 space-y-2">
                    {session?.user && !collapsed && (
                        <div className="flex items-center gap-3 px-2 py-2">
                            {session.user.image && (
                                <img
                                    src={session.user.image}
                                    alt=""
                                    className="w-7 h-7 rounded-full ring-1 ring-white/[0.1]"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-zinc-300 truncate">
                                    {session.user.name}
                                </div>
                                <div className="text-[10px] text-zinc-600 truncate">
                                    {session.user.email}
                                </div>
                            </div>
                            <button
                                onClick={() => signOut({ callbackUrl: '/' })}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                                title="Sign out"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
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
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Top bar */}
                <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-lg sticky top-0 z-40">
                    {/* Mobile menu button */}
                    <button
                        className="lg:hidden text-zinc-400 hover:text-white"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        <Menu className="w-5 h-5" />
                    </button>

                    {/* Page title */}
                    <div className="flex items-center gap-2">
                        <h1 className="text-sm font-semibold text-zinc-300">
                            {[...sidebarItems, ...resourceItems].find(i =>
                                pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))
                            )?.label || 'Dashboard'}
                        </h1>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3">
                        {/* Global Date Range Picker */}
                        <div className="relative">
                            <button
                                onClick={() => setRangeDropdownOpen(!rangeDropdownOpen)}
                                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition"
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                {RANGES.find(r => r.value === range)?.label || '30 days'}
                                <ChevronDown className={`w-3 h-3 transition-transform ${rangeDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {rangeDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setRangeDropdownOpen(false)} />
                                    <div className="absolute right-0 mt-1 z-50 bg-[#111116] border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[140px]">
                                        {RANGES.map(r => (
                                            <button
                                                key={r.value}
                                                onClick={() => { setRange(r.value); setRangeDropdownOpen(false); }}
                                                className={`w-full text-left px-3 py-2 text-[11px] transition ${
                                                    range === r.value ? 'text-emerald-400 bg-emerald-500/[0.08]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Notification Bell */}
                        <div className="relative">
                            <button
                                onClick={() => setBellOpen(!bellOpen)}
                                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                                title="Alerts"
                            >
                                <Bell className="w-4 h-4" />
                                {criticalAlertCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center ring-2 ring-[#09090b]">
                                        {criticalAlertCount > 9 ? '9+' : criticalAlertCount}
                                    </span>
                                )}
                            </button>
                            {bellOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                                    <div className="absolute right-0 mt-1 z-50 bg-[#111116] border border-white/[0.1] rounded-xl shadow-2xl py-1 w-[320px] max-h-[400px] overflow-hidden">
                                        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
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
                                                    <div key={alert.id} className="px-4 py-2.5 hover:bg-white/[0.03] transition border-b border-white/[0.04] last:border-0">
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
                                            <div className="px-4 py-2 border-t border-white/[0.06]">
                                                <Link
                                                    href="/dashboard/intelligence"
                                                    onClick={() => setBellOpen(false)}
                                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium transition"
                                                >
                                                    View all in Intelligence →
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Theme toggle */}
                        <button
                            onClick={toggleTheme}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        {/* Credits badge */}
                        {credits !== null && (
                            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${credits < 20
                                ? 'bg-red-500/[0.08] border-red-500/[0.15]'
                                : credits < 50
                                    ? 'bg-amber-500/[0.08] border-amber-500/[0.15]'
                                    : 'bg-emerald-500/[0.08] border-emerald-500/[0.15]'
                                }`}>
                                <Coins className={`w-3 h-3 ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'
                                    }`} />
                                <span className={`text-[10px] font-bold ${credits < 20 ? 'text-red-400' : credits < 50 ? 'text-amber-400' : 'text-emerald-400'
                                    }`}>{credits} msgs</span>
                            </div>
                        )}
                        {session?.user?.image && (
                            <img
                                src={session.user.image}
                                alt=""
                                className="w-7 h-7 rounded-full ring-1 ring-white/[0.1] lg:hidden"
                            />
                        )}
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                        <RegistrationContext.Provider value={{ ...registrationState, retryRegistration, selectedProperty, setSelectedProperty, selectedSite, setSelectedSite, range, setRange }}>
                            {children}
                        </RegistrationContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global AI Chatbot — available on every page */}
            <AIChatbot />

            {/* Credit welcome animation (first signup only) */}
            {showWelcome && (
                <CreditWelcome credits={50} onDismiss={() => setShowWelcome(false)} />
            )}

            {/* Onboarding wizard for first-time users */}
            {showOnboarding && (
                <OnboardingWizard
                    onComplete={() => { setShowOnboarding(false); setShowWelcome(true); }}
                    onSelectSite={setSelectedSite}
                    onSelectProperty={setSelectedProperty}
                />
            )}

            {/* ─── Mobile sidebar overlay ─── */}
            {mobileOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 z-50 lg:hidden"
                        onClick={() => setMobileOpen(false)}
                    />
                    <div className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#0c0c10] border-r border-white/[0.06] z-50 lg:hidden flex flex-col">
                        <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.06]">
                            <Link href="/dashboard" className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-black" strokeWidth={3} />
                                </div>
                                <span className="text-base font-bold text-white">
                                    Traffic<span className="text-emerald-400">Claw</span>
                                </span>
                            </Link>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="text-zinc-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <nav className="flex-1 py-3 px-2 space-y-1">
                            {sidebarItems.map((item) => {
                                const isActive = pathname === item.href ||
                                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                                            ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                            }`}
                                    >
                                        <item.icon className={`w-[18px] h-[18px] ${isActive ? 'text-emerald-400' : 'text-zinc-500'
                                            }`} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}

                            {/* Resources divider */}
                            <div className="pt-3 mt-2 border-t border-white/[0.04]">
                                <span className="px-3 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Resources</span>
                            </div>
                            {resourceItems.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                                            ? 'bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15]'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                            }`}
                                    >
                                        <item.icon className={`w-[18px] h-[18px] ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        {session?.user && (
                            <div className="border-t border-white/[0.06] p-3">
                                <div className="flex items-center gap-3 px-2 py-2">
                                    {session.user.image && (
                                        <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-zinc-300 truncate">{session.user.name}</div>
                                    </div>
                                    <button
                                        onClick={() => signOut({ callbackUrl: '/' })}
                                        className="text-zinc-600 hover:text-zinc-400"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
