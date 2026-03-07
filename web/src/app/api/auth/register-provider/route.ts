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

        // Call the create_user endpoint — it handles idempotent upsert of user & OAuth connection
        // This ensures the user exists even if they haven't set up the bot yet
        const payload: any = {
            provider: provider,
            provider_id: String(userId),
            access_token: accessToken,
            refresh_token: refreshToken,
            email: session.user?.email || undefined,
            plan: "free"
        }

        // Only send github_id for GitHub provider — prevents Google users getting misidentified
        if (provider === 'github') {
            payload.github_id = String(userId)
        }

        // Bug #7 fix: Add timeout to prevent hangs when admin API is cold-starting or down
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        let response: Response;
        try {
            response = await fetch(`${ADMIN_API_URL}/api/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": ADMIN_API_KEY
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            })
        } catch (fetchErr: any) {
            clearTimeout(timeout);
            // Timeout or network error — proceed in degraded mode
            // Admin DB sync is non-critical for read-only dashboard viewing
            console.warn("Admin registration timed out or failed, proceeding in degraded mode:", fetchErr?.message);
            return NextResponse.json({
                registered: true,
                synced: false,
                degraded: true,
            })
        }
        clearTimeout(timeout);

        if (!response.ok) {
            const data = await response.json()
            console.error("Register provider error:", data)
            // Bug #7 fix: Return degraded mode instead of hard error
            // This prevents the entire dashboard from dying when admin API is down
            return NextResponse.json({
                registered: true,
                synced: false,
                degraded: true,
                reason: data.detail || "Admin API returned error"
            })
        }

        await response.json()
        return NextResponse.json({
            registered: true,
            synced: true,
        })

    } catch (error) {
        const err = error as Error
        console.error("Register provider error:", err.message)
        return NextResponse.json({ error: "Failed to register provider" }, { status: 500 })
    }
}
