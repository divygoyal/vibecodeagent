import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // @ts-expect-error - accessToken added in callbacks
    const accessToken = session.user.accessToken
    // @ts-expect-error - username added in callbacks
    const username = session.user.username

    if (!accessToken) {
      return NextResponse.json({ error: "No GitHub token" }, { status: 400 })
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }

    // Fetch recent events and repos in parallel
    const [eventsRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}/events?per_page=50`, { headers }),
      fetch(`https://api.github.com/user/repos?sort=pushed&per_page=8&type=owner`, { headers })
    ])

    // Parse events ONCE and reuse
    let allEvents: any[] = []
    if (eventsRes.ok) {
      allEvents = await eventsRes.json()
    }

    // Extract recent commits from PushEvents
    const recentCommits = allEvents
      .filter((e: any) => e.type === 'PushEvent')
      .flatMap((e: any) =>
        (e.payload.commits || []).map((c: any) => ({
          repo: e.repo.name.split('/')[1] || e.repo.name,
          message: c.message.split('\n')[0].substring(0, 80),
          sha: c.sha.substring(0, 7),
          date: e.created_at,
          branch: (e.payload.ref || '').replace('refs/heads/', '')
        }))
      )
      .slice(0, 10)

    // Process repos
    let repos: Array<{
      name: string;
      description: string | null;
      language: string | null;
      stars: number;
      updated: string;
      url: string;
    }> = []

    if (reposRes.ok) {
      const reposData = await reposRes.json()
      repos = reposData.map((r: any) => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        updated: r.pushed_at,
        url: r.html_url
      }))
    }

    // Build contribution heatmap from real event dates
    // Create a map of date -> activity count from all events
    const activityByDate: Record<string, number> = {}
    for (const event of allEvents) {
      const dateStr = event.created_at?.split('T')[0]
      if (dateStr) {
        activityByDate[dateStr] = (activityByDate[dateStr] || 0) + 1
      }
    }

    // Generate 365 days of heatmap data
    const heatmap: number[] = []
    const today = new Date()
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const count = activityByDate[dateStr] || 0

      // Map activity count to 0-4 level
      if (count === 0) heatmap.push(0)
      else if (count <= 2) heatmap.push(1)
      else if (count <= 5) heatmap.push(2)
      else if (count <= 10) heatmap.push(3)
      else heatmap.push(4)
    }

    return NextResponse.json({
      commits: recentCommits,
      repos,
      heatmap,
      username
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error('GitHub API error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch GitHub data' }, { status: 500 })
  }
}
