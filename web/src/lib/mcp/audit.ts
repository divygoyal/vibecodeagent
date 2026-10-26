/**
 * Audit rows for MCP tool calls: queued in-process and flushed to the admin
 * service in batches every 5 seconds. Never contains arguments or results.
 * One structured log line per call as well (no tokens, no query text).
 */
import { adminStore, type AuditRowIn } from './adminStore';

const queue: AuditRowIn[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const MAX_QUEUE = 2000;

async function flush() {
    timer = null;
    while (queue.length) {
        const batch = queue.splice(0, 200);
        try {
            await adminStore.auditBatch(batch);
        } catch (err) {
            console.warn(`[mcp] audit flush failed (${batch.length} rows dropped):`, err instanceof Error ? err.message : err);
            return;
        }
    }
}

export function recordAudit(row: AuditRowIn): void {
    console.log(JSON.stringify({
        evt: 'mcp_tool', ts: row.ts, user_id: row.user_id, grant_id: row.grant_id ?? null, tool: row.tool,
        site: row.site_host ?? null, status: row.status, duration_ms: row.duration_ms, rows: row.rows,
        cache: row.cache_hit ? 'hit' : 'miss', google_calls: row.google_calls,
    }));
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(row);
    if (!timer) {
        timer = setTimeout(() => void flush(), 5000);
        if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref();
    }
}

/** For tests and shutdown. */
export async function flushAudit(): Promise<void> {
    if (timer) clearTimeout(timer);
    await flush();
}
