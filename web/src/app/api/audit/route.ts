import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { runSiteAudit } from '@/lib/siteAudit'

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""
    const isProduction = !!ADMIN_API_KEY

    if (isProduction) {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
    }

    try {
        const { url } = await req.json()

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: "URL is required" }, { status: 400 })
        }

        // Basic URL validation
        let normalizedUrl = url.trim()
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl
        }

        try {
            new URL(normalizedUrl)
        } catch {
            return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
        }

        const report = await runSiteAudit(normalizedUrl)
        return NextResponse.json(report)

    } catch (err: any) {
        console.error('Site audit error:', err.message)
        return NextResponse.json(
            { error: err.message || 'Audit failed' },
            { status: 500 }
        )
    }
}
