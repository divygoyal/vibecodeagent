/**
 * chatTelemetry.ts — fire-and-forget observability for the AI chat pipeline.
 *
 * Every named event is a quantitative signal that lets us answer "did adding
 * feature X actually move the needle?". Without this, you have no way to tell
 * if the repetition detector ever fires, if surprises are surfaced, or if
 * edge-case branches are reached.
 *
 * Usage: `void logChatTelemetry({ event: 'repetition_detected', threadId, payload: {...} });`
 *
 * Reliability: writes are non-blocking. Caller never awaits. Failures are
 * silent. The telemetry endpoint also accepts unknown users (records with
 * user_id=null) so we don't lose unauthenticated edge events.
 */

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export type ChatTelemetryEvent =
    | 'repetition_detected'
    | 'surprise_surfaced'
    | 'confidence_downgraded'
    | 'edge_case_triggered'
    | 'insight_demoted'
    | 'tool_aborted'
    | 'cache_miss_per_source'
    | 'discovery_mode_invoked'
    | 'persona_resolved'
    | 'site_profile_inferred'
    | 'enrichment_failed'
    | 'rescue_pass_invoked';

interface LogArgs {
    event: ChatTelemetryEvent;
    userId?: string | number | null;
    threadId?: string | null;
    payload?: Record<string, unknown>;
}

/** Fire-and-forget telemetry write. Callers MUST NOT await this. */
export function logChatTelemetry(args: LogArgs): void {
    if (!ADMIN_API_KEY) return;
    if (!args.event) return;

    // Run on next tick so the caller can return immediately
    queueMicrotask(() => {
        const body = {
            user_identifier: args.userId != null ? String(args.userId) : null,
            thread_id: args.threadId || null,
            event_name: args.event,
            payload: args.payload || {},
        };
        fetch(`${ADMIN_API_URL}/api/chat/telemetry/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(body),
            // Short timeout — telemetry must never delay the user.
            signal: AbortSignal.timeout(2500),
        }).catch(() => { /* swallow */ });
    });
}

/**
 * Convenience wrapper for "edge_case_triggered" events. Keeps the event_name
 * unified so the dashboard can see edge-case rate at a glance, while the
 * payload carries the specific edge_case_kind.
 */
export type EdgeCaseKind =
    | 'new_site'
    | 'low_traffic'
    | 'multilingual'
    | 'partial_connection_gsc_only'
    | 'partial_connection_ga4_only'
    | 'demo_mode'
    | 'unknown_site_type'
    | 'multi_site_user'
    | 'streaming_aborted_mid_tool';

export function logEdgeCase(kind: EdgeCaseKind, args: Omit<LogArgs, 'event' | 'payload'> & { payload?: Record<string, unknown> } = {}): void {
    logChatTelemetry({
        event: 'edge_case_triggered',
        userId: args.userId,
        threadId: args.threadId,
        payload: { kind, ...(args.payload || {}) },
    });
}
