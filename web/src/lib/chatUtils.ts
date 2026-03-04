import type { DashboardSnapshot } from '@/components/chat/SnapshotChartRenderer';
import type { StructuredToolResult } from '@/components/chat/ChatCharts';

/**
 * Build a DashboardSnapshot from analytics + SEO data for chart rendering.
 */
export function buildSnapshot(analytics: any, seo: any): DashboardSnapshot | undefined {
    if (!analytics && !seo) return undefined;

    return {
        kpis: {
            ...(analytics?.kpis || {}),
            ...(seo?.kpis || {}),
        },
        topQueries: (seo?.queries || []).slice(0, 15).map((q: any) => ({
            query: q.query,
            clicks: q.clicks || 0,
            impressions: q.impressions || 0,
            ctr: typeof q.ctr === 'number' ? (q.ctr > 1 ? q.ctr : q.ctr * 100) : parseFloat(q.ctr) || 0,
            position: parseFloat(q.position) || 0,
        })),
        topPages: (seo?.pages || []).slice(0, 10).map((p: any) => ({
            page: p.page,
            clicks: p.clicks || 0,
            impressions: p.impressions || 0,
            ctr: typeof p.ctr === 'number' ? (p.ctr > 1 ? p.ctr : p.ctr * 100) : parseFloat(p.ctr) || 0,
            position: parseFloat(p.position) || 0,
        })),
        devices: analytics?.devices || [],
        countries: (analytics?.countries || []).map((c: any) => ({
            country: c.country || c.name,
            clicks: c.sessions || c.clicks || c.value || 0,
        })),
        dateTrend: (analytics?.traffic || []).map((t: any) => ({
            date: t.date,
            clicks: t.activeUsers || t.clicks || 0,
            impressions: t.sessions || t.impressions || 0,
        })),
        sources: analytics?.sources || [],
    };
}

/**
 * Parse a tool result string (CSV or JSON) into a StructuredToolResult for SmartChartPanel.
 * Tool results come from the SSE stream as either pre-structured data or a stringified object.
 */
export function safeParseToolResult(result: string | any): StructuredToolResult | null {
    if (!result) return null;

    // Already structured (from structuredData field)
    if (typeof result === 'object' && result.dimensions && Array.isArray(result.rows)) {
        return result as StructuredToolResult;
    }

    // Try to parse stringified JSON
    let parsed = result;
    if (typeof result === 'string') {
        try { parsed = JSON.parse(result); } catch { /* not JSON */ }
    }

    if (typeof parsed === 'object' && parsed !== null) {
        // Handle tool result shape: { siteUrl, dimensions, csvData, ... }
        if (parsed.dimensions && parsed.csvData) {
            return parseCsvToolResult(parsed.dimensions, parsed.csvData);
        }
        // Already has rows
        if (parsed.dimensions && Array.isArray(parsed.rows)) {
            return parsed as StructuredToolResult;
        }
    }

    return null;
}

/**
 * Parse CSV data from get_search_performance tool result into structured format.
 */
function parseCsvToolResult(dimensions: string[], csvData: string): StructuredToolResult | null {
    if (!csvData || !dimensions?.length) return null;

    const lines = csvData.trim().split('\n');
    if (lines.length < 2) return null;

    const headers = lines[0].split(',');
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < headers.length) continue;
        const row: any = {};
        headers.forEach((h, j) => {
            const val = values[j]?.replace(/^"|"$/g, '') || '';
            if (['clicks', 'impressions', 'ctr', 'position'].includes(h)) {
                row[h] = parseFloat(val) || 0;
            } else {
                row[h] = val;
            }
        });
        rows.push(row);
    }

    return { dimensions, rows };
}

/** Simple CSV line parser handling quoted fields */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
