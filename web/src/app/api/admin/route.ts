import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""
const ADMIN_GITHUB_ID = process.env.ADMIN_GITHUB_ID || "86590133"

async function verifyAdmin() {
    const session = await getServerSession(authOptions)
    if (!session?.user) return null
    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id
    if (String(githubId) !== ADMIN_GITHUB_ID) return null
    return session
}

// GET /api/admin/users — all users with status
export async function GET(req: Request) {
    const session = await verifyAdmin()
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const endpoint = searchParams.get('endpoint') || 'status'

        if (endpoint === 'status') {
            // System overview
            const res = await fetch(`${ADMIN_API_URL}/api/admin/status`, {
                headers: { "X-API-Key": ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get admin status')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'users') {
            // All users
            const res = await fetch(`${ADMIN_API_URL}/api/users`, {
                headers: { "X-API-Key": ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get users')
            const users = await res.json()

            // Fetch detailed info for each user
            const detailed = await Promise.all(
                users.map(async (user: any) => {
                    try {
                        const detailRes = await fetch(`${ADMIN_API_URL}/api/users/${user.github_id}`, {
                            headers: { "X-API-Key": ADMIN_API_KEY }
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
            const res = await fetch(`${ADMIN_API_URL}/api/admin/events?limit=30`, {
                headers: { "X-API-Key": ADMIN_API_KEY }
            })
            if (!res.ok) throw new Error('Failed to get events')
            return NextResponse.json(await res.json())
        }

        if (endpoint === 'user-detail') {
            const githubId = searchParams.get('id')
            if (!githubId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

            const [userRes, logsRes] = await Promise.all([
                fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
                    headers: { "X-API-Key": ADMIN_API_KEY }
                }),
                fetch(`${ADMIN_API_URL}/api/users/${githubId}/logs?tail=30`, {
                    headers: { "X-API-Key": ADMIN_API_KEY }
                })
            ])

            const userData = userRes.ok ? await userRes.json() : null
            const logsData = logsRes.ok ? await logsRes.json() : null

            return NextResponse.json({ user: userData, logs: logsData })
        }

        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })

    } catch (err: unknown) {
        const error = err as Error
        console.error('Admin API error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST /api/admin/users — actions (restart, delete)
export async function POST(req: Request) {
    const session = await verifyAdmin()
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    try {
        const { action, githubId } = await req.json()

        if (action === 'restart' || action === 'stop' || action === 'start') {
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
            const res = await fetch(`${ADMIN_API_URL}/api/users/${githubId}?remove_data=true`, {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY }
            })
            return NextResponse.json(await res.json())
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    } catch (err: unknown) {
        const error = err as Error
        console.error('Admin action error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
