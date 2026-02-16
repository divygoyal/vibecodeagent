/**
 * CSV Export Utility — Client-side CSV generation and download.
 */

type Row = Record<string, string | number | boolean | null | undefined>;

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
            if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
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
