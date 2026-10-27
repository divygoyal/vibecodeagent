import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminUserSynced } from "@/lib/adminUserSync"
import { getServerAuthSession } from "@/lib/serverAuth"

/**
 * Register the current session's provider tokens with the admin backend.
 * Called on dashboard load to eagerly store tokens before bot setup,
 * and from Settings → Connections after a Connect <provider> redirect.
 *
 * Body: { provider?: "github" | "google" } — if provided, we sync THAT provider's
 * tokens onto the existing primary user (so connecting GitHub on a Google-primary
 * session never replaces the user's display identity).
 */
export async function POST(req: NextRequest) {
    // Server-only session with the JWT's tokens (the browser session has none).
    const session = await getServerAuthSession(req)

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let targetProvider: 'github' | 'google' | undefined;
    try {
        const body = await req.json().catch(() => ({}));
        if (body?.provider === 'github' || body?.provider === 'google') {
            targetProvider = body.provider;
        }
    } catch { /* no body, fall back to primary */ }

    try {
        const sync = await ensureAdminUserSynced(session, targetProvider)

        if (!sync.synced) {
            console.warn("Register provider degraded:", sync.reason)
            const status = 'status' in sync && typeof sync.status === 'number' && sync.status >= 400
                ? sync.status
                : 503
            return NextResponse.json({
                registered: false,
                synced: false,
                degraded: true,
                reason: sync.reason || "Admin API returned error",
                error: "Provider connection could not be saved",
            }, { status })
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
