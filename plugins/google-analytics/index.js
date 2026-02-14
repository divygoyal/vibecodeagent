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
                console.log(await plugin.listProperties());

            } else if (command === 'list-properties-json') {
                const props = await plugin.listProperties(true);
                console.log(JSON.stringify(props));

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
                console.log(await plugin.realtime(propertyId, options));

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
