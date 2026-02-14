const { google } = require('googleapis');

class GoogleSearchConsole {
    constructor(config) {
        console.log("Google Search Console Plugin Initializing...");
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

        // Proactively refresh token
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
     * @returns {Promise<string>} A list of sites with permission levels.
     */
    async listSites() {
        console.log("Listing Search Console sites...");
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            const res = await searchconsole.sites.list();

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
     * Get search performance report for a site.
     * @param {string} siteUrl The site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')
     * @param {string} [startDate] Start date (YYYY-MM-DD). Defaults to 28 days ago.
     * @param {string} [endDate] End date (YYYY-MM-DD). Defaults to today.
     * @returns {Promise<string>} A markdown table of search performance data.
     */
    async getPerformance(siteUrl, startDate, endDate) {
        if (!startDate) {
            const d = new Date();
            d.setDate(d.getDate() - 28);
            startDate = d.toISOString().split('T')[0];
        }
        if (!endDate) {
            endDate = new Date().toISOString().split('T')[0];
        }

        console.log(`Fetching performance for ${siteUrl} (${startDate} to ${endDate})...`);
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            const res = await searchconsole.searchanalytics.query({
                siteUrl: siteUrl,
                requestBody: {
                    startDate: startDate,
                    endDate: endDate,
                    dimensions: ['date'],
                    rowLimit: 50
                }
            });

            if (!res.data.rows || res.data.rows.length === 0) {
                return `No performance data found for ${siteUrl} between ${startDate} and ${endDate}.`;
            }

            let output = `### Search Performance for ${siteUrl}\n`;
            output += `**Period:** ${startDate} to ${endDate}\n\n`;
            output += "| Date | Clicks | Impressions | CTR | Avg Position |\n";
            output += "|---|---|---|---|---|\n";

            for (const row of res.data.rows) {
                const date = row.keys[0];
                const clicks = row.clicks || 0;
                const impressions = row.impressions || 0;
                const ctr = ((row.ctr || 0) * 100).toFixed(1) + '%';
                const position = (row.position || 0).toFixed(1);
                output += `| ${date} | ${clicks} | ${impressions} | ${ctr} | ${position} |\n`;
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error fetching performance: ${error.message}`;
        }
    }

    /**
     * Get top search queries for a site.
     * @param {string} siteUrl The site URL.
     * @param {string} [startDate] Start date (YYYY-MM-DD). Defaults to 28 days ago.
     * @param {number} [limit=25] Max queries to return.
     * @returns {Promise<string>} A markdown table of top queries.
     */
    async getTopQueries(siteUrl, startDate, limit = 25) {
        if (!startDate) {
            const d = new Date();
            d.setDate(d.getDate() - 28);
            startDate = d.toISOString().split('T')[0];
        }
        const endDate = new Date().toISOString().split('T')[0];

        console.log(`Fetching top ${limit} queries for ${siteUrl}...`);
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            const res = await searchconsole.searchanalytics.query({
                siteUrl: siteUrl,
                requestBody: {
                    startDate: startDate,
                    endDate: endDate,
                    dimensions: ['query'],
                    rowLimit: parseInt(limit, 10)
                }
            });

            if (!res.data.rows || res.data.rows.length === 0) {
                return `No query data found for ${siteUrl}.`;
            }

            let output = `### Top Queries for ${siteUrl}\n`;
            output += `**Period:** ${startDate} to ${endDate}\n\n`;
            output += "| # | Query | Clicks | Impressions | CTR | Avg Position |\n";
            output += "|---|---|---|---|---|---|\n";

            res.data.rows.forEach((row, i) => {
                const query = row.keys[0];
                const clicks = row.clicks || 0;
                const impressions = row.impressions || 0;
                const ctr = ((row.ctr || 0) * 100).toFixed(1) + '%';
                const position = (row.position || 0).toFixed(1);
                output += `| ${i + 1} | ${query} | ${clicks} | ${impressions} | ${ctr} | ${position} |\n`;
            });

            return output;
        } catch (error) {
            console.error(error);
            return `Error fetching queries: ${error.message}`;
        }
    }

    /**
     * Get index coverage status for a site.
     * @param {string} siteUrl The site URL.
     * @returns {Promise<string>} Summary of indexed pages.
     */
    async getIndexStatus(siteUrl) {
        console.log(`Fetching index status for ${siteUrl}...`);
        try {
            const auth = await this._getAuth();
            const searchconsole = google.searchconsole({ version: 'v1', auth });

            // Use sitemaps to get an overview of indexed content
            const res = await searchconsole.sitemaps.list({ siteUrl: siteUrl });

            if (!res.data.sitemap || res.data.sitemap.length === 0) {
                return `No sitemaps found for ${siteUrl}. Submit a sitemap in Google Search Console for better indexing.`;
            }

            let output = `### Index Status for ${siteUrl}\n\n`;
            output += "| Sitemap | Type | Submitted | Last Downloaded | URLs Submitted |\n";
            output += "|---|---|---|---|---|\n";

            for (const sitemap of res.data.sitemap) {
                const path = sitemap.path || 'N/A';
                const type = sitemap.type || 'N/A';
                const submitted = sitemap.lastSubmitted ? sitemap.lastSubmitted.split('T')[0] : 'N/A';
                const downloaded = sitemap.lastDownloaded ? sitemap.lastDownloaded.split('T')[0] : 'N/A';
                const urls = sitemap.contents
                    ? sitemap.contents.reduce((sum, c) => sum + (parseInt(c.submitted, 10) || 0), 0)
                    : 'N/A';
                output += `| ${path} | ${type} | ${submitted} | ${downloaded} | ${urls} |\n`;
            }

            return output;
        } catch (error) {
            console.error(error);
            return `Error fetching index status: ${error.message}`;
        }
    }
}

// CLI Handling
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const command = args[0];

        try {
            const plugin = new GoogleSearchConsole();

            if (command === 'list-sites') {
                const result = await plugin.listSites();
                console.log(result);
            } else if (command === 'get-performance') {
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl is required"); process.exit(1); }
                const result = await plugin.getPerformance(siteUrl, args[2], args[3]);
                console.log(result);
            } else if (command === 'get-top-queries') {
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl is required"); process.exit(1); }
                const result = await plugin.getTopQueries(siteUrl, args[2], args[3]);
                console.log(result);
            } else if (command === 'get-index-status') {
                const siteUrl = args[1];
                if (!siteUrl) { console.error("Error: siteUrl is required"); process.exit(1); }
                const result = await plugin.getIndexStatus(siteUrl);
                console.log(result);
            } else {
                console.error("Unknown command. Available: list-sites, get-performance, get-top-queries, get-index-status");
                process.exit(1);
            }
        } catch (error) {
            console.error("Error running command:", error.message);
            process.exit(1);
        }
    })();
}

module.exports = GoogleSearchConsole;
