import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSuperadminToken, verifySuperadminToken } from '@/lib/superadminToken'
import { sendUserReportEmail } from '@/lib/reportEmail'
import { sendUserFeedbackEmail } from '@/lib/feedbackEmail'

export const dynamic = 'force-dynamic'
// Report-email path renders a PDF + Gemini-synthesised analysis; the same 5-min
// budget the user-facing /api/report/user-generate route uses.
export const maxDuration = 300

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

// HMAC-SHA256 hash of the superadmin password with salt (set SUPERADMIN_PASSWORD env var)
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD
const PASSWORD_SALT = process.env.NEXTAUTH_SECRET || ''
const PASSWORD_HASH = SUPERADMIN_PASSWORD && PASSWORD_SALT
    ? crypto.createHmac('sha256', PASSWORD_SALT).update(SUPERADMIN_PASSWORD).digest('hex')
    : ''

function normalizeUser(user: Record<string, unknown>) {
    const rawId = user.github_id ?? user.email ?? user.id ?? ''
    const identifier = typeof rawId === 'string' ? rawId : String(rawId)
    const username =
        (typeof user.github_username === 'string' && user.github_username) ||
        (typeof user.username === 'string' && user.username) ||
        (typeof user.email === 'string' && user.email ? user.email.split('@')[0] : '') ||
        identifier

    const containerStatus = typeof user.container_status === 'string' && user.container_status
        ? user.container_status
        : 'unknown'

    return {
        ...user,
        github_id: identifier,
        username,
        email: typeof user.email === 'string' ? user.email : '',
        credits: typeof user.credits === 'number' ? user.credits : 0,
        container: user.container ?? {
            status: containerStatus,
            port: typeof user.container_port === 'number' ? user.container_port : undefined,
        },
        has_google: Boolean(user.has_google),
        provider_count: typeof user.provider_count === 'number' ? user.provider_count : 0,
        embed_token_count: typeof user.embed_token_count === 'number' ? user.embed_token_count : 0,
        shared_dashboard_count: typeof user.shared_dashboard_count === 'number' ? user.shared_dashboard_count : 0,
        custom_dashboard_count: typeof user.custom_dashboard_count === 'number' ? user.custom_dashboard_count : 0,
        leaderboard_active: Boolean(user.leaderboard_active),
    }
}

function verifyPassword(password: string): boolean {
    if (!PASSWORD_HASH || !PASSWORD_SALT) return false // No password or salt configured
    const hash = crypto.createHmac('sha256', PASSWORD_SALT).update(password).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(PASSWORD_HASH, 'hex'))
}

// GET /api/superadmin?token=X&endpoint=status|users|events|user-detail&id=X
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token') || ''

    if (!verifySuperadminToken(token)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const endpoint = searchParams.get('endpoint') || 'status'

        if (endpoint === 'status') {
            const res = await fetch(`${ADMIN_API_URL}/api/admin/status`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get admin status')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'users') {
            const res = await fetch(`${ADMIN_API_URL}/api/users`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get users')
            const users = await res.json()
            return NextResponse.json(Array.isArray(users) ? users.map(normalizeUser) : [])
        }

        if (endpoint === 'events') {
            const res = await fetch(`${ADMIN_API_URL}/api/admin/events?limit=50`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get events')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'queries') {
            const res = await fetch(`${ADMIN_API_URL}/contact`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get contact queries')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'user-detail') {
            const githubId = searchParams.get('id')
            if (!githubId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
            const encodedId = encodeURIComponent(githubId)

            const [userRes, logsRes] = await Promise.all([
                fetch(`${ADMIN_API_URL}/api/users/${encodedId}`, {
                    headers: { 'X-API-Key': ADMIN_API_KEY }
                }),
                fetch(`${ADMIN_API_URL}/api/users/${encodedId}/logs?tail=30`, {
                    headers: { 'X-API-Key': ADMIN_API_KEY }
                })
            ])

            const userData = userRes.ok ? await userRes.json() : null
            const logsData = logsRes.ok ? await logsRes.json() : null

            return NextResponse.json({ user: userData, logs: logsData })
        }

        if (endpoint === 'leaderboard') {
            const res = await fetch(`${ADMIN_API_URL}/api/superadmin/leaderboard`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get leaderboard entries')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'user-profile') {
            const githubId = searchParams.get('id')
            if (!githubId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
            const encodedId = encodeURIComponent(githubId)

            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodedId}/profile`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Failed to get user profile' }))
                throw new Error(err.detail || err.error || 'Failed to get user profile')
            }

            return NextResponse.json(await res.json())
        }

        if (endpoint === 'support-threads') {
            const res = await fetch(`${ADMIN_API_URL}/api/admin/support/threads`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to load support threads')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'support-thread') {
            const userId = searchParams.get('id')
            if (!userId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/admin/support/threads/${encodeURIComponent(userId)}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Failed to load thread' }))
                throw new Error(err.detail || err.error || 'Failed to load thread')
            }
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'chat-feedback-summary') {
            // Single aggregate query for ALL users' feedback counts — avoids
            // N+1 against /api/chat/stats when rendering the user list.
            const res = await fetch(`${ADMIN_API_URL}/api/admin/chat-feedback-summary`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to load chat feedback summary')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'user-chat-feedback') {
            const userIdParam = searchParams.get('id')
            if (!userIdParam) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
            const limit = searchParams.get('limit') || '20'
            const res = await fetch(
                `${ADMIN_API_URL}/api/admin/users/${encodeURIComponent(userIdParam)}/chat-feedback?limit=${encodeURIComponent(limit)}`,
                { headers: { 'X-API-Key': ADMIN_API_KEY } },
            )
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Failed to load user chat feedback' }))
                throw new Error(err.detail || err.error || 'Failed to load user chat feedback')
            }
            return NextResponse.json(await res.json())
        }

        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })

    } catch (err: unknown) {
        const error = err as Error
        console.error('Superadmin GET error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST /api/superadmin — auth + actions
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { action } = body

        // Auth action — no token required
        if (action === 'auth') {
            const { password } = body
            if (!password || !verifyPassword(password)) {
                return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
            }
            const { token, expiresAt } = createSuperadminToken()
            return NextResponse.json({ token, expiresAt })
        }

        // All other actions require a valid token
        const { token, githubId } = body
        if (!verifySuperadminToken(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        if (action === 'restart' || action === 'stop' || action === 'start') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}/container`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify({ action })
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'delete') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}?remove_data=true`, {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'update-plan') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const { params } = body
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify({ plan: params?.plan })
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'update-settings') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const params = (body.params ?? {}) as Record<string, unknown>
            const allowedKeys = ['bot_engine', 'telegram_bot_token', 'gemini_api_key'] as const
            const payload: Record<string, unknown> = {}
            for (const k of allowedKeys) {
                if (k in params && params[k] !== undefined) payload[k] = params[k]
            }
            if (Object.keys(payload).length === 0) {
                return NextResponse.json({ error: 'No supported settings provided' }, { status: 400 })
            }
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify(payload)
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'destroy-container') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}/container`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify({ action: 'destroy' })
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'add-credits') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const { params } = body
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}/credits/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify({ amount: params?.amount, reason: params?.reason || 'Admin grant' })
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'get-credits') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(githubId)}/credits`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'update-query-status') {
            const { queryId, status } = body
            if (!queryId || !status) return NextResponse.json({ error: 'Missing queryId or status' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/contact/${queryId}?status=${encodeURIComponent(status)}`, {
                method: 'PATCH',
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'leaderboard-moderate') {
            const { entryId, leaderboardAction } = body
            if (!entryId || !leaderboardAction) {
                return NextResponse.json({ error: 'Missing entryId or leaderboardAction' }, { status: 400 })
            }
            const allowed = new Set(['verify', 'unverify', 'activate', 'deactivate', 'delete'])
            if (!allowed.has(leaderboardAction)) {
                return NextResponse.json({ error: `Unknown action: ${leaderboardAction}` }, { status: 400 })
            }
            const res = await fetch(`${ADMIN_API_URL}/api/superadmin/leaderboard/${encodeURIComponent(entryId)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({ action: leaderboardAction }),
            })
            return NextResponse.json(await res.json(), { status: res.status })
        }

        if (action === 'delete-query') {
            const { queryId } = body
            if (!queryId) return NextResponse.json({ error: 'Missing queryId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/contact/${queryId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'support-reply') {
            const { userId, content, adminId } = body
            if (!userId || typeof content !== 'string' || !content.trim()) {
                return NextResponse.json({ error: 'Missing userId or content' }, { status: 400 })
            }
            const res = await fetch(`${ADMIN_API_URL}/api/admin/support/threads/${encodeURIComponent(userId)}/reply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({ content, admin_id: adminId || 'support' }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                return NextResponse.json(
                    { error: data.detail || data.error || 'Failed to reply' },
                    { status: res.status },
                )
            }
            return NextResponse.json(data)
        }

        if (action === 'support-mark-read') {
            const { userId } = body
            if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/admin/support/threads/${encodeURIComponent(userId)}/read`, {
                method: 'PATCH',
                headers: { 'X-API-Key': ADMIN_API_KEY },
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'send-feedback-email') {
            const { userId, couponPercent, expiryDays } = body as {
                userId?: string
                couponPercent?: number
                expiryDays?: number
            }
            if (!userId) {
                return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
            }
            const result = await sendUserFeedbackEmail({
                userId: String(userId),
                couponPercent: typeof couponPercent === 'number' ? couponPercent : undefined,
                expiryDays: typeof expiryDays === 'number' ? expiryDays : undefined,
            })
            if (!result.ok) {
                return NextResponse.json(
                    { error: result.error || 'Send failed', couponCode: result.couponCode },
                    { status: 500 },
                )
            }
            return NextResponse.json({ ok: true, couponCode: result.couponCode })
        }

        if (action === 'send-report-email') {
            const { userId, period, propertyId, siteUrl } = body as {
                userId?: string
                period?: string
                propertyId?: string
                siteUrl?: string
            }
            if (!userId) {
                return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
            }
            if (period !== 'weekly' && period !== 'monthly') {
                return NextResponse.json({ error: 'period must be "weekly" or "monthly"' }, { status: 400 })
            }
            // Long-running: GA4/GSC fetch + Gemini synth + PDF render typically
            // takes 20-90 s. Run synchronously and return when done so the UI
            // can show success/failure inline. propertyId + siteUrl are
            // optional overrides — when omitted, sendUserReportEmail falls back
            // to the user's saved workspace selection.
            const result = await sendUserReportEmail({
                userId: String(userId),
                period,
                propertyId: propertyId ? String(propertyId) : undefined,
                siteUrl: siteUrl ? String(siteUrl) : undefined,
            })
            if (!result.ok) {
                return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 })
            }
            return NextResponse.json({ ok: true })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    } catch (err: unknown) {
        const error = err as Error
        console.error('Superadmin POST error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
