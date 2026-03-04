'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Users, Bot, Coins, Server, Trash2, RefreshCw, Play, Square, RotateCw,
    Search, X, Shield, ChevronDown, LogOut, Eye, EyeOff, Plus, Minus,
    Terminal, Clock, AlertTriangle
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusData {
    total_users: number
    running_containers: number
    max_users: number
    plans: { free: number; starter: number; pro: number }
}

interface UserData {
    github_id: string
    username: string
    email: string
    plan: string
    avatar_url?: string
    created_at?: string
    container?: {
        status: string
        id?: string
    } | null
}

interface EventData {
    id: number
    event_type: string
    details: string
    timestamp: string
    github_id?: string
}

interface UserDetail {
    user: Record<string, unknown> | null
    logs: { logs: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('sa_token') || ''
}

async function apiGet(endpoint: string, id?: string) {
    const token = getToken()
    let url = `/api/superadmin?token=${encodeURIComponent(token)}&endpoint=${endpoint}`
    if (id) url += `&id=${encodeURIComponent(id)}`
    const res = await fetch(url)
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
    }
    return res.json()
}

async function apiPost(action: string, data: Record<string, unknown> = {}) {
    const token = getToken()
    const res = await fetch('/api/superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...data })
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
    }
    return res.json()
}

function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
    const [authenticated, setAuthenticated] = useState(false)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [authError, setAuthError] = useState('')
    const [authLoading, setAuthLoading] = useState(false)

    // Check existing token on mount
    useEffect(() => {
        const token = getToken()
        if (token) setAuthenticated(true)
    }, [])

    const handleAuth = async () => {
        setAuthLoading(true)
        setAuthError('')
        try {
            const res = await fetch('/api/superadmin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'auth', password })
            })
            const data = await res.json()
            if (!res.ok) {
                setAuthError(data.error || 'Authentication failed')
                return
            }
            sessionStorage.setItem('sa_token', data.token)
            sessionStorage.setItem('sa_expires', data.expiresAt.toString())
            setAuthenticated(true)
        } catch {
            setAuthError('Connection error')
        } finally {
            setAuthLoading(false)
        }
    }

    const handleSignOut = () => {
        sessionStorage.removeItem('sa_token')
        sessionStorage.removeItem('sa_expires')
        setAuthenticated(false)
        setPassword('')
    }

    if (!authenticated) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="w-full max-w-sm">
                    <div className="bg-zinc-900/50 border border-white/[0.04] rounded-2xl p-8">
                        <div className="flex items-center justify-center gap-3 mb-8">
                            <Shield className="w-8 h-8 text-emerald-400" />
                            <div>
                                <h1 className="text-xl font-bold text-white">TrafficClaw</h1>
                                <p className="text-xs text-zinc-500">Super Admin Access</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                                    placeholder="Enter password"
                                    className="w-full bg-black/50 border border-white/[0.08] rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 pr-10"
                                />
                                <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {authError && (
                                <p className="text-red-400 text-sm text-center">{authError}</p>
                            )}

                            <button
                                onClick={handleAuth}
                                disabled={authLoading || !password}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                            >
                                {authLoading ? 'Verifying...' : 'Unlock'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return <Dashboard onSignOut={handleSignOut} />
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
    const [tab, setTab] = useState<'users' | 'events' | 'system'>('users')
    const [status, setStatus] = useState<StatusData | null>(null)
    const [users, setUsers] = useState<UserData[]>([])
    const [events, setEvents] = useState<EventData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchData = useCallback(async () => {
        try {
            setError('')
            const [statusData, usersData, eventsData] = await Promise.all([
                apiGet('status'),
                apiGet('users'),
                apiGet('events')
            ])
            setStatus(statusData)
            setUsers(Array.isArray(usersData) ? usersData : [])
            setEvents(Array.isArray(eventsData) ? eventsData : [])
        } catch (err) {
            const e = err as Error
            if (e.message === 'Unauthorized') {
                sessionStorage.removeItem('sa_token')
                window.location.reload()
                return
            }
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        refreshTimerRef.current = setInterval(fetchData, 30000)
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
        }
    }, [fetchData])

    const filteredUsers = users.filter(u => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return (
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.github_id || '').toLowerCase().includes(q)
        )
    })

    const capacity = status ? Math.round((status.total_users / (status.max_users || 50)) * 100) : 0

    const tabs = [
        { key: 'users' as const, label: 'Users', icon: Users },
        { key: 'events' as const, label: 'Events', icon: Clock },
        { key: 'system' as const, label: 'System', icon: Server },
    ]

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <header className="border-b border-white/[0.04] px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-6 h-6 text-emerald-400" />
                        <h1 className="text-lg font-bold">System Control</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setLoading(true); fetchData() }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-white/[0.04] text-zinc-400 hover:text-white transition-colors text-sm"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={onSignOut}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-white/[0.04] text-zinc-400 hover:text-red-400 transition-colors text-sm"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Stats Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon={Users}
                        label="Total Users"
                        value={status?.total_users ?? '-'}
                        color="emerald"
                    />
                    <StatCard
                        icon={Bot}
                        label="Running Containers"
                        value={status?.running_containers ?? '-'}
                        color="cyan"
                    />
                    <StatCard
                        icon={Coins}
                        label="Plan Breakdown"
                        value={status ? `${status.plans?.free ?? 0}F / ${status.plans?.starter ?? 0}S / ${status.plans?.pro ?? 0}P` : '-'}
                        color="amber"
                    />
                    <StatCard
                        icon={Server}
                        label="Capacity"
                        value={status ? `${capacity}%` : '-'}
                        sub={status ? `${status.total_users} / ${status.max_users || 50}` : undefined}
                        color="purple"
                    />
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-zinc-900/50 border border-white/[0.04] rounded-lg p-1 w-fit">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                tab === t.key
                                    ? 'bg-emerald-600/20 text-emerald-400'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                    >
                        {tab === 'users' && (
                            <UsersTab
                                users={filteredUsers}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                onRefresh={fetchData}
                            />
                        )}
                        {tab === 'events' && <EventsTab events={events} />}
                        {tab === 'system' && <SystemTab status={status} capacity={capacity} />}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string | number
    sub?: string
    color: string
}) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-400',
        cyan: 'text-cyan-400',
        amber: 'text-amber-400',
        purple: 'text-purple-400',
    }
    return (
        <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-4 h-4 ${colorMap[color] || 'text-zinc-400'}`} />
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            {sub && <div className="text-xs text-zinc-600 mt-1">{sub}</div>}
        </div>
    )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab({ users, searchQuery, onSearchChange, onRefresh }: {
    users: UserData[]
    searchQuery: string
    onSearchChange: (q: string) => void
    onRefresh: () => void
}) {
    const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null)
    const [actionLoading, setActionLoading] = useState<string>('')
    const [expandedUser, setExpandedUser] = useState<string | null>(null)
    const [userLogs, setUserLogs] = useState<string>('')
    const [creditInputs, setCreditInputs] = useState<Record<string, string>>({})
    const [showCreditInput, setShowCreditInput] = useState<string | null>(null)
    const [userCredits, setUserCredits] = useState<Record<string, number>>({})

    const handleAction = async (action: string, githubId: string, params?: Record<string, unknown>) => {
        setActionLoading(`${action}-${githubId}`)
        try {
            await apiPost(action, { githubId, params })
            onRefresh()
        } catch (err) {
            alert((err as Error).message)
        } finally {
            setActionLoading('')
        }
    }

    const handleDelete = async (user: UserData) => {
        setActionLoading(`delete-${user.github_id}`)
        try {
            await apiPost('delete', { githubId: user.github_id })
            setDeleteTarget(null)
            onRefresh()
        } catch (err) {
            alert((err as Error).message)
        } finally {
            setActionLoading('')
        }
    }

    const handleExpand = async (githubId: string) => {
        if (expandedUser === githubId) {
            setExpandedUser(null)
            return
        }
        setExpandedUser(githubId)
        try {
            const detail: UserDetail = await apiGet('user-detail', githubId)
            setUserLogs(detail.logs?.logs || 'No logs available')
        } catch {
            setUserLogs('Failed to load logs')
        }
    }

    const handleAddCredits = async (githubId: string) => {
        const amount = parseInt(creditInputs[githubId] || '0', 10)
        if (!amount || amount <= 0) return
        await handleAction('add-credits', githubId, { amount, reason: 'Admin grant' })
        setCreditInputs(prev => ({ ...prev, [githubId]: '' }))
        setShowCreditInput(null)
        // Refresh credits
        try {
            const data = await apiPost('get-credits', { githubId })
            setUserCredits(prev => ({ ...prev, [githubId]: data.remaining ?? data.credits ?? 0 }))
        } catch { /* silent */ }
    }

    const fetchCredits = async (githubId: string) => {
        try {
            const data = await apiPost('get-credits', { githubId })
            setUserCredits(prev => ({ ...prev, [githubId]: data.remaining ?? data.credits ?? 0 }))
        } catch { /* silent */ }
    }

    useEffect(() => {
        users.forEach(u => {
            if (userCredits[u.github_id] === undefined) {
                fetchCredits(u.github_id)
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users])

    const containerStatusColor = (status: string | undefined | null) => {
        if (!status) return 'bg-zinc-700 text-zinc-400'
        const s = status.toLowerCase()
        if (s === 'running') return 'bg-emerald-500/20 text-emerald-400'
        if (s === 'stopped' || s === 'exited') return 'bg-red-500/20 text-red-400'
        return 'bg-zinc-700 text-zinc-400'
    }

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search users by name, email, or ID..."
                    className="w-full bg-zinc-900/50 border border-white/[0.04] rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30"
                />
                {searchQuery && (
                    <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/[0.04]">
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">User</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Email</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Plan</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Credits</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Container</th>
                                <th className="text-right px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-zinc-600">No users found</td>
                                </tr>
                            )}
                            {users.map(user => (
                                <UserRow
                                    key={user.github_id}
                                    user={user}
                                    actionLoading={actionLoading}
                                    expanded={expandedUser === user.github_id}
                                    userLogs={expandedUser === user.github_id ? userLogs : ''}
                                    credits={userCredits[user.github_id]}
                                    showCreditInput={showCreditInput === user.github_id}
                                    creditInputValue={creditInputs[user.github_id] || ''}
                                    containerStatusColor={containerStatusColor}
                                    onAction={handleAction}
                                    onDelete={() => setDeleteTarget(user)}
                                    onExpand={() => handleExpand(user.github_id)}
                                    onToggleCreditInput={() => setShowCreditInput(showCreditInput === user.github_id ? null : user.github_id)}
                                    onCreditInputChange={(v) => setCreditInputs(prev => ({ ...prev, [user.github_id]: v }))}
                                    onAddCredits={() => handleAddCredits(user.github_id)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 max-w-md w-full"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Delete User</h3>
                                    <p className="text-sm text-zinc-500">{deleteTarget.username} ({deleteTarget.github_id})</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-400 mb-6">
                                This will permanently delete the user, their Telegram bot, and all data. This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteTarget)}
                                    disabled={actionLoading === `delete-${deleteTarget.github_id}`}
                                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                                >
                                    {actionLoading === `delete-${deleteTarget.github_id}` ? 'Deleting...' : 'Delete Forever'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ─── User Row ────────────────────────────────────────────────────────────────

function UserRow({ user, actionLoading, expanded, userLogs, credits, showCreditInput, creditInputValue, containerStatusColor, onAction, onDelete, onExpand, onToggleCreditInput, onCreditInputChange, onAddCredits }: {
    user: UserData
    actionLoading: string
    expanded: boolean
    userLogs: string
    credits: number | undefined
    showCreditInput: boolean
    creditInputValue: string
    containerStatusColor: (s: string | undefined | null) => string
    onAction: (action: string, githubId: string, params?: Record<string, unknown>) => void
    onDelete: () => void
    onExpand: () => void
    onToggleCreditInput: () => void
    onCreditInputChange: (v: string) => void
    onAddCredits: () => void
}) {
    const containerStatus = user.container?.status || null
    const isRunning = containerStatus?.toLowerCase() === 'running'

    return (
        <>
            <tr className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                {/* User */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                            <img
                                src={user.avatar_url}
                                alt={user.username}
                                className="w-8 h-8 rounded-full bg-zinc-800"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                                {(user.username || '?')[0]?.toUpperCase()}
                            </div>
                        )}
                        <div>
                            <button onClick={onExpand} className="text-white hover:text-emerald-400 transition-colors font-medium flex items-center gap-1">
                                {user.username || user.github_id}
                                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                            <span className="text-xs text-zinc-600">ID: {user.github_id}</span>
                        </div>
                    </div>
                </td>

                {/* Email */}
                <td className="px-4 py-3 text-zinc-400">{user.email || '-'}</td>

                {/* Plan */}
                <td className="px-4 py-3">
                    <select
                        value={user.plan || 'free'}
                        onChange={(e) => onAction('update-plan', user.github_id, { plan: e.target.value })}
                        className="bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                    >
                        <option value="free">Free</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                    </select>
                </td>

                {/* Credits */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-zinc-300 tabular-nums">{credits ?? '...'}</span>
                        <button
                            onClick={onToggleCreditInput}
                            className="p-1 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
                            title="Add credits"
                        >
                            {showCreditInput ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                        {showCreditInput && (
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    min="1"
                                    value={creditInputValue}
                                    onChange={(e) => onCreditInputChange(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && onAddCredits()}
                                    placeholder="0"
                                    className="w-16 bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                <button
                                    onClick={onAddCredits}
                                    className="px-2 py-1 rounded bg-emerald-600/30 text-emerald-400 text-xs hover:bg-emerald-600/50 transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                        )}
                    </div>
                </td>

                {/* Container Status */}
                <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${containerStatusColor(containerStatus)}`}>
                        {containerStatus || 'none'}
                    </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                        {!isRunning ? (
                            <button
                                onClick={() => onAction('start', user.github_id)}
                                disabled={actionLoading === `start-${user.github_id}`}
                                className="p-1.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-30"
                                title="Start"
                            >
                                <Play className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => onAction('stop', user.github_id)}
                                disabled={actionLoading === `stop-${user.github_id}`}
                                className="p-1.5 rounded hover:bg-amber-500/20 text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-30"
                                title="Stop"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={() => onAction('restart', user.github_id)}
                            disabled={actionLoading === `restart-${user.github_id}`}
                            className="p-1.5 rounded hover:bg-cyan-500/20 text-zinc-500 hover:text-cyan-400 transition-colors disabled:opacity-30"
                            title="Restart"
                        >
                            <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Logs */}
            {expanded && (
                <tr>
                    <td colSpan={6} className="px-4 py-3 bg-black/30">
                        <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                            <Terminal className="w-3.5 h-3.5" />
                            Container Logs
                        </div>
                        <pre className="text-xs text-zinc-400 bg-black/50 rounded-lg p-3 max-h-48 overflow-auto font-mono whitespace-pre-wrap">
                            {userLogs || 'Loading...'}
                        </pre>
                    </td>
                </tr>
            )}
        </>
    )
}

// ─── Events Tab ──────────────────────────────────────────────────────────────

function EventsTab({ events }: { events: EventData[] }) {
    const eventTypeColor = (type: string) => {
        const t = type.toLowerCase()
        if (t.includes('create') || t.includes('start')) return 'bg-emerald-500/20 text-emerald-400'
        if (t.includes('delete') || t.includes('destroy')) return 'bg-red-500/20 text-red-400'
        if (t.includes('stop')) return 'bg-amber-500/20 text-amber-400'
        if (t.includes('restart')) return 'bg-cyan-500/20 text-cyan-400'
        return 'bg-zinc-700 text-zinc-400'
    }

    return (
        <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-4">
            {events.length === 0 && (
                <p className="text-center py-12 text-zinc-600">No events recorded</p>
            )}
            <div className="space-y-3">
                {events.map((event, i) => (
                    <div key={event.id || i} className="flex items-start gap-3 py-2 border-b border-white/[0.02] last:border-0">
                        <div className="mt-0.5">
                            <Clock className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeColor(event.event_type)}`}>
                                    {event.event_type}
                                </span>
                                {event.github_id && (
                                    <span className="text-xs text-zinc-600">User: {event.github_id}</span>
                                )}
                            </div>
                            <p className="text-sm text-zinc-400 mt-1 truncate">{event.details}</p>
                        </div>
                        <span className="text-xs text-zinc-600 whitespace-nowrap shrink-0">
                            {event.timestamp ? timeAgo(event.timestamp) : '-'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── System Tab ──────────────────────────────────────────────────────────────

function SystemTab({ status, capacity }: { status: StatusData | null; capacity: number }) {
    if (!status) {
        return <p className="text-zinc-600 text-center py-12">Loading system data...</p>
    }

    const plans = status.plans || { free: 0, starter: 0, pro: 0 }
    const totalPlans = plans.free + plans.starter + plans.pro || 1

    return (
        <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm text-zinc-500">Total Users</span>
                    </div>
                    <div className="text-4xl font-bold">{status.total_users}</div>
                    <div className="text-xs text-zinc-600 mt-1">of {status.max_users || 50} max capacity</div>
                </div>
                <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-5 h-5 text-cyan-400" />
                        <span className="text-sm text-zinc-500">Running Containers</span>
                    </div>
                    <div className="text-4xl font-bold">{status.running_containers}</div>
                    <div className="text-xs text-zinc-600 mt-1">active right now</div>
                </div>
                <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Server className="w-5 h-5 text-purple-400" />
                        <span className="text-sm text-zinc-500">Capacity Used</span>
                    </div>
                    <div className="text-4xl font-bold">{capacity}%</div>
                    <div className="w-full bg-zinc-800 rounded-full h-2 mt-3">
                        <div
                            className={`h-2 rounded-full transition-all ${capacity > 80 ? 'bg-red-500' : capacity > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(capacity, 100)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Plan Breakdown Bar Chart */}
            <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-6">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">Plan Breakdown</h3>
                <div className="space-y-4">
                    <PlanBar label="Free" count={plans.free} total={totalPlans} color="bg-zinc-500" />
                    <PlanBar label="Starter" count={plans.starter} total={totalPlans} color="bg-cyan-500" />
                    <PlanBar label="Pro" count={plans.pro} total={totalPlans} color="bg-emerald-500" />
                </div>
            </div>
        </div>
    )
}

function PlanBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const pct = Math.round((count / total) * 100)
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-zinc-400">{label}</span>
                <span className="text-sm text-zinc-500">{count} ({pct}%)</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-3">
                <div className={`h-3 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}
