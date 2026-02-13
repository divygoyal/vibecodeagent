import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

// Admin API configuration
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

// Validate Telegram bot token format
function isValidTelegramToken(token: string): boolean {
  return /^\d{8,10}:[A-Za-z0-9_-]{35}$/.test(token)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { token, plan } = await req.json()

    if (!token || !isValidTelegramToken(token)) {
      return NextResponse.json({
        error: "Invalid token format",
        hint: "Token should be from @BotFather"
      }, { status: 400 })
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id
    // @ts-expect-error - username added in callbacks
    const username = session.user.username
    // @ts-expect-error - accessToken added in callbacks
    const accessToken = session.user.accessToken
    // @ts-expect-error - provider added in callbacks
    const provider = session.user.provider || "github" // default to github for legacy
    // @ts-expect-error - refreshToken added in callbacks
    const refreshToken = session.user.refreshToken

    const email = session.user.email

    if (!userId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 400 })
    }

    // Log for debugging (token is masked)
    console.log(`Setup bot for user ${username} (${userId}) via ${provider}`)
    console.log(`Access token present: ${accessToken ? 'YES' : 'NO'}`)
    console.log(`Refresh token present: ${refreshToken ? 'YES' : 'NO'}`)

    // Prepare payload for Admin API
    const payload: any = {
      email: email,
      plan: plan || "free",
      telegram_bot_token: token,

      // Generic provider info
      provider: provider,
      provider_id: String(userId),
      access_token: accessToken,
      refresh_token: refreshToken,
    }

    // Add legacy GitHub fields if applicable
    if (provider === "github") {
      payload.github_id = String(userId)
      payload.github_username = username
    }

    // Call Admin API to create/update user container
    const response = await fetch(`${ADMIN_API_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ADMIN_API_KEY
      },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    if (!response.ok) {
      // If user already exists, try to update their bot token
      if (response.status === 409) {
        // We use GitHub ID for URL in legacy API, or we need a way to look up.
        // The Admin API currently only supports /api/users/{github_id}. 
        // THIS IS A LIMITATION. 
        // For now, if provider is NOT github, we might have issues updating by ID if we don't know the ID used in URL.
        // However, if we just created them with github_id=userId (for github), it works.
        // If google, we don't have a URL ID yet in the frontend's knowledge effectively unless we treat google sub as ID?
        // But admin/main.py create_user uses github_id OR email to check existence.

        // Construct the update URL identifier. 
        // If github, use github_id. If google, we don't have a clear "id" to use in the URL path 
        // because the Admin API /api/users/{id} expects the `github_id` column value (legacy).
        // BUT, `create_user` stores `github_id` as None for Google users??
        // Wait, `create_user` logic: `user_identifier = user_data.github_id if user_data.github_id else user_data.email`.
        // AND `User` model has `github_id` nullable.
        // ADMIN API `update_user` takes `github_id` in URL and searches `User.github_id == github_id`.
        // IF `User.github_id` is None, we CANNOT update them via this endpoint!

        // CRITICAL FIX REQUIRED IN ADMIN API later: allow update by email or DB ID.
        // FOR NOW: We assume GitHub users mostly. 
        // If Google user exists, we might fail to update if we can't target them.

        // Hack: Try to use provider_id as the lookup? No, that won't match if stored as None.
        // Let's rely on the fact that for GitHub users (our primary constraint for "update"), we have ID.

        let targetId = String(userId);
        if (provider !== 'github') {
          // If not github, we might be stuck. 
          // We'll try using the email if the backend supported it, but it doesn't.
          // We'll try using the provider_id just in case we decided to store it there?
          // No, `create_user` stores it in `container_name` maybe?
          console.warn("Updating non-GitHub users not fully supported in legacy API yet");
        }

        const updateResponse = await fetch(`${ADMIN_API_URL}/api/users/${targetId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": ADMIN_API_KEY
          },
          body: JSON.stringify({
            telegram_bot_token: token,
            provider: provider,
            access_token: accessToken, // Update generic token
            refresh_token: refreshToken // Update refresh token
          })
        })

        if (updateResponse.ok) {
          // Start container (this will create it if it doesn't exist, or start if stopped)
          const containerResponse = await fetch(`${ADMIN_API_URL}/api/users/${targetId}/container`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": ADMIN_API_KEY
            },
            body: JSON.stringify({ action: "start" })
          })

          const containerData = await containerResponse.json()
          console.log(`Container start result for ${targetId}:`, containerData)

          return NextResponse.json({
            message: "Bot connected and started successfully",
            status: containerData.status || "running"
          })
        }
      }

      console.error("Admin API error:", data)
      return NextResponse.json({
        error: data.detail || "Failed to setup bot"
      }, { status: response.status })
    }

    return NextResponse.json({
      message: "Bot connected successfully",
      status: data.container_status,
      port: data.container_port
    })

  } catch (error) {
    const err = error as Error
    console.error("Bot setup error:", err.message)
    return NextResponse.json({ error: "Failed to connect bot" }, { status: 500 })
  }
}
