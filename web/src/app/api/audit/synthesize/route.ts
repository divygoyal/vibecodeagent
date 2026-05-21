/**
 * POST /api/audit/synthesize
 *
 * Takes a previously-computed `AuditReport` (from /api/audit) and produces a
 * TieredActionPlan via Gemini synthesis. Streams progress via SSE.
 *
 * Paywall: `userData.plan !== 'free'` (Starter+).
 * Cost: 1 credit per successful synthesis (refunded on Gemini failure when
 * the deterministic fallback is used).
 * Cache: identical (userId + url + score) returns the cached plan for 24h
 * without re-charging credits.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';
import { synthesizeAuditPlan, type TieredActionPlan, type GscQueryRow } from '@/lib/auditSynth';
import { fetchGoogleTokensFromDb, getValidAccessToken, runGSCQuery } from '@/lib/googleApi';
import { cachedFetch } from '@/lib/apiCache';
import type { AuditReport } from '@/lib/siteAudit';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const SYNTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RequestBody {
    auditReport?: AuditReport;
    optionalGscSiteUrl?: string;
}

function encodeSSE(data: unknown): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function encodeSSEDone(): Uint8Array {
    return new TextEncoder().encode('data: [DONE]\n\n');
}

export async function POST(req: Request) {
    // ── Auth ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    // @ts-expect-error id added in NextAuth callbacks
    const userId: string | undefined = session.user.id;
    if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID not found in session' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Subscription gate (Starter+) ──
    if (!ADMIN_API_KEY) {
        return new Response(JSON.stringify({ error: 'Admin API not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    let userPlan: string = 'free';
    try {
        const userRes = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });
        if (userRes.ok) {
            const userData = await userRes.json();
            userPlan = String(userData?.plan || 'free');
        }
    } catch {
        // fall through; treated as 'free'
    }
    if (userPlan === 'free') {
        return new Response(
            JSON.stringify({ error: 'upgrade_required', minimumPlan: 'starter', message: 'AI Action Plan synthesis is available on Starter and above.' }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
    }

    // ── Body parsing ──
    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const auditReport = body.auditReport;
    if (!auditReport || typeof auditReport !== 'object' || !auditReport.url || !Array.isArray(auditReport.issues)) {
        return new Response(JSON.stringify({ error: 'auditReport is required and must include url + issues' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ── SSRF re-check ──
    if (isBlockedUrl(auditReport.url)) {
        return new Response(JSON.stringify({ error: 'URL not allowed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Cache key ──
    const cacheKey = `audit-synth:${userId}:${createHash('sha256').update(`${auditReport.url}|${auditReport.score}`).digest('hex').slice(0, 24)}`;

    // ── SSE stream ──
    const abortSignal = req.signal;
    const stream = new ReadableStream({
        async start(controller) {
            try {
                controller.enqueue(encodeSSE({ type: 'status', message: 'Analyzing site type...' }));
                if (auditReport.siteType) {
                    controller.enqueue(encodeSSE({ type: 'site_type', value: auditReport.siteType }));
                }

                // Check cache first (no credit deduction on cache hit)
                let cached: TieredActionPlan | null = null;
                try {
                    cached = await cachedFetch<TieredActionPlan | null>(cacheKey, SYNTH_CACHE_TTL_MS, async () => null);
                    if (cached && (cached as TieredActionPlan).generatedAt) {
                        controller.enqueue(encodeSSE({ type: 'cached', value: true }));
                        controller.enqueue(encodeSSE({ type: 'plan', plan: cached }));
                        controller.enqueue(encodeSSEDone());
                        controller.close();
                        return;
                    }
                } catch {
                    // cache miss treated as no-op
                }

                // ── Optional GSC enrichment ──
                let gscTopQueries: GscQueryRow[] | undefined;
                if (body.optionalGscSiteUrl) {
                    controller.enqueue(encodeSSE({ type: 'status', message: 'Fetching search performance...' }));
                    try {
                        const tokens = await fetchGoogleTokensFromDb(String(userId));
                        if (tokens) {
                            const accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
                            const end = new Date().toISOString().slice(0, 10);
                            const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                            const gscResp = await runGSCQuery(accessToken, body.optionalGscSiteUrl, ['query'], start, end, 10, abortSignal);
                            const rows = ((gscResp as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> })?.rows) ?? [];
                            gscTopQueries = rows
                                .filter(r => r.keys?.[0])
                                .map(r => ({
                                    query: r.keys![0],
                                    clicks: Number(r.clicks ?? 0),
                                    impressions: Number(r.impressions ?? 0),
                                    ctr: Number(r.ctr ?? 0),
                                    position: Number(r.position ?? 0),
                                }));
                        }
                    } catch {
                        // GSC enrichment is best-effort; degrade silently
                    }
                }

                // ── Deduct credit ──
                controller.enqueue(encodeSSE({ type: 'status', message: 'Generating recommendations...' }));
                let creditBalance: number | null = null;
                try {
                    const cr = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}/credits/deduct`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                        body: JSON.stringify({ amount: 1 }),
                        cache: 'no-store',
                    });
                    if (cr.ok) {
                        const cd = await cr.json();
                        creditBalance = cd?.credits ?? null;
                    }
                } catch {
                    // continue without credit tracking
                }
                if (creditBalance !== null) {
                    controller.enqueue(encodeSSE({ type: 'credits', value: creditBalance }));
                }

                // ── Synthesize ──
                const plan = await synthesizeAuditPlan({
                    auditReport,
                    gscTopQueries,
                    abortSignal,
                });

                // ── Refund credit if synthesis degraded to deterministic fallback ──
                if (plan.degraded) {
                    try {
                        await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(userId))}/credits/deduct`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                            body: JSON.stringify({ amount: -1 }),
                            cache: 'no-store',
                        });
                    } catch { /* ignore */ }
                } else {
                    // Cache the plan for repeat hits in the next 24h
                    try {
                        await cachedFetch<TieredActionPlan>(cacheKey, SYNTH_CACHE_TTL_MS, async () => plan);
                    } catch { /* ignore */ }
                }

                controller.enqueue(encodeSSE({ type: 'plan', plan }));
                controller.enqueue(encodeSSEDone());
                controller.close();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Synthesis failed';
                try {
                    controller.enqueue(encodeSSE({ type: 'error', message }));
                    controller.enqueue(encodeSSEDone());
                    controller.close();
                } catch {
                    controller.error(err);
                }
            }
        },
        cancel() {
            // Client disconnected — nothing to clean up
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
