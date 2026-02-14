const { google } = require('googleapis');

class GoogleSearchConsole {
    constructor(config) {
        console.log("Google Search Console Plugin Initializing...");
        this.config = config || {};

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
     * List all verified sites in the user's Search Console.
     */
    async listSites(asJson = false) {
        console.log("Listing Search Console sites...");
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });
            const res = await searchconsole.sites.list();

            if (asJson) {
                return res.data.siteEntry || [];
            }

            if (!res.data.siteEntry || res.data.siteEntry.length === 0) {
                return "No sites found in your Google Search Console.";
            }

            let output = "Found Search Console Sites:\n";
            for (const site of res.data.siteEntry) {
                output += `- **${site.siteUrl}** (Permission: ${site.permissionLevel})\n`;
            }
            return output;
        } catch (error) {
            console.error(error);
            return `Error listing sites: ${error.message}`;
        }
    }

    /**
     * Flexible query — run ANY Search Console search analytics query.
     * @param {string} siteUrl The site URL (e.g., 'sc-domain:example.com')
     * @param {object} options Query options
     * @param {string[]} [options.dimensions] Array of dimensions: 'query', 'page', 'country', 'device', 'date', 'searchAppearance'
     * @param {string} [options.startDate] Start date (YYYY-MM-DD). Defaults to 28 days ago.
     * @param {string} [options.endDate] End date (YYYY-MM-DD). Defaults to today.
     * @param {number} [options.limit=100] Max rows to return (max 25000)
     * @param {number} [options.startRow=0] Starting row for pagination
     * @param {string} [options.type='web'] Search type: 'web', 'image', 'video', 'news', 'discover', 'googleNews'
     * @param {string} [options.aggregationType] 'auto', 'byProperty', 'byPage'
     * @param {string} [options.dataState] 'final' or 'all' (includes fresh/partial data)
     * @param {object[]} [options.filters] Array of dimension filters: [{dimension, operator, expression}]
     *   - dimension: 'query', 'page', 'country', 'device', 'searchAppearance'
     *   - operator: 'contains', 'equals', 'notContains', 'notEquals', 'includingRegex', 'excludingRegex'
     *   - expression: string value to match
     */
    async query(siteUrl, options = {}) {
        const {
            dimensions = ['query'],
            startDate,
            endDate,
            limit = 100,
            startRow = 0,
            type = 'web',
            aggregationType,
            dataState,
            filters = [],
        } = options;

        const effectiveStartDate = startDate || (() => {
            const d = new Date(); d.setDate(d.getDate() - 28);
            return d.toISOString().split('T')[0];
        })();
        const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

        console.log(`Running GSC query on ${siteUrl}...`);
        console.log(`  Dimensions: ${dimensions.join(', ')}`);
        console.log(`  Date range: ${effectiveStartDate} to ${effectiveEndDate}`);
        console.log(`  Type: ${type}, Limit: ${limit}`);
        if (filters.length > 0) console.log(`  Filters: ${JSON.stringify(filters)}`);

        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            const requestBody = {
                startDate: effectiveStartDate,
                endDate: effectiveEndDate,
                dimensions: dimensions,
                rowLimit: Math.min(parseInt(limit, 10), 25000),
                startRow: parseInt(startRow, 10),
                type: type,
            };

            if (aggregationType) requestBody.aggregationType = aggregationType;
            if (dataState) requestBody.dataState = dataState;

            // Build dimension filter group
            if (filters.length > 0) {
                requestBody.dimensionFilterGroups = [{
                    groupType: 'and',
                    filters: filters.map(f => ({
                        dimension: f.dimension,
                        operator: f.operator || 'contains',
                        expression: f.expression,
                    }))
                }];
            }

            const res = await searchconsole.searchanalytics.query({
                siteUrl: siteUrl,
                requestBody,
            });

            if (!res.data.rows || res.data.rows.length === 0) {
                return `No data found for ${siteUrl} between ${effectiveStartDate} and ${effectiveEndDate}.`;
            }

            let output = `### Search Console Report for ${siteUrl}\n`;
            output += `**Period:** ${effectiveStartDate} to ${effectiveEndDate}`;
            output += ` | **Type:** ${type}`;
            output += ` | **Rows:** ${res.data.rows.length}\n`;
            if (filters.length > 0) {
                output += `**Filters:** ${filters.map(f => `${f.dimension} ${f.operator || 'contains'} "${f.expression}"`).join(', ')}\n`;
            }
            output += '\n';

            // Table header
            const headers = [...dimensions, 'Clicks', 'Impressions', 'CTR', 'Avg Position'];
            output += `| ${headers.join(' | ')} |\n`;
            output += `|${headers.map(() => '---').join('|')}|\n`;

            // Table rows
            for (const row of res.data.rows) {
                const values = [
                    ...row.keys,
                    row.clicks || 0,
                    row.impressions || 0,
                    ((row.ctr || 0) * 100).toFixed(1) + '%',
                    (row.position || 0).toFixed(1),
                ];
                output += `| ${values.join(' | ')} |\n`;
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error running query: ${error.message}`;
        }
    }

    /**
     * List sitemaps for a site.
     */
    async listSitemaps(siteUrl) {
        console.log(`Listing sitemaps for ${siteUrl}...`);
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });
            const res = await searchconsole.sitemaps.list({ siteUrl });

            if (!res.data.sitemap || res.data.sitemap.length === 0) {
                return `No sitemaps found for ${siteUrl}.`;
            }

            let output = `### Sitemaps for ${siteUrl}\n\n`;
            output += "| Sitemap | Type | Last Submitted | Last Downloaded | URLs |\n";
            output += "|---|---|---|---|---|\n";

            for (const sm of res.data.sitemap) {
                const urls = sm.contents
                    ? sm.contents.reduce((sum, c) => sum + (parseInt(c.submitted, 10) || 0), 0)
                    : 'N/A';
                output += `| ${sm.path || 'N/A'} | ${sm.type || 'N/A'} | ${(sm.lastSubmitted || '').split('T')[0] || 'N/A'} | ${(sm.lastDownloaded || '').split('T')[0] || 'N/A'} | ${urls} |\n`;
            }
            return output;
        } catch (error) {
            console.error(error);
            return `Error listing sitemaps: ${error.message}`;
        }
    }

    /**
     * Inspect a specific URL's index status.
     */
    async inspectUrl(siteUrl, inspectionUrl) {
        console.log(`Inspecting URL: ${inspectionUrl} on ${siteUrl}...`);
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            const res = await searchconsole.urlInspection.index.inspect({
                requestBody: {
                    inspectionUrl: inspectionUrl,
                    siteUrl: siteUrl,
                }
            });

            const result = res.data.inspectionResult;
            let output = `### URL Inspection: ${inspectionUrl}\n\n`;

            if (result.indexStatusResult) {
                const idx = result.indexStatusResult;
                output += `**Index Status:** ${idx.verdict || 'UNKNOWN'}\n`;
                output += `**Coverage State:** ${idx.coverageState || 'N/A'}\n`;
                output += `**Crawled As:** ${idx.crawledAs || 'N/A'}\n`;
                output += `**Indexing State:** ${idx.indexingState || 'N/A'}\n`;
                if (idx.lastCrawlTime) output += `**Last Crawled:** ${idx.lastCrawlTime}\n`;
                if (idx.pageFetchState) output += `**Page Fetch:** ${idx.pageFetchState}\n`;
                if (idx.robotsTxtState) output += `**Robots.txt:** ${idx.robotsTxtState}\n`;
            }

            if (result.mobileUsabilityResult) {
                output += `\n**Mobile Usability:** ${result.mobileUsabilityResult.verdict || 'N/A'}\n`;
            }

            if (result.richResultsResult) {
                output += `\n**Rich Results:** ${result.richResultsResult.verdict || 'N/A'}\n`;
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error inspecting URL: ${error.message}`;
        }
    }
}

// CLI Handling
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const command = args[0];

        // Helper to parse --key value CLI args
        function parseOptions(startIdx) {
            const options = {};
            for (let i = startIdx; i < args.length; i++) {
                const arg = args[i];
                if (arg.startsWith('--') && i + 1 < args.length) {
                    const key = arg.substring(2);
                    const value = args[++i];
                    if (key === 'dimensions') {
                        options[key] = value.split(',');
                    } else if (key === 'limit' || key === 'startRow') {
                        options[key] = parseInt(value, 10);
                    } else if (key === 'filters') {
                        options[key] = JSON.parse(value);
                    } else {
                        options[key] = value;
                    }
                }
            }
            return options;
        }

        try {
            const plugin = new GoogleSearchConsole();

            if (command === 'list-sites') {
                console.log(await plugin.listSites());

            } else if (command === 'query') {
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl required"); process.exit(1); }
                const options = parseOptions(2);
                console.log(await plugin.query(siteUrl, options));

            } else if (command === 'list-sitemaps') {
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl required"); process.exit(1); }
                console.log(await plugin.listSitemaps(siteUrl));

            } else if (command === 'inspect-url') {
                const siteUrl = args[1];
                const inspectionUrl = args[2];
                if (!siteUrl || !inspectionUrl) {
                    console.error("Error: siteUrl and inspectionUrl required");
                    process.exit(1);
                }
                console.log(await plugin.inspectUrl(siteUrl, inspectionUrl));

            } else if (command === 'get-performance') {
                // Legacy shortcut
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl required"); process.exit(1); }
                console.log(await plugin.query(siteUrl, {
                    dimensions: ['date'],
                    startDate: args[2],
                    endDate: args[3],
                }));

            } else if (command === 'get-top-queries') {
                // Legacy shortcut
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl required"); process.exit(1); }
                console.log(await plugin.query(siteUrl, {
                    dimensions: ['query'],
                    startDate: args[2],
                    limit: parseInt(args[3], 10) || 25,
                }));

            } else if (command === 'get-index-status') {
                // Legacy shortcut
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl required"); process.exit(1); }
                console.log(await plugin.listSitemaps(siteUrl));

            } else {
                console.log(`Google Search Console Plugin — Commands:

  list-sites                                        List all verified sites
  query <siteUrl> [options]                         Run a flexible search analytics query
  list-sitemaps <siteUrl>                           List sitemaps for a site
  inspect-url <siteUrl> <url>                       Inspect a URL's index status, mobile usability, rich results

  Legacy shortcuts (still work):
  get-performance <siteUrl> [start] [end]           Daily performance over time
  get-top-queries <siteUrl> [start] [limit]         Top queries by clicks
  get-index-status <siteUrl>                        Sitemap overview

Query Options (use with 'query'):
  --dimensions query,page,country,device,date       Comma-separated dimensions
  --startDate 2024-01-01                            Start date (YYYY-MM-DD)
  --endDate 2024-01-31                              End date (YYYY-MM-DD)
  --limit 100                                       Max rows (up to 25000)
  --startRow 0                                      Pagination offset
  --type web                                        Search type: web, image, video, news, discover, googleNews
  --aggregationType auto                            auto, byProperty, byPage
  --dataState all                                   final (default) or all (includes fresh data)
  --filters '[{"dimension":"query","operator":"contains","expression":"seo"}]'
                                                    JSON array of dimension filters

Filter Operators: contains, equals, notContains, notEquals, includingRegex, excludingRegex

Examples:
  query sc-domain:example.com --dimensions query --limit 50
  query sc-domain:example.com --dimensions page --limit 20 --type web
  query sc-domain:example.com --dimensions country,device --startDate 2024-01-01
  query sc-domain:example.com --dimensions query --filters '[{"dimension":"query","operator":"contains","expression":"seo"}]'
  query sc-domain:example.com --dimensions date --startDate 2024-01-01 --endDate 2024-01-31
  query sc-domain:example.com --dimensions page,query --limit 100 --aggregationType byPage
  inspect-url sc-domain:example.com https://example.com/my-page`);
            }
        } catch (error) {
            console.error("Error:", error.message);
            process.exit(1);
        }
    })();
}

module.exports = GoogleSearchConsole;
