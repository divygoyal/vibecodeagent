import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { ensureAdminUserSynced, authOptions } from "@/lib/adminUserSync"

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
        const sync = await ensureAdminUserSynced(session)

        if (!sync.synced) {
            console.error("Register provider error:", sync.reason)
            return NextResponse.json({
                registered: true,
                synced: false,
                degraded: true,
                reason: sync.reason || "Admin API returned error"
            })
        }

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
