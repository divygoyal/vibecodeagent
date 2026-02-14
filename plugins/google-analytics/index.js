const { google } = require('googleapis');

class GoogleAnalytics {
    constructor(config) {
        console.log("Google Analytics Plugin Initializing...");
        this.config = config || {};

        // Try to load token from environment if not passed in config
        if (!this.config.access_token) {
            try {
                if (process.env.OPENCLAW_CONNECTIONS) {
                    const connections = JSON.parse(process.env.OPENCLAW_CONNECTIONS);
                    if (connections.google) {
                        this.config.access_token = connections.google.accessToken || connections.google.access_token;
                        this.config.refresh_token = connections.google.refreshToken || connections.google.refresh_token;
                        console.log("Found Google credentials in environment.");
                    }
                }
            } catch (e) {
                console.error("Failed to parse OPENCLAW_CONNECTIONS", e);
            }
        }
    }

    async _getAuth() {
        if (!this.config.access_token && !this.config.refresh_token) {
            throw new Error("No Google credentials found. Please connect your Google account in the dashboard.");
        }
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment");
        }

        const auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials({
            access_token: this.config.access_token,
            refresh_token: this.config.refresh_token
        });

        try {
            const { token } = await auth.getAccessToken();
            if (token) {
                auth.setCredentials({ access_token: token });
            }
        } catch (e) {
            console.error("Failed to refresh Google token:", e.message);
            throw new Error(`Google authentication failed: ${e.message}. Please reconnect in dashboard.`);
        }

        return auth;
    }

    /**
     * List all GA4 properties accessible by the user.
     */
    async listProperties(asJson = false) {
        console.log("Listing GA4 properties...");
        try {
            const auth = await this._getAuth();
            const analytics = google.analyticsadmin({ version: 'v1beta', auth });
            const res = await analytics.accountSummaries.list();

            if (asJson) {
                const properties = [];
                if (res.data.accountSummaries) {
                    for (const account of res.data.accountSummaries) {
                        if (account.propertySummaries) {
                            for (const prop of account.propertySummaries) {
                                properties.push({
                                    displayName: prop.displayName,
                                    property: prop.property,
                                    parent: prop.parent
                                });
                            }
                        }
                    }
                }
                return properties;
            }

            if (!res.data.accountSummaries || res.data.accountSummaries.length === 0) {
                return "No Google Analytics accounts found.";
            }

            let output = "Found Google Analytics Properties:\n";
            let found = false;
            for (const account of res.data.accountSummaries) {
                if (account.propertySummaries) {
                    for (const prop of account.propertySummaries) {
                        output += `- **${prop.displayName}** (ID: \`${prop.property}\`)\n`;
                        found = true;
                    }
                }
            }

            if (!found) return "No properties found in your Google Analytics account.";
            return output;
        } catch (error) {
            console.error(error);
            return `Error listing properties: ${error.message}`;
        }
    }

    /**
     * Flexible query — run ANY GA4 Data API report with arbitrary dimensions, metrics, filters, etc.
     * @param {string} propertyId The GA4 property ID (e.g., 'properties/123456789' or just '123456789')
     * @param {object} options Query options
     * @param {string[]} [options.dimensions] Array of dimension names (e.g., ['date', 'country', 'deviceCategory'])
     * @param {string[]} [options.metrics] Array of metric names (e.g., ['activeUsers', 'sessions', 'bounceRate'])
     * @param {string} [options.startDate='28daysAgo'] Start date
     * @param {string} [options.endDate='today'] End date
     * @param {number} [options.limit=100] Max rows to return
     * @param {string} [options.orderBy] Metric or dimension name to sort by
     * @param {string} [options.orderDirection='desc'] Sort direction ('asc' or 'desc')
     * @param {object[]} [options.dimensionFilter] Dimension filter object for the GA4 API
     * @param {object[]} [options.metricFilter] Metric filter object for the GA4 API
     */
    async query(propertyId, options = {}) {
        const {
            dimensions = ['date'],
            metrics = ['activeUsers', 'sessions'],
            startDate = '28daysAgo',
            endDate = 'today',
            limit = 100,
            orderBy,
            orderDirection = 'desc',
            dimensionFilter,
            metricFilter,
        } = options;

        let cleanPropertyId = propertyId;
        if (!cleanPropertyId.startsWith('properties/')) {
            if (/^\d+$/.test(cleanPropertyId)) {
                cleanPropertyId = `properties/${cleanPropertyId}`;
            }
        }

        console.log(`Running GA4 query on ${cleanPropertyId}...`);
        console.log(`  Dimensions: ${dimensions.join(', ')}`);
        console.log(`  Metrics: ${metrics.join(', ')}`);
        console.log(`  Date range: ${startDate} to ${endDate}`);

        try {
            const auth = await this._getAuth();
            const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

            const requestBody = {
                dateRanges: [{ startDate, endDate }],
                metrics: metrics.map(m => ({ name: m })),
                dimensions: dimensions.map(d => ({ name: d })),
                limit: parseInt(limit, 10),
            };

            // Add ordering
            if (orderBy) {
                const isMetric = metrics.includes(orderBy);
                requestBody.orderBys = [{
                    ...(isMetric
                        ? { metric: { metricName: orderBy } }
                        : { dimension: { dimensionName: orderBy } }),
                    desc: orderDirection === 'desc'
                }];
            }

            // Add dimension filter
            if (dimensionFilter) {
                requestBody.dimensionFilter = dimensionFilter;
            }

            // Add metric filter
            if (metricFilter) {
                requestBody.metricFilter = metricFilter;
            }

            const response = await analyticsData.properties.runReport({
                property: cleanPropertyId,
                requestBody,
            });

            if (!response.data.rows || response.data.rows.length === 0) {
                return `No data found for ${cleanPropertyId} between ${startDate} and ${endDate}.`;
            }

            // Build markdown table dynamically based on actual dimensions and metrics
            let output = `### GA4 Report for ${cleanPropertyId}\n`;
            output += `**Period:** ${startDate} to ${endDate}\n`;
            output += `**Rows:** ${response.data.rows.length}`;
            if (response.data.rowCount) output += ` of ${response.data.rowCount} total`;
            output += `\n\n`;

            // Table header
            const headers = [...dimensions, ...metrics];
            output += `| ${headers.join(' | ')} |\n`;
            output += `|${headers.map(() => '---').join('|')}|\n`;

            // Table rows
            for (const row of response.data.rows) {
                const values = [];
                // Dimension values
                row.dimensionValues.forEach((dv, i) => {
                    let val = dv.value;
                    // Format date dimensions (YYYYMMDD -> YYYY-MM-DD)
                    if (dimensions[i] === 'date' && /^\d{8}$/.test(val)) {
                        val = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
                    }
                    values.push(val);
                });
                // Metric values
                row.metricValues.forEach((mv, i) => {
                    let val = mv.value;
                    // Format percentages and decimals nicely
                    const metricName = metrics[i].toLowerCase();
                    if (metricName.includes('rate') || metricName.includes('percentage')) {
                        val = (parseFloat(val) * 100).toFixed(1) + '%';
                    } else if (val.includes('.')) {
                        val = parseFloat(val).toFixed(2);
                    }
                    values.push(val);
                });
                output += `| ${values.join(' | ')} |\n`;
            }

            // Add totals if available
            if (response.data.totals && response.data.totals.length > 0) {
                output += `\n**Totals:** `;
                const totalParts = [];
                response.data.totals[0].metricValues.forEach((mv, i) => {
                    totalParts.push(`${metrics[i]}: ${mv.value}`);
                });
                output += totalParts.join(', ');
                output += '\n';
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error running query: ${error.message}`;
        }
    }

    /**
     * List all available dimensions and metrics for GA4.
     * Useful for the bot to discover what it can query.
     */
    async listMetrics(propertyId) {
        let cleanPropertyId = propertyId;
        if (!cleanPropertyId.startsWith('properties/')) {
            if (/^\d+$/.test(cleanPropertyId)) {
                cleanPropertyId = `properties/${cleanPropertyId}`;
            }
        }

        console.log(`Listing available metrics/dimensions for ${cleanPropertyId}...`);
        try {
            const auth = await this._getAuth();
            const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

            const res = await analyticsData.properties.getMetadata({
                name: `${cleanPropertyId}/metadata`,
            });

            let output = `### Available Dimensions & Metrics for ${cleanPropertyId}\n\n`;

            output += `#### Dimensions (${res.data.dimensions.length})\n`;
            for (const dim of res.data.dimensions.slice(0, 50)) {
                output += `- \`${dim.apiName}\` — ${dim.uiName || dim.description || ''}\n`;
            }
            if (res.data.dimensions.length > 50) {
                output += `\n... and ${res.data.dimensions.length - 50} more dimensions\n`;
            }

            output += `\n#### Metrics (${res.data.metrics.length})\n`;
            for (const met of res.data.metrics.slice(0, 50)) {
                output += `- \`${met.apiName}\` — ${met.uiName || met.description || ''}\n`;
            }
            if (res.data.metrics.length > 50) {
                output += `\n... and ${res.data.metrics.length - 50} more metrics\n`;
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error listing metrics: ${error.message}`;
        }
    }

    /**
     * Dashboard JSON — returns all structured data the frontend dashboard needs in one call.
     */
    async dashboardJson(propertyId, range = '30d') {
        const result = { kpis: null, traffic: [], sources: [], pages: [], devices: [], countries: [] };

        let cleanPropertyId = propertyId;
        if (!cleanPropertyId.startsWith('properties/')) {
            if (/^\d+$/.test(cleanPropertyId)) {
                cleanPropertyId = `properties/${cleanPropertyId}`;
            }
        }

        const rangeMap = { '7d': '7daysAgo', '30d': '28daysAgo', '90d': '90daysAgo' };
        const startDate = rangeMap[range] || '28daysAgo';
        const prevRangeMap = { '7d': '14daysAgo', '30d': '56daysAgo', '90d': '180daysAgo' };
        const prevStartDate = prevRangeMap[range] || '56daysAgo';
        const prevEndDateMap = { '7d': '8daysAgo', '30d': '29daysAgo', '90d': '91daysAgo' };
        const prevEndDate = prevEndDateMap[range] || '29daysAgo';

        let auth, analyticsData;
        try {
            auth = await this._getAuth();
            analyticsData = google.analyticsdata({ version: 'v1beta', auth });
        } catch (e) {
            console.error("Authentication failed:", e.message);
            return result;
        }

        const runReport = async (dims, mets, start, end, limit = 100, orderBy = null) => {
            const requestBody = {
                dateRanges: [{ startDate: start, endDate: end }],
                metrics: mets.map(m => ({ name: m })),
                dimensions: dims.map(d => ({ name: d })),
                limit,
            };
            if (orderBy) {
                requestBody.orderBys = [{ metric: { metricName: orderBy }, desc: true }];
            }
            const res = await analyticsData.properties.runReport({ property: cleanPropertyId, requestBody });
            return res.data;
        };

        try {
            const [currentTotals, prevTotals] = await Promise.all([
                runReport(['date'], ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'], startDate, 'today', 1000),
                runReport(['date'], ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate'], prevStartDate, prevEndDate, 1000),
            ]);

            let totalUsers = 0, totalSessions = 0, totalPageViews = 0;
            let totalBounce = 0, totalDuration = 0, totalNewUsers = 0, rowCount = 0;

            if (currentTotals.rows) {
                for (const row of currentTotals.rows) {
                    const mv = row.metricValues;
                    totalUsers += parseInt(mv[0].value) || 0;
                    totalSessions += parseInt(mv[1].value) || 0;
                    totalPageViews += parseInt(mv[2].value) || 0;
                    totalBounce += parseFloat(mv[3].value) || 0;
                    totalDuration += parseFloat(mv[4].value) || 0;
                    totalNewUsers += parseInt(mv[5].value) || 0;
                    rowCount++;

                    const dateRaw = row.dimensionValues[0].value;
                    const date = dateRaw.length === 8
                        ? `${dateRaw.substring(0, 4)}-${dateRaw.substring(4, 6)}-${dateRaw.substring(6, 8)}`
                        : dateRaw;
                    result.traffic.push({
                        date,
                        activeUsers: parseInt(mv[0].value) || 0,
                        sessions: parseInt(mv[1].value) || 0,
                        pageViews: parseInt(mv[2].value) || 0,
                        bounceRate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
                    });
                }
            }

            let prevUsers = 0, prevSessions = 0, prevPageViews = 0, prevBounce = 0, prevRows = 0;
            if (prevTotals.rows) {
                for (const row of prevTotals.rows) {
                    const mv = row.metricValues;
                    prevUsers += parseInt(mv[0].value) || 0;
                    prevSessions += parseInt(mv[1].value) || 0;
                    prevPageViews += parseInt(mv[2].value) || 0;
                    prevBounce += parseFloat(mv[3].value) || 0;
                    prevRows++;
                }
            }

            const pctChange = (cur, prev) => prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0;
            const avgBounce = rowCount > 0 ? (totalBounce / rowCount) * 100 : 0;
            const prevAvgBounce = prevRows > 0 ? (prevBounce / prevRows) * 100 : 0;

            result.kpis = {
                totalUsers,
                totalSessions,
                totalPageViews,
                avgBounceRate: +avgBounce.toFixed(1),
                avgSessionDuration: rowCount > 0 ? Math.round(totalDuration / rowCount) : 0,
                newUsers: totalNewUsers,
                returningUsers: totalUsers - totalNewUsers,
                pagesPerSession: totalSessions > 0 ? +(totalPageViews / totalSessions).toFixed(1) : 0,
                changeUsers: pctChange(totalUsers, prevUsers),
                changeSessions: pctChange(totalSessions, prevSessions),
                changePageViews: pctChange(totalPageViews, prevPageViews),
                changeBounceRate: prevAvgBounce > 0 ? +(avgBounce - prevAvgBounce).toFixed(1) : 0,
            };

            result.traffic.sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) {
            console.error("Error fetching traffic/KPIs:", e.message);
        }

        try {
            const sourcesData = await runReport(
                ['sessionSource', 'sessionMedium'],
                ['sessions'],
                startDate, 'today', 20,
                'sessions'
            );
            if (sourcesData.rows) {
                let total = 0;
                const raw = sourcesData.rows.map(row => {
                    const sessions = parseInt(row.metricValues[0].value) || 0;
                    total += sessions;
                    return {
                        source: `${row.dimensionValues[0].value} / ${row.dimensionValues[1].value}`,
                        sessions,
                    };
                });
                result.sources = raw.map(r => ({
                    ...r,
                    percentage: total > 0 ? +((r.sessions / total) * 100).toFixed(1) : 0,
                }));
            }
        } catch (e) {
            console.error("Error fetching sources:", e.message);
        }

        try {
            const pagesData = await runReport(
                ['pagePath', 'pageTitle'],
                ['screenPageViews', 'averageSessionDuration', 'bounceRate'],
                startDate, 'today', 10,
                'screenPageViews'
            );
            if (pagesData.rows) {
                result.pages = pagesData.rows.map(row => {
                    const views = parseInt(row.metricValues[0].value) || 0;
                    const avgSec = parseFloat(row.metricValues[1].value) || 0;
                    const m = Math.floor(avgSec / 60);
                    const s = Math.round(avgSec % 60);
                    return {
                        page: row.dimensionValues[0].value,
                        title: row.dimensionValues[1].value || row.dimensionValues[0].value,
                        views,
                        uniqueViews: Math.round(views * 0.8),
                        avgTime: `${m}:${s.toString().padStart(2, '0')}`,
                        bounceRate: +((parseFloat(row.metricValues[2].value) || 0) * 100).toFixed(1),
                    };
                });
            }
        } catch (e) {
            console.error("Error fetching pages:", e.message);
        }

        try {
            const devicesData = await runReport(
                ['deviceCategory'],
                ['sessions'],
                startDate, 'today', 10,
                'sessions'
            );
            if (devicesData.rows) {
                let total = 0;
                const raw = devicesData.rows.map(row => {
                    const sessions = parseInt(row.metricValues[0].value) || 0;
                    total += sessions;
                    const name = row.dimensionValues[0].value;
                    return { device: name.charAt(0).toUpperCase() + name.slice(1), sessions };
                });
                result.devices = raw.map(r => ({
                    ...r,
                    percentage: total > 0 ? +((r.sessions / total) * 100).toFixed(1) : 0,
                }));
            }
        } catch (e) {
            console.error("Error fetching devices:", e.message);
        }

        try {
            const countriesData = await runReport(
                ['country'],
                ['activeUsers'],
                startDate, 'today', 10,
                'activeUsers'
            );
            if (countriesData.rows) {
                let total = 0;
                const raw = countriesData.rows.map(row => {
                    const users = parseInt(row.metricValues[0].value) || 0;
                    total += users;
                    return { country: row.dimensionValues[0].value, users };
                });
                result.countries = raw.map(r => ({
                    ...r,
                    percentage: total > 0 ? +((r.users / total) * 100).toFixed(1) : 0,
                }));
            }
        } catch (e) {
            console.error("Error fetching countries:", e.message);
        }

        return result;
    }

    /**
     * Get realtime report for a property.
     */
    async realtime(propertyId, options = {}) {
        const {
            dimensions = [],
            metrics = ['activeUsers'],
            limit = 100,
        } = options;

        let cleanPropertyId = propertyId;
        if (!cleanPropertyId.startsWith('properties/')) {
            if (/^\d+$/.test(cleanPropertyId)) {
                cleanPropertyId = `properties/${cleanPropertyId}`;
            }
        }

        console.log(`Fetching realtime report for ${cleanPropertyId}...`);
        try {
            const auth = await this._getAuth();
            const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

            const requestBody = {
                metrics: metrics.map(m => ({ name: m })),
                limit: parseInt(limit, 10),
            };
            if (dimensions.length > 0) {
                requestBody.dimensions = dimensions.map(d => ({ name: d }));
            }

            const response = await analyticsData.properties.runRealtimeReport({
                property: cleanPropertyId,
                requestBody,
            });

            if (!response.data.rows || response.data.rows.length === 0) {
                return `No realtime data for ${cleanPropertyId}. (0 active users right now)`;
            }

            let output = `### Realtime Report for ${cleanPropertyId}\n\n`;

            if (dimensions.length === 0) {
                // Simple single-row output
                const vals = response.data.rows[0].metricValues.map((mv, i) => `${metrics[i]}: **${mv.value}**`);
                output += vals.join(', ') + '\n';
            } else {
                // Table output
                const headers = [...dimensions, ...metrics];
                output += `| ${headers.join(' | ')} |\n`;
                output += `|${headers.map(() => '---').join('|')}|\n`;

                for (const row of response.data.rows) {
                    const values = [
                        ...row.dimensionValues.map(dv => dv.value),
                        ...row.metricValues.map(mv => mv.value),
                    ];
                    output += `| ${values.join(' | ')} |\n`;
                }
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error fetching realtime: ${error.message}`;
        }
    }
}

// CLI Handling Logic
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const command = args[0];

        try {
            const plugin = new GoogleAnalytics();

            if (command === 'list-properties') {
                const options = {};
                for (let i = 1; i < args.length; i++) {
                    if (args[i].startsWith('--') && i + 1 < args.length) {
                        options[args[i].substring(2)] = args[i + 1];
                        i++;
                    }
                }
                const plugin = new GoogleAnalytics(options);
                console.log(await plugin.listProperties());

            } else if (command === 'list-properties-json') {
                const options = {};
                for (let i = 1; i < args.length; i++) {
                    if (args[i].startsWith('--') && i + 1 < args.length) {
                        options[args[i].substring(2)] = args[i + 1];
                        i++;
                    }
                }
                const plugin = new GoogleAnalytics(options);
                try {
                    const props = await plugin.listProperties(true);
                    console.log(JSON.stringify(props));
                } catch (e) {
                    console.log(JSON.stringify({ error: e.message }));
                }

            } else if (command === 'list-metrics') {
                const propertyId = args[1];
                if (!propertyId) { console.error("Error: propertyId required"); process.exit(1); }
                console.log(await plugin.listMetrics(propertyId));

            } else if (command === 'query') {
                const propertyId = args[1];
                if (!propertyId) { console.error("Error: propertyId required"); process.exit(1); }

                // Parse CLI options: --dimensions date,country --metrics activeUsers,sessions --startDate 30daysAgo ...
                const options = {};
                for (let i = 2; i < args.length; i++) {
                    const arg = args[i];
                    if (arg.startsWith('--') && i + 1 < args.length) {
                        const key = arg.substring(2);
                        const value = args[++i];
                        if (key === 'dimensions' || key === 'metrics') {
                            options[key] = value.split(',');
                        } else if (key === 'limit') {
                            options[key] = parseInt(value, 10);
                        } else if (key === 'dimensionFilter' || key === 'metricFilter') {
                            options[key] = JSON.parse(value);
                        } else {
                            options[key] = value;
                        }
                    }
                }
                console.log(await plugin.query(propertyId, options));

            } else if (command === 'realtime') {
                const propertyId = args[1];
                if (!propertyId) { console.error("Error: propertyId required"); process.exit(1); }

                const options = {};
                for (let i = 2; i < args.length; i++) {
                    const arg = args[i];
                    if (arg.startsWith('--') && i + 1 < args.length) {
                        const key = arg.substring(2);
                        const value = args[++i];
                        if (key === 'dimensions' || key === 'metrics') {
                            options[key] = value.split(',');
                        } else if (key === 'limit') {
                            options[key] = parseInt(value, 10);
                        } else {
                            options[key] = value;
                        }
                    }
                }
                const plugin = new GoogleAnalytics(options); // Pass options (incl. accessToken) to constructor
                console.log(await plugin.realtime(propertyId, options));

            } else if (command === 'dashboard-json') {
                const propertyId = args[1];
                if (!propertyId) { console.error("Error: propertyId required"); process.exit(1); }

                // Parse options specifically for dashboard-json to catch auth tokens
                const options = {};
                for (let i = 2; i < args.length; i++) {
                    if (args[i].startsWith('--') && i + 1 < args.length) {
                        options[args[i].substring(2)] = args[i + 1];
                        i++;
                    }
                }

                const range = args[2] && !args[2].startsWith('--') ? args[2] : '30d'; // Handle positional range if present,
                const plugin = new GoogleAnalytics(options); // Pass options (incl. accessToken) to constructor
                try {
                    const result = await plugin.dashboardJson(propertyId, range);
                    console.log(JSON.stringify(result));
                } catch (e) {
                    console.log(JSON.stringify({ error: e.message }));
                }

            } else if (command === 'get-report') {
                // Legacy shortcut
                const propertyId = args[1];
                if (!propertyId) { console.error("Error: propertyId required"); process.exit(1); }
                console.log(await plugin.query(propertyId, {
                    dimensions: ['date'],
                    metrics: ['activeUsers', 'sessions'],
                    startDate: args[2] || '7daysAgo',
                    endDate: args[3] || 'today'
                }));

            } else {
                console.log(`Google Analytics Plugin — Commands:

  list-properties                           List all GA4 properties
  list-metrics <propertyId>                 List all available dimensions & metrics
  query <propertyId> [options]              Run a flexible report with any dimensions/metrics
  realtime <propertyId> [options]           Get realtime active users and breakdown
  get-report <propertyId> [start] [end]     Quick traffic report (legacy shortcut)

Query Options (use with 'query' or 'realtime'):
  --dimensions date,country,deviceCategory  Comma-separated dimension names
  --metrics activeUsers,sessions,bounceRate Comma-separated metric names
  --startDate 30daysAgo                     Start date (YYYY-MM-DD or relative)
  --endDate today                           End date (YYYY-MM-DD or relative)
  --limit 100                               Max rows to return
  --orderBy activeUsers                     Sort by this dimension or metric
  --orderDirection desc                     Sort direction (asc or desc)

Common Dimensions: date, country, city, deviceCategory, browser, operatingSystem,
  pagePath, pageTitle, sessionSource, sessionMedium, sessionCampaignName,
  newVsReturning, language, continent

Common Metrics: activeUsers, sessions, screenPageViews, bounceRate,
  averageSessionDuration, conversions, totalRevenue, engagedSessions,
  engagementRate, eventCount, newUsers, dauPerMau, wauPerMau

Examples:
  query 123456789 --dimensions country --metrics activeUsers,sessions --startDate 30daysAgo
  query 123456789 --dimensions pagePath --metrics screenPageViews --orderBy screenPageViews --limit 20
  query 123456789 --dimensions deviceCategory,browser --metrics sessions,bounceRate
  realtime 123456789 --dimensions country --metrics activeUsers`);
            }
        } catch (error) {
            console.error("Error:", error.message);
            process.exit(1);
        }
    })();
}

module.exports = GoogleAnalytics;
