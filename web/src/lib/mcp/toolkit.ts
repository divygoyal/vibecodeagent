/**
 * Tool registration wrapper: annotations, cost-unit rate limit, concurrency,
 * deadline, error mapping, demo banner and audit. MCP.md 7.1 and 8.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { recordAudit } from './audit';
import type { McpPrincipal } from './auth';
import { PRESETS } from './dates';
import { ToolError } from './errors';
import { Sanitizer, THIRD_PARTY_NOTE } from './format';
import { googleForPrincipal, type CallStats, type GoogleClient } from './google';
import { acquireSlot, chargeUnits } from './rateLimit';
import { loadCatalog, resolveSite, type SiteCatalog, type SiteRecord } from './siteResolver';

export const TOOL_DEADLINE_MS = 45_000;

// ───────────── shared schema fragments ─────────────

export const siteArg = z.string().min(1).max(300).describe('Site id from list_sites (bare host such as example.com). Also accepts a URL, a Search Console property (sc-domain:example.com) or a GA4 property (properties/123456789).');

export const dateRangeArg = z.object({
    preset: z.enum(PRESETS).optional(),
    start_date: z.string().max(20).optional(),
    end_date: z.string().max(20).optional(),
}).strict().describe('Use {preset} or {start_date,end_date}. Dates are YYYY-MM-DD, today, yesterday or NdaysAgo. Default {preset:last_28d}.');

export const formatArg = z.enum(['table', 'json']).default('table').describe('table is compact TSV; json returns columns and rows.');

// ───────────── context ─────────────

export interface ToolContext {
    principal: McpPrincipal;
    stats: CallStats;
    san: Sanitizer;
    signal: AbortSignal;
    google(): Promise<GoogleClient>;
    catalog(opts?: { refresh?: boolean }): Promise<SiteCatalog>;
    site(input: string): Promise<SiteRecord>;
    /** Lines to put first in every text result (demo banner). */
    banner(): string[];
    /** Third-party-text footer when the result contains such text. */
    note(): string;
    warn(message: string): void;
    auditSite?: string;
}

export interface ToolResult {
    text: string;
    rows: number;
}

export interface ToolDef<S extends z.ZodObject> {
    name: string;
    title: string;
    description: string;
    input: S;
    cost: number | ((args: z.output<S>) => number);
    invoking: string;
    invoked: string;
    run: (args: z.output<S>, ctx: ToolContext) => Promise<ToolResult>;
}

export function defineTool<S extends z.ZodObject>(def: ToolDef<S>): ToolDef<S> {
    return def;
}

function makeContext(principal: McpPrincipal, signal: AbortSignal): ToolContext {
    const stats: CallStats = { googleCalls: 0, cacheHits: 0, warnings: [] };
    let googleP: Promise<GoogleClient> | null = null;
    let catalogP: Promise<SiteCatalog> | null = null;
    const ctx: ToolContext = {
        principal,
        stats,
        san: new Sanitizer(),
        signal,
        google() {
            googleP ??= googleForPrincipal(principal, stats, signal);
            return googleP;
        },
        async catalog(opts) {
            if (opts?.refresh) catalogP = null;
            catalogP ??= ctx.google().then((g) => loadCatalog(principal, g, opts));
            return catalogP;
        },
        async site(input) {
            const site = resolveSite(await ctx.catalog(), input);
            ctx.auditSite = site.site_id;
            return site;
        },
        banner() {
            return principal.demo ? ['# DEMO DATA: synthetic example sites for trying TrafficClaw, not real analytics'] : [];
        },
        note() {
            return THIRD_PARTY_NOTE;
        },
        warn(message) {
            if (!stats.warnings.includes(message)) stats.warnings.push(message);
        },
    };
    return ctx;
}

function errorText(err: ToolError): string {
    const parts = [`${err.code}: ${err.message}`];
    if (err.hint) parts.push(`Hint: ${err.hint}`);
    if (err.retryAfterS) parts.push(`retry_after_s=${err.retryAfterS}`);
    return parts.join(' ');
}

function rateKey(p: McpPrincipal): string {
    return p.userId > 0 ? `u${p.userId}` : `g${p.grantId ?? p.tokenId}`;
}

export function registerTool<S extends z.ZodObject>(server: McpServer, principal: McpPrincipal, def: ToolDef<S>, ipPrefix: string | null): void {
    server.registerTool(def.name, {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: { title: def.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['mcp:read'] }],
            'openai/toolInvocation/invoking': def.invoking,
            'openai/toolInvocation/invoked': def.invoked,
        },
    }, (async (args: z.output<S>, extra: { mcpReq?: { signal?: AbortSignal } }) => {
        const started = Date.now();
        const controller = new AbortController();
        const upstream = extra?.mcpReq?.signal;
        if (upstream) upstream.addEventListener('abort', () => controller.abort(), { once: true });
        const ctx = makeContext(principal, controller.signal);
        let status = 'ok';
        let rows = 0;
        let releaseUser: (() => void) | null = null;
        let releaseToken: (() => void) | null = null;
        try {
            const units = typeof def.cost === 'function' ? def.cost(args) : def.cost;
            const charge = chargeUnits(rateKey(principal), units);
            if (!charge.ok) throw new ToolError('rate_limited', 'Too many TrafficClaw tool calls in a short time', 'Wait and retry, or ask for fewer sites at once.', charge.retryAfterS);
            releaseUser = await acquireSlot(`user:${rateKey(principal)}`, 4, 5000);
            releaseToken = releaseUser ? await acquireSlot(`token:${principal.tokenId}`, 2, 5000) : null;
            if (!releaseUser || !releaseToken) throw new ToolError('rate_limited', 'Too many TrafficClaw tool calls are running at once', undefined, 5);

            let timer: ReturnType<typeof setTimeout> | undefined;
            const deadline = new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new ToolError('timeout', `${def.name} took longer than ${TOOL_DEADLINE_MS / 1000} s`, 'Try a shorter date range or fewer sites.'));
                }, TOOL_DEADLINE_MS);
            });
            let result: ToolResult;
            try {
                result = await Promise.race([def.run(args, ctx), deadline]);
            } finally {
                clearTimeout(timer);
            }
            rows = result.rows;
            let text = result.text;
            if (ctx.san.flagged) text += `\n# ${ctx.san.flagged} cell(s) were replaced because they looked like instructions.`;
            const extraWarnings = ctx.stats.warnings.filter((w) => !text.includes(w));
            if (extraWarnings.length) text += `\n${extraWarnings.map((w) => `# warning: ${w}`).join('\n')}`;
            // Text only: clients that support structuredContent show it instead of the text, so an envelope without the rows hides the data.
            return { content: [{ type: 'text' as const, text }] };
        } catch (err) {
            const te = err instanceof ToolError ? err : new ToolError('upstream_error', 'The request failed unexpectedly');
            if (!(err instanceof ToolError)) console.error(`[mcp] ${def.name} failed:`, err instanceof Error ? err.message : err);
            status = `error:${te.code}`;
            const text = (principal.demo ? '[DEMO DATA] ' : '') + ctx.san.text(errorText(te), 600, { pii: false });
            return { content: [{ type: 'text' as const, text }], isError: true };
        } finally {
            releaseToken?.();
            releaseUser?.();
            recordAudit({
                ts: Math.floor(started / 1000),
                user_id: principal.userId,
                grant_id: principal.grantId,
                token_id: principal.tokenId,
                client_id: principal.clientId,
                tool: def.name,
                site_host: ctx.auditSite ?? null,
                status,
                duration_ms: Date.now() - started,
                rows,
                cache_hit: ctx.stats.googleCalls === 0 && ctx.stats.cacheHits > 0,
                google_calls: ctx.stats.googleCalls,
                ip_prefix: ipPrefix,
            });
        }
    }) as never);
}
