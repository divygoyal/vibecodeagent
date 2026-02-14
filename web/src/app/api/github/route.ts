import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"

export const dynamic = 'force-dynamic';

// ============= Mock data for local development =============

function generateMockCommits() {
  const repos = ['growclaw-web', 'growclaw-bot', 'seo-engine', 'analytics-core'];
  const messages = [
    'fix: resolve SEO scoring regression in content decay module',
    'feat: add real-time keyword tracking dashboard',
    'chore: bump dependencies and fix type errors',
    'fix: handle edge case in GA4 data pipeline',
    'feat: implement AI-powered meta description generator',
    'refactor: extract analytics service into shared module',
    'docs: update API reference for v2 endpoints',
    'fix: correct timezone handling in traffic reports',
    'feat: add Telegram notification for ranking changes',
    'perf: optimize search trend aggregation query',
  ];
  const branches = ['main', 'develop', 'feat/seo-v2', 'fix/analytics-bug'];
  const now = Date.now();
  return messages.map((msg, i) => ({
    repo: repos[i % repos.length],
    message: msg,
    sha: Math.random().toString(36).substring(2, 9),
    date: new Date(now - i * 3600000 * (1 + Math.random() * 4)).toISOString(),
    branch: branches[i % branches.length],
  }));
}

function generateMockRepos() {
  return [
    { name: 'growclaw-web', description: 'GrowClaw SaaS frontend — Next.js', language: 'TypeScript', stars: 42, updated: new Date().toISOString(), url: '#' },
    { name: 'growclaw-bot', description: 'Telegram bot engine with AI integrations', language: 'Python', stars: 28, updated: new Date().toISOString(), url: '#' },
    { name: 'seo-engine', description: 'Content decay detection & keyword gap analysis', language: 'Python', stars: 15, updated: new Date().toISOString(), url: '#' },
    { name: 'analytics-core', description: 'GA4 + GSC data pipeline', language: 'TypeScript', stars: 9, updated: new Date().toISOString(), url: '#' },
  ];
}

function generateMockHeatmap() {
  const heatmap: number[] = [];
  for (let i = 0; i < 365; i++) {
    const rand = Math.random();
    if (rand < 0.3) heatmap.push(0);
    else if (rand < 0.55) heatmap.push(1);
    else if (rand < 0.75) heatmap.push(2);
    else if (rand < 0.9) heatmap.push(3);
    else heatmap.push(4);
  }
  return heatmap;
}

// ============= Route handler =============

export async function GET() {
  const isProduction = !!ADMIN_API_KEY

  if (isProduction) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      // @ts-expect-error - accessToken added in callbacks
      const accessToken = session.user.githubAccessToken
      // @ts-expect-error - username added in callbacks
      const username = session.user.username

      console.log("GitHub API Debug: Using token:", accessToken ? accessToken.substring(0, 10) + "..." : "None");

      if (!accessToken) {
        console.error("GitHub API Error: No access token found in session.");
        return NextResponse.json({ error: "No GitHub token" }, { status: 400 })
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      };

      // 1. Get User Data if username missing
      let user = username;
      if (!user) {
        const userRes = await fetch('https://api.github.com/user', { headers });
        if (userRes.ok) {
          const userData = await userRes.json();
          user = userData.login;
        } else {
          console.error("GitHub API Error: Failed to fetch user profile", await userRes.text());
        }
      }

      console.log("GitHub API Debug: Fetching data for user:", user);

      const [eventsRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}/events?per_page=50`, { headers }),
        fetch(`https://api.github.com/user/repos?sort=pushed&per_page=8&type=owner`, { headers })
      ])

      let allEvents: any[] = []
      if (eventsRes.ok) {
        allEvents = await eventsRes.json()
        console.log(`GitHub Debug: Fetched ${allEvents.length} events for user ${username}`);
        if (allEvents.length > 0) {
          console.log(`GitHub Debug: Event types: ${allEvents.map((e: any) => e.type).slice(0, 10).join(', ')}`);
        }
      } else {
        console.error(`GitHub Debug: Events fetch failed: ${eventsRes.status} ${eventsRes.statusText}`);
        const errorText = await eventsRes.text();
        console.error(`GitHub Debug: Error details: ${errorText}`);
      }

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

      let repos: any[] = []
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

      const activityByDate: Record<string, number> = {}
      for (const event of allEvents) {
        const dateStr = event.created_at?.split('T')[0]
        if (dateStr) {
          activityByDate[dateStr] = (activityByDate[dateStr] || 0) + 1
        }
      }

      const heatmap: number[] = []
      const today = new Date()
      for (let i = 364; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        const count = activityByDate[dateStr] || 0
        if (count === 0) heatmap.push(0)
        else if (count <= 2) heatmap.push(1)
        else if (count <= 5) heatmap.push(2)
        else if (count <= 10) heatmap.push(3)
        else heatmap.push(4)
      }

      return NextResponse.json({ commits: recentCommits, repos, heatmap, username })

    } catch (err: unknown) {
      const error = err as Error
      console.error('GitHub API error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch GitHub data' }, { status: 500 })
    }
  }

  // Dev mode: return mock data
  return NextResponse.json({
    commits: generateMockCommits(),
    repos: generateMockRepos(),
    heatmap: generateMockHeatmap(),
    username: 'growclaw-dev'
  })
}
