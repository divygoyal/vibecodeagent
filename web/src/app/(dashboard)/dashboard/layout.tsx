'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, Bot, BarChart3, Search, Settings,
    ChevronLeft, ChevronRight, Zap, LogOut, Menu, X,
    Book, Newspaper, History
} from 'lucide-react';

const sidebarItems = [
    { icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
    { icon: Bot, label: 'Bot', href: '/dashboard/bot' },
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    { icon: Search, label: 'SEO', href: '/dashboard/seo' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
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
    const { data: session } = useSession();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#09090b] text-white flex">
            {/* ─── Sidebar (Desktop) ─── */}
            <aside
                className={`hidden lg:flex flex-col border-r border-white/[0.06] bg-[#0c0c10] transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[240px]'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center px-4 border-b border-white/[0.06]">
                    <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-black" strokeWidth={3} />
                        </div>
                        {!collapsed && (
                            <span className="text-base font-bold text-white whitespace-nowrap">
                                Grow<span className="text-emerald-400">Claw</span>
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
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-medium text-emerald-400">Free Plan</span>
                        </div>
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
                        {children}
                    </div>
                </main>
            </div>

            {/* ─── Mobile sidebar overlay ─── */}
            {mobileOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 z-50 lg:hidden"
                        onClick={() => setMobileOpen(false)}
                    />
                    <div className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#0c0c10] border-r border-white/[0.06] z-50 lg:hidden flex flex-col">
                        <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.06]">
                            <Link href="/" className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-black" strokeWidth={3} />
                                </div>
                                <span className="text-base font-bold text-white">
                                    Grow<span className="text-emerald-400">Claw</span>
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
