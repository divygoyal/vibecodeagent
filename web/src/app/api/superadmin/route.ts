import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

// HMAC-SHA256 hash of the superadmin password with salt (set SUPERADMIN_PASSWORD env var)
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD
const PASSWORD_SALT = process.env.NEXTAUTH_SECRET || ''
const PASSWORD_HASH = SUPERADMIN_PASSWORD && PASSWORD_SALT
    ? crypto.createHmac('sha256', PASSWORD_SALT).update(SUPERADMIN_PASSWORD).digest('hex')
    : ''

// Token expiry: 24 hours in milliseconds
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000

function createToken(): { token: string; expiresAt: number } {
    const secret = process.env.NEXTAUTH_SECRET || ''
    const timestamp = Date.now().toString()
    const hmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex')
    const token = `${timestamp}.${hmac}`
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS
    return { token, expiresAt }
}

function verifyToken(token: string): boolean {
    if (!token) return false
    const secret = process.env.NEXTAUTH_SECRET || ''
    const parts = token.split('.')
    if (parts.length !== 2) return false

    const [timestamp, hmac] = parts
    const expectedHmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex')

    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
        return false
    }

    const tokenAge = Date.now() - parseInt(timestamp, 10)
    if (tokenAge > TOKEN_EXPIRY_MS || tokenAge < 0) {
        return false
    }

    return true
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

    if (!verifyToken(token)) {
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

            const detailed = await Promise.all(
                users.map(async (user: Record<string, unknown>) => {
                    try {
                        const detailRes = await fetch(`${ADMIN_API_URL}/api/users/${user.github_id}`, {
                            headers: { 'X-API-Key': ADMIN_API_KEY }
                        })
                        if (detailRes.ok) {
                            const detail = await detailRes.json()
                            return { ...user, container: detail.container }
                        }
                    } catch { /* silent */ }
                    return user
                })
            )

            return NextResponse.json(detailed)
        }

        if (endpoint === 'events') {
            const res = await fetch(`${ADMIN_API_URL}/api/admin/events?limit=50`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get events')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'user-detail') {
            const githubId = searchParams.get('id')
            if (!githubId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

            const [userRes, logsRes] = await Promise.all([
                fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
                    headers: { 'X-API-Key': ADMIN_API_KEY }
                }),
                fetch(`${ADMIN_API_URL}/api/users/${githubId}/logs?tail=30`, {
                    headers: { 'X-API-Key': ADMIN_API_KEY }
                })
            ])

            const userData = userRes.ok ? await userRes.json() : null
            const logsData = logsRes.ok ? await logsRes.json() : null

            return NextResponse.json({ user: userData, logs: logsData })
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
            const { token, expiresAt } = createToken()
            return NextResponse.json({ token, expiresAt })
        }

        // All other actions require a valid token
        const { token, githubId } = body
        if (!verifyToken(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        if (action === 'restart' || action === 'stop' || action === 'start') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/container`, {
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
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}?remove_data=true`, {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'update-plan') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const { params } = body
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY
                },
                body: JSON.stringify({ plan: params?.plan })
            })
            return NextResponse.json(await res.json())
        }

        if (action === 'add-credits') {
            if (!githubId) return NextResponse.json({ error: 'Missing githubId' }, { status: 400 })
            const { params } = body
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/credits/add`, {
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
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/credits`, {
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    } catch (err: unknown) {
        const error = err as Error
        console.error('Superadmin POST error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
