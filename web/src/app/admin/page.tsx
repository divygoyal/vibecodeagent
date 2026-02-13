'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';

/* ─── types ─── */
type SystemStatus = {
    total_users: number;
    running_containers: number;
    plan_breakdown: Record<string, number>;
    max_users: number;
    available_slots: number;
};

type UserInfo = {
    id: number;
    github_id: string;
    github_username: string | null;
    plan: string;
    container_status: string;
    container_port: number | null;
    is_active: boolean;
    created_at: string;
    container?: {
        status: string;
        health: string;
        memory_usage_mb?: number;
        container_id?: string;
        uptime?: string;
    };
};

type ContainerEvent = {
    id: number;
    user_id: number;
    container_id: string;
    event_type: string;
    details: string | null;
    created_at: string;
};

type UserDetail = {
    user: any;
    logs: { logs: string } | null;
};

/* ─── helpers ─── */
function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

const planBadgeClass: Record<string, string> = {
    free: 'badge-free',
    starter: 'badge-starter',
    pro: 'badge-pro',
};

const statusBadgeClass: Record<string, string> = {
    running: 'badge-running',
    stopped: 'badge-stopped',
    error: 'badge-error',
};

/* ═══════════════════════════════════════════════════════ */
export default function AdminPage() {
    const { data: session, status: sessionStatus } = useSession();
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [events, setEvents] = useState<ContainerEvent[]>([]);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'events'>('users');

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, usersRes, eventsRes] = await Promise.all([
                fetch('/api/admin?endpoint=status'),
                fetch('/api/admin?endpoint=users'),
                fetch('/api/admin?endpoint=events'),
            ]);

            if (statusRes.ok) setSystemStatus(await statusRes.json());
            if (usersRes.ok) setUsers(await usersRes.json());
            if (eventsRes.ok) setEvents(await eventsRes.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    const fetchUserDetail = useCallback(async (githubId: string) => {
        try {
            const res = await fetch(`/api/admin?endpoint=user-detail&id=${githubId}`);
            if (res.ok) setUserDetail(await res.json());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (session?.user) {
            fetchData();
            const interval = setInterval(fetchData, 20000);
            return () => clearInterval(interval);
        }
    }, [session, fetchData]);

    useEffect(() => {
        if (selectedUser) fetchUserDetail(selectedUser);
    }, [selectedUser, fetchUserDetail]);

    const handleAction = async (action: string, githubId: string) => {
        setActionLoading(`${action}-${githubId}`);
        try {
            await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, githubId }),
            });
            setTimeout(fetchData, 2000);
            if (action === 'delete') {
                setSelectedUser(null);
                setUserDetail(null);
            }
        } catch { /* silent */ }
        finally { setActionLoading(null); }
    };

    /* ─── Auth check ─── */
    if (sessionStatus === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-zinc-400 text-sm">Loading admin panel...</span>
                </div>
            </div>
        );
    }

    if (!session?.user) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <p className="text-zinc-500">Please sign in first.</p>
            </div>
        );
    }

    /* ═══════════════════════════════════════════════ */
    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* ─── Header ─── */}
            <header className="border-b border-zinc-800/50 px-6 py-3 backdrop-blur-sm bg-zinc-950/80 sticky top-0 z-50">
                <div className="max-w-[1400px] mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🦞</span>
                        <h1 className="text-lg font-bold tracking-tight">
                            <span className="gradient-text">VibeCode</span>
                            <span className="text-zinc-500 ml-2 text-sm font-normal">Admin</span>
                        </h1>
                        <span className="badge bg-emerald-400/15 text-emerald-400 text-[9px] ml-1">GOD MODE</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Dashboard</a>
                        {session.user?.image && (
                            <img src={session.user.image} alt="" className="w-6 h-6 rounded-full ring-1 ring-zinc-700" />
                        )}
                    </div>
                </div>
            </header>

            <div className="max-w-[1400px] mx-auto px-6 py-6">
                {/* ─── System Overview ─── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                        {
                            label: 'Total Users',
                            value: systemStatus?.total_users ?? '—',
                            icon: '👥',
                            sub: `${systemStatus?.available_slots ?? '—'} slots left`,
                            color: 'text-blue-400',
                        },
                        {
                            label: 'Running',
                            value: systemStatus?.running_containers ?? '—',
                            icon: '🟢',
                            sub: `of ${systemStatus?.total_users ?? '—'} containers`,
                            color: 'text-emerald-400',
                        },
                        {
                            label: 'Plans',
                            value: Object.entries(systemStatus?.plan_breakdown || {}).map(([k, v]) => `${v} ${k}`).join(', ') || '—',
                            icon: '📊',
                            sub: 'breakdown',
                            color: 'text-purple-400',
                            small: true,
                        },
                        {
                            label: 'Capacity',
                            value: `${Math.round(((systemStatus?.total_users ?? 0) / (systemStatus?.max_users ?? 50)) * 100)}%`,
                            icon: '⚡',
                            sub: `max ${systemStatus?.max_users ?? 50}`,
                            color: 'text-amber-400',
                        },
                    ].map((stat) => (
                        <div key={stat.label} className="glass-card p-4 fade-in">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{stat.label}</span>
                                <span className="text-lg">{stat.icon}</span>
                            </div>
                            <div className={`${stat.small ? 'text-sm' : 'text-2xl'} font-bold ${stat.color}`}>
                                {stat.value}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-1">{stat.sub}</div>
                        </div>
                    ))}
                </div>

                {/* ─── Tabs ─── */}
                <div className="flex gap-1 mb-4">
                    {(['users', 'events'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all ${activeTab === tab
                                    ? 'bg-zinc-800 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex gap-6">
                    {/* ─── Main Content ─── */}
                    <div className={`${selectedUser ? 'flex-1' : 'w-full'} transition-all`}>
                        {activeTab === 'users' ? (
                            /* ─── Users Table ─── */
                            <div className="glass-card-static overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>User</th>
                                                <th>GitHub ID</th>
                                                <th>Plan</th>
                                                <th>Status</th>
                                                <th>Port</th>
                                                <th>Memory</th>
                                                <th>Created</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map((user) => {
                                                const isSelected = selectedUser === user.github_id;
                                                const statusDot = user.container_status === 'running'
                                                    ? 'bg-emerald-400 pulse-live'
                                                    : user.container_status === 'error'
                                                        ? 'bg-red-400'
                                                        : 'bg-zinc-600';

                                                return (
                                                    <tr
                                                        key={user.github_id}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`cursor-pointer ${isSelected ? 'bg-zinc-800/40' : ''}`}
                                                        onClick={() => setSelectedUser(user.github_id)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedUser(user.github_id); }}
                                                    >
                                                        <td>
                                                            <div className="flex items-center gap-2.5">
                                                                <img
                                                                    src={`https://avatars.githubusercontent.com/u/${user.github_id}`}
                                                                    alt=""
                                                                    className="w-7 h-7 rounded-full ring-1 ring-zinc-700"
                                                                />
                                                                <div>
                                                                    <div className="text-sm font-medium text-zinc-200">
                                                                        {user.github_username || 'unknown'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <code className="text-xs text-zinc-400 font-mono">{user.github_id}</code>
                                                        </td>
                                                        <td>
                                                            <span className={`badge ${planBadgeClass[user.plan] || 'badge-free'}`}>
                                                                {user.plan}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                                                                <span className={`badge ${statusBadgeClass[user.container_status] || 'badge-stopped'}`}>
                                                                    {user.container_status}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <code className="text-xs text-zinc-500 font-mono">
                                                                {user.container_port || '—'}
                                                            </code>
                                                        </td>
                                                        <td>
                                                            <span className="text-xs text-zinc-400">
                                                                {user.container?.memory_usage_mb ? `${user.container.memory_usage_mb}MB` : '—'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className="text-xs text-zinc-500">{timeAgo(user.created_at)}</span>
                                                        </td>
                                                        <td>
                                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    onClick={() => handleAction('restart', user.github_id)}
                                                                    disabled={actionLoading === `restart-${user.github_id}`}
                                                                    className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-30"
                                                                    title="Restart"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm(`Delete user ${user.github_username || user.github_id}?`)) {
                                                                            handleAction('delete', user.github_id);
                                                                        }
                                                                    }}
                                                                    disabled={actionLoading === `delete-${user.github_id}`}
                                                                    className="p-1.5 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-30"
                                                                    title="Delete"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {users.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-12 text-zinc-600">
                                                        No users yet
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            /* ─── Events Timeline ─── */
                            <div className="glass-card-static p-6">
                                <div className="space-y-3">
                                    {events.map((event) => {
                                        const iconMap: Record<string, string> = { create: '+', delete: '×', upgrade: '↑', restart: '↻' };
                                        const colorMap: Record<string, string> = {
                                            create: 'bg-emerald-400/15 text-emerald-400',
                                            delete: 'bg-red-400/15 text-red-400',
                                            upgrade: 'bg-purple-400/15 text-purple-400',
                                            restart: 'bg-amber-400/15 text-amber-400',
                                        };

                                        return (
                                            <div key={event.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-zinc-800/30 transition-colors">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${colorMap[event.event_type] || 'bg-zinc-700/50 text-zinc-400'}`}>
                                                    {iconMap[event.event_type] || '•'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-zinc-200 uppercase">{event.event_type}</span>
                                                        <code className="text-[10px] text-zinc-600 font-mono truncate">{event.container_id?.substring(0, 12)}</code>
                                                    </div>
                                                    {event.details && (
                                                        <p className="text-xs text-zinc-500 mt-0.5">{event.details}</p>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo(event.created_at)}</span>
                                            </div>
                                        );
                                    })}
                                    {events.length === 0 && (
                                        <p className="text-zinc-600 text-sm text-center py-8">No events yet</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── User Detail Sidebar ─── */}
                    {selectedUser && userDetail && (
                        <div className="w-96 shrink-0">
                            <div className="glass-card-static p-5 sticky top-16">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">User Detail</h3>
                                    <button
                                        onClick={() => { setSelectedUser(null); setUserDetail(null); }}
                                        className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg"
                                    >
                                        ×
                                    </button>
                                </div>

                                {userDetail.user && (
                                    <div className="space-y-4">
                                        {/* Profile */}
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://avatars.githubusercontent.com/u/${selectedUser}`}
                                                alt=""
                                                className="w-12 h-12 rounded-full ring-2 ring-zinc-700"
                                            />
                                            <div>
                                                <div className="font-semibold text-zinc-200">
                                                    {userDetail.user.github_username || 'Unknown'}
                                                </div>
                                                <div className="text-xs text-zinc-500">
                                                    ID: {selectedUser}
                                                </div>
                                                {userDetail.user.email && (
                                                    <div className="text-xs text-zinc-500">{userDetail.user.email}</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info Grid */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { label: 'Plan', value: userDetail.user.plan, badge: true },
                                                { label: 'Status', value: userDetail.user.container?.status || 'unknown' },
                                                { label: 'Port', value: userDetail.user.container_port || '—' },
                                                { label: 'Memory', value: userDetail.user.container?.memory_usage_mb ? `${userDetail.user.container.memory_usage_mb}MB` : '—' },
                                                { label: 'Active', value: userDetail.user.is_active ? 'Yes' : 'No' },
                                                { label: 'Created', value: timeAgo(userDetail.user.created_at) },
                                            ].map(item => (
                                                <div key={item.label} className="bg-zinc-800/30 rounded-lg p-2.5">
                                                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{item.label}</div>
                                                    <div className="text-xs text-zinc-300 font-medium mt-0.5">
                                                        {item.badge ? (
                                                            <span className={`badge ${planBadgeClass[String(item.value)] || 'badge-free'}`}>
                                                                {String(item.value)}
                                                            </span>
                                                        ) : String(item.value)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Container ID */}
                                        {userDetail.user.container?.container_id && (
                                            <div className="bg-zinc-800/30 rounded-lg p-3">
                                                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Container ID</div>
                                                <code className="text-xs text-zinc-300 font-mono break-all">
                                                    {userDetail.user.container.container_id}
                                                </code>
                                            </div>
                                        )}

                                        {/* Logs */}
                                        {userDetail.logs && (
                                            <div>
                                                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Recent Logs</div>
                                                <div className="bg-zinc-900 rounded-lg p-3 max-h-60 overflow-y-auto">
                                                    <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                                                        {typeof userDetail.logs === 'string'
                                                            ? userDetail.logs
                                                            : (userDetail.logs as any)?.logs || 'No logs available'}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-2">
                                            <button
                                                onClick={() => handleAction('restart', selectedUser)}
                                                disabled={!!actionLoading}
                                                className="flex-1 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30"
                                            >
                                                Restart
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Delete this user and all their data?')) {
                                                        handleAction('delete', selectedUser);
                                                    }
                                                }}
                                                disabled={!!actionLoading}
                                                className="flex-1 px-3 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
