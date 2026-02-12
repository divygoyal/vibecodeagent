import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]/route"

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
    const githubId = session.user.id
    // @ts-expect-error - username added in callbacks
    const githubUsername = session.user.username
    const email = session.user.email
    
    if (!githubId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 400 })
    }

    // Call Admin API to create/update user container
    const response = await fetch(`${ADMIN_API_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ADMIN_API_KEY
      },
      body: JSON.stringify({
        github_id: String(githubId),
        github_username: githubUsername,
        email: email,
        plan: plan || "free",
        telegram_bot_token: token
      })
    })

    const data = await response.json()

    if (!response.ok) {
      // If user already exists, try to update their bot token
      if (response.status === 409) {
        const updateResponse = await fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": ADMIN_API_KEY
          },
          body: JSON.stringify({
            telegram_bot_token: token
          })
        })

        if (updateResponse.ok) {
          // Restart container to pick up new token
          await fetch(`${ADMIN_API_URL}/api/users/${githubId}/container`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": ADMIN_API_KEY
            },
            body: JSON.stringify({ action: "restart" })
          })

          return NextResponse.json({ 
            message: "Bot updated successfully",
            status: "running"
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
