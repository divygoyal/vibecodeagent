import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

// Admin API configuration
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

/**
 * Register the current session's provider tokens with the admin backend.
 * Called on dashboard load to eagerly store tokens before bot setup.
 * This enables the scenario: sign in with Google → connect GitHub → connect bot → both synced.
 */
export async function POST() {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // @ts-expect-error - id added in callbacks
        const userId = session.user.id
        // @ts-expect-error - accessToken added in callbacks
        const accessToken = session.user.accessToken
        // @ts-expect-error - provider added in callbacks
        const provider = session.user.provider
        // @ts-expect-error - refreshToken added in callbacks
        const refreshToken = session.user.refreshToken

        if (!userId || !provider) {
            return NextResponse.json({ error: "Missing session data" }, { status: 400 })
        }

        // Call the sync endpoint — it will upsert the OAuthConnection
        // and recreate the container if a bot is already set up
        const response = await fetch(`${ADMIN_API_URL}/api/users/${userId}/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": ADMIN_API_KEY
            },
            body: JSON.stringify({
                provider: provider,
                provider_id: String(userId),
                access_token: accessToken,
                refresh_token: refreshToken,
            })
        })

        if (!response.ok) {
            // If user doesn't exist yet (404), that's fine — they'll be created on bot setup
            if (response.status === 404) {
                return NextResponse.json({ registered: false, message: "User not found, will register on bot setup" })
            }
            const data = await response.json()
            console.error("Register provider error:", data)
            return NextResponse.json({ error: data.detail || "Failed to register provider" }, { status: response.status })
        }

        const data = await response.json()
        return NextResponse.json({
            registered: true,
            synced: data.synced || false,
            message: data.message
        })

    } catch (error) {
        const err = error as Error
        console.error("Register provider error:", err.message)
        return NextResponse.json({ error: "Failed to register provider" }, { status: 500 })
    }
}
