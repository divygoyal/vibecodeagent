'use client'

import { useState, useEffect, useCallback, useRef, Fragment, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Users, Bot, Coins, Server, Trash2, RefreshCw, Play, Square, RotateCw,
    Search, X, Shield, ChevronDown, LogOut, Eye, EyeOff, Plus, Minus,
    Terminal, Clock, AlertTriangle, MessageSquare, Mail, ExternalLink, Check,
    Globe, LayoutDashboard, Link2, BarChart3, Activity, FileText, Loader2,
    Trophy, ShieldCheck, ShieldOff, LifeBuoy, Send
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusData {
    total_users: number
    running_containers: number
    max_users: number
    plans: { free: number; starter: number; pro: number }
}

interface UserData {
    id?: number
    github_id: string
    username: string
    email: string
    plan: string
    credits: number
    avatar_url?: string
    created_at?: string
    is_active?: boolean
    bot_engine?: string
    has_google?: boolean
    provider_count?: number
    embed_token_count?: number
    shared_dashboard_count?: number
    custom_dashboard_count?: number
    leaderboard_active?: boolean
    container?: {
        status: string
        id?: string
        port?: number | null
    } | null
}

interface EventData {
    id: number
    event_type: string
    details: string
    timestamp: string
    github_id?: string
}

interface QueryData {
    id: number
    name: string
    email: string
    message: string
    status: string
    ip_address: string | null
    created_at: string | null
}

interface SupportThread {
    user_id: number
    github_id: string | null
    github_username: string | null
    email: string | null
    plan: string | null
    message_count: number
    unread_user_count: number
    oldest_unread_at: string | null
    last_message_at: string | null
    last_message_preview: string
    last_message_author: 'user' | 'admin'
}

interface SupportThreadMessage {
    id: number
    author_type: 'user' | 'admin'
    author_admin_id: string | null
    content: string
    created_at: string | null
    read_at: string | null
}

interface SupportThreadDetail {
    user: {
        id: number
        github_id: string | null
        github_username: string | null
        email: string | null
        plan: string | null
        created_at: string | null
    }
    messages: SupportThreadMessage[]
}

interface ProviderData {
    provider: string
    provider_account_id?: string | null
    token_type?: string | null
    scope?: string[]
    expires_at?: number | null
    has_refresh_token?: boolean
    created_at?: string | null
    updated_at?: string | null
}

interface GooglePropertyData {
    property_id: string
    display_name: string
    parent?: string | null
}

interface SearchConsoleSiteData {
    site_url?: string | null
    permission_level?: string | null
    site_type?: string | null
}

interface GoogleInventoryData {
    connected: boolean
    ga_properties: GooglePropertyData[]
    gsc_sites: SearchConsoleSiteData[]
    warnings: string[]
}

interface EmbedTokenData {
    id: number
    label?: string | null
    property_id: string
    property_name?: string | null
    allowed_origins: string[]
    created_at?: string | null
    last_used_at?: string | null
    is_active: boolean
}

interface SharedDashboardData {
    id: number
    property_id: string
    property_name?: string | null
    site_url?: string | null
    config: Record<string, boolean>
    views: number
    is_active: boolean
    created_at?: string | null
    last_viewed_at?: string | null
}

interface CustomDashboardData {
    id: string
    name: string
    description?: string | null
    property_id: string
    property_name?: string | null
    site_url?: string | null
    widget_count: number
    is_public: boolean
    has_share_link: boolean
    embed_enabled: boolean
    is_active: boolean
    views: number
    created_at?: string | null
    updated_at?: string | null
}

interface LeaderboardData {
    id: number
    startup_name: string
    description?: string | null
    website_url?: string | null
    logo_url?: string | null
    category?: string | null
    mrr_range?: string | null
    looking_for: string[]
    twitter_handle?: string | null
    ga_property_id?: string | null
    ga_property_name?: string | null
    monthly_visitors: number
    monthly_pageviews: number
    engagement_rate: number
    bounce_rate: number
    avg_session_duration: number
    visitor_trend: number
    is_verified: boolean
    last_refreshed?: string | null
    created_at?: string | null
    updated_at?: string | null
}

interface LeaderboardModerationEntry {
    id: number
    is_active: boolean
    startup_name: string
    description?: string | null
    website_url?: string | null
    logo_url?: string | null
    category?: string | null
    mrr_range?: string | null
    looking_for: string[]
    twitter_handle?: string | null
    ga_property_id?: string | null
    monthly_visitors: number
    monthly_pageviews: number
    engagement_rate: number
    bounce_rate: number
    visitor_trend: number
    is_verified: boolean
    verification_status: string
    verified_host?: string | null
    primary_country?: string | null
    last_refreshed?: string | null
    created_at?: string | null
    user?: {
        id: number
        github_id?: string | null
        email?: string | null
        github_username?: string | null
    } | null
}

interface UserProfileEvent {
    id: number
    event_type: string
    details?: string | null
    container_id?: string | null
    created_at?: string | null
}

interface UserProfileData {
    account: {
        id: number
        identifier: string
        github_id?: string | null
        username?: string | null
        email?: string | null
        is_active: boolean
        created_at?: string | null
        updated_at?: string | null
    }
    subscription: {
        plan: string
        credits: number
        subscription_id?: string | null
        subscription_start?: string | null
        subscription_end?: string | null
        subscription_cancelled: boolean
        telegram_bot_enabled: boolean
    }
    container: {
        status: string
        health?: string | null
        db_status?: string | null
        port?: number | null
        engine?: string | null
        memory_usage_mb?: number | null
        memory_percent?: number | null
        restart_count?: number | null
        started_at?: string | null
        last_health_check?: string | null
        telegram_status?: string | null
        bot_username?: string | null
        container_id?: string | null
        container_name?: string | null
        telegram_enabled?: boolean
        telegram_bot_configured?: boolean
        error?: string | null
    }
    providers: ProviderData[]
    google_inventory: GoogleInventoryData
    globe_assets: {
        embed_tokens: EmbedTokenData[]
        summary: {
            active_embed_tokens: number
            used_embed_tokens: number
            shared_dashboards: number
            shared_dashboard_views: number
            public_custom_dashboards: number
            public_custom_dashboard_views: number
        }
    }
    shared_dashboards: SharedDashboardData[]
    custom_dashboards: CustomDashboardData[]
    leaderboard: LeaderboardData | null
    recent_events: UserProfileEvent[]
    logs: {
        success?: boolean
        logs?: string
        error?: string
    } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUPERADMIN_TOKEN_KEY = 'sa_token'
const SUPERADMIN_EXPIRY_KEY = 'sa_expires'
const SUPERADMIN_SESSION_EXPIRED_EVENT = 'trafficclaw:superadmin-session-expired'
const SUPERADMIN_SESSION_EXPIRED_MESSAGE = 'Your superadmin session expired. Please unlock again.'

function clearSuperadminSessionStorage() {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(SUPERADMIN_TOKEN_KEY)
    sessionStorage.removeItem(SUPERADMIN_EXPIRY_KEY)
}

function getStoredSuperadminToken(): string {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem(SUPERADMIN_TOKEN_KEY) || ''
}

function getStoredSuperadminExpiry(): number | null {
    if (typeof window === 'undefined') return null
    const raw = sessionStorage.getItem(SUPERADMIN_EXPIRY_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
}

function isSuperadminSessionExpired(): boolean {
    const token = getStoredSuperadminToken()
    if (!token) return false
    const expiresAt = getStoredSuperadminExpiry()
    return expiresAt === null || expiresAt <= Date.now()
}

function expireSuperadminSession(reason = SUPERADMIN_SESSION_EXPIRED_MESSAGE) {
    if (typeof window === 'undefined') return
    clearSuperadminSessionStorage()
    window.dispatchEvent(new CustomEvent(SUPERADMIN_SESSION_EXPIRED_EVENT, { detail: reason }))
}

function isSuperadminAuthError(message: string): boolean {
    return (
        message === 'Unauthorized' ||
        message === 'Session expired' ||
        message === SUPERADMIN_SESSION_EXPIRED_MESSAGE
    )
}

function getErrorMessage(err: unknown, fallback = 'Request failed'): string {
    return err instanceof Error && err.message ? err.message : fallback
}

function requireSuperadminToken(): string {
    const token = getStoredSuperadminToken()
    if (!token) {
        expireSuperadminSession()
        throw new Error(SUPERADMIN_SESSION_EXPIRED_MESSAGE)
    }

    if (isSuperadminSessionExpired()) {
        expireSuperadminSession()
        throw new Error(SUPERADMIN_SESSION_EXPIRED_MESSAGE)
    }

    return token
}

interface FeedbackItem {
    id: number
    rating: 'up' | 'down'
    reason: string | null
    comment: string | null
    thread_id: string | null
    message_id: number
    message_excerpt: string | null
    created_at: string | null
}

async function apiGet(endpoint: string, id?: string) {
    const token = requireSuperadminToken()
    let url = `/api/superadmin?token=${encodeURIComponent(token)}&endpoint=${endpoint}`
    if (id) url += `&id=${encodeURIComponent(id)}`
    const res = await fetch(url)
    if (!res.ok) {
        if (res.status === 403) {
            expireSuperadminSession()
            throw new Error(SUPERADMIN_SESSION_EXPIRED_MESSAGE)
        }
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
    }
    return res.json()
}

async function apiPost(action: string, data: Record<string, unknown> = {}) {
    const token = requireSuperadminToken()
    const res = await fetch('/api/superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...data })
    })
    if (!res.ok) {
        if (res.status === 403) {
            expireSuperadminSession()
            throw new Error(SUPERADMIN_SESSION_EXPIRED_MESSAGE)
        }
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

function formatDateTime(ts?: string | null): string {
    if (!ts) return '—'
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return ts
    return date.toLocaleString()
}

function formatNumber(value?: number | null): string {
    return new Intl.NumberFormat().format(value ?? 0)
}

function formatPercent(value?: number | null): string {
    if (value === null || value === undefined) return '—'
    const normalized = Math.abs(value) <= 1 ? value * 100 : value
    return `${normalized.toFixed(1)}%`
}

function formatDuration(seconds?: number | null): string {
    if (!seconds) return '—'
    const totalSeconds = Math.round(seconds)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    if (mins <= 0) return `${secs}s`
    return `${mins}m ${secs}s`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
    const [authenticated, setAuthenticated] = useState(false)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [authError, setAuthError] = useState('')
    const [authLoading, setAuthLoading] = useState(false)

    const handleSignOut = useCallback((reason = '') => {
        clearSuperadminSessionStorage()
        setAuthenticated(false)
        setPassword('')
        setShowPassword(false)
        setAuthLoading(false)
        setAuthError(reason)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return

        const handleSessionExpired = (event: Event) => {
            const reason =
                event instanceof CustomEvent && typeof event.detail === 'string'
                    ? event.detail
                    : SUPERADMIN_SESSION_EXPIRED_MESSAGE
            handleSignOut(reason)
        }

        window.addEventListener(SUPERADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener)

        const token = getStoredSuperadminToken()
        if (token) {
            if (isSuperadminSessionExpired()) {
                expireSuperadminSession()
            } else {
                setAuthenticated(true)
            }
        }

        return () => {
            window.removeEventListener(SUPERADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener)
        }
    }, [handleSignOut])

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
            sessionStorage.setItem(SUPERADMIN_TOKEN_KEY, data.token)
            sessionStorage.setItem(SUPERADMIN_EXPIRY_KEY, data.expiresAt.toString())
            setAuthenticated(true)
            setShowPassword(false)
            setPassword('')
        } catch {
            setAuthError('Connection error')
        } finally {
            setAuthLoading(false)
        }
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
    const [tab, setTab] = useState<'users' | 'events' | 'system' | 'queries' | 'leaderboard' | 'support'>('users')
    const [status, setStatus] = useState<StatusData | null>(null)
    const [users, setUsers] = useState<UserData[]>([])
    const [events, setEvents] = useState<EventData[]>([])
    const [queries, setQueries] = useState<QueryData[]>([])
    const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardModerationEntry[]>([])
    const [supportThreads, setSupportThreads] = useState<SupportThread[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchData = useCallback(async () => {
        try {
            setError('')
            const [statusData, usersData, eventsData, queriesData, leaderboardData, supportData] = await Promise.all([
                apiGet('status'),
                apiGet('users'),
                apiGet('events'),
                apiGet('queries').catch(() => []),
                apiGet('leaderboard').catch(() => ({ entries: [] })),
                apiGet('support-threads').catch(() => ({ threads: [] }))
            ])
            setStatus(statusData)
            setUsers(Array.isArray(usersData) ? usersData : [])
            setEvents(Array.isArray(eventsData) ? eventsData : [])
            setQueries(Array.isArray(queriesData) ? queriesData : [])
            const lbEntries = leaderboardData?.entries
            setLeaderboardEntries(Array.isArray(lbEntries) ? lbEntries : [])
            const sThreads = supportData?.threads
            setSupportThreads(Array.isArray(sThreads) ? sThreads : [])
        } catch (err) {
            const message = getErrorMessage(err)
            if (isSuperadminAuthError(message)) {
                return
            }
            setError(message)
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

    const newQueryCount = queries.filter(q => q.status === 'new').length

    const pendingLeaderboardCount = leaderboardEntries.filter(
        (e) => e.is_active && e.verification_status !== 'verified',
    ).length

    const unreadSupportCount = supportThreads.reduce((sum, t) => sum + (t.unread_user_count || 0), 0)

    const tabs = [
        { key: 'users' as const, label: 'Users', icon: Users, badge: 0 },
        { key: 'support' as const, label: 'Support', icon: LifeBuoy, badge: unreadSupportCount },
        { key: 'queries' as const, label: 'Queries', icon: MessageSquare, badge: newQueryCount },
        { key: 'leaderboard' as const, label: 'Leaderboard', icon: Trophy, badge: pendingLeaderboardCount },
        { key: 'events' as const, label: 'Events', icon: Clock, badge: 0 },
        { key: 'system' as const, label: 'System', icon: Server, badge: 0 },
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
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                        icon={MessageSquare}
                        label="New Queries"
                        value={queries.filter(q => q.status === 'new').length}
                        sub={`${queries.length} total`}
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
                            {t.badge > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold leading-none">
                                    {t.badge}
                                </span>
                            )}
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
                        {tab === 'queries' && <QueriesTab queries={queries} onRefresh={fetchData} />}
                        {tab === 'support' && <SupportTab threads={supportThreads} onRefresh={fetchData} />}
                        {tab === 'leaderboard' && <LeaderboardTab entries={leaderboardEntries} onRefresh={fetchData} />}
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
    const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
    const [profileCache, setProfileCache] = useState<Record<string, UserProfileData>>({})
    const [profileLoadingUserId, setProfileLoadingUserId] = useState<string | null>(null)
    const [profileRefreshingUserId, setProfileRefreshingUserId] = useState<string | null>(null)
    const [profileError, setProfileError] = useState('')
    const [creditInputs, setCreditInputs] = useState<Record<string, string>>({})
    const [showCreditInput, setShowCreditInput] = useState<string | null>(null)
    const [emailMenuUser, setEmailMenuUser] = useState<string | null>(null)

    // ─── Per-user chat feedback (👍/👎 counts in the row + click-to-expand
    //    detail panel below). Counts come from a single aggregate query so the
    //    page-load cost is fixed regardless of user count. Detail loads
    //    on-demand and is cached per user so re-clicking the same row doesn't
    //    refetch. ───
    const [feedbackCountsByUserId, setFeedbackCountsByUserId] = useState<Record<number, { up: number; down: number }>>({})
    const [expandedFeedbackUser, setExpandedFeedbackUser] = useState<string | null>(null)
    const [feedbackDetailCache, setFeedbackDetailCache] = useState<Record<string, FeedbackItem[] | 'loading' | { error: string }>>({})

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await apiGet('chat-feedback-summary')
                if (!cancelled && res?.by_user_id && typeof res.by_user_id === 'object') {
                    setFeedbackCountsByUserId(res.by_user_id as Record<number, { up: number; down: number }>)
                }
            } catch {
                // Non-fatal — column shows "—" until refresh.
            }
        })()
        return () => { cancelled = true }
    }, [])

    const handleToggleFeedbackExpand = useCallback(async (user: UserData) => {
        const key = user.github_id
        if (expandedFeedbackUser === key) {
            setExpandedFeedbackUser(null)
            return
        }
        setExpandedFeedbackUser(key)
        if (feedbackDetailCache[key] && Array.isArray(feedbackDetailCache[key])) return
        setFeedbackDetailCache(prev => ({ ...prev, [key]: 'loading' }))
        try {
            const res = await apiGet('user-chat-feedback', key)
            if (Array.isArray(res?.items)) {
                setFeedbackDetailCache(prev => ({ ...prev, [key]: res.items as FeedbackItem[] }))
            } else {
                setFeedbackDetailCache(prev => ({ ...prev, [key]: { error: 'Empty response' } }))
            }
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                setFeedbackDetailCache(prev => ({ ...prev, [key]: { error: message } }))
            } else {
                setExpandedFeedbackUser(null)
            }
        }
    }, [expandedFeedbackUser, feedbackDetailCache])

    const loadUserProfile = useCallback(async (user: UserData, force = false) => {
        if (!force && profileCache[user.github_id]) {
            setProfileError('')
            return
        }

        setProfileError('')
        if (force && profileCache[user.github_id]) {
            setProfileRefreshingUserId(user.github_id)
        } else {
            setProfileLoadingUserId(user.github_id)
        }

        try {
            const detail: UserProfileData = await apiGet('user-profile', user.github_id)
            setProfileCache(prev => ({ ...prev, [user.github_id]: detail }))
        } catch (err) {
            const message = getErrorMessage(err, 'Failed to load user profile')
            if (isSuperadminAuthError(message)) return
            setProfileError(message)
        } finally {
            setProfileLoadingUserId(current => current === user.github_id ? null : current)
            setProfileRefreshingUserId(current => current === user.github_id ? null : current)
        }
    }, [profileCache])

    useEffect(() => {
        if (!selectedUser) return
        const updatedUser = users.find(user => user.github_id === selectedUser.github_id)
        if (updatedUser) {
            setSelectedUser(updatedUser)
        }
    }, [users, selectedUser])

    const handleAction = async (action: string, githubId: string, params?: Record<string, unknown>) => {
        setActionLoading(`${action}-${githubId}`)
        try {
            await apiPost(action, { githubId, params })
            onRefresh()
            if (selectedUser?.github_id === githubId) {
                await loadUserProfile(selectedUser, true)
            }
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(message)
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleDelete = async (user: UserData) => {
        setActionLoading(`delete-${user.github_id}`)
        try {
            await apiPost('delete', { githubId: user.github_id })
            setDeleteTarget(null)
            setSelectedUser(current => current?.github_id === user.github_id ? null : current)
            setProfileCache(prev => {
                const next = { ...prev }
                delete next[user.github_id]
                return next
            })
            onRefresh()
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(message)
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleOpenProfile = (user: UserData) => {
        setSelectedUser(user)
        void loadUserProfile(user)
    }

    const handleAddCredits = async (githubId: string) => {
        const amount = parseInt(creditInputs[githubId] || '0', 10)
        if (!amount || amount <= 0) return
        await handleAction('add-credits', githubId, { amount, reason: 'Admin grant' })
        setCreditInputs(prev => ({ ...prev, [githubId]: '' }))
        setShowCreditInput(null)
    }

    const handleSendReportEmail = async (githubId: string, period: 'weekly' | 'monthly') => {
        const key = `email-report-${period}-${githubId}`
        setActionLoading(key)
        setEmailMenuUser(null)
        try {
            // Send is synchronous server-side (PDF render + Gemini synth + Brevo).
            // Typically 20-90s — UI button stays in loading state until the
            // request resolves so the admin sees inline feedback.
            await apiPost('send-report-email', { userId: githubId, period })
            alert(`${period[0].toUpperCase()}${period.slice(1)} report emailed.`)
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(`Failed to send: ${message}`)
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleSendFeedbackEmail = async (githubId: string) => {
        const key = `email-feedback-${githubId}`
        setActionLoading(key)
        setEmailMenuUser(null)
        try {
            // Brevo template send — fast (no PDF / no Gemini). Coupon code is
            // generated server-side per call; surface it so the admin can mirror
            // it into Dodo / a coupon table if/when the user replies.
            const res = await apiPost('send-feedback-email', { userId: githubId })
            const code = res?.couponCode ? ` (code ${res.couponCode})` : ''
            alert(`Feedback email sent${code}.`)
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(`Failed to send: ${message}`)
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleGenerateWeeklyDigest = async (githubId: string) => {
        // Ad-hoc trigger of the same pipeline the weekly cron runs — fetches
        // GSC/GA4 for last completed ISO week, calls Gemini for headline + 3
        // actions, persists to admin → user's /dashboard/weekly tab. Synchronous
        // (10-40 s typically). Persistence reason / headline preview surfaced
        // inline on completion.
        const key = `weekly-digest-${githubId}`
        setActionLoading(key)
        setEmailMenuUser(null)
        try {
            const res = await apiPost('generate-weekly-digest', { userId: githubId })
            const wk = `Week ${res?.isoWeek ?? '?'} of ${res?.year ?? '?'}`
            if (res?.persisted) {
                const headlineLine = res?.headline ? `\n\nHeadline: "${res.headline}"` : ''
                const reasonLine = res?.snapshotEmpty
                    ? `\n(Empty snapshot: ${res?.snapshotReason || 'unknown'})`
                    : ''
                alert(`${wk} digest persisted to /dashboard/weekly.${headlineLine}${reasonLine}`)
            } else {
                const reason = res?.error || res?.snapshotReason || 'unknown'
                alert(`${wk} digest NOT persisted. Reason: ${reason}`)
            }
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(`Failed to generate: ${message}`)
            }
        } finally {
            setActionLoading('')
        }
    }

    const containerStatusColor = (status: string | undefined | null) => {
        if (!status) return 'bg-zinc-700 text-zinc-400'
        const s = status.toLowerCase()
        if (s === 'running') return 'bg-emerald-500/20 text-emerald-400'
        if (s === 'stopped' || s === 'exited') return 'bg-red-500/20 text-red-400'
        if (s === 'initializing' || s === 'starting' || s === 'pending') return 'bg-amber-500/20 text-amber-400'
        return 'bg-zinc-700 text-zinc-400'
    }

    const selectedProfile = selectedUser ? profileCache[selectedUser.github_id] ?? null : null
    const isProfileLoading = selectedUser ? profileLoadingUserId === selectedUser.github_id : false
    const isProfileRefreshing = selectedUser ? profileRefreshingUserId === selectedUser.github_id : false

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
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Signals</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Feedback</th>
                                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Container</th>
                                <th className="text-right px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-zinc-600">No users found</td>
                                </tr>
                            )}
                            {users.map(user => {
                                const counts = (typeof user.id === 'number' ? feedbackCountsByUserId[user.id] : undefined) ?? null
                                const isExpanded = expandedFeedbackUser === user.github_id
                                const detail = feedbackDetailCache[user.github_id]
                                return (
                                    <Fragment key={user.github_id}>
                                        <UserRow
                                            user={user}
                                            selected={selectedUser?.github_id === user.github_id}
                                            actionLoading={actionLoading}
                                            showCreditInput={showCreditInput === user.github_id}
                                            creditInputValue={creditInputs[user.github_id] || ''}
                                            containerStatusColor={containerStatusColor}
                                            onAction={handleAction}
                                            onDelete={() => setDeleteTarget(user)}
                                            onOpenDetails={() => handleOpenProfile(user)}
                                            onToggleCreditInput={() => setShowCreditInput(showCreditInput === user.github_id ? null : user.github_id)}
                                            onCreditInputChange={(v) => setCreditInputs(prev => ({ ...prev, [user.github_id]: v }))}
                                            onAddCredits={() => handleAddCredits(user.github_id)}
                                            emailMenuOpen={emailMenuUser === user.github_id}
                                            onToggleEmailMenu={() => setEmailMenuUser(emailMenuUser === user.github_id ? null : user.github_id)}
                                            onSendReportEmail={(period) => handleSendReportEmail(user.github_id, period)}
                                            onSendFeedbackEmail={() => handleSendFeedbackEmail(user.github_id)}
                                            onGenerateWeeklyDigest={() => handleGenerateWeeklyDigest(user.github_id)}
                                            feedbackCounts={counts}
                                            isFeedbackExpanded={isExpanded}
                                            onToggleFeedback={() => handleToggleFeedbackExpand(user)}
                                        />
                                        {isExpanded && (
                                            <tr className="bg-zinc-950/40">
                                                <td colSpan={8} className="px-4 py-3">
                                                    <FeedbackExpandPanel detail={detail} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <UserProfileDrawer
                user={selectedUser}
                profile={selectedProfile}
                loading={isProfileLoading}
                refreshing={isProfileRefreshing}
                error={profileError}
                actionLoading={actionLoading}
                showCreditInput={showCreditInput === selectedUser?.github_id}
                creditInputValue={selectedUser ? creditInputs[selectedUser.github_id] || '' : ''}
                containerStatusColor={containerStatusColor}
                onClose={() => setSelectedUser(null)}
                onRefresh={() => selectedUser && void loadUserProfile(selectedUser, true)}
                onAction={handleAction}
                onDelete={() => selectedUser && setDeleteTarget(selectedUser)}
                onToggleCreditInput={() => {
                    if (!selectedUser) return
                    setShowCreditInput(showCreditInput === selectedUser.github_id ? null : selectedUser.github_id)
                }}
                onCreditInputChange={(value) => {
                    if (!selectedUser) return
                    setCreditInputs(prev => ({ ...prev, [selectedUser.github_id]: value }))
                }}
                onAddCredits={() => selectedUser && void handleAddCredits(selectedUser.github_id)}
            />

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

function SignalPill({ tone = 'zinc', children }: { tone?: 'zinc' | 'emerald' | 'cyan' | 'amber' | 'purple'; children: ReactNode }) {
    const toneMap: Record<string, string> = {
        zinc: 'bg-zinc-800 text-zinc-300 border border-white/[0.06]',
        emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
        cyan: 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/20',
        amber: 'bg-amber-500/15 text-amber-300 border border-amber-400/20',
        purple: 'bg-purple-500/15 text-purple-300 border border-purple-400/20',
    }

    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${toneMap[tone] || toneMap.zinc}`}>
            {children}
        </span>
    )
}

function UserSignals({ user }: { user: UserData }) {
    const hasSignals =
        user.has_google ||
        (user.embed_token_count || 0) > 0 ||
        (user.shared_dashboard_count || 0) > 0 ||
        (user.custom_dashboard_count || 0) > 0 ||
        user.leaderboard_active

    if (!hasSignals) {
        return <span className="text-xs text-zinc-600">No advanced assets yet</span>
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {user.has_google && <SignalPill tone="emerald">Google</SignalPill>}
            {(user.embed_token_count || 0) > 0 && <SignalPill tone="cyan">Globe {user.embed_token_count}</SignalPill>}
            {(user.shared_dashboard_count || 0) > 0 && <SignalPill tone="amber">Shared {user.shared_dashboard_count}</SignalPill>}
            {(user.custom_dashboard_count || 0) > 0 && <SignalPill tone="purple">Dashboards {user.custom_dashboard_count}</SignalPill>}
            {user.leaderboard_active && <SignalPill tone="emerald">Leaderboard</SignalPill>}
        </div>
    )
}

function UserRow({ user, selected, actionLoading, showCreditInput, creditInputValue, containerStatusColor, onAction, onDelete, onOpenDetails, onToggleCreditInput, onCreditInputChange, onAddCredits, emailMenuOpen, onToggleEmailMenu, onSendReportEmail, onSendFeedbackEmail, onGenerateWeeklyDigest, feedbackCounts, isFeedbackExpanded, onToggleFeedback }: {
    user: UserData
    selected: boolean
    actionLoading: string
    showCreditInput: boolean
    creditInputValue: string
    containerStatusColor: (s: string | undefined | null) => string
    onAction: (action: string, githubId: string, params?: Record<string, unknown>) => void
    onDelete: () => void
    onOpenDetails: () => void
    onToggleCreditInput: () => void
    onCreditInputChange: (v: string) => void
    onAddCredits: () => void
    emailMenuOpen: boolean
    onToggleEmailMenu: () => void
    onSendReportEmail: (period: 'weekly' | 'monthly') => void
    onSendFeedbackEmail: () => void
    onGenerateWeeklyDigest: () => void
    /** Aggregate 👍/👎 counts for this user (null while summary loads / no data). */
    feedbackCounts: { up: number; down: number } | null
    /** Whether the inline feedback-detail panel below this row is open. */
    isFeedbackExpanded: boolean
    /** Toggle the feedback detail panel for this user. */
    onToggleFeedback: () => void
}) {
    const containerStatus = user.container?.status || null
    const isRunning = containerStatus?.toLowerCase() === 'running'

    return (
        <tr className={`border-b border-white/[0.02] transition-colors ${selected ? 'bg-emerald-500/[0.07]' : 'hover:bg-white/[0.02]'}`}>
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
                    <div className="min-w-0">
                        <button onClick={onOpenDetails} className="text-white hover:text-emerald-400 transition-colors font-medium text-left">
                            {user.username || user.github_id}
                        </button>
                        <div className="text-xs text-zinc-600 truncate">ID: {user.github_id}</div>
                    </div>
                </div>
            </td>

            <td className="px-4 py-3 text-zinc-400">{user.email || '-'}</td>

            <td className="px-4 py-3">
                <select
                    value={user.plan || 'free'}
                    onChange={(e) => onAction('update-plan', user.github_id, { plan: e.target.value })}
                    className="bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                </select>
            </td>

            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-300 tabular-nums">{formatNumber(user.credits)}</span>
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

            <td className="px-4 py-3">
                <UserSignals user={user} />
            </td>

            <td className="px-4 py-3">
                <FeedbackCell
                    counts={feedbackCounts}
                    expanded={isFeedbackExpanded}
                    onToggle={onToggleFeedback}
                />
            </td>

            <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                    <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium ${containerStatusColor(containerStatus)}`}>
                        {containerStatus || 'none'}
                    </span>
                    {user.container?.port ? <span className="text-[11px] text-zinc-600">Port {user.container.port}</span> : null}
                </div>
            </td>

            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={onOpenDetails}
                        className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-200 transition-colors"
                        title="Open details"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
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
                    {/* Email menu — Weekly / Monthly report (synchronous send, 20-90s)
                        + Feedback request (fast Brevo template send with a one-time
                        coupon code). Button stays in a loading state while any send
                        is in flight. */}
                    <div className="relative">
                        <button
                            onClick={onToggleEmailMenu}
                            disabled={
                                actionLoading === `email-report-weekly-${user.github_id}` ||
                                actionLoading === `email-report-monthly-${user.github_id}` ||
                                actionLoading === `email-feedback-${user.github_id}` ||
                                actionLoading === `weekly-digest-${user.github_id}`
                            }
                            className="p-1.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-30"
                            title="Email & report actions"
                        >
                            {actionLoading === `email-report-weekly-${user.github_id}` ||
                            actionLoading === `email-report-monthly-${user.github_id}` ||
                            actionLoading === `email-feedback-${user.github_id}` ||
                            actionLoading === `weekly-digest-${user.github_id}` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Mail className="w-4 h-4" />
                            )}
                        </button>
                        {emailMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-white/[0.08] bg-[#0a0d12] shadow-2xl shadow-black/60 overflow-hidden">
                                <div className="px-3 py-2 border-b border-white/[0.05] text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
                                    Email {user.email ? 'user' : '(no email)'}
                                </div>
                                <button
                                    onClick={() => onSendReportEmail('weekly')}
                                    disabled={!user.email}
                                    className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <span className="font-medium">Weekly report</span>
                                    <span className="block text-[10px] text-zinc-500">Last 7 days vs prior week</span>
                                </button>
                                <button
                                    onClick={() => onSendReportEmail('monthly')}
                                    disabled={!user.email}
                                    className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-t border-white/[0.04]"
                                >
                                    <span className="font-medium">Monthly report</span>
                                    <span className="block text-[10px] text-zinc-500">Last 30 days vs prior month</span>
                                </button>
                                <button
                                    onClick={onSendFeedbackEmail}
                                    disabled={!user.email}
                                    className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-t border-white/[0.04]"
                                >
                                    <span className="font-medium">Feedback request</span>
                                    <span className="block text-[10px] text-zinc-500">Ask why they didn&rsquo;t convert + coupon</span>
                                </button>
                                {/* Distinct visual treatment (violet) — this one writes
                                    to the DB rather than sending an email. */}
                                <button
                                    onClick={onGenerateWeeklyDigest}
                                    className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-violet-500/10 hover:text-violet-300 transition-colors border-t border-white/[0.04]"
                                >
                                    <span className="font-medium">Generate weekly digest</span>
                                    <span className="block text-[10px] text-zinc-500">Snapshot + AI headline → /dashboard/weekly</span>
                                </button>
                            </div>
                        )}
                    </div>
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
    )
}

function DrawerSection({ icon: Icon, title, action, children }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    action?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="bg-zinc-900/70 border border-white/[0.05] rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                </div>
                {action}
            </div>
            {children}
        </section>
    )
}

function DetailStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-xl border border-white/[0.05] bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-white break-words">{value}</div>
            {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
        </div>
    )
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 p-4 text-sm">
            <div className="font-medium text-zinc-300">{title}</div>
            <div className="mt-1 text-zinc-500">{description}</div>
        </div>
    )
}

function extractDomain(url: string): string {
    let d = url.trim().toLowerCase()
    if (d.startsWith('sc-domain:')) d = d.slice(10)
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
    return d
}

function matchGscSite(displayName: string, gscSites: SearchConsoleSiteData[]): string {
    if (gscSites.length <= 1) return gscSites[0]?.site_url || ''
    const propDomain = extractDomain(displayName)
    if (!propDomain) return gscSites[0]?.site_url || ''
    for (const site of gscSites) {
        if (!site.site_url) continue
        const gscDomain = extractDomain(site.site_url)
        if (gscDomain === propDomain || gscDomain.includes(propDomain) || propDomain.includes(gscDomain)) {
            return site.site_url
        }
    }
    return gscSites[0]?.site_url || ''
}

interface GenerateReportOptions {
    propertyId?: string
    label?: string
}

function PropertyReportCard({ property, gscSites, hasGsc, defaultSiteUrl, reportLoadingKey, weeklyKey, monthlyKey, onGenerate, userEmail, emailLoadingKey, emailWeeklyKey, emailMonthlyKey, onEmailReport }: {
    property: GooglePropertyData
    gscSites: SearchConsoleSiteData[]
    hasGsc: boolean
    defaultSiteUrl: string
    reportLoadingKey: string | null
    weeklyKey: string
    monthlyKey: string
    onGenerate: (period: 'weekly' | 'monthly', siteUrl: string, options?: GenerateReportOptions) => void
    userEmail: string | null
    emailLoadingKey: string | null
    emailWeeklyKey: string
    emailMonthlyKey: string
    onEmailReport: (period: 'weekly' | 'monthly', siteUrl: string, propertyId: string) => void
}) {
    const [selectedSite, setSelectedSite] = useState(defaultSiteUrl)
    const isLoadingWeekly = reportLoadingKey === weeklyKey
    const isLoadingMonthly = reportLoadingKey === monthlyKey
    const isAnyLoading = !!reportLoadingKey
    const isEmailingWeekly = emailLoadingKey === emailWeeklyKey
    const isEmailingMonthly = emailLoadingKey === emailMonthlyKey
    const isAnyEmailLoading = !!emailLoadingKey
    const canEmail = Boolean(userEmail)

    return (
        <div className="rounded-xl border border-white/[0.05] bg-black/25 p-4 space-y-3">
            <div>
                <div className="text-sm font-semibold text-white">{property.display_name || property.property_id}</div>
                <div className="mt-1 text-xs text-zinc-500">{property.property_id}</div>
            </div>
            {hasGsc ? (
                <>
                    {gscSites.length > 1 && (
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">Search Console site for report</label>
                            <select
                                value={selectedSite}
                                onChange={(e) => setSelectedSite(e.target.value)}
                                className="w-full rounded-lg border border-white/[0.08] bg-zinc-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                            >
                                {gscSites.map(s => (
                                    <option key={s.site_url} value={s.site_url || ''}>{s.site_url}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {gscSites.length === 1 && (
                        <div className="text-xs text-zinc-500">GSC: {defaultSiteUrl}</div>
                    )}
                    {/* Download flow — admin downloads the PDF locally */}
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Download PDF</div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => onGenerate('weekly', selectedSite, { propertyId: property.property_id, label: property.display_name || property.property_id })}
                                disabled={isAnyLoading}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {isLoadingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                {isLoadingWeekly ? 'Generating...' : 'Weekly'}
                            </button>
                            <button
                                onClick={() => onGenerate('monthly', selectedSite, { propertyId: property.property_id, label: property.display_name || property.property_id })}
                                disabled={isAnyLoading}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {isLoadingMonthly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                {isLoadingMonthly ? 'Generating...' : 'Monthly'}
                            </button>
                        </div>
                    </div>

                    {/* Email flow — same renderer ships through Brevo to user.email */}
                    <div className="border-t border-white/[0.04] pt-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                            Email to user{userEmail ? ` (${userEmail})` : ' — no email on file'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => onEmailReport('weekly', selectedSite, property.property_id)}
                                disabled={isAnyEmailLoading || !canEmail}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-medium text-[#7AD9DA] hover:bg-[#14C4E1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title={canEmail ? 'Email weekly report to user' : 'User has no email on file'}
                            >
                                {isEmailingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                {isEmailingWeekly ? 'Sending...' : 'Email weekly'}
                            </button>
                            <button
                                onClick={() => onEmailReport('monthly', selectedSite, property.property_id)}
                                disabled={isAnyEmailLoading || !canEmail}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-medium text-[#7AD9DA] hover:bg-[#14C4E1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title={canEmail ? 'Email monthly report to user' : 'User has no email on file'}
                            >
                                {isEmailingMonthly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                {isEmailingMonthly ? 'Sending...' : 'Email monthly'}
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <p className="text-xs text-amber-400">No Search Console site available — report generation needs a verified Search Console site.</p>
            )}
        </div>
    )
}

function SearchConsoleReportCard({ site, reportLoadingKey, weeklyKey, monthlyKey, onGenerate, userEmail, emailLoadingKey, emailWeeklyKey, emailMonthlyKey, onEmailReport }: {
    site: SearchConsoleSiteData
    reportLoadingKey: string | null
    weeklyKey: string
    monthlyKey: string
    onGenerate: (period: 'weekly' | 'monthly', siteUrl: string, options?: GenerateReportOptions) => void
    userEmail: string | null
    emailLoadingKey: string | null
    emailWeeklyKey: string
    emailMonthlyKey: string
    onEmailReport: (period: 'weekly' | 'monthly', siteUrl: string) => void
}) {
    const siteUrl = site.site_url || ''
    const isLoadingWeekly = reportLoadingKey === weeklyKey
    const isLoadingMonthly = reportLoadingKey === monthlyKey
    const isAnyLoading = !!reportLoadingKey
    const isEmailingWeekly = emailLoadingKey === emailWeeklyKey
    const isEmailingMonthly = emailLoadingKey === emailMonthlyKey
    const isAnyEmailLoading = !!emailLoadingKey
    const canEmail = Boolean(userEmail) && Boolean(siteUrl)

    return (
        <div className="rounded-xl border border-white/[0.05] bg-black/25 p-4 space-y-3">
            <div className="text-sm font-semibold text-white break-all">{siteUrl || 'Unknown site'}</div>
            <div className="flex flex-wrap gap-2">
                {site.permission_level ? <SignalPill tone="emerald">{site.permission_level}</SignalPill> : null}
                {site.site_type ? <SignalPill tone="zinc">{site.site_type}</SignalPill> : null}
                <SignalPill tone="amber">SEO only</SignalPill>
            </div>
            <p className="text-xs text-zinc-500">GA4 property unavailable for this user, so this generates a Search Console-only PDF.</p>
            <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Download PDF</div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => onGenerate('weekly', siteUrl, { label: siteUrl })}
                        disabled={isAnyLoading || !siteUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoadingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        {isLoadingWeekly ? 'Generating...' : 'Weekly'}
                    </button>
                    <button
                        onClick={() => onGenerate('monthly', siteUrl, { label: siteUrl })}
                        disabled={isAnyLoading || !siteUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoadingMonthly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        {isLoadingMonthly ? 'Generating...' : 'Monthly'}
                    </button>
                </div>
            </div>
            <div className="border-t border-white/[0.04] pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                    Email to user{userEmail ? ` (${userEmail})` : ' — no email on file'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => onEmailReport('weekly', siteUrl)}
                        disabled={isAnyEmailLoading || !canEmail}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-medium text-[#7AD9DA] hover:bg-[#14C4E1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        {isEmailingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        {isEmailingWeekly ? 'Sending...' : 'Email weekly'}
                    </button>
                    <button
                        onClick={() => onEmailReport('monthly', siteUrl)}
                        disabled={isAnyEmailLoading || !canEmail}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#14C4E1]/30 bg-[#14C4E1]/10 px-3 py-1.5 text-xs font-medium text-[#7AD9DA] hover:bg-[#14C4E1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        {isEmailingMonthly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        {isEmailingMonthly ? 'Sending...' : 'Email monthly'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function UserProfileDrawer({ user, profile, loading, refreshing, error, actionLoading, showCreditInput, creditInputValue, containerStatusColor, onClose, onRefresh, onAction, onDelete, onToggleCreditInput, onCreditInputChange, onAddCredits }: {
    user: UserData | null
    profile: UserProfileData | null
    loading: boolean
    refreshing: boolean
    error: string
    actionLoading: string
    showCreditInput: boolean
    creditInputValue: string
    containerStatusColor: (s: string | undefined | null) => string
    onClose: () => void
    onRefresh: () => void
    onAction: (action: string, githubId: string, params?: Record<string, unknown>) => void
    onDelete: () => void
    onToggleCreditInput: () => void
    onCreditInputChange: (value: string) => void
    onAddCredits: () => void
}) {
    const [reportLoadingKey, setReportLoadingKey] = useState<string | null>(null)
    const [emailLoadingKey, setEmailLoadingKey] = useState<string | null>(null)
    const [reportError, setReportError] = useState('')
    const [tokenInput, setTokenInput] = useState('')
    const [showToken, setShowToken] = useState(false)

    useEffect(() => {
        setTokenInput('')
        setShowToken(false)
    }, [user?.github_id])

    // Per-property email send. Wraps the same orchestrator that the row-level
    // Mail icon uses, but lets the admin pick a specific GA4 property + GSC
    // site (otherwise the user's saved workspace selection is the default).
    const handleEmailReport = async (
        period: 'weekly' | 'monthly',
        siteUrl: string,
        propertyId?: string,
    ) => {
        if (!user || emailLoadingKey) return
        const key = `email-${propertyId || siteUrl}:${period}`
        setEmailLoadingKey(key)
        setReportError('')
        try {
            await apiPost('send-report-email', {
                userId: user.github_id,
                period,
                ...(propertyId ? { propertyId } : {}),
                ...(siteUrl ? { siteUrl } : {}),
            })
            alert(`${period[0].toUpperCase()}${period.slice(1)} report emailed to ${user.email}.`)
        } catch (err) {
            const message = getErrorMessage(err, 'Email send failed')
            if (isSuperadminAuthError(message)) return
            setReportError(message)
            alert(`Failed to send: ${message}`)
        } finally {
            setEmailLoadingKey(null)
        }
    }

    const handleGenerateReport = async (period: 'weekly' | 'monthly', siteUrl: string, options?: GenerateReportOptions) => {
        if (!user || reportLoadingKey) return
        const propertyId = options?.propertyId
        const loadingKey = `${propertyId || siteUrl}:${period}`
        setReportLoadingKey(loadingKey)
        setReportError('')

        try {
            const token = requireSuperadminToken()
            const res = await fetch('/api/report/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, githubId: user.github_id, period, siteUrl, ...(propertyId ? { propertyId } : {}) }),
            })

            if (!res.ok) {
                if (res.status === 403) {
                    expireSuperadminSession()
                    throw new Error(SUPERADMIN_SESSION_EXPIRED_MESSAGE)
                }
                const err = await res.json().catch(() => ({ error: 'Report generation failed' }))
                throw new Error(err.error || 'Report generation failed')
            }

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const safeName = (options?.label || propertyId || siteUrl).replace(/[^a-zA-Z0-9_-]/g, '_')
            a.download = `TrafficClaw_${period}_${safeName}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            const message = getErrorMessage(err, 'Report generation failed')
            if (isSuperadminAuthError(message)) return
            setReportError(message)
        } finally {
            setReportLoadingKey(null)
        }
    }
    if (!user) return null

    const containerStatus = profile?.container.status || user.container?.status || 'unknown'
    const isRunning = containerStatus.toLowerCase() === 'running'

    return (
        <AnimatePresence>
            <motion.div key={user.github_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70" onClick={onClose}>
                <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 260 }} onClick={(e) => e.stopPropagation()} className="ml-auto h-full w-full max-w-3xl overflow-y-auto border-l border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl">
                    <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-zinc-950/90 px-6 py-5 backdrop-blur-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold text-white">{profile?.account.username || user.username || user.github_id}</h2>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${containerStatusColor(containerStatus)}`}>{containerStatus}</span>
                                </div>
                                <div className="mt-1 text-sm text-zinc-400">{profile?.account.email || user.email || 'No email'}</div>
                                <div className="mt-1 text-xs text-zinc-600">ID: {profile?.account.identifier || user.github_id}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-300 hover:text-white transition-colors">
                                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                                    {refreshing ? 'Refreshing' : 'Refresh'}
                                </button>
                                <button onClick={onClose} className="rounded-lg border border-white/[0.08] bg-black/30 p-2 text-zinc-400 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 px-6 py-6">
                        <DrawerSection icon={Server} title="Admin Actions">
                            <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
                                <div className="space-y-3">
                                    <select value={user.plan || 'free'} onChange={(e) => onAction('update-plan', user.github_id, { plan: e.target.value })} className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50">
                                        <option value="free">Free</option>
                                        <option value="starter">Starter</option>
                                        <option value="growth">Growth</option>
                                        <option value="pro">Pro</option>
                                    </select>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white">{formatNumber(profile?.subscription.credits ?? user.credits)}</span>
                                        <button onClick={onToggleCreditInput} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                                            {showCreditInput ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                            {showCreditInput ? 'Hide' : 'Add credits'}
                                        </button>
                                        {showCreditInput ? (
                                            <>
                                                <input type="number" min="1" value={creditInputValue} onChange={(e) => onCreditInputChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAddCredits()} placeholder="0" className="w-24 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                                                <button onClick={onAddCredits} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">Apply</button>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-start gap-2">
                                    {!isRunning ? (
                                        <button onClick={() => onAction('start', user.github_id)} disabled={actionLoading === `start-${user.github_id}`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"><Play className="w-4 h-4" />Start</button>
                                    ) : (
                                        <button onClick={() => onAction('stop', user.github_id)} disabled={actionLoading === `stop-${user.github_id}`} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40 transition-colors"><Square className="w-4 h-4" />Stop</button>
                                    )}
                                    <button onClick={() => onAction('restart', user.github_id)} disabled={actionLoading === `restart-${user.github_id}`} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40 transition-colors"><RotateCw className="w-4 h-4" />Restart</button>
                                    <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"><Trash2 className="w-4 h-4" />Delete</button>
                                </div>
                            </div>
                        </DrawerSection>

                        <DrawerSection icon={Bot} title="Container Setup">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">Bot engine</label>
                                    <select
                                        value={user.bot_engine || profile?.container.engine || 'openclaw'}
                                        onChange={(e) => onAction('update-settings', user.github_id, { bot_engine: e.target.value })}
                                        disabled={actionLoading === `update-settings-${user.github_id}`}
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                                    >
                                        <option value="openclaw">OpenClaw</option>
                                        <option value="nanobot">Nanobot</option>
                                    </select>
                                    <p className="mt-1 text-xs text-zinc-500">After changing engine, Destroy the existing container then Start to apply.</p>
                                </div>

                                <div>
                                    <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">Telegram bot token</label>
                                    <div className="flex items-stretch gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={showToken ? 'text' : 'password'}
                                                value={tokenInput}
                                                onChange={(e) => setTokenInput(e.target.value)}
                                                placeholder="Paste token from @BotFather (1234567:ABC...)"
                                                className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowToken(s => !s)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                            >
                                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const v = tokenInput.trim()
                                                if (!v) return
                                                onAction('update-settings', user.github_id, { telegram_bot_token: v })
                                                setTokenInput('')
                                            }}
                                            disabled={!tokenInput.trim() || actionLoading === `update-settings-${user.github_id}`}
                                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {actionLoading === `update-settings-${user.github_id}` ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                    <p className="mt-1 text-xs text-zinc-500">Saving triggers a container sync with the new token. Current bot: {profile?.container.bot_username ? `@${profile.container.bot_username}` : '(none)'}</p>
                                </div>

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-white">Destroy container</div>
                                        <div className="text-xs text-zinc-500">Stops and removes the Docker container only. Keeps the User row, OAuth tokens, credits, and data directory intact.</div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Destroy this container? The user record, OAuth tokens, and data are preserved — only the running Docker container is removed.')) {
                                                onAction('destroy-container', user.github_id)
                                            }
                                        }}
                                        disabled={actionLoading === `destroy-container-${user.github_id}`}
                                        className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {actionLoading === `destroy-container-${user.github_id}` ? 'Destroying...' : 'Destroy'}
                                    </button>
                                </div>
                            </div>
                        </DrawerSection>

                        {loading && !profile ? <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/70 p-10 text-center text-zinc-500">Loading full user profile...</div> : null}
                        {!loading && !profile && error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">{error}</div> : null}
                        {profile ? (
                            <>
                                <DrawerSection icon={Users} title="Overview">
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <DetailStat label="Account" value={profile.account.is_active ? 'Active' : 'Disabled'} />
                                        <DetailStat label="Providers" value={String(profile.providers.length)} sub={profile.providers.map(provider => provider.provider).join(', ') || 'No connections'} />
                                        <DetailStat label="Created" value={formatDateTime(profile.account.created_at)} />
                                        <DetailStat label="Updated" value={formatDateTime(profile.account.updated_at)} />
                                        <DetailStat label="Engine" value={profile.container.engine || 'openclaw'} sub={profile.container.port ? `Port ${profile.container.port}` : undefined} />
                                        <DetailStat label="Telegram" value={profile.container.telegram_status || (profile.container.telegram_enabled ? 'enabled' : 'disabled')} sub={profile.container.bot_username ? `@${profile.container.bot_username}` : undefined} />
                                        <DetailStat label="Memory" value={profile.container.memory_usage_mb ? `${profile.container.memory_usage_mb} MB` : '—'} sub={profile.container.memory_percent !== undefined ? `${profile.container.memory_percent}% of limit` : undefined} />
                                        <DetailStat label="Health" value={profile.container.health || '—'} sub={profile.container.last_health_check ? `Checked ${formatDateTime(profile.container.last_health_check)}` : undefined} />
                                    </div>
                                    {profile.container.error ? <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">{profile.container.error}</div> : null}
                                </DrawerSection>

                                <DrawerSection icon={Coins} title="Subscription & Credits">
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        <DetailStat label="Plan" value={profile.subscription.plan} />
                                        <DetailStat label="Credits" value={formatNumber(profile.subscription.credits)} />
                                        <DetailStat label="Subscription ID" value={profile.subscription.subscription_id || '—'} />
                                        <DetailStat label="Start" value={formatDateTime(profile.subscription.subscription_start)} />
                                        <DetailStat label="End" value={formatDateTime(profile.subscription.subscription_end)} />
                                        <DetailStat label="Flags" value={profile.subscription.subscription_cancelled ? 'Cancelled' : 'Active'} sub={profile.subscription.telegram_bot_enabled ? 'Telegram bot enabled' : 'Telegram bot disabled'} />
                                    </div>
                                </DrawerSection>

                                <DrawerSection icon={Link2} title="Integrations">
                                    {profile.providers.length === 0 ? <EmptyState title="No connected providers" description="This user has not connected any OAuth providers with active tokens." /> : (
                                        <div className="space-y-3">
                                            {profile.providers.map(provider => (
                                                <div key={`${provider.provider}-${provider.provider_account_id || provider.updated_at || 'provider'}`} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-semibold capitalize text-white">{provider.provider}</span>
                                                        <SignalPill tone="emerald">Connected</SignalPill>
                                                        {provider.has_refresh_token ? <SignalPill tone="cyan">Refresh token</SignalPill> : null}
                                                    </div>
                                                    <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                                                        <div>Account: {provider.provider_account_id || '—'}</div>
                                                        <div>Token type: {provider.token_type || '—'}</div>
                                                        <div>Scopes: {provider.scope?.join(', ') || '—'}</div>
                                                        <div>Updated: {formatDateTime(provider.updated_at)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </DrawerSection>

                                <DrawerSection icon={Globe} title="Google Properties & Sites">
                                    {profile.google_inventory.warnings.length ? <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">{profile.google_inventory.warnings.map((warning, index) => <div key={index}>{warning}</div>)}</div> : null}
                                    {reportError && (
                                        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{reportError}</div>
                                    )}
                                    {!profile.google_inventory.connected ? <EmptyState title="Google not connected" description="GA4 properties and Search Console sites will appear here once the user connects Google." /> : (
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <div className="text-xs uppercase tracking-wider text-zinc-500">GA4 Properties</div>
                                                {profile.google_inventory.ga_properties.length === 0 ? <EmptyState title="No properties returned" description="The live GA inventory request returned no accessible properties." /> : profile.google_inventory.ga_properties.map(property => {
                                                    const gscSites = profile.google_inventory.gsc_sites.filter(s => s.site_url)
                                                    const hasGsc = gscSites.length > 0
                                                    const defaultSiteUrl = matchGscSite(property.display_name, gscSites)
                                                    const weeklyKey = `${property.property_id}:weekly`
                                                    const monthlyKey = `${property.property_id}:monthly`
                                                    const emailWeeklyKey = `email-${property.property_id}:weekly`
                                                    const emailMonthlyKey = `email-${property.property_id}:monthly`
                                                    return (
                                                        <PropertyReportCard
                                                            key={property.property_id}
                                                            property={property}
                                                            gscSites={gscSites}
                                                            hasGsc={hasGsc}
                                                            defaultSiteUrl={defaultSiteUrl}
                                                            reportLoadingKey={reportLoadingKey}
                                                            weeklyKey={weeklyKey}
                                                            monthlyKey={monthlyKey}
                                                            onGenerate={handleGenerateReport}
                                                            userEmail={user.email || null}
                                                            emailLoadingKey={emailLoadingKey}
                                                            emailWeeklyKey={emailWeeklyKey}
                                                            emailMonthlyKey={emailMonthlyKey}
                                                            onEmailReport={handleEmailReport}
                                                        />
                                                    )
                                                })}
                                            </div>
                                            <div className="space-y-3">
                                                <div className="text-xs uppercase tracking-wider text-zinc-500">Search Console Sites</div>
                                                {profile.google_inventory.ga_properties.length === 0 && profile.google_inventory.gsc_sites.length > 0 ? (
                                                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                                                        GA4 properties are unavailable for this user. Reports below will use Search Console data only.
                                                    </div>
                                                ) : null}
                                                {profile.google_inventory.gsc_sites.length === 0 ? <EmptyState title="No sites returned" description="The live Search Console request returned no verified sites." /> : profile.google_inventory.gsc_sites.map(site => {
                                                    const siteKey = site.site_url || `site-${site.permission_level || 'unknown'}`
                                                    const weeklyKey = `${siteKey}:weekly`
                                                    const monthlyKey = `${siteKey}:monthly`
                                                    const emailWeeklyKey = `email-${siteKey}:weekly`
                                                    const emailMonthlyKey = `email-${siteKey}:monthly`
                                                    return profile.google_inventory.ga_properties.length === 0 ? (
                                                        <SearchConsoleReportCard
                                                            key={siteKey}
                                                            site={site}
                                                            reportLoadingKey={reportLoadingKey}
                                                            weeklyKey={weeklyKey}
                                                            monthlyKey={monthlyKey}
                                                            onGenerate={handleGenerateReport}
                                                            userEmail={user.email || null}
                                                            emailLoadingKey={emailLoadingKey}
                                                            emailWeeklyKey={emailWeeklyKey}
                                                            emailMonthlyKey={emailMonthlyKey}
                                                            onEmailReport={handleEmailReport}
                                                        />
                                                    ) : (
                                                        <div key={siteKey} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                            <div className="text-sm font-semibold text-white break-all">{site.site_url || 'Unknown site'}</div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {site.permission_level ? <SignalPill tone="emerald">{site.permission_level}</SignalPill> : null}
                                                                {site.site_type ? <SignalPill tone="zinc">{site.site_type}</SignalPill> : null}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </DrawerSection>

                                <DrawerSection icon={Activity} title="Globe / Embed / Share Usage">
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <DetailStat label="Active embeds" value={String(profile.globe_assets.summary.active_embed_tokens)} />
                                        <DetailStat label="Embeds used" value={String(profile.globe_assets.summary.used_embed_tokens)} sub="Tokens with last_used_at" />
                                        <DetailStat label="Shared dashboards" value={String(profile.globe_assets.summary.shared_dashboards)} sub={`${formatNumber(profile.globe_assets.summary.shared_dashboard_views)} total views`} />
                                        <DetailStat label="Public dashboards" value={String(profile.globe_assets.summary.public_custom_dashboards)} sub={`${formatNumber(profile.globe_assets.summary.public_custom_dashboard_views)} total views`} />
                                    </div>
                                    <div className="mt-5 space-y-3">
                                        <div className="text-xs uppercase tracking-wider text-zinc-500">Embed Tokens</div>
                                        {profile.globe_assets.embed_tokens.length === 0 ? <EmptyState title="No embed tokens" description="This user is not currently exposing any active globe/embed tokens." /> : profile.globe_assets.embed_tokens.map(token => (
                                            <div key={token.id} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-sm font-semibold text-white">{token.label || token.property_name || token.property_id}</div>
                                                    <SignalPill tone={token.last_used_at ? 'emerald' : 'zinc'}>{token.last_used_at ? 'Used' : 'Never used'}</SignalPill>
                                                </div>
                                                <div className="mt-2 text-xs text-zinc-500">{token.property_name || token.property_id}</div>
                                                <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                                                    <div>Created: {formatDateTime(token.created_at)}</div>
                                                    <div>Last used: {formatDateTime(token.last_used_at)}</div>
                                                    <div className="sm:col-span-2">Allowed origins: {token.allowed_origins.length ? token.allowed_origins.join(', ') : 'Any origin'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-5 space-y-3">
                                        <div className="text-xs uppercase tracking-wider text-zinc-500">Shared Dashboards</div>
                                        {profile.shared_dashboards.length === 0 ? <EmptyState title="No shared dashboards" description="This user has not published any active shared dashboard links." /> : profile.shared_dashboards.map(share => (
                                            <div key={share.id} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-sm font-semibold text-white break-all">{share.site_url || share.property_name || share.property_id}</div>
                                                    <SignalPill tone="amber">{formatNumber(share.views)} views</SignalPill>
                                                </div>
                                                <div className="mt-2 text-xs text-zinc-500">{share.property_name || share.property_id}</div>
                                                <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                                                    <div>Created: {formatDateTime(share.created_at)}</div>
                                                    <div>Last viewed: {formatDateTime(share.last_viewed_at)}</div>
                                                    <div className="sm:col-span-2">Widgets: {Object.entries(share.config || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'Default config'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </DrawerSection>

                                <DrawerSection icon={LayoutDashboard} title="Custom Dashboards">
                                    {profile.custom_dashboards.length === 0 ? <EmptyState title="No custom dashboards" description="This user has not created any active custom dashboards yet." /> : (
                                        <div className="space-y-3">
                                            {profile.custom_dashboards.map(dashboard => (
                                                <div key={dashboard.id} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="text-sm font-semibold text-white">{dashboard.name}</div>
                                                        {dashboard.is_public ? <SignalPill tone="emerald">Public</SignalPill> : null}
                                                        {dashboard.has_share_link ? <SignalPill tone="cyan">Share link</SignalPill> : null}
                                                        {dashboard.embed_enabled ? <SignalPill tone="amber">Embed enabled</SignalPill> : null}
                                                        <SignalPill tone="zinc">{dashboard.widget_count} widgets</SignalPill>
                                                    </div>
                                                    <div className="mt-2 text-xs text-zinc-500">{dashboard.property_name || dashboard.property_id}</div>
                                                    {dashboard.description ? <div className="mt-2 text-sm text-zinc-400">{dashboard.description}</div> : null}
                                                    <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                                                        <div>Site: {dashboard.site_url || '—'}</div>
                                                        <div>Views: {formatNumber(dashboard.views)}</div>
                                                        <div>Created: {formatDateTime(dashboard.created_at)}</div>
                                                        <div>Updated: {formatDateTime(dashboard.updated_at)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </DrawerSection>

                                <DrawerSection icon={BarChart3} title="Leaderboard">
                                    {!profile.leaderboard ? <EmptyState title="Not listed" description="This user does not currently have an active leaderboard entry." /> : (
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-lg font-semibold text-white">{profile.leaderboard.startup_name}</div>
                                                {profile.leaderboard.is_verified ? <SignalPill tone="emerald">Verified</SignalPill> : <SignalPill tone="zinc">Unverified</SignalPill>}
                                                {profile.leaderboard.category ? <SignalPill tone="cyan">{profile.leaderboard.category}</SignalPill> : null}
                                            </div>
                                            {profile.leaderboard.description ? <div className="text-sm text-zinc-400">{profile.leaderboard.description}</div> : null}
                                            {profile.leaderboard.website_url ? <a href={profile.leaderboard.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-300 hover:text-emerald-200">{profile.leaderboard.website_url}<ExternalLink className="w-3.5 h-3.5" /></a> : null}
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                <DetailStat label="Property" value={profile.leaderboard.ga_property_name || profile.leaderboard.ga_property_id || '—'} />
                                                <DetailStat label="Visitors" value={formatNumber(profile.leaderboard.monthly_visitors)} />
                                                <DetailStat label="Pageviews" value={formatNumber(profile.leaderboard.monthly_pageviews)} />
                                                <DetailStat label="Trend" value={formatPercent(profile.leaderboard.visitor_trend)} />
                                                <DetailStat label="Engagement" value={formatPercent(profile.leaderboard.engagement_rate)} />
                                                <DetailStat label="Bounce" value={formatPercent(profile.leaderboard.bounce_rate)} />
                                                <DetailStat label="Avg session" value={formatDuration(profile.leaderboard.avg_session_duration)} />
                                                <DetailStat label="Refreshed" value={formatDateTime(profile.leaderboard.last_refreshed)} />
                                            </div>
                                        </div>
                                    )}
                                </DrawerSection>

                                <DrawerSection icon={Clock} title="Recent Events">
                                    {profile.recent_events.length === 0 ? <EmptyState title="No recent events" description="Container/admin events for this user will appear here." /> : (
                                        <div className="space-y-3">
                                            {profile.recent_events.map(event => (
                                                <div key={event.id} className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="text-sm font-semibold capitalize text-white">{event.event_type.replace(/_/g, ' ')}</div>
                                                        <div className="text-xs text-zinc-500">{event.created_at ? timeAgo(event.created_at) : '—'}</div>
                                                    </div>
                                                    {event.details ? <div className="mt-2 text-sm text-zinc-400">{event.details}</div> : null}
                                                    <div className="mt-2 text-xs text-zinc-600">{event.container_id ? `Container: ${event.container_id}` : 'No container ID'} · {formatDateTime(event.created_at)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </DrawerSection>

                                <DrawerSection icon={Terminal} title="Container Logs">
                                    {profile.logs?.logs || profile.logs?.error ? <pre className="max-h-80 overflow-auto rounded-xl bg-black/50 p-4 text-xs text-zinc-300 whitespace-pre-wrap">{profile.logs?.logs || profile.logs?.error}</pre> : <EmptyState title="No logs available" description="The container has not emitted logs yet, or the runtime is not provisioned." />}
                                </DrawerSection>
                            </>
                        ) : null}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ─── Queries Tab ─────────────────────────────────────────────────────────────

function QueriesTab({ queries, onRefresh }: { queries: QueryData[]; onRefresh: () => void }) {
    const [filter, setFilter] = useState<'all' | 'new' | 'read' | 'replied'>('all')
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [actionLoading, setActionLoading] = useState('')
    const [deleteTarget, setDeleteTarget] = useState<QueryData | null>(null)

    const filtered = queries.filter(q => filter === 'all' || q.status === filter)

    const handleStatusUpdate = async (queryId: number, status: string) => {
        setActionLoading(`status-${queryId}`)
        try {
            await apiPost('update-query-status', { queryId, status })
            onRefresh()
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(message)
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleDelete = async (query: QueryData) => {
        setActionLoading(`delete-${query.id}`)
        try {
            await apiPost('delete-query', { queryId: query.id })
            setDeleteTarget(null)
            onRefresh()
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                alert(message)
            }
        } finally {
            setActionLoading('')
        }
    }

    const statusColor = (s: string) => {
        if (s === 'new') return 'bg-emerald-500/20 text-emerald-400'
        if (s === 'read') return 'bg-amber-500/20 text-amber-400'
        if (s === 'replied') return 'bg-cyan-500/20 text-cyan-400'
        return 'bg-zinc-700 text-zinc-400'
    }

    const counts = {
        all: queries.length,
        new: queries.filter(q => q.status === 'new').length,
        read: queries.filter(q => q.status === 'read').length,
        replied: queries.filter(q => q.status === 'replied').length,
    }

    return (
        <div className="space-y-4">
            {/* Filter pills */}
            <div className="flex gap-2 flex-wrap">
                {(['all', 'new', 'read', 'replied'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                            filter === f
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-zinc-900/50 text-zinc-500 border border-white/[0.04] hover:text-zinc-300'
                        }`}
                    >
                        {f} ({counts[f]})
                    </button>
                ))}
            </div>

            {/* Queries list */}
            <div className="space-y-3">
                {filtered.length === 0 && (
                    <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl p-12 text-center">
                        <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-600">No {filter === 'all' ? '' : filter} queries yet</p>
                    </div>
                )}

                {filtered.map(query => (
                    <div
                        key={query.id}
                        className="bg-zinc-900/50 border border-white/[0.04] rounded-xl overflow-hidden"
                    >
                        {/* Header row */}
                        <div
                            className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                            onClick={() => {
                                setExpandedId(expandedId === query.id ? null : query.id)
                                if (query.status === 'new') handleStatusUpdate(query.id, 'read')
                            }}
                        >
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-bold text-emerald-400">
                                    {query.name[0]?.toUpperCase() || '?'}
                                </span>
                            </div>

                            {/* Name + email */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white truncate">{query.name}</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(query.status)}`}>
                                        {query.status}
                                    </span>
                                </div>
                                <span className="text-xs text-zinc-500 truncate block">{query.email}</span>
                            </div>

                            {/* Time */}
                            <span className="text-xs text-zinc-600 whitespace-nowrap flex-shrink-0">
                                {query.created_at ? timeAgo(query.created_at) : '-'}
                            </span>

                            {/* Expand chevron */}
                            <ChevronDown className={`w-4 h-4 text-zinc-600 transition-transform flex-shrink-0 ${expandedId === query.id ? 'rotate-180' : ''}`} />
                        </div>

                        {/* Expanded content */}
                        {expandedId === query.id && (
                            <div className="border-t border-white/[0.04] px-5 py-4 bg-black/20">
                                {/* Message */}
                                <div className="mb-4">
                                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Message</div>
                                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed bg-black/30 rounded-lg p-4">
                                        {query.message}
                                    </p>
                                </div>

                                {/* Meta */}
                                <div className="flex items-center gap-4 text-xs text-zinc-600 mb-4">
                                    <span>ID: #{query.id}</span>
                                    {query.ip_address && <span>IP: {query.ip_address}</span>}
                                    {query.created_at && <span>{new Date(query.created_at).toLocaleString()}</span>}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <a
                                        href={`mailto:${query.email}?subject=${encodeURIComponent(`Re: Your TrafficClaw query`)}&body=${encodeURIComponent(`Hi ${query.name},\n\nThank you for reaching out to TrafficClaw.\n\n---\nYour original message:\n${query.message}\n`)}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-xs font-medium hover:bg-emerald-600/30 transition-colors"
                                    >
                                        <Mail className="w-3.5 h-3.5" />
                                        Reply via Email
                                        <ExternalLink className="w-3 h-3" />
                                    </a>

                                    {query.status !== 'replied' && (
                                        <button
                                            onClick={() => handleStatusUpdate(query.id, 'replied')}
                                            disabled={actionLoading === `status-${query.id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 text-xs font-medium hover:bg-cyan-600/30 transition-colors disabled:opacity-50"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Mark as Replied
                                        </button>
                                    )}

                                    {query.status === 'replied' && (
                                        <button
                                            onClick={() => handleStatusUpdate(query.id, 'new')}
                                            disabled={actionLoading === `status-${query.id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                                        >
                                            Mark as New
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setDeleteTarget(query)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/10 text-red-400 text-xs font-medium hover:bg-red-600/20 transition-colors ml-auto"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
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
                                    <h3 className="text-lg font-bold text-white">Delete Query</h3>
                                    <p className="text-sm text-zinc-500">From {deleteTarget.name} ({deleteTarget.email})</p>
                                </div>
                            </div>
                            <p className="text-sm text-zinc-400 mb-6">
                                This will permanently delete this contact query. This action cannot be undone.
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
                                    disabled={actionLoading === `delete-${deleteTarget.id}`}
                                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                                >
                                    {actionLoading === `delete-${deleteTarget.id}` ? 'Deleting...' : 'Delete Forever'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ─── Support Tab (in-app help & support inbox) ───────────────────────────────

function SupportTab({ threads, onRefresh }: { threads: SupportThread[]; onRefresh: () => void }) {
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
    const [detail, setDetail] = useState<SupportThreadDetail | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [reply, setReply] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')

    // Auto-select the first thread on mount / refresh if nothing's selected.
    useEffect(() => {
        if (!selectedUserId && threads.length > 0) {
            setSelectedUserId(threads[0].user_id)
        }
    }, [threads, selectedUserId])

    // Load detail + mark user-side messages read whenever the selection changes.
    useEffect(() => {
        if (!selectedUserId) {
            setDetail(null)
            return
        }
        let cancelled = false
        setLoadingDetail(true)
        setError('')
        ;(async () => {
            try {
                const data = await apiGet('support-thread', String(selectedUserId)) as SupportThreadDetail
                if (cancelled) return
                setDetail(data)
                // Don't await — best-effort. The next inbox refresh will reflect the new read state.
                void apiPost('support-mark-read', { userId: selectedUserId })
                onRefresh()
            } catch (err) {
                if (cancelled) return
                const message = getErrorMessage(err)
                if (!isSuperadminAuthError(message)) setError(message)
            } finally {
                if (!cancelled) setLoadingDetail(false)
            }
        })()
        return () => { cancelled = true }
        // onRefresh intentionally omitted — its identity changes every fetchData call and would
        // re-trigger this effect, causing a refresh loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUserId])

    const handleReply = async () => {
        const content = reply.trim()
        if (!content || !selectedUserId || sending) return
        setSending(true)
        setError('')
        try {
            await apiPost('support-reply', { userId: selectedUserId, content })
            setReply('')
            // Refetch the thread detail so the new admin reply appears immediately.
            const data = await apiGet('support-thread', String(selectedUserId)) as SupportThreadDetail
            setDetail(data)
            onRefresh()
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) setError(message)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[520px]">
            {/* Inbox rail */}
            <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2">
                        <LifeBuoy className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-white">Inbox</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">{threads.length} {threads.length === 1 ? 'user' : 'users'}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {threads.length === 0 ? (
                        <div className="p-12 text-center">
                            <LifeBuoy className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                            <p className="text-zinc-600 text-sm">No support messages yet</p>
                        </div>
                    ) : (
                        threads.map((t) => (
                            <SupportThreadRow
                                key={t.user_id}
                                thread={t}
                                selected={t.user_id === selectedUserId}
                                onSelect={() => setSelectedUserId(t.user_id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Thread + reply pane */}
            <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl overflow-hidden flex flex-col">
                {!selectedUserId ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
                        Select a thread on the left to start replying.
                    </div>
                ) : loadingDetail && !detail ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                ) : !detail ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
                        Couldn’t load thread.
                    </div>
                ) : (
                    <>
                        {/* User header */}
                        <div className="border-b border-white/[0.04] px-5 py-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate">
                                    {detail.user.github_username || detail.user.email || `User #${detail.user.id}`}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                                    {detail.user.email && <span className="truncate">{detail.user.email}</span>}
                                    {detail.user.plan && (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-semibold uppercase">
                                            {detail.user.plan}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-[10px] text-zinc-600">
                                {detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                            {detail.messages.map((m) => (
                                <SupportInboxMessage key={m.id} msg={m} />
                            ))}
                        </div>

                        {/* Reply composer */}
                        {error && (
                            <div className="mx-3 mb-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">
                                {error}
                            </div>
                        )}
                        <div className="border-t border-white/[0.04] p-3">
                            <div className="flex items-end gap-2 bg-white/[0.03] border border-white/[0.04] rounded-xl px-3 py-2.5 focus-within:border-emerald-500/30 transition-colors">
                                <textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault()
                                            void handleReply()
                                        }
                                    }}
                                    placeholder="Type your reply… (⌘/Ctrl+Enter to send)"
                                    className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none leading-relaxed"
                                    rows={2}
                                    disabled={sending}
                                    style={{ minHeight: '44px', maxHeight: '160px' }}
                                />
                                <button
                                    onClick={handleReply}
                                    disabled={!reply.trim() || sending}
                                    className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-emerald-500 enabled:text-white text-zinc-500 transition-all enabled:hover:bg-emerald-400 flex-shrink-0"
                                    aria-label="Send reply"
                                >
                                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function SupportThreadRow({
    thread,
    selected,
    onSelect,
}: {
    thread: SupportThread
    selected: boolean
    onSelect: () => void
}) {
    const hasUnread = thread.unread_user_count > 0
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-4 py-3 border-b border-white/[0.03] transition-colors ${
                selected ? 'bg-emerald-500/[0.06]' : 'hover:bg-white/[0.02]'
            }`}
        >
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasUnread ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                    <span className="text-sm font-semibold text-white truncate">
                        {thread.github_username || thread.email || `User #${thread.user_id}`}
                    </span>
                </div>
                {hasUnread && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold leading-none flex-shrink-0">
                        {thread.unread_user_count}
                    </span>
                )}
            </div>
            <p className="text-[12px] text-zinc-500 line-clamp-2 leading-snug">
                {thread.last_message_author === 'admin' ? 'You: ' : ''}
                {thread.last_message_preview}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-600">
                {thread.plan && <span className="uppercase tracking-wide">{thread.plan}</span>}
                <span>·</span>
                <span>{formatRelativeTime(thread.last_message_at)}</span>
            </div>
        </button>
    )
}

function SupportInboxMessage({ msg }: { msg: SupportThreadMessage }) {
    const isAdmin = msg.author_type === 'admin'
    return (
        <div className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
            <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    isAdmin ? 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-black' : 'bg-cyan-500/15 text-cyan-300'
                }`}
            >
                {isAdmin ? 'TC' : 'U'}
            </div>
            <div className={`min-w-0 max-w-[80%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-zinc-400">
                        {isAdmin ? 'You (Support)' : 'User'}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                        {formatRelativeTime(msg.created_at)}
                    </span>
                </div>
                <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        isAdmin
                            ? 'bg-emerald-500/15 text-emerald-50 border border-emerald-500/20 rounded-tr-md'
                            : 'bg-white/[0.04] text-zinc-100 border border-white/[0.06] rounded-tl-md'
                    }`}
                >
                    {msg.content}
                </div>
            </div>
        </div>
    )
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.round(diffHr / 24)
    if (diffDay < 7) return `${diffDay}d ago`
    return d.toLocaleDateString()
}

// ─── Leaderboard Tab ─────────────────────────────────────────────────────────

function LeaderboardTab({
    entries,
    onRefresh,
}: {
    entries: LeaderboardModerationEntry[]
    onRefresh: () => void
}) {
    const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'mismatch' | 'inactive'>('all')
    const [busyId, setBusyId] = useState<number | null>(null)
    const [actionError, setActionError] = useState('')

    const filtered = entries.filter((e) => {
        if (filter === 'verified') return e.verification_status === 'verified' && e.is_active
        if (filter === 'pending') return e.is_active && (e.verification_status === 'pending' || e.verification_status === 'failed')
        if (filter === 'mismatch') return e.verification_status === 'host_mismatch' || e.verification_status === 'no_web_stream'
        if (filter === 'inactive') return !e.is_active
        return true
    })

    async function moderate(entryId: number, action: 'verify' | 'unverify' | 'activate' | 'deactivate' | 'delete') {
        if (action === 'delete' && !confirm('Hard-delete this entry and its history? This cannot be undone.')) return
        setBusyId(entryId)
        setActionError('')
        try {
            await apiPost('leaderboard-moderate', { entryId, leaderboardAction: action })
            onRefresh()
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) setActionError(message)
        } finally {
            setBusyId(null)
        }
    }

    const FILTERS: Array<{ key: typeof filter; label: string; count: number }> = [
        { key: 'all', label: 'All', count: entries.length },
        { key: 'verified', label: 'Verified', count: entries.filter((e) => e.verification_status === 'verified' && e.is_active).length },
        { key: 'pending', label: 'Pending', count: entries.filter((e) => e.is_active && (e.verification_status === 'pending' || e.verification_status === 'failed')).length },
        { key: 'mismatch', label: 'Mismatch', count: entries.filter((e) => e.verification_status === 'host_mismatch' || e.verification_status === 'no_web_stream').length },
        { key: 'inactive', label: 'Hidden', count: entries.filter((e) => !e.is_active).length },
    ]

    return (
        <div className="bg-zinc-900/50 border border-white/[0.04] rounded-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] p-4">
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                filter === f.key
                                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                                    : 'bg-zinc-800/50 text-zinc-400 border border-white/[0.04] hover:text-white'
                            }`}
                        >
                            {f.label}
                            <span className="ml-1.5 text-zinc-500">{f.count}</span>
                        </button>
                    ))}
                </div>
                <button
                    onClick={onRefresh}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-white/[0.04] text-zinc-400 hover:text-white text-xs"
                >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                </button>
            </div>

            {actionError && (
                <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {actionError}
                </div>
            )}

            {filtered.length === 0 ? (
                <p className="text-center py-12 text-sm text-zinc-600">No entries match this filter.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-950/40 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                            <tr>
                                <th className="text-left px-4 py-3">Startup</th>
                                <th className="text-left px-4 py-3">Owner</th>
                                <th className="text-left px-4 py-3">GA Property</th>
                                <th className="text-right px-4 py-3">Visitors</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-right px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((entry) => (
                                <tr key={entry.id} className="border-t border-white/[0.04]">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                                                #{entry.id}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-white">{entry.startup_name}</div>
                                                {entry.website_url && (
                                                    <a
                                                        href={entry.website_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[11px] text-zinc-500 hover:text-emerald-400"
                                                    >
                                                        {entry.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-zinc-400">
                                        {entry.user ? (
                                            <div>
                                                <div className="text-zinc-300">{entry.user.github_username || entry.user.email || '—'}</div>
                                                <div className="text-[10px] text-zinc-600">{entry.user.github_id || `id:${entry.user.id}`}</div>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-[11px] font-mono text-zinc-400">
                                        {entry.ga_property_id || <span className="text-zinc-600">none</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-zinc-200">
                                        {formatNumber(entry.monthly_visitors)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ModerationStatusPill status={entry.verification_status} isActive={entry.is_active} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {entry.verification_status !== 'verified' ? (
                                                <button
                                                    onClick={() => moderate(entry.id, 'verify')}
                                                    disabled={busyId === entry.id}
                                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                                                    title="Force verify"
                                                >
                                                    <ShieldCheck className="w-3 h-3" /> Verify
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => moderate(entry.id, 'unverify')}
                                                    disabled={busyId === entry.id}
                                                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                                                    title="Strip verified"
                                                >
                                                    <ShieldOff className="w-3 h-3" /> Unverify
                                                </button>
                                            )}
                                            {entry.is_active ? (
                                                <button
                                                    onClick={() => moderate(entry.id, 'deactivate')}
                                                    disabled={busyId === entry.id}
                                                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-zinc-800/50 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-50"
                                                    title="Hide from public board"
                                                >
                                                    <EyeOff className="w-3 h-3" /> Hide
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => moderate(entry.id, 'activate')}
                                                    disabled={busyId === entry.id}
                                                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-zinc-800/50 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-50"
                                                    title="Show on public board"
                                                >
                                                    <Eye className="w-3 h-3" /> Show
                                                </button>
                                            )}
                                            <button
                                                onClick={() => moderate(entry.id, 'delete')}
                                                disabled={busyId === entry.id}
                                                className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                                                title="Hard-delete entry + history"
                                            >
                                                {busyId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function ModerationStatusPill({ status, isActive }: { status: string; isActive: boolean }) {
    if (!isActive) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                Hidden
            </span>
        )
    }
    if (status === 'verified') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <ShieldCheck className="w-3 h-3" /> Verified
            </span>
        )
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                <AlertTriangle className="w-3 h-3" /> Mismatch
            </span>
        )
    }
    if (status === 'failed') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                Failed
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            Pending
        </span>
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

/* Per-user 👍/👎 cell rendered inside UserRow. Click toggles the inline
 * expand row below. Shows "—" until the aggregate summary loads, then
 * "0/0" if the user has no feedback yet, then "N up / M down" once data. */
function FeedbackCell({ counts, expanded, onToggle }: {
    counts: { up: number; down: number } | null
    expanded: boolean
    onToggle: () => void
}) {
    const up = counts?.up ?? 0
    const down = counts?.down ?? 0
    const hasAny = (counts !== null) && (up > 0 || down > 0)
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={!hasAny}
            title={hasAny ? (expanded ? 'Hide feedback' : 'Show recent feedback') : 'No feedback yet'}
            className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                hasAny
                    ? expanded
                        ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:border-cyan-500/30 hover:bg-cyan-500/[0.08] hover:text-cyan-300'
                    : 'border-white/[0.04] bg-transparent text-zinc-600 cursor-default'
            }`}
        >
            <span className="text-emerald-400">👍 {up}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-red-400">👎 {down}</span>
        </button>
    )
}

/* Inline detail panel rendered as a 2nd <tr> below the user row when the
 * FeedbackCell is clicked. Loads recent ChatFeedback rows for this user
 * with their reason, comment, and message excerpt. */
function FeedbackExpandPanel({ detail }: {
    detail: FeedbackItem[] | 'loading' | { error: string } | undefined
}) {
    if (detail === undefined || detail === 'loading') {
        return <div className="text-[11px] text-zinc-500">Loading feedback…</div>
    }
    if (typeof detail === 'object' && !Array.isArray(detail) && 'error' in detail) {
        return <div className="text-[11px] text-red-400">Failed to load: {detail.error}</div>
    }
    if (detail.length === 0) {
        return <div className="text-[11px] text-zinc-500">No feedback recorded yet.</div>
    }
    return (
        <div className="space-y-2">
            {detail.map(item => (
                <div
                    key={item.id}
                    className={`rounded-md border px-3 py-2 ${
                        item.rating === 'up'
                            ? 'border-emerald-500/15 bg-emerald-500/[0.04]'
                            : 'border-red-500/15 bg-red-500/[0.04]'
                    }`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                                <span className={item.rating === 'up' ? 'text-emerald-400' : 'text-red-400'}>
                                    {item.rating === 'up' ? '👍 Helpful' : '👎 Not helpful'}
                                </span>
                                {item.reason ? <span className="text-zinc-500">· {item.reason}</span> : null}
                                {item.created_at ? (
                                    <span className="ml-auto text-zinc-600">
                                        {new Date(item.created_at).toLocaleString()}
                                    </span>
                                ) : null}
                            </div>
                            {item.comment ? (
                                <p className="mt-1 text-[12px] leading-relaxed text-zinc-200">{item.comment}</p>
                            ) : null}
                            {item.message_excerpt ? (
                                <p className="mt-1 truncate text-[11px] text-zinc-500" title={item.message_excerpt}>
                                    Re: {item.message_excerpt.slice(0, 180)}{item.message_excerpt.length > 180 ? '…' : ''}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
