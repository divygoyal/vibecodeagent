import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { runSiteAudit } from '@/lib/siteAudit'
import { isBlockedUrl } from '@/lib/urlValidation'

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    // Always require auth — no bypass even in dev
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { url } = await req.json()

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: "URL is required" }, { status: 400 })
        }

        if (url.length > 2000) {
            return NextResponse.json({ error: "URL too long" }, { status: 400 })
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

        // SSRF protection
        if (isBlockedUrl(normalizedUrl)) {
            return NextResponse.json({ error: "URL not allowed — only public websites can be audited" }, { status: 400 })
        }

        const report = await runSiteAudit(normalizedUrl)
        return NextResponse.json(report)

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Audit failed';
        console.error('Site audit error:', message)
        return NextResponse.json(
            { error: 'Audit failed. Please check the URL and try again.' },
            { status: 500 }
        )
    }
}
