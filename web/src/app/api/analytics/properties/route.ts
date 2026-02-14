import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id

    try {
        const response = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/exec`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": ADMIN_API_KEY
            },
            body: JSON.stringify({
                plugin: "google-analytics",
                command: "list-properties-json",
                args: []
            }),
            cache: 'no-store'
        })

        if (!response.ok) {
            console.error("Admin API error listing properties:", response.status, response.statusText);
            return NextResponse.json({ error: "Failed to list properties" }, { status: 500 });
        }

        const data = await response.json();
        // admin api returns { status: "ok", data: [...], ... }
        if (data.status === "ok") {
            return NextResponse.json(data.data);
        } else {
            console.error("Plugin error:", data.stderr);
            return NextResponse.json({ error: data.stderr || "Plugin error" }, { status: 500 });
        }

    } catch (e) {
        console.error("Failed to fetch properties:", e)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
