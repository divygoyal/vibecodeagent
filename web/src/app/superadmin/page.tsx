'use client'

import { useState, useEffect, useCallback, useRef, Fragment, type ReactNode } from 'react'
import {
    Users, Bot, Coins, Server, Trash2, RefreshCw, Play, Square, RotateCw,
    ChevronDown, LogOut, Eye, EyeOff, Plus, Minus,
    Terminal, Clock, AlertTriangle, MessageSquare, Mail, Check,
    Globe, LayoutDashboard, Link2, BarChart3, Activity, FileText,
    Trophy, ShieldCheck, ShieldOff, LifeBuoy, Send, ThumbsUp, ThumbsDown, PanelRight,
    ExternalLink, type LucideIcon,
} from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand';
import { fmtFull } from '@/lib/format'
import { AdminFrame, AdminGate } from '@/components/admin/AdminFrame'
import { AdminStat, UsageBar } from '@/components/admin/AdminStat'
import { TableCard, Th, Td, Tr } from '@/components/admin/AdminTable'
import { Field, TextInput, Textarea } from '@/components/admin/FormControls'
import { LocalTime, TimeAgo, TimeAgoOrDate } from '@/components/admin/TimeAgo'
import { ContainerPill, PlanBadge } from '@/components/admin/tones'
import { BarList } from '@/components/charts/BarList'
import { BrandMark } from '@/components/shell/BrandMark'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { Banner } from '@/components/ui/Banner'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Drawer } from '@/components/ui/Drawer'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/Modal'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { Table, type TableColumn } from '@/components/ui/Table'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toaster'
import { Tooltip } from '@/components/ui/Tooltip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatusData {
    total_users: number
    running_containers: number
    max_users: number
    /** Older shape of the plan counts. */
    plans?: Record<string, number>
    /** What the admin API returns today. */
    plan_breakdown?: Record<string, number>
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

function formatNumber(value?: number | null): string {
    return fmtFull(value ?? 0)
}

/** Users per plan, in plan order. The admin API sends `plan_breakdown`; older builds sent `plans`. */
function planCounts(status: StatusData): Array<[string, number]> {
    const source: Record<string, number> = status.plan_breakdown ?? status.plans ?? {}
    const order = ['free', 'starter', 'growth', 'pro']
    const keys = [...order.filter(k => k in source || k !== 'growth'), ...Object.keys(source).filter(k => !order.includes(k))]
    return keys.map(k => [k, source[k] ?? 0])
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
            <AdminGate>
                <Card padding="lg">
                    <div className="mb-6 flex items-center gap-3">
                        <BrandMark size={32} />
                        <div>
                            <h1 className="text-title text-fg">{BRAND_NAME}</h1>
                            <p className="text-body-sm text-fg-muted">Superadmin access</p>
                        </div>
                    </div>

                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault()
                            handleAuth()
                        }}
                    >
                        <Field label="Password">
                            {(id) => (
                                <div className="relative">
                                    <TextInput
                                        id={id}
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                        placeholder="Enter password"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg"
                                    >
                                        {showPassword ? <EyeOff aria-hidden size={16} strokeWidth={1.75} /> : <Eye aria-hidden size={16} strokeWidth={1.75} />}
                                    </button>
                                </div>
                            )}
                        </Field>

                        {authError && <Banner variant="danger">{authError}</Banner>}

                        <Button type="submit" variant="primary" size="lg" className="w-full" loading={authLoading} disabled={!password}>
                            {authLoading ? 'Verifying' : 'Unlock'}
                        </Button>
                    </form>
                </Card>
            </AdminGate>
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

    const initialLoading = loading && !status

    const tabs: Array<{ value: typeof tab; label: string; icon: LucideIcon; badge: number }> = [
        { value: 'users', label: 'Users', icon: Users, badge: 0 },
        { value: 'support', label: 'Support', icon: LifeBuoy, badge: unreadSupportCount },
        { value: 'queries', label: 'Queries', icon: MessageSquare, badge: newQueryCount },
        { value: 'leaderboard', label: 'Leaderboard', icon: Trophy, badge: pendingLeaderboardCount },
        { value: 'events', label: 'Events', icon: Clock, badge: 0 },
        { value: 'system', label: 'System', icon: Server, badge: 0 },
    ]
    const tabItems: TabItem<typeof tab>[] = tabs.map((t) => ({
        value: t.value,
        icon: t.icon,
        label: (
            <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.badge > 0 ? <Badge variant="brand" aria-label={`${t.badge} need attention`}>{t.badge}</Badge> : null}
            </span>
        ),
    }))

    return (
        <AdminFrame
            title="System control"
            badge={<Badge variant="neutral" className="max-sm:hidden">Superadmin</Badge>}
            actions={
                <>
                    <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={() => { setLoading(true); fetchData() }}>
                        <span className="max-sm:sr-only">Refresh</span>
                    </Button>
                    <Button variant="ghost" size="sm" icon={LogOut} onClick={() => onSignOut()}>
                        <span className="max-sm:sr-only">Sign out</span>
                    </Button>
                </>
            }
        >
            {error && <Banner variant="danger" className="mb-4">{error}</Banner>}

            {/* Stats Row */}
            <section aria-label="System overview" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <AdminStat icon={Users} label="Total users" value={status?.total_users ?? '–'} loading={initialLoading} />
                <AdminStat icon={Bot} label="Running" value={status?.running_containers ?? '–'} sub="containers" loading={initialLoading} />
                <AdminStat
                    icon={Coins}
                    label="Plan breakdown"
                    className="col-span-2 lg:col-span-1"
                    loading={initialLoading}
                    value={
                        status ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                                {planCounts(status).map(([name, count]) => (
                                    <span key={name} className="inline-flex items-center gap-1.5">
                                        <PlanBadge plan={name} />
                                        <span className="font-medium tabular-nums">{count}</span>
                                    </span>
                                ))}
                            </div>
                        ) : '–'
                    }
                />
                <AdminStat
                    icon={MessageSquare}
                    label="New queries"
                    value={queries.filter(q => q.status === 'new').length}
                    sub={`${queries.length} total`}
                    loading={initialLoading}
                />
                <AdminStat
                    icon={Server}
                    label="Capacity"
                    value={status ? `${capacity}%` : '–'}
                    sub={status ? `${status.total_users} / ${status.max_users || 50}` : undefined}
                    loading={initialLoading}
                >
                    {status ? <UsageBar percent={capacity} label="Capacity used" /> : null}
                </AdminStat>
            </section>

            {/* Tabs */}
            <Tabs
                className="mt-6"
                ariaLabel="Superadmin sections"
                panelIdPrefix="sa-panel"
                value={tab}
                onValueChange={setTab}
                items={tabItems}
            />

            {/* Tab Content */}
            <div className="mt-4" role="tabpanel" id={`sa-panel-${tab}`}>
                {tab === 'users' && (
                    <UsersTab
                        users={filteredUsers}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onRefresh={fetchData}
                        loading={initialLoading}
                    />
                )}
                {tab === 'queries' && <QueriesTab queries={queries} onRefresh={fetchData} loading={initialLoading} />}
                {tab === 'support' && <SupportTab threads={supportThreads} onRefresh={fetchData} loading={initialLoading} />}
                {tab === 'leaderboard' && <LeaderboardTab entries={leaderboardEntries} onRefresh={fetchData} loading={initialLoading} />}
                {tab === 'events' && <EventsTab events={events} loading={initialLoading} />}
                {tab === 'system' && <SystemTab status={status} capacity={capacity} />}
            </div>
        </AdminFrame>
    )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab({ users, searchQuery, onSearchChange, onRefresh, loading }: {
    users: UserData[]
    searchQuery: string
    onSearchChange: (q: string) => void
    onRefresh: () => void
    loading?: boolean
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
                toast.error(message, { duration: 8000 })
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
                toast.error(message, { duration: 8000 })
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
            toast.success(`${period[0].toUpperCase()}${period.slice(1)} report emailed.`)
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                toast.error(`Failed to send: ${message}`, { duration: 8000 })
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
            toast.success(`Feedback email sent${code}.`)
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                toast.error(`Failed to send: ${message}`, { duration: 8000 })
            }
        } finally {
            setActionLoading('')
        }
    }

    const handleGenerateWeeklyDigest = async (githubId: string) => {
        // Ad-hoc trigger of the same pipeline the weekly cron runs — fetches
        // GSC/GA4 for last completed ISO week, calls Gemini for headline + 3
        // actions, persists to admin (weekly_digests). Synchronous
        // (10-40 s typically). Persistence reason / headline preview surfaced
        // inline on completion.
        const key = `weekly-digest-${githubId}`
        setActionLoading(key)
        setEmailMenuUser(null)
        try {
            const res = await apiPost('generate-weekly-digest', { userId: githubId })
            const wk = `Week ${res?.isoWeek ?? '?'} of ${res?.year ?? '?'}`
            if (res?.persisted) {
                const headlineLine = res?.headline ? `Headline: "${res.headline}"` : ''
                const reasonLine = res?.snapshotEmpty
                    ? `Empty snapshot: ${res?.snapshotReason || 'unknown'}`
                    : ''
                toast.success(`${wk} digest saved.`, {
                    description: [headlineLine, reasonLine].filter(Boolean).join(' · ') || undefined,
                    duration: 8000,
                })
            } else {
                const reason = res?.error || res?.snapshotReason || 'unknown'
                toast.error(`${wk} digest not persisted. Reason: ${reason}`, { duration: 8000 })
            }
        } catch (err) {
            const message = getErrorMessage(err)
            if (!isSuperadminAuthError(message)) {
                toast.error(`Failed to generate: ${message}`, { duration: 8000 })
            }
        } finally {
            setActionLoading('')
        }
    }


    const selectedProfile = selectedUser ? profileCache[selectedUser.github_id] ?? null : null
    const isProfileLoading = selectedUser ? profileLoadingUserId === selectedUser.github_id : false
    const isProfileRefreshing = selectedUser ? profileRefreshingUserId === selectedUser.github_id : false

    return (
        <div className="space-y-4">
            <TableCard
                caption="Users"
                toolbar={
                    <>
                        <SearchInput
                            value={searchQuery}
                            onValueChange={onSearchChange}
                            placeholder="Search users by name, email or ID"
                            aria-label="Search users"
                            className="md:w-80"
                        />
                        <span className="ml-auto text-meta text-fg-muted tabular-nums">
                            {users.length} {users.length === 1 ? 'user' : 'users'}
                        </span>
                    </>
                }
            >
                <thead>
                    <tr>
                        <Th sticky>User</Th>
                        <Th>Plan</Th>
                        <Th>Credits</Th>
                        <Th>Signals</Th>
                        <Th>Feedback</Th>
                        <Th>Container</Th>
                        <Th align="right">Actions</Th>
                    </tr>
                </thead>
                <tbody>
                    {loading && users.length === 0 && Array.from({ length: 6 }, (_, i) => (
                        <tr key={`sk-${i}`} className="border-b border-border-subtle last:border-0">
                            <td className="px-4 py-3"><Skeleton className="h-8 w-40" /></td>
                            {Array.from({ length: 6 }, (_, j) => (
                                <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>
                            ))}
                        </tr>
                    ))}
                    {!loading && users.length === 0 && (
                        <tr>
                            <td colSpan={7}>
                                <EmptyState
                                    variant="inline"
                                    icon={Users}
                                    title="No users found"
                                    description={searchQuery ? 'Try a different name, email or ID.' : 'Users appear here after they sign up.'}
                                />
                            </td>
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
                                    <tr className="border-b border-border-subtle bg-surface-sunken last:border-0">
                                        <td colSpan={7} className="px-4 py-3">
                                            <FeedbackExpandPanel detail={detail} />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        )
                    })}
                </tbody>
            </TableCard>

            <UserProfileDrawer
                user={selectedUser}
                profile={selectedProfile}
                loading={isProfileLoading}
                refreshing={isProfileRefreshing}
                error={profileError}
                actionLoading={actionLoading}
                showCreditInput={showCreditInput === selectedUser?.github_id}
                creditInputValue={selectedUser ? creditInputs[selectedUser.github_id] || '' : ''}
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
            <ConfirmModal
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                title={`Delete ${deleteTarget?.username || deleteTarget?.github_id || 'user'}?`}
                description={`${deleteTarget?.username || 'This user'} (${deleteTarget?.github_id ?? ''}): this permanently deletes the user, their bot container (if any) and all data. It cannot be undone.`}
                confirmLabel="Delete user"
                loading={!!deleteTarget && actionLoading === `delete-${deleteTarget.github_id}`}
                onConfirm={() => deleteTarget ? handleDelete(deleteTarget) : undefined}
            />
        </div>
    )
}

// ─── User Row ────────────────────────────────────────────────────────────────

function SignalPill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
    return <Pill tone={tone}>{children}</Pill>
}

function UserSignals({ user }: { user: UserData }) {
    const hasSignals =
        user.has_google ||
        (user.embed_token_count || 0) > 0 ||
        (user.shared_dashboard_count || 0) > 0 ||
        (user.custom_dashboard_count || 0) > 0 ||
        user.leaderboard_active

    if (!hasSignals) {
        return <span className="text-meta text-fg-muted">No advanced assets yet</span>
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {user.has_google && <SignalPill tone="up">Google</SignalPill>}
            {(user.embed_token_count || 0) > 0 && <SignalPill tone="info">Embeds {user.embed_token_count}</SignalPill>}
            {(user.shared_dashboard_count || 0) > 0 && <SignalPill>Shared {user.shared_dashboard_count}</SignalPill>}
            {(user.custom_dashboard_count || 0) > 0 && <SignalPill tone="brand">Dashboards {user.custom_dashboard_count}</SignalPill>}
            {user.leaderboard_active && <SignalPill tone="up">Leaderboard</SignalPill>}
        </div>
    )
}

const PLAN_CHOICES = [
    { value: 'free', label: 'Free' },
    { value: 'starter', label: 'Starter' },
    { value: 'growth', label: 'Growth' },
    { value: 'pro', label: 'Pro' },
]

/** The four plans, plus the user's current plan when it is something else (so the select never shows blank). */
function planChoices(current: string) {
    return PLAN_CHOICES.some(p => p.value === current) ? PLAN_CHOICES : [...PLAN_CHOICES, { value: current, label: current }]
}

function UserRow({ user, selected, actionLoading, showCreditInput, creditInputValue, onAction, onDelete, onOpenDetails, onToggleCreditInput, onCreditInputChange, onAddCredits, emailMenuOpen, onToggleEmailMenu, onSendReportEmail, onSendFeedbackEmail, onGenerateWeeklyDigest, feedbackCounts, isFeedbackExpanded, onToggleFeedback }: {
    user: UserData
    selected: boolean
    actionLoading: string
    showCreditInput: boolean
    creditInputValue: string
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
    /** Aggregate helpful / not helpful counts for this user (null while summary loads / no data). */
    feedbackCounts: { up: number; down: number } | null
    /** Whether the inline feedback-detail panel below this row is open. */
    isFeedbackExpanded: boolean
    /** Toggle the feedback detail panel for this user. */
    onToggleFeedback: () => void
}) {
    const containerStatus = user.container?.status || null
    const isRunning = containerStatus?.toLowerCase() === 'running'
    const name = user.username || user.github_id
    const emailBusy =
        actionLoading === `email-report-weekly-${user.github_id}` ||
        actionLoading === `email-report-monthly-${user.github_id}` ||
        actionLoading === `email-feedback-${user.github_id}` ||
        actionLoading === `weekly-digest-${user.github_id}`

    return (
        <Tr selected={selected}>
            <Td sticky>
                <div className="flex items-center gap-3">
                    <Avatar name={user.username} src={user.avatar_url} size={32} />
                    <div className="min-w-0 max-w-[210px]">
                        <button onClick={onOpenDetails} className="block max-w-full truncate rounded text-left font-medium text-fg hover:underline">
                            {name}
                        </button>
                        <div className="truncate text-meta text-fg-secondary" title={user.email || undefined}>{user.email || 'No email'}</div>
                        <div className="truncate font-mono text-meta text-fg-muted">ID {user.github_id}</div>
                    </div>
                </div>
            </Td>

            <Td>
                <Select
                    size="sm"
                    ariaLabel={`Plan for ${name}`}
                    className="w-28 min-w-0"
                    value={user.plan || 'free'}
                    onValueChange={(plan) => onAction('update-plan', user.github_id, { plan })}
                    options={planChoices(user.plan || 'free')}
                />
            </Td>

            <Td>
                <div className="flex items-center gap-1.5">
                    <span className="tabular-nums text-fg-secondary">{formatNumber(user.credits)}</span>
                    <Tooltip content={showCreditInput ? 'Hide credit input' : 'Add credits'}>
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            icon={showCreditInput ? Minus : Plus}
                            aria-label={showCreditInput ? `Hide credit input for ${name}` : `Add credits for ${name}`}
                            aria-expanded={showCreditInput}
                            onClick={onToggleCreditInput}
                        />
                    </Tooltip>
                    {showCreditInput && (
                        <div className="flex items-center gap-1.5">
                            <TextInput
                                size="sm"
                                type="number"
                                min="1"
                                value={creditInputValue}
                                onChange={(e) => onCreditInputChange(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onAddCredits()}
                                placeholder="0"
                                aria-label={`Credits to add for ${name}`}
                                className="w-20"
                            />
                            <Button variant="secondary" size="sm" onClick={onAddCredits}>Add</Button>
                        </div>
                    )}
                </div>
            </Td>

            <Td>
                <UserSignals user={user} />
            </Td>

            <Td>
                <FeedbackCell
                    counts={feedbackCounts}
                    expanded={isFeedbackExpanded}
                    onToggle={onToggleFeedback}
                />
            </Td>

            <Td>
                <div className="flex flex-col items-start gap-1">
                    <ContainerPill status={containerStatus} />
                    {user.container?.port ? <span className="font-mono text-meta text-fg-muted">Port {user.container.port}</span> : null}
                </div>
            </Td>

            <Td align="right">
                <div className="flex items-center justify-end gap-0.5">
                    <Tooltip content="Open details">
                        <Button variant="ghost" size="sm" iconOnly icon={PanelRight} aria-label={`Open details for ${name}`} onClick={onOpenDetails} />
                    </Tooltip>
                    {!isRunning ? (
                        <Tooltip content="Start">
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={Play}
                                aria-label={`Start container for ${name}`}
                                loading={actionLoading === `start-${user.github_id}`}
                                onClick={() => onAction('start', user.github_id)}
                            />
                        </Tooltip>
                    ) : (
                        <Tooltip content="Stop">
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={Square}
                                aria-label={`Stop container for ${name}`}
                                loading={actionLoading === `stop-${user.github_id}`}
                                onClick={() => onAction('stop', user.github_id)}
                            />
                        </Tooltip>
                    )}
                    <Tooltip content="Restart">
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            icon={RotateCw}
                            aria-label={`Restart container for ${name}`}
                            loading={actionLoading === `restart-${user.github_id}`}
                            onClick={() => onAction('restart', user.github_id)}
                        />
                    </Tooltip>
                    {/* Email menu: Weekly / Monthly report (synchronous send, 20-90s)
                        + Feedback request (fast Brevo template send with a one-time
                        coupon code). The trigger stays in a loading state while any
                        send is in flight. */}
                    <DropdownMenu open={emailMenuOpen} onOpenChange={(open) => { if (open !== emailMenuOpen) onToggleEmailMenu() }}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                icon={Mail}
                                loading={emailBusy}
                                aria-label={`Email and report actions for ${name}`}
                                title="Email and report actions"
                            />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <DropdownMenuLabel>{user.email ? 'Email user' : 'Email user (no email on file)'}</DropdownMenuLabel>
                            <DropdownMenuItem disabled={!user.email} className="h-auto! py-1.5" onSelect={() => onSendReportEmail('weekly')}>
                                <span className="block font-medium">Weekly report</span>
                                <span className="block text-meta text-fg-muted">Last 7 days vs prior week</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!user.email} className="h-auto! py-1.5" onSelect={() => onSendReportEmail('monthly')}>
                                <span className="block font-medium">Monthly report</span>
                                <span className="block text-meta text-fg-muted">Last 30 days vs prior month</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!user.email} className="h-auto! py-1.5" onSelect={onSendFeedbackEmail}>
                                <span className="block font-medium">Feedback request</span>
                                <span className="block text-meta text-fg-muted">Ask why they didn&rsquo;t convert + coupon</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Writes to the DB rather than sending an email. */}
                            <DropdownMenuItem className="h-auto! py-1.5" onSelect={onGenerateWeeklyDigest}>
                                <span className="block font-medium">Generate weekly digest</span>
                                <span className="block text-meta text-fg-muted">Saves this week&rsquo;s digest to the database</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip content="Delete">
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            icon={Trash2}
                            aria-label={`Delete ${name}`}
                            className="hover:text-down!"
                            onClick={onDelete}
                        />
                    </Tooltip>
                </div>
            </Td>
        </Tr>
    )
}

function DrawerSection({ icon: Icon, title, action, children }: {
    icon: LucideIcon
    title: string
    action?: ReactNode
    children: ReactNode
}) {
    return (
        <Card as="section" padding="sm">
            <CardHeader
                as="h3"
                title={
                    <span className="inline-flex items-center gap-2">
                        <Icon aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" />
                        {title}
                    </span>
                }
                actions={action}
            />
            {children}
        </Card>
    )
}

function DetailStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="rounded-control bg-surface-sunken p-3">
            <div className="text-meta text-fg-muted">{label}</div>
            <div className="mt-1 text-body font-medium break-words">{value}</div>
            {sub ? <div className="mt-1 text-meta text-fg-muted">{sub}</div> : null}
        </div>
    )
}

/** Small bordered block for one record inside a drawer section (provider, token, dashboard, event). */
function InnerCard({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={`rounded-control border border-border-subtle bg-surface-sunken p-3.5 ${className ?? ''}`}>{children}</div>
}

function EmptyNote({ title, description }: { title: string; description: string }) {
    return <EmptyState variant="inline" title={title} description={description} className="rounded-control border border-dashed border-border" />
}

/** Small caps-free label above a control that has no native label (Select). */
function FieldLabel({ children }: { children: ReactNode }) {
    return <div className="mb-1.5 text-body-sm font-medium text-fg-secondary">{children}</div>
}

function SubHeading({ children }: { children: ReactNode }) {
    return <h4 className="text-body-sm font-medium text-fg-secondary">{children}</h4>
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
        <InnerCard className="space-y-3">
            <div>
                <div className="text-body font-medium">{property.display_name || property.property_id}</div>
                <div className="mt-0.5 font-mono text-meta text-fg-muted">{property.property_id}</div>
            </div>
            {hasGsc ? (
                <>
                    {gscSites.length > 1 && (
                        <div>
                            <FieldLabel>Search Console site for report</FieldLabel>
                            <Select
                                size="sm"
                                ariaLabel="Search Console site for report"
                                className="w-full"
                                value={selectedSite}
                                onValueChange={setSelectedSite}
                                options={gscSites.map(s => ({ value: s.site_url || '', label: s.site_url }))}
                            />
                        </div>
                    )}
                    {gscSites.length === 1 && (
                        <div className="text-meta text-fg-muted">Search Console: <span className="font-mono">{defaultSiteUrl}</span></div>
                    )}
                    {/* Download flow: admin downloads the PDF locally */}
                    <div>
                        <div className="mb-1.5 text-meta font-medium text-fg-muted">Download PDF</div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={FileText}
                                loading={isLoadingWeekly}
                                disabled={isAnyLoading}
                                onClick={() => onGenerate('weekly', selectedSite, { propertyId: property.property_id, label: property.display_name || property.property_id })}
                            >
                                {isLoadingWeekly ? 'Generating' : 'Weekly'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={FileText}
                                loading={isLoadingMonthly}
                                disabled={isAnyLoading}
                                onClick={() => onGenerate('monthly', selectedSite, { propertyId: property.property_id, label: property.display_name || property.property_id })}
                            >
                                {isLoadingMonthly ? 'Generating' : 'Monthly'}
                            </Button>
                        </div>
                    </div>

                    {/* Email flow: same renderer ships through Brevo to user.email */}
                    <div className="border-t border-border-subtle pt-3">
                        <div className="mb-1.5 text-meta font-medium text-fg-muted">
                            Email to user{userEmail ? ` (${userEmail})` : ': no email on file'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={Mail}
                                loading={isEmailingWeekly}
                                disabled={isAnyEmailLoading || !canEmail}
                                title={canEmail ? 'Email weekly report to user' : 'User has no email on file'}
                                onClick={() => onEmailReport('weekly', selectedSite, property.property_id)}
                            >
                                {isEmailingWeekly ? 'Sending' : 'Email weekly'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={Mail}
                                loading={isEmailingMonthly}
                                disabled={isAnyEmailLoading || !canEmail}
                                title={canEmail ? 'Email monthly report to user' : 'User has no email on file'}
                                onClick={() => onEmailReport('monthly', selectedSite, property.property_id)}
                            >
                                {isEmailingMonthly ? 'Sending' : 'Email monthly'}
                            </Button>
                        </div>
                    </div>
                </>
            ) : (
                <Banner variant="warn">No Search Console site available. Report generation needs a verified Search Console site.</Banner>
            )}
        </InnerCard>
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
        <InnerCard className="space-y-3">
            <div className="font-mono text-body font-medium break-all">{siteUrl || 'Unknown site'}</div>
            <div className="flex flex-wrap gap-2">
                {site.permission_level ? <SignalPill>{site.permission_level}</SignalPill> : null}
                {site.site_type ? <SignalPill>{site.site_type}</SignalPill> : null}
                <SignalPill tone="warn">SEO only</SignalPill>
            </div>
            <p className="text-meta text-fg-muted">GA4 property unavailable for this user, so this generates a Search Console-only PDF.</p>
            <div>
                <div className="mb-1.5 text-meta font-medium text-fg-muted">Download PDF</div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={FileText}
                        loading={isLoadingWeekly}
                        disabled={isAnyLoading || !siteUrl}
                        onClick={() => onGenerate('weekly', siteUrl, { label: siteUrl })}
                    >
                        {isLoadingWeekly ? 'Generating' : 'Weekly'}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={FileText}
                        loading={isLoadingMonthly}
                        disabled={isAnyLoading || !siteUrl}
                        onClick={() => onGenerate('monthly', siteUrl, { label: siteUrl })}
                    >
                        {isLoadingMonthly ? 'Generating' : 'Monthly'}
                    </Button>
                </div>
            </div>
            <div className="border-t border-border-subtle pt-3">
                <div className="mb-1.5 text-meta font-medium text-fg-muted">
                    Email to user{userEmail ? ` (${userEmail})` : ': no email on file'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={Mail}
                        loading={isEmailingWeekly}
                        disabled={isAnyEmailLoading || !canEmail}
                        onClick={() => onEmailReport('weekly', siteUrl)}
                    >
                        {isEmailingWeekly ? 'Sending' : 'Email weekly'}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={Mail}
                        loading={isEmailingMonthly}
                        disabled={isAnyEmailLoading || !canEmail}
                        onClick={() => onEmailReport('monthly', siteUrl)}
                    >
                        {isEmailingMonthly ? 'Sending' : 'Email monthly'}
                    </Button>
                </div>
            </div>
        </InnerCard>
    )
}

function UserProfileDrawer({ user, profile, loading, refreshing, error, actionLoading, showCreditInput, creditInputValue, onClose, onRefresh, onAction, onDelete, onToggleCreditInput, onCreditInputChange, onAddCredits }: {
    user: UserData | null
    profile: UserProfileData | null
    loading: boolean
    refreshing: boolean
    error: string
    actionLoading: string
    showCreditInput: boolean
    creditInputValue: string
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
    const [destroyOpen, setDestroyOpen] = useState(false)

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
            toast.success(`${period[0].toUpperCase()}${period.slice(1)} report emailed to ${user.email}.`)
        } catch (err) {
            const message = getErrorMessage(err, 'Email send failed')
            if (isSuperadminAuthError(message)) return
            setReportError(message)
            toast.error(`Failed to send: ${message}`, { duration: 8000 })
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
            a.download = `${BRAND_NAME}_${period}_${safeName}.pdf`
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
    const displayName = profile?.account.username || user.username || user.github_id
    const savingSettings = actionLoading === `update-settings-${user.github_id}`
    const currentEngine = user.bot_engine || profile?.container.engine || 'openclaw'
    const engineOptions = [
        { value: 'openclaw', label: 'OpenClaw' },
        { value: 'nanobot', label: 'Nanobot' },
    ]
    if (!engineOptions.some(o => o.value === currentEngine)) engineOptions.push({ value: currentEngine, label: currentEngine })

    return (
        <>
            <Drawer
                open
                onOpenChange={(open) => { if (!open) onClose() }}
                width="wide"
                title={
                    <span className="inline-flex max-w-full items-center gap-2">
                        <span className="truncate">{displayName}</span>
                        <ContainerPill status={containerStatus} />
                    </span>
                }
                subtitle={
                    <>
                        {profile?.account.email || user.email || 'No email'} · <span className="font-mono">ID {profile?.account.identifier || user.github_id}</span>
                    </>
                }
            >
                <div className="space-y-4">
                    <DrawerSection
                        icon={Server}
                        title="Admin actions"
                        action={
                            <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>
                                {refreshing ? 'Refreshing' : 'Refresh'}
                            </Button>
                        }
                    >
                        <div className="space-y-4">
                            <div>
                                <FieldLabel>Plan</FieldLabel>
                                <Select
                                    ariaLabel="Plan"
                                    className="w-full"
                                    value={user.plan || 'free'}
                                    onValueChange={(plan) => onAction('update-plan', user.github_id, { plan })}
                                    options={planChoices(user.plan || 'free')}
                                />
                            </div>
                            <div>
                                <FieldLabel>Credits</FieldLabel>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-9 items-center rounded-control border border-border-subtle bg-surface-sunken px-3 text-body tabular-nums">
                                        {formatNumber(profile?.subscription.credits ?? user.credits)}
                                    </span>
                                    <Button variant="secondary" icon={showCreditInput ? Minus : Plus} aria-expanded={showCreditInput} onClick={onToggleCreditInput}>
                                        {showCreditInput ? 'Hide' : 'Add credits'}
                                    </Button>
                                    {showCreditInput ? (
                                        <>
                                            <TextInput
                                                type="number"
                                                min="1"
                                                value={creditInputValue}
                                                onChange={(e) => onCreditInputChange(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && onAddCredits()}
                                                placeholder="0"
                                                aria-label="Credits to add"
                                                className="w-24"
                                            />
                                            <Button variant="secondary" onClick={onAddCredits}>Apply</Button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
                                {!isRunning ? (
                                    <Button variant="secondary" icon={Play} loading={actionLoading === `start-${user.github_id}`} onClick={() => onAction('start', user.github_id)}>Start</Button>
                                ) : (
                                    <Button variant="secondary" icon={Square} loading={actionLoading === `stop-${user.github_id}`} onClick={() => onAction('stop', user.github_id)}>Stop</Button>
                                )}
                                <Button variant="secondary" icon={RotateCw} loading={actionLoading === `restart-${user.github_id}`} onClick={() => onAction('restart', user.github_id)}>Restart</Button>
                                <Button variant="danger" icon={Trash2} className="ml-auto" onClick={onDelete}>Delete user</Button>
                            </div>
                        </div>
                    </DrawerSection>

                    <DrawerSection icon={Bot} title="Container setup">
                        <div className="space-y-4">
                            <div>
                                <FieldLabel>Bot engine</FieldLabel>
                                <Select
                                    ariaLabel="Bot engine"
                                    className="w-full"
                                    value={currentEngine}
                                    disabled={savingSettings}
                                    onValueChange={(bot_engine) => onAction('update-settings', user.github_id, { bot_engine })}
                                    options={engineOptions}
                                />
                                <p className="mt-1.5 text-meta text-fg-muted">After changing engine, destroy the existing container then start it to apply.</p>
                            </div>

                            <Field
                                label="Telegram bot token"
                                hint={`Saving triggers a container sync with the new token. Current bot: ${profile?.container.bot_username ? `@${profile.container.bot_username}` : '(none)'}`}
                            >
                                {(id) => (
                                    <div className="flex items-stretch gap-2">
                                        <div className="relative flex-1">
                                            <TextInput
                                                id={id}
                                                mono
                                                autoComplete="off"
                                                type={showToken ? 'text' : 'password'}
                                                value={tokenInput}
                                                onChange={(e) => setTokenInput(e.target.value)}
                                                placeholder="Paste token from @BotFather (1234567:ABC...)"
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowToken(s => !s)}
                                                aria-label={showToken ? 'Hide token' : 'Show token'}
                                                className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg"
                                            >
                                                {showToken ? <EyeOff aria-hidden size={16} strokeWidth={1.75} /> : <Eye aria-hidden size={16} strokeWidth={1.75} />}
                                            </button>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            loading={savingSettings}
                                            disabled={!tokenInput.trim()}
                                            onClick={() => {
                                                const v = tokenInput.trim()
                                                if (!v) return
                                                onAction('update-settings', user.github_id, { telegram_bot_token: v })
                                                setTokenInput('')
                                            }}
                                        >
                                            {savingSettings ? 'Saving' : 'Save'}
                                        </Button>
                                    </div>
                                )}
                            </Field>

                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-down/20 bg-down-soft p-3.5">
                                <div className="min-w-0 flex-1 basis-[220px]">
                                    <div className="text-body font-medium">Destroy container</div>
                                    <div className="text-body-sm text-fg-secondary">Stops and removes the Docker container only. Keeps the user row, OAuth tokens, credits and data directory intact.</div>
                                </div>
                                <Button variant="secondary" loading={actionLoading === `destroy-container-${user.github_id}`} onClick={() => setDestroyOpen(true)}>
                                    <span className="inline-flex items-center gap-2 text-down">
                                        <Trash2 aria-hidden size={16} strokeWidth={1.75} />
                                        {actionLoading === `destroy-container-${user.github_id}` ? 'Destroying' : 'Destroy'}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </DrawerSection>

                    {loading && !profile ? (
                        <Card padding="sm" aria-busy="true" aria-label="Loading full user profile">
                            <Skeleton className="mb-4 h-4 w-32" />
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}
                            </div>
                        </Card>
                    ) : null}
                    {!loading && !profile && error ? <Banner variant="danger">{error}</Banner> : null}
                    {profile ? (
                        <>
                            <DrawerSection icon={Users} title="Overview">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                    <DetailStat label="Account" value={profile.account.is_active ? 'Active' : 'Disabled'} />
                                    <DetailStat label="Providers" value={String(profile.providers.length)} sub={profile.providers.map(provider => provider.provider).join(', ') || 'No connections'} />
                                    <DetailStat label="Created" value={<LocalTime value={profile.account.created_at} />} />
                                    <DetailStat label="Updated" value={<LocalTime value={profile.account.updated_at} />} />
                                    <DetailStat label="Engine" value={profile.container.engine || 'openclaw'} sub={profile.container.port ? `Port ${profile.container.port}` : undefined} />
                                    <DetailStat label="Telegram" value={profile.container.telegram_status || (profile.container.telegram_enabled ? 'enabled' : 'disabled')} sub={profile.container.bot_username ? `@${profile.container.bot_username}` : undefined} />
                                    <DetailStat label="Memory" value={profile.container.memory_usage_mb ? `${profile.container.memory_usage_mb} MB` : '–'} sub={profile.container.memory_percent !== undefined ? `${profile.container.memory_percent}% of limit` : undefined} />
                                    <DetailStat label="Health" value={profile.container.health || '–'} sub={profile.container.last_health_check ? <>Checked <LocalTime value={profile.container.last_health_check} /></> : undefined} />
                                </div>
                                {profile.container.error ? <Banner variant="warn" className="mt-3">{profile.container.error}</Banner> : null}
                            </DrawerSection>

                            <DrawerSection icon={Coins} title="Subscription and credits">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                    <DetailStat label="Plan" value={<PlanBadge plan={profile.subscription.plan} />} />
                                    <DetailStat label="Credits" value={formatNumber(profile.subscription.credits)} />
                                    <DetailStat label="Subscription ID" value={<span className="font-mono text-meta break-all">{profile.subscription.subscription_id || '–'}</span>} />
                                    <DetailStat label="Start" value={<LocalTime value={profile.subscription.subscription_start} />} />
                                    <DetailStat label="End" value={<LocalTime value={profile.subscription.subscription_end} />} />
                                    <DetailStat label="Flags" value={profile.subscription.subscription_cancelled ? 'Cancelled' : 'Active'} sub={profile.subscription.telegram_bot_enabled ? 'Telegram bot enabled' : 'Telegram bot disabled'} />
                                </div>
                            </DrawerSection>

                            <DrawerSection icon={Link2} title="Integrations">
                                {profile.providers.length === 0 ? <EmptyNote title="No connected providers" description="This user has not connected any OAuth providers with active tokens." /> : (
                                    <div className="space-y-3">
                                        {profile.providers.map(provider => (
                                            <InnerCard key={`${provider.provider}-${provider.provider_account_id || provider.updated_at || 'provider'}`}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-body font-medium capitalize">{provider.provider}</span>
                                                    <SignalPill tone="up">Connected</SignalPill>
                                                    {provider.has_refresh_token ? <SignalPill tone="info">Refresh token</SignalPill> : null}
                                                </div>
                                                <dl className="mt-3 grid gap-2 text-body-sm text-fg-secondary grid-cols-1 sm:grid-cols-2">
                                                    <div><dt className="inline text-fg-muted">Account: </dt><dd className="inline font-mono break-all">{provider.provider_account_id || '–'}</dd></div>
                                                    <div><dt className="inline text-fg-muted">Token type: </dt><dd className="inline">{provider.token_type || '–'}</dd></div>
                                                    <div><dt className="inline text-fg-muted">Scopes: </dt><dd className="inline break-all">{provider.scope?.join(', ') || '–'}</dd></div>
                                                    <div><dt className="inline text-fg-muted">Updated: </dt><dd className="inline"><LocalTime value={provider.updated_at} /></dd></div>
                                                </dl>
                                            </InnerCard>
                                        ))}
                                    </div>
                                )}
                            </DrawerSection>

                            <DrawerSection icon={Globe} title="Google properties and sites">
                                {profile.google_inventory.warnings.length ? <Banner variant="warn" className="mb-4">{profile.google_inventory.warnings.map((warning, index) => <div key={index}>{warning}</div>)}</Banner> : null}
                                {reportError && (
                                    <Banner variant="danger" className="mb-4">{reportError}</Banner>
                                )}
                                {!profile.google_inventory.connected ? <EmptyNote title="Google not connected" description="GA4 properties and Search Console sites will appear here once the user connects Google." /> : (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <SubHeading>GA4 properties</SubHeading>
                                            {profile.google_inventory.ga_properties.length === 0 ? <EmptyNote title="No properties returned" description="The live GA inventory request returned no accessible properties." /> : profile.google_inventory.ga_properties.map(property => {
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
                                            <SubHeading>Search Console sites</SubHeading>
                                            {profile.google_inventory.ga_properties.length === 0 && profile.google_inventory.gsc_sites.length > 0 ? (
                                                <Banner variant="info">
                                                    GA4 properties are unavailable for this user. Reports below will use Search Console data only.
                                                </Banner>
                                            ) : null}
                                            {profile.google_inventory.gsc_sites.length === 0 ? <EmptyNote title="No sites returned" description="The live Search Console request returned no verified sites." /> : profile.google_inventory.gsc_sites.map(site => {
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
                                                    <InnerCard key={siteKey}>
                                                        <div className="font-mono text-body font-medium break-all">{site.site_url || 'Unknown site'}</div>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {site.permission_level ? <SignalPill>{site.permission_level}</SignalPill> : null}
                                                            {site.site_type ? <SignalPill>{site.site_type}</SignalPill> : null}
                                                        </div>
                                                    </InnerCard>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </DrawerSection>

                            <DrawerSection icon={Activity} title="Embed and share usage">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <DetailStat label="Active embeds" value={String(profile.globe_assets.summary.active_embed_tokens)} />
                                    <DetailStat label="Embeds used" value={String(profile.globe_assets.summary.used_embed_tokens)} sub="Tokens with last_used_at" />
                                    <DetailStat label="Shared dashboards" value={String(profile.globe_assets.summary.shared_dashboards)} sub={`${formatNumber(profile.globe_assets.summary.shared_dashboard_views)} total views`} />
                                    <DetailStat label="Public dashboards" value={String(profile.globe_assets.summary.public_custom_dashboards)} sub={`${formatNumber(profile.globe_assets.summary.public_custom_dashboard_views)} total views`} />
                                </div>
                                <div className="mt-5 space-y-3">
                                    <SubHeading>Embed tokens</SubHeading>
                                    {profile.globe_assets.embed_tokens.length === 0 ? <EmptyNote title="No embed tokens" description="This user is not currently exposing any active globe/embed tokens." /> : profile.globe_assets.embed_tokens.map(token => (
                                        <InnerCard key={token.id}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-body font-medium">{token.label || token.property_name || token.property_id}</div>
                                                <SignalPill tone={token.last_used_at ? 'up' : 'neutral'}>{token.last_used_at ? 'Used' : 'Never used'}</SignalPill>
                                            </div>
                                            <div className="mt-1 text-meta text-fg-muted">{token.property_name || token.property_id}</div>
                                            <div className="mt-3 grid gap-2 text-body-sm text-fg-secondary grid-cols-1 sm:grid-cols-2">
                                                <div><span className="text-fg-muted">Created: </span><LocalTime value={token.created_at} /></div>
                                                <div><span className="text-fg-muted">Last used: </span><LocalTime value={token.last_used_at} /></div>
                                                <div className="sm:col-span-2"><span className="text-fg-muted">Allowed origins: </span>{token.allowed_origins.length ? token.allowed_origins.join(', ') : 'Any origin'}</div>
                                            </div>
                                        </InnerCard>
                                    ))}
                                </div>
                                <div className="mt-5 space-y-3">
                                    <SubHeading>Shared dashboards</SubHeading>
                                    {profile.shared_dashboards.length === 0 ? <EmptyNote title="No shared dashboards" description="This user has not published any active shared dashboard links." /> : profile.shared_dashboards.map(share => (
                                        <InnerCard key={share.id}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-body font-medium break-all">{share.site_url || share.property_name || share.property_id}</div>
                                                <SignalPill>{formatNumber(share.views)} views</SignalPill>
                                            </div>
                                            <div className="mt-1 text-meta text-fg-muted">{share.property_name || share.property_id}</div>
                                            <div className="mt-3 grid gap-2 text-body-sm text-fg-secondary grid-cols-1 sm:grid-cols-2">
                                                <div><span className="text-fg-muted">Created: </span><LocalTime value={share.created_at} /></div>
                                                <div><span className="text-fg-muted">Last viewed: </span><LocalTime value={share.last_viewed_at} /></div>
                                                <div className="sm:col-span-2"><span className="text-fg-muted">Widgets: </span>{Object.entries(share.config || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'Default config'}</div>
                                            </div>
                                        </InnerCard>
                                    ))}
                                </div>
                            </DrawerSection>

                            <DrawerSection icon={LayoutDashboard} title="Custom dashboards">
                                {profile.custom_dashboards.length === 0 ? <EmptyNote title="No custom dashboards" description="This user has not created any active custom dashboards yet." /> : (
                                    <div className="space-y-3">
                                        {profile.custom_dashboards.map(dashboard => (
                                            <InnerCard key={dashboard.id}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-body font-medium">{dashboard.name}</div>
                                                    {dashboard.is_public ? <SignalPill tone="up">Public</SignalPill> : null}
                                                    {dashboard.has_share_link ? <SignalPill tone="info">Share link</SignalPill> : null}
                                                    {dashboard.embed_enabled ? <SignalPill>Embed enabled</SignalPill> : null}
                                                    <SignalPill>{dashboard.widget_count} widgets</SignalPill>
                                                </div>
                                                <div className="mt-1 text-meta text-fg-muted">{dashboard.property_name || dashboard.property_id}</div>
                                                {dashboard.description ? <div className="mt-2 text-body-sm text-fg-secondary">{dashboard.description}</div> : null}
                                                <div className="mt-3 grid gap-2 text-body-sm text-fg-secondary grid-cols-1 sm:grid-cols-2">
                                                    <div><span className="text-fg-muted">Site: </span>{dashboard.site_url || '–'}</div>
                                                    <div><span className="text-fg-muted">Views: </span>{formatNumber(dashboard.views)}</div>
                                                    <div><span className="text-fg-muted">Created: </span><LocalTime value={dashboard.created_at} /></div>
                                                    <div><span className="text-fg-muted">Updated: </span><LocalTime value={dashboard.updated_at} /></div>
                                                </div>
                                            </InnerCard>
                                        ))}
                                    </div>
                                )}
                            </DrawerSection>

                            <DrawerSection icon={BarChart3} title="Leaderboard">
                                {!profile.leaderboard ? <EmptyNote title="Not listed" description="This user does not currently have an active leaderboard entry." /> : (
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-title-sm">{profile.leaderboard.startup_name}</div>
                                            {profile.leaderboard.is_verified ? <SignalPill tone="up">Verified</SignalPill> : <SignalPill>Unverified</SignalPill>}
                                            {profile.leaderboard.category ? <SignalPill tone="info">{profile.leaderboard.category}</SignalPill> : null}
                                        </div>
                                        {profile.leaderboard.description ? <div className="text-body-sm text-fg-secondary">{profile.leaderboard.description}</div> : null}
                                        {profile.leaderboard.website_url ? <a href={profile.leaderboard.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded text-body-sm text-fg-secondary underline-offset-4 hover:text-fg hover:underline">{profile.leaderboard.website_url}<ExternalLink aria-hidden size={14} strokeWidth={1.75} /></a> : null}
                                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                            <DetailStat label="Property" value={profile.leaderboard.ga_property_name || profile.leaderboard.ga_property_id || '–'} />
                                            <DetailStat label="Visitors" value={formatNumber(profile.leaderboard.monthly_visitors)} />
                                            <DetailStat label="Pageviews" value={formatNumber(profile.leaderboard.monthly_pageviews)} />
                                            <DetailStat label="Trend" value={formatPercent(profile.leaderboard.visitor_trend)} />
                                            <DetailStat label="Engagement" value={formatPercent(profile.leaderboard.engagement_rate)} />
                                            <DetailStat label="Bounce" value={formatPercent(profile.leaderboard.bounce_rate)} />
                                            <DetailStat label="Avg session" value={formatDuration(profile.leaderboard.avg_session_duration)} />
                                            <DetailStat label="Refreshed" value={<LocalTime value={profile.leaderboard.last_refreshed} />} />
                                        </div>
                                    </div>
                                )}
                            </DrawerSection>

                            <DrawerSection icon={Clock} title="Recent events">
                                {profile.recent_events.length === 0 ? <EmptyNote title="No recent events" description="Container/admin events for this user will appear here." /> : (
                                    <div className="space-y-3">
                                        {profile.recent_events.map(event => (
                                            <InnerCard key={event.id}>
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="text-body font-medium capitalize">{event.event_type.replace(/_/g, ' ')}</div>
                                                    <TimeAgo value={event.created_at} className="text-meta text-fg-muted" />
                                                </div>
                                                {event.details ? <div className="mt-2 text-body-sm text-fg-secondary">{event.details}</div> : null}
                                                <div className="mt-2 text-meta text-fg-muted">{event.container_id ? <>Container: <span className="font-mono">{event.container_id}</span></> : 'No container ID'} · <LocalTime value={event.created_at} /></div>
                                            </InnerCard>
                                        ))}
                                    </div>
                                )}
                            </DrawerSection>

                            <DrawerSection icon={Terminal} title="Container logs">
                                {profile.logs?.logs || profile.logs?.error ? <pre className="max-h-80 overflow-auto rounded-control border border-border-subtle bg-surface-sunken p-3 font-mono text-meta whitespace-pre-wrap text-fg-secondary">{profile.logs?.logs || profile.logs?.error}</pre> : <EmptyNote title="No logs available" description="The container has not emitted logs yet, or the runtime is not provisioned." />}
                            </DrawerSection>
                        </>
                    ) : null}
                </div>
            </Drawer>

            <ConfirmModal
                open={destroyOpen}
                onOpenChange={setDestroyOpen}
                title="Destroy this container?"
                description="The user record, OAuth tokens and data are preserved. Only the running Docker container is removed."
                confirmLabel="Destroy container"
                onConfirm={() => {
                    setDestroyOpen(false)
                    onAction('destroy-container', user.github_id)
                }}
            />
        </>
    )
}

// ─── Queries Tab ─────────────────────────────────────────────────────────────

function QueriesTab({ queries, onRefresh, loading }: { queries: QueryData[]; onRefresh: () => void; loading?: boolean }) {
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
                toast.error(message, { duration: 8000 })
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
                toast.error(message, { duration: 8000 })
            }
        } finally {
            setActionLoading('')
        }
    }

    const statusTone = (s: string): PillTone => {
        if (s === 'new') return 'warn'
        if (s === 'read') return 'info'
        if (s === 'replied') return 'up'
        return 'neutral'
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
            <Tabs
                variant="pills"
                ariaLabel="Filter queries by status"
                value={filter}
                onValueChange={setFilter}
                items={(['all', 'new', 'read', 'replied'] as const).map(f => ({
                    value: f,
                    label: <span className="capitalize">{f}</span>,
                    count: counts[f],
                }))}
            />

            {/* Queries list */}
            <div className="space-y-3">
                {loading && queries.length === 0 && Array.from({ length: 4 }, (_, i) => (
                    <Card key={i} padding="sm" className="flex items-center gap-3">
                        <Skeleton rounded="full" className="size-8" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-56" />
                        </div>
                    </Card>
                ))}

                {!loading && filtered.length === 0 && (
                    <Card padding="none">
                        <EmptyState
                            icon={MessageSquare}
                            title={`No ${filter === 'all' ? '' : `${filter} `}queries yet`}
                            description="Messages from the contact form show up here."
                        />
                    </Card>
                )}

                {filtered.map(query => (
                    <Card key={query.id} padding="none" className="overflow-hidden">
                        {/* Header row */}
                        <button
                            type="button"
                            aria-expanded={expandedId === query.id}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-120 hover:bg-subtle/60"
                            onClick={() => {
                                setExpandedId(expandedId === query.id ? null : query.id)
                                if (query.status === 'new') handleStatusUpdate(query.id, 'read')
                            }}
                        >
                            <Avatar name={query.name} size={32} />

                            {/* Name + email */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-body font-medium">{query.name}</span>
                                    <Pill tone={statusTone(query.status)} dot>{query.status}</Pill>
                                </div>
                                <span className="block truncate text-meta text-fg-muted">{query.email}</span>
                            </div>

                            {/* Time */}
                            <TimeAgo value={query.created_at} className="shrink-0 text-meta whitespace-nowrap text-fg-muted" />

                            {/* Expand chevron */}
                            <ChevronDown aria-hidden size={16} className={`shrink-0 text-fg-muted transition-transform duration-120 ${expandedId === query.id ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Expanded content */}
                        {expandedId === query.id && (
                            <div className="space-y-4 border-t border-border-subtle bg-surface-sunken px-4 py-4">
                                {/* Message */}
                                <div>
                                    <div className="mb-1.5 text-meta font-medium text-fg-muted">Message</div>
                                    <p className="rounded-control border border-border-subtle bg-surface p-3.5 text-body leading-relaxed whitespace-pre-wrap text-fg">
                                        {query.message}
                                    </p>
                                </div>

                                {/* Meta */}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted">
                                    <span className="font-mono">ID #{query.id}</span>
                                    {query.ip_address && <span>IP <span className="font-mono">{query.ip_address}</span></span>}
                                    {query.created_at && <LocalTime value={query.created_at} />}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button asChild variant="secondary" size="sm" icon={Mail} trailingIcon={ExternalLink}>
                                        <a href={`mailto:${query.email}?subject=${encodeURIComponent(`Re: Your ${BRAND_NAME} query`)}&body=${encodeURIComponent(`Hi ${query.name},\n\nThank you for reaching out to ${BRAND_NAME}.\n\n---\nYour original message:\n${query.message}\n`)}`}>
                                            Reply by email
                                        </a>
                                    </Button>

                                    {query.status !== 'replied' && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={Check}
                                            loading={actionLoading === `status-${query.id}`}
                                            onClick={() => handleStatusUpdate(query.id, 'replied')}
                                        >
                                            Mark as replied
                                        </Button>
                                    )}

                                    {query.status === 'replied' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={actionLoading === `status-${query.id}`}
                                            onClick={() => handleStatusUpdate(query.id, 'new')}
                                        >
                                            Mark as new
                                        </Button>
                                    )}

                                    <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setDeleteTarget(query)}>
                                        <span className="inline-flex items-center gap-1.5 text-down">
                                            <Trash2 aria-hidden size={14} strokeWidth={1.75} />
                                            Delete
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                title="Delete this query?"
                description={deleteTarget ? `From ${deleteTarget.name} (${deleteTarget.email}). This permanently deletes the contact query. It cannot be undone.` : undefined}
                confirmLabel="Delete query"
                loading={!!deleteTarget && actionLoading === `delete-${deleteTarget.id}`}
                onConfirm={() => deleteTarget ? handleDelete(deleteTarget) : undefined}
            />
        </div>
    )
}


// ─── Support Tab (in-app help & support inbox) ───────────────────────────────

function SupportTab({ threads, onRefresh, loading }: { threads: SupportThread[]; onRefresh: () => void; loading?: boolean }) {
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
        <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-260px)] lg:min-h-[520px] lg:grid-cols-[320px_1fr]">
            {/* Inbox rail */}
            <Card padding="none" className="flex max-h-[40dvh] flex-col overflow-hidden lg:max-h-none">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                    <div className="flex items-center gap-2">
                        <LifeBuoy aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" />
                        <h2 className="text-title-sm">Inbox</h2>
                    </div>
                    <span className="text-meta text-fg-muted">{threads.length} {threads.length === 1 ? 'user' : 'users'}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading && threads.length === 0 ? (
                        <div className="space-y-4 p-4" aria-busy="true">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-full" />
                                </div>
                            ))}
                        </div>
                    ) : threads.length === 0 ? (
                        <EmptyState icon={LifeBuoy} title="No support messages yet" description="Messages from the in-app help form show up here." />
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
            </Card>

            {/* Thread + reply pane */}
            <Card padding="none" className="flex h-[70dvh] min-h-[420px] flex-col overflow-hidden lg:h-auto">
                {!selectedUserId ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-body text-fg-muted">
                        Select a thread on the left to start replying.
                    </div>
                ) : loadingDetail && !detail ? (
                    <div className="flex-1 space-y-4 p-5" aria-busy="true">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-16 w-2/3" />
                        <Skeleton className="ml-auto h-12 w-1/2" />
                        <Skeleton className="h-12 w-3/5" />
                    </div>
                ) : !detail ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-body text-fg-muted">
                        Couldn’t load thread.
                    </div>
                ) : (
                    <>
                        {/* User header */}
                        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
                            <div className="min-w-0">
                                <h2 className="truncate text-title-sm">
                                    {detail.user.github_username || detail.user.email || `User #${detail.user.id}`}
                                </h2>
                                <div className="mt-0.5 flex items-center gap-2 text-meta text-fg-muted">
                                    {detail.user.email && <span className="truncate">{detail.user.email}</span>}
                                    {detail.user.plan && <PlanBadge plan={detail.user.plan} />}
                                </div>
                            </div>
                            <div className="shrink-0 text-meta text-fg-muted">
                                {detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                            {detail.messages.map((m) => (
                                <SupportInboxMessage key={m.id} msg={m} />
                            ))}
                        </div>

                        {/* Reply composer */}
                        {error && (
                            <Banner variant="danger" className="mx-3 mb-2">{error}</Banner>
                        )}
                        <div className="border-t border-border-subtle p-3">
                            <div className="flex items-end gap-2">
                                <Textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault()
                                            void handleReply()
                                        }
                                    }}
                                    aria-label="Reply"
                                    placeholder="Type your reply… (⌘/Ctrl+Enter to send)"
                                    className="flex-1"
                                    rows={2}
                                    disabled={sending}
                                    style={{ minHeight: '44px', maxHeight: '160px' }}
                                />
                                <Button
                                    variant="primary"
                                    iconOnly
                                    icon={Send}
                                    size="lg"
                                    loading={sending}
                                    disabled={!reply.trim()}
                                    onClick={handleReply}
                                    aria-label="Send reply"
                                />
                            </div>
                        </div>
                    </>
                )}
            </Card>
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
            aria-current={selected ? 'true' : undefined}
            className={`w-full border-b border-border-subtle px-4 py-3 text-left transition-colors duration-120 ${
                selected ? 'bg-subtle' : 'hover:bg-subtle/60'
            }`}
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${hasUnread ? 'bg-brand' : 'bg-border-strong'}`} />
                    <span className="truncate text-body font-medium">
                        {thread.github_username || thread.email || `User #${thread.user_id}`}
                    </span>
                </div>
                {hasUnread && (
                    <Badge variant="brand" aria-label={`${thread.unread_user_count} unread`}>
                        {thread.unread_user_count}
                    </Badge>
                )}
            </div>
            <p className="line-clamp-2 text-body-sm text-fg-muted">
                {thread.last_message_author === 'admin' ? 'You: ' : ''}
                {thread.last_message_preview}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-meta text-fg-muted">
                {thread.plan && <span className="capitalize">{thread.plan}</span>}
                {thread.plan && <span aria-hidden>·</span>}
                <TimeAgoOrDate value={thread.last_message_at} />
            </div>
        </button>
    )
}

function SupportInboxMessage({ msg }: { msg: SupportThreadMessage }) {
    const isAdmin = msg.author_type === 'admin'
    return (
        <div className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
            <div
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${
                    isAdmin ? 'bg-brand text-brand-fg' : 'bg-subtle text-fg-secondary'
                }`}
            >
                {isAdmin ? 'TC' : 'U'}
            </div>
            <div className={`flex min-w-0 max-w-[80%] flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                <div className="mb-1 flex items-center gap-2 px-1">
                    <span className="text-meta font-medium text-fg-secondary">
                        {isAdmin ? 'You (Support)' : 'User'}
                    </span>
                    <TimeAgoOrDate value={msg.created_at} className="text-meta text-fg-muted" />
                </div>
                <div
                    className={`rounded-2xl px-4 py-2.5 text-body leading-relaxed break-words whitespace-pre-wrap ${
                        isAdmin
                            ? 'rounded-tr-md bg-brand-soft text-fg'
                            : 'rounded-tl-md border border-border-subtle bg-surface-sunken text-fg'
                    }`}
                >
                    {msg.content}
                </div>
            </div>
        </div>
    )
}

// ─── Leaderboard Tab ─────────────────────────────────────────────────────────

function LeaderboardTab({
    entries,
    onRefresh,
    loading,
}: {
    entries: LeaderboardModerationEntry[]
    onRefresh: () => void
    loading?: boolean
}) {
    const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'mismatch' | 'inactive'>('all')
    const [busyId, setBusyId] = useState<number | null>(null)
    const [actionError, setActionError] = useState('')
    const [deleteEntry, setDeleteEntry] = useState<LeaderboardModerationEntry | null>(null)

    const filtered = entries.filter((e) => {
        if (filter === 'verified') return e.verification_status === 'verified' && e.is_active
        if (filter === 'pending') return e.is_active && (e.verification_status === 'pending' || e.verification_status === 'failed')
        if (filter === 'mismatch') return e.verification_status === 'host_mismatch' || e.verification_status === 'no_web_stream'
        if (filter === 'inactive') return !e.is_active
        return true
    })

    async function moderate(entryId: number, action: 'verify' | 'unverify' | 'activate' | 'deactivate' | 'delete') {
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

    const columns: TableColumn<LeaderboardModerationEntry>[] = [
        {
            key: 'startup',
            header: 'Startup',
            cell: (entry) => (
                <div className="flex items-center gap-2">
                    <Badge variant="neutral">#{entry.id}</Badge>
                    <div className="min-w-0">
                        <div className="max-w-[260px] truncate font-medium">{entry.startup_name}</div>
                        {entry.website_url && (
                            <a
                                href={entry.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded text-meta text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                            >
                                {entry.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </a>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: 'owner',
            header: 'Owner',
            cell: (entry) =>
                entry.user ? (
                    <div>
                        <div className="text-body-sm">{entry.user.github_username || entry.user.email || '–'}</div>
                        <div className="font-mono text-meta text-fg-muted">{entry.user.github_id || `id:${entry.user.id}`}</div>
                    </div>
                ) : (
                    <span className="text-fg-muted">–</span>
                ),
        },
        {
            key: 'property',
            header: 'GA property',
            cell: (entry) => entry.ga_property_id ? <span className="font-mono text-meta text-fg-secondary">{entry.ga_property_id}</span> : <span className="text-fg-muted">none</span>,
        },
        { key: 'visitors', header: 'Visitors', align: 'right', cell: (entry) => formatNumber(entry.monthly_visitors) },
        { key: 'status', header: 'Status', cell: (entry) => <ModerationStatusPill status={entry.verification_status} isActive={entry.is_active} /> },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (entry) => (
                <div className="flex items-center justify-end gap-1.5">
                    {entry.verification_status !== 'verified' ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={ShieldCheck}
                            disabled={busyId === entry.id}
                            title="Force verify"
                            onClick={() => moderate(entry.id, 'verify')}
                        >
                            Verify
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={ShieldOff}
                            disabled={busyId === entry.id}
                            title="Strip verified"
                            onClick={() => moderate(entry.id, 'unverify')}
                        >
                            Unverify
                        </Button>
                    )}
                    {entry.is_active ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={EyeOff}
                            disabled={busyId === entry.id}
                            title="Hide from public board"
                            onClick={() => moderate(entry.id, 'deactivate')}
                        >
                            Hide
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={Eye}
                            disabled={busyId === entry.id}
                            title="Show on public board"
                            onClick={() => moderate(entry.id, 'activate')}
                        >
                            Show
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={busyId === entry.id}
                        title="Hard-delete entry + history"
                        onClick={() => setDeleteEntry(entry)}
                    >
                        <span className="inline-flex items-center gap-1.5 text-down">
                            <Trash2 aria-hidden size={14} strokeWidth={1.75} />
                            Delete
                        </span>
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-4">
            {actionError && (
                <Banner variant="danger" onDismiss={() => setActionError('')}>{actionError}</Banner>
            )}

            <Table<LeaderboardModerationEntry>
                caption="Leaderboard moderation"
                columns={columns}
                rows={filtered}
                rowKey={(entry) => String(entry.id)}
                loading={loading && entries.length === 0}
                density="comfortable"
                empty={<EmptyState variant="inline" icon={Trophy} title="No entries match this filter" description="Pick another filter to see more entries." />}
                toolbar={
                    <>
                        <Tabs
                            variant="pills"
                            ariaLabel="Filter leaderboard entries"
                            className="min-w-0 max-w-full"
                            value={filter}
                            onValueChange={setFilter}
                            items={FILTERS.map((f) => ({ value: f.key, label: f.label, count: f.count }))}
                        />
                        <Button variant="secondary" size="sm" icon={RefreshCw} className="ml-auto" onClick={onRefresh}>
                            Refresh
                        </Button>
                    </>
                }
            />

            <LeaderboardInquiriesPanel />

            <ConfirmModal
                open={!!deleteEntry}
                onOpenChange={(open) => { if (!open) setDeleteEntry(null) }}
                title={`Delete ${deleteEntry?.startup_name ?? 'this entry'}?`}
                description="This hard-deletes the entry and its history. It cannot be undone."
                confirmLabel="Delete entry"
                loading={!!deleteEntry && busyId === deleteEntry.id}
                onConfirm={async () => {
                    if (!deleteEntry) return
                    await moderate(deleteEntry.id, 'delete')
                    setDeleteEntry(null)
                }}
            />
        </div>
    )
}

interface LeaderboardInquiry {
    id: number
    entry_id: number
    site_name: string | null
    kind: string
    name: string | null
    email: string | null
    company: string | null
    budget: string | null
    message: string | null
    status: string
    ad_slot_request_id: number | null
    created_at: string | null
}

const INQUIRY_KIND_LABELS: Record<string, string> = {
    sponsorship: 'Sponsorship',
    acquisition: 'Acquisition',
    investment: 'Investment',
    partnership: 'Partnership',
    advertising: 'Advertising',
}

/** Offers sent from public leaderboard profiles, across every site (newest first). Read only. */
function LeaderboardInquiriesPanel() {
    const [items, setItems] = useState<LeaderboardInquiry[] | null>(null)
    const [error, setError] = useState('')

    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        let cancelled = false
        apiGet('leaderboard-inquiries')
            .then((data: { items?: LeaderboardInquiry[] }) => {
                if (cancelled) return
                setError('')
                setItems(data.items ?? [])
            })
            .catch((err) => {
                if (cancelled) return
                const message = getErrorMessage(err)
                if (!isSuperadminAuthError(message)) setError(message)
                setItems((prev) => prev ?? [])
            })
        return () => { cancelled = true }
    }, [reloadKey])

    const columns: TableColumn<LeaderboardInquiry>[] = [
        {
            key: 'site',
            header: 'Site',
            cell: (it) => <span className="block max-w-[200px] truncate font-medium">{it.site_name ?? `#${it.entry_id}`}</span>,
        },
        {
            key: 'kind',
            header: 'Offer',
            cell: (it) => (
                <span className="inline-flex items-center gap-1.5">
                    {INQUIRY_KIND_LABELS[it.kind] ?? it.kind}
                    {it.ad_slot_request_id ? <Badge variant="sponsored">Slot</Badge> : null}
                </span>
            ),
        },
        {
            key: 'from',
            header: 'From',
            cell: (it) => (
                <div className="min-w-0">
                    <div className="max-w-[200px] truncate text-body-sm">{[it.name, it.company].filter(Boolean).join(' · ') || '–'}</div>
                    {it.email ? <a href={`mailto:${it.email}`} className="block max-w-[200px] truncate text-meta text-fg-muted underline-offset-4 hover:text-fg hover:underline">{it.email}</a> : null}
                </div>
            ),
        },
        { key: 'budget', header: 'Budget', cell: (it) => <span className="text-body-sm">{it.budget || '–'}</span> },
        {
            key: 'message',
            header: 'Message',
            cell: (it) => <span className="line-clamp-2 max-w-[360px] text-body-sm text-fg-secondary" title={it.message ?? undefined}>{it.message || '–'}</span>,
        },
        { key: 'status', header: 'Status', cell: (it) => <Pill tone={it.status === 'new' ? 'info' : 'neutral'}>{it.status}</Pill> },
        { key: 'when', header: 'Received', align: 'right', cell: (it) => <TimeAgo value={it.created_at} className="text-meta text-fg-muted" /> },
    ]

    return (
        <Card padding="none">
            <div className="p-4 pb-0">
                <CardHeader
                    title="Offers and inquiries"
                    description="Sent from public profiles to site owners. Owners answer from their own inbox; this list is for spotting abuse."
                    actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setReloadKey((k) => k + 1)}>Refresh</Button>}
                />
            </div>
            {error ? <div className="px-4 pt-3"><Banner variant="danger" onDismiss={() => setError('')}>{error}</Banner></div> : null}
            <Table<LeaderboardInquiry>
                caption="Leaderboard offers and inquiries"
                columns={columns}
                rows={items ?? []}
                rowKey={(it) => String(it.id)}
                loading={items === null}
                density="comfortable"
                pagination={{ pageSize: 20 }}
                empty={<EmptyState variant="inline" icon={Mail} title="No offers yet" description="Offers sent from public profiles show up here." />}
            />
        </Card>
    )
}

function ModerationStatusPill({ status, isActive }: { status: string; isActive: boolean }) {
    if (!isActive) {
        return <Pill>Hidden</Pill>
    }
    if (status === 'verified') {
        return <Pill tone="up" icon={<ShieldCheck aria-hidden size={12} strokeWidth={1.75} />}>Verified</Pill>
    }
    if (status === 'host_mismatch' || status === 'no_web_stream') {
        return <Pill tone="warn" icon={<AlertTriangle aria-hidden size={12} strokeWidth={1.75} />}>Mismatch</Pill>
    }
    if (status === 'failed') {
        return <Pill tone="down">Failed</Pill>
    }
    return <Pill tone="warn" dot>Pending</Pill>
}

// ─── Events Tab ──────────────────────────────────────────────────────────────

function EventsTab({ events, loading }: { events: EventData[]; loading?: boolean }) {
    const eventTypeVariant = (type: string): BadgeVariant => {
        const t = type.toLowerCase()
        if (t.includes('create') || t.includes('start')) return 'up'
        if (t.includes('delete') || t.includes('destroy')) return 'down'
        if (t.includes('stop')) return 'warn'
        if (t.includes('restart')) return 'info'
        return 'neutral'
    }

    const columns: TableColumn<EventData>[] = [
        { key: 'type', header: 'Event', cell: (event) => <Badge variant={eventTypeVariant(event.event_type)}>{event.event_type}</Badge> },
        {
            key: 'user',
            header: 'User',
            cell: (event) => event.github_id ? <span className="font-mono text-meta text-fg-secondary">{event.github_id}</span> : <span className="text-fg-muted">–</span>,
        },
        { key: 'details', header: 'Details', cell: (event) => <span className="block max-w-[520px] truncate text-fg-secondary" title={event.details}>{event.details}</span> },
        { key: 'when', header: 'When', align: 'right', cell: (event) => <TimeAgo value={event.timestamp} className="text-meta whitespace-nowrap text-fg-muted" /> },
    ]

    return (
        <Table<EventData>
            caption="Container and admin events"
            columns={columns}
            rows={events}
            rowKey={(event, i) => String(event.id || i)}
            loading={loading && events.length === 0}
            empty={<EmptyState variant="inline" icon={Clock} title="No events recorded" description="Container and admin events show up here as they happen." />}
        />
    )
}

// ─── System Tab ──────────────────────────────────────────────────────────────

function SystemTab({ status, capacity }: { status: StatusData | null; capacity: number }) {
    if (!status) {
        return (
            <div className="space-y-6" aria-busy="true" aria-label="Loading system data">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {Array.from({ length: 3 }, (_, i) => <AdminStat key={i} label="Loading" loading />)}
                </div>
                <Card>
                    <Skeleton className="mb-4 h-4 w-32" />
                    <BarList items={[]} metric="neutral" loading limit={3} />
                </Card>
            </div>
        )
    }

    const plans = planCounts(status)

    return (
        <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <AdminStat icon={Users} label="Total users" value={status.total_users} sub={`of ${status.max_users || 50} max capacity`} />
                <AdminStat icon={Bot} label="Running containers" value={status.running_containers} sub="active right now" />
                <AdminStat icon={Server} label="Capacity used" value={`${capacity}%`}>
                    <UsageBar percent={capacity} label="Capacity used" />
                </AdminStat>
            </div>

            {/* Plan Breakdown */}
            <Card>
                <CardHeader title="Plan breakdown" description="Users per plan" />
                <BarList
                    metric="neutral"
                    showShare
                    limit={6}
                    items={plans.map(([name, count]) => ({ key: name, label: name.charAt(0).toUpperCase() + name.slice(1), value: count }))}
                />
            </Card>
        </div>
    )
}

/* Per-user helpful / not helpful cell rendered inside UserRow. Click toggles
 * the inline expand row below. Counts show 0 until the aggregate summary
 * loads; the button is disabled while the user has no feedback. */
function FeedbackCell({ counts, expanded, onToggle }: {
    counts: { up: number; down: number } | null
    expanded: boolean
    onToggle: () => void
}) {
    const up = counts?.up ?? 0
    const down = counts?.down ?? 0
    const hasAny = (counts !== null) && (up > 0 || down > 0)
    return (
        <Button
            variant={expanded ? 'subtle' : 'secondary'}
            size="sm"
            onClick={onToggle}
            disabled={!hasAny}
            aria-expanded={hasAny ? expanded : undefined}
            aria-label={`${up} helpful, ${down} not helpful${hasAny ? (expanded ? '. Hide feedback' : '. Show recent feedback') : '. No feedback yet'}`}
            title={hasAny ? (expanded ? 'Hide feedback' : 'Show recent feedback') : 'No feedback yet'}
        >
            <span className="inline-flex items-center gap-1 tabular-nums">
                <ThumbsUp aria-hidden size={14} strokeWidth={1.75} className="text-up" />
                {up}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
                <ThumbsDown aria-hidden size={14} strokeWidth={1.75} className="text-down" />
                {down}
            </span>
        </Button>
    )
}

/* Inline detail panel rendered as a 2nd <tr> below the user row when the
 * FeedbackCell is clicked. Loads recent ChatFeedback rows for this user
 * with their reason, comment, and message excerpt. */
function FeedbackExpandPanel({ detail }: {
    detail: FeedbackItem[] | 'loading' | { error: string } | undefined
}) {
    if (detail === undefined || detail === 'loading') {
        return <SkeletonText lines={2} className="max-w-md" />
    }
    if (typeof detail === 'object' && !Array.isArray(detail) && 'error' in detail) {
        return <div className="text-body-sm text-down">Failed to load: {detail.error}</div>
    }
    if (detail.length === 0) {
        return <div className="text-body-sm text-fg-muted">No feedback recorded yet.</div>
    }
    return (
        <div className="space-y-2">
            {detail.map(item => (
                <div
                    key={item.id}
                    className="rounded-control border border-border-subtle bg-surface px-3 py-2.5"
                >
                    <div className="flex items-start gap-2.5">
                        {item.rating === 'up'
                            ? <ThumbsUp aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-up" />
                            : <ThumbsDown aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-down" />}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 text-meta">
                                <span className="font-medium text-fg">
                                    {item.rating === 'up' ? 'Helpful' : 'Not helpful'}
                                </span>
                                {item.reason ? <span className="text-fg-muted">· {item.reason}</span> : null}
                                {item.created_at ? (
                                    <LocalTime value={item.created_at} className="ml-auto text-fg-muted" />
                                ) : null}
                            </div>
                            {item.comment ? (
                                <p className="mt-1 text-body-sm leading-relaxed text-fg">{item.comment}</p>
                            ) : null}
                            {item.message_excerpt ? (
                                <p className="mt-1 truncate text-meta text-fg-muted" title={item.message_excerpt}>
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
