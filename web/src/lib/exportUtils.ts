/**
 * Export Utility — Client-side CSV/JSON/ZIP generation and download.
 */

import JSZip from 'jszip';

type Row = Record<string, string | number | boolean | null | undefined>;

/**
 * Export data as JSON file.
 */
export function exportToJSON(data: unknown, filename: string) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

/**
 * Convert an array of objects to CSV string and trigger download.
 */
export function exportToCSV(data: Row[], filename: string, columns?: { key: string; label: string }[]) {
    if (data.length === 0) return;

    // Determine columns
    const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }));

    // Header row
    const header = cols.map(c => `"${c.label}"`).join(',');

    // Data rows
    const rows = data.map(row =>
        cols.map(c => {
            const val = row[c.key];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') {
                // Strip control characters that can break CSV parsers, keep newlines
                const clean = val.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');
                return `"${clean.replace(/"/g, '""')}"`;
            }
            return String(val);
        }).join(',')
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

/**
 * Export Analytics data to CSV.
 */
export function exportAnalyticsData(data: any) {
    if (!data) return;

    // Traffic data
    if (data.traffic?.length > 0) {
        exportToCSV(data.traffic, 'analytics-traffic', [
            { key: 'date', label: 'Date' },
            { key: 'users', label: 'Users' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'pageViews', label: 'Page Views' },
        ]);
    }

    // Sources
    if (data.sources?.length > 0) {
        exportToCSV(data.sources, 'analytics-sources', [
            { key: 'source', label: 'Source / Medium' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'percentage', label: 'Percentage (%)' },
        ]);
    }

    // Pages
    if (data.pages?.length > 0) {
        exportToCSV(data.pages, 'analytics-pages', [
            { key: 'path', label: 'Page Path' },
            { key: 'views', label: 'Views' },
            { key: 'avgTime', label: 'Avg Time' },
        ]);
    }
}

/**
 * Export Analytics data as a ZIP containing multiple CSVs.
 */
export async function exportAnalyticsZip(data: any) {
    const zip = new JSZip();

    // Overview CSV
    const kpis = data.kpis;
    if (kpis) {
        const overviewCsv = [
            'Metric,Value,Change %',
            `Users,${kpis.totalUsers},${kpis.changeUsers}%`,
            `Sessions,${kpis.totalSessions},${kpis.changeSessions}%`,
            `Page Views,${kpis.totalPageViews},${kpis.changePageViews}%`,
            `Bounce Rate,${kpis.avgBounceRate}%,${kpis.changeBounceRate}%`,
            `Avg Duration,${kpis.avgSessionDuration}s,`,
            `Pages/Session,${kpis.pagesPerSession},`,
        ].join('\n');
        zip.file('overview.csv', '\uFEFF' + overviewCsv);
    }

    // Traffic CSV (daily)
    if (data.traffic?.length) {
        const header = 'Date,Users,Sessions,Page Views,Bounce Rate,Avg Duration';
        const rows = data.traffic.map((d: any) =>
            `${d.date},${d.activeUsers},${d.sessions},${d.pageViews},${d.bounceRate},${d.avgSessionDuration}`
        );
        zip.file('traffic.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Pages CSV
    if (data.pages?.length) {
        const header = 'Page,Views,Bounce Rate';
        const rows = data.pages.map((p: any) => `"${p.page}",${p.views},${p.bounceRate}`);
        zip.file('pages.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Referrers CSV
    if (data.referrers?.length) {
        const header = 'Source,Sessions';
        const rows = data.referrers.map((r: any) => `"${r.name}",${r.value}`);
        zip.file('referrers.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Countries CSV
    if (data.countries?.length) {
        const header = 'Country,Users';
        const rows = data.countries.map((c: any) => `"${c.country}",${c.users}`);
        zip.file('countries.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Devices CSV
    if (data.devices?.length) {
        const header = 'Device,Sessions,Percentage';
        const rows = data.devices.map((d: any) => `${d.device},${d.sessions},${d.percentage}%`);
        zip.file('devices.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Browsers CSV
    if (data.browsers?.length) {
        const header = 'Browser,Sessions,Percentage';
        const rows = data.browsers.map((b: any) => `"${b.name}",${b.value},${b.percentage}%`);
        zip.file('browsers.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // Channels CSV
    if (data.channels?.length) {
        const header = 'Channel,Sessions,Percentage';
        const rows = data.channels.map((c: any) => `"${c.name}",${c.value},${c.percentage}%`);
        zip.file('channels.csv', '\uFEFF' + [header, ...rows].join('\n'));
    }

    // README
    zip.file('README.txt', `TrafficClaw Analytics Export\nGenerated: ${new Date().toISOString()}\n\nFiles:\n- overview.csv: KPI summary\n- traffic.csv: Daily traffic data\n- pages.csv: Top pages\n- referrers.csv: Traffic sources\n- countries.csv: Geographic breakdown\n- devices.csv: Device breakdown\n- browsers.csv: Browser breakdown\n- channels.csv: Channel breakdown\n`);

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trafficclaw-export-${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export SEO data to CSV.
 */
export function exportSeoData(data: any) {
    if (!data) return;

    // Queries
    if (data.queries?.length > 0) {
        exportToCSV(data.queries, 'seo-queries', [
            { key: 'query', label: 'Search Query' },
            { key: 'clicks', label: 'Clicks' },
            { key: 'impressions', label: 'Impressions' },
            { key: 'ctr', label: 'CTR (%)' },
            { key: 'position', label: 'Avg Position' },
        ]);
    }

    // Pages
    if (data.pages?.length > 0) {
        exportToCSV(data.pages, 'seo-pages', [
            { key: 'page', label: 'Page URL' },
            { key: 'clicks', label: 'Clicks' },
            { key: 'impressions', label: 'Impressions' },
            { key: 'ctr', label: 'CTR (%)' },
            { key: 'position', label: 'Avg Position' },
        ]);
    }

    // Trend
    if (data.trend?.length > 0) {
        exportToCSV(data.trend, 'seo-trend', [
            { key: 'date', label: 'Date' },
            { key: 'clicks', label: 'Clicks' },
            { key: 'impressions', label: 'Impressions' },
        ]);
    }
}
